import * as THREE from 'three'
import { buildPlacementNormalFromFace } from './buildBlocks'
import { PLAYER_MAX_HEALTH, type EnemyInstance } from './enemy'
import type {
  BallistaFireRate,
  BallistaTargetPriority,
  InventoryItem,
} from './inventory'
import { SPIDER_MAX_HEALTH, type SpiderInstance } from './roboticSpider'
import { createWoodPlankAlbedoMap } from './woodTexture'
import {
  CATAPULT_ROCK_GRAVITY,
  CATAPULT_ROCK_SPEED,
  type CatapultAmmoItem,
  isCatapultAmmoItem,
} from './thrownCatapultRock'

/** Siege-engine footprint — larger than a ballista. */
export const CATAPULT_WIDTH = 2.4
export const CATAPULT_DEPTH = 3.2
export const CATAPULT_HEIGHT = 2.4
/** Short base collision so the swinging arm stays clear. */
export const CATAPULT_COLLISION_HEIGHT = 0.55
export const CATAPULT_SLOT_COUNT = 4

/** Auto-target range (meters) — matches ballista. */
export const CATAPULT_RANGE = 48
const CATAPULT_RANGE_SQ = CATAPULT_RANGE * CATAPULT_RANGE

const MIN_UP_DOT = 0.55
const SURFACE_NUDGE = 0.02
const MIN_SPACING = 2.6
const MIN_SPACING_SQ = MIN_SPACING * MIN_SPACING

/** Siege cadence — much slower than a ballista. */
const FIRE_INTERVAL: Record<BallistaFireRate, number> = {
  slow: 7.0,
  normal: 4.5,
  fast: 2.8,
}
/** Arm wind-up window as a fraction of the fire interval. */
const WIND_FRACTION: Record<BallistaFireRate, number> = {
  slow: 0.28,
  normal: 0.3,
  fast: 0.34,
}
/**
 * Throw progress per second (0→1). Full whip ≈ 0.85s so the arm reads as heavy timber.
 */
const SWING_SPEED = 1.2
/** Slow reset back to the cocked pose after follow-through. */
const RECOVER_SPEED = 0.48

/**
 * Trebuchet arm angles (rotation.x). Scoop sits on the long +Z end of the beam.
 * Shot direction is group +Z (toward the enemy).
 *
 * IMPORTANT: the arm swings OVER the top (increasing angle), never under the
 * pivot through the ground. Path: rear/low → up over the axle → forward release.
 *   cocked  ≈ 2.5  (scoop at the rear, above the ground)
 *   release ≈ 5.05 (scoop high, moving forward — ~45° lob)
 *   flung   ≈ 5.85 (follow-through past the release)
 */
const ARM_COCKED = 2.5
/** Extra haul-back during wind-up (more positive = scoop lower at the rear). */
const WIND_PULL = 0.08
/** Arm angle when the rock leaves (high forward lob). */
const ARM_RELEASE = 5.05
/** Follow-through past release (still above ground, over the top). */
const ARM_FLUNG = 5.85

/** Classic trebuchet lob — always leave at ~45°. */
const LAUNCH_PITCH = Math.PI / 4
/** Speed clamps for the 45° range solution (m/s). */
const LAUNCH_SPEED_MIN = 12
const LAUNCH_SPEED_MAX = 32
/** How fast the base yaws toward a target (rad/s). */
const AIM_YAW_SPEED = 5.5
/** Start the throw once facing is this close to the aim yaw (radians). */
const AIM_READY_YAW = 0.12
/** Aim point height on a target (fraction of capsule). */
const TARGET_AIM_FRAC = 0.4
/** Aim point on the player (meters above feet). */
const PLAYER_AIM_HEIGHT = 0.55
/** How close the player must be to the scoop to ride the shot. */
const RIDE_RADIUS = 1.15
const RIDE_RADIUS_SQ = RIDE_RADIUS * RIDE_RADIUS

/** Arm pivot in group-local space (must match createCatapultVisual). */
const PIVOT_LOCAL_Y = 1.72
const PIVOT_LOCAL_Z = -0.15
/** Scoop offset from arm pivot in arm-local space. */
const SCOOP_ARM_Y = -0.05
const SCOOP_ARM_Z = 1.75
/** Loaded ammo nestles in the bucket. */
const LOADED_ROCK_RADIUS = 0.26

/** Ease-in whip: slow haul, then accelerates into the release. */
function swingEase(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return x * x * (1 + 0.25 * x)
}

/**
 * Map swing 0..1 → arm pitch along the over-the-top arc.
 * `throw` accelerates into the whip; `linear` is for the slow reset (no snap).
 */
function armAngleForSwing(swing: number, mode: 'throw' | 'linear' = 'throw'): number {
  const t = THREE.MathUtils.clamp(swing, 0, 1)
  const u = mode === 'throw' ? swingEase(t) : t
  return THREE.MathUtils.lerp(ARM_COCKED, ARM_FLUNG, u)
}

/** Normalized progress (0..1) along the arm arc for a given arm angle. */
function armProgressForAngle(angle: number): number {
  return (angle - ARM_COCKED) / (ARM_FLUNG - ARM_COCKED)
}

/**
 * Swing progress where the arm hits ARM_RELEASE (rock leaves the scoop).
 * Solved once from the ease curve so the visual matches the 45° launch.
 */
