import * as THREE from 'three'
import { depenetrateAabbInBoxes, depenetratePlayerInBoxes } from './collision'
import type { CollisionWorld } from './collisionWorld'
import type { InventoryItem } from './inventory'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { type CapsuleCollider } from './meshCollider'
import { PLAYER_HEIGHT, PLAYER_RADIUS } from './player'
import { sampleMeshGroundY, type MeshGroundTargets } from './terrainGroundRay'

export const ENEMY_MODEL_URL = '/assets/enemy1.glb'
export const PLAYER_MAX_HEALTH = 100
export const ENEMY_MAX_HEALTH = 5
export const ENEMY_BIG_SCALE = 2
export const ENEMY_BIG_MAX_HEALTH = ENEMY_MAX_HEALTH * ENEMY_BIG_SCALE
/** Chance that a newly spawned enemy is the large variant. */
export const ENEMY_BIG_SPAWN_CHANCE = 0.25
export const ENEMY_BIG_SPLIT_COUNT = 3
/** Big enemies crawl and lunge at this fraction of normal speed. */
export const ENEMY_BIG_CRAWL_SPEED_SCALE = 0.55
/** Extra sword knockback impulse on big enemies. */
export const ENEMY_BIG_SWORD_KNOCKBACK_MULT = 1.55
export const ENEMY_DAMAGE = 1
export const ENEMY_BIG_DAMAGE = 2
export const ENEMY_MELEE_DAMAGE = 1
export const ITEM_MELEE_DAMAGE = 2
export const SWORD_MELEE_DAMAGE = 4
export const AXE_MELEE_DAMAGE = 3
export const SPEAR_MELEE_DAMAGE = 2
export const SPEAR_THROW_DAMAGE = 2
/** Iron-tier weapons deal +1 damage over their stone counterparts. */
export const IRON_SWORD_MELEE_DAMAGE = SWORD_MELEE_DAMAGE + 1
export const IRON_AXE_MELEE_DAMAGE = AXE_MELEE_DAMAGE + 1
export const IRON_SPEAR_MELEE_DAMAGE = SPEAR_MELEE_DAMAGE + 1
export const IRON_SPEAR_THROW_DAMAGE = SPEAR_THROW_DAMAGE + 1
/** Gold-tier weapons deal +1 damage over iron. */
export const GOLD_SWORD_MELEE_DAMAGE = IRON_SWORD_MELEE_DAMAGE + 1
export const GOLD_AXE_MELEE_DAMAGE = IRON_AXE_MELEE_DAMAGE + 1
export const GOLD_SPEAR_MELEE_DAMAGE = IRON_SPEAR_MELEE_DAMAGE + 1
export const GOLD_SPEAR_THROW_DAMAGE = IRON_SPEAR_THROW_DAMAGE + 1
/** Diamond-tier weapons deal +1 damage over gold. */
export const DIAMOND_SWORD_MELEE_DAMAGE = GOLD_SWORD_MELEE_DAMAGE + 1
export const DIAMOND_AXE_MELEE_DAMAGE = GOLD_AXE_MELEE_DAMAGE + 1
export const DIAMOND_SPEAR_MELEE_DAMAGE = GOLD_SPEAR_MELEE_DAMAGE + 1
export const DIAMOND_SPEAR_THROW_DAMAGE = GOLD_SPEAR_THROW_DAMAGE + 1
/** Bow arrows — same tier steps as thrown spears, slightly punchier knockback. */
export const ARROW_DAMAGE = 1
export const IRON_ARROW_DAMAGE = ARROW_DAMAGE + 1
export const GOLD_ARROW_DAMAGE = IRON_ARROW_DAMAGE + 1
export const DIAMOND_ARROW_DAMAGE = GOLD_ARROW_DAMAGE + 1
export const ARROW_HIT_KNOCKBACK_SPEED = 8.2
export const ENEMY_ATTACK_COOLDOWN = 1.05
/** XZ distance at which an enemy can hurt the player (body radii + small gap). */
export const ENEMY_ATTACK_RANGE = PLAYER_RADIUS + 0.32
/** Legacy reach constant; lunge hits use capsule-vs-mesh distance + separationRadius. */
export const ENEMY_LUNGE_HIT_RANGE = PLAYER_RADIUS + 0.58
/** Extra padding beyond combined body radii for lunge bite contact. */
const ENEMY_LUNGE_REACH_PAD = 0.34
/** Enemies only chase and bite when the player is within this XZ distance. */
export const ENEMY_AGGRO_RANGE = 50
/** Soft cap — night spawn + big-splits pile up and thrash capsule/BVH cost. */
export const ENEMY_MAX_ALIVE = 12
/**
 * Soft cap on how many enemies get full mesh BVH + multi-substep collision per frame.
 * Everyone else uses cheap probe-slide movement (nearby boxes only when needed).
 */
const ENEMY_FULL_COLLIDE_MAX = 4
/** Full mesh/voxel collision every N frames for non-priority enemies. */
const ENEMY_COLLIDE_STAGGER = 3
/** Start a lunge when closer than this; must be beyond touch range so crawl can reach contact first. */
export const ENEMY_BITE_START_RANGE = 0.88
export const ENEMY_LUNGE_DURATION = 0.82
export const ENEMY_LUNGE_RECOVER_DURATION = 1
/** How far the enemy travels toward the player during a lunge (must close bite start gap). */
export const ENEMY_LUNGE_FORWARD = 1.05
export const ENEMY_LUNGE_JUMP = 0.22
export const ENEMY_BITE_KNOCKBACK_SPEED = 8
export const ENEMY_BITE_KNOCKBACK_LIFT = 3.4
export const ENEMY_KNOCKBACK_SPEED = ENEMY_BITE_KNOCKBACK_SPEED
export const ENEMY_KNOCKBACK_LIFT = ENEMY_BITE_KNOCKBACK_LIFT
export const ENEMY_HIT_KNOCKBACK_SPEED = 4.8
export const ITEM_HIT_KNOCKBACK_SPEED = 6.2
export const SWORD_HIT_KNOCKBACK_SPEED = 8.5
export const AXE_HIT_KNOCKBACK_SPEED = 8.5
export const SPEAR_HIT_KNOCKBACK_SPEED = 7.5
/** Melee horizontal reach (meters) — padded by enemy body radius at hit time. */
export const SWORD_MELEE_REACH = 2.5
export const SPEAR_MELEE_REACH = 3
export const AXE_MELEE_REACH = 2
export const ITEM_MELEE_REACH = 2
export const ENEMY_MELEE_REACH = 2
/** Horizontal sweep half-angle (degrees) — converted to a facing-dot threshold. */
export const SWORD_MELEE_SWEEP_DEG = 75
export const SPEAR_MELEE_SWEEP_DEG = 75
export const AXE_MELEE_SWEEP_DEG = 60
export const ITEM_MELEE_SWEEP_DEG = 60
export const ENEMY_MELEE_SWEEP_DEG = 60
/** Full 360° roll on the enemy mesh when damaged. */
export const ENEMY_HIT_SPIN_DURATION = 0.38
const ENEMY_KNOCKBACK_DRAG = 10
const ENEMY_HIT_SPIN_TAU = Math.PI * 2
/**
 * Full capsule/ground collision inside this radius (m).
 * Must cover aggro range — chasing enemies without mesh BVH fall through outdoor terrain.
 */
const ENEMY_DETAIL_RANGE = ENEMY_AGGRO_RANGE
const ENEMY_DETAIL_RANGE_SQ = ENEMY_DETAIL_RANGE * ENEMY_DETAIL_RANGE
/** Soft separation only among enemies this close to each other. */
const ENEMY_SEP_RANGE = 2.8
const ENEMY_SEP_RANGE_SQ = ENEMY_SEP_RANGE * ENEMY_SEP_RANGE
/** At most this many enemy PointLights are lit (rest keep emissive glow only). */
export const ENEMY_ACTIVE_LIGHTS = 5
/**
 * When false (Potato/Low graphics), enemy PointLights stay hidden — glow mesh
 * only. Avoids PBR evaluating several dynamic lights during night fights.
 */
let enemyPointLightsQualityEnabled = true

/** Medium+ enables real enemy PointLights; Potato/Low keep MeshBasic glow only. */
export function setEnemyPointLightsQualityEnabled(enabled: boolean) {
  enemyPointLightsQualityEnabled = enabled
}
/** How long enemies persist before despawning (ms). */
export const ENEMY_LIFETIME_MS = 5 * 60 * 1000
export const ENEMY_TARGET_HEIGHT = 0.42
export const ENEMY_BAR_HEAD_GAP = 0.06
/** World-space width / height of the bar above an enemy (perspective-scales with distance). */
export const ENEMY_BAR_WORLD_WIDTH = 0.36
export const ENEMY_BAR_WORLD_HEIGHT = 0.042
export const ENEMY_BAR_BIG_WORLD_WIDTH = 0.48
export const ENEMY_BAR_BIG_WORLD_HEIGHT = 0.052
export const DEFAULT_ENEMY_SPAWN_RATE = 78
export const DEFAULT_ENEMY_SPEED = 58
export const DEFAULT_ENEMY_LIGHT_HEIGHT = 33

/** 0–100 slider → local Y offset from mesh center (world units). */
export function enemyLightHeightOffsetFromSlider(slider: number): number {
  const t = THREE.MathUtils.clamp(slider, 0, 100) / 100
  return THREE.MathUtils.lerp(-0.14, 0.22, t)
}

/** 0–100 slider → seconds between spawn attempts (lower slider value = slower). */
export function enemySpawnIntervalFromSlider(slider: number): number {
  const t = THREE.MathUtils.clamp(slider, 0, 100) / 100
  return THREE.MathUtils.lerp(6, 0.35, t)
}

/** 0–100 slider → world-units/sec crawl speed. */
export function enemyCrawlSpeedFromSlider(slider: number): number {
  const t = THREE.MathUtils.clamp(slider, 0, 100) / 100
  // Slow, readable crawl — still reaches the player across open ground.
  return THREE.MathUtils.lerp(0.55, 2.2, t)
}

const RAY_ORIGIN_Y = 500
const RAYCAST_FAR = 1200
const INNER_LIGHT_COLOR = 0xff3300
const INNER_LIGHT_INTENSITY = 3.2
const INNER_LIGHT_DISTANCE = 2.8
const GLOW_CORE_RADIUS = 0.055
/** Soft push strength when enemies overlap in XZ. */
const ENEMY_SEPARATION_STRENGTH = 2.8
/** Baked rest-pose collision from the template (avoids setFromObject on every spawn). */
let templateCol: {
  halfX: number
  halfZ: number
  height: number
  footOffset: number
  sepRadius: number
} | null = null
export const ENEMY_STEP_HEIGHT = 0.38
/** Only auto-stick / land when this close to the floor — larger gaps = real falls. */
const ENEMY_LAND_SNAP = ENEMY_STEP_HEIGHT + 0.12
const ENEMY_STICK_DOWN = 0.5
const ENEMY_GROUND_PROBE = 0.06
const ENEMY_GRAVITY = 18
const ENEMY_MAX_FALL = 42
/** Max rise per unit of horizontal travel (walkable; steeper triggers a jump). */
const ENEMY_MAX_SLOPE = 0.62
/** Small hop when stepping onto a low ledge. */
const ENEMY_LEDGE_HOP = 0.72
/** Max vertical rise enemies will try to jump over a steep slope. */
const ENEMY_SLOPE_JUMP_MAX_RISE = 0.52
const ENEMY_SLOPE_JUMP_MIN = ENEMY_LEDGE_HOP
const ENEMY_SLOPE_JUMP_MAX = 4.8
/** Ground search depth while falling (5 m voxel layers; covers multi-layer pits). */
const ENEMY_FALL_RECOVER_BELOW = 14
/** Mesh/surface cap above voxel seam — prefer voxels when feet are clearly below that lid. */
const ENEMY_SURFACE_LID_GAP = 1.2
/**
 * Typical outdoor seam→grass gap. Surface-cap AABBs sit on the voxel seam; the
 * walkable mesh is often this far below. Probes and hover-snaps must cover it.
 */
const ENEMY_SEAM_MESH_GAP = 8
/** Voxel-only probe depth to confirm the enemy still has support under its feet. */
const ENEMY_SUPPORT_PROBE_BELOW = 0.45
/** Skip vertical snap when already this close to the floor (reduces Y jitter). */
const ENEMY_GROUND_SNAP_EPS = 0.012
/** Max horizontal move per collision substep (prevents tunneling through voxels). */
const ENEMY_MOVE_SUBSTEP = 0.05
/** Max vertical move per gravity substep (prevents falling through thin floors). */
const ENEMY_VERT_SUBSTEP = 0.08

const _box = new THREE.Box3()
const _enemyMin = new THREE.Vector3()
const _enemyMax = new THREE.Vector3()
const _enemyAabbBefore = new THREE.Vector3()
const _center = new THREE.Vector3()
const _rayHits: THREE.Intersection[] = []
const _worldPos = new THREE.Vector3()
const _proj = new THREE.Vector3()
const _capsuleFeet = new THREE.Vector3()

/** Per-frame ground probe cache — fighting packs re-query the same cells dozens of times. */
const _groundProbeCache = new Map<number, number | null>()
let _groundProbeFrame = 0
/** Nearby enemies using full capsule collision this frame (drives substep budget). */
let _detailEnemyCount = 0
/** Ceiling / surface lid within this height marks an enemy as underground. */
const ENEMY_CAVE_CEILING_MAX = 8
/**
 * Snap back up onto the walkable mesh if we fell under it by at most this much.
 * Keeps bury recovery reliable without long-range teleports.
 */
const ENEMY_MESH_RECOVER_ABOVE = 2.5
/** Cull enemies that have no recoverable floor and have fallen this far. */
const ENEMY_ORPHAN_FALL_CULL = 80
/** Seconds of unrecoverable free-fall before silent delete. */
const ENEMY_ORPHAN_DESPAWN_SEC = 2.5

