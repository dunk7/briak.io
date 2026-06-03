import * as THREE from 'three'
import { depenetrateAabbInBoxes } from './collision'
import type { CollisionWorld } from './collisionWorld'
import type { InventoryItem } from './inventory'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildTerrainBVH } from './meshCollider'
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
export const ENEMY_MELEE_DAMAGE = 1
export const ITEM_MELEE_DAMAGE = 2
export const SWORD_MELEE_DAMAGE = 3
export const AXE_MELEE_DAMAGE = 3
export const SPEAR_MELEE_DAMAGE = 2
export const SPEAR_THROW_DAMAGE = 4
export const ENEMY_ATTACK_COOLDOWN = 1.05
/** XZ distance at which an enemy can hurt the player (body radii + small gap). */
export const ENEMY_ATTACK_RANGE = PLAYER_RADIUS + 0.32
/** Legacy reach constant; lunge hits use capsule-vs-mesh distance + separationRadius. */
export const ENEMY_LUNGE_HIT_RANGE = PLAYER_RADIUS + 0.58
/** Extra padding beyond combined body radii for lunge bite contact. */
const ENEMY_LUNGE_REACH_PAD = 0.34
/** Enemies only chase and bite when the player is within this XZ distance. */
export const ENEMY_AGGRO_RANGE = 50
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
const ENEMY_KNOCKBACK_DRAG = 10
export const ENEMY_MAX_COUNT = 24
export const ENEMY_TARGET_HEIGHT = 0.42
export const ENEMY_BAR_HEAD_GAP = 0.06
/** World-space width / height of the bar above an enemy (perspective-scales with distance). */
export const ENEMY_BAR_WORLD_WIDTH = 0.36
export const ENEMY_BAR_WORLD_HEIGHT = 0.042
export const ENEMY_BAR_BIG_WORLD_WIDTH = 0.48
export const ENEMY_BAR_BIG_WORLD_HEIGHT = 0.052
export const DEFAULT_ENEMY_SPAWN_RATE = 58
export const DEFAULT_ENEMY_SPEED = 58
export const DEFAULT_ENEMY_LIGHT_HEIGHT = 50

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
  return THREE.MathUtils.lerp(0.4, 2.8, t)
}

const RAY_ORIGIN_Y = 500
const RAYCAST_FAR = 1200
const INNER_LIGHT_COLOR = 0xff3300
const INNER_LIGHT_INTENSITY = 5.5
const INNER_LIGHT_DISTANCE = 4.2
const GLOW_CORE_RADIUS = 0.055
/** Soft push strength when enemies overlap in XZ. */
const ENEMY_SEPARATION_STRENGTH = 3.2
export const ENEMY_STEP_HEIGHT = 0.38
const ENEMY_STICK_DOWN = 0.5
const ENEMY_GROUND_PROBE = 0.06
const ENEMY_GRAVITY = 18
const ENEMY_MAX_FALL = 42
/** Max rise per unit of horizontal travel (walkable; steeper triggers a jump). */
const ENEMY_MAX_SLOPE = 0.62
/** Small hop when stepping onto a low ledge. */
const ENEMY_LEDGE_HOP = 1.15
/** Max vertical rise enemies will try to jump over a steep slope. */
const ENEMY_SLOPE_JUMP_MAX_RISE = 0.52
const ENEMY_SLOPE_JUMP_MIN = ENEMY_LEDGE_HOP
const ENEMY_SLOPE_JUMP_MAX = 4.8
/** Feet-aware mesh ray length (matches player ground queries). */
const ENEMY_MESH_PROBE_ABOVE = 1.5
const ENEMY_MESH_PROBE_FAR = ENEMY_STEP_HEIGHT + 3.5
/** Skip vertical snap when already this close to the floor (reduces Y jitter). */
const ENEMY_GROUND_SNAP_EPS = 0.012