const RELEASE_SWING = (() => {
  const want = armProgressForAngle(ARM_RELEASE)
  let t = Math.sqrt(want)
  for (let i = 0; i < 5; i++) {
    const e = swingEase(t)
    const de = 2 * t + 0.75 * t * t
    t -= (e - want) / Math.max(de, 1e-4)
    t = THREE.MathUtils.clamp(t, 0.2, 0.95)
  }
  return t
})()

const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _scoopRim = new THREE.Vector3()
const _look = new THREE.Vector3()
const _scoopWorld = new THREE.Vector3()
const _muzzleWorld = new THREE.Vector3()
const _launchDir = new THREE.Vector3()
const _targetPos = new THREE.Vector3()
const _aimPoint = new THREE.Vector3()
const _ejectPos = new THREE.Vector3()
const _ejectVel = new THREE.Vector3()
const _ropeDir = new THREE.Vector3()
const _ropeMid = new THREE.Vector3()
const _ropeUp = new THREE.Vector3(0, 1, 0)

export type CatapultStack = { item: InventoryItem; count: number; durability?: number }

export type CatapultAnimParts = {
  armPivot: THREE.Group
  counterweight: THREE.Group
  scoop: THREE.Group
  loadedRock: THREE.Group
  loadedRockMats: THREE.MeshStandardMaterial[]
  slingLeft: THREE.Mesh
  slingRight: THREE.Mesh
}

export type PlacedCatapult = {
  id: string
  group: THREE.Group
  anim: CatapultAnimParts
  scoop: THREE.Object3D
  collisionKey: string
  slots: (CatapultStack | null)[]
  fireRate: BallistaFireRate
  targetPriority: BallistaTargetPriority
  /** When true, the player is a valid auto-aim target. */
  targetPlayer: boolean
  facingYaw: number
  cooldown: number
  /** 0 = cocked, 1 = fully flung (includes follow-through). */
  swing: number
  /**
   * True while idle / recovering. False while the arm is mid-throw
   * (keeps swinging through follow-through after the rock leaves).
   */
  released: boolean
  /** True once this throw has already spawned its rock. */
  didFire: boolean
  wind: number
  /** Locked aim point for the current throw (world). */
  trackTarget: THREE.Vector3 | null
}

export type CatapultFireRequest = {
  catapult: PlacedCatapult
  ammo: CatapultAmmoItem
  origin: THREE.Vector3
  direction: THREE.Vector3
  speed: number
  /** True when the player was standing in the scoop at release. */
  flingPlayer: boolean
}

export type CatapultEjectRequest = {
  item: InventoryItem
  count: number
  durability?: number
  position: THREE.Vector3
  velocity: THREE.Vector3
}

export type CatapultUpdateOpts = {
  playerPos: THREE.Vector3
  playerHeight: number
}

let sharedWoodMat: THREE.MeshStandardMaterial | null = null
let sharedDarkWoodMat: THREE.MeshStandardMaterial | null = null
let sharedIronMat: THREE.MeshStandardMaterial | null = null
let sharedRopeMat: THREE.MeshStandardMaterial | null = null
let sharedStoneMat: THREE.MeshStandardMaterial | null = null

function getWoodMat() {
  if (sharedWoodMat) return sharedWoodMat
  const map = createWoodPlankAlbedoMap(128)
  map.colorSpace = THREE.SRGBColorSpace
  sharedWoodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    roughness: 0.78,
    metalness: 0,
    emissive: new THREE.Color(0x2a180c),
    emissiveIntensity: 0.28,
  })
  return sharedWoodMat
}

function getDarkWoodMat() {
  return (sharedDarkWoodMat ??= new THREE.MeshStandardMaterial({
    color: 0x4a2e18,
    roughness: 0.88,
    metalness: 0,
    emissive: new THREE.Color(0x1a1008),
    emissiveIntensity: 0.2,
  }))
}

function getIronMat() {
  return (sharedIronMat ??= new THREE.MeshStandardMaterial({
    color: 0xb8b4ac,
    roughness: 0.35,
    metalness: 0.72,
    emissive: new THREE.Color(0x2a2824),
    emissiveIntensity: 0.12,
  }))
}

function getRopeMat() {
  return (sharedRopeMat ??= new THREE.MeshStandardMaterial({
    color: 0xc4a46a,
    roughness: 0.95,
    metalness: 0,
  }))
}

function getStoneMat() {
  return (sharedStoneMat ??= new THREE.MeshStandardMaterial({
    color: 0x8a8680,
    roughness: 0.92,
    metalness: 0.05,
    emissive: new THREE.Color(0x1a1814),
    emissiveIntensity: 0.15,
  }))
}

const ammoMats = new Map<CatapultAmmoItem, THREE.MeshStandardMaterial>()

function getAmmoMat(ammo: CatapultAmmoItem): THREE.MeshStandardMaterial {
  let mat = ammoMats.get(ammo)
  if (mat) return mat
  const specs: Record<
    CatapultAmmoItem,
    { color: number; roughness: number; metalness: number; emissive: number; emit: number }
  > = {
    stone: { color: 0x8a8680, roughness: 0.92, metalness: 0.05, emissive: 0x1a1814, emit: 0.12 },
    iron: { color: 0xb8b4ac, roughness: 0.38, metalness: 0.7, emissive: 0x2a2824, emit: 0.14 },
    gold: { color: 0xe8c84a, roughness: 0.42, metalness: 0.65, emissive: 0x4a3808, emit: 0.22 },
    diamond: { color: 0xa8e8f0, roughness: 0.28, metalness: 0.4, emissive: 0x204858, emit: 0.35 },
  }
  const s = specs[ammo]
  mat = new THREE.MeshStandardMaterial({
    color: s.color,
    roughness: s.roughness,
    metalness: s.metalness,
    emissive: new THREE.Color(s.emissive),
    emissiveIntensity: s.emit,
  })
  ammoMats.set(ammo, mat)
  return mat
}