/** Reused light-budget scratch — avoid allocating {enemy, distSq} every frame. */
const _lightOrder: { enemy: EnemyInstance; distSq: number }[] = []
const _healthBarCamPos = new THREE.Vector3()
const HEALTH_BAR_RANGE_SQ = 35 * 35

function beginEnemyGroundProbeFrame() {
  _groundProbeFrame++
  if (_groundProbeFrame > 1_000_000) _groundProbeFrame = 1
  _groundProbeCache.clear()
  _detailEnemyCount = 0
}

function groundProbeCacheKey(
  x: number,
  z: number,
  feetY: number,
  recoverBelow: number,
  groundRadius: number,
): number {
  // ~5 cm XZ / ~8 cm Y buckets — fine enough for crawl steps, coarse enough to hit.
  const qx = Math.round(x * 20)
  const qz = Math.round(z * 20)
  const qy = Math.round(feetY * 12)
  const qr = Math.round(recoverBelow * 4)
  const qrad = Math.round(groundRadius * 20)
  return (
    (qx * 73856093) ^
    (qz * 19349663) ^
    (qy * 83492791) ^
    (qr * 39916801) ^
    (qrad * 479001599)
  )
}

const pickMaterial = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0,
  depthWrite: false,
})

const healthBarPlane = new THREE.PlaneGeometry(1, 1)
const healthBarTrackMat = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.55,
  toneMapped: false,
  depthWrite: false,
})
const healthBarFillMat = new THREE.MeshBasicMaterial({
  color: 0x22c55e,
  toneMapped: false,
  depthWrite: false,
})

const _healthBarRed = new THREE.Color()
const _healthBarGreen = new THREE.Color()
_healthBarRed.setStyle('hsl(0, 68%, 36%)')
_healthBarGreen.setStyle('hsl(128, 82%, 46%)')

/** Match player HUD fill endpoints; RGB lerp avoids the orange HSL hue band. */
function healthBarColorFromFraction(t: number, out: THREE.Color): THREE.Color {
  const u = THREE.MathUtils.clamp(t, 0, 1)
  return out.copy(_healthBarRed).lerp(_healthBarGreen, u)
}
const healthBarBorderMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.12,
  toneMapped: false,
  depthWrite: false,
})

const enemyMaterial = new THREE.MeshStandardMaterial({
  color: 0xcc1818,
  flatShading: true,
  roughness: 0.48,
  metalness: 0,
  emissive: 0xff2200,
  emissiveIntensity: 0.62,
})

export type EnemyCellMeta = {
  ix: number
  iy: number
  center_x: number
  center_y: number
  /** Outdoor surface cap top — used for cheap spawn height without a mesh raycast. */
  cap_top_y?: number
}

type EnemyAttackPhase = 'idle' | 'lunge' | 'recover'

export type EnemyCreateOptions = {
  big?: boolean
}

export type EnemyDeathContext = {
  parent: THREE.Object3D
  enemies: EnemyInstance[]
  template: THREE.Group
  barParent: THREE.Object3D
  groundTargets: MeshGroundTargets
  lightHeightOffset: number
  onOrbBurst: (x: number, y: number, z: number) => void
  collisionWorld?: CollisionWorld
}

export type EnemyInstance = {
  root: THREE.Group
  /** Skinned mesh group (excludes pick collider). */
  visual: THREE.Group
  pickMesh: THREE.Mesh
  /** Cached rest-pose collision half-extents (avoids setFromObject every substep). */
  colHalfX: number
  colHalfZ: number
  colHeight: number
  /** World feet Y = root.position.y + colFootOffset (rest pose). */
  colFootOffset: number
  /** Inner glow light (cached so day/night updates skip scene traversals). */
  innerLight: THREE.PointLight | null
  /** XZ radius used for soft separation from other enemies. */
  separationRadius: number
  maxHealth: number
  isBig: boolean
  health: number
  attackCooldown: number
  attackPhase: EnemyAttackPhase
  attackPhaseTime: number
  lungeDirX: number
  lungeDirZ: number
  biteHit: boolean
  knockVX: number
  knockVZ: number
  /** Seconds left in the post-hit 360° visual spin (0 = idle). */
  hitSpinT: number
  velY: number
  grounded: boolean
  /**
   * When true, detail-range capsule resolves also hit terrain mesh BVH.
   * Required outdoors: enemies stand on the walkable mesh, not voxel AABBs.
   */
  collideTerrainMesh: boolean
  /** Accumulated seconds of unrecoverable free-fall (orphan despawn). */
  orphanFallT: number
  healthBarGroup: THREE.Group
  healthFill: THREE.Mesh
  healthBarWidth: number
  spawnTime: number
}

function hashUnit(i: number): number {
  let n = (i * 374761393) & 0xffffffff
  n = (n ^ (n >> 13)) * 1274126177
  return ((n ^ (n >> 16)) >>> 0) / 4294967295
}

function alignModelToGround(model: THREE.Object3D) {
  model.updateWorldMatrix(true, true)
  _box.setFromObject(model)
  model.position.y -= _box.min.y
}

function applyEnemyMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (child.userData.enemyPick) return
    // Enemies skip castShadow — packs of skinned casters on Ultra 4096 maps
    // spiked frame time during fights even when average FPS looked fine.
    child.castShadow = false
    child.receiveShadow = true
    child.material = enemyMaterial
  })
}

function scaleToTargetHeight(root: THREE.Object3D, targetHeight: number) {
  root.updateWorldMatrix(true, true)
  _box.setFromObject(root)
  const h = _box.max.y - _box.min.y
  if (h > 1e-4) root.scale.setScalar(targetHeight / h)
}

function enableAutoMatrices(root: THREE.Object3D) {
  root.traverse((node) => {
    node.matrixAutoUpdate = true
  })
}

/** Y rotation so local +X faces world direction (dx, dz) on the XZ plane. */
function facingYawForPlusX(dx: number, dz: number): number {
  return Math.atan2(-dz, dx)
}

/** Shared pick capsules — one geometry per scale tier (normal / big). */
const pickGeoByScale = new Map<number, THREE.CapsuleGeometry>()

function pickColliderGeometry(scaleMul: number): THREE.CapsuleGeometry {
  const key = scaleMul === ENEMY_BIG_SCALE ? ENEMY_BIG_SCALE : 1
  let geo = pickGeoByScale.get(key)
  if (geo) return geo
  const t = templateCol
  const halfX = t ? t.halfX * key : 0.2
  const halfZ = t ? t.halfZ * key : 0.2
  const height = t ? t.height * key : 0.42
  const radius = Math.max(halfX, halfZ) * 0.76
  const cylLen = Math.max(0.04, height * 0.5)
  geo = new THREE.CapsuleGeometry(radius, cylLen, 3, 6)
  pickGeoByScale.set(key, geo)
  return geo
}

function createPickColliderFromCache(scaleMul: number): THREE.Mesh {
  const t = templateCol
  const key = scaleMul === ENEMY_BIG_SCALE ? ENEMY_BIG_SCALE : 1
  const height = t ? t.height * key : 0.42
  const foot = t ? t.footOffset * key : 0
  const mesh = new THREE.Mesh(pickColliderGeometry(key), pickMaterial)
  mesh.position.set(0, foot + height * 0.5, 0)
  mesh.userData.enemyPick = true
  return mesh
}

function createEnemyHealthBar(isBig: boolean): {
  group: THREE.Group
  fill: THREE.Mesh
  width: number
} {
  const width = isBig ? ENEMY_BAR_BIG_WORLD_WIDTH : ENEMY_BAR_WORLD_WIDTH
  const height = isBig ? ENEMY_BAR_BIG_WORLD_HEIGHT : ENEMY_BAR_WORLD_HEIGHT

  const group = new THREE.Group()
  group.renderOrder = 12

  const border = new THREE.Mesh(healthBarPlane, healthBarBorderMat)
  border.scale.set(width + 0.012, height + 0.012, 1)
  group.add(border)

  const track = new THREE.Mesh(healthBarPlane, healthBarTrackMat)
  track.scale.set(width, height, 1)
  group.add(track)

  const fillMat = healthBarFillMat.clone()
  healthBarColorFromFraction(1, fillMat.color)
  const fill = new THREE.Mesh(healthBarPlane, fillMat)
  fill.scale.set(width, height, 1)
  fill.position.z = 0.002
  group.add(fill)

  return { group, fill, width }
}

function findVisualParts(visual: THREE.Group): {
  meshRoot: THREE.Object3D
  innerLight: THREE.PointLight
} | null {
  let meshRoot: THREE.Object3D | undefined
  let innerLight: THREE.PointLight | undefined
  let fallbackLight: THREE.PointLight | undefined
  visual.traverse((child) => {
    if (child instanceof THREE.PointLight) {
      if (child.userData.isEnemyInnerLight) innerLight = child
      else if (!fallbackLight) fallbackLight = child
    } else if (!meshRoot && child !== visual && child.parent === visual) meshRoot = child
  })
  innerLight ??= fallbackLight
  if (!meshRoot || !innerLight) return null
  return { meshRoot, innerLight }
}

function enemyGlowMaterial(light: THREE.PointLight): THREE.MeshBasicMaterial | null {
  const glow = light.userData.glowCore
  if (!(glow instanceof THREE.Mesh)) return null
  const raw = glow.material
  const mat = Array.isArray(raw) ? raw[0] : raw
  return mat instanceof THREE.MeshBasicMaterial ? mat : null
}

/** Shared glow-core geometry — avoid allocating a SphereGeometry per spawn. */
const glowCoreGeo = new THREE.SphereGeometry(GLOW_CORE_RADIUS, 10, 10)

