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
  GRASS_MID,
} from './dirtTexture'
import { DigBreakEffect, type DigBreakOptions } from './digEffect'
import { DigBlockOutline } from './digBlockOutline'
import { createDigCrackStageTextures, DigCrackOverlay } from './digCrackOverlay'
import { Inventory, TOOL_MAX_DURABILITY } from './inventory'
import { applySurfaceCapMaterials } from './surfaceCapMaterials'
import {
  findRockPlacements,
  loadRockModels,
  placeRocks,
  resolveRockGroundY,
  updateRocksPhysics,
  wakeRocksNear,
  type RockGroundTargets,
  type RockSpawnOptions,
} from './rock'
import {
  findTreePlacements,
  loadTreeBerriesModel,
  loadTreeModel,
  placeTrees,
  resolveTreeGroundY,
  setBerryGlowEnabled,
  updateBerryGlow,
  refreshBerryGlowLights,
  initBerryGlowLightPool,
  releaseBerryGlowLight,
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
  blendExposure,
  blendSkyAtmosphere,
  blendSunDirection,
  caveDarknessScale,
  CAVE_FOG_HEX,
  cycleFactor,
  cyclePhase,
  DAY_START_ELAPSED_SEC,
  isNight,
  nightStrength,
  OUTDOOR_RAY_ORIGIN_Y,
  skipToMorning,
  updateShelteredFromSky,
  sunAnglesFromPhase,
} from './dayNight'
import { createSkyDecor } from './skyDecor'
import {
  createEnemy,
  despawnExpiredEnemies,
  despawnOrphanEnemies,
  despawnStuckEnemies,
  cullExcessEnemies,
  damageEnemy,
  applyEnemyLightHeight,
  applyEnemyLightDayNight,
  applyEnemyLightDayNightVisual,
  setEnemyPointLightsQualityEnabled,
  enemyCrawlSpeedFromSlider,
  enemyLightHeightOffsetFromSlider,
  enemySpawnIntervalFromSlider,
  rollEnemySpawnTier,
  ENEMY_MAX_ALIVE,
  ENEMY_KNOCKBACK_LIFT,
  ENEMY_KNOCKBACK_SPEED,
  ENEMY_STEP_HEIGHT,
  clearEnemies,
  meleeStatsForItem,
  meleeKnockbackForEnemy,
  meleeFacingMinForSweepDeg,
  enemyFromIntersection,
  loadEnemyTemplate,
  pickRandomEnemySpawn,
  PLAYER_MAX_HEALTH,
  prewarmEnemyVisualPool,
  resolveEnemyGroundY,
  syncEnemyHealthBars,
  refreshEnemiesAfterTerrainDig,
  updateEnemies,
  type EnemyDeathContext,
  type EnemyInstance,
} from './enemy'
import { EnemyOrbDrops } from './enemyOrbDrops'
import { CrystalBerryDrops } from './crystalBerryDrops'
import { GroundItems } from './groundItems'
import {
  clearSpiders,
  createSpiderNestBeacon,
  damageSpider,
  spiderFromIntersection,
  spiderNestWorldFromSlider,
  spiderNestRadiusFromSlider,
  syncSpiderHealthBars,
  tickSpiderNestSpawns,
  updateSpiderNestBeacon,
  updateSpiders,
  SPIDER_HIT_KNOCKBACK_SPEED,
  SPIDER_MAX_ALIVE,
  SPIDER_NEST_ACTIVATION_RANGE,
  SPIDER_NEST_CENTER_X,
  SPIDER_NEST_CENTER_Z,
  SPIDER_SPAWN_INTERVAL,
  type SpiderDeathContext,
  type SpiderInstance,
} from './roboticSpider'
import {
  applyGraphicsQuality,
  type AdaptiveResolutionPolicy,
  graphicsLightScale,
  qualityLabel,
  fogDensityFromSlider,
  qualityTFromSlider,
  pointGlowsEnabledFromT,
} from './graphicsQuality'
import { digToolMultiplier } from './digTools'
import { updateGrassWind } from './grassBlades'
import { applyTerrainTriplanar } from './terrainTriplanar'
import {
  PlayerController,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  type PlayerInput,
} from './player'
import { TouchControls } from './touchControls'
import { CapsuleCollider, registerBVHExtensions } from './meshCollider'
import {
  BOW_BASE_FOV,
  BOW_DRAW_DURATION,
  BOW_DRAW_HUD_MIN,
  BOW_FIRE_COOLDOWN,
  BOW_MIN_RELEASE,
  BOW_ZOOM_FOV,
  BOW_ZOOM_LERP,
  BOW_ZOOM_LOOK_SCALE,
  SPEAR_THROW_COOLDOWN,
  ViewmodelHand,
} from './viewmodelHand'
import {
  clearThrownSpears,
  dropSpearsFromBlock,
  dropSpearsFromProp,
  dropSpearsFromVoxel,
  spawnThrownSpear,
  updateThrownSpears,
  type ThrownSpear,
} from './thrownSpear'
import {
  ARROW_MAX_SPEED,
  ARROW_MIN_SPEED,
  clearThrownArrows,
  dropArrowsFromBlock,
  dropArrowsFromProp,
  dropArrowsFromVoxel,
  findBestArrow,
  hasGlowArrowBlasts,
  spawnThrownArrow,
  updateThrownArrows,
  type ThrownArrow,
} from './thrownArrow'
import {
  clearThrownOrbs,
  hasOrbBlasts,
  initOrbBlastLightPool,
  setOrbBlastLightsEnabled,
  spawnThrownOrb,
  updateThrownOrbs,
  type ThrownOrb,
  type ThrownOrbKind,
} from './thrownOrb'
import {
  freezeSubtreeMatrices,
  loadSurfaceCell,
  refreshFrozenMatrixWorld,
  ensureMatrixWorld,
  runLoadPool,
  sortSurfaceCellsByDistance,
  SURFACE_LOAD_CONCURRENCY,
  tagSurfaceLayerMeshes,
} from './surfacePieceLoader'
import {
  alignSurfaceToCellGrid,
  cellHasSurfaceLayer,
  clearSurfaceLayer,
  layerIndexAtY,
  layerYRange,
  refineVoxelPlacement,
  type OreType,
  type TerrainGrid,
  voxelWorldBox,
} from './voxelPlacement'
import { createRockAlbedoMap } from './rockTexture'
import { createIronAlbedoMap, IRON_DARK, IRON_MID } from './ironTexture'
import { createGoldAlbedoMap, GOLD_DARK, GOLD_MID } from './goldTexture'
import { createDiamondAlbedoMap, DIAMOND_MID } from './diamondTexture'
import { createWoodPlankAlbedoMap, WOOD_MID } from './woodTexture'
import {
  BlockBuilder,
  BUILD_BLOCK_DIG_TIME_BASE,
  BUILD_BLOCK_SIZE,
  buildCellAdjacent,
  buildCellFromPoint,
  buildPlacementNormalAgainstBlock,
  buildPlacementNormalFromFace,
  sneakBridgeOutwardNormal,
  supportCellFromTopHit,
  type BuildBlockType,
  type BuildCell,
} from './buildBlocks'
import { PlacedTorchManager } from './placedTorches'
import { PlacedChestManager } from './placedChests'
import { PlacedBedManager } from './placedBeds'
import {
  PlacedBallistaManager,
  type BallistaEjectRequest,
  type BallistaFireRequest,
} from './placedBallistas'
import {
  PlacedCatapultManager,
  type CatapultEjectRequest,
  type CatapultFireRequest,
} from './placedCatapults'
import {
  clearThrownCatapultRocks,
  hasCatapultRockBlasts,
  initCatapultRockBlastLights,
  setCatapultRockBlastLightsEnabled,
  spawnThrownCatapultRock,
  updateThrownCatapultRocks,
  type ThrownCatapultRock,
} from './thrownCatapultRock'
import {
  isSaplingItem,
  PlantedSaplingManager,
  treeGrowthFraction,
  woodFromTree,
} from './plantedSaplings'

interface CellMeta {
  ix: number
  iy: number
  center_x: number
  center_y: number
  file: string
  tri_count: number
  cap_bottom_y: number
  cap_top_y: number
  voxel_top_y?: number
  voxel_layer_mask?: number
  surface_layer_mask?: number
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
  surfaceLayerMask: number
  voxelLayerMask: number
  voxelTopY: number
  /** Subset of layerMask bits that are iron ore instead of dirt. */
  oreLayerMask?: number
  /** Subset of layerMask bits that are gold ore instead of dirt. */
  goldOreLayerMask?: number
  /** Subset of layerMask bits that are diamond ore instead of dirt. */
  diamondOreLayerMask?: number
  instanceIndex: number
  surfaceRoot?: THREE.Object3D
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
  opts?: { roughness?: number; metalness?: number; emissiveIntensity?: number },
) {
  const mat = new THREE.MeshStandardMaterial({
    // Tinted map * brown color crushes albedo; texture already carries the hue.
    color: map ? 0xffffff : color,
    flatShading: true,
    roughness: opts?.roughness ?? 0.88,
    metalness: opts?.metalness ?? 0,
    // Soft floor so faces away from the sun never clip to black (no envMap).
    emissive,
    emissiveIntensity: opts?.emissiveIntensity ?? 0.4,
  })
  if (map) mat.map = map
  mat.customProgramCacheKey = () => (map ? 'tex' : 'flat')
  return mat
}

let visibilityInterval = 0.2
/** Max distance from the camera to start or continue digging. */
const DIG_REACH = 7
/** Must stand this close to open a chest (meters). Dig reach is longer. */
const CHEST_OPEN_REACH = 2.75
/** Catapults are large — allow opening from farther than a chest. */
const CATAPULT_OPEN_REACH = 4.25
/** Auto-close when you walk a bit past open reach. */
const CHEST_OPEN_HOLD_REACH = 3.5
/** Auto-close distance while a catapult hopper is open. */
const CATAPULT_OPEN_HOLD_REACH = 5.25
/** Must stand this close to sleep in a bed (meters). */
const BED_SLEEP_REACH = 2.75
/** Total time lying in bed before waking (seconds). */
const BED_SLEEP_DURATION = 2.6
/** Skip night after lying down this long (seconds). */
const BED_SLEEP_SKIP_AT = 1.15
/** Start the dig ray in front of the camera so close-range / inside-surface shots still hit. */
const DIG_RAY_ORIGIN_OFFSET = 0.15
const _digRayDir = new THREE.Vector3()
const _digRayOrigin = new THREE.Vector3()

const ROCK_DIG_TIME_BASE = 1.35
const TREE_DIG_TIME_BASE = 2.1
const TORCH_DIG_TIME_BASE = 0.55
const CHEST_DIG_TIME_BASE = 1.1
const BED_DIG_TIME_BASE = 1.1
const BALLISTA_DIG_TIME_BASE = 1.35
const CATAPULT_DIG_TIME_BASE = 1.5
const STONE_PER_ROCK = 3
const WOOD_PER_TREE = 5
const LEAVES_PER_SNIP = 1
const SCISSORS_SNIP_INTERVAL = 0.5
const CRYSTAL_BERRY_HEAL = 5
const DIRT_PER_DIG = 8
const IRON_PER_ORE = 4
const GOLD_PER_ORE = 4
const DIAMOND_PER_ORE = 4
const IRON_ORE_DIG_TIME_BASE = 2.2
const GOLD_ORE_DIG_TIME_BASE = 2.4
const DIAMOND_ORE_DIG_TIME_BASE = 2.6

function oreDigTimeBase(oreType: OreType | null | undefined): number | null {
  if (oreType === 'diamond') return DIAMOND_ORE_DIG_TIME_BASE
  if (oreType === 'gold') return GOLD_ORE_DIG_TIME_BASE
  if (oreType === 'iron') return IRON_ORE_DIG_TIME_BASE
  return null
}

function oreMaterialItem(oreType: OreType): 'iron' | 'gold' | 'diamond' {
  return oreType
}

function oreYield(oreType: OreType): number {
  if (oreType === 'diamond') return DIAMOND_PER_ORE
  if (oreType === 'gold') return GOLD_PER_ORE
  return IRON_PER_ORE
}

function cellToCollision(cell: Cell, layerMask = cell.layerMask): TerrainCellCollision {
  return {
    key: cell.key,
    centerX: cell.centerX,
    centerZ: cell.centerZ,
    capBottomY: cell.capBottomY,
    voxelBaseY: cell.voxelBaseY,
    layerMask,
    surfaceLayerMask: cell.surfaceLayerMask,
    bounds: cell.surfaceRoot ? cell.bounds : undefined,
    capTopY: cell.capTopY,
  }
}

/**
 * Pick the surface cell under a chunk-mesh hit by XZ footprint only.
 * Do not fall back to "nearest center" — that mined neighboring columns through walls.
 */