function peekFirstAmmo(slots: (CatapultStack | null)[]): CatapultAmmoItem | null {
  for (const stack of slots) {
    if (stack && stack.count > 0 && isCatapultAmmoItem(stack.item)) return stack.item
  }
  return null
}

function setLoadedRockAmmo(anim: CatapultAnimParts, ammo: CatapultAmmoItem | null) {
  if (!ammo) {
    anim.loadedRock.visible = false
    return
  }
  const mat = getAmmoMat(ammo)
  for (const m of anim.loadedRockMats) {
    m.color.copy(mat.color)
    m.roughness = mat.roughness
    m.metalness = mat.metalness
    m.emissive.copy(mat.emissive)
    m.emissiveIntensity = mat.emissiveIntensity
  }
  anim.loadedRock.visible = true
}

function addBox(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  castShadow = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = castShadow
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function fitRopeSegment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  _ropeDir.subVectors(to, from)
  const len = Math.max(_ropeDir.length(), 0.001)
  _ropeMid.copy(from).add(to).multiplyScalar(0.5)
  mesh.position.copy(_ropeMid)
  mesh.quaternion.setFromUnitVectors(_ropeUp, _ropeDir.normalize())
  mesh.scale.set(1, len, 1)
}

type CatapultVisual = {
  group: THREE.Group
  anim: CatapultAnimParts
  scoop: THREE.Object3D
}

/**
 * Trebuchet-style siege engine.
 * Local +Z faces the enemy (shot direction). The long arm’s scoop loads at the
 * rear (−Z) beside the operator, then swings up and over to fling toward +Z.
 */