function ensureEnemyGlowCore(innerLight: THREE.PointLight): THREE.MeshBasicMaterial | null {
  const existing = enemyGlowMaterial(innerLight)
  if (existing) return existing
  if (innerLight.userData.glowCore instanceof THREE.Object3D) {
    innerLight.remove(innerLight.userData.glowCore)
  }
  delete innerLight.userData.glowCore
  const glow = new THREE.Mesh(
    glowCoreGeo,
    new THREE.MeshBasicMaterial({
      color: INNER_LIGHT_COLOR,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  innerLight.add(glow)
  innerLight.userData.glowCore = glow
  return glow.material as THREE.MeshBasicMaterial
}

/** Pooled visual clones — GLTF deep-clone on every spawn/kill was the main hitch. */
const _visualPoolNormal: THREE.Group[] = []
const _visualPoolBig: THREE.Group[] = []
const VISUAL_POOL_MAX = 10

function acquireEnemyVisual(template: THREE.Group, isBig: boolean): THREE.Group {
  const pool = isBig ? _visualPoolBig : _visualPoolNormal
  const reused = pool.pop()
  if (reused) {
    resetEnemyVisualPose(reused)
    return reused
  }
  const model = template.clone(true)
  if (isBig) model.scale.multiplyScalar(ENEMY_BIG_SCALE)
  enableAutoMatrices(model)
  return model
}

function releaseEnemyVisual(model: THREE.Group, isBig: boolean) {
  model.removeFromParent()
  resetEnemyVisualPose(model)
  const pool = isBig ? _visualPoolBig : _visualPoolNormal
  if (pool.length < VISUAL_POOL_MAX) pool.push(model)
}

/** Pre-clone a few visuals so the first night spawns don't hitch. */
export function prewarmEnemyVisualPool(template: THREE.Group, count = 4) {
  if (!templateCol) bakeTemplateCollision(template)
  for (let i = 0; i < count; i++) {
    if (_visualPoolNormal.length >= VISUAL_POOL_MAX) break
    _visualPoolNormal.push(acquireEnemyVisual(template, false))
  }
  // One big ready for the first large kill-split.
  if (_visualPoolBig.length === 0) {
    _visualPoolBig.push(acquireEnemyVisual(template, true))
  }
}

/** Place the point light at the visual mesh bounding-box center (model local space). */
function centerInnerLightInVisual(visual: THREE.Group, heightOffset = 0) {
  const parts = findVisualParts(visual)
  if (!parts) return
  const { meshRoot, innerLight } = parts
  meshRoot.updateWorldMatrix(true, true)
  _box.setFromObject(meshRoot)
  _box.getCenter(_center)
  visual.worldToLocal(_center)
  innerLight.userData.baseLightPos = _center.clone()
  innerLight.position.copy(_center)
  innerLight.position.y += heightOffset
}

/** Apply a Y offset relative to the mesh-centered base position. */
export function applyEnemyLightHeight(visual: THREE.Group, heightOffset: number) {
  const parts = findVisualParts(visual)
  if (!parts) return
  const { innerLight } = parts
  const base = innerLight.userData.baseLightPos as THREE.Vector3 | undefined
  if (!base) {
    centerInnerLightInVisual(visual, heightOffset)
    return
  }
  innerLight.position.set(base.x, base.y + heightOffset, base.z)
}

function storeEnemyLightBase(innerLight: THREE.PointLight) {
  innerLight.userData.baseIntensity = innerLight.intensity
  innerLight.userData.baseDistance = innerLight.distance
}

function configureInnerLight(innerLight: THREE.PointLight) {
  innerLight.color.setHex(INNER_LIGHT_COLOR)
  innerLight.intensity = INNER_LIGHT_INTENSITY
  innerLight.distance = INNER_LIGHT_DISTANCE
  // Constant attenuation is cheaper and still reads as a local glow.
  innerLight.decay = 2
  storeEnemyLightBase(innerLight)
  ensureEnemyGlowCore(innerLight)
}

let lastNightForLights = 1

/** Dim enemy glow through dawn; full strength at night. `night` is 0 (day) … 1 (night). */
export function applyEnemyLightDayNight(innerLight: THREE.PointLight, night: number) {
  lastNightForLights = THREE.MathUtils.clamp(night, 0, 1)
  const baseIntensity =
    (innerLight.userData.baseIntensity as number | undefined) ?? INNER_LIGHT_INTENSITY
  const baseDistance =
    (innerLight.userData.baseDistance as number | undefined) ?? INNER_LIGHT_DISTANCE
  const t = lastNightForLights
  const glow = innerLight.userData.glowCore
  const mat = enemyGlowMaterial(innerLight) ?? ensureEnemyGlowCore(innerLight)
  const budgetOk =
    enemyPointLightsQualityEnabled && innerLight.userData.lightBudgetAllowed !== false
  if (t <= 0.001 || !budgetOk) {
    innerLight.visible = false
    innerLight.intensity = 0
    innerLight.distance = 0
    if (!budgetOk) {
      // Quality-off or over budget: keep the cheap MeshBasic core so enemies still read.
      if (mat) mat.opacity = 0.92 * Math.max(t, 0.35)
      if (glow instanceof THREE.Mesh) glow.visible = true
      return
    }
    if (mat) mat.opacity = 0
    if (glow instanceof THREE.Mesh) glow.visible = false
    return
  }
  innerLight.visible = true
  innerLight.intensity = baseIntensity * t
  innerLight.distance = baseDistance * t
  if (mat) mat.opacity = 0.92 * t
  if (glow instanceof THREE.Mesh) glow.visible = true
}

/** Day/night light update for a template visual (finds the light once via traverse). */
export function applyEnemyLightDayNightVisual(visual: THREE.Group, night: number) {
  const parts = findVisualParts(visual)
  if (!parts) return
  applyEnemyLightDayNight(parts.innerLight, night)
}

function enemyGroundRadius(enemy: EnemyInstance): number {
  return Math.max(PLAYER_RADIUS, enemy.separationRadius * 0.42)
}

/** World feet Y for movement / ground (rest-pose cache; ignores bite lunge). */
function getEnemyFeetY(enemy: EnemyInstance): number {
  return enemy.root.position.y + enemy.colFootOffset
}

function inEnemyGroundRange(y: number, feetY: number, maxAbove: number, minBelow: number) {
  return y <= feetY + maxAbove && y >= minBelow
}

/**
 * Walkable floor: voxels/build blocks in caves/pits; walkable mesh outdoors.
 * Never grounds on coarse surface-cap AABBs (those sit on the voxel seam,
 * often 2–5 m above the grass) — that was the main source of floating enemies.
 * Results are cached per frame — chase/lunge substeps hit the same cells repeatedly.
 */
function probeEnemyGround(
  x: number,
  z: number,
  feetY: number,
  _targets: MeshGroundTargets,
  walkableYAt:
    | ((x: number, z: number, feetY: number, recoverBelow?: number) => number | null)
    | undefined,
  recoverBelow = 2.5,
  collisionWorld?: CollisionWorld,
  groundRadius = PLAYER_RADIUS,
): number | null {
  const cacheKey = groundProbeCacheKey(x, z, feetY, recoverBelow, groundRadius)
  if (_groundProbeCache.has(cacheKey)) return _groundProbeCache.get(cacheKey)!

  const maxAbove = ENEMY_STEP_HEIGHT + 0.05
  const minBelow = feetY - ENEMY_STEP_HEIGHT - recoverBelow
  const inRange = (y: number) => inEnemyGroundRange(y, feetY, maxAbove, minBelow)

  let result: number | null = null

  // Prefer collisionWorld mesh sample (one raycast) over walkableYAt, which also
  // raycasts then re-queries boxes — doubles cost on every crawl substep.
  if (collisionWorld) {
    // Height hints sit on the voxel seam (often 2–5 m above the mesh). Only skip
    // straight to voxels when there is an actual ceiling overhead (true cave).
    const underSurfaceLid = (() => {
      const hint = collisionWorld.heightHintAt(x, z)
      if (hint === null || feetY >= hint - ENEMY_SURFACE_LID_GAP) return false
      return (
        collisionWorld.nearestCeilingYAbove(
          x,
          z,
          feetY + 0.15,
          groundRadius,
          ENEMY_CAVE_CEILING_MAX,
        ) !== null
      )
    })()

    // excludeSurface=true: never treat coarse seam/cap boxes as a floor.
    // useMesh=true outdoors; caves jump straight to voxel/build boxes.
    const meshRecover = Math.max(recoverBelow, underSurfaceLid ? recoverBelow : ENEMY_SEAM_MESH_GAP)
    const walkable = underSurfaceLid
      ? null
      : collisionWorld.findGroundTop(
          x,
          feetY,
          z,
          groundRadius,
          ENEMY_STEP_HEIGHT,
          true,
          meshRecover,
          true,
        )
    const needsVoxelCheck =
      underSurfaceLid || walkable === null || feetY < walkable - maxAbove - 0.1
    const voxelFloor = needsVoxelCheck
      ? collisionWorld.findGroundTop(
          x,
          feetY,
          z,
          groundRadius,
          ENEMY_STEP_HEIGHT,
          true,
          Math.max(recoverBelow, ENEMY_FALL_RECOVER_BELOW),
          false,
        )
      : null

    if (voxelFloor !== null && inRange(voxelFloor)) {
      if (walkable === null || !inRange(walkable)) {
        result = voxelFloor
      } else if (
        walkable > voxelFloor + ENEMY_SURFACE_LID_GAP &&
        feetY < walkable - maxAbove
      ) {
        // Mesh lid above a real voxel floor (standing in a pit under grass).
        result = voxelFloor
      } else if (walkable >= voxelFloor - 0.05) {
        result = walkable
      } else {
        result = voxelFloor
      }
    } else if (walkable !== null && inRange(walkable)) {
      result = walkable
    } else if (!underSurfaceLid && walkable === null && voxelFloor === null) {
      // Short probes can miss after a seam hover. Sky-down recover finds grass.
      const skyFloor = resolveEnemyGroundY(x, z, _targets, collisionWorld, feetY)
      if (
        skyFloor !== null &&
        feetY - skyFloor <= ENEMY_SEAM_MESH_GAP &&
        skyFloor >= feetY - ENEMY_SEAM_MESH_GAP
      ) {
        result = skyFloor
      }
    }
  } else if (walkableYAt) {
    const walkable = walkableYAt(x, z, feetY, recoverBelow)
    if (walkable !== null && inRange(walkable)) result = walkable
  }

  _groundProbeCache.set(cacheKey, result)
  return result
}

/** True when a walkable floor is directly under the feet. */
function enemyHasGroundSupport(
  enemy: EnemyInstance,
  collisionWorld: CollisionWorld,
  targets: MeshGroundTargets,
  walkableYAt:
    | ((x: number, z: number, feetY: number, recoverBelow?: number) => number | null)
    | undefined,
): boolean {
  const feetY = getEnemyFeetY(enemy)
  const pos = enemy.root.position
  const floor = probeEnemyGround(
    pos.x,
    pos.z,
    feetY,
    targets,
    walkableYAt,
    ENEMY_SUPPORT_PROBE_BELOW,
    collisionWorld,
    enemyGroundRadius(enemy),
  )
  return floor !== null && feetY - floor <= ENEMY_GROUND_PROBE + 0.08
}

export type MinedTerrainUnderEnemy = {
  centerX: number
  centerZ: number
  capBottomY?: number
  voxelBaseY?: number
  capTopY?: number
}

/** Feet XZ overlap a terrain column (includes radius past the cell edge). */
function enemyFeetOverCell(
  enemy: EnemyInstance,
  cell: MinedTerrainUnderEnemy,
  cellSize: number,
): boolean {
  const pos = enemy.root.position
  const half = cellSize * 0.5 + enemyGroundRadius(enemy)
  return (
    Math.abs(pos.x - cell.centerX) <= half &&
    Math.abs(pos.z - cell.centerZ) <= half
  )
}

/** After terrain changes, unground and depenetrate enemies in that column. */
export function refreshEnemiesAfterTerrainDig(
  enemies: EnemyInstance[],
  cell: MinedTerrainUnderEnemy,
  cellSize: number,
  voxelSize: number,
  mined: { layer?: number; surface?: boolean },
  collisionWorld?: CollisionWorld,
  _capsuleCollider?: CapsuleCollider,
) {
  ungroundEnemiesOnMinedTerrain(enemies, cell, cellSize, voxelSize, mined)
  if (!collisionWorld) return

  for (const enemy of enemies) {
    if (!enemyFeetOverCell(enemy, cell, cellSize)) continue
    if (!enemyPenetratesVoxels(enemy, collisionWorld)) continue
    ejectEnemyFromVoxels(enemy, collisionWorld)
  }
}

export function ungroundEnemiesOnMinedTerrain(
  enemies: EnemyInstance[],
  cell: MinedTerrainUnderEnemy,
  cellSize: number,
  voxelSize: number,
  mined: { layer?: number; surface?: boolean },
) {
  const seam = cell.voxelBaseY ?? cell.capBottomY ?? 0

  // Bottom of the removed band in seam/voxel space. Walkable mesh can sit
  // meters below the seam, so only filter enemies clearly under this floor.
  let removedBottom: number
  if (mined.surface && mined.layer !== undefined) {
    removedBottom = seam - (mined.layer + 1) * voxelSize - 0.12
  } else if (mined.surface) {
    removedBottom = seam - voxelSize - 0.35
  } else if (mined.layer !== undefined) {
    removedBottom = seam - (mined.layer + 1) * voxelSize - 0.12
  } else {
    return
  }
  // Mesh tops often sit well below seam coords — allow generous slack so any
  // enemy that could have rested on this column re-checks support.
  const supportFloor = removedBottom - ENEMY_SEAM_MESH_GAP

  for (const enemy of enemies) {
    if (!enemyFeetOverCell(enemy, cell, cellSize)) continue
    if (getEnemyFeetY(enemy) < supportFloor) continue
    enemy.grounded = false
    if (enemy.velY > 0) enemy.velY = 0
  }
}

/** Measure rest-pose collision extents once (create / scale) — not every substep. */
function bakeTemplateCollision(template: THREE.Group) {
  template.updateMatrixWorld(true)
  _box.setFromObject(template)
  const skin = 0.02
  templateCol = {
    halfX: Math.max(0.12, (_box.max.x - _box.min.x) * 0.5 + skin),
    halfZ: Math.max(0.12, (_box.max.z - _box.min.z) * 0.5 + skin),
    height: Math.max(0.22, _box.max.y - _box.min.y + skin * 2),
    footOffset: _box.min.y - skin,
    sepRadius: Math.max(
      0.26,
      Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z) * 0.42,
    ),
  }
}

function applyBakedCollision(enemy: EnemyInstance, scaleMul: number) {
  const t = templateCol
  if (!t) {
    // Fallback if bake was skipped — measure this instance once.
    enemy.root.updateMatrixWorld(true)
    _box.setFromObject(enemy.visual)
    const skin = 0.02
    const pos = enemy.root.position
    enemy.colHalfX = Math.max(0.12, (_box.max.x - _box.min.x) * 0.5 + skin)
    enemy.colHalfZ = Math.max(0.12, (_box.max.z - _box.min.z) * 0.5 + skin)
    enemy.colHeight = Math.max(0.22, _box.max.y - _box.min.y + skin * 2)
    enemy.colFootOffset = _box.min.y - pos.y - skin
    enemy.separationRadius = Math.max(
      0.26,
      Math.max(enemy.colHalfX, enemy.colHalfZ) * 1.7,
    )
    return
  }
  enemy.colHalfX = t.halfX * scaleMul
  enemy.colHalfZ = t.halfZ * scaleMul
  enemy.colHeight = t.height * scaleMul
  enemy.colFootOffset = t.footOffset * scaleMul
  enemy.separationRadius = t.sepRadius * scaleMul
}

function fillEnemyCollisionAabb(enemy: EnemyInstance) {
  const pos = enemy.root.position
  const feetY = pos.y + enemy.colFootOffset
  _enemyMin.set(pos.x - enemy.colHalfX, feetY, pos.z - enemy.colHalfZ)
  _enemyMax.set(pos.x + enemy.colHalfX, feetY + enemy.colHeight, pos.z + enemy.colHalfZ)
}

/**
 * Nearby voxel/build boxes for enemy wall collision.
 * Surface-cap AABBs are NEVER included — they are coarse seam boxes that act like
 * invisible cell walls and freeze crawlers in empty air next to outer terrain.
 */
function queryEnemyVoxelBoxes(enemy: EnemyInstance, world: CollisionWorld): number[] {
  const pos = enemy.root.position
  const hx = (_enemyMax.x - _enemyMin.x) * 0.5
  const hz = (_enemyMax.z - _enemyMin.z) * 0.5
  return world.queryNear(
    pos.x,
    pos.z,
    Math.hypot(hx, hz) + 0.35,
    _enemyMin.y - 0.05,
    _enemyMax.y + 0.05,
    true,
  )
}

function enemyOverlapsVoxelBox(
  index: number,
  world: CollisionWorld,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): boolean {
  const box = world.boxes[index]!
  return (
    maxX > box.min.x &&
    minX < box.max.x &&
    maxY > box.min.y &&
    minY < box.max.y &&
    maxZ > box.min.z &&
    minZ < box.max.z
  )
}

/**
 * True when the body is wedged inside a solid (not merely standing on a top face
 * or brushing a wall). Matches player capsulePenetratesBoxes: shrink so floor
 * contact and AABB corners outside the capsule don't false-positive — those were
 * rolling back every crawl step on voxel/build tops and freezing enemies.
 */
function enemyPenetratesVoxels(enemy: EnemyInstance, world: CollisionWorld): boolean {
  fillEnemyCollisionAabb(enemy)
  const indices = queryEnemyVoxelBoxes(enemy, world)
  if (indices.length === 0) return false

  const hx = (_enemyMax.x - _enemyMin.x) * 0.5
  const hz = (_enemyMax.z - _enemyMin.z) * 0.5
  const skin = Math.max(0.06, Math.min(hx, hz) * 0.4)
  const minX = _enemyMin.x + skin
  const maxX = _enemyMax.x - skin
  const minY = _enemyMin.y + skin
  const maxY = _enemyMax.y - skin
  const minZ = _enemyMin.z + skin
  const maxZ = _enemyMax.z - skin
  if (maxX <= minX || maxY <= minY || maxZ <= minZ) return false

  for (let i = 0; i < indices.length; i++) {
    if (
      enemyOverlapsVoxelBox(indices[i]!, world, minX, maxX, minY, maxY, minZ, maxZ)
    ) {
      return true
    }
  }
  return false
}

function applyEnemyAabbDelta(
  enemy: EnemyInstance,
  beforeMin: THREE.Vector3,
  axes: 'xz' | 'y' | 'xyz',
) {
  const pos = enemy.root.position
  if (axes !== 'y') {
    pos.x += _enemyMin.x - beforeMin.x
    pos.z += _enemyMin.z - beforeMin.z
  }
  if (axes === 'y' || axes === 'xyz') pos.y += _enemyMin.y - beforeMin.y
}

/** Terrain voxels + build only — never surface-cap AABBs (invisible cell walls). */
function enemyColliderIndices(
  world: CollisionWorld,
  x: number,
  z: number,
  radius: number,
  yMin: number,
  yMax: number,
): number[] {
  return world.queryNear(x, z, radius, yMin, yMax, true)
}

/** Capsule size from the cached rest-pose collision extents. */
function enemyCapsuleFromAabb(enemy: EnemyInstance) {
  // Slightly under the AABB half-extents so corners don't wedge in voxel gaps
  // while the body still fills the visual footprint.
  const radius = Math.max(0.12, Math.max(enemy.colHalfX, enemy.colHalfZ) * 0.82)
  return {
    feetY: enemy.root.position.y + enemy.colFootOffset,
    height: enemy.colHeight,
    radius,
  }
}

/**
 * Move feet by `sy` with capsule-vs-voxel resolution.
 * Terrain mesh BVH is used when `enemy.collideTerrainMesh` — required outdoors
 * because enemies stand on the walkable mesh with no voxel floor at that height.
 * Returns true when the move was stopped by floor/ceiling contact.
 */
function moveEnemyVerticalCapsuleStep(
  enemy: EnemyInstance,
  sy: number,
  world: CollisionWorld,
  capsule: CapsuleCollider,
): boolean {
  const pos = enemy.root.position
  const { feetY, height, radius } = enemyCapsuleFromAabb(enemy)

  _capsuleFeet.set(pos.x, feetY, pos.z)
  _capsuleFeet.y += sy

  const yLo = Math.min(feetY, _capsuleFeet.y) - height - 0.5
  const yHi = Math.max(feetY, _capsuleFeet.y) + height + 0.5
  const indices = enemyColliderIndices(world, pos.x, pos.z, radius + 1.5, yLo, yHi)
  const hit = capsule.resolve(
    _capsuleFeet,
    radius,
    height,
    world.boxes,
    indices,
    enemy.collideTerrainMesh ? 3 : 4,
    enemy.collideTerrainMesh,
    false,
  )

  pos.y += _capsuleFeet.y - feetY

  if (sy < -1e-9 && hit.grounded) {
    enemy.velY = 0
    return true
  }
  if (sy > 1e-9 && hit.ceiling) {
    enemy.velY = 0
    return true
  }
  return false
}

/**
 * Move feet on XZ with capsule-vs-voxel resolution (prevents tunneling through tunnel walls).
 * Returns how much of the requested delta was achieved.
 */
function moveEnemyHorizontalCapsuleStep(
  enemy: EnemyInstance,
  dx: number,
  dz: number,
  world: CollisionWorld,
  capsule: CapsuleCollider,
): { achievedX: number; achievedZ: number } {
  const pos = enemy.root.position
  const beforeX = pos.x
  const beforeZ = pos.z
  const { feetY, height, radius } = enemyCapsuleFromAabb(enemy)
  const footLift = feetY - pos.y

  pos.x += dx
  pos.z += dz

  _capsuleFeet.set(pos.x, feetY, pos.z)
  const queryR = Math.max(Math.abs(dx), Math.abs(dz), radius) + radius + 1.5
  const indices = enemyColliderIndices(
    world,
    pos.x,
    pos.z,
    queryR,
    feetY - height - 0.5,
    feetY + height + 0.5,
  )
  // lockVertical: slope normals must not shove feet downhill while crawling on XZ
  // (same as player.moveHorizontal). Do NOT lockHorizontal — that turns wall
  // depenetration into lift and wedges enemies into blocks.
  capsule.resolve(
    _capsuleFeet,
    radius,
    height,
    world.boxes,
    indices,
    enemy.collideTerrainMesh ? 3 : 4,
    enemy.collideTerrainMesh,
    true,
    false,
  )

  pos.x = _capsuleFeet.x
  pos.z = _capsuleFeet.z
  pos.y = _capsuleFeet.y - footLift
  return { achievedX: pos.x - beforeX, achievedZ: pos.z - beforeZ }
}

/** Fallback when no capsule collider is wired (AABB depenetrate only). */
function resolveEnemyVerticalVoxels(enemy: EnemyInstance, world: CollisionWorld) {
  fillEnemyCollisionAabb(enemy)
  const indices = queryEnemyVoxelBoxes(enemy, world)
  if (indices.length === 0) return

  _enemyAabbBefore.copy(_enemyMin)
  depenetratePlayerInBoxes(_enemyMin, _enemyMax, world.boxes, indices, 10, {
    floor: true,
    ceiling: true,
  })
  applyEnemyAabbDelta(enemy, _enemyAabbBefore, 'y')
}

/** XZ-only depenetrate (avoids floor/ceiling shoves that suck enemies into corners). */
function pushEnemyOutOfWalls(enemy: EnemyInstance, world: CollisionWorld): boolean {
  fillEnemyCollisionAabb(enemy)
  if (!enemyPenetratesVoxels(enemy, world)) return true

  for (let pass = 0; pass < 4; pass++) {
    fillEnemyCollisionAabb(enemy)
    if (!enemyPenetratesVoxels(enemy, world)) return true
    const indices = queryEnemyVoxelBoxes(enemy, world)
    if (indices.length === 0) return true

    _enemyAabbBefore.copy(_enemyMin)
    depenetrateAabbInBoxes(_enemyMin, _enemyMax, world.boxes, indices, 8, 'walls')
    applyEnemyAabbDelta(enemy, _enemyAabbBefore, 'xz')
  }
  return !enemyPenetratesVoxels(enemy, world)
}

/** Push the enemy out of voxel walls on XZ; returns false if still overlapping. */
function resolveEnemyWalls(enemy: EnemyInstance, world: CollisionWorld): boolean {
  fillEnemyCollisionAabb(enemy)
  const indices = queryEnemyVoxelBoxes(enemy, world)
  if (indices.length === 0) return true

  _enemyAabbBefore.copy(_enemyMin)
  depenetrateAabbInBoxes(_enemyMin, _enemyMax, world.boxes, indices, 14, 'walls')
  applyEnemyAabbDelta(enemy, _enemyAabbBefore, 'xz')
  return !enemyPenetratesVoxels(enemy, world)
}

/** Push the enemy out of voxel overlap (walls first; never shove downward while falling). */
export function ejectEnemyFromVoxels(
  enemy: EnemyInstance,
  world: CollisionWorld,
  allowVertical = true,
): boolean {
  if (!allowVertical) return pushEnemyOutOfWalls(enemy, world)

  fillEnemyCollisionAabb(enemy)
  if (!enemyPenetratesVoxels(enemy, world)) return true

  const falling = !enemy.grounded && enemy.velY < -0.5
  for (let pass = 0; pass < 5; pass++) {
    fillEnemyCollisionAabb(enemy)
    if (!enemyPenetratesVoxels(enemy, world)) return true

    const indices = queryEnemyVoxelBoxes(enemy, world)
    if (indices.length === 0) return true

    _enemyAabbBefore.copy(_enemyMin)
    depenetrateAabbInBoxes(_enemyMin, _enemyMax, world.boxes, indices, 12, 'walls')
    if (!falling) {
      depenetratePlayerInBoxes(_enemyMin, _enemyMax, world.boxes, indices, 8, {
        floor: true,
        ceiling: true,
      })
    }
    applyEnemyAabbDelta(enemy, _enemyAabbBefore, 'xyz')
  }
  return !enemyPenetratesVoxels(enemy, world)
}

function enemySlopeJumpVelocity(rise: number): number {
  const needed = Math.sqrt(2 * ENEMY_GRAVITY * (rise + 0.07))
  return THREE.MathUtils.clamp(needed, ENEMY_SLOPE_JUMP_MIN, ENEMY_SLOPE_JUMP_MAX)
}

function isEnemySteepSlope(rise: number, stepLen: number): boolean {
  return stepLen > 1e-4 && rise > 0.04 && rise / stepLen > ENEMY_MAX_SLOPE
}

function canEnemyStepTo(
  enemy: EnemyInstance,
  nextX: number,
  nextZ: number,
  stepLen: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld: CollisionWorld | undefined,
): { ok: boolean; hop: boolean; jumpVel?: number } {
  const feetY = getEnemyFeetY(enemy)
  const floor = probeEnemyGround(
    nextX,
    nextZ,
    feetY,
    targets,
    walkableYAt,
    2.5,
    collisionWorld,
    enemyGroundRadius(enemy),
  )
  // Never hard-block outdoor crawlers on probe noise — vertical pass sticks to ground.
  // Only suggest hops / jumps for clear ledges.
  if (floor === null) return { ok: true, hop: false }

  const rise = floor - feetY
  if (rise <= 0.05) return { ok: true, hop: false }
  // Probe hit a seam/lid far above feet — ignore.
  if (rise > 1.5) return { ok: true, hop: false }

  if (isEnemySteepSlope(rise, stepLen) && rise <= ENEMY_SLOPE_JUMP_MAX_RISE) {
    return { ok: true, hop: true, jumpVel: enemySlopeJumpVelocity(rise) }
  }

  if (rise > ENEMY_STEP_HEIGHT + 0.02) {
    // Too tall to step this frame — still allow XZ slide; don't freeze in place.
    return { ok: true, hop: false }
  }
  return { ok: true, hop: rise > 0.22 }
}

function applyEnemyStepHop(enemy: EnemyInstance, hop: boolean, jumpVel?: number) {
  if (!hop) return
  if (!enemy.grounded) return
  enemy.velY = Math.max(enemy.velY, jumpVel ?? ENEMY_LEDGE_HOP)
  enemy.grounded = false
}

function tryEnemyMoveXZStep(
  enemy: EnemyInstance,
  dx: number,
  dz: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld: CollisionWorld | undefined,
  capsuleCollider?: CapsuleCollider,
  fullCollision = false,
): boolean {
  const pos = enemy.root.position
  const prevX = pos.x
  const prevZ = pos.z
  const stepLen = Math.hypot(dx, dz)
  const check = canEnemyStepTo(
    enemy,
    prevX + dx,
    prevZ + dz,
    stepLen,
    targets,
    walkableYAt,
    collisionWorld,
  )
  applyEnemyStepHop(enemy, check.hop, check.jumpVel)

  // Always slide on XZ. Ground Y is owned by the vertical pass.
  pos.x += dx
  pos.z += dz

  if (!collisionWorld || !fullCollision) return true

  if (capsuleCollider && enemy.collideTerrainMesh) {
    pos.x = prevX
    pos.z = prevZ
    moveEnemyHorizontalCapsuleStep(enemy, dx, dz, collisionWorld, capsuleCollider)
    const got = Math.hypot(pos.x - prevX, pos.z - prevZ)
    // Mesh BVH often eats the whole step when feet clip grass triangles —
    // keep the cheap slide so crawlers don't freeze on open ground.
    if (stepLen > 1e-10 && got < stepLen * 0.15) {
      pos.x = prevX + dx
      pos.z = prevZ + dz
    }
    if (enemyPenetratesVoxels(enemy, collisionWorld)) {
      pushEnemyOutOfWalls(enemy, collisionWorld)
    }
    return true
  }

  resolveEnemyWalls(enemy, collisionWorld)
  return true
}

/** Step up onto a low ledge when a straight move is blocked by slope. */
function tryEnemyStepOntoLedge(
  enemy: EnemyInstance,
  dx: number,
  dz: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld: CollisionWorld | undefined,
  capsuleCollider?: CapsuleCollider,
  fullCollision = false,
): boolean {
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return false
  const pos = enemy.root.position
  const feetY = getEnemyFeetY(enemy)
  const floor = probeEnemyGround(
    pos.x + dx,
    pos.z + dz,
    feetY + ENEMY_STEP_HEIGHT,
    targets,
    walkableYAt,
    2.5,
    collisionWorld,
    enemyGroundRadius(enemy),
  )
  if (floor === null || floor <= feetY + 0.03) return false
  const rise = floor - feetY
  if (rise > ENEMY_STEP_HEIGHT + 0.04) return false

  const prevY = pos.y
  snapEnemyToGround(enemy, floor)
  if (
    !tryEnemyMoveXZStep(
      enemy,
      dx,
      dz,
      targets,
      walkableYAt,
      collisionWorld,
      capsuleCollider,
      fullCollision,
    )
  ) {
    pos.y = prevY
    return false
  }
  return true
}

function tryEnemyMoveXZ(
  enemy: EnemyInstance,
  dx: number,
  dz: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld?: CollisionWorld,
  capsuleCollider?: CapsuleCollider,
  fullCollision = false,
) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return

  const len = Math.hypot(dx, dz)
  // Cheap path: one step. Full collision: a few substeps max.
  const maxSteps = fullCollision ? (_detailEnemyCount > 4 ? 2 : 3) : 1
  const steps = Math.min(maxSteps, Math.max(1, Math.ceil(len / ENEMY_MOVE_SUBSTEP)))
  const sx = dx / steps
  const sz = dz / steps
  for (let i = 0; i < steps; i++) {
    tryEnemyMoveXZOnce(
      enemy,
      sx,
      sz,
      targets,
      walkableYAt,
      collisionWorld,
      capsuleCollider,
      fullCollision,
    )
  }
}

function tryEnemyMoveXZOnce(
  enemy: EnemyInstance,
  dx: number,
  dz: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld?: CollisionWorld,
  capsuleCollider?: CapsuleCollider,
  fullCollision = false,
) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return
  if (
    tryEnemyMoveXZStep(
      enemy,
      dx,
      dz,
      targets,
      walkableYAt,
      collisionWorld,
      capsuleCollider,
      fullCollision,
    )
  ) {
    return
  }

  const len = Math.hypot(dx, dz)
  if (len > 1e-9) {
    const nx = dx / len
    const nz = dz / len
    const slide = len * 0.72
    if (
      tryEnemyMoveXZStep(
        enemy,
        -nz * slide,
        nx * slide,
        targets,
        walkableYAt,
        collisionWorld,
        capsuleCollider,
        fullCollision,
      )
    ) {
      return
    }
    if (
      tryEnemyMoveXZStep(
        enemy,
        nz * slide,
        -nx * slide,
        targets,
        walkableYAt,
        collisionWorld,
        capsuleCollider,
        fullCollision,
      )
    ) {
      return
    }
  }

  if (
    tryEnemyMoveXZStep(
      enemy,
      dx,
      0,
      targets,
      walkableYAt,
      collisionWorld,
      capsuleCollider,
      fullCollision,
    )
  ) {
    return
  }
  if (
    tryEnemyMoveXZStep(
      enemy,
      0,
      dz,
      targets,
      walkableYAt,
      collisionWorld,
      capsuleCollider,
      fullCollision,
    )
  ) {
    return
  }

  if (
    tryEnemyStepOntoLedge(
      enemy,
      dx,
      dz,
      targets,
      walkableYAt,
      collisionWorld,
      capsuleCollider,
      fullCollision,
    )
  ) {
    return
  }
  tryEnemySlopeJump(enemy, dx, dz, targets, walkableYAt, collisionWorld, capsuleCollider, fullCollision)
}