const _box = new THREE.Box3()
const _enemyMin = new THREE.Vector3()
const _enemyMax = new THREE.Vector3()
const _center = new THREE.Vector3()
const _size = new THREE.Vector3()
const _rayHits: THREE.Intersection[] = []
const _worldPos = new THREE.Vector3()
const _proj = new THREE.Vector3()

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
}

export type EnemyInstance = {
  root: THREE.Group
  /** Skinned mesh group (excludes pick collider). */
  visual: THREE.Group
  pickMesh: THREE.Mesh
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
  velY: number
  grounded: boolean
  healthBarGroup: THREE.Group
  healthFill: THREE.Mesh
  healthBarWidth: number
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
    child.castShadow = true
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

function createPickCollider(model: THREE.Object3D): THREE.Mesh {
  _box.setFromObject(model)
  _box.getSize(_size)
  _box.getCenter(_center)
  const radius = Math.max(_size.x, _size.z) * 0.38
  const cylLen = Math.max(0.04, _size.y * 0.5)
  const geo = new THREE.CapsuleGeometry(radius, cylLen, 4, 8)
  buildTerrainBVH(geo)
  const mesh = new THREE.Mesh(geo, pickMaterial)
  mesh.position.copy(_center)
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
  visual.traverse((child) => {
    if (child instanceof THREE.PointLight) innerLight = child
    else if (!meshRoot && child !== visual && child.parent === visual) meshRoot = child
  })
  if (!meshRoot || !innerLight) return null
  return { meshRoot, innerLight }
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

function configureInnerLight(innerLight: THREE.PointLight) {
  innerLight.color.setHex(INNER_LIGHT_COLOR)
  innerLight.intensity = INNER_LIGHT_INTENSITY
  innerLight.distance = INNER_LIGHT_DISTANCE
  innerLight.decay = 1
  if (!innerLight.userData.glowCore) {
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(GLOW_CORE_RADIUS, 10, 10),
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
  }
}

function separationRadiusFromVisual(visual: THREE.Object3D): number {
  _box.setFromObject(visual)
  _box.getSize(_size)
  return Math.max(0.26, Math.max(_size.x, _size.z) * 0.42)
}

/** World feet Y for movement / ground (ignores bite lunge pose on the visual). */
function getEnemyFeetY(enemy: EnemyInstance): number {
  const visual = enemy.visual
  const animY = visual.position.y
  const animZ = visual.rotation.z
  if (animY !== 0 || animZ !== 0) {
    visual.position.y = 0
    visual.rotation.z = 0
  }
  enemy.root.updateMatrixWorld(true)
  _box.setFromObject(visual)
  const feet = _box.min.y
  if (animY !== 0 || animZ !== 0) {
    visual.position.y = animY
    visual.rotation.z = animZ
  }
  return feet
}

function sampleEnemyMeshGroundY(
  x: number,
  z: number,
  feetY: number,
  targets: MeshGroundTargets,
): number | null {
  return sampleMeshGroundY(
    x,
    z,
    feetY + ENEMY_MESH_PROBE_ABOVE,
    targets,
    _rayHits,
    ENEMY_MESH_PROBE_FAR,
    { intersectInvisibleChunks: true },
  )
}

function probeEnemyGround(
  x: number,
  z: number,
  feetY: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  recoverBelow = 2.5,
): number | null {
  const maxAbove = ENEMY_STEP_HEIGHT + 0.05
  const minBelow = feetY - ENEMY_STEP_HEIGHT - recoverBelow

  let best: number | null = null
  if (walkableYAt) {
    const walkY = walkableYAt(x, z, feetY)
    if (walkY !== null && walkY <= feetY + maxAbove && walkY >= minBelow) {
      best = walkY
    }
  }

  const meshY = sampleEnemyMeshGroundY(x, z, feetY, targets)
  if (meshY !== null && meshY <= feetY + maxAbove && meshY >= minBelow) {
    if (best === null) {
      best = meshY
    } else if (meshY > best && feetY - best < 0.28) {
      best = meshY
    }
  }
  return best
}

function fillEnemyCollisionAabb(enemy: EnemyInstance) {
  const visual = enemy.visual
  const animY = visual.position.y
  const animZ = visual.rotation.z
  if (animY !== 0 || animZ !== 0) {
    visual.position.y = 0
    visual.rotation.z = 0
  }
  enemy.root.updateMatrixWorld(true)
  _box.setFromObject(visual)
  if (animY !== 0 || animZ !== 0) {
    visual.position.y = animY
    visual.rotation.z = animZ
  }

  _enemyMin.copy(_box.min)
  _enemyMax.copy(_box.max)
  const pad = 0.04
  _enemyMin.x += pad
  _enemyMin.z += pad
  _enemyMax.x -= pad
  _enemyMax.z -= pad
}

function enemyPenetratesWalls(enemy: EnemyInstance, world: CollisionWorld): boolean {
  fillEnemyCollisionAabb(enemy)
  const pos = enemy.root.position
  const indices = world.queryNear(
    pos.x,
    pos.z,
    enemy.separationRadius + 0.85,
    _enemyMin.y,
    _enemyMax.y,
    true,
  )
  for (let i = 0; i < indices.length; i++) {
    const box = world.boxes[indices[i]!]
    if (
      _enemyMax.x > box.min.x &&
      _enemyMin.x < box.max.x &&
      _enemyMax.y > box.min.y &&
      _enemyMin.y < box.max.y &&
      _enemyMax.z > box.min.z &&
      _enemyMin.z < box.max.z
    ) {
      return true
    }
  }
  return false
}

/** Push the enemy out of voxel walls on XZ; returns false if still overlapping. */
function resolveEnemyWalls(enemy: EnemyInstance, world: CollisionWorld): boolean {
  fillEnemyCollisionAabb(enemy)

  const pos = enemy.root.position
  const indices = world.queryNear(
    pos.x,
    pos.z,
    enemy.separationRadius + 0.85,
    _enemyMin.y,
    _enemyMax.y,
    true,
  )
  if (indices.length === 0) return true

  const beforeMinX = _enemyMin.x
  const beforeMinZ = _enemyMin.z
  depenetrateAabbInBoxes(_enemyMin, _enemyMax, world.boxes, indices, 12, 'walls')
  pos.x += _enemyMin.x - beforeMinX
  pos.z += _enemyMin.z - beforeMinZ
  return !enemyPenetratesWalls(enemy, world)
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
): { ok: boolean; hop: boolean; jumpVel?: number } {
  const feetY = getEnemyFeetY(enemy)
  const floor = probeEnemyGround(nextX, nextZ, feetY, targets, walkableYAt)
  if (floor === null) return { ok: true, hop: false }

  const rise = floor - feetY
  if (rise > ENEMY_SLOPE_JUMP_MAX_RISE) return { ok: false, hop: false }

  if (isEnemySteepSlope(rise, stepLen)) {
    return { ok: true, hop: true, jumpVel: enemySlopeJumpVelocity(rise) }
  }

  if (rise > ENEMY_STEP_HEIGHT + 0.02) return { ok: false, hop: false }
  return { ok: true, hop: rise > 0.08 }
}

function applyEnemyStepHop(enemy: EnemyInstance, hop: boolean, jumpVel?: number) {
  if (!hop) return
  if (jumpVel !== undefined && !enemy.grounded) return
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
): boolean {
  const pos = enemy.root.position
  const prevX = pos.x
  const prevZ = pos.z
  const stepLen = Math.hypot(dx, dz)
  pos.x += dx
  pos.z += dz
  const check = canEnemyStepTo(enemy, pos.x, pos.z, stepLen, targets, walkableYAt)
  if (!check.ok) {
    pos.x = prevX
    pos.z = prevZ
    return false
  }
  applyEnemyStepHop(enemy, check.hop, check.jumpVel)
  if (collisionWorld) {
    resolveEnemyWalls(enemy, collisionWorld)
    if (enemyPenetratesWalls(enemy, collisionWorld)) {
      pos.x = prevX
      pos.z = prevZ
      resolveEnemyWalls(enemy, collisionWorld)
      return false
    }
  }
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
  )
  if (floor === null || floor <= feetY + 0.03) return false
  const rise = floor - feetY
  if (rise > ENEMY_STEP_HEIGHT + 0.04) return false

  const prevY = pos.y
  snapEnemyRootToGround(enemy.root, enemy.visual, floor)
  if (!tryEnemyMoveXZStep(enemy, dx, dz, targets, walkableYAt, collisionWorld)) {
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
) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return
  if (tryEnemyMoveXZStep(enemy, dx, dz, targets, walkableYAt, collisionWorld)) return

  const len = Math.hypot(dx, dz)
  if (len > 1e-9) {
    const nx = dx / len
    const nz = dz / len
    const slide = len * 0.72
    if (tryEnemyMoveXZStep(enemy, -nz * slide, nx * slide, targets, walkableYAt, collisionWorld)) {
      return
    }
    if (tryEnemyMoveXZStep(enemy, nz * slide, -nx * slide, targets, walkableYAt, collisionWorld)) {
      return
    }
  }

  if (tryEnemyMoveXZStep(enemy, dx, 0, targets, walkableYAt, collisionWorld)) return
  if (tryEnemyMoveXZStep(enemy, 0, dz, targets, walkableYAt, collisionWorld)) return

  if (tryEnemyStepOntoLedge(enemy, dx, dz, targets, walkableYAt, collisionWorld)) return
  tryEnemySlopeJump(enemy, dx, dz, targets, walkableYAt, collisionWorld)
}

/** Jump toward a steep climb when sliding / wall hits blocked a normal step. */
function tryEnemySlopeJump(
  enemy: EnemyInstance,
  dx: number,
  dz: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld: CollisionWorld | undefined,
): boolean {
  if (!enemy.grounded) return false
  const stepLen = Math.hypot(dx, dz)
  if (stepLen < 1e-9) return false

  const pos = enemy.root.position
  const feetY = getEnemyFeetY(enemy)
  const floor = probeEnemyGround(pos.x + dx, pos.z + dz, feetY, targets, walkableYAt)
  if (floor === null) return false

  const rise = floor - feetY
  if (rise < 0.04 || rise > ENEMY_SLOPE_JUMP_MAX_RISE) return false
  if (!isEnemySteepSlope(rise, stepLen)) return false

  applyEnemyStepHop(enemy, true, enemySlopeJumpVelocity(rise))
  tryEnemyMoveXZStep(enemy, dx, dz, targets, walkableYAt, collisionWorld)
  return true
}

function updateEnemyVertical(
  enemy: EnemyInstance,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  dt: number,
) {
  enemy.velY -= ENEMY_GRAVITY * dt
  if (enemy.grounded && enemy.velY < 0) enemy.velY = 0
  enemy.velY = Math.max(enemy.velY, -ENEMY_MAX_FALL)

  const pos = enemy.root.position
  if (enemy.velY !== 0) pos.y += enemy.velY * dt

  const wasGrounded = enemy.grounded
  const maxDrop = wasGrounded
    ? ENEMY_STEP_HEIGHT + ENEMY_STICK_DOWN
    : ENEMY_GROUND_PROBE

  const feetY = getEnemyFeetY(enemy)
  const floor = probeEnemyGround(
    pos.x,
    pos.z,
    feetY,
    targets,
    walkableYAt,
    maxDrop + 2.5,
  )
  if (floor === null) {
    enemy.grounded = false
    return
  }

  const gap = getEnemyFeetY(enemy) - floor
  if (gap > maxDrop) {
    enemy.grounded = false
    return
  }

  if (enemy.velY > 0.15 && gap > ENEMY_GROUND_PROBE) {
    enemy.grounded = false
    return
  }

  if (gap <= ENEMY_STEP_HEIGHT + 0.05) {
    if (gap > ENEMY_GROUND_SNAP_EPS) {
      snapEnemyRootToGround(enemy.root, enemy.visual, floor)
    } else if (gap > ENEMY_GROUND_PROBE) {
      enemy.root.position.y -= gap * 0.5
    }
    enemy.velY = 0
    enemy.grounded = true
  }
}

/** Soft XZ push so enemies do not stack (O(n²), fine for small n). */
function applyEnemySeparation(
  enemies: EnemyInstance[],
  dt: number,
  targets: MeshGroundTargets,
  walkableYAt: ((x: number, z: number, feetY: number) => number | null) | undefined,
  collisionWorld: CollisionWorld | undefined,
) {
  const n = enemies.length
  if (n < 2) return

  for (let i = 0; i < n; i++) {
    const a = enemies[i]!
    if (a.attackPhase === 'lunge') continue
    const pos = a.root.position
    let pushX = 0
    let pushZ = 0

    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const b = enemies[j]!
      const ox = pos.x - b.root.position.x
      const oz = pos.z - b.root.position.z
      const distSq = ox * ox + oz * oz
      const minDist = a.separationRadius + b.separationRadius
      const minDistSq = minDist * minDist
      if (distSq >= minDistSq) continue

      if (distSq < 1e-8) {
        const angle = (i * 7 + j * 13) * 0.91
        pushX += Math.cos(angle)
        pushZ += Math.sin(angle)
        continue
      }

      const dist = Math.sqrt(distSq)
      const overlap = (minDist - dist) / minDist
      pushX += (ox / dist) * overlap
      pushZ += (oz / dist) * overlap
    }

    if (pushX !== 0 || pushZ !== 0) {
      const scale = ENEMY_SEPARATION_STRENGTH * dt
      tryEnemyMoveXZ(a, pushX * scale, pushZ * scale, targets, walkableYAt, collisionWorld)
    }
  }
}