function createCatapultVisual(opts?: { ghost?: boolean }): CatapultVisual {
  const ghost = opts?.ghost ?? false
  const group = new THREE.Group()

  const wood = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0xc48a55,
        roughness: 0.8,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    : getWoodMat()
  const dark = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0x4a2e18,
        roughness: 0.9,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    : getDarkWoodMat()
  const iron = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0xb8b4ac,
        roughness: 0.4,
        metalness: 0.5,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    : getIronMat()
  const rope = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0xc4a46a,
        roughness: 0.95,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    : getRopeMat()
  const stone = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0x8a8680,
        roughness: 0.9,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    : getStoneMat()

  // Base platform / rails
  addBox(group, 1.9, 0.14, 2.8, 0, 0.07, 0.1, wood, !ghost)
  addBox(group, 0.16, 0.22, 2.9, 0.78, 0.18, 0.05, dark, !ghost)
  addBox(group, 0.16, 0.22, 2.9, -0.78, 0.18, 0.05, dark, !ghost)
  // Front brace feet
  addBox(group, 0.22, 0.18, 0.55, 0.78, 0.16, 1.35, wood, !ghost)
  addBox(group, 0.22, 0.18, 0.55, -0.78, 0.16, 1.35, wood, !ghost)
  addBox(group, 0.22, 0.18, 0.55, 0.78, 0.16, -1.2, wood, !ghost)
  addBox(group, 0.22, 0.18, 0.55, -0.78, 0.16, -1.2, wood, !ghost)

  // A-frame uprights (taller toward the rear pivot)
  const buildAFrame = (side: 1 | -1) => {
    const x = side * 0.72
    // Rear leg
    const rear = addBox(group, 0.14, 1.55, 0.14, x, 0.95, -0.55, wood, !ghost)
    rear.rotation.z = side * -0.12
    rear.rotation.x = 0.18
    // Front leg
    const front = addBox(group, 0.14, 1.35, 0.14, x, 0.85, 0.55, wood, !ghost)
    front.rotation.z = side * -0.1
    front.rotation.x = -0.22
    // Cross brace
    addBox(group, 0.08, 0.08, 1.15, x, 0.55, 0.05, dark, !ghost)
  }
  buildAFrame(1)
  buildAFrame(-1)

  // Top crossbeam / axle housing
  addBox(group, 1.55, 0.16, 0.18, 0, 1.72, -0.15, dark, !ghost)
  addBox(group, 1.7, 0.08, 0.08, 0, 1.72, -0.15, iron, !ghost)

  // Side guy ropes (static decoration)
  const ropeGeo = new THREE.CylinderGeometry(0.018, 0.018, 1, 6)
  const addGuy = (sx: number, sz: number, ex: number, ey: number, ez: number) => {
    const mesh = new THREE.Mesh(ropeGeo, rope)
    mesh.castShadow = false
    group.add(mesh)
    fitRopeSegment(
      mesh,
      new THREE.Vector3(sx, 0.2, sz),
      new THREE.Vector3(ex, ey, ez),
    )
  }
  addGuy(0.85, 1.2, 0.72, 1.65, -0.1)
  addGuy(-0.85, 1.2, -0.72, 1.65, -0.1)
  addGuy(0.85, -1.15, 0.72, 1.65, -0.2)
  addGuy(-0.85, -1.15, -0.72, 1.65, -0.2)

  // Arm pivot at the axle
  const armPivot = new THREE.Group()
  armPivot.position.set(0, 1.72, -0.15)
  group.add(armPivot)

  // Long throwing beam: scoop on the long +Z tip, counterweight on the short −Z end.
  // When cocked the +Z tip rotates to the rear (−Z) so the load sits behind the frame.
  addBox(armPivot, 0.14, 0.14, 2.55, 0, 0, 0.55, wood, !ghost)
  addBox(armPivot, 0.18, 0.1, 0.35, 0, 0, -0.85, dark, !ghost)
  // Iron bands
  addBox(armPivot, 0.2, 0.2, 0.08, 0, 0, 0, iron, false)
  addBox(armPivot, 0.2, 0.2, 0.08, 0, 0, 1.4, iron, false)

  // Counterweight box on the short arm (hangs with gravity via counter-rotation).
  const counterweight = new THREE.Group()
  counterweight.position.set(0, 0, -1.05)
  armPivot.add(counterweight)
  addBox(counterweight, 0.55, 0.45, 0.45, 0, -0.35, 0, dark, !ghost)
  addBox(counterweight, 0.48, 0.38, 0.38, 0, -0.35, 0, stone, !ghost)
  addBox(counterweight, 0.08, 0.35, 0.08, 0.18, -0.05, 0, iron, false)
  addBox(counterweight, 0.08, 0.35, 0.08, -0.18, -0.05, 0, iron, false)

  // Deep bucket / sling pouch — counter-rotated so the bowl stays upright until dump.
  const scoop = new THREE.Group()
  scoop.position.set(0, SCOOP_ARM_Y, SCOOP_ARM_Z)
  armPivot.add(scoop)
  // Floor
  addBox(scoop, 0.62, 0.07, 0.62, 0, -0.02, 0, dark, !ghost)
  // Four walls — tall enough that the rock sits snug inside
  addBox(scoop, 0.62, 0.34, 0.07, 0, 0.14, 0.28, wood, !ghost)
  addBox(scoop, 0.62, 0.34, 0.07, 0, 0.14, -0.28, wood, !ghost)
  addBox(scoop, 0.07, 0.34, 0.56, 0.28, 0.14, 0, wood, !ghost)
  addBox(scoop, 0.07, 0.34, 0.56, -0.28, 0.14, 0, wood, !ghost)
  // Inner lip
  addBox(scoop, 0.58, 0.04, 0.58, 0, 0.3, 0, rope, false)
  // Iron corner bands
  addBox(scoop, 0.1, 0.1, 0.1, 0.28, -0.02, 0.28, iron, false)
  addBox(scoop, 0.1, 0.1, 0.1, -0.28, -0.02, 0.28, iron, false)
  addBox(scoop, 0.1, 0.1, 0.1, 0.28, -0.02, -0.28, iron, false)
  addBox(scoop, 0.1, 0.1, 0.1, -0.28, -0.02, -0.28, iron, false)

  const loadedRock = new THREE.Group()
  scoop.add(loadedRock)
  const rockMat = getAmmoMat('stone').clone()
  const rockMat2 = getAmmoMat('stone').clone()
  const rockMesh = new THREE.Mesh(
    new THREE.SphereGeometry(LOADED_ROCK_RADIUS, 12, 10),
    rockMat,
  )
  // Nestled on the bucket floor — center sits just above the boards.
  rockMesh.position.set(0, LOADED_ROCK_RADIUS * 0.55, 0.02)
  rockMesh.scale.set(1.08, 0.92, 1.02)
  rockMesh.castShadow = !ghost
  loadedRock.add(rockMesh)
  const lump = new THREE.Mesh(
    new THREE.SphereGeometry(LOADED_ROCK_RADIUS * 0.55, 8, 6),
    rockMat2,
  )
  lump.position.set(0.1, LOADED_ROCK_RADIUS * 0.7, -0.08)
  lump.castShadow = !ghost
  loadedRock.add(lump)
  loadedRock.visible = false

  // Sling ropes from arm tip to scoop rim (updated each pose)
  const slingLeft = new THREE.Mesh(ropeGeo, rope)
  const slingRight = new THREE.Mesh(ropeGeo, rope)
  slingLeft.castShadow = false
  slingRight.castShadow = false
  armPivot.add(slingLeft, slingRight)

  const anim: CatapultAnimParts = {
    armPivot,
    counterweight,
    scoop,
    loadedRock,
    loadedRockMats: [rockMat, rockMat2],
    slingLeft,
    slingRight,
  }

  applyArmPose(anim, 0, 0, 'linear')

  return { group, anim, scoop }
}

/**
 * Pose the arm, keep the bucket upright until it tips to dump, hang the counterweight.
 * `mode` selects throw easing vs linear recover.
 */