/** Jump toward a steep climb when sliding / wall hits blocked a normal step. */
function tryEnemySlopeJump(
  enemy: EnemyInstance,
  dx: number,
  dz: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld: CollisionWorld | undefined,
  capsuleCollider?: CapsuleCollider,
  fullCollision = false,
): boolean {
  if (!enemy.grounded) return false
  const stepLen = Math.hypot(dx, dz)
  if (stepLen < 1e-9) return false

  const pos = enemy.root.position
  const feetY = getEnemyFeetY(enemy)
  const floor = probeEnemyGround(
    pos.x + dx,
    pos.z + dz,
    feetY,
    targets,
    walkableYAt,
    2.5,
    collisionWorld,
    enemyGroundRadius(enemy),
  )
  if (floor === null) return false

  const rise = floor - feetY
  if (rise < 0.04 || rise > ENEMY_SLOPE_JUMP_MAX_RISE) return false
  if (!isEnemySteepSlope(rise, stepLen)) return false

  applyEnemyStepHop(enemy, true, enemySlopeJumpVelocity(rise))
  tryEnemyMoveXZStep(
    enemy,
    dx,
    dz,
    targets,
    walkableYAt,
    collisionWorld,
    capsuleCollider,
    fullCollision,
  )
  return true
}

/**
 * Recover when buried under the outdoor mesh. Uses a local probe first, then a
 * short sky-floor check — grounded enemies can still be half-inside the mesh.
 */
