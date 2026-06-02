import * as THREE from 'three'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { CollisionWorld, type TerrainCellCollision } from './collisionWorld'
import { SurfaceChunkManager } from './surfaceChunks'
import {
  DEFAULT_CHUNK_RADIUS,
  DEFAULT_VOXEL_RADIUS,
  updateTerrainVisibility,
} from './terrainVisibility'
import { VoxelInstancer } from './voxelInstancing'
import {
  createDirtAlbedoMap,
  createGrassAlbedoMap,
  DIRT_DARK,
  DIRT_MID,
  DIRT_TEXTURE_REPEAT,
} from './dirtTexture'
import { DigBreakEffect, type DigBreakOptions } from './digEffect'
import { createDigCrackStageTextures, DigCrackOverlay } from './digCrackOverlay'
import { Inventory } from './inventory'
import { applySurfaceCapMaterials } from './surfaceCapMaterials'
import {
  findRockPlacements,
  loadRockModels,
  placeRocks,
  resolveRockGroundY,
  updateRocksPhysics,
  type RockGroundTargets,
  type RockSpawnOptions,
} from './rock'
import {
  findTreePlacements,
  loadTreeModel,
  placeTrees,
  resolveTreeGroundY,
  type TreeSpawnOptions,
} from './tree'
import {
  applyTuneFromStorage,
  bindTunePersistence,
  DEFAULT_BRIGHTNESS,
  exportTuneDefaults,
  grassTuftClusterFromSlider,
  peekSavedGraphics,
  type TuneSliderElements,
} from './tuneDefaults'
import {
  applyGraphicsQuality,
  graphicsLightScale,
  qualityLabel,
  fogDensityFromSlider,
  qualityTFromSlider,
} from './graphicsQuality'
import { updateGrassWind } from './grassBlades'
import { applyTerrainTriplanar } from './terrainTriplanar'
import {
  PlayerController,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  type PlayerInput,
} from './player'
import { CapsuleCollider, registerBVHExtensions } from './meshCollider'
import { ViewmodelHand } from './viewmodelHand'
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
import { createRockAlbedoMap } from './rockTexture'
import {
  BlockBuilder,
  BUILD_BLOCK_DIG_TIME_BASE,
  BUILD_BLOCK_SIZE,
  buildCellAdjacent,
  buildCellFromPoint,
  buildPlacementNormalAgainstBlock,
  buildPlacementNormalFromFace,
  type BuildBlockType,
  type BuildCell,
} from './buildBlocks'

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
/** Start the dig ray in front of the camera so close-range / inside-surface shots still hit. */
const DIG_RAY_ORIGIN_OFFSET = 0.15
const _digRayDir = new THREE.Vector3()
const _digRayOrigin = new THREE.Vector3()

const ROCK_DIG_TIME_BASE = 1.35
const TREE_DIG_TIME_BASE = 2.1
const STONE_PER_ROCK = 3
const WOOD_PER_TREE = 5
const DIRT_PER_DIG = 8

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