function applyArmPose(
  anim: CatapultAnimParts,
  swing: number,
  windPull = 0,
  mode: 'throw' | 'linear' = 'throw',
) {
  const armAngle = armAngleForSwing(swing, mode) + windPull
  anim.armPivot.rotation.x = armAngle

  // Counterweight hangs toward world-down.
  anim.counterweight.rotation.x = -armAngle

  // Bowl stays gravity-upright while loading / early swing, then tips to dump near release.
  const throwT = mode === 'throw' ? swingEase(THREE.MathUtils.clamp(swing, 0, 1)) : 0
  const tipStart = armProgressForAngle(ARM_RELEASE)
  let tip = 0
  if (throwT > tipStart) {
    tip = THREE.MathUtils.clamp((throwT - tipStart) / Math.max(1 - tipStart, 0.05), 0, 1)
  }
  // Smooth tip — bowl leans forward (toward +Z) to dump the stone.
  const tipEase = tip * tip * (3 - 2 * tip)
  anim.scoop.rotation.x = -armAngle + tipEase * 1.05

  // Sling ropes: arm tip → scoop rim corners (in arm-local space).
  const tipPos = new THREE.Vector3(0, 0, 1.55)
  const rimY = 0.28
  for (const [mesh, side] of [
    [anim.slingLeft, -1],
    [anim.slingRight, 1],
  ] as const) {
    _scoopRim.set(side * 0.26, rimY, 0.05)
    // Rotate rim by scoop's local tilt, then offset by scoop position on the arm.
    const sx = Math.sin(anim.scoop.rotation.x)
    const cx = Math.cos(anim.scoop.rotation.x)
    const ly = _scoopRim.y
    const lz = _scoopRim.z
    _scoopRim.y = ly * cx - lz * sx
    _scoopRim.z = ly * sx + lz * cx
    _scoopRim.x += anim.scoop.position.x
    _scoopRim.y += anim.scoop.position.y
    _scoopRim.z += anim.scoop.position.z
    fitRopeSegment(mesh, tipPos, _scoopRim)
  }
}

function emptySlots(): (CatapultStack | null)[] {
  return Array.from({ length: CATAPULT_SLOT_COUNT }, () => null)
}

function takeFirstAmmo(slots: (CatapultStack | null)[]): CatapultAmmoItem | null {
  for (let i = 0; i < slots.length; i++) {
    const stack = slots[i]
    if (!stack || stack.count <= 0) continue
    if (!isCatapultAmmoItem(stack.item)) continue
    const ammo = stack.item
    stack.count -= 1
    if (stack.count <= 0) slots[i] = null
    return ammo
  }
  return null
}

function playerOnScoop(
  scoopWorld: THREE.Vector3,
  playerPos: THREE.Vector3,
  playerHeight: number,
): boolean {
  const dx = playerPos.x - scoopWorld.x
  const dz = playerPos.z - scoopWorld.z
  if (dx * dx + dz * dz > RIDE_RADIUS_SQ) return false
  const feetY = playerPos.y
  const headY = playerPos.y + playerHeight
  // Standing in / on the bucket — feet near scoop, or body overlapping it.
  return feetY < scoopWorld.y + 1.1 && headY > scoopWorld.y - 0.35
}

function aimPointForEnemy(enemy: EnemyInstance, out: THREE.Vector3) {
  const p = enemy.root.position
  out.set(p.x, p.y + enemy.colFootOffset + enemy.colHeight * TARGET_AIM_FRAC, p.z)
}

function aimPointForSpider(spider: SpiderInstance, out: THREE.Vector3) {
  const p = spider.root.position
  out.set(p.x, p.y + spider.colFootOffset + spider.colHeight * TARGET_AIM_FRAC, p.z)
}

function aimPointForPlayer(playerPos: THREE.Vector3, out: THREE.Vector3) {
  out.set(playerPos.x, playerPos.y + PLAYER_AIM_HEIGHT, playerPos.z)
}

/**
 * Scoop world position at a given arm pitch (group-local → world).
 * Used for the cocked loading seat and the mid-swing release point.
 */
function scoopWorldAtArmAngle(
  catapult: PlacedCatapult,
  armX: number,
  out: THREE.Vector3,
) {
  const cos = Math.cos(armX)
  const sin = Math.sin(armX)
  const localY = PIVOT_LOCAL_Y + (SCOOP_ARM_Y * cos - SCOOP_ARM_Z * sin)
  const localZ = PIVOT_LOCAL_Z + (SCOOP_ARM_Y * sin + SCOOP_ARM_Z * cos)
  const yaw = catapult.facingYaw
  const sy = Math.sin(yaw)
  const cy = Math.cos(yaw)
  const pos = catapult.group.position
  out.set(pos.x + sy * localZ, pos.y + localY, pos.z + cy * localZ)
}

/**
 * Where the scoop will be at release — used for range checks and the 45° speed solve.
 */
function estimateReleasePoint(catapult: PlacedCatapult, out: THREE.Vector3) {
  scoopWorldAtArmAngle(catapult, ARM_RELEASE, out)
}

/**
 * Pick a target from hostiles (+ optional player) using ballista-style priority.
 */