function recoverEnemyOntoSurface(
  enemy: EnemyInstance,
  targets: MeshGroundTargets,
  collisionWorld?: CollisionWorld,
): boolean {
  const feetY = getEnemyFeetY(enemy)
  const pos = enemy.root.position
  const groundR = enemyGroundRadius(enemy)

  let floor = probeEnemyGround(
    pos.x,
    pos.z,
    feetY,
    targets,
    undefined,
    ENEMY_MESH_RECOVER_ABOVE + 1,
    collisionWorld,
    groundR,
  )
  // Local probe can miss when already deep under the mesh — try a short sky hit.
  if (floor === null) {
    const sky = resolveEnemyGroundY(pos.x, pos.z, targets, collisionWorld, feetY + 4)
    if (sky !== null && feetY < sky - ENEMY_GROUND_SNAP_EPS) {
      const depth = sky - feetY
      if (depth <= ENEMY_MESH_RECOVER_ABOVE) floor = sky
    }
  }
  if (floor === null) return false

  const gap = feetY - floor

  // Micro-stick while grounded on/near the floor.
  if (
    Math.abs(enemy.velY) < 0.2 &&
    gap >= -ENEMY_GROUND_SNAP_EPS &&
    gap <= ENEMY_LAND_SNAP
  ) {
    if (Math.abs(gap) > ENEMY_GROUND_SNAP_EPS) snapEnemyToGround(enemy, floor)
    enemy.velY = 0
    enemy.grounded = true
    enemy.orphanFallT = 0
    return true
  }

  // Buried — pull back onto the mesh (capped depth, no long teleports).
  if (gap < -ENEMY_GROUND_SNAP_EPS && -gap <= ENEMY_MESH_RECOVER_ABOVE) {
    const inCave =
      !!collisionWorld &&
      collisionWorld.nearestCeilingYAbove(
        pos.x,
        pos.z,
        feetY + 0.15,
        groundR,
        ENEMY_CAVE_CEILING_MAX,
      ) !== null
    if (!inCave) {
      snapEnemyToGround(enemy, floor)
      enemy.velY = 0
      enemy.grounded = true
      enemy.orphanFallT = 0
      return true
    }
  }

  return false
}

function updateEnemyVertical(
  enemy: EnemyInstance,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  dt: number,
  collisionWorld?: CollisionWorld,
  capsuleCollider?: CapsuleCollider,
) {
  recoverEnemyOntoSurface(enemy, targets, collisionWorld)

  enemy.velY -= ENEMY_GRAVITY * dt
  if (enemy.grounded && enemy.velY < 0) enemy.velY = 0
  enemy.velY = Math.max(enemy.velY, -ENEMY_MAX_FALL)

  const pos = enemy.root.position

  if (!collisionWorld) {
    if (enemy.grounded) {
      enemy.velY = 0
      return
    }
    pos.y += enemy.velY * dt
    return
  }

  if (
    enemy.grounded &&
    Math.abs(enemy.velY) < 0.05 &&
    !enemyHasGroundSupport(enemy, collisionWorld, targets, walkableYAt)
  ) {
    enemy.grounded = false
  }

  const dy = enemy.velY * dt
  if (Math.abs(dy) > 1e-9) {
    const useMeshCapsule = !!(capsuleCollider && enemy.collideTerrainMesh)
    if (useMeshCapsule) {
      const maxVert = enemy.grounded ? 3 : 5
      const steps = Math.min(
        maxVert,
        Math.max(1, Math.ceil(Math.abs(dy) / ENEMY_VERT_SUBSTEP)),
      )
      const sy = dy / steps
      for (let i = 0; i < steps; i++) {
        if (moveEnemyVerticalCapsuleStep(enemy, sy, collisionWorld, capsuleCollider!)) {
          enemy.grounded = sy < 0
          break
        }
      }
    } else {
      pos.y += dy
      // Cheap voxel vertical only — nearby boxes via queryNear.
      resolveEnemyVerticalVoxels(enemy, collisionWorld)
    }
  }

  const wasGrounded = enemy.grounded
  const maxDrop = wasGrounded ? ENEMY_STEP_HEIGHT + ENEMY_STICK_DOWN : ENEMY_LAND_SNAP

  const feetY = getEnemyFeetY(enemy)
  const groundR = enemyGroundRadius(enemy)
  const recoverBelow = wasGrounded
    ? maxDrop + 0.5
    : Math.max(maxDrop + 2.5, ENEMY_FALL_RECOVER_BELOW)
  const floor = probeEnemyGround(
    pos.x,
    pos.z,
    feetY,
    targets,
    walkableYAt,
    recoverBelow,
    collisionWorld,
    groundR,
  )
  if (floor === null) {
    enemy.grounded = false
    return
  }

  const gap = feetY - floor
  if (gap > maxDrop) {
    enemy.grounded = false
    return
  }

  if (enemy.velY > 0.15 && gap > ENEMY_GROUND_PROBE) {
    enemy.grounded = false
    return
  }

  if (gap < -ENEMY_GROUND_SNAP_EPS && -gap <= ENEMY_MESH_RECOVER_ABOVE) {
    snapEnemyToGround(enemy, floor)
    enemy.velY = 0
    enemy.grounded = true
    enemy.orphanFallT = 0
    return
  }

  if (gap <= ENEMY_LAND_SNAP) {
    if (gap > ENEMY_GROUND_SNAP_EPS) {
      snapEnemyToGround(enemy, floor)
    } else if (gap > ENEMY_GROUND_PROBE && wasGrounded) {
      enemy.root.position.y -= gap * 0.5
    }
    enemy.velY = 0
    enemy.grounded = true
    enemy.orphanFallT = 0
  }
}

/** Soft XZ push so enemies do not stack. Direct nudge, then wall-eject so packs don't wedge into voxels. */
function applyEnemySeparation(
  enemies: EnemyInstance[],
  dt: number,
  playerPos: THREE.Vector3,
  collisionWorld?: CollisionWorld,
) {
  const n = enemies.length
  if (n < 2) return

  const scale = ENEMY_SEPARATION_STRENGTH * dt
  const detailR = ENEMY_DETAIL_RANGE + ENEMY_SEP_RANGE
  const detailRSq = detailR * detailR
  let nudged = false

  for (let i = 0; i < n; i++) {
    const a = enemies[i]!
    if (a.attackPhase === 'lunge') continue
    const pos = a.root.position
    const adx = pos.x - playerPos.x
    const adz = pos.z - playerPos.z
    // Far packs don't visually stack — skip the O(n²) pass outside fight range.
    if (adx * adx + adz * adz > detailRSq) continue

    for (let j = i + 1; j < n; j++) {
      const b = enemies[j]!
      const ox = pos.x - b.root.position.x
      const oz = pos.z - b.root.position.z
      const distSq = ox * ox + oz * oz
      if (distSq > ENEMY_SEP_RANGE_SQ) continue

      const minDist = a.separationRadius + b.separationRadius
      if (distSq >= minDist * minDist) continue

      if (distSq < 1e-8) {
        const angle = (i * 7 + j * 13) * 0.91
        const fx = Math.cos(angle) * 0.5 * scale
        const fz = Math.sin(angle) * 0.5 * scale
        pos.x += fx
        pos.z += fz
        b.root.position.x -= fx
        b.root.position.z -= fz
        nudged = true
        continue
      }

      const dist = Math.sqrt(distSq)
      const overlap = (minDist - dist) / minDist
      const fx = (ox / dist) * overlap * 0.5 * scale
      const fz = (oz / dist) * overlap * 0.5 * scale
      pos.x += fx
      pos.z += fz
      b.root.position.x -= fx
      b.root.position.z -= fz
      nudged = true
    }
  }

  if (!nudged || !collisionWorld) return
  for (let i = 0; i < n; i++) {
    const enemy = enemies[i]!
    const pos = enemy.root.position
    const dx = pos.x - playerPos.x
    const dz = pos.z - playerPos.z
    if (dx * dx + dz * dz > detailRSq) continue
    if (enemyPenetratesVoxels(enemy, collisionWorld)) {
      pushEnemyOutOfWalls(enemy, collisionWorld)
    }
  }
}

function resetEnemyVisualPose(visual: THREE.Group) {
  visual.position.set(0, 0, 0)
  visual.rotation.x = 0
  visual.rotation.y = 0
  visual.rotation.z = 0
}

function startEnemyHitSpin(enemy: EnemyInstance) {
  enemy.hitSpinT = ENEMY_HIT_SPIN_DURATION
}

function updateEnemyHitSpin(enemy: EnemyInstance, dt: number) {
  if (enemy.hitSpinT <= 0) {
    if (enemy.visual.rotation.y !== 0) enemy.visual.rotation.y = 0
    return
  }
  enemy.hitSpinT = Math.max(0, enemy.hitSpinT - dt)
  const progress = 1 - enemy.hitSpinT / ENEMY_HIT_SPIN_DURATION
  enemy.visual.rotation.y = progress * ENEMY_HIT_SPIN_TAU
  if (enemy.hitSpinT <= 0) enemy.visual.rotation.y = 0
}

function steerEnemyTowardPlayer(
  enemy: EnemyInstance,
  playerPos: THREE.Vector3,
  outDx: { v: number },
  outDz: { v: number },
  outDist: { v: number },
) {
  const pos = enemy.root.position
  outDx.v = playerPos.x - pos.x
  outDz.v = playerPos.z - pos.z
  outDist.v = Math.hypot(outDx.v, outDz.v)
  if (outDist.v > 1e-4) {
    enemy.lungeDirX = outDx.v / outDist.v
    enemy.lungeDirZ = outDz.v / outDist.v
    enemy.root.rotation.y = facingYawForPlusX(outDx.v, outDz.v)
  }
}

/** Y tolerance for voxel-top vs mesh-ground mismatch and lunge bite pose. */
const VERTICAL_COMBAT_SLACK = ENEMY_LUNGE_JUMP + 0.22

/**
 * Cheap combat AABB from cached extents + lunge pose — avoids setFromObject
 * (full visual subtree traverse) on every bite check during fights.
 */
function fillEnemyCombatAabb(enemy: EnemyInstance, expand = 0) {
  const pos = enemy.root.position
  const visual = enemy.visual
  const feetY = pos.y + enemy.colFootOffset + visual.position.y
  const hx = enemy.colHalfX + expand
  const hz = enemy.colHalfZ + expand
  const jump =
    enemy.attackPhase === 'lunge' ? Math.max(0, visual.position.y) + ENEMY_LUNGE_JUMP * 0.15 : 0
  _box.min.set(pos.x - hx, feetY - expand, pos.z - hz)
  _box.max.set(
    pos.x + hx,
    feetY + enemy.colHeight + jump + expand,
    pos.z + hz,
  )
}

