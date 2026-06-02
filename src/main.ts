import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CollisionWorld, type TerrainCellCollision } from './collisionWorld'
import { SurfaceChunkManager } from './surfaceChunks'
import { updateTerrainVisibility } from './terrainVisibility'
import { VoxelInstancer } from './voxelInstancing'
import {
  createDirtAlbedoMap,
  createGrassAlbedoMap,
  DIRT_DARK,
  DIRT_MID,
  DIRT_TEXTURE_REPEAT,
} from './dirtTexture'
import { DigBreakEffect } from './digEffect'
import {
  applySurfaceCapMaterials,
  DEFAULT_TOP_SLOPE_THRESHOLD,
} from './surfaceCapMaterials'
import {
  DEFAULT_ROCK_CLUMP_COUNT,
  DEFAULT_ROCK_CLUMP_RADIUS,
  DEFAULT_ROCK_CLUMP_SPACING,
  DEFAULT_ROCKS_PER_CLUMP,
  findRockPlacements,
  loadRockModels,
  placeRocks,
  resolveRockGroundY,
  type RockSpawnOptions,
} from './rock'
import {
  DEFAULT_TREE_COUNT,
  DEFAULT_TREE_MAX_HEIGHT_DELTA,
  DEFAULT_TREE_SAMPLE_RADIUS,
  findTreePlacements,
  loadTreeModel,
  placeTrees,
  resolveTreeGroundY,
  type TreeSpawnOptions,
} from './tree'
import {
  applyGraphicsQuality,
  graphicsLightScale,
  qualityLabel,
  qualityTFromSlider,
} from './graphicsQuality'
import { PlayerController, type PlayerInput } from './player'
import {
  flushPendingSurfaceSources,
  loadSurfaceCell,
  runLoadPool,
  sortSurfaceCellsBySpawn,
  SURFACE_LOAD_CONCURRENCY,
} from './surfacePieceLoader'
import {
  alignSurfaceToCellGrid,
  refineVoxelPlacement,
  type TerrainGrid,
  voxelWorldBox,
} from './voxelPlacement'

interface CellMeta {
  ix: number
  iy: number
  center_x: number
  center_y: number
  file: string
  tri_count: number
  cap_bottom_y: number
  cap_top_y: number
  bounds?: { min: number[]; max: number[] }
}

interface TerrainMeta {
  surface_pieces: {
    cells: Record<string, CellMeta>
    grid: {
      cell_size: number
      min_x: number
      min_z: number
      centers: number[]
    }
  }
  voxels: {
    layers: number
    layer_height: number
    seam_y: number
    surface_cap_height?: number
  }
}

type Cell = {
  key: string
  ix: number
  iy: number
  centerX: number
  centerZ: number
  capBottomY: number
  layerMask: number
  instanceIndex: number
  surfaceRoot?: THREE.Object3D
  /** Unprocessed GLTF clone for re-splitting grass vs dirt when slope slider changes. */
  surfaceSource?: THREE.Object3D
  bounds?: { min: number[]; max: number[] }
  capTopY?: number
  voxelBaseY?: number
}

function cellKey(ix: number, iy: number) {
  return `${ix}_${iy}`
}

function disposeSurfaceGeometries(root: THREE.Object3D) {
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose()
  })
}

/** Spawn on a cell near the terrain centroid (grid center often has no mesh). */
function pickSpawnCell(cells: Record<string, CellMeta>): CellMeta | undefined {
  const entries = Object.values(cells)
  if (entries.length === 0) return undefined

  let cx = 0
  let cz = 0
  for (const c of entries) {
    cx += c.center_x
    cz += c.center_y
  }
  cx /= entries.length
  cz /= entries.length

  let best = entries[0]
  let bestDist = Infinity
  for (const c of entries) {
    const dx = c.center_x - cx
    const dz = c.center_y - cz
    const dist = dx * dx + dz * dz
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return best
}

const BRIGHTNESS_DEFAULT = 1.75

function createTerrainMaterial(
  color: number,
  map?: THREE.Texture,
  emissive = 0x2a2218,
) {
  const mat = new THREE.MeshStandardMaterial({
    // Tinted map * brown color crushes albedo; texture already carries the hue.
    color: map ? 0xffffff : color,
    flatShading: true,
    roughness: 0.98,
    metalness: 0,
    // Soft floor so faces away from the sun never clip to black.
    emissive,
    emissiveIntensity: 0.42,
  })
  if (map) mat.map = map
  mat.customProgramCacheKey = () => (map ? 'tex' : 'flat')
  return mat
}

const VISIBILITY_INTERVAL = 0.2
/** Max distance from the camera to start or continue digging. */
const DIG_REACH = 7

function cellToCollision(cell: Cell, layerMask = cell.layerMask): TerrainCellCollision {
  return {
    key: cell.key,
    centerX: cell.centerX,
    centerZ: cell.centerZ,
    capBottomY: cell.capBottomY,
    voxelBaseY: cell.voxelBaseY,
    layerMask,
    bounds: cell.surfaceRoot ? cell.bounds : undefined,
    capTopY: cell.capTopY,
  }
}

function closestCellAtPoint(
  point: THREE.Vector3,
  candidates: Cell[],
  maxDistSq: number,
): Cell | null {
  let best: Cell | null = null
  let bestD = maxDistSq
  for (const cell of candidates) {
    if (!cell.surfaceRoot) continue
    const dx = cell.centerX - point.x
    const dz = cell.centerZ - point.z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = cell
    }
  }
  return best
}