function findTarget(
  origin: THREE.Vector3,
  enemies: readonly EnemyInstance[],
  spiders: readonly SpiderInstance[],
  playerPos: THREE.Vector3,
  priority: BallistaTargetPriority,
  includePlayer: boolean,
  out: THREE.Vector3,
): boolean {
  let bestX = 0
  let bestY = 0
  let bestZ = 0
  let bestStrength = -1
  let bestDistSq = Infinity
  let bestDistSqToPlayer = Infinity
  let found = false

  const consider = (pos: THREE.Vector3, strength: number) => {
    const distSq = origin.distanceToSquared(pos)
    if (distSq > CATAPULT_RANGE_SQ || distSq < 1.2) return
    if (!canReachBallistic(origin, pos, CATAPULT_ROCK_SPEED, CATAPULT_ROCK_GRAVITY)) {
      return
    }
    const dx = pos.x - playerPos.x
    const dy = pos.y - (playerPos.y + PLAYER_AIM_HEIGHT)
    const dz = pos.z - playerPos.z
    const distSqToPlayer = dx * dx + dy * dy + dz * dz

    let better = false
    if (!found) {
      better = true
    } else if (priority === 'strongest') {
      better =
        strength > bestStrength || (strength === bestStrength && distSq < bestDistSq)
    } else if (priority === 'near_player') {
      better = distSqToPlayer < bestDistSqToPlayer
    } else {
      better = distSq < bestDistSq
    }
    if (!better) return
    found = true
    bestX = pos.x
    bestY = pos.y
    bestZ = pos.z
    bestStrength = strength
    bestDistSq = distSq
    bestDistSqToPlayer = distSqToPlayer
  }

  for (const enemy of enemies) {
    if (enemy.health <= 0) continue
    aimPointForEnemy(enemy, _targetPos)
    consider(_targetPos, enemy.maxHealth)
  }
  for (const spider of spiders) {
    if (spider.health <= 0) continue
    aimPointForSpider(spider, _targetPos)
    consider(_targetPos, spider.maxHealth > 0 ? spider.maxHealth : SPIDER_MAX_HEALTH)
  }
  if (includePlayer) {
    aimPointForPlayer(playerPos, _targetPos)
    consider(_targetPos, PLAYER_MAX_HEALTH * 0.5)
  }

  if (!found) return false
  out.set(bestX, bestY, bestZ)
  return true
}

/** True when a 45° lob at a legal speed can land on `target`. */
function canReachBallistic(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  _speed: number,
  gravity: number,
): boolean {
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const dz = target.z - origin.z
  const R = Math.hypot(dx, dz)
  if (R < 1.5) return false
  // For φ=45°: v² = g R² / (R − dy). Need R > dy and speed in clamp range.
  const denom = R - dy
  if (denom < 0.75) return false
  const need = Math.sqrt((gravity * R * R) / denom)
  return need >= LAUNCH_SPEED_MIN * 0.85 && need <= LAUNCH_SPEED_MAX * 1.08
}

/**
 * Fixed ~45° parabolic lob. Yaw faces the target; speed is solved so the rock
 * lands on it (classic range equation for elevation π/4).
 * Returns the launch speed to use.
 */
function aimParabola45(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  gravity: number,
  outDir: THREE.Vector3,
): number {
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const dz = target.z - origin.z
  const R = Math.hypot(dx, dz)
  const yaw = R > 1e-4 ? Math.atan2(dx, dz) : 0
  const pitch = LAUNCH_PITCH

  let speed = CATAPULT_ROCK_SPEED
  const denom = R - dy
  if (R > 1.2 && denom > 0.5) {
    speed = Math.sqrt((gravity * R * R) / denom)
  } else if (R > 1.2) {
    // Target above the 45° envelope — loft a bit steeper as best-effort.
    speed = LAUNCH_SPEED_MAX
  }
  speed = THREE.MathUtils.clamp(speed, LAUNCH_SPEED_MIN, LAUNCH_SPEED_MAX)

  outDir.set(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw) * Math.cos(pitch),
  )
  if (outDir.lengthSq() < 1e-8) outDir.set(0, Math.sin(LAUNCH_PITCH), 1)
  else outDir.normalize()
  return speed
}

function yawToward(fromYaw: number, toYaw: number, maxStep: number): number {
  const delta =
    THREE.MathUtils.euclideanModulo(toYaw - fromYaw + Math.PI, Math.PI * 2) - Math.PI
  if (Math.abs(delta) <= maxStep) return toYaw
  return fromYaw + Math.sign(delta) * maxStep
}

/** Player-placed trebuchet that flings rocks (and riders) in its facing arc. */
export class PlacedCatapultManager {
  readonly group = new THREE.Group()
  private readonly ghost: THREE.Group
  private readonly catapults = new Map<string, PlacedCatapult>()
  private nextId = 0

  constructor() {
    const visual = createCatapultVisual({ ghost: true })
    this.ghost = visual.group
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.ghost.traverse((child) => {
      child.raycast = () => {}
    })
    this.group.add(this.ghost)
  }

  get count() {
    return this.catapults.size
  }

  get(id: string): PlacedCatapult | undefined {
    return this.catapults.get(id)
  }

  all(): readonly PlacedCatapult[] {
    return [...this.catapults.values()]
  }

  findIdFromObject(obj: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = obj
    while (current) {
      const id = current.userData.catapultId as string | undefined
      if (id) return id
      current = current.parent
    }
    return null
  }

  intersectMeshes(raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
    for (const catapult of this.catapults.values()) {
      raycaster.intersectObject(catapult.group, true, out)
    }
  }

  placementFromHit(
    hit: THREE.Intersection,
    rayDirection: THREE.Vector3,
    outPos: THREE.Vector3,
    outNormal: THREE.Vector3,
  ): boolean {
    if (!hit.face) return false
    buildPlacementNormalFromFace(
      hit.face.normal,
      hit.object.matrixWorld,
      rayDirection,
      outNormal,
    )
    if (outNormal.y < MIN_UP_DOT) return false
    outPos.copy(hit.point).addScaledVector(outNormal, SURFACE_NUDGE)
    return true
  }