function resetEnemyVisualPose(visual: THREE.Group) {
  visual.position.set(0, 0, 0)
  visual.rotation.x = 0
  visual.rotation.z = 0
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

function enemyVerticalExtents(
  enemy: EnemyInstance,
  includeLungeJump: boolean,
): { lo: number; hi: number } {
  enemy.root.updateMatrixWorld(true)
  _box.setFromObject(enemy.visual)
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

  enemy.root.updateMatrixWorld(true)
  _box.setFromObject(enemy.visual)
  const pad = endSnap ? 0.2 : 0.05 + arch * 0.16
  _box.expandByScalar(pad)

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
  damage.value += ENEMY_DAMAGE
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

    tryApplyLungeBite(enemy, playerPos, damage, knockbackX, knockbackZ, knockbackDist)

    const moveScale = enemy.isBig ? ENEMY_BIG_CRAWL_SPEED_SCALE : 1
    const forwardStep = (ENEMY_LUNGE_FORWARD / ENEMY_LUNGE_DURATION) * moveScale * dt
    const biteBeforeMove = measureLungeBite(playerPos, enemy)
    const stopDist = PLAYER_RADIUS + enemy.separationRadius * 0.75 + 0.06
    const closeGap = Math.max(0, biteBeforeMove.distXZ - stopDist)
    const move = Math.min(forwardStep, closeGap)
    tryEnemyMoveXZ(
      enemy,
      enemy.lungeDirX * move,
      enemy.lungeDirZ * move,
      targets,
      walkableYAt,
      collisionWorld,
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

function snapEnemyRootToGround(
  root: THREE.Object3D,
  visual: THREE.Object3D,
  groundY: number,
) {
  const animY = visual.position.y
  const animZ = visual.rotation.z
  if (animY !== 0 || animZ !== 0) {
    visual.position.y = 0
    visual.rotation.z = 0
  }
  root.updateMatrixWorld(true)
  _box.setFromObject(visual)
  root.position.y += groundY - _box.min.y
  if (animY !== 0 || animZ !== 0) {
    visual.position.y = animY
    visual.rotation.z = animZ
  }
}

function syncEnemyHealthBar(enemy: EnemyInstance, camera: THREE.Camera) {
  enemy.root.updateMatrixWorld(true)
  _box.setFromObject(enemy.visual)
  _worldPos.set(
    (_box.min.x + _box.max.x) * 0.5,
    _box.max.y + ENEMY_BAR_HEAD_GAP,
    (_box.min.z + _box.max.z) * 0.5,
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
  applyEnemyMaterials(mesh)
  alignModelToGround(mesh)
  scaleToTargetHeight(mesh, ENEMY_TARGET_HEIGHT)

  const model = new THREE.Group()
  model.add(mesh)

  const innerLight = new THREE.PointLight(INNER_LIGHT_COLOR, 1, 1, 1)
  configureInnerLight(innerLight)
  model.add(innerLight)
  centerInnerLightInVisual(model)

  enableAutoMatrices(model)
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

  const model = template.clone(true)
  if (scaleMul !== 1) model.scale.multiplyScalar(scaleMul)
  enableAutoMatrices(model)
  const lightParts = findVisualParts(model)
  if (lightParts) {
    configureInnerLight(lightParts.innerLight)
    if (isBig) {
      lightParts.innerLight.intensity = INNER_LIGHT_INTENSITY * 1.35
      lightParts.innerLight.distance = INNER_LIGHT_DISTANCE * scaleMul
    }
  }
  root.add(model)

  const pickMesh = createPickCollider(model)
  root.add(pickMesh)

  parent.add(root)
  snapEnemyRootToGround(root, model, y)

  const { group: healthBarGroup, fill: healthFill, width: healthBarWidth } =
    createEnemyHealthBar(isBig)
  barParent.add(healthBarGroup)
  const separationRadius = separationRadiusFromVisual(model)
  return {
    root,
    visual: model,
    pickMesh,
    separationRadius,
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
    velY: 0,
    grounded: true,
    healthBarGroup,
    healthFill,
    healthBarWidth,
  }
}

export function removeEnemy(
  enemy: EnemyInstance,
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
) {
  parent.remove(enemy.root)
  parent.remove(enemy.healthBarGroup)
  const geo = enemy.pickMesh.geometry as THREE.BufferGeometry & {
    disposeBoundsTree?: () => void
  }
  geo.disposeBoundsTree?.()
  geo.dispose()
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
): { x: number; z: number } | null {
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

  const collectInRing = (minD: number, maxD: number): EnemyCellMeta[] => {
    const out: EnemyCellMeta[] = []
    for (const cell of entries) {
      const d = Math.max(Math.abs(cell.ix - playerIx), Math.abs(cell.iy - playerIy))
      if (d >= minD && d <= maxD) out.push(cell)
    }
    return out
  }

  let candidates = collectInRing(minCellDist, maxCellDist)
  if (candidates.length === 0) candidates = collectInRing(0, maxCellDist + 3)
  if (candidates.length === 0) candidates = entries

  const cell = candidates[Math.floor(Math.random() * candidates.length)]!
  const spread = cellSize * 0.42
  const ox = (hashUnit(cell.ix * 4133 + cell.iy * 7919) * 2 - 1) * spread
  const oz = (hashUnit(cell.ix * 97 + cell.iy * 1009) * 2 - 1) * spread
  return { x: cell.center_x + ox, z: cell.center_y + oz }
}

export function resolveEnemyGroundY(
  x: number,
  z: number,
  targets: MeshGroundTargets,
): number | null {
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
  walkableYAt?: (x: number, z: number, feetY: number) => number | null,
  collisionWorld?: CollisionWorld,
): EnemyUpdateResult {
  let damage = 0
  let knockbackX = 0
  let knockbackZ = 0
  const dmgOut = { value: 0 }
  const kbX = { value: 0 }
  const kbZ = { value: 0 }
  const kbDist = { value: Infinity }

  const knockDrag = Math.exp(-ENEMY_KNOCKBACK_DRAG * dt)

  for (const enemy of enemies) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)

    const pos = enemy.root.position
    enemy.knockVX *= knockDrag
    enemy.knockVZ *= knockDrag
    tryEnemyMoveXZ(
      enemy,
      enemy.knockVX * dt,
      enemy.knockVZ * dt,
      targets,
      walkableYAt,
      collisionWorld,
    )

    const dx = playerPos.x - pos.x
    const dz = playerPos.z - pos.z
    const distXZ = Math.hypot(dx, dz)
    const canSeePlayer = distXZ <= ENEMY_AGGRO_RANGE

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
        collisionWorld,
      )
    } else if (canSeePlayer) {
      if (distXZ > 1e-4) {
        enemy.root.rotation.y = facingYawForPlusX(dx, dz)
      }

      if (distXZ > 0.02) {
        const moveScale = enemy.isBig ? ENEMY_BIG_CRAWL_SPEED_SCALE : 1
        const step = Math.min(crawlSpeed * moveScale * dt, distXZ)
        tryEnemyMoveXZ(
          enemy,
          (dx / distXZ) * step,
          (dz / distXZ) * step,
          targets,
          walkableYAt,
          collisionWorld,
        )
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

  damage = dmgOut.value
  knockbackX = kbX.value
  knockbackZ = kbZ.value

  applyEnemySeparation(enemies, dt, targets, walkableYAt, collisionWorld)

  for (const enemy of enemies) {
    updateEnemyVertical(enemy, targets, walkableYAt, dt)
    if (collisionWorld) {
      for (let pass = 0; pass < 3; pass++) {
        resolveEnemyWalls(enemy, collisionWorld)
        if (!enemyPenetratesWalls(enemy, collisionWorld)) break
      }
    }
    enemy.root.updateMatrixWorld(true)
  }

  return { damage, knockbackX, knockbackZ }
}

export function syncEnemyHealthBars(enemies: EnemyInstance[], camera: THREE.Camera) {
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
  const fallbackGy =
    resolveEnemyGroundY(originX, originZ, ctx.groundTargets) ?? originFeetY

  for (let i = 0; i < ENEMY_BIG_SPLIT_COUNT; i++) {
    const off = _splitOffsets[i]!
    const sx = originX + off.x
    const sz = originZ + off.z
    const gy = resolveEnemyGroundY(sx, sz, ctx.groundTargets) ?? fallbackGy
    const child = createEnemy(
      ctx.template,
      sx,
      gy,
      sz,
      ctx.parent,
      ctx.barParent,
      { big: false },
    )
    applyEnemyLightHeight(child.visual, ctx.lightHeightOffset)
    ctx.enemies.push(child)
  }
}

export function killEnemy(enemy: EnemyInstance, ctx: EnemyDeathContext) {
  const pos = enemy.root.position
  enemy.root.updateMatrixWorld(true)
  _box.setFromObject(enemy.visual)
  const burstY = (_box.min.y + _box.max.y) * 0.5
  ctx.onOrbBurst(pos.x, burstY, pos.z)

  const wasBig = enemy.isBig
  const originX = pos.x
  const originZ = pos.z
  const originFeetY = pos.y
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
} {
  if (item === 'sword') {
    return { damage: SWORD_MELEE_DAMAGE, knockback: SWORD_HIT_KNOCKBACK_SPEED }
  }
  if (item === 'axe') {
    return { damage: AXE_MELEE_DAMAGE, knockback: AXE_HIT_KNOCKBACK_SPEED }
  }
  if (item === 'spear') {
    return { damage: SPEAR_MELEE_DAMAGE, knockback: ITEM_HIT_KNOCKBACK_SPEED }
  }
  if (item) {
    return { damage: ITEM_MELEE_DAMAGE, knockback: ITEM_HIT_KNOCKBACK_SPEED }
  }
  return { damage: ENEMY_MELEE_DAMAGE, knockback: ENEMY_HIT_KNOCKBACK_SPEED }
}

export function meleeKnockbackForEnemy(
  item: InventoryItem | null,
  enemy: EnemyInstance,
): number {
  const { knockback } = meleeStatsForItem(item)
  if (enemy.isBig && item === 'sword') {
    return knockback * ENEMY_BIG_SWORD_KNOCKBACK_MULT
  }
  return knockback
}