function enemyVerticalExtents(
  enemy: EnemyInstance,
  includeLungeJump: boolean,
): { lo: number; hi: number } {
  fillEnemyCombatAabb(enemy, 0)
  const jump =
    includeLungeJump && enemy.attackPhase === 'lunge' ? ENEMY_LUNGE_JUMP : 0
  return { lo: _box.min.y, hi: _box.max.y + jump }
}

function playerVerticallyInBiteRange(
  playerPos: THREE.Vector3,
  enemy: EnemyInstance,
): boolean {
  const { lo: enemyLo, hi: enemyHi } = enemyVerticalExtents(enemy, true)
  const playerLo = playerPos.y
  const playerHi = playerPos.y + PLAYER_HEIGHT
  return (
    playerHi >= enemyLo - VERTICAL_COMBAT_SLACK &&
    playerLo <= enemyHi + VERTICAL_COMBAT_SLACK
  )
}

type LungeBiteMetrics = {
  distXZ: number
  dirX: number
  dirZ: number
  arch: number
  inBiteWindow: boolean
  inReach: boolean
  verticalOk: boolean
}

/** Closest XZ gap between the player capsule and the enemy visual (includes lunge pose). */
function measureLungeBite(
  playerPos: THREE.Vector3,
  enemy: EnemyInstance,
  endSnap = false,
): LungeBiteMetrics {
  const t = Math.min(1, enemy.attackPhaseTime / ENEMY_LUNGE_DURATION)
  const arch = Math.sin(Math.PI * t)

  const pad = endSnap ? 0.2 : 0.05 + arch * 0.16
  fillEnemyCombatAabb(enemy, pad)

  const px = playerPos.x
  const pz = playerPos.z
  const closestX = THREE.MathUtils.clamp(px, _box.min.x, _box.max.x)
  const closestZ = THREE.MathUtils.clamp(pz, _box.min.z, _box.max.z)
  const gapX = px - closestX
  const gapZ = pz - closestZ
  const distXZ = Math.max(0, Math.hypot(gapX, gapZ) - PLAYER_RADIUS)

  const py0 = playerPos.y
  const py1 = playerPos.y + PLAYER_HEIGHT
  const vertPad = endSnap
    ? VERTICAL_COMBAT_SLACK
    : VERTICAL_COMBAT_SLACK * 0.72 + arch * 0.06
  const verticalOk = py1 >= _box.min.y - vertPad && py0 <= _box.max.y + vertPad

  const reach =
    PLAYER_RADIUS +
    enemy.separationRadius +
    ENEMY_LUNGE_REACH_PAD +
    (endSnap ? 0.22 : arch * 0.18)

  const pos = enemy.root.position
  return {
    distXZ,
    dirX: playerPos.x - pos.x,
    dirZ: playerPos.z - pos.z,
    arch,
    inBiteWindow: endSnap || arch >= 0.18,
    inReach: distXZ <= reach,
    verticalOk,
  }
}

function enemyTouchRange(enemy: EnemyInstance): number {
  return PLAYER_RADIUS + enemy.separationRadius
}

function applyPlayerHitFromEnemy(
  enemy: EnemyInstance,
  distXZ: number,
  dirX: number,
  dirZ: number,
  damage: { value: number },
  knockbackX: { value: number },
  knockbackZ: { value: number },
  knockbackDist: { value: number },
): void {
  damage.value += enemy.isBig ? ENEMY_BIG_DAMAGE : ENEMY_DAMAGE
  enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN
  let nx = distXZ > 1e-4 ? dirX / distXZ : enemy.lungeDirX
  let nz = distXZ > 1e-4 ? dirZ / distXZ : enemy.lungeDirZ
  const nlen = Math.hypot(nx, nz)
  if (nlen < 1e-4) return
  nx /= nlen
  nz /= nlen
  const useDist = distXZ > 1e-4 ? distXZ : 0
  if (knockbackDist.value === Infinity || useDist < knockbackDist.value) {
    knockbackX.value = nx
    knockbackZ.value = nz
    knockbackDist.value = useDist
  }
}

function tryApplyContactDamage(
  enemy: EnemyInstance,
  playerPos: THREE.Vector3,
  distXZ: number,
  dirX: number,
  dirZ: number,
  damage: { value: number },
  knockbackX: { value: number },
  knockbackZ: { value: number },
  knockbackDist: { value: number },
): boolean {
  if (enemy.attackCooldown > 0) return false
  if (distXZ > enemyTouchRange(enemy)) return false
  if (!playerVerticallyInBiteRange(playerPos, enemy)) return false

  applyPlayerHitFromEnemy(
    enemy,
    distXZ,
    dirX,
    dirZ,
    damage,
    knockbackX,
    knockbackZ,
    knockbackDist,
  )
  return true
}

function tryApplyLungeBite(
  enemy: EnemyInstance,
  playerPos: THREE.Vector3,
  damage: { value: number },
  knockbackX: { value: number },
  knockbackZ: { value: number },
  knockbackDist: { value: number },
  endSnap = false,
): boolean {
  if (enemy.biteHit || enemy.attackPhase !== 'lunge') return false

  const bite = measureLungeBite(playerPos, enemy, endSnap)
  if (!bite.inBiteWindow || !bite.inReach || !bite.verticalOk) return false

  const dist = Math.max(bite.distXZ, 1e-4)
  applyPlayerHitFromEnemy(
    enemy,
    dist,
    bite.dirX,
    bite.dirZ,
    damage,
    knockbackX,
    knockbackZ,
    knockbackDist,
  )
  enemy.biteHit = true
  return true
}

function startEnemyLunge(enemy: EnemyInstance, dx: number, dz: number, distXZ: number) {
  enemy.attackPhase = 'lunge'
  enemy.attackPhaseTime = 0
  enemy.biteHit = false
  enemy.lungeDirX = dx / distXZ
  enemy.lungeDirZ = dz / distXZ
  enemy.root.rotation.y = facingYawForPlusX(dx, dz)
  enemy.knockVX = 0
  enemy.knockVZ = 0
}

const _towardDx = { v: 0 }
const _towardDz = { v: 0 }
const _towardDist = { v: 0 }

function updateEnemyBitePhase(
  enemy: EnemyInstance,
  playerPos: THREE.Vector3,
  dt: number,
  damage: { value: number },
  knockbackX: { value: number },
  knockbackZ: { value: number },
  knockbackDist: { value: number },
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld: CollisionWorld | undefined,
  capsuleCollider?: CapsuleCollider,
) {
  const visual = enemy.visual
  enemy.attackPhaseTime += dt

  if (enemy.attackPhase === 'lunge') {
    steerEnemyTowardPlayer(enemy, playerPos, _towardDx, _towardDz, _towardDist)

    const t = Math.min(1, enemy.attackPhaseTime / ENEMY_LUNGE_DURATION)
    const arch = Math.sin(Math.PI * t)
    visual.position.y = arch * ENEMY_LUNGE_JUMP
    // Model crawls along local +X; pitch around Z bites forward toward the player.
    visual.rotation.z = -arch * 0.72

    const moveScale = enemy.isBig ? ENEMY_BIG_CRAWL_SPEED_SCALE : 1
    const forwardStep = (ENEMY_LUNGE_FORWARD / ENEMY_LUNGE_DURATION) * moveScale * dt
    const stopDist = PLAYER_RADIUS + enemy.separationRadius * 0.75 + 0.06
    const closeGap = Math.max(0, _towardDist.v - stopDist)
    const move = Math.min(forwardStep, closeGap)
    tryEnemyMoveXZ(
      enemy,
      enemy.lungeDirX * move,
      enemy.lungeDirZ * move,
      targets,
      walkableYAt,
      collisionWorld,
      capsuleCollider,
      true,
    )

    tryApplyLungeBite(enemy, playerPos, damage, knockbackX, knockbackZ, knockbackDist)

    if (t >= 1) {
      tryApplyLungeBite(enemy, playerPos, damage, knockbackX, knockbackZ, knockbackDist, true)
      enemy.attackPhase = 'recover'
      enemy.attackPhaseTime = 0
      if (!enemy.biteHit) enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN * 0.35
      else enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN
    }
    return
  }

  // recover — pause ~1s after the bite, then resume chasing
  const settle = Math.min(1, enemy.attackPhaseTime / 0.18)
  visual.position.y = THREE.MathUtils.lerp(visual.position.y, 0, settle)
  visual.rotation.z = THREE.MathUtils.lerp(visual.rotation.z, 0, settle)

  if (enemy.attackPhaseTime >= ENEMY_LUNGE_RECOVER_DURATION) {
    enemy.attackPhase = 'idle'
    enemy.attackPhaseTime = 0
    resetEnemyVisualPose(visual)
  }
}

function snapEnemyToGround(enemy: EnemyInstance, groundY: number) {
  enemy.root.position.y = groundY - enemy.colFootOffset
}

/**
 * Lift enemies out of terrain mesh / voxels after movement.
 * Mesh BVH push-out is required for outer surface pieces; never mark grounded
 * while still penetrating solids.
 */
function unstickEnemyFromTerrain(
  enemy: EnemyInstance,
  targets: MeshGroundTargets,
  collisionWorld: CollisionWorld,
  capsuleCollider?: CapsuleCollider,
) {
  recoverEnemyOntoSurface(enemy, targets, collisionWorld)

  const pos = enemy.root.position
  const feetY = getEnemyFeetY(enemy)

  const floor = probeEnemyGround(
    pos.x,
    pos.z,
    feetY,
    targets,
    undefined,
    ENEMY_MESH_RECOVER_ABOVE + 0.5,
    collisionWorld,
    enemyGroundRadius(enemy),
  )

  if (floor !== null && feetY < floor - ENEMY_GROUND_SNAP_EPS) {
    const depth = floor - feetY
    if (depth <= ENEMY_MESH_RECOVER_ABOVE) {
      snapEnemyToGround(enemy, floor)
      enemy.velY = 0
      enemy.grounded = true
    }
  }

  if (enemyPenetratesVoxels(enemy, collisionWorld)) {
    pushEnemyOutOfWalls(enemy, collisionWorld)
    if (enemyPenetratesVoxels(enemy, collisionWorld)) {
      ejectEnemyFromVoxels(enemy, collisionWorld, false)
      enemy.grounded = false
    }
  }

  // Mesh push-out only when this enemy has mesh capsule enabled this frame.
  if (!capsuleCollider || !enemy.collideTerrainMesh) return

  const { feetY: capFeet, height, radius } = enemyCapsuleFromAabb(enemy)
  _capsuleFeet.set(pos.x, capFeet, pos.z)
  const indices = enemyColliderIndices(
    collisionWorld,
    pos.x,
    pos.z,
    radius + 1.5,
    capFeet - 0.5,
    capFeet + height + 0.5,
  )
  const hit = capsuleCollider.resolve(
    _capsuleFeet,
    radius,
    height,
    collisionWorld.boxes,
    indices,
    3,
    true,
    false,
    true,
  )
  // Cap mesh lift so unstick can't teleport them onto a seam.
  const lift = _capsuleFeet.y - capFeet
  if (lift > 1e-5 && lift <= ENEMY_MESH_RECOVER_ABOVE) {
    pos.y += lift
  }
  if (hit.pushUp > ENEMY_GROUND_SNAP_EPS && hit.pushUp <= ENEMY_MESH_RECOVER_ABOVE) {
    enemy.grounded = true
    enemy.velY = 0
    enemy.orphanFallT = 0
  }
}

function syncEnemyHealthBar(enemy: EnemyInstance, camera: THREE.Camera) {
  const pos = enemy.root.position
  const visual = enemy.visual
  // Full-health bars are noise and cost a project()+billboard per enemy.
  if (enemy.health >= enemy.maxHealth) {
    enemy.healthBarGroup.visible = false
    return
  }
  const cdx = pos.x - _healthBarCamPos.x
  const cdz = pos.z - _healthBarCamPos.z
  if (cdx * cdx + cdz * cdz > HEALTH_BAR_RANGE_SQ) {
    enemy.healthBarGroup.visible = false
    return
  }
  _worldPos.set(
    pos.x,
    pos.y + enemy.colFootOffset + enemy.colHeight + visual.position.y + ENEMY_BAR_HEAD_GAP,
    pos.z,
  )
  _proj.copy(_worldPos).project(camera)
  if (_proj.z > 1 || _proj.z < -1) {
    enemy.healthBarGroup.visible = false
    return
  }
  enemy.healthBarGroup.visible = true
  enemy.healthBarGroup.position.copy(_worldPos)
  enemy.healthBarGroup.quaternion.copy(camera.quaternion)

  const t = Math.max(0, enemy.health / enemy.maxHealth)
  const w = enemy.healthBarWidth
  const h = enemy.isBig ? ENEMY_BAR_BIG_WORLD_HEIGHT : ENEMY_BAR_WORLD_HEIGHT
  enemy.healthFill.scale.set(w * t, h, 1)
  enemy.healthFill.position.x = (-w * (1 - t)) / 2
  healthBarColorFromFraction(
    t,
    (enemy.healthFill.material as THREE.MeshBasicMaterial).color,
  )
}

/** Visual template (model group with mesh + inner light); clone per spawn. */
export async function loadEnemyTemplate(url = ENEMY_MODEL_URL): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const mesh = gltf.scene
  const embeddedLights: THREE.PointLight[] = []
  mesh.traverse((child) => {
    if (child instanceof THREE.PointLight) embeddedLights.push(child)
  })
  for (const light of embeddedLights) light.parent?.remove(light)
  applyEnemyMaterials(mesh)
  alignModelToGround(mesh)
  scaleToTargetHeight(mesh, ENEMY_TARGET_HEIGHT)

  const model = new THREE.Group()
  model.add(mesh)

  const innerLight = new THREE.PointLight(INNER_LIGHT_COLOR, 1, 1, 1)
  innerLight.userData.isEnemyInnerLight = true
  configureInnerLight(innerLight)
  model.add(innerLight)
  centerInnerLightInVisual(model)

  enableAutoMatrices(model)
  bakeTemplateCollision(model)
  return model
}