  isPlacementValid(
    position: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerRadius: number,
    playerHeight: number,
  ): boolean {
    for (const catapult of this.catapults.values()) {
      if (catapult.group.position.distanceToSquared(position) < MIN_SPACING_SQ) return false
    }

    _size.set(CATAPULT_WIDTH + 0.1, CATAPULT_HEIGHT + 0.04, CATAPULT_DEPTH + 0.1)
    _center.set(position.x, position.y + _size.y * 0.5, position.z)
    _box.setFromCenterAndSize(_center, _size)
    return !(
      playerPos.x + playerRadius > _box.min.x &&
      playerPos.x - playerRadius < _box.max.x &&
      playerPos.y + playerHeight > _box.min.y &&
      playerPos.y < _box.max.y &&
      playerPos.z + playerRadius > _box.min.z &&
      playerPos.z - playerRadius < _box.max.z
    )
  }

  worldBox(catapult: PlacedCatapult, out: THREE.Box3): THREE.Box3 {
    const halfW = CATAPULT_WIDTH * 0.42
    const halfD = CATAPULT_DEPTH * 0.42
    out.min.set(
      catapult.group.position.x - halfW,
      catapult.group.position.y,
      catapult.group.position.z - halfD,
    )
    out.max.set(
      catapult.group.position.x + halfW,
      catapult.group.position.y + CATAPULT_COLLISION_HEIGHT,
      catapult.group.position.z + halfD,
    )
    return out
  }

  place(position: THREE.Vector3, facingYaw: number): PlacedCatapult {
    const id = `catapult-${this.nextId++}`
    const visual = createCatapultVisual()
    visual.group.position.copy(position)
    visual.group.rotation.y = facingYaw
    visual.group.userData.catapultId = id
    visual.group.traverse((child) => {
      if (child !== visual.group) child.userData.catapultId = id
    })

    const catapult: PlacedCatapult = {
      id,
      group: visual.group,
      anim: visual.anim,
      scoop: visual.scoop,
      collisionKey: `catapult:${id}`,
      slots: emptySlots(),
      fireRate: 'normal',
      targetPriority: 'closest',
      targetPlayer: false,
      facingYaw,
      cooldown: 0.8,
      swing: 0,
      released: true,
      didFire: false,
      wind: 0,
      trackTarget: null,
    }
    applyArmPose(catapult.anim, 0, 0, 'linear')
    this.catapults.set(id, catapult)
    this.group.add(visual.group)
    return catapult
  }

  facingYawFromPlayer(catapultPos: THREE.Vector3, playerPos: THREE.Vector3): number {
    // +Z is the enemy / shot direction. Place so the rear (loaded scoop) faces the player.
    _forward.set(catapultPos.x - playerPos.x, 0, catapultPos.z - playerPos.z)
    if (_forward.lengthSq() < 1e-6) return 0
    _forward.normalize()
    return Math.atan2(_forward.x, _forward.z)
  }

  facingYawFromLook(lookDir: THREE.Vector3): number {
    // Look direction is where the player faces; trebuchet should throw that way (+Z).
    _look.set(lookDir.x, 0, lookDir.z)
    if (_look.lengthSq() < 1e-6) return 0
    _look.normalize()
    return Math.atan2(_look.x, _look.z)
  }

  remove(id: string): PlacedCatapult | null {
    const catapult = this.catapults.get(id)
    if (!catapult) return null
    this.group.remove(catapult.group)
    this.catapults.delete(id)
    return catapult
  }

  takeAllStacks(catapult: PlacedCatapult): CatapultStack[] {
    const out: CatapultStack[] = []
    for (let i = 0; i < catapult.slots.length; i++) {
      const slot = catapult.slots[i]
      if (!slot) continue
      out.push(
        slot.durability !== undefined
          ? { item: slot.item, count: slot.count, durability: slot.durability }
          : { item: slot.item, count: slot.count },
      )
      catapult.slots[i] = null
    }
    return out
  }