/** Pick the surface cell under a chunk-mesh hit (grid footprint first, then nearest center). */
function cellFromChunkSurfaceHit(
  point: THREE.Vector3,
  chunkCells: Cell[],
  cellSize: number,
): Cell | null {
  const half = cellSize * 0.51
  for (const cell of chunkCells) {
    if (!cell.surfaceRoot) continue
    if (
      Math.abs(cell.centerX - point.x) <= half &&
      Math.abs(cell.centerZ - point.z) <= half
    ) {
      return cell
    }
  }
  return closestCellAtPoint(point, chunkCells, cellSize * cellSize * 2.25)
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
  registerBVHExtensions()
  const info = document.getElementById('info')!
  const perfHud = document.getElementById('perf-hud')!

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

  // MSAA is fixed at context creation, so decide it from the persisted quality tier.
  // Lower tiers (target: weak GPUs) skip MSAA entirely and lean on resolution scaling;
  // they also already render below native res, which hides edge aliasing. Only High+
  // pays for hardware multisampling, and only when not already supersampling via DPR.
  const savedQualityT = qualityTFromSlider(peekSavedGraphics())
  const enableMSAA = savedQualityT >= 0.68 && window.devicePixelRatio < 2

  const renderer = new THREE.WebGLRenderer({
    antialias: enableMSAA,
    powerPreference: 'high-performance',
  })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  // The sun follows the player, so shadows only need a fresh pass when the
  // player actually moves (or the scene changes) — not every single frame.
  renderer.shadowMap.autoUpdate = false
  document.body.appendChild(renderer.domElement)

  // Pixel-ratio ceiling comes from the graphics slider; the adaptive scaler
  // (in the animate loop) multiplies a [floor..1] factor under GPU load.
  let qualityMaxPixelRatio = Math.min(window.devicePixelRatio, 1.5)
  let adaptivePixelScale = 1
  const ADAPTIVE_PIXEL_FLOOR = 0.5
  const commitPixelRatio = () => {
    renderer.setPixelRatio(qualityMaxPixelRatio * adaptivePixelScale)
  }
  commitPixelRatio()

  let forceShadowUpdate = true
  const requestShadowUpdate = () => {
    forceShadowUpdate = true
  }

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
  const jetpackHoldSlider = document.getElementById(
    'jetpack-hold-slider',
  ) as HTMLInputElement
  const jetpackHoldValue = document.getElementById('jetpack-hold-value')!
  const moveSpeedSlider = document.getElementById('move-speed-slider') as HTMLInputElement
  const moveSpeedValue = document.getElementById('move-speed-value')!
  const cameraHeightSlider = document.getElementById(
    'camera-height-slider',
  ) as HTMLInputElement
  const cameraHeightValue = document.getElementById('camera-height-value')!
  const lookSpeedSlider = document.getElementById('look-speed-slider') as HTMLInputElement
  const lookSpeedValue = document.getElementById('look-speed-value')!
  const brightnessSlider = document.getElementById('brightness-slider') as HTMLInputElement
  const brightnessValue = document.getElementById('brightness-value')!
  const graphicsSlider = document.getElementById('graphics-slider') as HTMLInputElement
  const graphicsValue = document.getElementById('graphics-value')!
  const fogSlider = document.getElementById('fog-slider') as HTMLInputElement
  const fogValue = document.getElementById('fog-value')!
  const grassGreenSlopeSlider = document.getElementById(
    'grass-green-slope-slider',
  ) as HTMLInputElement
  const grassGreenSlopeValue = document.getElementById('grass-green-slope-value')!
  const grassTuftClusterSlider = document.getElementById(
    'grass-tuft-cluster-slider',
  ) as HTMLInputElement
  const grassTuftClusterValue = document.getElementById('grass-tuft-cluster-value')!
  const digSpeedSlider = document.getElementById('dig-speed-slider') as HTMLInputElement
  const digSpeedValue = document.getElementById('dig-speed-value')!
  const debrisDivisionsSlider = document.getElementById(
    'debris-divisions-slider',
  ) as HTMLInputElement
  const debrisDivisionsValue = document.getElementById('debris-divisions-value')!
  const treeFlatnessSlider = document.getElementById('tree-flatness-slider') as HTMLInputElement
  const treeFlatnessValue = document.getElementById('tree-flatness-value')!
  const treeRadiusSlider = document.getElementById('tree-radius-slider') as HTMLInputElement
  const treeRadiusValue = document.getElementById('tree-radius-value')!
  const treeCountSlider = document.getElementById('tree-count-slider') as HTMLInputElement
  const treeCountValue = document.getElementById('tree-count-value')!
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

  const tuneSliders: TuneSliderElements = {
    gravity: gravitySlider,
    jumpVelocity: jumpVelocitySlider,
    jetpackHold: jetpackHoldSlider,
    moveSpeed: moveSpeedSlider,
    cameraHeight: cameraHeightSlider,
    lookSpeed: lookSpeedSlider,
    digSpeed: digSpeedSlider,
    debrisDivisions: debrisDivisionsSlider,
    brightness: brightnessSlider,
    graphics: graphicsSlider,
    fog: fogSlider,
    grassGreenSlope: grassGreenSlopeSlider,
    grassTuftCluster: grassTuftClusterSlider,
    treeFlatness: treeFlatnessSlider,
    treeRadius: treeRadiusSlider,
    treeCount: treeCountSlider,
    rockClumpCount: rockClumpCountSlider,
    rocksPerClump: rocksPerClumpSlider,
    rockClumpRadius: rockClumpRadiusSlider,
    rockClumpSpacing: rockClumpSpacingSlider,
  }
  applyTuneFromStorage(tuneSliders)
  bindTunePersistence(tuneSliders)
  ;(window as unknown as { exportTuneDefaults?: () => string }).exportTuneDefaults = () =>
    exportTuneDefaults(tuneSliders)

  const syncJumpTune = () => {
    const g = Number(gravitySlider.value)
    const v = Number(jumpVelocitySlider.value)
    const jetpack = Number(jetpackHoldSlider.value)
    player.setGravity(g)
    player.setJumpSpeed(v)
    player.setJetpackHold(jetpack)
    gravityValue.textContent = g.toFixed(1)
    jumpVelocityValue.textContent = v.toFixed(1)
    jetpackHoldValue.textContent = jetpack.toFixed(2)
  }
  const syncMoveTune = () => {
    const speed = Number(moveSpeedSlider.value)
    const height = Number(cameraHeightSlider.value)
    const look = Number(lookSpeedSlider.value)
    player.setWalkSpeed(speed)
    player.setEyeHeight(height)
    player.setLookSpeed(look)
    moveSpeedValue.textContent = speed.toFixed(1)
    cameraHeightValue.textContent = height.toFixed(2)
    lookSpeedValue.textContent = look.toFixed(2)
  }
  const syncBrightness = () => {
    const exposure = Number(brightnessSlider.value)
    renderer.toneMappingExposure = exposure
    brightnessValue.textContent = exposure.toFixed(2)
    const fillScale = (exposure / DEFAULT_BRIGHTNESS) * graphicsLightScale
    hemisphereLight.intensity = 0.58 * fillScale
    ambientLight.intensity = 0.24 * fillScale
    fill.intensity = 0.32 * fillScale
    fill2.intensity = 0.2 * fillScale
    sun.intensity = 1.45 * fillScale
  }
  gravitySlider.addEventListener('input', syncJumpTune)
  jumpVelocitySlider.addEventListener('input', syncJumpTune)
  jetpackHoldSlider.addEventListener('input', syncJumpTune)
  moveSpeedSlider.addEventListener('input', syncMoveTune)
  cameraHeightSlider.addEventListener('input', syncMoveTune)
  lookSpeedSlider.addEventListener('input', syncMoveTune)
  const sceneFog = scene.fog as THREE.FogExp2
  const syncFog = () => {
    const density = fogDensityFromSlider(Number(fogSlider.value))
    sceneFog.density = density
    fogValue.textContent = density.toFixed(3)
  }
  brightnessSlider.addEventListener('input', syncBrightness)
  fogSlider.addEventListener('input', syncFog)
  syncJumpTune()
  syncMoveTune()
  syncBrightness()
  syncFog()
  scene.add(camera)
  const viewmodelHand = new ViewmodelHand(camera)

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
  // Triplanar sampling removes texture stretching on diagonal surface-cap faces.
  const triplanarScale = DIRT_TEXTURE_REPEAT / terrainWorldUnitsPerTile
  applyTerrainTriplanar(dirtMaterial, triplanarScale)
  applyTerrainTriplanar(grassMaterial, triplanarScale)
  const stoneBreakMaterial = createTerrainMaterial(0x8a8580, undefined, 0x1a1816)
  const woodBreakMaterial = createTerrainMaterial(0x5c3a22, undefined, 0x1a0f08)
  let rockMap = createRockAlbedoMap()
  rockMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  const stoneBlockMaterial = createTerrainMaterial(0xffffff, rockMap, 0x1a1816)
  applyTerrainTriplanar(stoneBlockMaterial, triplanarScale)
  const woodBlockMaterial = createTerrainMaterial(0x5c3a22, undefined, 0x1a0f08)
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
  // Grass-blade tufts render in their own group, outside collision/dig picking.
  scene.add(surfaceChunks.bladeGroup)

  let grassBladesEnabled = false
  let grassBladeDensity = 0
  let grassBladeCullRadius = 0

  // Quality-driven cull radii live here; syncGraphics overwrites them.
  const visibilityCtx = {
    cells,
    surfaceChunks,
    voxelInstancer,
    voxelSize,
    layerCount: voxelLayers,
    chunkRadius: DEFAULT_CHUNK_RADIUS,
    voxelRadius: DEFAULT_VOXEL_RADIUS,
  }
  const refreshVisibilityNow = () => {
    const p = player.object.position
    updateTerrainVisibility(p.x, p.z, visibilityCtx)
    surfaceChunks.cullBlades(p.x, p.z, grassBladeCullRadius)
  }

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(gridSpan * cellSize + 4, 2, gridSpan * cellSize + 4),
    dirtMaterial,
  )
  base.position.set(0, seamY - voxelLayers * voxelSize - 1, 0)
  base.castShadow = false
  base.receiveShadow = false
  base.userData.skipDigPick = true
  terrainRoot.add(base)
  terrainRoot.matrixAutoUpdate = false
  terrainRoot.updateMatrixWorld(true)

  const digBreakFx = new DigBreakEffect(terrainRoot)
  const digCrackStages = createDigCrackStageTextures()
  const digCrackOverlay = new DigCrackOverlay(terrainRoot, digCrackStages)

  const collisionWorld = new CollisionWorld()
  collisionWorld.setGridCell(cellSize)
  collisionWorld.setMaxLayers(voxelLayers)
  collisionWorld.setMeshGroundTargets(surfaceGroup, surfaceChunks.group)

  // Capsule-vs-triangle terrain collider (caves, overhangs, arbitrary slopes).
  const capsuleCollider = new CapsuleCollider()
  capsuleCollider.setTargets(surfaceChunks.group, surfaceGroup)
  player.setTerrainCollider(capsuleCollider)
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
    // Shadow casters changed; force one shadow re-render even if the player is still.
    requestShadowUpdate()
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

  /** World AABB for crack overlay and debris at break time. */
  function sampleDigBreakWorldBox(target: DigTarget, out: THREE.Box3): boolean {
    if (target.kind === 'block' && target.blockKey) {
      return blockBuilder.worldBoxByKey(target.blockKey, out) !== null
    }

    if (target.kind === 'voxel' && target.cell && target.layer !== undefined) {
      voxelBoundsBox(target.cell, target.layer, out)
      return !out.isEmpty()
    }

    if (target.kind === 'surface' && target.cell?.surfaceRoot) {
      target.cell.surfaceRoot.updateMatrixWorld(true)
      out.setFromObject(target.cell.surfaceRoot)
      return !out.isEmpty()
    }

    if (target.visualRoot) {
      target.visualRoot.updateMatrixWorld(true)
      out.setFromObject(target.visualRoot)
      return !out.isEmpty()
    }

    return false
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
    topSlopeThreshold: topSlopeThresholdFromSlider(Number(grassGreenSlopeSlider.value)),
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

  const syncGrassGreenSlopeLabel = () => {
    const topSlopeThreshold = topSlopeThresholdFromSlider(
      Number(grassGreenSlopeSlider.value),
    )
    grassGreenSlopeValue.textContent = topSlopeThreshold.toFixed(2)
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
      Number(grassGreenSlopeSlider.value),
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
    syncGrassGreenSlopeLabel()
    if (grassSlopeDebounce) clearTimeout(grassSlopeDebounce)
    grassSlopeDebounce = setTimeout(refreshSurfaceGrassSlope, GRASS_SLOPE_DEBOUNCE_MS)
  }

  const finalizeGrassSlopeRefresh = () => {
    if (grassSlopeDebounce) {
      clearTimeout(grassSlopeDebounce)
      grassSlopeDebounce = undefined
    }
    syncGrassGreenSlopeLabel()
    refreshSurfaceGrassSlope()
  }

  grassGreenSlopeSlider.addEventListener('input', scheduleGrassSlopeRefresh)
  grassGreenSlopeSlider.addEventListener('change', finalizeGrassSlopeRefresh)
  syncGrassGreenSlopeLabel()

  const treesGroup = new THREE.Group()
  scene.add(treesGroup)

  const rocksGroup = new THREE.Group()
  scene.add(rocksGroup)
  const rockGround: RockGroundTargets = {
    surface: surfaceGroup,
    chunkRoot: surfaceChunks.group,
  }

  const graphicsCtx = {
    renderer,
    scene,
    camera,
    sky,
    horizonColor,
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

  const syncGrassTuftClusterLabel = () => {
    grassTuftClusterValue.textContent = `${grassTuftClusterSlider.value}%`
  }

  const refreshGrassBlades = () => {
    surfaceChunks.setGrassBlades(
      grassBladesEnabled,
      grassBladeDensity,
      grassTuftClusterFromSlider(Number(grassTuftClusterSlider.value)),
    )
  }

  let graphicsDebounce: ReturnType<typeof setTimeout> | undefined
  const syncGraphics = () => {
    const t = qualityTFromSlider(Number(graphicsSlider.value))
    graphicsValue.textContent = qualityLabel(t)
    const result = applyGraphicsQuality(t, graphicsCtx)
    digCrackOverlay.setTexturesEnabled(!result.potatoMode)
    dirtMap = result.dirtMap
    grassMap = result.grassMap
    graphicsCtx.dirtMap = dirtMap
    graphicsCtx.grassMap = grassMap
    surfaceChunks.setMaterials(dirtMaterial, grassMaterial)
    grassBladesEnabled = result.grassBladesEnabled
    grassBladeDensity = result.grassBladeDensity
    grassBladeCullRadius = result.grassBladeCullRadius
    refreshGrassBlades()

    qualityMaxPixelRatio = result.maxPixelRatio
    commitPixelRatio()
    visibilityCtx.chunkRadius = result.chunkRadius
    visibilityCtx.voxelRadius = result.voxelRadius
    refreshVisibilityNow()
    requestShadowUpdate()

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

  let grassTuftClusterDebounce: ReturnType<typeof setTimeout> | undefined
  const scheduleGrassTuftClusterRefresh = () => {
    syncGrassTuftClusterLabel()
    if (grassTuftClusterDebounce) clearTimeout(grassTuftClusterDebounce)
    grassTuftClusterDebounce = setTimeout(refreshGrassBlades, 250)
  }
  const finalizeGrassTuftClusterRefresh = () => {
    if (grassTuftClusterDebounce) {
      clearTimeout(grassTuftClusterDebounce)
      grassTuftClusterDebounce = undefined
    }
    syncGrassTuftClusterLabel()
    refreshGrassBlades()
  }
  grassTuftClusterSlider.addEventListener('input', scheduleGrassTuftClusterRefresh)
  grassTuftClusterSlider.addEventListener('change', finalizeGrassTuftClusterRefresh)
  syncGrassTuftClusterLabel()

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

  const respawnTrees = () => {
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
    resolveTreeGroundY(treePlacements, surfaceGroup, surfaceChunks.group)
    placedTrees = placeTrees(treeTemplate, treePlacements, treesGroup)
    syncPropCollision()
  }

  let treeRespawnDebounce: ReturnType<typeof setTimeout> | undefined
  const scheduleTreeRespawn = () => {
    syncTreeTuneLabels()
    if (treeRespawnDebounce) clearTimeout(treeRespawnDebounce)
    treeRespawnDebounce = setTimeout(
      () => requestAnimationFrame(() => respawnTrees()),
      250,
    )
  }
  const finalizeTreeRespawn = () => {
    if (treeRespawnDebounce) {
      clearTimeout(treeRespawnDebounce)
      treeRespawnDebounce = undefined
    }
    requestAnimationFrame(() => respawnTrees())
  }
  const bindTreeSlider = (el: HTMLInputElement) => {
    el.addEventListener('input', scheduleTreeRespawn)
    el.addEventListener('change', finalizeTreeRespawn)
  }
  bindTreeSlider(treeFlatnessSlider)
  bindTreeSlider(treeRadiusSlider)
  bindTreeSlider(treeCountSlider)

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

  const loadedRockCells = (): Record<string, CellMeta> => {
    const out: Record<string, CellMeta> = {}
    for (const cell of cells.values()) {
      if (!cell.surfaceRoot) continue
      const meta = surfaceCells[cell.key]
      if (meta) out[cell.key] = meta
    }
    return out
  }

  const respawnRocks = () => {
    if (!rockTemplates) return
    syncRockTuneLabels()
    clearPlacedRocks()
    const opts = getRockSpawnOptions()
    const rockPlacements = findRockPlacements(
      loadedRockCells(),
      terrainGrid,
      spawnIx,
      spawnIy,
      opts,
    )
    resolveRockGroundY(rockPlacements, surfaceGroup, surfaceChunks.group)
    placedRocks = placeRocks(
      rockTemplates,
      rockPlacements,
      rocksGroup,
      rockGround,
      collisionWorld,
    )
    syncPropCollision()
  }

  let rockRespawnDebounce: ReturnType<typeof setTimeout> | undefined
  const scheduleRockRespawn = () => {
    syncRockTuneLabels()
    if (rockRespawnDebounce) clearTimeout(rockRespawnDebounce)
    rockRespawnDebounce = setTimeout(
      () => requestAnimationFrame(() => respawnRocks()),
      250,
    )
  }
  const finalizeRockRespawn = () => {
    if (rockRespawnDebounce) {
      clearTimeout(rockRespawnDebounce)
      rockRespawnDebounce = undefined
    }
    requestAnimationFrame(() => respawnRocks())
  }
  const bindRockSlider = (el: HTMLInputElement) => {
    el.addEventListener('input', scheduleRockRespawn)
    el.addEventListener('change', finalizeRockRespawn)
  }
  bindRockSlider(rockClumpCountSlider)
  bindRockSlider(rocksPerClumpSlider)
  bindRockSlider(rockClumpRadiusSlider)
  bindRockSlider(rockClumpSpacingSlider)
  syncTreeTuneLabels()
  syncRockTuneLabels()

  info.textContent = 'Loading terrain…'

  void (async () => {
    const [trees, rocks] = await Promise.all([treeTemplatePromise, rockTemplatesPromise])
    treeTemplate = trees
    rockTemplates = rocks
    respawnTrees()
    respawnRocks()

    if (deferredMetas.length > 0) {
      await loadSurfaceBatch(deferredMetas)
      surfaceChunks.flushDirty()
      const loaded = deferredMetas
        .map((m) => cells.get(cellKey(m.ix, m.iy)))
        .filter((c): c is Cell => c?.surfaceRoot !== undefined)
      syncVoxelPlacement(loaded)
      respawnTrees()
      respawnRocks()
      refreshGrassBlades()
    }
  })()

  const digProgressFill = document.getElementById('dig-progress-fill')!
  const inventory = new Inventory()

  // Player-placed dirt cubes (2.5 m). Shares the dirt material so they tile/light
  // like terrain. Lives in world space alongside the terrain root.
  const blockBuilder = new BlockBuilder({
    dirt: dirtMaterial,
    wood: woodBlockMaterial,
    stone: stoneBlockMaterial,
  })
  scene.add(blockBuilder.group)
  const _buildBox = new THREE.Box3()
  const _buildNormal = new THREE.Vector3()
  const _buildCell: BuildCell = {
    gx: 0,
    gy: 0,
    gz: 0,
    key: '',
    type: 'dirt',
    placedAt: 0,
  }

  const blockMaterialFor = (type: BuildBlockType) =>
    type === 'stone'
      ? stoneBlockMaterial
      : type === 'wood'
        ? woodBlockMaterial
        : dirtMaterial

  /** Cell to place into for the current aim, or null when no valid surface is hit. */
  function aimedBuildCell(type: BuildBlockType): BuildCell | null {
    const hit = pickBuildHit()
    if (!hit || !hit.face) return null

    if (
      hit.object instanceof THREE.InstancedMesh &&
      blockBuilder.isBlockMesh(hit.object) &&
      hit.instanceId !== undefined
    ) {
      const key = blockBuilder.instanceCellKey(hit.object, hit.instanceId)
      const placed = key ? blockBuilder.getCell(key) : undefined
      if (placed) {
        buildPlacementNormalAgainstBlock(
          hit.point,
          placed,
          hit.face.normal,
          hit.object.matrixWorld,
          _digRayDir,
          _buildNormal,
        )
        return buildCellAdjacent(placed, _buildNormal, _buildCell, type)
      }
    }

    buildPlacementNormalFromFace(
      hit.face.normal,
      hit.object.matrixWorld,
      _digRayDir,
      _buildNormal,
    )
    return buildCellFromPoint(hit.point, _buildNormal, type, _buildCell)
  }

  /** Refuse placement when the block volume overlaps the player's collision box. */
  function buildCellBlocksPlayer(cell: BuildCell): boolean {
    const p = player.object.position
    blockBuilder.worldBox(cell, _buildBox)
    return (
      p.x + PLAYER_RADIUS > _buildBox.min.x &&
      p.x - PLAYER_RADIUS < _buildBox.max.x &&
      p.y + PLAYER_HEIGHT > _buildBox.min.y &&
      p.y < _buildBox.max.y &&
      p.z + PLAYER_RADIUS > _buildBox.min.z &&
      p.z - PLAYER_RADIUS < _buildBox.max.z
    )
  }

  function tryPlaceBlock() {
    if (!player.isLocked() || !inventory.selectedIsBuildable()) return
    const item = inventory.getSelected()
    if (!item || inventory.getSelectedCount() <= 0) {
      info.textContent = item ? `Out of ${item}` : 'Select a block to place'
      return
    }
    const cell = aimedBuildCell(item)
    if (!cell || blockBuilder.has(cell.key) || buildCellBlocksPlayer(cell)) return
    if (!inventory.consumeSelected(1)) return

    cell.type = item
    cell.placedAt = performance.now()
    blockBuilder.place(cell)
    blockBuilder.worldBox(cell, _buildBox)
    collisionWorld.setBuildBox(cell.key, _buildBox.min, _buildBox.max)
    requestShadowUpdate()
    forceBuildPreview = true
    info.textContent = `Placed ${item} block`
  }

  function updateBuildPreview() {
    if (!player.isLocked() || !inventory.selectedIsBuildable()) {
      blockBuilder.setGhost(null)
      return
    }
    const item = inventory.getSelected()
    if (!item) {
      blockBuilder.setGhost(null)
      return
    }
    const cell = aimedBuildCell(item)
    if (!cell) {
      blockBuilder.setGhost(null)
      return
    }
    const valid =
      !blockBuilder.has(cell.key) &&
      !buildCellBlocksPlayer(cell) &&
      inventory.getSelectedCount() > 0
    blockBuilder.setGhost(cell, valid, item)
  }

  function removePlacedBlock(key: string, refund = true) {
    const removed = blockBuilder.removeAt(key)
    if (!removed) return
    collisionWorld.removeBuildBox(key)
    if (refund) inventory.add(removed.type, 1)
    requestShadowUpdate()
  }

  function updateBlockExpiry() {
    const expired = blockBuilder.expireBefore(performance.now())
    for (const cell of expired) {
      collisionWorld.removeBuildBox(cell.key)
      requestShadowUpdate()
    }
  }

  /** Base dig duration at 1.0× speed (seconds to complete). */
  const VOXEL_DIG_TIME_BASE = 1.1
  const SURFACE_DIG_TIME_BASE = 2.0

  const getDigSpeed = () => Number(digSpeedSlider.value)
  const getDebrisDivisions = () =>
    Math.max(1, Math.round(Number(debrisDivisionsSlider.value)))

  const syncDigSpeed = () => {
    digSpeedValue.textContent = `${getDigSpeed().toFixed(2)}×`
  }
  digSpeedSlider.addEventListener('input', syncDigSpeed)
  syncDigSpeed()

  const syncDebrisDivisions = () => {
    const n = getDebrisDivisions()
    debrisDivisionsValue.textContent = String(n * n * n)
  }
  debrisDivisionsSlider.addEventListener('input', syncDebrisDivisions)
  syncDebrisDivisions()

  type DigTarget = {
    id: string
    cell?: Cell
    kind: 'surface' | 'voxel' | 'rock' | 'tree' | 'block'
    layer?: number
    visualRoot: THREE.Object3D
    propRef?: THREE.Group
    blockKey?: string
    blockType?: BuildBlockType
  }

  function findMineableFromHit(
    hit: THREE.Intersection,
  ): { kind: 'rock' | 'tree'; root: THREE.Group } | null {
    let current: THREE.Object3D | null = hit.object
    while (current) {
      if (placedRocks.includes(current as THREE.Group)) {
        return { kind: 'rock', root: current as THREE.Group }
      }
      if (placedTrees.includes(current as THREE.Group)) {
        return { kind: 'tree', root: current as THREE.Group }
      }
      current = current.parent
    }
    return null
  }

  function disposeMineableProp(root: THREE.Group) {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose()
    })
  }

  function removeMineableProp(root: THREE.Group, kind: 'rock' | 'tree') {
    if (kind === 'rock') {
      const idx = placedRocks.indexOf(root)
      if (idx >= 0) placedRocks.splice(idx, 1)
      rocksGroup.remove(root)
      inventory.add('stone', STONE_PER_ROCK)
      info.textContent = `Mined rock (+${STONE_PER_ROCK} stone)`
    } else {
      const idx = placedTrees.indexOf(root)
      if (idx >= 0) placedTrees.splice(idx, 1)
      treesGroup.remove(root)
      inventory.add('wood', WOOD_PER_TREE)
      info.textContent = `Chopped tree (+${WOOD_PER_TREE} wood)`
    }
    disposeMineableProp(root)
    syncPropCollision()
  }

  let digTarget: DigTarget | null = null
  let digProgress = 0
  let digMouseDown = false
  let digEffectId: string | null = null
  let surfaceDigPreviewCell: Cell | null = null

  function setSurfaceDigPreview(cell: Cell | null) {
    if (surfaceDigPreviewCell?.key === cell?.key) return
    if (surfaceDigPreviewCell?.surfaceRoot) {
      const prev = surfaceDigPreviewCell.surfaceRoot
      prev.visible = false
      prev.traverse((child) => {
        if (child instanceof THREE.Mesh) child.renderOrder = 0
      })
    }
    surfaceDigPreviewCell = cell
    // Keep the cell in the merged chunk while digging — peeling it out leaves a dark gap.
    if (!cell) surfaceChunks.setDigPreviewCell(null)
    if (cell?.surfaceRoot) {
      cell.surfaceRoot.visible = true
      cell.surfaceRoot.traverse((child) => {
        if (child instanceof THREE.Mesh) child.renderOrder = 2
      })
      cell.surfaceRoot.updateMatrixWorld(true)
    }
  }

  const keys = new Set<string>()
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    keys.add(e.code)
    if (e.code === 'KeyN') {
      e.preventDefault()
      if (player.isLocked()) viewmodelHand.whack()
    }
    if (e.code === 'KeyM') {
      e.preventDefault()
      if (!player.isLocked()) {
        player.lock()
        return
      }
      viewmodelHand.whack()
      tryPlaceBlock()
    }
    if (!player.isLocked()) {
      const startKeys = new Set([
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'Space',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
      ])
      if (startKeys.has(e.code)) player.lock()
    }
    if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
      const n = Number(e.code.slice(5))
      if (n >= 1 && n <= 9) inventory.selectIndex(n - 1)
    }
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
    renderer.domElement.focus()
    if (e.button === 2) {
      // Right-click: place the selected build block.
      if (player.isLocked()) {
        viewmodelHand.whack()
        tryPlaceBlock()
      }
      return
    }
    if (e.button !== 0) return
    if (!player.isLocked()) {
      player.lock()
      return
    }
    digMouseDown = true
    viewmodelHand.whack()
  })
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) digMouseDown = false
  })
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      if (!player.isLocked()) return
      e.preventDefault()
      inventory.cycle(e.deltaY > 0 ? 1 : -1)
    },
    { passive: false },
  )

  player.controls.addEventListener('lock', () => {
    document.body.classList.add('playing')
    info.textContent = ''
    renderer.domElement.style.cursor = 'none'
  })

  player.controls.addEventListener('unlock', () => {
    document.body.classList.remove('playing')
    digMouseDown = false
    clearDigState()
    blockBuilder.setGhost(null)
    info.textContent = ''
    renderer.domElement.style.cursor = 'crosshair'
  })

  const raycaster = new THREE.Raycaster()

  function aimDigRaycaster() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
    _digRayDir.copy(raycaster.ray.direction)
    _digRayOrigin.copy(camera.position).addScaledVector(_digRayDir, DIG_RAY_ORIGIN_OFFSET)
    raycaster.ray.set(_digRayOrigin, _digRayDir)
    raycaster.near = 0.01
    raycaster.far = DIG_REACH
  }

  function digHitDistanceFromCamera(hit: THREE.Intersection) {
    return hit.distance + DIG_RAY_ORIGIN_OFFSET
  }

  function isViewmodelHit(hit: THREE.Intersection) {
    let current: THREE.Object3D | null = hit.object
    while (current) {
      if (current === viewmodelHand.group) return true
      current = current.parent
    }
    return false
  }

  function isChunkSurfaceHit(hit: THREE.Intersection, cell: Cell): boolean {
    if (!(hit.object instanceof THREE.Mesh)) return false
    const chunkCells = hit.object.userData.chunkCells as Cell[] | undefined
    return chunkCells?.includes(cell) ?? false
  }

  function isSurfaceDigHit(hit: THREE.Intersection, cell: Cell): boolean {
    if (isChunkSurfaceHit(hit, cell)) return true
    if (!cell.surfaceRoot) return false
    let current: THREE.Object3D | null = hit.object
    while (current) {
      if (current === cell.surfaceRoot) return true
      current = current.parent
    }
    return false
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
        return cellFromChunkSurfaceHit(hit.point, chunkCells, cellSize)
      }
    }
    return getCellFromObject(hit.object)
  }

  function completeDig(target: DigTarget) {
    if (target.kind === 'rock' || target.kind === 'tree') {
      if (target.propRef) removeMineableProp(target.propRef, target.kind)
      return
    }

    if (target.kind === 'block') {
      if (!target.blockKey) return
      const removed = blockBuilder.getCell(target.blockKey)
      removePlacedBlock(target.blockKey, true)
      if (removed) {
        info.textContent = `Mined ${removed.type} block (+1 ${removed.type})`
      }
      return
    }

    const cell = target.cell
    if (!cell) return

    if (target.kind === 'surface') {
      setSurfaceDigPreview(null)
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
      inventory.add('dirt', DIRT_PER_DIG)
      info.textContent = `Mined dirt (+${DIRT_PER_DIG} dirt)`
      return
    }

    const layer = target.layer
    if (layer === undefined || !voxelInstancer.hasLayer(cell, layer)) return

    voxelInstancer.hideLayer(cell, layer, voxelSize)
    patchCellCollision(cell)
    inventory.add('dirt', DIRT_PER_DIG)

    const remaining = voxelInstancer.layerCount(cell)
    info.textContent =
      remaining > 0 || cell.surfaceRoot
        ? `Mined dirt (+${DIRT_PER_DIG} dirt)`
        : `Mined dirt (+${DIRT_PER_DIG} dirt) — column fully excavated`
  }

  function pickHit(forBuild = false): THREE.Intersection | null {
    aimDigRaycaster()
    _pickHits.length = 0
    raycaster.intersectObjects(surfaceChunks.group.children, false, _pickHits)
    for (const child of surfaceGroup.children) {
      if (child === surfaceChunks.group || !child.visible) continue
      raycaster.intersectObject(child, true, _pickHits)
    }
    for (const mesh of voxelInstancer.meshes) {
      if (!mesh.visible) continue
      raycaster.intersectObject(mesh, false, _pickHits)
    }
    if (blockBuilder.count > 0) {
      blockBuilder.intersectMeshes(raycaster, _pickHits)
    }
    if (!forBuild) {
      for (const tree of placedTrees) {
        raycaster.intersectObject(tree, true, _pickHits)
      }
      for (const rock of placedRocks) {
        raycaster.intersectObject(rock, true, _pickHits)
      }
    }
    if (_pickHits.length === 0) return null

    let best: THREE.Intersection | null = null
    let bestBuildBlock: THREE.Intersection | null = null
    for (const hit of _pickHits) {
      if (hit.object.userData.skipDigPick) continue
      if (isViewmodelHit(hit)) continue
      const dist = digHitDistanceFromCamera(hit)
      if (dist > DIG_REACH) continue
      if (hit.object instanceof THREE.InstancedMesh && hit.instanceId !== undefined) {
        if (blockBuilder.isBlockMesh(hit.object)) {
          if (!blockBuilder.instanceCellKey(hit.object, hit.instanceId)) continue
        } else {
          const layer = voxelInstancer.getLayerFromMesh(hit.object)
          if (layer === undefined) continue
          const key = voxelInstancer.getCellKey(layer, hit.instanceId)
          const cell = key ? cells.get(key) : undefined
          if (!cell || !voxelInstancer.hasLayer(cell, layer)) continue
        }
      }
      if (!best || dist < digHitDistanceFromCamera(best)) best = hit
      if (
        blockBuilder.isBlockMesh(hit.object) &&
        (!bestBuildBlock || dist < digHitDistanceFromCamera(bestBuildBlock))
      ) {
        bestBuildBlock = hit
      }
    }
    if (bestBuildBlock) {
      if (!best) return bestBuildBlock
      const blockDist = digHitDistanceFromCamera(bestBuildBlock)
      const bestDist = digHitDistanceFromCamera(best)
      // Prefer placed blocks over co-planar terrain (same rule for mining and building).
      if (blockBuilder.isBlockMesh(best.object) || blockDist <= bestDist + 0.05) {
        return bestBuildBlock
      }
    }
    return best
  }

  /** Build placement ignores trees/rocks so aim reaches terrain and placed blocks behind them. */
  function pickBuildHit(): THREE.Intersection | null {
    return pickHit(true)
  }

  function clearDigState(cancelFx = true) {
    if (cancelFx) digBreakFx.cancel()
    else digBreakFx.releaseHidden()
    digCrackOverlay.clear()
    setSurfaceDigPreview(null)
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

    const digFxOptions = (
      excludeBottomFace: boolean,
      style: DigBreakOptions['style'] = 'dirt',
    ): DigBreakOptions => ({
      style,
      ...(excludeBottomFace ? { excludeBottomFace: true } : {}),
    })

    if (target.kind === 'rock' || target.kind === 'tree') {
      const mat = target.kind === 'rock' ? stoneBreakMaterial : woodBreakMaterial
      const style = target.kind === 'rock' ? 'stone' : 'wood'
      digBreakFx.startFromObject(
        target.visualRoot,
        mat,
        getDebrisDivisions(),
        digFxOptions(false, style),
      )
      return
    }

    if (target.kind === 'block' && target.blockKey) {
      const blockType = target.blockType ?? 'dirt'
      const mat = blockMaterialFor(blockType)
      const style = blockType === 'stone' ? 'stone' : blockType === 'wood' ? 'wood' : 'dirt'
      if (blockBuilder.worldBoxByKey(target.blockKey, _boundsBox)) {
        digBreakFx.startFromBox(
          _boundsBox,
          mat,
          getDebrisDivisions(),
          [],
          digFxOptions(false, style),
        )
      }
      return
    }

    const cell = target.cell
    if (!cell) return

    if (target.kind === 'voxel' && target.layer !== undefined) {
      const layer = target.layer
      const excludeBottomFace =
        layer < voxelLayers - 1 && voxelInstancer.hasLayer(cell, layer + 1)
      voxelBoundsBox(cell, layer, _boundsBox)
      digBreakFx.startFromBox(
        _boundsBox,
        dirtMaterial,
        getDebrisDivisions(),
        [],
        digFxOptions(excludeBottomFace, 'dirt'),
      )
      return
    }

    const excludeBottomFace = voxelInstancer.layerCount(cell) > 0
    if (target.kind === 'surface' && cell.surfaceRoot) {
      setSurfaceDigPreview(cell)
      cell.surfaceRoot.updateMatrixWorld(true)
      _boundsBox.setFromObject(cell.surfaceRoot)
      if (!_boundsBox.isEmpty()) {
        digBreakFx.startFromBox(
          _boundsBox,
          dirtMaterial,
          getDebrisDivisions(),
          [cell.surfaceRoot],
          digFxOptions(excludeBottomFace, 'dirt'),
        )
        return
      }
      setSurfaceDigPreview(null)
    }
    if (target.visualRoot) {
      digBreakFx.startFromObject(
        target.visualRoot,
        dirtMaterial,
        getDebrisDivisions(),
        digFxOptions(excludeBottomFace, 'dirt'),
      )
    }
  }

  function digTargetFromHit(hit: THREE.Intersection): DigTarget | null {
    const prop = findMineableFromHit(hit)
    if (prop) {
      return {
        id: `prop:${prop.kind}:${prop.root.uuid}`,
        kind: prop.kind,
        visualRoot: prop.root,
        propRef: prop.root,
      }
    }

    if (
      hit.object instanceof THREE.InstancedMesh &&
      blockBuilder.isBlockMesh(hit.object) &&
      hit.instanceId !== undefined
    ) {
      const blockKey = blockBuilder.instanceCellKey(hit.object, hit.instanceId)
      if (!blockKey) return null
      const blockType = blockBuilder.getCell(blockKey)?.type ?? 'dirt'
      return {
        id: `block:${blockKey}`,
        kind: 'block',
        blockKey,
        blockType,
        visualRoot: hit.object,
      }
    }

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

    if (cell.surfaceRoot && isSurfaceDigHit(hit, cell)) {
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
    if (target.kind === 'block') {
      return target.blockKey !== undefined && blockBuilder.has(target.blockKey)
    }
    if (target.kind === 'rock') {
      return target.propRef !== undefined && placedRocks.includes(target.propRef)
    }
    if (target.kind === 'tree') {
      return target.propRef !== undefined && placedTrees.includes(target.propRef)
    }
    const cell = target.cell
    if (!cell) return false
    if (target.kind === 'surface') return cell.surfaceRoot !== undefined
    if (target.layer === undefined) return false
    return voxelInstancer.hasLayer(cell, target.layer)
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
      } else if (target && digTargetStillValid(target)) {
        // Ray grazed non-mineable geometry (e.g. bedrock); keep the active target.
      } else {
        target = null
        digTarget = null
        digProgress = 0
      }
    } else if (target && !digTargetStillValid(target)) {
      clearDigState()
      return
    }

    if (!target) return
    if (!digTargetStillValid(target)) {
      clearDigState()
      return
    }

    ensureDigEffect(target)

    const digTimeBase =
      target.kind === 'surface'
        ? SURFACE_DIG_TIME_BASE
        : target.kind === 'block'
          ? BUILD_BLOCK_DIG_TIME_BASE[target.blockType ?? 'dirt']
          : target.kind === 'voxel'
            ? VOXEL_DIG_TIME_BASE
            : target.kind === 'rock'
              ? ROCK_DIG_TIME_BASE
              : TREE_DIG_TIME_BASE
    const digTime = digTimeBase / getDigSpeed()
    digProgress = Math.min(1, digProgress + dt / digTime)
    digBreakFx.update(digProgress)
    const crackStyle =
      target.kind === 'rock' || target.blockType === 'stone'
        ? 'stone'
        : target.kind === 'tree' || target.blockType === 'wood'
          ? 'wood'
          : 'dirt'
    digCrackOverlay.setStyle(crackStyle)
    if (sampleDigBreakWorldBox(target, _boundsBox)) {
      // Curved props (rocks/trees/surface caps) get a crack that hugs their
      // real geometry; voxels are true boxes so the box decal is exact.
      const conform =
        target.kind !== 'voxel' &&
        target.kind !== 'block' &&
        target.visualRoot !== undefined
      if (conform) {
        digCrackOverlay.setFromObject(target.visualRoot, _boundsBox, digProgress)
      } else {
        digCrackOverlay.setFromBox(_boundsBox, digProgress)
      }
    } else {
      digCrackOverlay.clear()
    }

    document.body.classList.add('digging')
    digProgressFill.style.setProperty('--dig-deg', `${digProgress * 360}deg`)

    if (digProgress >= 1) {
      if (sampleDigBreakWorldBox(target, _boundsBox)) {
        digBreakFx.refreshBreakBox(_boundsBox)
      }
      digBreakFx.releaseHidden()
      completeDig(target)
      const finishMat =
        target.kind === 'rock' || target.blockType === 'stone'
          ? stoneBreakMaterial
          : target.kind === 'tree' || target.blockType === 'wood'
            ? woodBreakMaterial
            : dirtMaterial
      digBreakFx.finish(finishMat)
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
    commitPixelRatio()
  }
  window.addEventListener('resize', onResize)

  const clock = new THREE.Clock()
  renderer.domElement.style.cursor = 'crosshair'
  let visibilityTimer = 0

  refreshVisibilityNow()

  // ---- Adaptive resolution: scale render res with measured frame time ------
  // The sun-follows-player shadow only needs a fresh pass when the player has moved
  // a meaningful distance. Re-rendering the whole shadow map every ~0.35 m (a few
  // frames while walking) is a big GPU cost on the larger high/ultra shadow maps;
  // 0.8 m roughly halves the pass count with no visible shadow swimming.
  const SHADOW_MOVE_EPS_SQ = 0.8 * 0.8
  const lastShadowPos = new THREE.Vector3(Infinity, 0, 0)
  let frameMs = 16
  let adaptTimer = 0
  const ADAPT_INTERVAL = 0.5
  // Slow frames → drop resolution; comfortable frames → climb back toward 1.
  const FRAME_MS_HIGH = 20 // ~50 fps
  const FRAME_MS_LOW = 16 // ~62 fps

  // ---- Build-preview ghost throttle ----------------------------------------
  // Re-raycasting for the placement ghost traverses every visible surface chunk
  // plus all voxel instanced meshes (~9k instance tests). Dirt (buildable) is the
  // default selected item, so running this every frame while merely walking around
  // was the single biggest CPU cost. Instead, only re-pick when the aim actually
  // rotates, or on a slow heartbeat (catches placed/dug changes under a still view).
  const _bpQuat = new THREE.Quaternion()
  let _bpHasQuat = false
  let buildPreviewTimer = 0
  let forceBuildPreview = false
  const BUILD_PREVIEW_HEARTBEAT = 0.2
  const BUILD_PREVIEW_ROT_EPS = 0.009 // ~0.5° of view rotation

  // ---- FPS / perf HUD ------------------------------------------------------
  let perfHudTimer = 0
  const PERF_HUD_INTERVAL = 0.25

  function updatePerfHud() {
    const fps = Math.max(0, Math.round(1000 / Math.max(frameMs, 0.0001)))
    const fpsClass = fps >= 55 ? '' : fps >= 35 ? 'warn' : 'bad'
    const renderScale = Math.round(qualityMaxPixelRatio * adaptivePixelScale * 100)
    const quality = graphicsValue.textContent ?? ''
    perfHud.innerHTML =
      `<span class="perf-fps ${fpsClass}">${fps}</span>` +
      `<span class="perf-sub">fps</span>` +
      `<span class="perf-sub">${quality} · ${renderScale}%</span>`
  }

  function animate() {
    requestAnimationFrame(animate)
    const rawDt = clock.getDelta()
    const dt = Math.min(rawDt, 0.05)

    frameMs += (rawDt * 1000 - frameMs) * 0.1
    adaptTimer += dt
    if (adaptTimer >= ADAPT_INTERVAL) {
      adaptTimer = 0
      if (frameMs > FRAME_MS_HIGH && adaptivePixelScale > ADAPTIVE_PIXEL_FLOOR) {
        // Drop faster the worse the frame time is, so weak GPUs settle quickly
        // instead of crawling down 6% at a time over several seconds.
        const drop = frameMs > 40 ? 0.16 : frameMs > 28 ? 0.1 : 0.06
        adaptivePixelScale = Math.max(ADAPTIVE_PIXEL_FLOOR, adaptivePixelScale - drop)
        commitPixelRatio()
      } else if (frameMs < FRAME_MS_LOW && adaptivePixelScale < 1) {
        adaptivePixelScale = Math.min(1, adaptivePixelScale + 0.04)
        commitPixelRatio()
      }
    }

    readInput()
    collisionWorld.beginFrame()
    player.update(dt, input)
    updateSunShadow()

    if (renderer.shadowMap.enabled) {
      const p = player.object.position
      if (forceShadowUpdate || lastShadowPos.distanceToSquared(p) > SHADOW_MOVE_EPS_SQ) {
        renderer.shadowMap.needsUpdate = true
        lastShadowPos.copy(p)
        forceShadowUpdate = false
      }
    }

    visibilityTimer += dt
    if (visibilityTimer >= VISIBILITY_INTERVAL) {
      visibilityTimer = 0
      refreshVisibilityNow()
    }

    const digging = isDigging() && player.isLocked()
    viewmodelHand.group.visible = player.isLocked()
    viewmodelHand.update(dt, digging)
    if (digging) {
      blockBuilder.setGhost(null)
      updateDig(dt)
      _bpHasQuat = false
    } else {
      if (digTarget || digProgress > 0) clearDigState()
      if (player.isLocked() && inventory.selectedIsBuildable()) {
        buildPreviewTimer += dt
        const rotDelta = _bpHasQuat ? camera.quaternion.angleTo(_bpQuat) : Infinity
        if (
          forceBuildPreview ||
          rotDelta > BUILD_PREVIEW_ROT_EPS ||
          buildPreviewTimer >= BUILD_PREVIEW_HEARTBEAT
        ) {
          updateBuildPreview()
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else {
        blockBuilder.setGhost(null)
        _bpHasQuat = false
      }
    }
    digBreakFx.tick(dt)
    updateBlockExpiry()

    if (
      placedRocks.length > 0 &&
      updateRocksPhysics(placedRocks, rockGround, collisionWorld, dt)
    ) {
      syncPropCollision()
    }

    updateGrassWind(clock.elapsedTime)
    renderer.render(scene, camera)

    perfHudTimer += dt
    if (perfHudTimer >= PERF_HUD_INTERVAL) {
      perfHudTimer = 0
      updatePerfHud()
    }
  }
  updatePerfHud()
  animate()
}

main().catch((err) => {
  console.error(err)
  const info = document.getElementById('info')
  if (info) info.textContent = `Error loading terrain: ${err.message}`
})