export function createEnemy(
  template: THREE.Group,
  x: number,
  y: number,
  z: number,
  parent: THREE.Object3D,
  barParent: THREE.Object3D,
  options: EnemyCreateOptions = {},
): EnemyInstance {
  const isBig = options.big === true
  const scaleMul = isBig ? ENEMY_BIG_SCALE : 1
  const maxHealth = isBig ? ENEMY_BIG_MAX_HEALTH : ENEMY_MAX_HEALTH

  const root = new THREE.Group()
  root.position.set(x, 0, z)
  root.rotation.y = Math.random() * Math.PI * 2
  root.matrixAutoUpdate = true

  const model = acquireEnemyVisual(template, isBig)
  const lightParts = findVisualParts(model)
  if (lightParts) {
    configureInnerLight(lightParts.innerLight)
    if (isBig) {
      lightParts.innerLight.intensity = INNER_LIGHT_INTENSITY * 1.35
      lightParts.innerLight.distance = INNER_LIGHT_DISTANCE * scaleMul
      storeEnemyLightBase(lightParts.innerLight)
    }
  }
  root.add(model)

  if (!templateCol) bakeTemplateCollision(template)
  const pickMesh = createPickColliderFromCache(scaleMul)
  root.add(pickMesh)

  parent.add(root)

  const { group: healthBarGroup, fill: healthFill, width: healthBarWidth } =
    createEnemyHealthBar(isBig)
  barParent.add(healthBarGroup)

  const enemy: EnemyInstance = {
    root,
    visual: model,
    pickMesh,
    colHalfX: 0.2,
    colHalfZ: 0.2,
    colHeight: 0.5,
    colFootOffset: 0,
    innerLight: lightParts?.innerLight ?? null,
    separationRadius: 0.3,
    maxHealth,
    isBig,
    health: maxHealth,
    attackCooldown: 0.4 + Math.random() * 0.5,
    attackPhase: 'idle',
    attackPhaseTime: 0,
    lungeDirX: 0,
    lungeDirZ: 0,
    biteHit: false,
    knockVX: 0,
    knockVZ: 0,
    hitSpinT: 0,
    velY: 0,
    grounded: true,
    collideTerrainMesh: false,
    orphanFallT: 0,
    healthBarGroup,
    healthFill,
    healthBarWidth,
    spawnTime: performance.now(),
  }
  applyBakedCollision(enemy, scaleMul)
  snapEnemyToGround(enemy, y)
  return enemy
}

export function despawnExpiredEnemies(
  enemies: EnemyInstance[],
  parent: THREE.Object3D,
  nowMs = performance.now(),
) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i]!
    if (nowMs - enemy.spawnTime >= ENEMY_LIFETIME_MS) {
      removeEnemy(enemy, parent, enemies)
    }
  }
}

/** Drop farthest idle enemies beyond 2× aggro when over the soft cap. */
export function cullExcessEnemies(
  enemies: EnemyInstance[],
  parent: THREE.Object3D,
  playerPos: THREE.Vector3,
  maxAlive = ENEMY_MAX_ALIVE,
) {
  const cullRangeSq = (ENEMY_AGGRO_RANGE * 2) * (ENEMY_AGGRO_RANGE * 2)
  while (enemies.length > maxAlive) {
    let worst = -1
    let worstDist = -1
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i]!
      if (enemy.attackPhase !== 'idle') continue
      const pos = enemy.root.position
      const dx = pos.x - playerPos.x
      const dz = pos.z - playerPos.z
      const distSq = dx * dx + dz * dz
      // Never delete enemies still in/near the fight.
      if (distSq < cullRangeSq) continue
      if (distSq > worstDist) {
        worstDist = distSq
        worst = i
      }
    }
    // If everyone is in fight range, stop spawning pressure instead of deleting.
    if (worst < 0) break
    removeEnemy(enemies[worst]!, parent, enemies)
  }
}

/**
 * Last-resort cleanup for enemies that fell through the world with no floor.
 * Never teleports; only gradual lift or delayed delete.
 */
export function despawnOrphanEnemies(
  enemies: EnemyInstance[],
  parent: THREE.Object3D,
  targets: MeshGroundTargets,
  collisionWorld?: CollisionWorld,
  dt = 1 / 60,
) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i]!
    const feetY = getEnemyFeetY(enemy)
    const pos = enemy.root.position
    const skyFloor = resolveEnemyGroundY(pos.x, pos.z, targets, collisionWorld, feetY)

    // Even "grounded" enemies can be sunk — pull them up before other orphan logic.
    if (skyFloor !== null) {
      const below = skyFloor - feetY
      if (below > ENEMY_GROUND_SNAP_EPS && below <= ENEMY_MESH_RECOVER_ABOVE) {
        const inCave =
          !!collisionWorld &&
          collisionWorld.nearestCeilingYAbove(
            pos.x,
            pos.z,
            feetY + 0.15,
            enemyGroundRadius(enemy),
            ENEMY_CAVE_CEILING_MAX,
          ) !== null
        if (!inCave) {
          snapEnemyToGround(enemy, skyFloor)
          enemy.velY = 0
          enemy.grounded = true
          enemy.orphanFallT = 0
          continue
        }
      }
    }

    if (enemy.grounded && enemy.velY >= -0.05) {
      enemy.orphanFallT = 0
      continue
    }

    if (skyFloor === null) {
      if (feetY < -ENEMY_ORPHAN_FALL_CULL) {
        enemy.orphanFallT += dt
        if (enemy.orphanFallT >= ENEMY_ORPHAN_DESPAWN_SEC) {
          removeEnemy(enemy, parent, enemies)
        }
      } else {
        enemy.orphanFallT = 0
      }
      continue
    }

    const below = skyFloor - feetY
    if (below <= ENEMY_GROUND_SNAP_EPS) {
      enemy.orphanFallT = 0
      continue
    }

    const inCave =
      !!collisionWorld &&
      collisionWorld.nearestCeilingYAbove(
        pos.x,
        pos.z,
        feetY + 0.15,
        enemyGroundRadius(enemy),
        ENEMY_CAVE_CEILING_MAX,
      ) !== null
    if (inCave) {
      enemy.orphanFallT = 0
      continue
    }

    enemy.orphanFallT += dt
    if (enemy.orphanFallT >= ENEMY_ORPHAN_DESPAWN_SEC && below > ENEMY_ORPHAN_FALL_CULL * 0.5) {
      removeEnemy(enemy, parent, enemies)
    }
  }
}

export function removeEnemy(
  enemy: EnemyInstance,
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
) {
  parent.remove(enemy.root)
  parent.remove(enemy.healthBarGroup)
  releaseEnemyVisual(enemy.visual, enemy.isBig)
  // Pick geometry is shared across scale tiers — do not dispose.
  const idx = enemies.indexOf(enemy)
  if (idx >= 0) enemies.splice(idx, 1)
}

export function pickRandomEnemySpawn(
  cells: Record<string, EnemyCellMeta>,
  playerX: number,
  playerZ: number,
  gridMinX: number,
  gridMinZ: number,
  cellSize: number,
  gridSpan: number,
  minCellDist = 1,
  maxCellDist = 5,
): { x: number; z: number; y?: number } | null {
  const entries = Object.values(cells)
  if (entries.length === 0) return null

  const playerIx = THREE.MathUtils.clamp(
    Math.floor((playerX - gridMinX) / cellSize),
    0,
    gridSpan - 1,
  )
  const playerIy = THREE.MathUtils.clamp(
    Math.floor((playerZ - gridMinZ) / cellSize),
    0,
    gridSpan - 1,
  )

  // Reservoir sample in-ring so we don't allocate candidate arrays every spawn tick.
  let best: EnemyCellMeta | null = null
  let bestCount = 0
  let fallback: EnemyCellMeta | null = null
  let fallbackCount = 0
  for (const cell of entries) {
    const d = Math.max(Math.abs(cell.ix - playerIx), Math.abs(cell.iy - playerIy))
    if (d >= minCellDist && d <= maxCellDist) {
      bestCount++
      if (Math.random() * bestCount < 1) best = cell
    } else if (d <= maxCellDist + 3) {
      fallbackCount++
      if (Math.random() * fallbackCount < 1) fallback = cell
    }
  }
  const cell = best ?? fallback ?? entries[Math.floor(Math.random() * entries.length)]!
  const spread = cellSize * 0.42
  const ox = (hashUnit(cell.ix * 4133 + cell.iy * 7919) * 2 - 1) * spread
  const oz = (hashUnit(cell.ix * 97 + cell.iy * 1009) * 2 - 1) * spread
  return {
    x: cell.center_x + ox,
    z: cell.center_y + oz,
    // Cap top is only a search hint — mesh/voxel resolve picks the real floor.
    y: cell.cap_top_y,
  }
}

export function resolveEnemyGroundY(
  x: number,
  z: number,
  targets: MeshGroundTargets,
  collisionWorld?: CollisionWorld,
  /** When set (e.g. spawn near the player in a pit), prefer a floor near this Y. */
  nearY?: number,
): number | null {
  const searchY =
    nearY ?? collisionWorld?.heightHintAt(x, z) ?? undefined
  if (collisionWorld && searchY !== undefined) {
    // recoverBelow covers the typical seam→mesh gap (often 2–5 m).
    // excludeSurface: never spawn/snap onto coarse seam-cap AABBs.
    const local = collisionWorld.findGroundTop(
      x,
      searchY,
      z,
      PLAYER_RADIUS,
      ENEMY_STEP_HEIGHT,
      true,
      ENEMY_SEAM_MESH_GAP,
      true,
    )
    if (local !== null) return local
    const voxel = collisionWorld.findGroundTop(
      x,
      searchY,
      z,
      PLAYER_RADIUS,
      ENEMY_STEP_HEIGHT,
      true,
      ENEMY_SEAM_MESH_GAP,
      false,
    )
    if (voxel !== null) return voxel
  }
  // Mesh raycast is authoritative outdoors. Height hints / walkable boxes sit on
  // the voxel seam and would leave enemies floating above the grass.
  return sampleMeshGroundY(x, z, RAY_ORIGIN_Y, targets, _rayHits, RAYCAST_FAR, {
    intersectInvisibleChunks: true,
  })
}

export type EnemyUpdateResult = {
  damage: number
  /** World XZ knockback direction (not normalized); zero if no hit this frame. */
  knockbackX: number
  knockbackZ: number
}