const SUN_ELEVATION = 36
const SUN_AZIMUTH = 158
const SUN_DISTANCE = 55

function sunDirectionFromAngles(
  elevationDeg: number,
  azimuthDeg: number,
  target = new THREE.Vector3(),
) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg)
  const theta = THREE.MathUtils.degToRad(azimuthDeg)
  return target.setFromSphericalCoords(1, phi, theta)
}

function tagWithCellKey(root: THREE.Object3D, key: string) {
  root.traverse((child) => {
    child.userData.cellKey = key
  })
}

async function main() {
  const info = document.getElementById('info')!
  const controlsHint = document.getElementById('controls')!

  const metaRes = await fetch('/assets/terrain/surface_pieces/terrain_meta.json')
  const meta: TerrainMeta = await metaRes.json()

  const cellSize = meta.surface_pieces.grid.cell_size
  const gridMinX = meta.surface_pieces.grid.min_x
  const gridMinZ = meta.surface_pieces.grid.min_z
  const terrainGrid: TerrainGrid = { minX: gridMinX, minZ: gridMinZ, cellSize }
  const gridCenters = meta.surface_pieces.grid.centers
  const voxelLayers = meta.voxels.layers
  const voxelSize = meta.voxels.layer_height
  const seamY = meta.voxels.seam_y

  const scene = new THREE.Scene()
  const horizonColor = new THREE.Color(0x6a9ec8)
  scene.background = null
  scene.fog = new THREE.FogExp2(horizonColor, 0.010)

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 800)

  const renderer = new THREE.WebGLRenderer({
    antialias: window.devicePixelRatio < 2,
    powerPreference: 'high-performance',
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  document.body.appendChild(renderer.domElement)

  const sky = new Sky()
  sky.scale.setScalar(450000)
  scene.add(sky)

  const skyUniforms = (sky.material as THREE.ShaderMaterial).uniforms
  skyUniforms.turbidity.value = 5
  skyUniforms.rayleigh.value = 2.4
  skyUniforms.mieCoefficient.value = 0.004
  skyUniforms.mieDirectionalG.value = 0.76

  const sunDirection = sunDirectionFromAngles(SUN_ELEVATION, SUN_AZIMUTH)
  skyUniforms.sunPosition.value.copy(sunDirection)

  const player = new PlayerController(camera, renderer.domElement)

  const hemisphereLight = new THREE.HemisphereLight(0xc8dff8, DIRT_MID, 0.58)
  scene.add(hemisphereLight)
  const ambientLight = new THREE.AmbientLight(0xd0dce8, 0.24)
  scene.add(ambientLight)

  const sun = new THREE.DirectionalLight(0xffe0a8, 1.45)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.00025
  sun.shadow.normalBias = 0.001
  sun.shadow.radius = 1.2
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 95
  const shadowHalf = 24
  sun.shadow.camera.left = -shadowHalf
  sun.shadow.camera.right = shadowHalf
  sun.shadow.camera.top = shadowHalf
  sun.shadow.camera.bottom = -shadowHalf
  scene.add(sun)
  scene.add(sun.target)

  const fill = new THREE.DirectionalLight(0xb8d8ff, 0.32)
  scene.add(fill)
  const fill2 = new THREE.DirectionalLight(0xffe8d0, 0.2)
  scene.add(fill2)

  const gravitySlider = document.getElementById('gravity-slider') as HTMLInputElement
  const gravityValue = document.getElementById('gravity-value')!
  const jumpVelocitySlider = document.getElementById(
    'jump-velocity-slider',
  ) as HTMLInputElement
  const jumpVelocityValue = document.getElementById('jump-velocity-value')!
  const moveSpeedSlider = document.getElementById('move-speed-slider') as HTMLInputElement
  const moveSpeedValue = document.getElementById('move-speed-value')!
  const cameraHeightSlider = document.getElementById(
    'camera-height-slider',
  ) as HTMLInputElement
  const cameraHeightValue = document.getElementById('camera-height-value')!
  const brightnessSlider = document.getElementById('brightness-slider') as HTMLInputElement
  const brightnessValue = document.getElementById('brightness-value')!
  const graphicsSlider = document.getElementById('graphics-slider') as HTMLInputElement
  const graphicsValue = document.getElementById('graphics-value')!
  const grassSlopeSlider = document.getElementById('grass-slope-slider') as HTMLInputElement
  const grassSlopeValue = document.getElementById('grass-slope-value')!
  const syncJumpTune = () => {
    const g = Number(gravitySlider.value)
    const v = Number(jumpVelocitySlider.value)
    player.setGravity(g)
    player.setJumpSpeed(v)
    gravityValue.textContent = g.toFixed(1)
    jumpVelocityValue.textContent = v.toFixed(1)
  }
  const syncMoveTune = () => {
    const speed = Number(moveSpeedSlider.value)
    const height = Number(cameraHeightSlider.value)
    player.setWalkSpeed(speed)
    player.setEyeHeight(height)
    moveSpeedValue.textContent = speed.toFixed(1)
    cameraHeightValue.textContent = height.toFixed(2)
  }
  const syncBrightness = () => {
    const exposure = Number(brightnessSlider.value)
    renderer.toneMappingExposure = exposure
    brightnessValue.textContent = exposure.toFixed(2)
    const fillScale = (exposure / BRIGHTNESS_DEFAULT) * graphicsLightScale
    hemisphereLight.intensity = 0.58 * fillScale
    ambientLight.intensity = 0.24 * fillScale
    fill.intensity = 0.32 * fillScale
    fill2.intensity = 0.2 * fillScale
    sun.intensity = 1.45 * fillScale
  }
  gravitySlider.addEventListener('input', syncJumpTune)
  jumpVelocitySlider.addEventListener('input', syncJumpTune)
  moveSpeedSlider.addEventListener('input', syncMoveTune)
  cameraHeightSlider.addEventListener('input', syncMoveTune)
  brightnessSlider.addEventListener('input', syncBrightness)
  syncJumpTune()
  syncMoveTune()
  syncBrightness()
  scene.add(camera)

  const terrainRoot = new THREE.Group()
  scene.add(terrainRoot)

  let dirtMap = createDirtAlbedoMap()
  dirtMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  let grassMap = createGrassAlbedoMap()
  grassMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  const terrainWorldUnitsPerTile = voxelSize / DIRT_TEXTURE_REPEAT
  const dirtMaterial = createTerrainMaterial(DIRT_MID, dirtMap, DIRT_DARK)
  const grassMaterial = createTerrainMaterial(0x58a042, grassMap)
  grassMaterial.polygonOffset = true
  grassMaterial.polygonOffsetFactor = -1
  grassMaterial.polygonOffsetUnits = -1
  const cells = new Map<string, Cell>()
  const surfaceGroup = new THREE.Group()
  const voxelGroup = new THREE.Group()
  terrainRoot.add(voxelGroup)
  terrainRoot.add(surfaceGroup)

  const gridSpan = gridCenters.length
  const surfaceCells = meta.surface_pieces.cells
  const cellList: Cell[] = []

  for (const cellMeta of Object.values(surfaceCells)) {
    const { ix, iy, center_x: centerX, center_y: centerZ, cap_bottom_y: capBottomY } =
      cellMeta
    const key = cellKey(ix, iy)

    const cell: Cell = {
      key,
      ix,
      iy,
      centerX,
      centerZ,
      capBottomY,
      layerMask: 0,
      instanceIndex: 0,
      bounds: cellMeta.bounds,
      capTopY: cellMeta.cap_top_y,
    }
    cells.set(key, cell)
    cellList.push(cell)
  }

  const voxelInstancer = new VoxelInstancer(
    dirtMaterial,
    voxelLayers,
    cellList.length,
    voxelSize,
  )
  voxelInstancer.build(cellList, voxelSize, voxelLayers)
  voxelGroup.add(voxelInstancer.group)
  voxelGroup.matrixAutoUpdate = false
  voxelGroup.updateMatrixWorld(true)

  const surfaceChunks = new SurfaceChunkManager(
    terrainGrid,
    dirtMaterial,
    grassMaterial,
    terrainWorldUnitsPerTile,
  )
  surfaceGroup.add(surfaceChunks.group)

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(gridSpan * cellSize + 4, 2, gridSpan * cellSize + 4),
    dirtMaterial,
  )
  base.position.set(0, seamY - voxelLayers * voxelSize - 1, 0)
  base.castShadow = false
  base.receiveShadow = false
  terrainRoot.add(base)
  terrainRoot.matrixAutoUpdate = false
  terrainRoot.updateMatrixWorld(true)

  const digBreakFx = new DigBreakEffect(terrainRoot)

  const collisionWorld = new CollisionWorld()
  collisionWorld.setGridCell(cellSize)
  collisionWorld.setMaxLayers(voxelLayers)
  const _boundsBox = new THREE.Box3()
  const _pickHits: THREE.Intersection[] = []
  let placedTrees: THREE.Group[] = []
  let placedRocks: THREE.Group[] = []

  const syncCollisionWorld = () => {
    player.setCollisionWorld(collisionWorld)
    digBreakFx.setCollisionWorld(collisionWorld)
  }

  const initCollision = () => {
    collisionWorld.clear()
    collisionWorld.buildCells(
      Array.from(cells.values(), cellToCollision),
      voxelSize,
    )
    syncPropCollision()
  }

  const syncPropCollision = () => {
    const props: THREE.Object3D[] = [base]
    for (const tree of placedTrees) props.push(tree)
    for (const rock of placedRocks) props.push(rock)
    collisionWorld.replaceStaticFromObjects(props)
    syncCollisionWorld()
  }

  const patchCellCollision = (cell: Cell, layerMask = cell.layerMask) => {
    collisionWorld.patchCell(cellToCollision(cell, layerMask), voxelSize)
  }

  /** Place voxel columns for loaded surface cells; patch collision incrementally. */
  const syncVoxelPlacement = (targets?: readonly Cell[]) => {
    const list = targets ?? cellList.filter((c) => c.surfaceRoot)
    refineVoxelPlacement(list, terrainGrid, voxelSize, voxelLayers)
    if (targets) {
      for (const cell of list) {
        voxelInstancer.applyCell(cell, voxelSize, voxelLayers)
        patchCellCollision(cell)
      }
    } else {
      voxelInstancer.applyPlacement(cellList, voxelSize, voxelLayers)
      for (const cell of list) {
        patchCellCollision(cell)
      }
    }
  }

  initCollision()

  function voxelBoundsBox(cell: Cell, layer: number, out: THREE.Box3) {
    return voxelWorldBox(cell, layer, voxelSize, out)
  }

  function topSlopeThresholdFromSlider(sliderValue: number) {
    return THREE.MathUtils.clamp(sliderValue / 100, 0, 1)
  }

  const spawnCellMeta = pickSpawnCell(surfaceCells)
  const spawnIx = spawnCellMeta?.ix ?? Math.floor(gridSpan / 2)
  const spawnIy = spawnCellMeta?.iy ?? Math.floor(gridSpan / 2)
  const spawnX = spawnCellMeta?.center_x ?? gridCenters[spawnIx]
  const spawnZ = spawnCellMeta?.center_y ?? gridCenters[spawnIy]
  const spawnFallbackY =
    spawnCellMeta?.cap_top_y ?? seamY + (meta.voxels.surface_cap_height ?? voxelSize) + 1

  const treeTemplatePromise = loadTreeModel('/assets/tree.glb')
  const rockTemplatesPromise = loadRockModels()

  info.textContent = 'Loading nearby terrain…'

  const gltfLoader = new GLTFLoader()
  const allSurfaceMetas = Object.values(meta.surface_pieces.cells)
  const { priority: priorityMetas, deferred: deferredMetas } = sortSurfaceCellsBySpawn(
    allSurfaceMetas,
    spawnX,
    spawnZ,
  )

  const surfaceLoadCtx = {
    gltfLoader,
    cells,
    surfaceGroup,
    dirtMaterial,
    grassMaterial,
    terrainWorldUnitsPerTile,
    voxelSize,
    terrainGrid,
    topSlopeThreshold: topSlopeThresholdFromSlider(Number(grassSlopeSlider.value)),
    surfaceChunks,
    tagWithCellKey,
  }

  const loadSurfaceBatch = (metas: CellMeta[]) =>
    runLoadPool(metas, SURFACE_LOAD_CONCURRENCY, (cellMeta) =>
      loadSurfaceCell(cellMeta, surfaceLoadCtx),
    )

  await loadSurfaceBatch(priorityMetas)
  surfaceChunks.flushDirty()
  syncVoxelPlacement()

  player.spawnAt(spawnX, spawnZ, spawnFallbackY)
  player.syncCamera()

  const GRASS_SLOPE_DEBOUNCE_MS = 250
  const GRASS_SLOPE_FRAME_BUDGET_MS = 8
  let grassSlopeRefreshGen = 0
  let grassSlopeDebounce: ReturnType<typeof setTimeout> | undefined

  const syncGrassSlopeLabel = () => {
    const topSlopeThreshold = topSlopeThresholdFromSlider(
      Number(grassSlopeSlider.value),
    )
    grassSlopeValue.textContent = topSlopeThreshold.toFixed(2)
  }

  const refreshOneSurfaceCell = (cell: Cell, topSlopeThreshold: number) => {
    if (!cell.surfaceSource || !cell.surfaceRoot) return

    cell.surfaceRoot.parent?.remove(cell.surfaceRoot)
    disposeSurfaceGeometries(cell.surfaceRoot)

    const root = cell.surfaceSource.clone()
    applySurfaceCapMaterials(
      root,
      dirtMaterial,
      grassMaterial,
      terrainWorldUnitsPerTile,
      undefined,
      undefined,
      topSlopeThreshold,
    )
    tagWithCellKey(root, cell.key)
    root.visible = false
    root.matrixAutoUpdate = false
    root.updateMatrixWorld(true)
    surfaceGroup.add(root)
    cell.surfaceRoot = root
    alignSurfaceToCellGrid(cell, terrainGrid, voxelSize)
    surfaceChunks.markDirtyForCell(cell)
  }

  const refreshSurfaceGrassSlope = () => {
    const gen = ++grassSlopeRefreshGen
    flushPendingSurfaceSources()
    const topSlopeThreshold = topSlopeThresholdFromSlider(
      Number(grassSlopeSlider.value),
    )

    const pending: Cell[] = []
    for (const cell of cells.values()) {
      if (cell.surfaceSource && cell.surfaceRoot) pending.push(cell)
    }

    let index = 0
    const step = () => {
      if (gen !== grassSlopeRefreshGen) return
      const t0 = performance.now()
      let cellsThisFrame = 0
      while (
        index < pending.length &&
        cellsThisFrame < 1 &&
        performance.now() - t0 < GRASS_SLOPE_FRAME_BUDGET_MS
      ) {
        refreshOneSurfaceCell(pending[index++], topSlopeThreshold)
        cellsThisFrame++
      }
      if (index < pending.length) {
        requestAnimationFrame(step)
      } else {
        surfaceChunks.flushDirtyChunked()
      }
    }
    requestAnimationFrame(step)
  }

  const scheduleGrassSlopeRefresh = () => {
    syncGrassSlopeLabel()
    if (grassSlopeDebounce) clearTimeout(grassSlopeDebounce)
    grassSlopeDebounce = setTimeout(refreshSurfaceGrassSlope, GRASS_SLOPE_DEBOUNCE_MS)
  }

  const finalizeGrassSlopeRefresh = () => {
    if (grassSlopeDebounce) {
      clearTimeout(grassSlopeDebounce)
      grassSlopeDebounce = undefined
    }
    syncGrassSlopeLabel()
    refreshSurfaceGrassSlope()
  }

  grassSlopeSlider.addEventListener('input', scheduleGrassSlopeRefresh)
  grassSlopeSlider.addEventListener('change', finalizeGrassSlopeRefresh)
  grassSlopeValue.textContent = DEFAULT_TOP_SLOPE_THRESHOLD.toFixed(2)

  const treesGroup = new THREE.Group()
  scene.add(treesGroup)

  const rocksGroup = new THREE.Group()
  scene.add(rocksGroup)

  const graphicsCtx = {
    renderer,
    fog: scene.fog as THREE.FogExp2,
    sun,
    hemisphereLight,
    ambientLight,
    fill,
    fill2,
    dirtMaterial,
    grassMaterial,
    dirtMap,
    grassMap,
    // Surface caps stay shadowless — receiving tree shadows causes dark grid seams.
    shadowRoots: [treesGroup, rocksGroup],
  }

  let graphicsDebounce: ReturnType<typeof setTimeout> | undefined
  const syncGraphics = () => {
    const t = qualityTFromSlider(Number(graphicsSlider.value))
    graphicsValue.textContent = qualityLabel(t)
    const maps = applyGraphicsQuality(t, graphicsCtx)
    dirtMap = maps.dirtMap
    grassMap = maps.grassMap
    graphicsCtx.dirtMap = dirtMap
    graphicsCtx.grassMap = grassMap
    surfaceChunks.setMaterials(dirtMaterial, grassMaterial)
    syncBrightness()
  }
  const scheduleGraphics = () => {
    const t = qualityTFromSlider(Number(graphicsSlider.value))
    graphicsValue.textContent = qualityLabel(t)
    if (graphicsDebounce) clearTimeout(graphicsDebounce)
    graphicsDebounce = setTimeout(() => requestAnimationFrame(syncGraphics), 250)
  }
  graphicsSlider.addEventListener('input', scheduleGraphics)
  syncGraphics()

  const treeFlatnessSlider = document.getElementById('tree-flatness-slider') as HTMLInputElement
  const treeFlatnessValue = document.getElementById('tree-flatness-value')!
  const treeRadiusSlider = document.getElementById('tree-radius-slider') as HTMLInputElement
  const treeRadiusValue = document.getElementById('tree-radius-value')!
  const treeCountSlider = document.getElementById('tree-count-slider') as HTMLInputElement
  const treeCountValue = document.getElementById('tree-count-value')!

  const getTreeSpawnOptions = (): TreeSpawnOptions => ({
    maxHeightDelta: Number(treeFlatnessSlider.value),
    sampleRadius: Number(treeRadiusSlider.value),
    treeCount: Number(treeCountSlider.value),
  })

  const syncTreeTuneLabels = () => {
    treeFlatnessValue.textContent = Number(treeFlatnessSlider.value).toFixed(2)
    treeRadiusValue.textContent = Number(treeRadiusSlider.value).toFixed(1)
    treeCountValue.textContent = treeCountSlider.value
  }

  const clearPlacedTrees = () => {
    for (const tree of placedTrees) {
      treesGroup.remove(tree)
    }
    placedTrees = []
  }

  let treeTemplate: Awaited<ReturnType<typeof loadTreeModel>> | undefined

  const respawnTrees = (finalize = false) => {
    if (!treeTemplate) return
    syncTreeTuneLabels()
    clearPlacedTrees()
    const opts = getTreeSpawnOptions()
    const treePlacements = findTreePlacements(
      surfaceCells,
      spawnIx,
      spawnIy,
      opts,
      cellSize,
    )
    if (finalize) {
      resolveTreeGroundY(treePlacements, surfaceGroup)
    }
    placedTrees = placeTrees(treeTemplate, treePlacements, treesGroup)
    syncPropCollision()
  }

  treeFlatnessSlider.value = String(DEFAULT_TREE_MAX_HEIGHT_DELTA)
  treeRadiusSlider.value = String(DEFAULT_TREE_SAMPLE_RADIUS)
  treeCountSlider.value = String(DEFAULT_TREE_COUNT)
  let treeRespawnDebounce: ReturnType<typeof setTimeout> | undefined
  const scheduleTreeRespawn = () => {
    syncTreeTuneLabels()
    if (treeRespawnDebounce) clearTimeout(treeRespawnDebounce)
    treeRespawnDebounce = setTimeout(
      () => requestAnimationFrame(() => respawnTrees(false)),
      250,
    )
  }
  const finalizeTreeRespawn = () => {
    if (treeRespawnDebounce) {
      clearTimeout(treeRespawnDebounce)
      treeRespawnDebounce = undefined
    }
    requestAnimationFrame(() => respawnTrees(true))
  }
  const bindTreeSlider = (el: HTMLInputElement) => {
    el.addEventListener('input', scheduleTreeRespawn)
    el.addEventListener('change', finalizeTreeRespawn)
  }
  bindTreeSlider(treeFlatnessSlider)
  bindTreeSlider(treeRadiusSlider)
  bindTreeSlider(treeCountSlider)

  const rockClumpCountSlider = document.getElementById(
    'rock-clump-count-slider',
  ) as HTMLInputElement
  const rockClumpCountValue = document.getElementById('rock-clump-count-value')!
  const rocksPerClumpSlider = document.getElementById('rocks-per-clump-slider') as HTMLInputElement
  const rocksPerClumpValue = document.getElementById('rocks-per-clump-value')!
  const rockClumpRadiusSlider = document.getElementById(
    'rock-clump-radius-slider',
  ) as HTMLInputElement
  const rockClumpRadiusValue = document.getElementById('rock-clump-radius-value')!
  const rockClumpSpacingSlider = document.getElementById(
    'rock-clump-spacing-slider',
  ) as HTMLInputElement
  const rockClumpSpacingValue = document.getElementById('rock-clump-spacing-value')!

  let rockTemplates: Awaited<ReturnType<typeof loadRockModels>> | undefined

  const getRockSpawnOptions = (): RockSpawnOptions => ({
    clumpCount: Number(rockClumpCountSlider.value),
    rocksPerClump: Number(rocksPerClumpSlider.value),
    clumpRadius: Number(rockClumpRadiusSlider.value),
    clumpSpacing: Number(rockClumpSpacingSlider.value),
  })

  const syncRockTuneLabels = () => {
    rockClumpCountValue.textContent = rockClumpCountSlider.value
    rocksPerClumpValue.textContent = rocksPerClumpSlider.value
    rockClumpRadiusValue.textContent = Number(rockClumpRadiusSlider.value).toFixed(2)
    rockClumpSpacingValue.textContent = rockClumpSpacingSlider.value
  }

  const clearPlacedRocks = () => {
    for (const rock of placedRocks) {
      rocksGroup.remove(rock)
    }
    placedRocks = []
  }

  const respawnRocks = (finalize = false) => {
    if (!rockTemplates) return
    syncRockTuneLabels()
    clearPlacedRocks()
    const opts = getRockSpawnOptions()
    const rockPlacements = findRockPlacements(surfaceCells, spawnIx, spawnIy, opts)
    if (finalize) {
      resolveRockGroundY(rockPlacements, surfaceGroup)
    }
    placedRocks = placeRocks(rockTemplates, rockPlacements, rocksGroup)
    syncPropCollision()
  }

  rockClumpCountSlider.value = String(DEFAULT_ROCK_CLUMP_COUNT)
  rocksPerClumpSlider.value = String(DEFAULT_ROCKS_PER_CLUMP)
  rockClumpRadiusSlider.value = String(DEFAULT_ROCK_CLUMP_RADIUS)
  rockClumpSpacingSlider.value = String(DEFAULT_ROCK_CLUMP_SPACING)
  let rockRespawnDebounce: ReturnType<typeof setTimeout> | undefined
  const scheduleRockRespawn = () => {
    syncRockTuneLabels()
    if (rockRespawnDebounce) clearTimeout(rockRespawnDebounce)
    rockRespawnDebounce = setTimeout(
      () => requestAnimationFrame(() => respawnRocks(false)),
      250,
    )
  }
  const finalizeRockRespawn = () => {
    if (rockRespawnDebounce) {
      clearTimeout(rockRespawnDebounce)
      rockRespawnDebounce = undefined
    }
    requestAnimationFrame(() => respawnRocks(true))
  }
  const bindRockSlider = (el: HTMLInputElement) => {
    el.addEventListener('input', scheduleRockRespawn)
    el.addEventListener('change', finalizeRockRespawn)
  }
  bindRockSlider(rockClumpCountSlider)
  bindRockSlider(rocksPerClumpSlider)
  bindRockSlider(rockClumpRadiusSlider)
  bindRockSlider(rockClumpSpacingSlider)

  info.textContent = 'Click to play — explore the terrain'
  controlsHint.textContent =
    'WASD move · Shift sprint · Space jump · hold click or N to dig · Esc release mouse'

  void (async () => {
    const [trees, rocks] = await Promise.all([treeTemplatePromise, rockTemplatesPromise])
    treeTemplate = trees
    rockTemplates = rocks
    respawnTrees(true)
    respawnRocks(true)

    if (deferredMetas.length > 0) {
      await loadSurfaceBatch(deferredMetas)
      surfaceChunks.flushDirty()
      const loaded = deferredMetas
        .map((m) => cells.get(cellKey(m.ix, m.iy)))
        .filter((c): c is Cell => c?.surfaceRoot !== undefined)
      syncVoxelPlacement(loaded)
    }
  })()

  const digProgressFill = document.getElementById('dig-progress-fill')!
  const digSpeedSlider = document.getElementById('dig-speed-slider') as HTMLInputElement
  const digSpeedValue = document.getElementById('dig-speed-value')!

  /** Base dig duration at 1.0× speed (seconds to complete). */
  const VOXEL_DIG_TIME_BASE = 1.1
  const SURFACE_DIG_TIME_BASE = 2.0

  const getDigSpeed = () => Number(digSpeedSlider.value)

  const syncDigSpeed = () => {
    digSpeedValue.textContent = `${getDigSpeed().toFixed(2)}×`
  }
  digSpeedSlider.addEventListener('input', syncDigSpeed)
  syncDigSpeed()

  type DigTarget = {
    id: string
    cell: Cell
    kind: 'surface' | 'voxel'
    layer?: number
    visualRoot: THREE.Object3D
  }

  let digTarget: DigTarget | null = null
  let digProgress = 0
  let digMouseDown = false
  let digEffectId: string | null = null

  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    keys.add(e.code)
    if (e.code === 'KeyN') e.preventDefault()
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      e.preventDefault()
    }
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))

  const input: PlayerInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
  }

  function readInput() {
    input.forward = keys.has('KeyW') || keys.has('ArrowUp')
    input.backward = keys.has('KeyS') || keys.has('ArrowDown')
    input.left = keys.has('KeyA') || keys.has('ArrowLeft')
    input.right = keys.has('KeyD') || keys.has('ArrowRight')
    input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight')
    input.jump = keys.has('Space')
  }

  renderer.domElement.tabIndex = 0
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    renderer.domElement.focus()
    if (!player.isLocked()) {
      player.lock()
      return
    }
    digMouseDown = true
  })
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) digMouseDown = false
  })

  player.controls.addEventListener('lock', () => {
    document.body.classList.add('playing')
    info.textContent = 'Running on terrain — hold click or N to dig'
    renderer.domElement.style.cursor = 'none'
  })

  player.controls.addEventListener('unlock', () => {
    document.body.classList.remove('playing')
    digMouseDown = false
    clearDigState()
    info.textContent = 'Click to play — explore the terrain'
    renderer.domElement.style.cursor = 'crosshair'
  })

  const raycaster = new THREE.Raycaster()
  raycaster.far = DIG_REACH

  function isChunkSurfaceHit(hit: THREE.Intersection, cell: Cell): boolean {
    if (!(hit.object instanceof THREE.Mesh)) return false
    const chunkCells = hit.object.userData.chunkCells as Cell[] | undefined
    return chunkCells?.includes(cell) ?? false
  }

  function getCellFromObject(object: THREE.Object3D): Cell | null {
    let current: THREE.Object3D | null = object
    while (current) {
      const key = current.userData.cellKey as string | undefined
      if (key && cells.has(key)) return cells.get(key)!
      current = current.parent
    }
    return null
  }

  function getCellFromHit(hit: THREE.Intersection): Cell | null {
    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      const layer = voxelInstancer.getLayerFromMesh(hit.object)
      if (layer === undefined) return null
      const key = voxelInstancer.getCellKey(layer, hit.instanceId)
      if (key && cells.has(key)) return cells.get(key)!
      return null
    }
    if (hit.object instanceof THREE.Mesh) {
      const chunkCells = hit.object.userData.chunkCells as Cell[] | undefined
      if (chunkCells?.length) {
        return closestCellAtPoint(hit.point, chunkCells, cellSize * cellSize * 1.5)
      }
    }
    return getCellFromObject(hit.object)
  }

  function completeDig(target: DigTarget) {
    const { cell } = target

    if (target.kind === 'surface') {
      if (!cell.surfaceRoot) return
      disposeSurfaceGeometries(cell.surfaceRoot)
      cell.surfaceRoot.parent?.remove(cell.surfaceRoot)
      cell.surfaceRoot = undefined
      if (cell.surfaceSource) {
        disposeSurfaceGeometries(cell.surfaceSource)
        cell.surfaceSource = undefined
      }
      patchCellCollision(cell)
      surfaceChunks.rebuildForCell(cell)
      info.textContent = `Removed surface at (${cell.ix}, ${cell.iy})`
      return
    }

    const layer = target.layer
    if (layer === undefined || !voxelInstancer.hasLayer(cell, layer)) return

    voxelInstancer.hideLayer(cell, layer, voxelSize)
    patchCellCollision(cell)

    const remaining = voxelInstancer.layerCount(cell)
    info.textContent =
      remaining > 0 || cell.surfaceRoot
        ? `Dug voxel layer ${layer} at (${cell.ix}, ${cell.iy})`
        : `Column (${cell.ix}, ${cell.iy}) fully excavated`
  }

  function pickHit(): THREE.Intersection | null {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
    _pickHits.length = 0
    raycaster.intersectObjects(surfaceChunks.group.children, false, _pickHits)
    for (const mesh of voxelInstancer.meshes) {
      raycaster.intersectObject(mesh, false, _pickHits)
    }
    if (_pickHits.length === 0) return null

    let best: THREE.Intersection | null = null
    for (const hit of _pickHits) {
      if (hit.distance > DIG_REACH) continue
      if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
        const layer = voxelInstancer.getLayerFromMesh(hit.object)
        if (layer === undefined) continue
        const key = voxelInstancer.getCellKey(layer, hit.instanceId)
        const cell = key ? cells.get(key) : undefined
        if (!cell || !voxelInstancer.hasLayer(cell, layer)) continue
      }
      if (!best || hit.distance < best.distance) best = hit
    }
    return best
  }

  function clearDigState(cancelFx = true) {
    if (cancelFx) digBreakFx.cancel()
    else digBreakFx.cancelDig()
    voxelInstancer.restoreDigHidden(cells, voxelSize)
    digEffectId = null
    digTarget = null
    digProgress = 0
    document.body.classList.remove('digging')
    digProgressFill.style.setProperty('--dig-deg', '0deg')
  }

  function ensureDigEffect(target: DigTarget) {
    if (digEffectId === target.id) return
    digBreakFx.cancelDig()
    digEffectId = target.id

    const digFxOptions = (excludeBottomFace: boolean) =>
      excludeBottomFace ? { excludeBottomFace: true } : undefined

    if (target.kind === 'voxel' && target.layer !== undefined) {
      const layer = target.layer
      const excludeBottomFace =
        layer < voxelLayers - 1 &&
        voxelInstancer.hasLayer(target.cell, layer + 1)
      voxelInstancer.tempHideLayer(target.cell, layer)
      patchCellCollision(target.cell, target.cell.layerMask & ~(1 << layer))
      voxelBoundsBox(target.cell, layer, _boundsBox)
      digBreakFx.startFromBox(
        _boundsBox,
        dirtMaterial,
        4,
        [],
        digFxOptions(excludeBottomFace),
      )
      return
    }

    const excludeBottomFace = voxelInstancer.layerCount(target.cell) > 0
    if (target.cell.surfaceRoot) {
      target.cell.surfaceRoot.updateWorldMatrix(true, false)
      _boundsBox.setFromObject(target.cell.surfaceRoot)
      if (!_boundsBox.isEmpty()) {
        digBreakFx.startFromBox(
          _boundsBox,
          dirtMaterial,
          5,
          [target.visualRoot],
          digFxOptions(excludeBottomFace),
        )
        return
      }
    }
    if (target.visualRoot) {
      digBreakFx.startFromObject(
        target.visualRoot,
        dirtMaterial,
        5,
        digFxOptions(excludeBottomFace),
      )
    }
  }

  function digTargetFromHit(hit: THREE.Intersection): DigTarget | null {
    const cell = getCellFromHit(hit)
    if (!cell) return null

    if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
      const layer = voxelInstancer.getLayerFromMesh(hit.object)
      if (layer === undefined || !voxelInstancer.hasLayer(cell, layer)) return null
      return {
        id: `${cellKey(cell.ix, cell.iy)}:voxel:${layer}`,
        cell,
        kind: 'voxel',
        layer,
        visualRoot: hit.object,
      }
    }

    if (cell.surfaceRoot && isChunkSurfaceHit(hit, cell)) {
      return {
        id: `${cellKey(cell.ix, cell.iy)}:surface`,
        cell,
        kind: 'surface',
        visualRoot: cell.surfaceRoot,
      }
    }

    return null
  }

  function digTargetStillValid(target: DigTarget): boolean {
    if (target.kind === 'surface') return target.cell.surfaceRoot !== undefined
    if (target.layer === undefined) return false
    return voxelInstancer.hasLayer(target.cell, target.layer)
  }

  function updateDig(dt: number) {
    if (!player.isLocked()) {
      clearDigState()
      return
    }

    let target = digTarget
    const hit = pickHit()
    if (hit) {
      const picked = digTargetFromHit(hit)
      if (picked) {
        if (!target || target.id !== picked.id) {
          if (target) clearDigState()
          target = picked
          digTarget = picked
          digProgress = 0
        }
      }
    }

    if (!target) return
    if (!digTargetStillValid(target)) {
      clearDigState()
      return
    }

    ensureDigEffect(target)

    const digTimeBase =
      target.kind === 'surface' ? SURFACE_DIG_TIME_BASE : VOXEL_DIG_TIME_BASE
    const digTime = digTimeBase / getDigSpeed()
    digProgress = Math.min(1, digProgress + dt / digTime)
    digBreakFx.update(digProgress)

    document.body.classList.add('digging')
    digProgressFill.style.setProperty('--dig-deg', `${digProgress * 360}deg`)

    if (digProgress >= 1) {
      digBreakFx.releaseHidden()
      completeDig(target)
      digBreakFx.finish(dirtMaterial)
      clearDigState(false)
    }
  }

  function isDigging() {
    return digMouseDown || keys.has('KeyN')
  }

  function updateSunShadow() {
    const p = player.object.position
    sun.target.position.set(p.x, p.y, p.z)
    sun.position.set(
      p.x + sunDirection.x * SUN_DISTANCE,
      p.y + sunDirection.y * SUN_DISTANCE,
      p.z + sunDirection.z * SUN_DISTANCE,
    )
    fill.position.set(p.x - 18, p.y + 14, p.z - 12)
    fill2.position.set(
      p.x - sunDirection.x * 38,
      p.y + 18,
      p.z - sunDirection.z * 38,
    )
  }
  updateSunShadow()

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
    const t = qualityTFromSlider(Number(graphicsSlider.value))
    renderer.setPixelRatio(
      THREE.MathUtils.lerp(0.65, Math.min(window.devicePixelRatio, 1.5), t),
    )
  }
  window.addEventListener('resize', onResize)

  const clock = new THREE.Clock()
  renderer.domElement.style.cursor = 'crosshair'
  let visibilityTimer = 0
  const visibilityCtx = {
    cells,
    surfaceChunks,
    voxelInstancer,
    voxelSize,
    layerCount: voxelLayers,
  }

  updateTerrainVisibility(
    player.object.position.x,
    player.object.position.z,
    visibilityCtx,
  )

  function animate() {
    requestAnimationFrame(animate)
    const dt = Math.min(clock.getDelta(), 0.05)

    readInput()
    player.update(dt, input)
    updateSunShadow()

    visibilityTimer += dt
    if (visibilityTimer >= VISIBILITY_INTERVAL) {
      visibilityTimer = 0
      const p = player.object.position
      updateTerrainVisibility(p.x, p.z, visibilityCtx)
    }

    if (isDigging()) updateDig(dt)
    else if (digTarget || digProgress > 0) clearDigState()

    digBreakFx.tick(dt)

    renderer.render(scene, camera)
  }
  animate()
}

main().catch((err) => {
  console.error(err)
  const info = document.getElementById('info')
  if (info) info.textContent = `Error loading terrain: ${err.message}`
})