  setGhost(position: THREE.Vector3 | null, yaw: number | null, valid: boolean) {
    if (!position || yaw === null) {
      this.ghost.visible = false
      return
    }
    this.ghost.position.copy(position)
    this.ghost.rotation.y = yaw
    const tint = valid ? 0x88ff88 : 0xff6666
    this.ghost.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial
        if ('color' in mat) mat.color.setHex(tint)
      }
    })
    this.ghost.visible = true
  }

  /**
   * Spit non-ammo, auto-aim with ballista-style priorities, and queue 45° rock lobs.
   * Fire/eject arrays are cleared and filled by this call.
   */
  update(
    dt: number,
    enemies: readonly EnemyInstance[],
    spiders: readonly SpiderInstance[],
    fires: CatapultFireRequest[],
    ejects: CatapultEjectRequest[],
    opts: CatapultUpdateOpts,
  ) {
    fires.length = 0
    ejects.length = 0
    const { playerPos, playerHeight } = opts

    for (const catapult of this.catapults.values()) {
      for (let i = 0; i < catapult.slots.length; i++) {
        const stack = catapult.slots[i]
        if (!stack || isCatapultAmmoItem(stack.item)) continue
        catapult.slots[i] = null
        const angle = Math.random() * Math.PI * 2
        _ejectPos.set(
          catapult.group.position.x + Math.cos(angle) * 1.1,
          catapult.group.position.y + 0.7,
          catapult.group.position.z + Math.sin(angle) * 1.1,
        )
        _ejectVel.set(
          Math.cos(angle) * (2.2 + Math.random()),
          2.8 + Math.random() * 1.2,
          Math.sin(angle) * (2.2 + Math.random()),
        )
        ejects.push({
          item: stack.item,
          count: stack.count,
          durability: stack.durability,
          position: _ejectPos.clone(),
          velocity: _ejectVel.clone(),
        })
      }

      if (catapult.cooldown > 0) catapult.cooldown = Math.max(0, catapult.cooldown - dt)

      const fireInterval = FIRE_INTERVAL[catapult.fireRate]
      const windWindow = fireInterval * WIND_FRACTION[catapult.fireRate]

      // Slow return to cocked after the full follow-through (linear — no ease snap).
      if (catapult.released && catapult.swing > 0) {
        catapult.swing = Math.max(0, catapult.swing - dt * RECOVER_SPEED)
        applyArmPose(catapult.anim, catapult.swing, 0, 'linear')
        setLoadedRockAmmo(catapult.anim, null)
        continue
      }

      // Mid-throw: accelerating whip, tip the bucket, release, then follow through.
      if (!catapult.released) {
        catapult.swing = Math.min(1, catapult.swing + dt * SWING_SPEED)
        applyArmPose(catapult.anim, catapult.swing, 0, 'throw')
        if (!catapult.didFire) {
          setLoadedRockAmmo(catapult.anim, peekFirstAmmo(catapult.slots))
        } else {
          setLoadedRockAmmo(catapult.anim, null)
        }

        if (!catapult.didFire && catapult.swing >= RELEASE_SWING) {
          const ammo = takeFirstAmmo(catapult.slots)
          if (ammo) {
            catapult.group.updateWorldMatrix(true, true)
            catapult.scoop.getWorldPosition(_scoopWorld)
            // Spawn slightly above the bucket floor so the rock clears the rim.
            _scoopWorld.y += 0.2

            const hasFresh = findTarget(
              _scoopWorld,
              enemies,
              spiders,
              playerPos,
              catapult.targetPriority,
              catapult.targetPlayer,
              _aimPoint,
            )
            const locked = hasFresh ? _aimPoint : (catapult.trackTarget ?? null)
            let speed = CATAPULT_ROCK_SPEED
            if (locked) {
              speed = aimParabola45(
                _scoopWorld,
                locked,
                CATAPULT_ROCK_GRAVITY,
                _launchDir,
              )
            } else {
              const yaw = catapult.facingYaw
              _launchDir.set(
                Math.sin(yaw) * Math.cos(LAUNCH_PITCH),
                Math.sin(LAUNCH_PITCH),
                Math.cos(yaw) * Math.cos(LAUNCH_PITCH),
              )
              _launchDir.normalize()
            }

            const flingPlayer = (() => {
              scoopWorldAtArmAngle(catapult, ARM_COCKED, _muzzleWorld)
              return playerOnScoop(_muzzleWorld, playerPos, playerHeight)
            })()
            fires.push({
              catapult,
              ammo,
              origin: _scoopWorld.clone(),
              direction: _launchDir.clone(),
              speed,
              flingPlayer,
            })
          }
          catapult.didFire = true
          catapult.trackTarget = null
          catapult.cooldown = fireInterval
          setLoadedRockAmmo(catapult.anim, null)
        }

        // Finish the arc before recovering.
        if (catapult.swing >= 1) {
          catapult.released = true
          catapult.didFire = false
        }
        continue
      }

      // Idle cocked — track targets and wind the arm before the next lob.
      estimateReleasePoint(catapult, _muzzleWorld)
      const hasTarget = findTarget(
        _muzzleWorld,
        enemies,
        spiders,
        playerPos,
        catapult.targetPriority,
        catapult.targetPlayer,
        _aimPoint,
      )
      let yawError = Infinity
      if (hasTarget) {
        const wantYaw = Math.atan2(
          _aimPoint.x - catapult.group.position.x,
          _aimPoint.z - catapult.group.position.z,
        )
        catapult.facingYaw = yawToward(catapult.facingYaw, wantYaw, AIM_YAW_SPEED * dt)
        catapult.group.rotation.y = catapult.facingYaw
        yawError = Math.abs(
          THREE.MathUtils.euclideanModulo(
            wantYaw - catapult.facingYaw + Math.PI,
            Math.PI * 2,
          ) - Math.PI,
        )
        catapult.trackTarget = _aimPoint.clone()
      } else {
        catapult.trackTarget = null
      }

      const ammoPeek = peekFirstAmmo(catapult.slots)
      const canEngage = hasTarget && !!ammoPeek && yawError <= AIM_READY_YAW
      if (!canEngage || catapult.cooldown > windWindow) {
        catapult.wind = Math.max(0, catapult.wind - dt * 2.2)
        applyArmPose(catapult.anim, 0, catapult.wind * WIND_PULL, 'linear')
        setLoadedRockAmmo(catapult.anim, ammoPeek)
        continue
      }

      if (catapult.cooldown > 0) {
        catapult.wind = 1 - catapult.cooldown / windWindow
        applyArmPose(catapult.anim, 0, catapult.wind * WIND_PULL, 'linear')
        setLoadedRockAmmo(catapult.anim, ammoPeek)
        continue
      }

      // Release the whip.
      if (hasTarget) catapult.trackTarget = _aimPoint.clone()
      catapult.released = false
      catapult.didFire = false
      catapult.swing = 0
      catapult.wind = 0
      applyArmPose(catapult.anim, 0, 0, 'throw')
      setLoadedRockAmmo(catapult.anim, ammoPeek)
    }
  }
}

/** Re-export gravity so main can match player launch arcs. */
export { CATAPULT_ROCK_GRAVITY, CATAPULT_ROCK_SPEED }