function cellFromChunkSurfaceHit(
  point: THREE.Vector3,
  chunkCells: Cell[],
  cellSize: number,
): Cell | null {
  const half = cellSize * 0.5 + 1e-3
  for (const cell of chunkCells) {
    if ((cell.surfaceLayerMask ?? 0) === 0 && !cell.surfaceRoot) continue
    if (
      Math.abs(cell.centerX - point.x) <= half &&
      Math.abs(cell.centerZ - point.z) <= half
    ) {
      return cell
    }
  }
  return null
}

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
  const digProgressFill = document.getElementById('dig-progress-fill')!
  const loadingOverlay = document.getElementById('loading-overlay')!
  const loadingLabel = loadingOverlay.querySelector('.loading-label')
  const loadingBar = loadingOverlay.querySelector('.loading-bar')
  const loadingBarFill = loadingOverlay.querySelector('.loading-bar-fill') as HTMLElement | null
  const loadingPct = loadingOverlay.querySelector('.loading-pct')

  /** Boot stages: setup → surface GLBs → chunk merge → props → FPS settle. */
  const LOAD_W_SETUP = 0.03
  const LOAD_W_SURFACE = 0.72
  const LOAD_W_BUILD = 0.17
  const LOAD_W_PROPS = 0.05
  const LOAD_W_SETTLE = 0.03
  const BOOT_FLUSH_MS = 20

  let loadingProgress = 0

  const setLoadingLabel = (label: string) => {
    if (loadingLabel) loadingLabel.textContent = label
    info.textContent = label
  }

  const setLoadingProgress = (p: number, label?: string) => {
    loadingProgress = Math.max(0, Math.min(1, p))
    const pct = Math.round(loadingProgress * 100)
    if (label) setLoadingLabel(label)
    if (loadingBarFill) loadingBarFill.style.width = `${pct}%`
    if (loadingBar) loadingBar.setAttribute('aria-valuenow', String(pct))
    if (loadingPct) loadingPct.textContent = `${pct}%`
    digProgressFill.style.setProperty('--dig-deg', `${loadingProgress * 360}deg`)
  }

  const formatEta = (done: number, total: number, startedAt: number) => {
    if (done < 3 || total <= 0) return ''
    const elapsed = performance.now() - startedAt
    const rate = done / Math.max(elapsed, 1)
    const remainMs = (total - done) / rate
    if (!Number.isFinite(remainMs) || remainMs < 400) return ''
    const sec = Math.max(1, Math.ceil(remainMs / 1000))
    return ` · ~${sec}s`
  }

  const showLoadingOverlay = (label = 'Loading…') => {
    document.body.classList.add('world-loading')
    loadingOverlay.hidden = false
    loadingOverlay.setAttribute('aria-busy', 'true')
    setLoadingProgress(0, label)
  }

  const hideLoadingOverlay = () => {
    document.body.classList.remove('world-loading')
    loadingOverlay.hidden = true
    loadingOverlay.setAttribute('aria-busy', 'false')
    digProgressFill.style.setProperty('--dig-deg', '0deg')
  }

  showLoadingOverlay('Loading…')
  setLoadingProgress(0.01, 'Loading world…')

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
  // Scene never moves — disable matrixAutoUpdate so it doesn't set
  // matrixWorldNeedsUpdate every frame (that forces multiplyMatrices down the
  // whole graph, including ~1800 frozen terrain cells).
  // Keep matrixWorldAutoUpdate ON so the renderer still walks children: camera,
  // enemies, viewmodel, etc. Turning it off made RAF report ~60fps while the
  // view matrix froze (felt like 2–10fps).
  scene.matrixAutoUpdate = false
  scene.matrixWorldAutoUpdate = true
  const horizonColor = new THREE.Color(0x6a9ec8)
  scene.background = null
  scene.fog = new THREE.FogExp2(horizonColor, 0.010)
  const sceneFog = scene.fog as THREE.FogExp2

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
  /** After a resolution change, freeze adapt so we don't thrash the drawing buffer. */
  let adaptCooldown = 0
  const ADAPT_COOLDOWN_SEC = 2.5
  let adaptiveResolution: AdaptiveResolutionPolicy = {
    enabled: true,
    floor: 0.5,
    frameMsHigh: 17,
    frameMsLow: 14,
  }
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
  sky.updateMatrix()
  sky.updateMatrixWorld(true)
  sky.matrixAutoUpdate = false

  const skyDecor = createSkyDecor(scene)
  let lastSkyTint = new THREE.Color()
  let lastSunColor = new THREE.Color()
  let shelterBlend = 0
  let shelteredLatch = false
  let outdoorSurfaceYSmooth: number | null = null
  let shelterProbeTimer = 0
  let lastShelterProbeX = Infinity
  let lastShelterProbeZ = 0
  let lastOutdoorSurfaceYSample: number | null = null
  const SHELTER_PROBE_INTERVAL = 0.12
  const SHELTER_PROBE_MOVE_SQ = 0.45 * 0.45
  const _outdoorSunDir = new THREE.Vector3()
  const _caveFogColor = new THREE.Color()

  const skyUniforms = (sky.material as THREE.ShaderMaterial).uniforms
  const sunDirection = sunDirectionFromAngles(0, 0)

  const player = new PlayerController(camera, renderer.domElement)
  const touchControls = new TouchControls(document.getElementById('controls')!)

  // No envMap — hemi + ambient are the only fill for shadowed PBR faces.
  // Keep these strong enough that ground never reads as pitch black in daylight.
  const hemisphereLight = new THREE.HemisphereLight(0xc8dff8, DIRT_MID, 0.62)
  scene.add(hemisphereLight)
  const ambientLight = new THREE.AmbientLight(0xd0dce8, 0.28)
  scene.add(ambientLight)

  const sun = new THREE.DirectionalLight(0xffe0a8, 1.5)
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

  const fill = new THREE.DirectionalLight(0xb8d8ff, 0.34)
  scene.add(fill)
  const fill2 = new THREE.DirectionalLight(0xffe8d0, 0.22)
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
  const enemySpawnRateSlider = document.getElementById(
    'enemy-spawn-rate-slider',
  ) as HTMLInputElement
  const enemySpawnRateValue = document.getElementById('enemy-spawn-rate-value')!
  const enemySpeedSlider = document.getElementById('enemy-speed-slider') as HTMLInputElement
  const enemySpeedValue = document.getElementById('enemy-speed-value')!
  const enemyLightHeightSlider = document.getElementById(
    'enemy-light-height-slider',
  ) as HTMLInputElement
  const enemyLightHeightValue = document.getElementById('enemy-light-height-value')!
  const spiderNestXSlider = document.getElementById('spider-nest-x-slider') as HTMLInputElement
  const spiderNestXValue = document.getElementById('spider-nest-x-value')!
  const spiderNestZSlider = document.getElementById('spider-nest-z-slider') as HTMLInputElement
  const spiderNestZValue = document.getElementById('spider-nest-z-value')!
  const spiderNestRadiusSlider = document.getElementById(
    'spider-nest-radius-slider',
  ) as HTMLInputElement
  const spiderNestRadiusValue = document.getElementById('spider-nest-radius-value')!

  const tuneSliders: TuneSliderElements = {
    gravity: gravitySlider,
    jumpVelocity: jumpVelocitySlider,
    jetpackHold: jetpackHoldSlider,
    moveSpeed: moveSpeedSlider,
    cameraHeight: cameraHeightSlider,
    lookSpeed: lookSpeedSlider,
    digSpeed: digSpeedSlider,
    debrisDivisions: debrisDivisionsSlider,
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
    enemySpawnRate: enemySpawnRateSlider,
    enemySpeed: enemySpeedSlider,
    enemyLightHeight: enemyLightHeightSlider,
    spiderNestOffsetX: spiderNestXSlider,
    spiderNestOffsetZ: spiderNestZSlider,
    spiderNestRadius: spiderNestRadiusSlider,
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
  gravitySlider.addEventListener('input', syncJumpTune)
  jumpVelocitySlider.addEventListener('input', syncJumpTune)
  jetpackHoldSlider.addEventListener('input', syncJumpTune)
  moveSpeedSlider.addEventListener('input', syncMoveTune)
  cameraHeightSlider.addEventListener('input', syncMoveTune)
  lookSpeedSlider.addEventListener('input', syncMoveTune)
  const syncFog = () => {
    const density = fogDensityFromSlider(Number(fogSlider.value))
    sceneFog.density = density
    fogValue.textContent = density.toFixed(3)
  }
  fogSlider.addEventListener('input', syncFog)
  syncJumpTune()
  syncMoveTune()
  syncFog()

  const healthHud = document.getElementById('health-hud')!
  const healthBarFill = document.getElementById('health-bar-fill')!
  const healthValue = document.getElementById('health-value')!
  let playerHealth = PLAYER_MAX_HEALTH
  let playerDead = false
  let deathRespawnTimer = 0

  const syncHealthHud = () => {
    const t = Math.max(0, playerHealth / PLAYER_MAX_HEALTH)
    healthBarFill.style.transform = `scaleX(${t})`
    healthValue.textContent = String(Math.max(0, Math.ceil(playerHealth)))
    const hue = t * 128
    const sat = 68 + t * 14
    const light = 36 + t * 10
    healthBarFill.style.backgroundColor = `hsl(${hue}, ${sat}%, ${light}%)`
    healthBarFill.style.boxShadow =
      t > 0.01 ? `0 0 10px hsla(${hue}, ${sat}%, ${light}%, 0.4)` : 'none'
    healthHud.classList.toggle('low', playerHealth <= PLAYER_MAX_HEALTH * 0.3)
    healthHud.classList.toggle('dead', playerDead)
  }
  syncHealthHud()
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
  const grassMaterial = createTerrainMaterial(GRASS_MID, grassMap)
  // Triplanar sampling removes texture stretching on diagonal surface-cap faces.
  const triplanarScale = DIRT_TEXTURE_REPEAT / terrainWorldUnitsPerTile
  applyTerrainTriplanar(dirtMaterial, triplanarScale)
  applyTerrainTriplanar(grassMaterial, triplanarScale)
  const stoneBreakMaterial = createTerrainMaterial(0x8a8580, undefined, 0x1a1816)
  const woodBreakMaterial = createTerrainMaterial(0x5c3a22, undefined, 0x1a0f08)
  // Keep ore break debris matte — high metalness + no envMap reads as black glass.
  const ironBreakMaterial = createTerrainMaterial(IRON_MID, undefined, IRON_DARK, {
    roughness: 0.55,
    metalness: 0.22,
    emissiveIntensity: 0.28,
  })
  const goldBreakMaterial = createTerrainMaterial(GOLD_MID, undefined, GOLD_DARK, {
    roughness: 0.5,
    metalness: 0.25,
    emissiveIntensity: 0.32,
  })
  const diamondBreakMaterial = createTerrainMaterial(DIAMOND_MID, undefined, 0x1a9890, {
    roughness: 0.42,
    metalness: 0.1,
    emissiveIntensity: 0.45,
  })
  const treeBreakMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 0.98,
    metalness: 0,
    emissive: 0x1a0f08,
    emissiveIntensity: 0.42,
  })
  let rockMap = createRockAlbedoMap()
  rockMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  const stoneBlockMaterial = createTerrainMaterial(0xffffff, rockMap, 0x1a1816)
  applyTerrainTriplanar(stoneBlockMaterial, triplanarScale)
  let ironMap = createIronAlbedoMap()
  ironMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  // Matte ores: no envMap, so high metalness crushed faces to black underground.
  const ironMaterial = createTerrainMaterial(IRON_MID, ironMap, IRON_DARK, {
    roughness: 0.55,
    metalness: 0.22,
    emissiveIntensity: 0.28,
  })
  ironMaterial.userData.terrainEmissiveBase = 0.28
  applyTerrainTriplanar(ironMaterial, triplanarScale)
  let goldMap = createGoldAlbedoMap()
  goldMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  const goldMaterial = createTerrainMaterial(GOLD_MID, goldMap, GOLD_DARK, {
    roughness: 0.5,
    metalness: 0.25,
    emissiveIntensity: 0.32,
  })
  goldMaterial.userData.terrainEmissiveBase = 0.32
  applyTerrainTriplanar(goldMaterial, triplanarScale)
  let diamondMap = createDiamondAlbedoMap()
  // One Minecraft-style framed face per voxel (not the finer dirt tiling).
  diamondMap.repeat.set(1, 1)
  const diamondMaterial = createTerrainMaterial(DIAMOND_MID, diamondMap, 0x1a9890, {
    roughness: 0.42,
    metalness: 0.1,
    emissiveIntensity: 0.45,
  })
  diamondMaterial.userData.terrainEmissiveBase = 0.45
  applyTerrainTriplanar(diamondMaterial, 1 / voxelSize)
  const woodMap = createWoodPlankAlbedoMap()
  woodMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  const woodBlockMaterial = createTerrainMaterial(WOOD_MID, woodMap, 0x1a0f08)
  applyTerrainTriplanar(woodBlockMaterial, triplanarScale)
  const cells = new Map<string, Cell>()
  const surfaceGroup = new THREE.Group()
  // Static container: never moves. matrixAutoUpdate off avoids local recompose;
  // keep matrixWorldAutoUpdate on so children can still bake correct world matrices.
  surfaceGroup.matrixAutoUpdate = false
  const voxelGroup = new THREE.Group()
  terrainRoot.add(voxelGroup)
  terrainRoot.add(surfaceGroup)
  surfaceGroup.updateMatrixWorld(true)

  const gridSpan = gridCenters.length
  const surfaceCells = meta.surface_pieces.cells
  const cellList: Cell[] = []

  for (const cellMeta of Object.values(surfaceCells)) {
    const { ix, iy, center_x: centerX, center_y: centerZ, cap_bottom_y: capBottomY } =
      cellMeta
    const key = cellKey(ix, iy)
    const voxelTopY = cellMeta.voxel_top_y ?? cellMeta.cap_top_y
    const voxelLayerMask = cellMeta.voxel_layer_mask ?? 0
    const surfaceLayerMask = cellMeta.surface_layer_mask ?? 0

    const cell: Cell = {
      key,
      ix,
      iy,
      centerX,
      centerZ,
      capBottomY,
      layerMask: voxelLayerMask,
      voxelLayerMask,
      surfaceLayerMask,
      voxelTopY,
      voxelBaseY: voxelTopY,
      instanceIndex: 0,
      bounds: cellMeta.bounds,
      capTopY: cellMeta.cap_top_y,
    }
    cells.set(key, cell)
    cellList.push(cell)
  }

  const cellGrid: (Cell | undefined)[][] = Array.from({ length: gridSpan }, () =>
    Array(gridSpan),
  )
  for (const cell of cells.values()) {
    cellGrid[cell.ix]![cell.iy] = cell
  }
  const voxelVisibleSet = new Set<Cell>()
  const surfaceVisibleSet = new Set<Cell>()

  const voxelInstancer = new VoxelInstancer(
    dirtMaterial,
    { iron: ironMaterial, gold: goldMaterial, diamond: diamondMaterial },
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
  /** Skip expensive blade scatter until terrain + props finish booting. */
  let grassBladesBootReady = false
  let grassBladeCullRadius = 0

  // Quality-driven cull radii live here; syncGraphics overwrites them.
  const visibilityCtx = {
    cells,
    cellGrid,
    gridMinX,
    gridMinZ,
    cellSize,
    gridSpan,
    surfaceChunks,
    voxelInstancer,
    voxelSize,
    layerCount: voxelLayers,
    chunkRadius: DEFAULT_CHUNK_RADIUS,
    voxelRadius: DEFAULT_VOXEL_RADIUS,
    voxelVisibleSet,
    surfaceVisibleSet,
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
  // Unmineable bedrock floor — dig picks skip it, but build placement can use it.
  base.userData.skipDigPick = true
  base.userData.buildFloor = true
  terrainRoot.add(base)
  terrainRoot.matrixAutoUpdate = false
  terrainRoot.updateMatrixWorld(true)

  const digBreakFx = new DigBreakEffect(terrainRoot)
  const digCrackStages = createDigCrackStageTextures()
  const digCrackOverlay = new DigCrackOverlay(terrainRoot, digCrackStages)
  const digBlockOutline = new DigBlockOutline(terrainRoot)

  const collisionWorld = new CollisionWorld()
  collisionWorld.setGridCell(cellSize)
  collisionWorld.setMaxLayers(voxelLayers)
  surfaceChunks.setDigClipParams(voxelSize, voxelLayers)
  collisionWorld.setMeshGroundTargets(surfaceGroup, surfaceChunks.group)

  // Capsule-vs-triangle terrain collider (caves, overhangs, arbitrary slopes).
  const capsuleCollider = new CapsuleCollider()
  capsuleCollider.setTargets(surfaceChunks.group, surfaceGroup)
  player.setTerrainCollider(capsuleCollider)

  const applyDayNight = (elapsedSec: number, dt: number) => {
    const phase = cyclePhase(elapsedSec)
    const cycleT = cycleFactor(elapsedSec)

    const p = player.object.position
    // Sky-down shelter probe is expensive (all nearby chunk BVHs). Reuse the last
    // sample unless the player moved or the heartbeat elapsed — hysteresis already
    // absorbs small vertical jitter between samples.
    shelterProbeTimer += dt
    const shelterMoved =
      (p.x - lastShelterProbeX) * (p.x - lastShelterProbeX) +
        (p.z - lastShelterProbeZ) * (p.z - lastShelterProbeZ) >
      SHELTER_PROBE_MOVE_SQ
    if (
      shelterProbeTimer >= SHELTER_PROBE_INTERVAL ||
      shelterMoved ||
      !Number.isFinite(lastShelterProbeX)
    ) {
      shelterProbeTimer = 0
      lastShelterProbeX = p.x
      lastShelterProbeZ = p.z
      lastOutdoorSurfaceYSample = capsuleCollider.raycastDownY(
        p.x,
        p.z,
        OUTDOOR_RAY_ORIGIN_Y,
        OUTDOOR_RAY_ORIGIN_Y,
      )
    }
    const outdoorSurfaceY = lastOutdoorSurfaceYSample
    if (outdoorSurfaceY !== null) {
      outdoorSurfaceYSmooth =
        outdoorSurfaceYSmooth === null
          ? outdoorSurfaceY
          : THREE.MathUtils.damp(outdoorSurfaceYSmooth, outdoorSurfaceY, 10, dt)
    } else {
      outdoorSurfaceYSmooth = null
    }
    shelteredLatch = updateShelteredFromSky(
      p.y,
      outdoorSurfaceYSmooth,
      shelteredLatch,
    )
    shelterBlend = THREE.MathUtils.damp(shelterBlend, shelteredLatch ? 1 : 0, 2.2, dt)

    const exposure = blendExposure(cycleT, shelterBlend)
    renderer.toneMappingExposure = exposure
    const night = nightStrength(cycleT)
    // Don't crush world lights with exposure at night — sky is black from scattering,
    // but the ground still needs moonlight. Day keeps lights near full strength.
    const exposureLightScale = THREE.MathUtils.lerp(
      Math.max(0.88, exposure / DEFAULT_BRIGHTNESS),
      0.95,
      night,
    )
    const fillScale = exposureLightScale * graphicsLightScale
    // Medium+: darken sheltered digs so torch PointLights matter. Potato/Low keep
    // the bright cave wash (no local lights).
    const cave = caveDarknessScale(
      shelterBlend,
      pointGlowsEnabledFromT(qualityTFromSlider(Number(graphicsSlider.value))),
    )

    const { elevationDeg, azimuthDeg } = sunAnglesFromPhase(phase)
    sunDirectionFromAngles(elevationDeg, azimuthDeg, _outdoorSunDir)
    blendSunDirection(_outdoorSunDir, shelterBlend, sunDirection)
    skyUniforms.sunPosition.value.copy(sunDirection)

    const atmo = blendSkyAtmosphere(phase, cycleT, shelterBlend)
    skyUniforms.turbidity.value = atmo.turbidity
    skyUniforms.rayleigh.value = atmo.rayleigh
    skyUniforms.mieCoefficient.value = atmo.mieCoefficient
    skyUniforms.mieDirectionalG.value = atmo.mieDirectionalG

    horizonColor.copy(atmo.fogColor)
    sceneFog.color.copy(atmo.fogColor)
    if (cave.dim > 0) {
      horizonColor.lerp(_caveFogColor.setHex(CAVE_FOG_HEX), cave.dim * 0.88)
      sceneFog.color.copy(horizonColor)
    }

    sun.color.copy(atmo.sunColor)
    lastSunColor.copy(atmo.sunColor)
    lastSkyTint.copy(atmo.hemisphereSky)
    // Sky tint goes black at night; hemi light uses moonlight ambient so ground stays lit.
    hemisphereLight.color.copy(atmo.ambientColor)
    hemisphereLight.groundColor.copy(atmo.hemisphereGround)
    ambientLight.color.copy(atmo.ambientColor)
    fill.color.copy(atmo.fillColor)
    fill2.color.copy(atmo.fill2Color)

    // Soft moonlight on the world — sky stays black via fog/Sky scattering.
    // Night ramps hemi/ambient: the sun is below the horizon so top faces
    // only get bounce light.
    hemisphereLight.intensity =
      0.62 * fillScale * THREE.MathUtils.lerp(1, 1.85, night) * cave.fillMul
    ambientLight.intensity =
      0.28 * fillScale * THREE.MathUtils.lerp(1, 2.1, night) * cave.fillMul
    fill.intensity =
      0.34 * fillScale * THREE.MathUtils.lerp(1, 1.35, night) * cave.fillMul
    fill2.intensity =
      0.22 * fillScale * THREE.MathUtils.lerp(1, 1.25, night) * cave.fillMul
    sun.intensity =
      1.5 * fillScale * THREE.MathUtils.lerp(1, 0.55, night) * cave.sunMul

    // Night boosts terrain self-glow; day keeps full base (never dim below 1).
    // Medium+ caves pull emissive down so dirt walls don't self-light the tunnel.
    const terrainMatte = THREE.MathUtils.lerp(1, 1.85, night) * cave.emissiveMul
    for (const mat of [dirtMaterial, grassMaterial]) {
      const base =
        (mat.userData.terrainEmissiveBase as number | undefined) ?? mat.emissiveIntensity
      mat.userData.terrainEmissiveBase = base
      mat.emissiveIntensity = base * terrainMatte
      mat.roughness = THREE.MathUtils.lerp(0.9, 0.86, night)
    }
    // Ores keep a higher self-glow floor underground so veins stay readable
    // when global fill is crushed for torch gameplay.
    const oreCaveMul = THREE.MathUtils.lerp(1, 0.62, cave.dim)
    const oreMatte = THREE.MathUtils.lerp(1, 1.55, night) * oreCaveMul
    for (const mat of [ironMaterial, goldMaterial, diamondMaterial]) {
      const base =
        (mat.userData.terrainEmissiveBase as number | undefined) ?? mat.emissiveIntensity
      mat.userData.terrainEmissiveBase = base
      mat.emissiveIntensity = base * oreMatte
    }
  }
  applyDayNight(DAY_START_ELAPSED_SEC, 0)

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
    // Base stays projectile-solid; trees/rocks use mesh hits for arrows/spears so
    // canopy walk-decks don't catch shots in empty air beside the leaves.
    collisionWorld.clearStaticObjects()
    collisionWorld.addStaticFromObject(base)
    for (const tree of placedTrees) {
      collisionWorld.addStaticFromObject(tree, 0.01, { projectileSolid: false })
    }
    for (const rock of placedRocks) {
      collisionWorld.addStaticFromObject(rock, 0.01, { projectileSolid: false })
    }
    syncCollisionWorld()
    // Shadow casters changed; force one shadow re-render even if the player is still.
    requestShadowUpdate()
  }

  /** Append one prop's AABBs without rebuilding every tree/rock (avoids plant hitch). */
  const addPropCollision = (root: THREE.Object3D, opts?: { shadow?: boolean }) => {
    collisionWorld.addStaticFromObject(root, 0.01, { projectileSolid: false })
    syncCollisionWorld()
    if (opts?.shadow !== false) requestShadowUpdate()
  }

  const patchCellCollision = (cell: Cell, layerMask = cell.layerMask) => {
    collisionWorld.patchCell(cellToCollision(cell, layerMask), voxelSize)
  }

  /** Place voxel columns for occupied cells; patch collision incrementally. */
  const syncVoxelPlacement = (targets?: readonly Cell[]) => {
    const list =
      targets ??
      cellList.filter(
        (c) => c.surfaceRoot || c.layerMask !== 0 || c.surfaceLayerMask !== 0,
      )
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

    if (target.kind === 'surface' && target.cell && target.layer !== undefined) {
      voxelBoundsBox(target.cell, target.layer, out)
      return !out.isEmpty()
    }

    if (target.kind === 'surface' && target.cell?.surfaceRoot) {
      ensureMatrixWorld(target.cell.surfaceRoot)
      out.setFromObject(target.cell.surfaceRoot)
      return !out.isEmpty()
    }

    if (target.visualRoot) {
      ensureMatrixWorld(target.visualRoot)
      out.setFromObject(target.visualRoot)
      return !out.isEmpty()
    }

    return false
  }

  function topSlopeThresholdFromSlider(sliderValue: number) {
    return THREE.MathUtils.clamp(sliderValue / 100, 0, 1)
  }

  surfaceChunks.setTopSlopeThreshold(
    topSlopeThresholdFromSlider(Number(grassGreenSlopeSlider.value)),
  )

  const spawnCellMeta = pickSpawnCell(surfaceCells)
  const spawnIx = spawnCellMeta?.ix ?? Math.floor(gridSpan / 2)
  const spawnIy = spawnCellMeta?.iy ?? Math.floor(gridSpan / 2)
  const spawnX = spawnCellMeta?.center_x ?? gridCenters[spawnIx]
  const spawnZ = spawnCellMeta?.center_y ?? gridCenters[spawnIy]
  const spawnFallbackY =
    spawnCellMeta?.cap_top_y ?? seamY + (meta.voxels.surface_cap_height ?? voxelSize) + 1
  /** Mutable respawn — set by sleeping in a bed; defaults to world spawn. */
  let respawnX = spawnX
  let respawnZ = spawnZ
  let respawnFallbackY = spawnFallbackY

  const treeTemplatePromise = loadTreeModel('/assets/tree.glb')
  const treeBerriesTemplatePromise = loadTreeBerriesModel('/assets/tree berries.glb')
  const rockTemplatesPromise = loadRockModels()
  const enemyTemplatePromise = loadEnemyTemplate()

  info.textContent = 'Loading terrain…'
  setLoadingProgress(LOAD_W_SETUP, 'Loading terrain…')

  const gltfLoader = new GLTFLoader()
  const allSurfaceMetas = Object.values(meta.surface_pieces.cells).filter(
    (m) => (m.surface_layer_mask ?? 0) !== 0 || (m.tri_count ?? 0) > 0,
  )
  const sortedSurfaceMetas = sortSurfaceCellsByDistance(allSurfaceMetas, spawnX, spawnZ)

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

  const loadSurfaceBatch = (
    metas: CellMeta[],
    onProgress?: (done: number, total: number) => void,
  ) =>
    runLoadPool(
      metas,
      SURFACE_LOAD_CONCURRENCY,
      (cellMeta) => loadSurfaceCell(cellMeta, surfaceLoadCtx),
      onProgress,
    )

  const surfaceLoadStartedAt = performance.now()
  await loadSurfaceBatch(sortedSurfaceMetas, (done, total) => {
    const t = total > 0 ? done / total : 1
    const eta = formatEta(done, total, surfaceLoadStartedAt)
    setLoadingProgress(
      LOAD_W_SETUP + t * LOAD_W_SURFACE,
      `Loading terrain… ${done}/${total}${eta}`,
    )
  })
  setLoadingProgress(LOAD_W_SETUP + LOAD_W_SURFACE, 'Building terrain…')
  const buildStartedAt = performance.now()
  await surfaceChunks.flushDirtyChunkedAsync(BOOT_FLUSH_MS, (done, total) => {
    const t = total > 0 ? done / total : 1
    const eta = formatEta(done, total, buildStartedAt)
    setLoadingProgress(
      LOAD_W_SETUP + LOAD_W_SURFACE + t * LOAD_W_BUILD,
      `Building terrain… ${done}/${total}${eta}`,
    )
  })
  const loadedSurfaces = sortedSurfaceMetas
    .map((m) => cells.get(cellKey(m.ix, m.iy)))
    .filter((c): c is Cell => c?.surfaceRoot !== undefined)
  syncVoxelPlacement(loadedSurfaces)

  player.spawnAt(spawnX, spawnZ, spawnFallbackY)
  player.syncCamera()
  setLoadingProgress(LOAD_W_SETUP + LOAD_W_SURFACE + LOAD_W_BUILD, 'Preparing world…')

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
    if (!cell.surfaceRoot) return

    const previous = cell.surfaceRoot
    // Clone the live root (materials re-applied below). Avoids keeping a second
    // pristine copy of every surface GLB in memory for the whole session.
    const root = previous.clone()
    previous.parent?.remove(previous)
    disposeSurfaceGeometries(previous)

    tagSurfaceLayerMeshes(root)
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
    root.updateMatrixWorld(true)
    surfaceGroup.add(root)
    cell.surfaceRoot = root
    alignSurfaceToCellGrid(cell, terrainGrid, voxelSize)
    // Static once rebuilt — freeze the subtree so it costs nothing per frame.
    freezeSubtreeMatrices(root)
    surfaceChunks.markDirtyForCell(cell)
  }

  const refreshSurfaceGrassSlope = () => {
    const gen = ++grassSlopeRefreshGen
    const topSlopeThreshold = topSlopeThresholdFromSlider(
      Number(grassGreenSlopeSlider.value),
    )
    // Chunk merge reclassifies by this threshold (world-consistent across borders).
    surfaceChunks.setTopSlopeThreshold(topSlopeThreshold)

    const pending: Cell[] = []
    for (const cell of cells.values()) {
      if (cell.surfaceRoot) pending.push(cell)
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

  const enemiesGroup = new THREE.Group()
  scene.add(enemiesGroup)
  const spidersGroup = new THREE.Group()
  scene.add(spidersGroup)
  const spiderNestBeacon = createSpiderNestBeacon(scene)
  const projectilesGroup = new THREE.Group()
  scene.add(projectilesGroup)
  const thrownSpears: ThrownSpear[] = []
  const thrownArrows: ThrownArrow[] = []
  const thrownOrbs: ThrownOrb[] = []
  let spearThrowCooldown = 0
  let spearThrowPending = false
  let spearThrowHeld = false
  const SPEAR_THROW_RELEASE = 0.4
  let orbThrowCooldown = 0
  let orbThrowPending = false
  let orbThrowHeld = false
  let pendingOrbKind: ThrownOrbKind = 'damage'
  const ORB_THROW_RELEASE = 0.4
  let scissorsSnipHeld = false
  let scissorsSnipTimer = 0
  let bowDrawHeld = false
  let bowDrawT = 0
  let bowFireCooldown = 0
  let bowZoomHeld = false
  let bowFov = BOW_BASE_FOV
  const enemies: EnemyInstance[] = []
  const spiders: SpiderInstance[] = []
  const spiderSpawnTimer = { value: 0 }
  let enemyTemplate: Awaited<ReturnType<typeof loadEnemyTemplate>> | undefined
  let enemySpawnTimer = 0
  let nightActive = false
  let worldTimeSec = DAY_START_ELAPSED_SEC
  let sleeping = false
  let sleepTimer = 0
  let sleepSkippedNight = false
  let sleepBedId: string | null = null
  const _sleepCam = new THREE.Vector3()
  const _wakePos = new THREE.Vector3()
  /** Assigned after PlacedTorchManager construction — syncGraphics may run first. */
  let placedTorches!: PlacedTorchManager
  let placedChests!: PlacedChestManager
  let placedBeds!: PlacedBedManager
  let placedBallistas!: PlacedBallistaManager
  let placedCatapults!: PlacedCatapultManager
  let lastEnemyLightNight = -1
  const ballistaFires: BallistaFireRequest[] = []
  const ballistaEjects: BallistaEjectRequest[] = []
  const catapultFires: CatapultFireRequest[] = []
  const catapultEjects: CatapultEjectRequest[] = []
  const thrownCatapultRocks: ThrownCatapultRock[] = []

  const enemyCountHud = document.getElementById('enemy-count-hud')!
  const enemyCountValue = document.getElementById('enemy-count-value')!
  let lastEnemyCountShown = -1
  const syncEnemyCountHud = () => {
    const n = enemies.length
    if (n === lastEnemyCountShown) return
    lastEnemyCountShown = n
    enemyCountValue.textContent = String(n)
    enemyCountHud.hidden = n === 0
  }

  const rockGround: RockGroundTargets = {
    surface: surfaceGroup,
    chunkRoot: surfaceChunks.group,
  }
  const enemyOrbDrops = new EnemyOrbDrops(scene)
  enemyOrbDrops.setCollisionWorld(collisionWorld)
  const crystalBerryDrops = new CrystalBerryDrops(scene)
  crystalBerryDrops.setCollisionWorld(collisionWorld)
  crystalBerryDrops.setOnCollected((count) => {
    info.textContent =
      count === 1
        ? 'Picked up crystal berry'
        : `Picked up ${count} crystal berries`
  })
  const groundItems = new GroundItems(scene)
  groundItems.setCollisionWorld(collisionWorld)
  const _dropForward = new THREE.Vector3()

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
    // Enemies are also excluded: skinned casters dominate Ultra shadow cost in fights.
    shadowRoots: [treesGroup, rocksGroup],
  }

  const syncGrassTuftClusterLabel = () => {
    grassTuftClusterValue.textContent = `${grassTuftClusterSlider.value}%`
  }

  const refreshGrassBlades = () => {
    if (!grassBladesBootReady) {
      surfaceChunks.setGrassBlades(false, 0, 0)
      return
    }
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
    digBlockOutline.setEnabled(!result.potatoMode)
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
    adaptiveResolution = result.adaptiveResolution
    adaptivePixelScale = 1
    adaptCooldown = ADAPT_COOLDOWN_SEC
    visibilityInterval = result.visibilityInterval
    commitPixelRatio()
    visibilityCtx.chunkRadius = result.chunkRadius
    visibilityCtx.voxelRadius = result.voxelRadius
    refreshVisibilityNow()
    requestShadowUpdate()

    // Potato/Low: no berry / torch / enemy PointLights (sun+hemi+ambient only).
    // Medium+: restore the fixed pools. Crossing the boundary recompiles once.
    const glows = result.pointGlowsEnabled
    setBerryGlowEnabled(glows, treesGroup)
    setEnemyPointLightsQualityEnabled(glows)
    placedTorches?.setPointLightsEnabled(glows)
    setOrbBlastLightsEnabled(glows)
    setCatapultRockBlastLightsEnabled(glows)
    lastEnemyLightNight = -1
    {
      const night = nightStrength(cycleFactor(worldTimeSec))
      if (enemyTemplate) applyEnemyLightDayNightVisual(enemyTemplate, night)
      for (const enemy of enemies) {
        if (enemy.innerLight) applyEnemyLightDayNight(enemy.innerLight, night)
      }
    }
    applyDayNight(worldTimeSec, 0)
  }
  const scheduleGraphics = () => {
    const t = qualityTFromSlider(Number(graphicsSlider.value))
    graphicsValue.textContent = qualityLabel(t)
    if (graphicsDebounce) clearTimeout(graphicsDebounce)
    graphicsDebounce = setTimeout(() => requestAnimationFrame(syncGraphics), 250)
  }
  graphicsSlider.addEventListener('input', scheduleGraphics)
  graphicsSlider.addEventListener('change', () => {
    if (graphicsDebounce) clearTimeout(graphicsDebounce)
    graphicsDebounce = undefined
    requestAnimationFrame(syncGraphics)
  })
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
    const kept: THREE.Group[] = []
    for (const tree of placedTrees) {
      if (tree.userData.isPlanted) {
        kept.push(tree)
        continue
      }
      releaseBerryGlowLight(tree)
      treesGroup.remove(tree)
    }
    placedTrees = kept
    refreshBerryGlowLights(treesGroup)
  }

  let treeTemplate: Awaited<ReturnType<typeof loadTreeModel>> | undefined
  let treeBerriesTemplate: Awaited<ReturnType<typeof loadTreeBerriesModel>> | undefined

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
    const worldTrees = placeTrees(
      treeTemplate,
      treePlacements,
      treesGroup,
      treeBerriesTemplate,
    )
    // World trees never move after placement — freeze their matrices so the renderer
    // skips recomposing every trunk/foliage mesh each frame. Planted saplings stay live.
    for (const tree of worldTrees) {
      tree.updateMatrixWorld(true)
      freezeSubtreeMatrices(tree)
    }
    placedTrees.push(...worldTrees)
    setBerryGlowEnabled(
      pointGlowsEnabledFromT(qualityTFromSlider(Number(graphicsSlider.value))),
      treesGroup,
    )
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

  const enemyLightHeightOffset = () =>
    enemyLightHeightOffsetFromSlider(Number(enemyLightHeightSlider.value))

  const getEnemyDeathContext = (): EnemyDeathContext | undefined => {
    if (!enemyTemplate) return undefined
    return {
      parent: enemiesGroup,
      enemies,
      template: enemyTemplate,
      barParent: enemiesGroup,
      groundTargets: rockGround,
      lightHeightOffset: enemyLightHeightOffset(),
      onOrbBurst: (x, y, z) => enemyOrbDrops.spawnBurst(x, y, z),
      collisionWorld,
    }
  }

  const getSpiderDeathContext = (): SpiderDeathContext => ({
    parent: spidersGroup,
    spiders,
    onChipDrop: (x, y, z) => {
      groundItems.spawnAt(
        'computer_chip',
        1,
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(
          (Math.random() - 0.5) * 2.4,
          2.4 + Math.random() * 1.6,
          (Math.random() - 0.5) * 2.4,
        ),
        0.85,
      )
    },
  })

  const getSpiderNestParams = () => {
    const sx = Number(spiderNestXSlider.value)
    const sz = Number(spiderNestZSlider.value)
    // Slider steps can't hit every world meter exactly — snap the saved defaults.
    return {
      centerX: sx === 19 ? SPIDER_NEST_CENTER_X : spiderNestWorldFromSlider(sx),
      centerZ: sz === 41 ? SPIDER_NEST_CENTER_Z : spiderNestWorldFromSlider(sz),
      radius: spiderNestRadiusFromSlider(Number(spiderNestRadiusSlider.value)),
    }
  }

  const refreshSpiderNestBeacon = () => {
    const nest = getSpiderNestParams()
    updateSpiderNestBeacon(
      spiderNestBeacon,
      nest,
      rockGround,
      collisionWorld,
      player.object.position.y,
    )
  }

  const spawnEnemyNearby = () => {
    if (!enemyTemplate) {
      info.textContent = 'Enemy not loaded yet'
      return
    }
    const p = player.object.position
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 2.5 + Math.random() * 4
      const x = p.x + Math.cos(angle) * dist
      const z = p.z + Math.sin(angle) * dist
      const gy = resolveEnemyGroundY(x, z, rockGround, collisionWorld, p.y)
      if (gy === null) continue
      const tier = rollEnemySpawnTier()
      const enemy = createEnemy(
        enemyTemplate,
        x,
        gy,
        z,
        enemiesGroup,
        enemiesGroup,
        { tier },
      )
      applyEnemyLightHeight(enemy.visual, enemyLightHeightOffset())
      if (enemy.innerLight) {
        applyEnemyLightDayNight(
          enemy.innerLight,
          nightStrength(cycleFactor(worldTimeSec)),
        )
      }
      enemies.push(enemy)
      syncEnemyCountHud()
      info.textContent =
        tier === 'huge'
          ? 'Spawned huge enemy'
          : tier === 'big'
            ? 'Spawned big enemy'
            : 'Spawned enemy'
      return
    }
    info.textContent = 'No ground nearby to spawn'
  }

  const applyEnemyLightHeightAll = () => {
    const offset = enemyLightHeightOffset()
    if (enemyTemplate) applyEnemyLightHeight(enemyTemplate, offset)
    for (const enemy of enemies) applyEnemyLightHeight(enemy.visual, offset)
  }

  const applyEnemyLightDayNightAll = (night: number) => {
    // Skip when night factor barely moved — avoids per-frame light/material churn.
    if (Math.abs(night - lastEnemyLightNight) < 0.02 && lastEnemyLightNight >= 0) return
    lastEnemyLightNight = night
    if (enemyTemplate) applyEnemyLightDayNightVisual(enemyTemplate, night)
    for (const enemy of enemies) {
      if (enemy.innerLight) applyEnemyLightDayNight(enemy.innerLight, night)
    }
    enemyOrbDrops.setNightStrength(night)
  }

  const syncEnemyTuneLabels = () => {
    const spawnRate = Number(enemySpawnRateSlider.value)
    const speed = Number(enemySpeedSlider.value)
    enemySpawnRateValue.textContent = `${enemySpawnIntervalFromSlider(spawnRate).toFixed(1)}s`
    enemySpeedValue.textContent = enemyCrawlSpeedFromSlider(speed).toFixed(2)
    const lightY = enemyLightHeightOffset()
    enemyLightHeightValue.textContent =
      (lightY >= 0 ? '+' : '') + lightY.toFixed(2)
  }

  const syncSpiderNestTuneLabels = () => {
    const nest = getSpiderNestParams()
    spiderNestXValue.textContent = nest.centerX.toFixed(0)
    spiderNestZValue.textContent = nest.centerZ.toFixed(0)
    spiderNestRadiusValue.textContent = `${nest.radius.toFixed(1)}m`
    spiderNestXSlider.title = `Nest world X ${nest.centerX.toFixed(1)}. Spawns every ${SPIDER_SPAWN_INTERVAL}s when within ${SPIDER_NEST_ACTIVATION_RANGE}m, max ${SPIDER_MAX_ALIVE}.`
    spiderNestZSlider.title = `Nest world Z ${nest.centerZ.toFixed(1)}.`
    spiderNestRadiusSlider.title = `Spawn circle radius ${nest.radius.toFixed(1)}m — spiders appear randomly inside the glowing ring.`
    refreshSpiderNestBeacon()
  }

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
    // Rocks only move while falling; freeze once placed so they don't ride the
    // per-frame scene matrix walk. updateRocksPhysics thaws unsettled rocks.
    for (const rock of placedRocks) {
      rock.updateMatrixWorld(true)
      freezeSubtreeMatrices(rock)
    }
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
  enemySpawnRateSlider.addEventListener('input', syncEnemyTuneLabels)
  enemySpeedSlider.addEventListener('input', syncEnemyTuneLabels)
  enemyLightHeightSlider.addEventListener('input', () => {
    applyEnemyLightHeightAll()
    syncEnemyTuneLabels()
  })
  spiderNestXSlider.addEventListener('input', syncSpiderNestTuneLabels)
  spiderNestZSlider.addEventListener('input', syncSpiderNestTuneLabels)
  spiderNestRadiusSlider.addEventListener('input', syncSpiderNestTuneLabels)
  syncTreeTuneLabels()
  syncRockTuneLabels()
  syncEnemyTuneLabels()
  syncSpiderNestTuneLabels()

  /** Finish models + props after terrain is fully built (still under the loading overlay). */
  const finishWorldPropsLoad = async () => {
    try {
      setLoadingProgress(
        LOAD_W_SETUP + LOAD_W_SURFACE + LOAD_W_BUILD + LOAD_W_PROPS * 0.2,
        'Loading models…',
      )
      const [trees, berries, rocks, enemyTpl] = await Promise.all([
        treeTemplatePromise,
        treeBerriesTemplatePromise,
        rockTemplatesPromise,
        enemyTemplatePromise,
      ])
      treeTemplate = trees
      treeBerriesTemplate = berries
      plantedSaplings.setTemplates(trees, berries)
      rockTemplates = rocks
      enemyTemplate = enemyTpl
      prewarmEnemyVisualPool(enemyTpl)
      enemyOrbDrops.prewarm(4)
      applyEnemyLightHeightAll()
      setLoadingProgress(
        LOAD_W_SETUP + LOAD_W_SURFACE + LOAD_W_BUILD + LOAD_W_PROPS * 0.55,
        'Placing trees & rocks…',
      )
      respawnTrees()
      respawnRocks()
      grassBladesBootReady = true
      refreshGrassBlades()
      setLoadingProgress(
        LOAD_W_SETUP + LOAD_W_SURFACE + LOAD_W_BUILD + LOAD_W_PROPS,
        'Warming up…',
      )
    } catch (err) {
      console.error('World props load failed', err)
      setLoadingProgress(
        LOAD_W_SETUP + LOAD_W_SURFACE + LOAD_W_BUILD + LOAD_W_PROPS,
        'Warming up…',
      )
    }
  }

  const inventory = new Inventory()
  enemyOrbDrops.setInventory(inventory)
  crystalBerryDrops.setInventory(inventory)
  groundItems.setInventory(inventory)
  inventory.setOnDropCursor((item, count, durability) => {
    camera.getWorldDirection(_dropForward)
    groundItems.spawnFromPlayer(item, count, player.object.position, _dropForward, durability)
  })

  const dropInventoryOnDeath = () => {
    const stacks = inventory.takeAllStacks()
    if (stacks.length === 0) return
    groundItems.spawnDeathScatter(stacks, player.object.position)
  }

  const beginPlayerDeath = () => {
    if (playerDead) return
    playerDead = true
    deathRespawnTimer = 2.4
    if (sleeping) {
      sleeping = false
      sleepTimer = 0
      sleepSkippedNight = false
      sleepBedId = null
      if (player.isLyingDown()) {
        player.getUp(respawnX, respawnZ, respawnFallbackY)
      }
    }
    if (inventory.isPanelOpen()) inventory.closePanel()
    dropInventoryOnDeath()
    syncHealthHud()
    info.textContent = 'You died — items dropped nearby'
  }

  const respawnPlayer = () => {
    playerDead = false
    deathRespawnTimer = 0
    playerHealth = PLAYER_MAX_HEALTH
    player.spawnAt(respawnX, respawnZ, respawnFallbackY)
    syncHealthHud()
    info.textContent = 'Respawned'
  }

  // Player-placed dirt cubes (2.5 m). Dirt sides use terrain dirt; top uses grass.
  const blockBuilder = new BlockBuilder(
    {
      dirt: dirtMaterial,
      wood: woodBlockMaterial,
      stone: stoneBlockMaterial,
      iron: ironMaterial,
      gold: goldMaterial,
      diamond: diamondMaterial,
    },
    grassMaterial,
  )
  scene.add(blockBuilder.group)
  placedTorches = new PlacedTorchManager()
  scene.add(placedTorches.group)
  placedChests = new PlacedChestManager()
  scene.add(placedChests.group)
  placedBeds = new PlacedBedManager()
  scene.add(placedBeds.group)
  placedBallistas = new PlacedBallistaManager()
  scene.add(placedBallistas.group)
  placedCatapults = new PlacedCatapultManager()
  scene.add(placedCatapults.group)
  // Fixed berry lights from day one — planting must not change NUM_POINT_LIGHTS
  // while Medium+ is active. Potato/Low hide the pools via syncGraphics.
  initBerryGlowLightPool(scene)
  initOrbBlastLightPool(scene)
  initCatapultRockBlastLights(scene)
  {
    const glows = pointGlowsEnabledFromT(
      qualityTFromSlider(Number(graphicsSlider.value)),
    )
    setBerryGlowEnabled(glows, treesGroup)
    setEnemyPointLightsQualityEnabled(glows)
    placedTorches.setPointLightsEnabled(glows)
    setOrbBlastLightsEnabled(glows)
    setCatapultRockBlastLightsEnabled(glows)
  }
  const plantedSaplings = new PlantedSaplingManager()
  scene.add(plantedSaplings.ghost)
  const _buildBox = new THREE.Box3()
  const _torchPos = new THREE.Vector3()
  const _torchNormal = new THREE.Vector3()
  const _chestPos = new THREE.Vector3()
  const _chestNormal = new THREE.Vector3()
  const _bedPos = new THREE.Vector3()
  const _bedNormal = new THREE.Vector3()
  const _ballistaPos = new THREE.Vector3()
  const _ballistaNormal = new THREE.Vector3()
  const _catapultPos = new THREE.Vector3()
  const _catapultNormal = new THREE.Vector3()
  const _saplingPos = new THREE.Vector3()
  const _saplingNormal = new THREE.Vector3()
  const _buildNormal = new THREE.Vector3()
  const _bridgeNormal = new THREE.Vector3()
  const _supportCell: Pick<BuildCell, 'gx' | 'gy' | 'gz'> = { gx: 0, gy: 0, gz: 0 }
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
      : type === 'iron'
        ? ironMaterial
        : type === 'gold'
          ? goldMaterial
          : type === 'diamond'
            ? diamondMaterial
            : type === 'wood'
              ? woodBlockMaterial
              : dirtMaterial

  /** Cell to place into for the current aim, or null when no valid surface is hit. */
  function aimedBuildCell(type: BuildBlockType): BuildCell | null {
    const hit = pickBuildHit()
    if (!hit || !hit.face) return null

    let support: Pick<BuildCell, 'gx' | 'gy' | 'gz'> | null = null
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
        support = placed
        buildCellAdjacent(placed, _buildNormal, _buildCell, type)
      }
    }

    if (!support) {
      buildPlacementNormalFromFace(
        hit.face.normal,
        hit.object.matrixWorld,
        _digRayDir,
        _buildNormal,
      )
      buildCellFromPoint(hit.point, _buildNormal, type, _buildCell)
    }

    // Sneak at a ledge: when aiming at the top near the brink of the block you're
    // on (or a stack that would clip you), place outward like Minecraft bridging.
    if (input.sneak) {
      const from = support ?? supportCellFromTopHit(hit.point, _supportCell)
      const bridgeDir = sneakBridgeOutwardNormal(
        hit.point,
        _buildNormal,
        _digRayDir,
        _bridgeNormal,
      )
      if (
        bridgeDir &&
        (buildCellBlocksPlayer(_buildCell) || playerStandingOnSupport(from))
      ) {
        buildCellAdjacent(from, bridgeDir, _buildCell, type)
      }
    }

    return _buildCell
  }

  /** True when the player's feet are still supported by this build/terrain cell. */
  function playerStandingOnSupport(cell: Pick<BuildCell, 'gx' | 'gy' | 'gz'>) {
    const p = player.object.position
    const minX = cell.gx * BUILD_BLOCK_SIZE
    const maxX = minX + BUILD_BLOCK_SIZE
    const minZ = cell.gz * BUILD_BLOCK_SIZE
    const maxZ = minZ + BUILD_BLOCK_SIZE
    const minY = cell.gy * BUILD_BLOCK_SIZE
    const maxY = minY + BUILD_BLOCK_SIZE
    if (p.x + PLAYER_RADIUS < minX || p.x - PLAYER_RADIUS > maxX) return false
    if (p.z + PLAYER_RADIUS < minZ || p.z - PLAYER_RADIUS > maxZ) return false
    // Build-block tops sit on the cell max; terrain can land mid-cell.
    return p.y >= minY - 0.15 && p.y <= maxY + 0.35
  }

  /**
   * Refuse placement when the block volume overlaps the player's collision box.
   * While sneaking, only reject when the feet are firmly inside the footprint so
   * edge-overhang bridging (Minecraft-style) stays allowed.
   */
  function buildCellBlocksPlayer(cell: BuildCell): boolean {
    const p = player.object.position
    blockBuilder.worldBox(cell, _buildBox)
    if (
      !(
        p.y + PLAYER_HEIGHT > _buildBox.min.y &&
        p.y < _buildBox.max.y
      )
    ) {
      return false
    }

    if (input.sneak) {
      const m = PLAYER_RADIUS + 0.05
      return (
        p.x > _buildBox.min.x + m &&
        p.x < _buildBox.max.x - m &&
        p.z > _buildBox.min.z + m &&
        p.z < _buildBox.max.z - m
      )
    }

    return (
      p.x + PLAYER_RADIUS > _buildBox.min.x &&
      p.x - PLAYER_RADIUS < _buildBox.max.x &&
      p.z + PLAYER_RADIUS > _buildBox.min.z &&
      p.z - PLAYER_RADIUS < _buildBox.max.z
    )
  }

  let pendingSpearItem: 'spear' | 'iron_spear' | 'gold_spear' | 'diamond_spear' = 'spear'
  let pendingSpearDurability = TOOL_MAX_DURABILITY

  function isSpearItem(
    item: string | null,
  ): item is 'spear' | 'iron_spear' | 'gold_spear' | 'diamond_spear' {
    return (
      item === 'spear' ||
      item === 'iron_spear' ||
      item === 'gold_spear' ||
      item === 'diamond_spear'
    )
  }

  function tryThrowSpear() {
    const held = inventory.getHeldItem()
    if (!player.isLocked() || !isSpearItem(held)) return
    if (spearThrowCooldown > 0 || spearThrowPending || viewmodelHand.isThrowing()) return
    const durability = inventory.getHeldDurability() ?? TOOL_MAX_DURABILITY
    if (!inventory.consumeSelected(1)) return
    if (!viewmodelHand.startThrow()) return

    pendingSpearItem = held
    pendingSpearDurability = durability
    spearThrowPending = true
    spearThrowCooldown = SPEAR_THROW_COOLDOWN
    info.textContent = 'Spear thrown — walk up to pick it up'
  }

  function releasePendingSpearThrow() {
    if (!spearThrowPending) return
    const progress = viewmodelHand.getThrowProgress()
    if (progress < SPEAR_THROW_RELEASE && viewmodelHand.isThrowing()) return

    raycaster.setFromCamera(_screenCenter, camera)
    _digRayDir.copy(raycaster.ray.direction)
    _digRayOrigin.copy(camera.position).addScaledVector(_digRayDir, DIG_RAY_ORIGIN_OFFSET)
    spawnThrownSpear(
      projectilesGroup,
      _digRayOrigin,
      _digRayDir,
      thrownSpears,
      pendingSpearItem,
      pendingSpearDurability,
    )
    spearThrowPending = false
  }

  function throwableOrbKind(
    item: ReturnType<typeof inventory.getHeldItem>,
  ): ThrownOrbKind | null {
    if (item === 'glowing_orb') return 'damage'
    if (item === 'crystal_berries') return 'heal'
    return null
  }

  function tryThrowOrb() {
    const kind = throwableOrbKind(inventory.getHeldItem())
    if (!player.isLocked() || !kind) return
    if (orbThrowCooldown > 0 || orbThrowPending || viewmodelHand.isThrowing()) return
    if (!inventory.consumeSelected(1)) return
    if (!viewmodelHand.startThrow()) return

    pendingOrbKind = kind
    orbThrowPending = true
    orbThrowCooldown = SPEAR_THROW_COOLDOWN
    info.textContent = kind === 'heal' ? 'Heal fireball thrown' : 'Fireball thrown'
  }

  function releasePendingOrbThrow() {
    if (!orbThrowPending) return
    const progress = viewmodelHand.getThrowProgress()
    if (progress < ORB_THROW_RELEASE && viewmodelHand.isThrowing()) return

    raycaster.setFromCamera(_screenCenter, camera)
    _digRayDir.copy(raycaster.ray.direction)
    _digRayOrigin.copy(camera.position).addScaledVector(_digRayDir, DIG_RAY_ORIGIN_OFFSET)
    spawnThrownOrb(projectilesGroup, _digRayOrigin, _digRayDir, thrownOrbs, pendingOrbKind)
    orbThrowPending = false
  }

  function clearBowAimHud() {
    document.body.classList.remove('reloading')
    if (
      !document.body.classList.contains('digging') &&
      !document.body.classList.contains('world-loading')
    ) {
      digProgressFill.style.setProperty('--dig-deg', '0deg')
    }
  }

  function cancelBowDraw() {
    const wasDrawing = bowDrawHeld
    bowDrawHeld = false
    bowDrawT = 0
    viewmodelHand.setBowDraw(0)
    if (wasDrawing) clearBowAimHud()
  }

  /** Hold LMB to draw for power; click or release to loose (taps = low power). */
  function tryReleaseBow() {
    if (!bowDrawHeld) return
    // Instant clicks never accumulate draw time — still fire at min power.
    let draw = Math.min(1, bowDrawT / BOW_DRAW_DURATION)
    if (draw < BOW_MIN_RELEASE) draw = BOW_MIN_RELEASE
    cancelBowDraw()
    // Drop click/release look warps from LMB release — don't freeze aiming.
    player.guardLookSpikes(120)

    if (!player.isLocked() || inventory.getHeldItem() !== 'bow') return
    if (bowFireCooldown > 0) return
    const arrow = findBestArrow(inventory)
    if (!arrow) {
      info.textContent = 'Out of arrows'
      return
    }
    if (!inventory.consumeItem(arrow, 1)) return

    raycaster.setFromCamera(_screenCenter, camera)
    _digRayDir.copy(raycaster.ray.direction)
    _digRayOrigin.copy(camera.position).addScaledVector(_digRayDir, DIG_RAY_ORIGIN_OFFSET)
    const speed = ARROW_MIN_SPEED + (ARROW_MAX_SPEED - ARROW_MIN_SPEED) * draw
    spawnThrownArrow(
      projectilesGroup,
      _digRayOrigin,
      _digRayDir,
      thrownArrows,
      arrow,
      speed,
    )
    bowFireCooldown = BOW_FIRE_COOLDOWN
    if (inventory.damageHeldTool(1)) {
      info.textContent = 'Your bow broke'
    } else {
      info.textContent = draw >= 0.95 ? 'Full draw!' : 'Arrow fired'
    }
  }

  function beginBowDraw() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'bow') return
    if (bowFireCooldown > 0 || viewmodelHand.isThrowing()) return
    if (!findBestArrow(inventory)) {
      info.textContent = 'Out of arrows'
      return
    }
    // Cancel any in-progress draw cleanly before starting a new one (rapid re-click).
    if (bowDrawHeld) cancelBowDraw()
    clearDigState()
    digMouseDown = false
    clearBowAimHud()
    bowDrawHeld = true
    bowDrawT = 0
    viewmodelHand.setBowDraw(0)
    // Nock the arrow that will be fired (hidden again on release via setBowDraw(0)).
    viewmodelHand.setNockedArrow(findBestArrow(inventory))
  }

  function updateBowZoom(dt: number) {
    const wantZoom =
      bowZoomHeld &&
      inventory.getHeldItem() === 'bow' &&
      player.isLocked() &&
      !inventory.isPanelOpen()
    const target = wantZoom ? BOW_ZOOM_FOV : BOW_BASE_FOV
    const t = 1 - Math.exp(-BOW_ZOOM_LERP * dt)
    const next = bowFov + (target - bowFov) * t
    if (Math.abs(next - bowFov) < 0.01 && Math.abs(next - target) < 0.01) {
      bowFov = target
    } else {
      bowFov = next
    }
    if (Math.abs(camera.fov - bowFov) > 0.001) {
      camera.fov = bowFov
      camera.updateProjectionMatrix()
    }
    // Only slow look while RMB zoom is held. Hip-fire must stay at full
    // sensitivity — tying this to residual FOV left look sluggish after release
    // (and if mouseup was missed under pointer lock, FOV-based scale stayed low).
    if (wantZoom) {
      const zoomRange = BOW_BASE_FOV - BOW_ZOOM_FOV
      const zoomBlend =
        zoomRange > 1e-6
          ? Math.min(1, Math.max(0, (BOW_BASE_FOV - bowFov) / zoomRange))
          : 0
      player.setLookSensitivityScale(
        1 - zoomBlend * (1 - BOW_ZOOM_LOOK_SCALE),
      )
    } else if (player.getLookSensitivityScale() !== 1) {
      player.setLookSensitivityScale(1)
    }
  }

  function tryEatCrystalBerries() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'crystal_berries') return
    if (playerHealth <= 0) return
    if (inventory.getSelectedCount() <= 0) {
      info.textContent = 'Out of crystal berries'
      return
    }
    if (playerHealth >= PLAYER_MAX_HEALTH) {
      info.textContent = 'Health is full'
      return
    }
    if (!inventory.consumeSelected(1)) return
    playerHealth = Math.min(PLAYER_MAX_HEALTH, playerHealth + CRYSTAL_BERRY_HEAL)
    syncHealthHud()
    info.textContent = `+${CRYSTAL_BERRY_HEAL} health`
  }

  /** Right-click / hold a tree with scissors to snip one leaf per cut. */
  function tryHarvestLeaves() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'scissors') return
    const hit = pickHit()
    if (!hit) return
    const prop = findMineableFromHit(hit)
    if (!prop || prop.kind !== 'tree') return
    inventory.add('leaves', LEAVES_PER_SNIP)
    if (inventory.damageHeldTool(1)) {
      info.textContent = 'Your scissors broke'
    } else {
      info.textContent = 'Snipped a leaf (+1 leaf)'
    }
  }

  function tryPlaceTorch() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'torch') return
    if (inventory.getSelectedCount() <= 0) {
      info.textContent = 'Out of torches'
      return
    }
    const hit = pickBuildHit()
    if (!hit || !placedTorches.placementFromHit(hit, _digRayDir, _torchPos, _torchNormal)) return
    const p = player.object.position
    if (
      !placedTorches.isPlacementValid(_torchPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    ) {
      return
    }
    if (!inventory.consumeSelected(1)) return
    placedTorches.place(_torchPos, _torchNormal)
    requestShadowUpdate()
    forceBuildPreview = true
    info.textContent = 'Placed torch'
  }

  function tryPlaceChest() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'chest') return
    if (inventory.getSelectedCount() <= 0) {
      info.textContent = 'Out of chests'
      return
    }
    const hit = pickBuildHit()
    if (!hit || !placedChests.placementFromHit(hit, _digRayDir, _chestPos, _chestNormal)) {
      return
    }
    const p = player.object.position
    if (
      !placedChests.isPlacementValid(_chestPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    ) {
      return
    }
    if (!inventory.consumeSelected(1)) return
    const yaw = placedChests.facingYawFromPlayer(_chestPos, p)
    const chest = placedChests.place(_chestPos, yaw)
    placedChests.worldBox(chest, _buildBox)
    collisionWorld.setBuildBox(chest.collisionKey, _buildBox.min, _buildBox.max)
    requestShadowUpdate()
    forceBuildPreview = true
    info.textContent = 'Placed chest'
  }

  function tryOpenChestAtCrosshair(): boolean {
    if (!player.isLocked()) return false
    const hit = pickHit()
    if (!hit) return false
    const chestId = placedChests.findIdFromObject(hit.object)
    if (chestId) {
      const chest = placedChests.get(chestId)
      if (!chest) return false
      // Require standing next to the chest — dig reach alone is ~3 build blocks.
      if (
        chest.group.position.distanceToSquared(player.object.position) >
        CHEST_OPEN_REACH * CHEST_OPEN_REACH
      ) {
        info.textContent = 'Move closer to open the chest'
        return true
      }
      inventory.noteLockedBeforePanel(true)
      inventory.openContainer(
        { id: chest.id, title: 'Chest', slots: chest.slots },
        onInventoryLock,
      )
      info.textContent = 'Opened chest'
      return true
    }

    const ballistaId = placedBallistas.findIdFromObject(hit.object)
    if (ballistaId) {
      const ballista = placedBallistas.get(ballistaId)
      if (!ballista) return false
      if (
        ballista.group.position.distanceToSquared(player.object.position) >
        CHEST_OPEN_REACH * CHEST_OPEN_REACH
      ) {
        info.textContent = 'Move closer to open the ballista'
        return true
      }
      const controls = {
        fireRate: ballista.fireRate,
        targetPriority: ballista.targetPriority,
        targetPlayer: ballista.targetPlayer,
        setFireRate: (rate: typeof ballista.fireRate) => {
          ballista.fireRate = rate
          controls.fireRate = rate
        },
        setTargetPriority: (priority: typeof ballista.targetPriority) => {
          ballista.targetPriority = priority
          controls.targetPriority = priority
        },
        setTargetPlayer: (enabled: boolean) => {
          ballista.targetPlayer = enabled
          controls.targetPlayer = enabled
        },
      }
      inventory.noteLockedBeforePanel(true)
      inventory.openContainer(
        {
          id: ballista.id,
          title: 'Ballista',
          slots: ballista.slots,
          ballista: controls,
        },
        onInventoryLock,
      )
      info.textContent = 'Opened ballista'
      return true
    }

    const catapultId = placedCatapults.findIdFromObject(hit.object)
    if (!catapultId) return false
    const catapult = placedCatapults.get(catapultId)
    if (!catapult) return false
    if (
      catapult.group.position.distanceToSquared(player.object.position) >
      CATAPULT_OPEN_REACH * CATAPULT_OPEN_REACH
    ) {
      info.textContent = 'Move closer to open the catapult'
      return true
    }
    const controls = {
      fireRate: catapult.fireRate,
      targetPriority: catapult.targetPriority,
      targetPlayer: catapult.targetPlayer,
      setFireRate: (rate: typeof catapult.fireRate) => {
        catapult.fireRate = rate
        controls.fireRate = rate
      },
      setTargetPriority: (priority: typeof catapult.targetPriority) => {
        catapult.targetPriority = priority
        controls.targetPriority = priority
      },
      setTargetPlayer: (enabled: boolean) => {
        catapult.targetPlayer = enabled
        controls.targetPlayer = enabled
      },
    }
    inventory.noteLockedBeforePanel(true)
    inventory.openContainer(
      {
        id: catapult.id,
        title: 'Catapult',
        slots: catapult.slots,
        ballista: controls,
      },
      onInventoryLock,
    )
    info.textContent = 'Opened catapult — load stone, iron, gold, or diamond'
    return true
  }

  function tryPlaceCatapult() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'catapult') return
    if (inventory.getSelectedCount() <= 0) {
      info.textContent = 'Out of catapults'
      return
    }
    const hit = pickBuildHit()
    if (
      !hit ||
      !placedCatapults.placementFromHit(hit, _digRayDir, _catapultPos, _catapultNormal)
    ) {
      return
    }
    const p = player.object.position
    if (
      !placedCatapults.isPlacementValid(_catapultPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    ) {
      return
    }
    if (!inventory.consumeSelected(1)) return
    const yaw = placedCatapults.facingYawFromPlayer(_catapultPos, p)
    const catapult = placedCatapults.place(_catapultPos, yaw)
    placedCatapults.worldBox(catapult, _buildBox)
    collisionWorld.setBuildBox(catapult.collisionKey, _buildBox.min, _buildBox.max)
    requestShadowUpdate()
    forceBuildPreview = true
    info.textContent = 'Placed catapult'
  }

  function tryPlaceBallista() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'ballista') return
    if (inventory.getSelectedCount() <= 0) {
      info.textContent = 'Out of ballistas'
      return
    }
    const hit = pickBuildHit()
    if (
      !hit ||
      !placedBallistas.placementFromHit(hit, _digRayDir, _ballistaPos, _ballistaNormal)
    ) {
      return
    }
    const p = player.object.position
    if (
      !placedBallistas.isPlacementValid(_ballistaPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    ) {
      return
    }
    if (!inventory.consumeSelected(1)) return
    const yaw = placedBallistas.facingYawFromPlayer(_ballistaPos, p)
    const ballista = placedBallistas.place(_ballistaPos, yaw)
    placedBallistas.worldBox(ballista, _buildBox)
    collisionWorld.setBuildBox(ballista.collisionKey, _buildBox.min, _buildBox.max)
    requestShadowUpdate()
    forceBuildPreview = true
    info.textContent = 'Placed ballista'
  }

  function tryPlaceBed() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'bed') return
    if (inventory.getSelectedCount() <= 0) {
      info.textContent = 'Out of beds'
      return
    }
    const hit = pickBuildHit()
    if (!hit || !placedBeds.placementFromHit(hit, _digRayDir, _bedPos, _bedNormal)) {
      return
    }
    const p = player.object.position
    if (!placedBeds.isPlacementValid(_bedPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)) {
      return
    }
    if (!inventory.consumeSelected(1)) return
    const yaw = placedBeds.facingYawFromPlayer(_bedPos, p)
    const bed = placedBeds.place(_bedPos, yaw)
    placedBeds.worldBox(bed, _buildBox)
    collisionWorld.setBuildBox(bed.collisionKey, _buildBox.min, _buildBox.max)
    requestShadowUpdate()
    forceBuildPreview = true
    info.textContent = 'Placed bed'
  }

  function trySleepAtCrosshair(): boolean {
    if (!player.isLocked() || sleeping || playerDead) return false
    const hit = pickHit()
    if (!hit) return false
    const bedId = placedBeds.findIdFromObject(hit.object)
    if (!bedId) return false
    const bed = placedBeds.get(bedId)
    if (!bed) return false
    if (
      bed.group.position.distanceToSquared(player.object.position) >
      BED_SLEEP_REACH * BED_SLEEP_REACH
    ) {
      info.textContent = 'Move closer to sleep'
      return true
    }
    // Set respawn immediately so dying mid-sleep still uses the bed.
    respawnX = bed.group.position.x
    respawnZ = bed.group.position.z
    respawnFallbackY = bed.group.position.y + 1.2
    sleepBedId = bed.id
    sleeping = true
    sleepTimer = 0
    sleepSkippedNight = false
    placedBeds.sleepCameraWorld(bed, _sleepCam)
    player.lieDown(_sleepCam, placedBeds.sleepLookYaw(bed))
    info.textContent = 'Sleeping…'
    return true
  }

  function finishSleep() {
    const bed = sleepBedId ? placedBeds.get(sleepBedId) : undefined
    const alreadySkipped = sleepSkippedNight
    sleeping = false
    sleepTimer = 0
    sleepSkippedNight = false
    sleepBedId = null
    if (!alreadySkipped) {
      worldTimeSec = skipToMorning(worldTimeSec)
      applyDayNight(worldTimeSec, 0)
    }
    if (bed) {
      placedBeds.wakePosition(bed, _wakePos)
      player.getUp(_wakePos.x, _wakePos.z, _wakePos.y + 1.5)
    } else if (player.isLyingDown()) {
      player.getUp(respawnX, respawnZ, respawnFallbackY)
    }
    info.textContent = 'Slept until morning — respawn set'
  }

  function updateSleep(dt: number) {
    sleepTimer += dt
    if (!sleepSkippedNight && sleepTimer >= BED_SLEEP_SKIP_AT) {
      sleepSkippedNight = true
      worldTimeSec = skipToMorning(worldTimeSec)
      applyDayNight(worldTimeSec, 0)
    }
    if (sleepTimer >= BED_SLEEP_DURATION) {
      finishSleep()
    }
  }

  function tryPlaceSapling() {
    if (!player.isLocked()) return
    const held = inventory.getHeldItem()
    if (!isSaplingItem(held)) return
    if (inventory.getSelectedCount() <= 0) {
      info.textContent = held === 'glowberry_sapling' ? 'Out of glowberry saplings' : 'Out of saplings'
      return
    }
    const hit = pickBuildHit()
    if (
      !hit ||
      !plantedSaplings.placementFromHit(hit, _digRayDir, _saplingPos, _saplingNormal)
    ) {
      return
    }
    const p = player.object.position
    if (
      !plantedSaplings.isPlacementValid(
        _saplingPos,
        p,
        PLAYER_RADIUS,
        PLAYER_HEIGHT,
        placedTrees,
      )
    ) {
      return
    }
    if (!inventory.consumeSelected(1)) return
    const tree = plantedSaplings.place(held, _saplingPos, treesGroup)
    if (!tree) {
      inventory.add(held, 1)
      return
    }
    placedTrees.push(tree)
    // Skip shadow rebuild — saplings don't cast until mature (see PlantedSaplingManager).
    addPropCollision(tree, { shadow: false })
    forceBuildPreview = true
    info.textContent =
      held === 'glowberry_sapling' ? 'Planted glowberry sapling' : 'Planted sapling'
  }

  function updateTorchPreview() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'torch') {
      placedTorches.setGhost(null, null, false)
      return
    }
    const hit = pickBuildHit()
    if (!hit || !placedTorches.placementFromHit(hit, _digRayDir, _torchPos, _torchNormal)) {
      placedTorches.setGhost(null, null, false)
      return
    }
    const p = player.object.position
    const valid =
      inventory.getSelectedCount() > 0 &&
      placedTorches.isPlacementValid(_torchPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    placedTorches.setGhost(_torchPos, _torchNormal, valid)
  }

  function updateChestPreview() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'chest') {
      placedChests.setGhost(null, null, false)
      return
    }
    const hit = pickBuildHit()
    if (!hit || !placedChests.placementFromHit(hit, _digRayDir, _chestPos, _chestNormal)) {
      placedChests.setGhost(null, null, false)
      return
    }
    const p = player.object.position
    const valid =
      inventory.getSelectedCount() > 0 &&
      placedChests.isPlacementValid(_chestPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    const yaw = placedChests.facingYawFromPlayer(_chestPos, p)
    placedChests.setGhost(_chestPos, yaw, valid)
  }

  function updateBedPreview() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'bed') {
      placedBeds.setGhost(null, null, false)
      return
    }
    const hit = pickBuildHit()
    if (!hit || !placedBeds.placementFromHit(hit, _digRayDir, _bedPos, _bedNormal)) {
      placedBeds.setGhost(null, null, false)
      return
    }
    const p = player.object.position
    const valid =
      inventory.getSelectedCount() > 0 &&
      placedBeds.isPlacementValid(_bedPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    const yaw = placedBeds.facingYawFromPlayer(_bedPos, p)
    placedBeds.setGhost(_bedPos, yaw, valid)
  }

  function updateBallistaPreview() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'ballista') {
      placedBallistas.setGhost(null, null, false)
      placedCatapults.setGhost(null, null, false)
      return
    }
    const hit = pickBuildHit()
    if (
      !hit ||
      !placedBallistas.placementFromHit(hit, _digRayDir, _ballistaPos, _ballistaNormal)
    ) {
      placedBallistas.setGhost(null, null, false)
      placedCatapults.setGhost(null, null, false)
      return
    }
    const p = player.object.position
    const valid =
      inventory.getSelectedCount() > 0 &&
      placedBallistas.isPlacementValid(_ballistaPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    const yaw = placedBallistas.facingYawFromPlayer(_ballistaPos, p)
    placedBallistas.setGhost(_ballistaPos, yaw, valid)
    placedCatapults.setGhost(null, null, false)
  }

  function updateCatapultPreview() {
    if (!player.isLocked() || inventory.getHeldItem() !== 'catapult') {
      placedCatapults.setGhost(null, null, false)
      return
    }
    const hit = pickBuildHit()
    if (
      !hit ||
      !placedCatapults.placementFromHit(hit, _digRayDir, _catapultPos, _catapultNormal)
    ) {
      placedCatapults.setGhost(null, null, false)
      return
    }
    const p = player.object.position
    const valid =
      inventory.getSelectedCount() > 0 &&
      placedCatapults.isPlacementValid(_catapultPos, p, PLAYER_RADIUS, PLAYER_HEIGHT)
    const yaw = placedCatapults.facingYawFromPlayer(_catapultPos, p)
    placedCatapults.setGhost(_catapultPos, yaw, valid)
    placedBallistas.setGhost(null, null, false)
  }

  function updateSaplingPreview() {
    const held = inventory.getHeldItem()
    if (!player.isLocked() || !isSaplingItem(held)) {
      plantedSaplings.setGhost(null, null, false)
      return
    }
    const hit = pickBuildHit()
    if (
      !hit ||
      !plantedSaplings.placementFromHit(hit, _digRayDir, _saplingPos, _saplingNormal)
    ) {
      plantedSaplings.setGhost(null, null, false)
      return
    }
    const p = player.object.position
    const valid =
      inventory.getSelectedCount() > 0 &&
      plantedSaplings.isPlacementValid(
        _saplingPos,
        p,
        PLAYER_RADIUS,
        PLAYER_HEIGHT,
        placedTrees,
      )
    plantedSaplings.setGhost(held, _saplingPos, valid)
  }

  function tryPlaceBlock() {
    if (!player.isLocked() || !inventory.selectedIsBuildable()) return
    const item = inventory.getSelectedBuildable()
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
    const item = inventory.getSelectedBuildable()
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
    dropSpearsFromBlock(key, thrownSpears)
    dropArrowsFromBlock(key, thrownArrows)
    const removed = blockBuilder.removeAt(key)
    if (!removed) return
    collisionWorld.removeBuildBox(key)
    if (refund) inventory.add(removed.type, 1)
    requestShadowUpdate()
  }

  function updateBlockExpiry() {
    const expired = blockBuilder.expireBefore(performance.now())
    for (const cell of expired) {
      dropSpearsFromBlock(cell.key, thrownSpears)
      dropArrowsFromBlock(cell.key, thrownArrows)
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
  const getTreeDebrisDivisions = () =>
    Math.min(7, getDebrisDivisions() + 2)

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
    kind:
      | 'surface'
      | 'voxel'
      | 'rock'
      | 'tree'
      | 'block'
      | 'torch'
      | 'chest'
      | 'bed'
      | 'ballista'
      | 'catapult'
    layer?: number
    visualRoot: THREE.Object3D
    propRef?: THREE.Group
    blockKey?: string
    blockType?: BuildBlockType
    torchId?: string
    chestId?: string
    bedId?: string
    ballistaId?: string
    catapultId?: string
    isIronOre?: boolean
    oreType?: OreType | null
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
    dropSpearsFromProp(root, thrownSpears)
    dropArrowsFromProp(root, thrownArrows)
    if (kind === 'rock') {
      const idx = placedRocks.indexOf(root)
      if (idx >= 0) placedRocks.splice(idx, 1)
      rocksGroup.remove(root)
      inventory.add('stone', STONE_PER_ROCK)
      info.textContent = `Mined rock (+${STONE_PER_ROCK} stone)`
    } else {
      const idx = placedTrees.indexOf(root)
      if (idx >= 0) placedTrees.splice(idx, 1)
      const wood = woodFromTree(root, WOOD_PER_TREE)
      const growth = treeGrowthFraction(root)
      // Detach crystal diamonds before the tree is disposed so they can fall.
      // Immature glowberry trees keep berries attached until chopped; drops scale with growth.
      const dropped =
        root.userData.hasCrystalBerries && growth >= 0.75
          ? crystalBerryDrops.spawnFromTree(root)
          : 0
      releaseBerryGlowLight(root)
      treesGroup.remove(root)
      inventory.add('wood', wood)
      if (dropped > 0) {
        info.textContent = `Chopped tree (+${wood} wood) — crystal berries fell`
      } else if (root.userData.isPlanted && growth < 1) {
        info.textContent = `Chopped young tree (+${wood} wood)`
      } else {
        info.textContent = `Chopped tree (+${wood} wood)`
      }
    }
    disposeMineableProp(root)
    syncPropCollision()
  }

  let digTarget: DigTarget | null = null
  let digProgress = 0
  let digMouseDown = false
  let digEffectId: string | null = null
  let surfaceDigPreviewCell: Cell | null = null
  // Dig pick cache — full world pick is expensive; reuse while aim is steady.
  const _digPickQuat = new THREE.Quaternion()
  let digPickHasQuat = false
  let digPickTimer = 0
  let cachedDigHit: THREE.Intersection | null = null
  const DIG_PICK_HEARTBEAT = 0.18
  const DIG_PICK_ROT_EPS = 0.018 // ~1°

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
    // Peel this cell out of the merged chunk so we dig the live surfaceRoot
    // instead of a ghost copy that survives until a deferred remesh.
    surfaceChunks.setDigPreviewCell(cell)
    if (cell?.surfaceRoot) {
      cell.surfaceRoot.visible = true
      cell.surfaceRoot.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        child.renderOrder = 2
        const layer = child.userData.surfaceLayer as number | undefined
        if (layer !== undefined) {
          child.visible = cellHasSurfaceLayer(cell, layer)
        }
      })
      refreshFrozenMatrixWorld(cell.surfaceRoot)
    }
  }

  const keys = new Set<string>()
  let onInventoryLock: (locked: boolean) => void = () => {}
  /** Minecraft-style: double-tap W within this window to start sprinting. */
  const SPRINT_DOUBLE_TAP_SEC = 0.3
  let lastForwardTapMs = 0
  let sprintActive = false

  function enterPlayingUi() {
    document.body.classList.add('playing')
    info.textContent = ''
    renderer.domElement.style.cursor = touchControls.enabled ? 'default' : 'none'
    if (touchControls.enabled) touchControls.setOverlayVisible(true)
  }

  function pausePlayingUi() {
    document.body.classList.remove('playing')
    document.body.classList.remove('reloading')
    digMouseDown = false
    secondaryMouseDown = false
    spearThrowHeld = false
    orbThrowHeld = false
    scissorsSnipHeld = false
    scissorsSnipTimer = 0
    bowZoomHeld = false
    cancelBowDraw()
    clearDigState()
    if (Math.abs(camera.fov - BOW_BASE_FOV) > 0.001) {
      bowFov = BOW_BASE_FOV
      camera.fov = BOW_BASE_FOV
      camera.updateProjectionMatrix()
    }
    player.setLookSensitivityScale(1)
    spearThrowPending = false
    orbThrowPending = false
    clearThrownSpears(thrownSpears, projectilesGroup)
    clearThrownArrows(thrownArrows, projectilesGroup)
    clearThrownOrbs(thrownOrbs, projectilesGroup)
    clearThrownCatapultRocks(thrownCatapultRocks, projectilesGroup)
    blockBuilder.setGhost(null)
    placedTorches.setGhost(null, null, false)
    placedChests.setGhost(null, null, false)
    placedBeds.setGhost(null, null, false)
    placedBallistas.setGhost(null, null, false)
    placedCatapults.setGhost(null, null, false)
    plantedSaplings.setGhost(null, null, false)
    info.textContent = ''
    renderer.domElement.style.cursor = 'crosshair'
    if (touchControls.enabled) touchControls.setOverlayVisible(false)
  }

  function beginPlay() {
    if (touchControls.enabled) {
      if (player.isTouchPlaying()) return
      player.setTouchPlaying(true)
      enterPlayingUi()
      return
    }
    player.lock()
  }

  function endPlay() {
    if (touchControls.enabled || player.isTouchPlaying()) {
      player.setTouchPlaying(false)
      pausePlayingUi()
      return
    }
    player.controls.unlock()
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyR') {
      e.preventDefault()
      if (confirm('Reload the page? Any unsaved progress may be lost.')) {
        location.reload()
      }
      return
    }
    if (e.code === 'KeyE') {
      e.preventDefault()
      if (!inventory.isPanelOpen()) inventory.noteLockedBeforePanel(player.isLocked())
      inventory.togglePanel(onInventoryLock)
      return
    }
    keys.add(e.code)
    if (
      (e.code === 'KeyM' || e.code === 'Digit7' || e.code === 'KeyN') &&
      keys.has('KeyM') &&
      keys.has('Digit7') &&
      keys.has('KeyN')
    ) {
      e.preventDefault()
      spawnEnemyNearby()
      return
    }
    if (
      (e.code === 'KeyM' && keys.has('Digit7') && !keys.has('KeyN')) ||
      (e.code === 'Digit7' && keys.has('KeyM') && !keys.has('KeyN'))
    ) {
      e.preventDefault()
      inventory.giveAllItems()
      return
    }
    if (
      (e.code === 'KeyM' && keys.has('KeyX')) ||
      (e.code === 'KeyX' && keys.has('KeyM'))
    ) {
      e.preventDefault()
      clearEnemies(enemies, enemiesGroup)
      clearSpiders(spiders, spidersGroup)
      syncEnemyCountHud()
      info.textContent = 'Cleared all enemies'
      return
    }
    if (inventory.isPanelOpen()) {
      if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
        const n = Number(e.code.slice(5))
        if (n >= 1 && n <= 9) inventory.selectIndex(n - 1)
      }
      return
    }
    if (e.code === 'KeyN') {
      e.preventDefault()
      onPrimaryPress('key')
      return
    }
    if (e.code === 'KeyM') {
      e.preventDefault()
      onSecondaryPress('key')
      return
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
      if (startKeys.has(e.code)) beginPlay()
    }
    if (e.code.startsWith('Digit') && e.code !== 'Digit0') {
      const n = Number(e.code.slice(5))
      if (n >= 1 && n <= 9) inventory.selectIndex(n - 1)
    }
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      e.preventDefault()
    }
    if (e.code === 'KeyW' || e.code === 'ArrowUp') {
      const now = performance.now()
      if (now - lastForwardTapMs <= SPRINT_DOUBLE_TAP_SEC * 1000) {
        sprintActive = true
      }
      lastForwardTapMs = now
    }
  })
  window.addEventListener('keyup', (e) => {
    keys.delete(e.code)
    if (e.code === 'KeyW' || e.code === 'ArrowUp') sprintActive = false
    if (e.code === 'KeyN') onPrimaryRelease('key')
    if (e.code === 'KeyM') onSecondaryRelease('key')
  })

  const input: PlayerInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    sneak: false,
    jump: false,
  }

  function readInput() {
    if (inventory.isPanelOpen()) {
      input.forward = false
      input.backward = false
      input.left = false
      input.right = false
      input.sprint = false
      input.sneak = false
      input.jump = false
      sprintActive = false
      return
    }
    const touch = touchControls.enabled ? touchControls.readMove() : null
    input.forward = keys.has('KeyW') || keys.has('ArrowUp') || !!touch?.forward
    input.backward = keys.has('KeyS') || keys.has('ArrowDown') || !!touch?.backward
    input.left = keys.has('KeyA') || keys.has('ArrowLeft') || !!touch?.left
    input.right = keys.has('KeyD') || keys.has('ArrowRight') || !!touch?.right
    input.sneak =
      keys.has('ShiftLeft') || keys.has('ShiftRight') || !!touch?.sneak
    // Sprint from double-tap W or pushing the stick far; sneak cancels it.
    if (!input.forward || input.sneak) sprintActive = false
    input.sprint =
      (sprintActive && input.forward && !input.sneak) || !!touch?.sprint
    input.jump = keys.has('Space') || !!touch?.jump
  }

  let secondaryMouseDown = false

  function primaryHeld() {
    return (
      digMouseDown ||
      keys.has('KeyN') ||
      (touchControls.enabled && touchControls.isPrimaryHeld())
    )
  }

  function secondaryHeld() {
    return (
      secondaryMouseDown ||
      keys.has('KeyM') ||
      (touchControls.enabled && touchControls.isSecondaryHeld())
    )
  }

  /** Left-click / N / touch Atk: lock, dig, or draw bow. */
  function onPrimaryPress(source: 'mouse' | 'key' | 'touch') {
    if (inventory.isPanelOpen() || sleeping) return
    if (!player.isLocked()) {
      beginPlay()
      return
    }
    // Dig / bow / attack: same pointer-lock look warp as RMB.
    player.guardLookSpikes(120)
    if (inventory.getHeldItem() === 'bow') {
      beginBowDraw()
      return
    }
    if (inventory.getHeldItem() === 'crystal_berries') {
      viewmodelHand.whack()
      tryEatCrystalBerries()
      return
    }
    if (source === 'mouse' || source === 'touch') digMouseDown = true
    viewmodelHand.whack()
  }

  function onPrimaryRelease(source: 'mouse' | 'key' | 'touch') {
    if (source === 'mouse' || source === 'touch') digMouseDown = false
    if (primaryHeld()) return
    if (bowDrawHeld) tryReleaseBow()
    else if (player.isLocked()) player.guardLookSpikes(120)
  }

  /** Right-click / M / touch Use: sleep, open chest, bow zoom, throw, or place. */
  function onSecondaryPress(source: 'mouse' | 'key' | 'touch') {
    if (inventory.isPanelOpen() || !player.isLocked() || sleeping) return
    if (source === 'mouse' || source === 'touch') secondaryMouseDown = true
    // Pointer-lock click warps inject huge movementY — guard before any action.
    player.guardLookSpikes(120)
    if (trySleepAtCrosshair()) {
      return
    }
    if (tryOpenChestAtCrosshair()) {
      return
    }
    if (inventory.getHeldItem() === 'bow') {
      bowZoomHeld = true
    } else if (isSpearItem(inventory.getHeldItem()) && inventory.getSelectedCount() > 0) {
      spearThrowHeld = true
      tryThrowSpear()
    } else if (
      throwableOrbKind(inventory.getHeldItem()) &&
      inventory.getSelectedCount() > 0
    ) {
      orbThrowHeld = true
      tryThrowOrb()
    } else if (inventory.getHeldItem() === 'scissors') {
      scissorsSnipHeld = true
      scissorsSnipTimer = 0
      viewmodelHand.whack()
      tryHarvestLeaves()
    } else if (isSaplingItem(inventory.getHeldItem())) {
      viewmodelHand.whack()
      tryPlaceSapling()
    } else if (inventory.getHeldItem() === 'torch') {
      viewmodelHand.whack()
      tryPlaceTorch()
    } else if (inventory.getHeldItem() === 'chest') {
      viewmodelHand.whack()
      tryPlaceChest()
    } else if (inventory.getHeldItem() === 'bed') {
      viewmodelHand.whack()
      tryPlaceBed()
    } else if (inventory.getHeldItem() === 'ballista') {
      viewmodelHand.whack()
      tryPlaceBallista()
    } else if (inventory.getHeldItem() === 'catapult') {
      viewmodelHand.whack()
      tryPlaceCatapult()
    } else {
      viewmodelHand.whack()
      tryPlaceBlock()
    }
  }

  function onSecondaryRelease(source: 'mouse' | 'key' | 'touch') {
    if (source === 'mouse' || source === 'touch') secondaryMouseDown = false
    if (secondaryHeld()) return
    // RMB release also injects a look warp under pointer lock.
    if (player.isLocked()) player.guardLookSpikes(120)
    spearThrowHeld = false
    orbThrowHeld = false
    scissorsSnipHeld = false
    scissorsSnipTimer = 0
    bowZoomHeld = false
  }

  renderer.domElement.tabIndex = 0
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (inventory.isPanelOpen()) return
    // Touch devices use the on-screen stick / look pad / action buttons.
    if (touchControls.enabled) {
      beginPlay()
      return
    }
    renderer.domElement.focus()
    if (e.button === 2) {
      onSecondaryPress('mouse')
      return
    }
    if (e.button !== 0) return
    onPrimaryPress('mouse')
  })
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) onPrimaryRelease('mouse')
    if (e.button === 2) onSecondaryRelease('mouse')
  })
  window.addEventListener('blur', () => {
    digMouseDown = false
    secondaryMouseDown = false
    spearThrowHeld = false
    orbThrowHeld = false
    scissorsSnipHeld = false
    scissorsSnipTimer = 0
    bowZoomHeld = false
    cancelBowDraw()
  })
  // Holding RMB under pointer lock can still synthesize a contextmenu (~0.5s on
  // some OSes) which releases the button / cancels zoom — block it while playing.
  const blockContextMenu = (e: Event) => {
    if (player.isLocked()) e.preventDefault()
  }
  renderer.domElement.addEventListener('contextmenu', blockContextMenu)
  window.addEventListener('contextmenu', blockContextMenu)
  window.addEventListener('auxclick', (e) => {
    if (player.isLocked() && e.button === 2) e.preventDefault()
  })
  renderer.domElement.addEventListener(
    'wheel',
    (e) => {
      if (!player.isLocked() || inventory.isPanelOpen()) return
      e.preventDefault()
      inventory.cycle(e.deltaY > 0 ? 1 : -1)
    },
    { passive: false },
  )

  player.controls.addEventListener('lock', () => {
    enterPlayingUi()
  })

  player.controls.addEventListener('unlock', () => {
    // Touch play does not use pointer lock; ignore spurious unlock events.
    if (player.isTouchPlaying()) return
    pausePlayingUi()
  })

  touchControls.mount({
    onPrimaryPress: () => onPrimaryPress('touch'),
    onPrimaryRelease: () => onPrimaryRelease('touch'),
    onSecondaryPress: () => onSecondaryPress('touch'),
    onSecondaryRelease: () => onSecondaryRelease('touch'),
    onToggleInventory: () => {
      if (!inventory.isPanelOpen()) inventory.noteLockedBeforePanel(player.isLocked())
      inventory.togglePanel(onInventoryLock)
    },
    onHotbarCycle: (dir) => {
      if (!player.isLocked() || inventory.isPanelOpen()) return
      inventory.cycle(dir)
    },
    onLookDelta: (dx, dy) => player.addLookDelta(dx, dy),
    onBeginPlay: () => beginPlay(),
    isPlaying: () => player.isLocked(),
    isInventoryOpen: () => inventory.isPanelOpen(),
  })

  const raycaster = new THREE.Raycaster()
  const _screenCenter = new THREE.Vector2(0, 0)
  const _voxelPickBox = new THREE.Box3()
  const _voxelPickHit = new THREE.Vector3()
  const _voxelPickFaceNormal = new THREE.Vector3()
  const _chunkPickSphere = new THREE.Sphere()

  function aimDigRaycaster() {
    raycaster.setFromCamera(_screenCenter, camera)
    _digRayDir.copy(raycaster.ray.direction)
    _digRayOrigin.copy(camera.position).addScaledVector(_digRayDir, DIG_RAY_ORIGIN_OFFSET)
    raycaster.ray.set(_digRayOrigin, _digRayDir)
    raycaster.near = 0.01
    raycaster.far = DIG_REACH
  }

  /**
   * Outward AABB face normal at the ray entry point (needed because the fast
   * voxel pick path never runs a triangle raycast).
   */
  function setAabbEntryFaceNormal(
    box: THREE.Box3,
    hit: THREE.Vector3,
    rayDir: THREE.Vector3,
    out: THREE.Vector3,
  ) {
    const dxMin = Math.abs(hit.x - box.min.x)
    const dxMax = Math.abs(hit.x - box.max.x)
    const dyMin = Math.abs(hit.y - box.min.y)
    const dyMax = Math.abs(hit.y - box.max.y)
    const dzMin = Math.abs(hit.z - box.min.z)
    const dzMax = Math.abs(hit.z - box.max.z)
    const minD = Math.min(dxMin, dxMax, dyMin, dyMax, dzMin, dzMax)
    if (minD === dxMin) out.set(-1, 0, 0)
    else if (minD === dxMax) out.set(1, 0, 0)
    else if (minD === dyMin) out.set(0, -1, 0)
    else if (minD === dyMax) out.set(0, 1, 0)
    else if (minD === dzMin) out.set(0, 0, -1)
    else out.set(0, 0, 1)
    // Prefer the outward face that faces the camera (against the ray).
    if (out.dot(rayDir) > 0) out.negate()
  }

  /**
   * Voxel columns are InstancedMeshes with ~cellCount instances each. Three's
   * default raycast walks every instance (getMatrixAt × applyMatrix4) — that was
   * ~half of frame time while digging. Instead, test AABBs only for cells near
   * the player within dig reach.
   */
  function collectVoxelRayHits(out: THREE.Intersection[]) {
    const ray = raycaster.ray
    const origin = ray.origin
    const px = player.object.position.x
    const pz = player.object.position.z
    const pcix = THREE.MathUtils.clamp(
      Math.floor((px - gridMinX) / cellSize),
      0,
      gridSpan - 1,
    )
    const pciy = THREE.MathUtils.clamp(
      Math.floor((pz - gridMinZ) / cellSize),
      0,
      gridSpan - 1,
    )
    const ring = Math.ceil(DIG_REACH / cellSize) + 1
    const reach = DIG_REACH + cellSize
    const reachSq = reach * reach

    let bestDist = DIG_REACH + 1e-6
    let bestCell: Cell | null = null
    let bestLayer = -1

    for (let ix = pcix - ring; ix <= pcix + ring; ix++) {
      if (ix < 0 || ix >= gridSpan) continue
      const row = cellGrid[ix]
      if (!row) continue
      for (let iy = pciy - ring; iy <= pciy + ring; iy++) {
        if (iy < 0 || iy >= gridSpan) continue
        const cell = row[iy]
        if (!cell || cell.layerMask === 0) continue
        const dx = cell.centerX - px
        const dz = cell.centerZ - pz
        if (dx * dx + dz * dz > reachSq) continue

        for (let layer = 0; layer < voxelLayers; layer++) {
          if ((cell.layerMask & (1 << layer)) === 0) continue
          voxelWorldBox(cell, layer, voxelSize, _voxelPickBox)
          if (!ray.intersectBox(_voxelPickBox, _voxelPickHit)) continue
          const dist = origin.distanceTo(_voxelPickHit)
          if (dist < raycaster.near || dist >= bestDist) continue
          bestDist = dist
          bestCell = cell
          bestLayer = layer
        }
      }
    }

    if (!bestCell || bestLayer < 0) return

    // Recompute the winning hit point (loop may have overwritten scratch).
    voxelWorldBox(bestCell, bestLayer, voxelSize, _voxelPickBox)
    if (!ray.intersectBox(_voxelPickBox, _voxelPickHit)) return
    const dist = origin.distanceTo(_voxelPickHit)
    const mesh = voxelInstancer.meshForCellLayer(bestCell, bestLayer)
    if (!mesh) return
    setAabbEntryFaceNormal(_voxelPickBox, _voxelPickHit, ray.direction, _voxelPickFaceNormal)
    out.push({
      distance: dist,
      point: _voxelPickHit.clone(),
      object: mesh,
      instanceId: bestCell.instanceIndex,
      // Clone face so later picks can't overwrite the shared normal before use.
      face: {
        a: 0,
        b: 1,
        c: 2,
        normal: _voxelPickFaceNormal.clone(),
        materialIndex: 0,
      },
      faceIndex: 0,
    })
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

  /**
   * Resolve which surface layer a hit belongs to. Strict: no fallback to other
   * layers — guessing mined invisible / behind-block pieces after remesh lag
   * left ghost triangles in the merged chunk mesh.
   */
  function surfaceLayerFromHit(cell: Cell, hit: THREE.Intersection): number | null {
    let current: THREE.Object3D | null = hit.object
    while (current) {
      const tagged = current.userData.surfaceLayer as number | undefined
      if (tagged !== undefined && cellHasSurfaceLayer(cell, tagged)) return tagged
      current = current.parent
    }
    // Merged chunk meshes lose per-layer tags — map hit Y onto the grid band.
    const layer = layerIndexAtY(cell, hit.point.y, voxelSize, voxelLayers)
    if (!cellHasSurfaceLayer(cell, layer)) return null
    const { y0, y1 } = layerYRange(cell, layer, voxelSize)
    const y = hit.point.y
    // Allow a tiny tolerance for verts snapped onto the shared layer plane.
    if (y < y0 - 0.08 || y > y1 + 0.08) return null
    return layer
  }

  function hideSurfaceLayerMeshes(cell: Cell, layer: number) {
    if (!cell.surfaceRoot) return
    cell.surfaceRoot.traverse((child) => {
      if (child.userData.surfaceLayer === layer) child.visible = false
    })
  }

  function disposeEmptySurfaceRoot(cell: Cell) {
    if (!cell.surfaceRoot) return
    if (cell.surfaceLayerMask !== 0) return
    disposeSurfaceGeometries(cell.surfaceRoot)
    cell.surfaceRoot.parent?.remove(cell.surfaceRoot)
    cell.surfaceRoot = undefined
  }

  function completeDig(target: DigTarget) {
    // Only wake rocks near terrain digs — waking the whole map made every rock
    // raycast terrain and hitch for ~100ms on each break.
    if (target.kind === 'surface' || target.kind === 'voxel') {
      const digCell = target.cell
      if (digCell) {
        wakeRocksNear(placedRocks, digCell.centerX, digCell.centerZ, cellSize * 2.5)
      }
    }

    const wearTool = () => {
      if (inventory.damageHeldTool(1)) {
        info.textContent = 'Your tool broke'
      }
    }

    if (target.kind === 'rock' || target.kind === 'tree') {
      if (target.propRef) {
        removeMineableProp(target.propRef, target.kind)
        wearTool()
      }
      return
    }

    if (target.kind === 'block') {
      if (!target.blockKey) return
      const removed = blockBuilder.getCell(target.blockKey)
      removePlacedBlock(target.blockKey, true)
      if (removed) {
        info.textContent = `Mined ${removed.type} block (+1 ${removed.type})`
        wearTool()
      }
      return
    }

    if (target.kind === 'torch') {
      if (target.torchId && placedTorches.remove(target.torchId)) {
        inventory.add('torch', 1)
        info.textContent = 'Mined torch (+1 torch)'
        wearTool()
      }
      return
    }

    if (target.kind === 'chest') {
      if (!target.chestId) return
      // Close the UI if this chest is open.
      if (inventory.getOpenContainerId() === target.chestId) {
        inventory.closePanel(onInventoryLock)
      }
      const removed = placedChests.remove(target.chestId)
      if (!removed) return
      collisionWorld.removeBuildBox(removed.collisionKey)
      const contents = placedChests.takeAllStacks(removed)
      inventory.add('chest', 1)
      const overflow: {
        item: (typeof contents)[number]['item']
        count: number
        durability?: number
      }[] = []
      for (const stack of contents) {
        const stored = inventory.add(stack.item, stack.count, stack.durability)
        const left = stack.count - stored
        if (left > 0) {
          overflow.push({
            item: stack.item,
            count: left,
            durability: stack.durability,
          })
        }
      }
      if (overflow.length > 0) {
        camera.getWorldDirection(_dropForward)
        _dropForward.y = 0
        if (_dropForward.lengthSq() < 1e-6) _dropForward.set(0, 0, -1)
        else _dropForward.normalize()
        for (const stack of overflow) {
          groundItems.spawnFromPlayer(
            stack.item,
            stack.count,
            removed.group.position,
            _dropForward,
            stack.durability,
          )
        }
      }
      requestShadowUpdate()
      info.textContent =
        contents.length > 0
          ? `Mined chest (+1 chest) — emptied contents`
          : 'Mined chest (+1 chest)'
      wearTool()
      return
    }

    if (target.kind === 'bed') {
      if (!target.bedId) return
      const removed = placedBeds.remove(target.bedId)
      if (!removed) return
      collisionWorld.removeBuildBox(removed.collisionKey)
      inventory.add('bed', 1)
      requestShadowUpdate()
      info.textContent = 'Mined bed (+1 bed)'
      wearTool()
      return
    }

    if (target.kind === 'ballista') {
      if (!target.ballistaId) return
      if (inventory.getOpenContainerId() === target.ballistaId) {
        inventory.closePanel(onInventoryLock)
      }
      const removed = placedBallistas.remove(target.ballistaId)
      if (!removed) return
      collisionWorld.removeBuildBox(removed.collisionKey)
      const contents = placedBallistas.takeAllStacks(removed)
      inventory.add('ballista', 1)
      const overflow: {
        item: (typeof contents)[number]['item']
        count: number
        durability?: number
      }[] = []
      for (const stack of contents) {
        const stored = inventory.add(stack.item, stack.count, stack.durability)
        const left = stack.count - stored
        if (left > 0) {
          overflow.push({
            item: stack.item,
            count: left,
            durability: stack.durability,
          })
        }
      }
      if (overflow.length > 0) {
        camera.getWorldDirection(_dropForward)
        _dropForward.y = 0
        if (_dropForward.lengthSq() < 1e-6) _dropForward.set(0, 0, -1)
        else _dropForward.normalize()
        for (const stack of overflow) {
          groundItems.spawnFromPlayer(
            stack.item,
            stack.count,
            removed.group.position,
            _dropForward,
            stack.durability,
          )
        }
      }
      requestShadowUpdate()
      info.textContent =
        contents.length > 0
          ? `Mined ballista (+1 ballista) — emptied hopper`
          : 'Mined ballista (+1 ballista)'
      wearTool()
      return
    }

    if (target.kind === 'catapult') {
      if (!target.catapultId) return
      if (inventory.getOpenContainerId() === target.catapultId) {
        inventory.closePanel(onInventoryLock)
      }
      const removed = placedCatapults.remove(target.catapultId)
      if (!removed) return
      collisionWorld.removeBuildBox(removed.collisionKey)
      const contents = placedCatapults.takeAllStacks(removed)
      inventory.add('catapult', 1)
      const overflow: {
        item: (typeof contents)[number]['item']
        count: number
        durability?: number
      }[] = []
      for (const stack of contents) {
        const stored = inventory.add(stack.item, stack.count, stack.durability)
        const left = stack.count - stored
        if (left > 0) {
          overflow.push({
            item: stack.item,
            count: left,
            durability: stack.durability,
          })
        }
      }
      if (overflow.length > 0) {
        camera.getWorldDirection(_dropForward)
        _dropForward.y = 0
        if (_dropForward.lengthSq() < 1e-6) _dropForward.set(0, 0, -1)
        else _dropForward.normalize()
        for (const stack of overflow) {
          groundItems.spawnFromPlayer(
            stack.item,
            stack.count,
            removed.group.position,
            _dropForward,
            stack.durability,
          )
        }
      }
      requestShadowUpdate()
      info.textContent =
        contents.length > 0
          ? `Mined catapult (+1 catapult) — emptied hopper`
          : 'Mined catapult (+1 catapult)'
      wearTool()
      return
    }

    const cell = target.cell
    if (!cell) return

    if (target.kind === 'surface') {
      const layer = target.layer
      if (layer === undefined || !cellHasSurfaceLayer(cell, layer)) return
      // Clear the layer BEFORE tearing down dig preview / remeshing. Preview
      // unpeel rebuilds the chunk — doing that first baked the dug piece back in.
      clearSurfaceLayer(cell, layer)
      hideSurfaceLayerMeshes(cell, layer)
      disposeEmptySurfaceRoot(cell)
      setSurfaceDigPreview(null)
      patchCellCollision(cell)
      // Deferred remesh — pickHit already skips stale surface layers, and
      // sync rebuildChunk was the main dig hitch (especially while jumping).
      surfaceChunks.markDirtyForCell(cell)
      refreshEnemiesAfterTerrainDig(
        enemies,
        cell,
        cellSize,
        voxelSize,
        { surface: true, layer },
        collisionWorld,
        capsuleCollider,
      )
      inventory.add('dirt', DIRT_PER_DIG)
      info.textContent = `Mined dirt (+${DIRT_PER_DIG} dirt)`
      wearTool()
      return
    }

    const layer = target.layer
    if (layer === undefined || !voxelInstancer.hasLayer(cell, layer)) return

    const minedOre =
      target.oreType ??
      (target.isIronOre ? 'iron' : null) ??
      voxelInstancer.oreTypeAt(cell, layer)
    dropSpearsFromVoxel(cell.key, layer, thrownSpears)
    dropArrowsFromVoxel(cell.key, layer, thrownArrows)
    voxelInstancer.hideLayer(cell, layer, voxelSize)
    patchCellCollision(cell)
    // Only remesh when this column still has a surface cap (Y-clip may change).
    if (cell.surfaceRoot && (cell.surfaceLayerMask ?? 0) !== 0) {
      surfaceChunks.markDirtyForCell(cell)
    }
    refreshEnemiesAfterTerrainDig(
      enemies,
      cell,
      cellSize,
      voxelSize,
      { layer },
      collisionWorld,
      capsuleCollider,
    )

    if (minedOre) {
      const item = oreMaterialItem(minedOre)
      const yieldCount = oreYield(minedOre)
      inventory.add(item, yieldCount)
      info.textContent = `Mined ${item} (+${yieldCount} ${item})`
      wearTool()
      return
    }

    inventory.add('dirt', DIRT_PER_DIG)

    const remaining = voxelInstancer.layerCount(cell)
    info.textContent =
      remaining > 0 || cell.surfaceLayerMask !== 0
        ? `Mined dirt (+${DIRT_PER_DIG} dirt)`
        : `Mined dirt (+${DIRT_PER_DIG} dirt) — column fully excavated`
    wearTool()
  }

  function pickHit(forBuild = false): THREE.Intersection | null {
    aimDigRaycaster()
    _pickHits.length = 0
    // Dig/build reach is short — skip far merged chunks instead of testing ~100+ meshes.
    const px = player.object.position.x
    const pz = player.object.position.z
    const chunkPickR = DIG_REACH + 8
    const chunkPickRSq = chunkPickR * chunkPickR
    for (const child of surfaceChunks.group.children) {
      if (!(child instanceof THREE.Mesh) || !child.visible) continue
      const bs = child.geometry.boundingSphere
      if (bs) {
        const dx = bs.center.x - px
        const dz = bs.center.z - pz
        const r = bs.radius + chunkPickR
        if (dx * dx + dz * dz > r * r) continue
        // Skip nearby-but-off-aim chunks — BVH raycast was still expensive on them.
        _chunkPickSphere.center.copy(bs.center)
        _chunkPickSphere.radius = bs.radius + 0.5
        if (!raycaster.ray.intersectsSphere(_chunkPickSphere)) continue
      } else {
        const dx = child.position.x - px
        const dz = child.position.z - pz
        if (dx * dx + dz * dz > chunkPickRSq) continue
      }
      raycaster.intersectObject(child, false, _pickHits)
    }
    const digPreview = surfaceDigPreviewCell?.surfaceRoot
    if (digPreview?.visible) {
      raycaster.intersectObject(digPreview, true, _pickHits)
    }
    collectVoxelRayHits(_pickHits)
    if (blockBuilder.count > 0) {
      blockBuilder.intersectMeshes(raycaster, _pickHits)
    }
    if (forBuild) {
      // Bedrock slab under the deepest voxels — solid floor you can build on.
      raycaster.intersectObject(base, false, _pickHits)
    }
    if (!forBuild) {
      // Dig/melee: include torches/chests/beds so they can be mined. Build placement skips
      // them so aim reaches the voxel/terrain/block surface behind the prop.
      if (placedTorches.count > 0) {
        placedTorches.intersectMeshes(raycaster, _pickHits)
      }
      if (placedChests.count > 0) {
        placedChests.intersectMeshes(raycaster, _pickHits)
      }
      if (placedBeds.count > 0) {
        placedBeds.intersectMeshes(raycaster, _pickHits)
      }
      if (placedBallistas.count > 0) {
        placedBallistas.intersectMeshes(raycaster, _pickHits)
      }
      if (placedCatapults.count > 0) {
        placedCatapults.intersectMeshes(raycaster, _pickHits)
      }
      // Dig/melee reach is short — skip far props/enemies in the pick raycast.
      const pickR = DIG_REACH + 2.5
      const pickRSq = pickR * pickR
      for (const tree of placedTrees) {
        const dx = tree.position.x - px
        const dz = tree.position.z - pz
        if (dx * dx + dz * dz > pickRSq) continue
        raycaster.intersectObject(tree, true, _pickHits)
      }
      for (const rock of placedRocks) {
        const dx = rock.position.x - px
        const dz = rock.position.z - pz
        if (dx * dx + dz * dz > pickRSq) continue
        raycaster.intersectObject(rock, true, _pickHits)
      }
      for (const enemy of enemies) {
        const ep = enemy.root.position
        const dx = ep.x - px
        const dz = ep.z - pz
        if (dx * dx + dz * dz > pickRSq) continue
        raycaster.intersectObject(enemy.pickMesh, false, _pickHits)
      }
    }
    if (_pickHits.length === 0) return null

    // Nearest-first so we never dig / place through a closer blocker.
    _pickHits.sort((a, b) => a.distance - b.distance)

    let best: THREE.Intersection | null = null
    let bestBuildBlock: THREE.Intersection | null = null
    for (const hit of _pickHits) {
      if (
        hit.object.userData.skipDigPick &&
        !(forBuild && hit.object.userData.buildFloor)
      ) {
        continue
      }
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

      // Skip stale merged-surface tris (layer already dug, remesh pending) so we
      // don't mine "invisible" pieces or tunnel through to blocks behind them.
      const terrainCell = getCellFromHit(hit)
      if (terrainCell && isSurfaceDigHit(hit, terrainCell)) {
        if (surfaceLayerFromHit(terrainCell, hit) === null) continue
      }

      if (forBuild) {
        if (!best) best = hit
        if (
          blockBuilder.isBlockMesh(hit.object) &&
          (!bestBuildBlock || dist < digHitDistanceFromCamera(bestBuildBlock))
        ) {
          bestBuildBlock = hit
        }
        // Keep scanning near-equal block hits for the preference rule below.
        if (best && dist > digHitDistanceFromCamera(best) + 0.05) break
        continue
      }

      // Dig: first live hit wins. Enemies cancel dig in updateDig; props/blocks/terrain dig.
      return hit
    }
    if (forBuild && bestBuildBlock) {
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

  /** Build placement ignores trees/rocks/torches so aim reaches terrain, voxels, and blocks. */
  function pickBuildHit(): THREE.Intersection | null {
    return pickHit(true)
  }

  function clearDigState(cancelFx = true) {
    if (cancelFx) digBreakFx.cancel()
    else digBreakFx.releaseHidden()
    digCrackOverlay.clear()
    digBlockOutline.clear()
    setSurfaceDigPreview(null)
    voxelInstancer.restoreDigHidden(cells, voxelSize)
    digEffectId = null
    digTarget = null
    digProgress = 0
    cachedDigHit = null
    digPickHasQuat = false
    digPickTimer = 0
    document.body.classList.remove('digging')
    if (
      !document.body.classList.contains('reloading') &&
      !document.body.classList.contains('world-loading')
    ) {
      digProgressFill.style.setProperty('--dig-deg', '0deg')
    }
  }

  function updateSpearReloadHud(diggingActive: boolean) {
    if (document.body.classList.contains('world-loading')) {
      document.body.classList.remove('reloading')
      return
    }
    const panelOpen = inventory.isPanelOpen()
    // Bow draw / fire cooldown reuse the dig ring for aim feedback.
    if (player.isLocked() && !panelOpen && !diggingActive) {
      if (bowDrawHeld) {
        const progress = Math.min(1, bowDrawT / BOW_DRAW_DURATION)
        // Skip the ring on micro-holds so rapid tap-draw doesn't flash it.
        if (progress < BOW_DRAW_HUD_MIN) {
          document.body.classList.remove('reloading')
          digProgressFill.style.setProperty('--dig-deg', '0deg')
          return
        }
        document.body.classList.add('reloading')
        digProgressFill.style.setProperty('--dig-deg', `${progress * 360}deg`)
        return
      }
      if (bowFireCooldown > 0 && inventory.getHeldItem() === 'bow') {
        const progress = 1 - bowFireCooldown / BOW_FIRE_COOLDOWN
        document.body.classList.add('reloading')
        digProgressFill.style.setProperty('--dig-deg', `${progress * 360}deg`)
        return
      }
    }
    const reloading =
      player.isLocked() &&
      !panelOpen &&
      (spearThrowCooldown > 0 || orbThrowCooldown > 0) &&
      !diggingActive
    if (!reloading) {
      document.body.classList.remove('reloading')
      return
    }
    const cooldown = Math.max(spearThrowCooldown, orbThrowCooldown)
    const progress = 1 - cooldown / SPEAR_THROW_COOLDOWN
    document.body.classList.add('reloading')
    digProgressFill.style.setProperty('--dig-deg', `${progress * 360}deg`)
  }

  onInventoryLock = (locked: boolean) => {
    if (locked) {
      beginPlay()
    } else {
      endPlay()
      digMouseDown = false
      secondaryMouseDown = false
      clearDigState()
      blockBuilder.setGhost(null)
      placedTorches.setGhost(null, null, false)
      placedChests.setGhost(null, null, false)
      placedBeds.setGhost(null, null, false)
      placedBallistas.setGhost(null, null, false)
      placedCatapults.setGhost(null, null, false)
      plantedSaplings.setGhost(null, null, false)
    }
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

    if (target.kind === 'rock') {
      digBreakFx.startFromObject(
        target.visualRoot,
        stoneBreakMaterial,
        getDebrisDivisions(),
        digFxOptions(false, 'stone'),
      )
      return
    }
    if (target.kind === 'tree') {
      digBreakFx.startFromObject(
        target.visualRoot,
        treeBreakMaterial,
        getTreeDebrisDivisions(),
        digFxOptions(false, 'tree'),
      )
      return
    }

    if (target.kind === 'block' && target.blockKey) {
      const blockType = target.blockType ?? 'dirt'
      const mat = blockMaterialFor(blockType)
      const style =
        blockType === 'stone' ||
        blockType === 'iron' ||
        blockType === 'gold' ||
        blockType === 'diamond'
          ? 'stone'
          : blockType === 'wood'
            ? 'wood'
            : 'dirt'
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
      const ore =
        target.oreType ??
        (target.isIronOre ? 'iron' : null) ??
        voxelInstancer.oreTypeAt(cell, layer)
      const oreMat =
        ore === 'diamond'
          ? diamondMaterial
          : ore === 'gold'
            ? goldMaterial
            : ore === 'iron'
              ? ironMaterial
              : null
      voxelBoundsBox(cell, layer, _boundsBox)
      digBreakFx.startFromBox(
        _boundsBox,
        oreMat ?? dirtMaterial,
        getDebrisDivisions(),
        [],
        digFxOptions(excludeBottomFace, oreMat ? 'stone' : 'dirt'),
      )
      return
    }

    if (target.kind === 'surface' && cell.surfaceRoot && target.layer !== undefined) {
      // Do not peel/remesh for dig preview — that sync rebuild lagged dig+jump.
      // Ghost re-digs are already blocked by surfaceLayerFromHit / layer masks.
      const layer = target.layer
      const excludeBottomFace =
        layer < voxelLayers - 1 &&
        (voxelInstancer.hasLayer(cell, layer + 1) || cellHasSurfaceLayer(cell, layer + 1))
      voxelBoundsBox(cell, layer, _boundsBox)
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
    }
    if (target.visualRoot) {
      digBreakFx.startFromObject(
        target.visualRoot,
        dirtMaterial,
        getDebrisDivisions(),
        digFxOptions(false, 'dirt'),
      )
    }
  }

  function digTargetFromHit(hit: THREE.Intersection): DigTarget | null {
    const torchId = placedTorches.findIdFromObject(hit.object)
    if (torchId) {
      const torch = placedTorches.get(torchId)
      if (torch) {
        return {
          id: `torch:${torchId}`,
          kind: 'torch',
          torchId,
          visualRoot: torch.group,
        }
      }
    }

    const chestId = placedChests.findIdFromObject(hit.object)
    if (chestId) {
      const chest = placedChests.get(chestId)
      if (chest) {
        return {
          id: `chest:${chestId}`,
          kind: 'chest',
          chestId,
          visualRoot: chest.group,
        }
      }
    }

    const bedId = placedBeds.findIdFromObject(hit.object)
    if (bedId) {
      const bed = placedBeds.get(bedId)
      if (bed) {
        return {
          id: `bed:${bedId}`,
          kind: 'bed',
          bedId,
          visualRoot: bed.group,
        }
      }
    }

    const ballistaId = placedBallistas.findIdFromObject(hit.object)
    if (ballistaId) {
      const ballista = placedBallistas.get(ballistaId)
      if (ballista) {
        return {
          id: `ballista:${ballistaId}`,
          kind: 'ballista',
          ballistaId,
          visualRoot: ballista.group,
        }
      }
    }

    const catapultId = placedCatapults.findIdFromObject(hit.object)
    if (catapultId) {
      const catapult = placedCatapults.get(catapultId)
      if (catapult) {
        return {
          id: `catapult:${catapultId}`,
          kind: 'catapult',
          catapultId,
          visualRoot: catapult.group,
        }
      }
    }

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
      const oreType =
        voxelInstancer.oreTypeFromMesh(hit.object) ?? voxelInstancer.oreTypeAt(cell, layer)
      return {
        id: `${cellKey(cell.ix, cell.iy)}:voxel:${layer}`,
        cell,
        kind: 'voxel',
        layer,
        visualRoot: hit.object,
        isIronOre: oreType === 'iron',
        oreType,
      }
    }

    if (cell.surfaceRoot && isSurfaceDigHit(hit, cell)) {
      const layer = surfaceLayerFromHit(cell, hit)
      if (layer === null) return null
      return {
        id: `${cellKey(cell.ix, cell.iy)}:surface:${layer}`,
        cell,
        kind: 'surface',
        layer,
        visualRoot: cell.surfaceRoot,
      }
    }

    return null
  }

  function digTargetStillValid(target: DigTarget): boolean {
    if (target.kind === 'torch') {
      return target.torchId !== undefined && placedTorches.get(target.torchId) !== undefined
    }
    if (target.kind === 'chest') {
      return target.chestId !== undefined && placedChests.get(target.chestId) !== undefined
    }
    if (target.kind === 'bed') {
      return target.bedId !== undefined && placedBeds.get(target.bedId) !== undefined
    }
    if (target.kind === 'ballista') {
      return (
        target.ballistaId !== undefined &&
        placedBallistas.get(target.ballistaId) !== undefined
      )
    }
    if (target.kind === 'catapult') {
      return (
        target.catapultId !== undefined &&
        placedCatapults.get(target.catapultId) !== undefined
      )
    }
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
    if (target.kind === 'surface') {
      return target.layer !== undefined && cellHasSurfaceLayer(cell, target.layer)
    }
    if (target.layer === undefined) return false
    return voxelInstancer.hasLayer(cell, target.layer)
  }

  let lastMeleeSwingImpact = 0
  let meleeHitThisSwing = false
  /** Strike intensity at which the blade can connect (window stays open until swing ends). */
  const MELEE_HIT_IMPACT = 0.42
  const _meleeFwd = new THREE.Vector3()
  const _meleeTo = new THREE.Vector3()
  const _meleeHits: EnemyInstance[] = []
  const _meleeSpiderHits: SpiderInstance[] = []

  function tryMeleeEnemyHit() {
    const impact = viewmodelHand.getSwingImpact()
    if (impact <= 0) {
      lastMeleeSwingImpact = 0
      meleeHitThisSwing = false
      return
    }
    lastMeleeSwingImpact = impact
    // Keep the hit window open through the swing peak so late aim / closing range still connects.
    if (meleeHitThisSwing || impact < MELEE_HIT_IMPACT) return

    const held = inventory.getHeldItem()
    const { damage: dmg, reach, sweepDeg } = meleeStatsForItem(held)
    const facingMin = meleeFacingMinForSweepDeg(sweepDeg)

    // Proximity sweep — avoid full-world pickHit (terrain + trees + rocks) on every swing.
    camera.getWorldDirection(_meleeFwd)
    _meleeFwd.y = 0
    if (_meleeFwd.lengthSq() < 1e-8) return
    _meleeFwd.normalize()

    const eye = camera.position
    _meleeHits.length = 0
    _meleeSpiderHits.length = 0
    for (const enemy of enemies) {
      const ep = enemy.root.position
      const dx = ep.x - eye.x
      const dz = ep.z - eye.z
      const dist = Math.hypot(dx, dz)
      // Pad reach by the enemy's body so grazing the silhouette still counts.
      const bodyR = Math.max(enemy.colHalfX, enemy.colHalfZ)
      if (dist - bodyR > reach) continue
      _meleeTo.set(dx, 0, dz)
      if (dist > 1e-4) _meleeTo.multiplyScalar(1 / dist)
      const facing = _meleeTo.dot(_meleeFwd)
      if (facing < facingMin) continue
      _meleeHits.push(enemy)
    }
    for (const spider of spiders) {
      const ep = spider.root.position
      const dx = ep.x - eye.x
      const dz = ep.z - eye.z
      const dist = Math.hypot(dx, dz)
      const bodyR = Math.max(spider.colHalfX, spider.colHalfZ)
      if (dist - bodyR > reach) continue
      _meleeTo.set(dx, 0, dz)
      if (dist > 1e-4) _meleeTo.multiplyScalar(1 / dist)
      if (_meleeTo.dot(_meleeFwd) < facingMin) continue
      _meleeSpiderHits.push(spider)
    }
    if (_meleeHits.length === 0 && _meleeSpiderHits.length === 0) return

    meleeHitThisSwing = true
    const p = player.object.position
    for (const enemy of _meleeHits) {
      const knock = meleeKnockbackForEnemy(held, enemy)
      damageEnemy(enemy, dmg, enemiesGroup, enemies, p.x, p.z, knock, getEnemyDeathContext())
    }
    for (const spider of _meleeSpiderHits) {
      damageSpider(
        spider,
        dmg,
        spidersGroup,
        spiders,
        p.x,
        p.z,
        SPIDER_HIT_KNOCKBACK_SPEED,
        getSpiderDeathContext(),
      )
    }
    if (inventory.damageHeldTool(1)) {
      info.textContent = 'Your tool broke'
    }
  }

  function updateDig(dt: number) {
    if (!player.isLocked()) {
      clearDigState()
      return
    }

    // Full pickHit was ~half of frame time while the dig button is held. Re-pick
    // only when aim moves or on a short heartbeat — progress still advances every frame.
    digPickTimer += dt
    const rotDelta = digPickHasQuat ? camera.quaternion.angleTo(_digPickQuat) : Infinity
    const needPick =
      !digPickHasQuat ||
      !digTarget ||
      rotDelta > DIG_PICK_ROT_EPS ||
      digPickTimer >= DIG_PICK_HEARTBEAT

    let hit = cachedDigHit
    if (needPick) {
      hit = pickHit()
      cachedDigHit = hit
      _digPickQuat.copy(camera.quaternion)
      digPickHasQuat = true
      digPickTimer = 0
    }

    let target = digTarget
    if (hit) {
      if (enemyFromIntersection(hit, enemies) || spiderFromIntersection(hit, spiders)) {
        target = null
        digTarget = null
        digProgress = 0
        return
      }
      const picked = digTargetFromHit(hit)
      // Axe: trees, chests, beds, ballistas, and rocks — skip dig overlay on dirt/ore behind them.
      if (
        picked &&
        inventory.isAxeEquipped() &&
        picked.kind !== 'tree' &&
        picked.kind !== 'chest' &&
        picked.kind !== 'bed' &&
        picked.kind !== 'ballista' &&
        picked.kind !== 'catapult' &&
        picked.kind !== 'rock'
      ) {
        if (target) clearDigState()
        return
      }
      if (picked) {
        if (!target || target.id !== picked.id) {
          if (target) clearDigState()
          target = picked
          digTarget = picked
          digProgress = 0
        }
      } else {
        // Closest live hit isn't diggable — don't keep mining something behind it.
        if (target) clearDigState()
        return
      }
    } else {
      // Lost aim (sky / out of reach) — stop; don't finish a dig you can't see.
      if (target) clearDigState()
      return
    }

    if (!target) return
    if (
      inventory.isAxeEquipped() &&
      target.kind !== 'tree' &&
      target.kind !== 'chest' &&
      target.kind !== 'bed' &&
      target.kind !== 'ballista' &&
      target.kind !== 'catapult' &&
      target.kind !== 'rock'
    ) {
      clearDigState()
      return
    }
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
            ? (oreDigTimeBase(target.oreType ?? (target.isIronOre ? 'iron' : null)) ??
              VOXEL_DIG_TIME_BASE)
            : target.kind === 'torch'
              ? TORCH_DIG_TIME_BASE
              : target.kind === 'chest'
                ? CHEST_DIG_TIME_BASE
                : target.kind === 'bed'
                  ? BED_DIG_TIME_BASE
                  : target.kind === 'ballista'
                    ? BALLISTA_DIG_TIME_BASE
                    : target.kind === 'catapult'
                      ? CATAPULT_DIG_TIME_BASE
                      : target.kind === 'rock'
                      ? ROCK_DIG_TIME_BASE
                      : TREE_DIG_TIME_BASE *
                        (target.propRef ? treeGrowthFraction(target.propRef) : 1)
    const digTime =
      digTimeBase /
      (getDigSpeed() *
        digToolMultiplier(inventory.getHeldItem(), {
          kind: target.kind,
          blockType: target.blockType,
          isIronOre: target.isIronOre,
          oreType: target.oreType,
        }))
    digProgress = Math.min(1, digProgress + dt / digTime)
    digBreakFx.update(digProgress)
    const crackStyle =
      target.kind === 'rock' ||
      target.blockType === 'stone' ||
      target.blockType === 'iron' ||
      target.blockType === 'gold' ||
      target.blockType === 'diamond' ||
      target.isIronOre ||
      !!target.oreType
        ? 'stone'
        : target.kind === 'tree' ||
            target.blockType === 'wood' ||
            target.kind === 'torch' ||
            target.kind === 'chest' ||
            target.kind === 'bed' ||
            target.kind === 'ballista' ||
            target.kind === 'catapult'
          ? 'wood'
          : 'dirt'
    digCrackOverlay.setStyle(crackStyle)
    // One bounds sample per frame — used to be 2–3× setFromObject/box updates.
    const hasBreakBox = sampleDigBreakWorldBox(target, _boundsBox)
    if (hasBreakBox) {
      // Surface/voxels are layer AABBs; conforming overlay is for curved props only.
      const conform =
        target.kind !== 'voxel' &&
        target.kind !== 'block' &&
        target.kind !== 'surface' &&
        target.visualRoot !== undefined
      if (conform) {
        digCrackOverlay.setFromObject(target.visualRoot, _boundsBox, digProgress)
      } else {
        digCrackOverlay.setFromBox(_boundsBox, digProgress)
      }
      digBlockOutline.setFromBox(_boundsBox)
    } else {
      digCrackOverlay.clear()
      digBlockOutline.clear()
    }

    document.body.classList.add('digging')
    if (!document.body.classList.contains('world-loading')) {
      digProgressFill.style.setProperty('--dig-deg', `${digProgress * 360}deg`)
    }

    if (digProgress >= 1) {
      if (hasBreakBox) {
        digBreakFx.refreshBreakBox(_boundsBox)
      }
      digBreakFx.releaseHidden()
      completeDig(target)
      const finishOre = target.oreType ?? (target.isIronOre ? 'iron' : null)
      const finishMat =
        target.kind === 'rock' || target.blockType === 'stone'
          ? stoneBreakMaterial
          : finishOre === 'diamond' || target.blockType === 'diamond'
            ? diamondBreakMaterial
            : finishOre === 'gold' || target.blockType === 'gold'
              ? goldBreakMaterial
              : finishOre === 'iron' || target.blockType === 'iron'
                ? ironBreakMaterial
                : target.kind === 'tree'
                  ? treeBreakMaterial
                  : target.blockType === 'wood' ||
                      target.kind === 'chest' ||
                      target.kind === 'bed' ||
                      target.kind === 'ballista' ||
                      target.kind === 'catapult'
                    ? woodBreakMaterial
                    : dirtMaterial
      digBreakFx.finish(finishMat)
      clearDigState(false)
    }
  }

  function isDigging() {
    return (
      digMouseDown ||
      keys.has('KeyN') ||
      (touchControls.enabled && touchControls.isPrimaryHeld())
    )
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
  // 1.6 m + load-defer cuts hitch cadence while walking.
  const SHADOW_MOVE_EPS_SQ = 1.6 * 1.6
  const lastShadowPos = new THREE.Vector3(Infinity, 0, 0)
  let shadowUpdateDeferred = false
  const lastVisibilityPos = new THREE.Vector3(Infinity, 0, 0)
  const VISIBILITY_MOVE_EPS_SQ = 0.4 * 0.4
  let frameMs = 16
  /** Worst raw frame in the current HUD window — catches hitching the EMA hides. */
  let frameMsPeak = 0
  let adaptTimer = 0
  const ADAPT_INTERVAL = 0.75
  // Slow frames → drop resolution; comfortable frames → climb back toward 1.
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

  // ---- Temporary CPU profiler (enable with ?prof in the URL) ---------------
  const profEnabled = location.search.includes('prof')
  const profAccum: Record<string, number> = {}
  let profFrames = 0
  let profElapsed = 0
  let profMark = 0
  const profStart = () => {
    if (profEnabled) profMark = performance.now()
  }
  const profEnd = (label: string) => {
    if (!profEnabled) return
    const now = performance.now()
    profAccum[label] = (profAccum[label] ?? 0) + (now - profMark)
    profMark = now
  }
  const profReport = (dt: number) => {
    if (!profEnabled) return
    profFrames++
    profElapsed += dt
    if (profElapsed < 1) return
    const parts = Object.entries(profAccum)
      .map(([k, v]) => `${k}=${(v / profFrames).toFixed(2)}ms`)
      .sort()
    // eslint-disable-next-line no-console
    console.log(
      `[prof] fps=${(profFrames / profElapsed).toFixed(0)} ` + parts.join(' '),
    )
    for (const k of Object.keys(profAccum)) profAccum[k] = 0
    profFrames = 0
    profElapsed = 0
  }

  function updatePerfHud() {
    const fps = Math.max(0, Math.round(1000 / Math.max(frameMs, 0.0001)))
    const ms = Math.round(frameMs)
    const peak = Math.round(frameMsPeak)
    frameMsPeak = 0
    // Color by hitch peak, not smoothed average — average can read 60 while
    // periodic 40–80ms spikes make motion feel like ~10 fps.
    const fpsClass = peak <= 22 && fps >= 55 ? '' : peak <= 40 && fps >= 35 ? 'warn' : 'bad'
    const renderScale = Math.round(qualityMaxPixelRatio * adaptivePixelScale * 100)
    const quality = graphicsValue.textContent ?? ''
    const peakBit =
      peak > ms + 6 ? `<span class="perf-sub">peak ${peak}ms</span>` : ''
    perfHud.innerHTML =
      `<span class="perf-fps ${fpsClass}">${fps}</span>` +
      `<span class="perf-sub">fps</span>` +
      `<span class="perf-sub">${ms}ms</span>` +
      peakBit +
      `<span class="perf-sub">${quality} · ${renderScale}%</span>`
  }

  let wallFramePrev = performance.now()

  /** Hold the overlay until frame times recover after the heavy boot hitch. */
  const waitForStableFps = () => {
    const GOOD_MS = 22
    const NEED_STREAK = 45
    const TIMEOUT_MS = 12000
    const startedAt = performance.now()
    let streak = 0
    let settleProgress = 0
    // Ignore the first few frames — they often include post-load GC/compile spikes.
    let ignore = 8

    return new Promise<void>((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - startedAt
        if (ignore > 0) {
          ignore--
          frameMsPeak = 0
          requestAnimationFrame(tick)
          return
        }
        // Gate on smoothed frame time; peak is reset so one old hitch doesn't stick.
        const good = frameMs <= GOOD_MS
        frameMsPeak = 0
        if (good) streak++
        else streak = Math.max(0, streak - 3)
        settleProgress = Math.max(settleProgress, streak / NEED_STREAK)
        setLoadingProgress(
          LOAD_W_SETUP +
            LOAD_W_SURFACE +
            LOAD_W_BUILD +
            LOAD_W_PROPS +
            settleProgress * LOAD_W_SETTLE,
          'Warming up…',
        )
        if (streak >= NEED_STREAK || elapsed >= TIMEOUT_MS) {
          setLoadingProgress(1, 'Ready')
          resolve()
          return
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }

  function animate() {
    requestAnimationFrame(animate)
    const wallNow = performance.now()
    const wallMs = wallNow - wallFramePrev
    wallFramePrev = wallNow
    const rawDt = clock.getDelta()
    // Prefer wall-clock for HUD/adapt — Clock can under-report when the tab
    // stutters or getDelta is affected by other work.
    const rawMs = Math.max(rawDt * 1000, wallMs)
    const dt = Math.min(rawMs / 1000, 0.05)

    frameMs += (rawMs - frameMs) * 0.25
    frameMsPeak = Math.max(frameMsPeak, rawMs)
    adaptTimer += dt
    adaptCooldown = Math.max(0, adaptCooldown - dt)
    // Don't drop render scale during boot settle — we gate on full-quality FPS.
    if (document.body.classList.contains('world-loading')) {
      adaptTimer = 0
    } else if (adaptTimer >= ADAPT_INTERVAL && adaptCooldown <= 0) {
      adaptTimer = 0
      if (!adaptiveResolution.enabled) {
        if (adaptivePixelScale !== 1) {
          adaptivePixelScale = 1
          commitPixelRatio()
          adaptCooldown = ADAPT_COOLDOWN_SEC
        }
      } else if (
        frameMs > adaptiveResolution.frameMsHigh &&
        adaptivePixelScale > adaptiveResolution.floor
      ) {
        // Drop faster the worse the frame time is, so weak GPUs settle quickly
        // instead of crawling down 6% at a time over several seconds.
        const drop = frameMs > 40 ? 0.16 : frameMs > 28 ? 0.1 : 0.06
        const next = Math.max(adaptiveResolution.floor, adaptivePixelScale - drop)
        if (next !== adaptivePixelScale) {
          adaptivePixelScale = next
          commitPixelRatio()
          adaptCooldown = ADAPT_COOLDOWN_SEC
        }
      } else if (
        frameMs < adaptiveResolution.frameMsLow &&
        adaptivePixelScale < 1
      ) {
        // Climb slowly and only when truly comfortable — climbing reallocates the
        // drawing buffer and was a major source of "60fps but hitchy" feel.
        const next = Math.min(1, adaptivePixelScale + 0.03)
        if (next !== adaptivePixelScale) {
          adaptivePixelScale = next
          commitPixelRatio()
          adaptCooldown = ADAPT_COOLDOWN_SEC * 1.2
        }
      }
    }

    worldTimeSec += dt
    if (sleeping) {
      updateSleep(dt)
    }
    const cycleT = cycleFactor(worldTimeSec)
    applyDayNight(worldTimeSec, dt)
    const night = nightStrength(cycleT)
    // Counter night tone-mapping so local lights stay bright relative to the scene.
    const exposureRatio = DEFAULT_BRIGHTNESS / Math.max(0.2, renderer.toneMappingExposure)
    const localLightExposureScale = THREE.MathUtils.lerp(
      1,
      Math.min(2.8, exposureRatio),
      night,
    )
    applyEnemyLightDayNightAll(night)
    updateBerryGlow(treesGroup, night, localLightExposureScale, worldTimeSec)
    const skyDecorFade = 1 - shelterBlend
    skyDecor.update(
      worldTimeSec,
      cycleT,
      sunDirection,
      camera,
      lastSunColor,
      lastSkyTint,
      sky.visible && skyDecorFade > 0.03,
      skyDecorFade,
      dt,
    )

    const nowNight = isNight(cycleT)
    if (nowNight && !nightActive) nightActive = true
    if (!nowNight && nightActive) {
      nightActive = false
      enemySpawnTimer = 0
    }

    profStart()
    readInput()
    collisionWorld.beginFrame()
    player.update(dt, input)
    profEnd('player')
    updateSunShadow()

    const enemyCrawlSpeed = enemyCrawlSpeedFromSlider(Number(enemySpeedSlider.value))

    if (nowNight && enemyTemplate && playerHealth > 0) {
      const enemySpawnInterval = enemySpawnIntervalFromSlider(
        Number(enemySpawnRateSlider.value),
      )
      enemySpawnTimer += dt
      if (enemySpawnTimer >= enemySpawnInterval && enemies.length < ENEMY_MAX_ALIVE) {
        enemySpawnTimer = 0
        const playerPos = player.object.position
        const spot = pickRandomEnemySpawn(
          surfaceCells,
          playerPos.x,
          playerPos.z,
          gridMinX,
          gridMinZ,
          cellSize,
          gridSpan,
        )
        if (spot) {
          // Always mesh/voxel-resolve — spot.y is only a cap-top search hint and
          // sits above the walkable surface mesh.
          const gy = resolveEnemyGroundY(
            spot.x,
            spot.z,
            rockGround,
            collisionWorld,
            spot.y,
          )
          if (gy !== null) {
            const tier = rollEnemySpawnTier()
            const enemy = createEnemy(
              enemyTemplate,
              spot.x,
              gy,
              spot.z,
              enemiesGroup,
              enemiesGroup,
              { tier },
            )
            applyEnemyLightHeight(enemy.visual, enemyLightHeightOffset())
            if (enemy.innerLight) {
              applyEnemyLightDayNight(enemy.innerLight, nightStrength(cycleT))
            }
            enemies.push(enemy)
          }
        }
      }
    }

    if (playerHealth > 0 && !playerDead) {
      const nest = getSpiderNestParams()
      updateSpiderNestBeacon(
        spiderNestBeacon,
        nest,
        rockGround,
        collisionWorld,
        player.object.position.y,
      )
      tickSpiderNestSpawns(
        spiders,
        nest,
        player.object.position,
        spidersGroup,
        spidersGroup,
        rockGround,
        collisionWorld,
        spiderSpawnTimer,
        dt,
      )
    } else {
      updateSpiderNestBeacon(
        spiderNestBeacon,
        getSpiderNestParams(),
        rockGround,
        collisionWorld,
        player.object.position.y,
      )
    }

    enemyOrbDrops.update(dt, player.object.position)
    crystalBerryDrops.update(dt, player.object.position)
    groundItems.update(dt, player.object.position, !playerDead)

    if (playerDead) {
      deathRespawnTimer -= dt
      if (deathRespawnTimer <= 0) respawnPlayer()
    }

    if (enemies.length > 0) {
      despawnExpiredEnemies(enemies, enemiesGroup)
      cullExcessEnemies(enemies, enemiesGroup, player.object.position)
      profStart()
      const { damage, knockbackX, knockbackZ } = updateEnemies(
        enemies,
        player.object.position,
        rockGround,
        dt,
        enemyCrawlSpeed,
        (x, z, feetY, recoverBelow) =>
          player.probeWalkableY(x, z, feetY, ENEMY_STEP_HEIGHT, recoverBelow),
        collisionWorld,
        capsuleCollider,
      )
      profEnd('enemies')
      despawnOrphanEnemies(enemies, enemiesGroup, rockGround, collisionWorld, dt)
      despawnStuckEnemies(enemies, enemiesGroup, player.object.position, dt)
      if (damage > 0 && playerHealth > 0 && !playerDead) {
        playerHealth = Math.max(0, playerHealth - damage)
        syncHealthHud()
        player.applyHurtCameraShake()
        if (knockbackX !== 0 || knockbackZ !== 0) {
          player.applyKnockback(knockbackX, knockbackZ, ENEMY_KNOCKBACK_SPEED, ENEMY_KNOCKBACK_LIFT)
        }
        player.syncCamera()
        if (playerHealth <= 0) beginPlayerDeath()
      }
      syncEnemyHealthBars(enemies, camera)
    }

    if (spiders.length > 0) {
      const spiderResult = updateSpiders(
        spiders,
        player.object.position,
        rockGround,
        dt,
        collisionWorld,
      )
      if (spiderResult.damage > 0 && playerHealth > 0 && !playerDead) {
        playerHealth = Math.max(0, playerHealth - spiderResult.damage)
        syncHealthHud()
        player.applyHurtCameraShake()
        player.syncCamera()
        if (playerHealth <= 0) beginPlayerDeath()
      }
      syncSpiderHealthBars(spiders, camera)
    }

    if (renderer.shadowMap.enabled) {
      const p = player.object.position
      const movedFar = lastShadowPos.distanceToSquared(p) > SHADOW_MOVE_EPS_SQ
      if (forceShadowUpdate || movedFar || shadowUpdateDeferred) {
        // Shadow passes hitch hard. If this frame is already fat, defer until a
        // calmer one — except forced updates (dig/place) which must stay correct.
        const busy = frameMs > 20 || frameMsPeak > 28
        if (forceShadowUpdate || !busy) {
          renderer.shadowMap.needsUpdate = true
          lastShadowPos.copy(p)
          forceShadowUpdate = false
          shadowUpdateDeferred = false
        } else {
          shadowUpdateDeferred = true
        }
      }
    }

    visibilityTimer += dt
    {
      const p = player.object.position
      const moved =
        lastVisibilityPos.distanceToSquared(p) > VISIBILITY_MOVE_EPS_SQ
      // Standing still: stretch the cull interval — distant loads still catch up
      // via the longer heartbeat, without per-tick voxel matrix churn.
      const interval = moved ? visibilityInterval : visibilityInterval * 2.5
      if (visibilityTimer >= interval) {
        visibilityTimer = 0
        lastVisibilityPos.copy(p)
        refreshVisibilityNow()
      }
    }
    profEnd('visibility')

    const openChestId = inventory.getOpenContainerId()
    if (openChestId) {
      const openChest = placedChests.get(openChestId)
      const openBallista = placedBallistas.get(openChestId)
      const openCatapult = placedCatapults.get(openChestId)
      const openContainer = openChest ?? openBallista ?? openCatapult
      const holdReach = openCatapult ? CATAPULT_OPEN_HOLD_REACH : CHEST_OPEN_HOLD_REACH
      if (
        !openContainer ||
        openContainer.group.position.distanceToSquared(player.object.position) >
          holdReach * holdReach
      ) {
        inventory.closePanel(onInventoryLock)
      }
    }
    const panelOpen = inventory.isPanelOpen()
    viewmodelHand.group.visible = player.isLocked() && !panelOpen && !sleeping
    viewmodelHand.setHeldItem(inventory.getHeldItem())
    const holdingBow = inventory.getHeldItem() === 'bow'
    const holdingSwordOrSpear = inventory.isSwordOrSpearEquipped()
    if (!holdingBow) bowZoomHeld = false
    updateBowZoom(dt)
    if (bowFireCooldown > 0) bowFireCooldown = Math.max(0, bowFireCooldown - dt)
    if (bowDrawHeld && (!holdingBow || !player.isLocked() || panelOpen)) {
      cancelBowDraw()
    } else if (bowDrawHeld) {
      bowDrawT = Math.min(BOW_DRAW_DURATION, bowDrawT + dt)
      const drawAmount = bowDrawT / BOW_DRAW_DURATION
      viewmodelHand.setBowDraw(drawAmount)
      // Keep the nocked visual on the strongest arrow you still have.
      viewmodelHand.setNockedArrow(findBestArrow(inventory))
    }
    const drawingBow = holdingBow && (bowDrawHeld || viewmodelHand.isDrawingBow())
    // Sword/spear never mine. Axe still swings + can chop trees (filtered in updateDig).
    const swinging =
      isDigging() && !holdingBow && player.isLocked() && !panelOpen
    const digging = swinging && !holdingSwordOrSpear
    if (spearThrowCooldown > 0) spearThrowCooldown = Math.max(0, spearThrowCooldown - dt)
    if (orbThrowCooldown > 0) orbThrowCooldown = Math.max(0, orbThrowCooldown - dt)
    if (
      spearThrowHeld &&
      player.isLocked() &&
      !panelOpen &&
      isSpearItem(inventory.getHeldItem()) &&
      inventory.getSelectedCount() > 0
    ) {
      tryThrowSpear()
    } else if (!isSpearItem(inventory.getHeldItem())) {
      spearThrowHeld = false
    }
    if (
      orbThrowHeld &&
      player.isLocked() &&
      !panelOpen &&
      throwableOrbKind(inventory.getHeldItem()) &&
      inventory.getSelectedCount() > 0
    ) {
      tryThrowOrb()
    } else if (!throwableOrbKind(inventory.getHeldItem())) {
      orbThrowHeld = false
    }
    if (
      scissorsSnipHeld &&
      player.isLocked() &&
      !panelOpen &&
      inventory.getHeldItem() === 'scissors'
    ) {
      scissorsSnipTimer += dt
      if (scissorsSnipTimer >= SCISSORS_SNIP_INTERVAL) {
        scissorsSnipTimer = 0
        viewmodelHand.whack()
        tryHarvestLeaves()
      }
    } else if (inventory.getHeldItem() !== 'scissors') {
      scissorsSnipHeld = false
      scissorsSnipTimer = 0
    }
    viewmodelHand.update(dt, swinging && !viewmodelHand.isThrowing() && !drawingBow)
    releasePendingSpearThrow()
    releasePendingOrbThrow()
    if (player.isLocked() && !panelOpen && !drawingBow) {
      tryMeleeEnemyHit()
    } else if (lastMeleeSwingImpact > 0 || meleeHitThisSwing) {
      lastMeleeSwingImpact = 0
      meleeHitThisSwing = false
    }
    if (thrownSpears.length > 0) {
      const spearsPicked = updateThrownSpears(
        dt,
        thrownSpears,
        projectilesGroup,
        enemies,
        enemiesGroup,
        raycaster,
        {
          groundTargets: rockGround,
          trees: placedTrees,
          rocks: placedRocks,
          voxelMeshes: voxelInstancer.meshes,
          resolveVoxelHit: (mesh, instanceId) => {
            const layer = voxelInstancer.getLayerFromMesh(mesh)
            if (layer === undefined) return null
            const key = voxelInstancer.getCellKey(layer, instanceId)
            if (!key) return null
            const cell = cells.get(key)
            if (!cell || !voxelInstancer.hasLayer(cell, layer)) return null
            return { cellKey: key, layer }
          },
          intersectBuildBlocks: (rc, out) => {
            if (blockBuilder.count > 0) blockBuilder.intersectMeshes(rc, out)
          },
          resolveBuildBlockHit: (mesh, instanceId) => {
            if (!(mesh instanceof THREE.InstancedMesh)) return null
            if (!blockBuilder.isBlockMesh(mesh)) return null
            return blockBuilder.instanceCellKey(mesh, instanceId) ?? null
          },
          playerPos: player.object.position,
          inventory,
          deathCtx: getEnemyDeathContext(),
          collisionWorld,
          capsuleCollider,
          spiders,
          spidersGroup,
          spiderDeathCtx: getSpiderDeathContext(),
        },
      )
      if (spearsPicked > 0 && player.isLocked()) {
        info.textContent =
          spearsPicked === 1 ? 'Picked up spear' : `Picked up ${spearsPicked} spears`
      }
    }
    if (thrownArrows.length > 0 || hasGlowArrowBlasts()) {
      const arrowsPicked = updateThrownArrows(
        dt,
        thrownArrows,
        projectilesGroup,
        enemies,
        enemiesGroup,
        raycaster,
        {
          groundTargets: rockGround,
          trees: placedTrees,
          rocks: placedRocks,
          voxelMeshes: voxelInstancer.meshes,
          resolveVoxelHit: (mesh, instanceId) => {
            const layer = voxelInstancer.getLayerFromMesh(mesh)
            if (layer === undefined) return null
            const key = voxelInstancer.getCellKey(layer, instanceId)
            if (!key) return null
            const cell = cells.get(key)
            if (!cell || !voxelInstancer.hasLayer(cell, layer)) return null
            return { cellKey: key, layer }
          },
          intersectBuildBlocks: (rc, out) => {
            if (blockBuilder.count > 0) blockBuilder.intersectMeshes(rc, out)
          },
          resolveBuildBlockHit: (mesh, instanceId) => {
            if (!(mesh instanceof THREE.InstancedMesh)) return null
            if (!blockBuilder.isBlockMesh(mesh)) return null
            return blockBuilder.instanceCellKey(mesh, instanceId) ?? null
          },
          playerPos: player.object.position,
          inventory,
          deathCtx: getEnemyDeathContext(),
          collisionWorld,
          capsuleCollider,
          spiders,
          spidersGroup,
          spiderDeathCtx: getSpiderDeathContext(),
          onHeal: (amount) => {
            if (playerHealth <= 0 || playerDead) return
            const before = playerHealth
            playerHealth = Math.min(PLAYER_MAX_HEALTH, playerHealth + amount)
            if (playerHealth > before) {
              syncHealthHud()
              info.textContent = `+${Math.ceil(playerHealth - before)} health`
            }
          },
          onPlayerDamage: (amount) => {
            if (amount <= 0 || playerHealth <= 0 || playerDead) return
            playerHealth = Math.max(0, playerHealth - amount)
            syncHealthHud()
            player.applyHurtCameraShake()
            player.syncCamera()
            if (playerHealth <= 0) beginPlayerDeath()
          },
        },
      )
      if (arrowsPicked > 0 && player.isLocked()) {
        info.textContent =
          arrowsPicked === 1 ? 'Picked up arrow' : `Picked up ${arrowsPicked} arrows`
      }
    }
    if (thrownOrbs.length > 0 || hasOrbBlasts()) {
      updateThrownOrbs(
        dt,
        thrownOrbs,
        projectilesGroup,
        enemies,
        enemiesGroup,
        raycaster,
        {
          groundTargets: rockGround,
          trees: placedTrees,
          rocks: placedRocks,
          voxelMeshes: voxelInstancer.meshes,
          resolveVoxelHit: (mesh, instanceId) => {
            const layer = voxelInstancer.getLayerFromMesh(mesh)
            if (layer === undefined) return null
            const key = voxelInstancer.getCellKey(layer, instanceId)
            if (!key) return null
            const cell = cells.get(key)
            if (!cell || !voxelInstancer.hasLayer(cell, layer)) return null
            return { cellKey: key, layer }
          },
          intersectBuildBlocks: (rc, out) => {
            if (blockBuilder.count > 0) blockBuilder.intersectMeshes(rc, out)
          },
          resolveBuildBlockHit: (mesh, instanceId) => {
            if (!(mesh instanceof THREE.InstancedMesh)) return null
            if (!blockBuilder.isBlockMesh(mesh)) return null
            return blockBuilder.instanceCellKey(mesh, instanceId) ?? null
          },
          deathCtx: getEnemyDeathContext(),
          collisionWorld,
          capsuleCollider,
          playerPos: player.object.position,
          spiders,
          spidersGroup,
          spiderDeathCtx: getSpiderDeathContext(),
          onHeal: (amount) => {
            if (playerHealth <= 0 || playerDead) return
            const before = playerHealth
            playerHealth = Math.min(PLAYER_MAX_HEALTH, playerHealth + amount)
            if (playerHealth > before) {
              syncHealthHud()
              info.textContent = `+${Math.ceil(playerHealth - before)} health`
            }
          },
        },
      )
    }
    if (thrownCatapultRocks.length > 0 || hasCatapultRockBlasts()) {
      updateThrownCatapultRocks(
        dt,
        thrownCatapultRocks,
        projectilesGroup,
        enemies,
        enemiesGroup,
        raycaster,
        {
          groundTargets: rockGround,
          trees: placedTrees,
          rocks: placedRocks,
          voxelMeshes: voxelInstancer.meshes,
          resolveVoxelHit: (mesh, instanceId) => {
            const layer = voxelInstancer.getLayerFromMesh(mesh)
            if (layer === undefined) return null
            const key = voxelInstancer.getCellKey(layer, instanceId)
            if (!key) return null
            const cell = cells.get(key)
            if (!cell || !voxelInstancer.hasLayer(cell, layer)) return null
            return { cellKey: key, layer }
          },
          intersectBuildBlocks: (rc, out) => {
            if (blockBuilder.count > 0) blockBuilder.intersectMeshes(rc, out)
          },
          resolveBuildBlockHit: (mesh, instanceId) => {
            if (!(mesh instanceof THREE.InstancedMesh)) return null
            if (!blockBuilder.isBlockMesh(mesh)) return null
            return blockBuilder.instanceCellKey(mesh, instanceId) ?? null
          },
          deathCtx: getEnemyDeathContext(),
          collisionWorld,
          capsuleCollider,
          spiders,
          spidersGroup,
          spiderDeathCtx: getSpiderDeathContext(),
        },
      )
    }
    syncEnemyCountHud()
    if (digging) {
      blockBuilder.setGhost(null)
      placedTorches.setGhost(null, null, false)
      placedChests.setGhost(null, null, false)
      placedBeds.setGhost(null, null, false)
      placedBallistas.setGhost(null, null, false)
      placedCatapults.setGhost(null, null, false)
      plantedSaplings.setGhost(null, null, false)
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
          placedTorches.setGhost(null, null, false)
          placedChests.setGhost(null, null, false)
          placedBeds.setGhost(null, null, false)
          placedBallistas.setGhost(null, null, false)
          placedCatapults.setGhost(null, null, false)
          plantedSaplings.setGhost(null, null, false)
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else if (player.isLocked() && inventory.getHeldItem() === 'torch') {
        buildPreviewTimer += dt
        const rotDelta = _bpHasQuat ? camera.quaternion.angleTo(_bpQuat) : Infinity
        if (
          forceBuildPreview ||
          rotDelta > BUILD_PREVIEW_ROT_EPS ||
          buildPreviewTimer >= BUILD_PREVIEW_HEARTBEAT
        ) {
          updateTorchPreview()
          blockBuilder.setGhost(null)
          placedChests.setGhost(null, null, false)
          placedBeds.setGhost(null, null, false)
          placedBallistas.setGhost(null, null, false)
          placedCatapults.setGhost(null, null, false)
          plantedSaplings.setGhost(null, null, false)
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else if (player.isLocked() && inventory.getHeldItem() === 'chest') {
        buildPreviewTimer += dt
        const rotDelta = _bpHasQuat ? camera.quaternion.angleTo(_bpQuat) : Infinity
        if (
          forceBuildPreview ||
          rotDelta > BUILD_PREVIEW_ROT_EPS ||
          buildPreviewTimer >= BUILD_PREVIEW_HEARTBEAT
        ) {
          updateChestPreview()
          blockBuilder.setGhost(null)
          placedTorches.setGhost(null, null, false)
          placedBeds.setGhost(null, null, false)
          placedBallistas.setGhost(null, null, false)
          placedCatapults.setGhost(null, null, false)
          plantedSaplings.setGhost(null, null, false)
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else if (player.isLocked() && inventory.getHeldItem() === 'bed') {
        buildPreviewTimer += dt
        const rotDelta = _bpHasQuat ? camera.quaternion.angleTo(_bpQuat) : Infinity
        if (
          forceBuildPreview ||
          rotDelta > BUILD_PREVIEW_ROT_EPS ||
          buildPreviewTimer >= BUILD_PREVIEW_HEARTBEAT
        ) {
          updateBedPreview()
          blockBuilder.setGhost(null)
          placedTorches.setGhost(null, null, false)
          placedChests.setGhost(null, null, false)
          placedBallistas.setGhost(null, null, false)
          placedCatapults.setGhost(null, null, false)
          plantedSaplings.setGhost(null, null, false)
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else if (player.isLocked() && inventory.getHeldItem() === 'ballista') {
        buildPreviewTimer += dt
        const rotDelta = _bpHasQuat ? camera.quaternion.angleTo(_bpQuat) : Infinity
        if (
          forceBuildPreview ||
          rotDelta > BUILD_PREVIEW_ROT_EPS ||
          buildPreviewTimer >= BUILD_PREVIEW_HEARTBEAT
        ) {
          updateBallistaPreview()
          blockBuilder.setGhost(null)
          placedTorches.setGhost(null, null, false)
          placedChests.setGhost(null, null, false)
          placedBeds.setGhost(null, null, false)
          plantedSaplings.setGhost(null, null, false)
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else if (player.isLocked() && inventory.getHeldItem() === 'catapult') {
        buildPreviewTimer += dt
        const rotDelta = _bpHasQuat ? camera.quaternion.angleTo(_bpQuat) : Infinity
        if (
          forceBuildPreview ||
          rotDelta > BUILD_PREVIEW_ROT_EPS ||
          buildPreviewTimer >= BUILD_PREVIEW_HEARTBEAT
        ) {
          updateCatapultPreview()
          blockBuilder.setGhost(null)
          placedTorches.setGhost(null, null, false)
          placedChests.setGhost(null, null, false)
          placedBeds.setGhost(null, null, false)
          plantedSaplings.setGhost(null, null, false)
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else if (player.isLocked() && isSaplingItem(inventory.getHeldItem())) {
        buildPreviewTimer += dt
        const rotDelta = _bpHasQuat ? camera.quaternion.angleTo(_bpQuat) : Infinity
        if (
          forceBuildPreview ||
          rotDelta > BUILD_PREVIEW_ROT_EPS ||
          buildPreviewTimer >= BUILD_PREVIEW_HEARTBEAT
        ) {
          updateSaplingPreview()
          blockBuilder.setGhost(null)
          placedTorches.setGhost(null, null, false)
          placedChests.setGhost(null, null, false)
          placedBeds.setGhost(null, null, false)
          placedBallistas.setGhost(null, null, false)
          placedCatapults.setGhost(null, null, false)
          _bpQuat.copy(camera.quaternion)
          _bpHasQuat = true
          buildPreviewTimer = 0
          forceBuildPreview = false
        }
      } else {
        blockBuilder.setGhost(null)
        placedTorches.setGhost(null, null, false)
        placedChests.setGhost(null, null, false)
        placedBeds.setGhost(null, null, false)
        placedBallistas.setGhost(null, null, false)
        placedCatapults.setGhost(null, null, false)
        plantedSaplings.setGhost(null, null, false)
        _bpHasQuat = false
      }
    }
    updateSpearReloadHud(digging)
    digBreakFx.tick(dt)
    // Spread surface merge/BVH remeshes across frames after digs.
    if (surfaceChunks.hasDirtyChunks()) surfaceChunks.pumpDirty(8)
    updateBlockExpiry()
    placedTorches.update(clock.elapsedTime, localLightExposureScale)
    placedChests.syncOpenId(inventory.getOpenContainerId())
    placedChests.update(dt)
    if (placedBallistas.count > 0) {
      placedBallistas.update(dt, enemies, spiders, ballistaFires, ballistaEjects, {
        playerPos: player.object.position,
      })
      for (const eject of ballistaEjects) {
        groundItems.spawnAt(
          eject.item,
          eject.count,
          eject.position,
          eject.velocity,
          1.1,
          eject.durability,
        )
      }
      for (const shot of ballistaFires) {
        if (shot.ammo.kind === 'arrow') {
          spawnThrownArrow(
            projectilesGroup,
            shot.origin,
            shot.direction,
            thrownArrows,
            shot.ammo.item,
            ARROW_MAX_SPEED,
          )
        } else if (shot.ammo.kind === 'spear') {
          spawnThrownSpear(
            projectilesGroup,
            shot.origin,
            shot.direction,
            thrownSpears,
            shot.ammo.item,
            shot.ammo.durability,
          )
        } else {
          spawnThrownOrb(
            projectilesGroup,
            shot.origin,
            shot.direction,
            thrownOrbs,
            shot.ammo.item === 'crystal_berries' ? 'heal' : 'damage',
          )
        }
      }
      // Hopper spit / spent ammo can change the open ballista UI.
      if (
        (ballistaEjects.length > 0 || ballistaFires.length > 0) &&
        inventory.getOpenContainerId()
      ) {
        inventory.refreshExternalIfOpen()
      }
    }
    if (placedCatapults.count > 0) {
      placedCatapults.update(dt, enemies, spiders, catapultFires, catapultEjects, {
        playerPos: player.object.position,
        playerHeight: PLAYER_HEIGHT,
      })
      for (const eject of catapultEjects) {
        groundItems.spawnAt(
          eject.item,
          eject.count,
          eject.position,
          eject.velocity,
          1.1,
          eject.durability,
        )
      }
      for (const shot of catapultFires) {
        spawnThrownCatapultRock(
          projectilesGroup,
          shot.origin,
          shot.direction,
          thrownCatapultRocks,
          shot.ammo,
          shot.speed,
        )
        if (shot.flingPlayer) {
          const vx = shot.direction.x * shot.speed
          const vy = shot.direction.y * shot.speed
          const vz = shot.direction.z * shot.speed
          // Snap into the scoop so the ride feels intentional.
          player.object.position.set(
            shot.origin.x,
            Math.max(player.object.position.y, shot.origin.y - 0.15),
            shot.origin.z,
          )
          player.applyLaunch(vx, vy, vz, 2.6)
          info.textContent = 'Yeeted!'
        }
      }
      if (
        (catapultEjects.length > 0 || catapultFires.length > 0) &&
        inventory.getOpenContainerId()
      ) {
        inventory.refreshExternalIfOpen()
      }
    }
    if (plantedSaplings.update(dt, placedTrees)) {
      syncPropCollision()
    }

    if (
      placedRocks.length > 0 &&
      updateRocksPhysics(placedRocks, rockGround, collisionWorld, dt)
    ) {
      syncPropCollision()
    }

    updateGrassWind(clock.elapsedTime)
    profEnd('digbuild')
    // Latest pointer deltas often arrive while we were in physics/render prep —
    // apply them immediately before present so look doesn't feel one-frame sticky.
    player.flushLook()
    // Camera is parented under the scene; force-refresh its world matrix so the
    // view projection can't present a stale orientation for a frame.
    camera.updateMatrixWorld(true)
    renderer.render(scene, camera)
    profEnd('render')

    perfHudTimer += dt
    if (perfHudTimer >= PERF_HUD_INTERVAL) {
      perfHudTimer = 0
      updatePerfHud()
    }
    profReport(dt)
  }
  updatePerfHud()
  await finishWorldPropsLoad()
  animate()
  await waitForStableFps()
  hideLoadingOverlay()
  if (!player.isLocked()) {
    info.textContent = touchControls.enabled
      ? 'Tap to play — stick to move, drag to look'
      : 'Click to play'
  }
}

main().catch((err) => {
  console.error(err)
  const info = document.getElementById('info')
  if (info) info.textContent = `Error loading terrain: ${err.message}`
  document.body.classList.remove('world-loading')
  const loadingOverlay = document.getElementById('loading-overlay')
  if (loadingOverlay) {
    loadingOverlay.hidden = true
    loadingOverlay.setAttribute('aria-busy', 'false')
  }
})