export function updateEnemies(
  enemies: EnemyInstance[],
  playerPos: THREE.Vector3,
  targets: MeshGroundTargets,
  dt: number,
  crawlSpeed: number,
  /** Floor near current feet (voxel tops + mesh), not the top of the whole column. */
  walkableYAt?: (
    x: number,
    z: number,
    feetY: number,
    recoverBelow?: number,
  ) => number | null,
  collisionWorld?: CollisionWorld,
  capsuleCollider?: CapsuleCollider,
): EnemyUpdateResult {
  let damage = 0
  let knockbackX = 0
  let knockbackZ = 0
  const dmgOut = { value: 0 }
  const kbX = { value: 0 }
  const kbZ = { value: 0 }
  const kbDist = { value: Infinity }

  beginEnemyGroundProbeFrame()

  // Match ground probes: collide distance-culled *merged chunk* meshes only.
  const prevInvisibleChunks = capsuleCollider?.collideInvisibleChunks ?? false
  if (capsuleCollider) capsuleCollider.collideInvisibleChunks = true

  try {

  // Nearest enemies get full collision; others use cheap probe-slide (staggered).
  _lightOrder.length = 0
  for (const enemy of enemies) {
    const pos = enemy.root.position
    const dx = playerPos.x - pos.x
    const dz = playerPos.z - pos.z
    const distSq = dx * dx + dz * dz
    if (distSq <= ENEMY_DETAIL_RANGE_SQ || enemy.attackPhase !== 'idle') {
      _detailEnemyCount++
      _lightOrder.push({ enemy, distSq })
    }
  }
  if (_lightOrder.length > 1) _lightOrder.sort((a, b) => a.distSq - b.distSq)
  const fullCollide = new Set<EnemyInstance>()
  for (let i = 0; i < _lightOrder.length && i < ENEMY_FULL_COLLIDE_MAX; i++) {
    fullCollide.add(_lightOrder[i]!.enemy)
  }
  for (const enemy of enemies) {
    if (enemy.attackPhase === 'lunge') fullCollide.add(enemy)
  }

  const knockDrag = Math.exp(-ENEMY_KNOCKBACK_DRAG * dt)
  const ACTIVE_RANGE = ENEMY_AGGRO_RANGE
  const ACTIVE_RANGE_SQ = ACTIVE_RANGE * ACTIVE_RANGE

  // Reuse list for light budget after the move pass.
  _lightOrder.length = 0

  for (const enemy of enemies) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
    updateEnemyHitSpin(enemy, dt)

    const pos = enemy.root.position
    const dx = playerPos.x - pos.x
    const dz = playerPos.z - pos.z
    const distSq = dx * dx + dz * dz
    const nearPlayer = distSq <= ACTIVE_RANGE_SQ
    const detail = distSq <= ENEMY_DETAIL_RANGE_SQ || enemy.attackPhase !== 'idle'
    const staggered =
      ((_groundProbeFrame + (enemy.root.id | 0)) % ENEMY_COLLIDE_STAGGER) === 0
    const doFull =
      detail &&
      !!capsuleCollider &&
      (fullCollide.has(enemy) || (staggered && nearPlayer))
    enemy.collideTerrainMesh = doFull
    const world = detail ? collisionWorld : undefined
    const capsule = doFull ? capsuleCollider : undefined

    // Always unbury near enemies — grounded-but-sunk was leaving one stuck in mesh.
    if (nearPlayer || detail || !enemy.grounded) {
      recoverEnemyOntoSurface(enemy, targets, collisionWorld)
    }

    if (enemy.innerLight) _lightOrder.push({ enemy, distSq })

    enemy.knockVX *= knockDrag
    enemy.knockVZ *= knockDrag
    const knockX = enemy.knockVX * dt
    const knockZ = enemy.knockVZ * dt
    if (Math.abs(knockX) > 1e-8 || Math.abs(knockZ) > 1e-8) {
      if (detail && world) {
        tryEnemyMoveXZ(
          enemy,
          knockX,
          knockZ,
          targets,
          walkableYAt,
          world,
          capsule,
          doFull,
        )
      } else {
        pos.x += knockX
        pos.z += knockZ
      }
    }

    const distXZ = Math.sqrt(distSq)
    const canSeePlayer = nearPlayer

    if (enemy.attackPhase !== 'idle') {
      updateEnemyBitePhase(
        enemy,
        playerPos,
        dt,
        dmgOut,
        kbX,
        kbZ,
        kbDist,
        targets,
        walkableYAt,
        world,
        capsule,
      )
    } else if (canSeePlayer) {
      if (distXZ > 1e-4) {
        enemy.root.rotation.y = facingYawForPlusX(dx, dz)
      }

      if (distXZ > 0.02) {
        const moveScale = enemy.isBig ? ENEMY_BIG_CRAWL_SPEED_SCALE : 1
        const step = Math.min(crawlSpeed * moveScale * dt, distXZ)
        const mx = (dx / distXZ) * step
        const mz = (dz / distXZ) * step
        if (detail && world) {
          tryEnemyMoveXZ(
            enemy,
            mx,
            mz,
            targets,
            walkableYAt,
            world,
            capsule,
            doFull,
          )
        } else {
          pos.x += mx
          pos.z += mz
        }
      }
    }

    if (!canSeePlayer) continue

    const hitDx = playerPos.x - pos.x
    const hitDz = playerPos.z - pos.z
    const hitDist = Math.hypot(hitDx, hitDz)

    if (enemy.attackPhase === 'idle' || enemy.attackPhase === 'recover') {
      tryApplyContactDamage(enemy, playerPos, hitDist, hitDx, hitDz, dmgOut, kbX, kbZ, kbDist)
    }

    if (
      enemy.attackPhase === 'idle' &&
      hitDist <= ENEMY_BITE_START_RANGE &&
      enemy.attackCooldown <= 0 &&
      playerVerticallyInBiteRange(playerPos, enemy)
    ) {
      startEnemyLunge(enemy, hitDx, hitDz, hitDist)
    }
  }

  // Nearest N enemies keep real lights; others stay glow-mesh only.
  // Potato/Low: maxLights=0 — no enemy PointLights in the PBR path.
  const maxLights = enemyPointLightsQualityEnabled ? ENEMY_ACTIVE_LIGHTS : 0
  if (_lightOrder.length > maxLights) {
    _lightOrder.sort((a, b) => a.distSq - b.distSq)
  }
  for (let i = 0; i < _lightOrder.length; i++) {
    const light = _lightOrder[i]!.enemy.innerLight!
    const allow = i < maxLights
    const wasAllowed = light.userData.lightBudgetAllowed !== false
    light.userData.lightBudgetAllowed = allow
    if (allow !== wasAllowed || (allow && !light.visible && lastNightForLights > 0.001)) {
      applyEnemyLightDayNight(light, lastNightForLights)
    } else if (!allow) {
      light.visible = false
      light.intensity = 0
      light.distance = 0
      const glow = light.userData.glowCore
      if (glow instanceof THREE.Mesh) glow.visible = true
    }
  }

  damage = dmgOut.value
  knockbackX = kbX.value
  knockbackZ = kbZ.value

  applyEnemySeparation(enemies, dt, playerPos, collisionWorld)

  for (const enemy of enemies) {
    const pos = enemy.root.position
    const dx = playerPos.x - pos.x
    const dz = playerPos.z - pos.z
    const distSq = dx * dx + dz * dz
    const near =
      distSq <= ENEMY_DETAIL_RANGE_SQ || enemy.attackPhase !== 'idle'
    if (!near && enemy.grounded && Math.abs(enemy.velY) < 0.05) continue

    const doFull =
      !!capsuleCollider &&
      (fullCollide.has(enemy) ||
        (((_groundProbeFrame + (enemy.root.id | 0)) % ENEMY_COLLIDE_STAGGER) === 0 &&
          distSq <= ENEMY_DETAIL_RANGE_SQ))
    enemy.collideTerrainMesh = doFull

    updateEnemyVertical(
      enemy,
      targets,
      walkableYAt,
      dt,
      collisionWorld,
      doFull ? capsuleCollider : undefined,
    )
    // Cheap bury check every frame for anyone we update — full mesh unstick stays staggered.
    recoverEnemyOntoSurface(enemy, targets, collisionWorld)
    if (collisionWorld && doFull) {
      unstickEnemyFromTerrain(enemy, targets, collisionWorld, capsuleCollider)
    }
  }

  return { damage, knockbackX, knockbackZ }
  } finally {
    if (capsuleCollider) capsuleCollider.collideInvisibleChunks = prevInvisibleChunks
  }
}

export function syncEnemyHealthBars(enemies: EnemyInstance[], camera: THREE.Camera) {
  _healthBarCamPos.setFromMatrixPosition(camera.matrixWorld)
  for (const enemy of enemies) {
    syncEnemyHealthBar(enemy, camera)
  }
}

export function enemyFromIntersection(
  hit: THREE.Intersection,
  enemies: EnemyInstance[],
): EnemyInstance | undefined {
  let obj: THREE.Object3D | null = hit.object
  while (obj) {
    if (obj.userData.enemyPick) {
      for (const enemy of enemies) {
        if (enemy.pickMesh === obj) return enemy
      }
    }
    obj = obj.parent
  }
  return undefined
}

const _splitOffsets = [
  { x: 0.85, z: 0 },
  { x: -0.42, z: 0.73 },
  { x: -0.42, z: -0.73 },
]

function spawnEnemySplits(
  originX: number,
  originZ: number,
  originFeetY: number,
  ctx: EnemyDeathContext,
) {
  // Stagger clones across frames — three GLTF clones in one tick still hitch
  // when the visual pool is empty. Resolve ground in the deferred frame so we
  // don't raycast three times on the kill tick (that used to freeze).
  let i = 0
  const spawnNext = () => {
    if (i >= ENEMY_BIG_SPLIT_COUNT) return
    const off = _splitOffsets[i]!
    i++
    const x = originX + off.x
    const z = originZ + off.z
    const gy =
      resolveEnemyGroundY(x, z, ctx.groundTargets, ctx.collisionWorld, originFeetY) ??
      originFeetY
    if (ctx.enemies.length >= ENEMY_MAX_ALIVE) return
    const child = createEnemy(
      ctx.template,
      x,
      gy,
      z,
      ctx.parent,
      ctx.barParent,
      { big: false },
    )
    applyEnemyLightHeight(child.visual, ctx.lightHeightOffset)
    ctx.enemies.push(child)
    if (i < ENEMY_BIG_SPLIT_COUNT) requestAnimationFrame(spawnNext)
  }
  requestAnimationFrame(spawnNext)
}

export function killEnemy(enemy: EnemyInstance, ctx: EnemyDeathContext) {
  const pos = enemy.root.position
  const burstY = pos.y + enemy.colFootOffset + enemy.colHeight * 0.5
  ctx.onOrbBurst(pos.x, burstY, pos.z)

  const wasBig = enemy.isBig
  const originX = pos.x
  const originZ = pos.z
  const originFeetY = getEnemyFeetY(enemy)
  removeEnemy(enemy, ctx.parent, ctx.enemies)

  if (wasBig) {
    spawnEnemySplits(originX, originZ, originFeetY, ctx)
  }
}

export function damageEnemy(
  enemy: EnemyInstance,
  amount: number,
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  hitterX: number,
  hitterZ: number,
  knockSpeed = ENEMY_HIT_KNOCKBACK_SPEED,
  deathCtx?: EnemyDeathContext,
): boolean {
  startEnemyHitSpin(enemy)

  const dx = enemy.root.position.x - hitterX
  const dz = enemy.root.position.z - hitterZ
  const len = Math.hypot(dx, dz)
  if (len > 1e-4) {
    const impulse = knockSpeed / len
    enemy.knockVX += dx * impulse
    enemy.knockVZ += dz * impulse
  } else {
    const angle = Math.random() * Math.PI * 2
    enemy.knockVX += Math.cos(angle) * knockSpeed
    enemy.knockVZ += Math.sin(angle) * knockSpeed
  }

  enemy.health = Math.max(0, enemy.health - amount)
  if (enemy.health <= 0) {
    if (deathCtx) {
      killEnemy(enemy, deathCtx)
    } else {
      removeEnemy(enemy, parent, enemies)
    }
    return true
  }
  return false
}

/** Restore enemy health up to max; returns the amount actually healed. */
export function healEnemy(enemy: EnemyInstance, amount: number): number {
  if (amount <= 0 || enemy.health <= 0) return 0
  const before = enemy.health
  enemy.health = Math.min(enemy.maxHealth, enemy.health + amount)
  return enemy.health - before
}

export function clearEnemies(
  enemies: EnemyInstance[],
  parent: THREE.Object3D,
) {
  while (enemies.length > 0) {
    removeEnemy(enemies[0]!, parent, enemies)
  }
}

export function meleeStatsForItem(item: InventoryItem | null): {
  damage: number
  knockback: number
  reach: number
  sweepDeg: number
} {
  const facingShape = (reach: number, sweepDeg: number) => ({ reach, sweepDeg })

  if (item === 'diamond_sword') {
    return {
      damage: DIAMOND_SWORD_MELEE_DAMAGE,
      knockback: SWORD_HIT_KNOCKBACK_SPEED,
      ...facingShape(SWORD_MELEE_REACH, SWORD_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'gold_sword') {
    return {
      damage: GOLD_SWORD_MELEE_DAMAGE,
      knockback: SWORD_HIT_KNOCKBACK_SPEED,
      ...facingShape(SWORD_MELEE_REACH, SWORD_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'iron_sword') {
    return {
      damage: IRON_SWORD_MELEE_DAMAGE,
      knockback: SWORD_HIT_KNOCKBACK_SPEED,
      ...facingShape(SWORD_MELEE_REACH, SWORD_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'sword') {
    return {
      damage: SWORD_MELEE_DAMAGE,
      knockback: SWORD_HIT_KNOCKBACK_SPEED,
      ...facingShape(SWORD_MELEE_REACH, SWORD_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'diamond_axe') {
    return {
      damage: DIAMOND_AXE_MELEE_DAMAGE,
      knockback: AXE_HIT_KNOCKBACK_SPEED,
      ...facingShape(AXE_MELEE_REACH, AXE_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'gold_axe') {
    return {
      damage: GOLD_AXE_MELEE_DAMAGE,
      knockback: AXE_HIT_KNOCKBACK_SPEED,
      ...facingShape(AXE_MELEE_REACH, AXE_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'iron_axe') {
    return {
      damage: IRON_AXE_MELEE_DAMAGE,
      knockback: AXE_HIT_KNOCKBACK_SPEED,
      ...facingShape(AXE_MELEE_REACH, AXE_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'axe') {
    return {
      damage: AXE_MELEE_DAMAGE,
      knockback: AXE_HIT_KNOCKBACK_SPEED,
      ...facingShape(AXE_MELEE_REACH, AXE_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'diamond_spear') {
    return {
      damage: DIAMOND_SPEAR_MELEE_DAMAGE,
      knockback: SPEAR_HIT_KNOCKBACK_SPEED,
      ...facingShape(SPEAR_MELEE_REACH, SPEAR_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'gold_spear') {
    return {
      damage: GOLD_SPEAR_MELEE_DAMAGE,
      knockback: SPEAR_HIT_KNOCKBACK_SPEED,
      ...facingShape(SPEAR_MELEE_REACH, SPEAR_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'iron_spear') {
    return {
      damage: IRON_SPEAR_MELEE_DAMAGE,
      knockback: SPEAR_HIT_KNOCKBACK_SPEED,
      ...facingShape(SPEAR_MELEE_REACH, SPEAR_MELEE_SWEEP_DEG),
    }
  }
  if (item === 'spear') {
    return {
      damage: SPEAR_MELEE_DAMAGE,
      knockback: ITEM_HIT_KNOCKBACK_SPEED,
      ...facingShape(SPEAR_MELEE_REACH, SPEAR_MELEE_SWEEP_DEG),
    }
  }
  if (item) {
    return {
      damage: ITEM_MELEE_DAMAGE,
      knockback: ITEM_HIT_KNOCKBACK_SPEED,
      ...facingShape(ITEM_MELEE_REACH, ITEM_MELEE_SWEEP_DEG),
    }
  }
  return {
    damage: ENEMY_MELEE_DAMAGE,
    knockback: ENEMY_HIT_KNOCKBACK_SPEED,
    ...facingShape(ENEMY_MELEE_REACH, ENEMY_MELEE_SWEEP_DEG),
  }
}

/** Cosine of half-sweep — facing dot must be ≥ this to count as a hit. */
export function meleeFacingMinForSweepDeg(sweepDeg: number): number {
  return Math.cos((sweepDeg * Math.PI) / 180)
}

export function meleeKnockbackForEnemy(
  item: InventoryItem | null,
  enemy: EnemyInstance,
): number {
  const { knockback } = meleeStatsForItem(item)
  if (
    enemy.isBig &&
    (item === 'sword' ||
      item === 'iron_sword' ||
      item === 'gold_sword' ||
      item === 'diamond_sword')
  ) {
    return knockback * ENEMY_BIG_SWORD_KNOCKBACK_MULT
  }
  return knockback
}
