import * as THREE from 'three'
import { buildPlacementNormalFromFace } from './buildBlocks'
import { PLAYER_MAX_HEALTH, type EnemyInstance } from './enemy'
import type { InventoryItem } from './inventory'
import { TOOL_MAX_DURABILITY } from './inventory'
import { SPIDER_MAX_HEALTH, type SpiderInstance } from './roboticSpider'
import { ARROW_MAX_SPEED, isArrowItem, type ArrowItem } from './thrownArrow'
import type { SpearItem } from './thrownSpear'
import { createWoodPlankAlbedoMap } from './woodTexture'

/** Compact mounted-bow footprint (~half a build cube). */
export const BALLISTA_WIDTH = 1.25
export const BALLISTA_DEPTH = 1.25
export const BALLISTA_HEIGHT = 1.15
/** Solid collision is only the short base so shots clear the frame. */
export const BALLISTA_COLLISION_HEIGHT = 0.32
export const BALLISTA_SLOT_COUNT = 9

export type BallistaFireRate = 'slow' | 'normal' | 'fast'
/** Who to prefer when several targets are in range. */
export type BallistaTargetPriority = 'closest' | 'strongest' | 'near_player'

const MIN_UP_DOT = 0.55
const SURFACE_NUDGE = 0.02
const MIN_SPACING = 1.35
const MIN_SPACING_SQ = MIN_SPACING * MIN_SPACING

/** Auto-target range (meters). */
export const BALLISTA_RANGE = 30
const BALLISTA_RANGE_SQ = BALLISTA_RANGE * BALLISTA_RANGE

const FIRE_INTERVAL: Record<BallistaFireRate, number> = {
  slow: 1.85,
  normal: 0.9,
  fast: 0.4,
}

/** Match projectile flight constants for gravity aim compensation. */
const ARROW_GRAVITY = 9.5
const SPEAR_SPEED = 22
const SPEAR_GRAVITY = 13.5
const ORB_SPEED = 28
const ORB_GRAVITY = 11

/** Spawn this far past the string so projectiles clear the bow frame. */
const MUZZLE_CLEARANCE = 0.65
const REST_PITCH = -0.08
const AIM_YAW_SPEED = 10
const AIM_PITCH_SPEED = 8
const RECOIL_RECOVER = 10
/** Aim point on the player (meters above feet). */
const PLAYER_AIM_HEIGHT = 0.55

/** How fast the string pulls back (units/sec toward full draw), by fire rate. */
const DRAW_SPEED: Record<BallistaFireRate, number> = {
  slow: 2.4,
  normal: 3.6,
  fast: 7.0,
}
/** Ease-off when losing a target mid-draw. */
const DRAW_RELEASE_SPEED = 5.5
/** Max limb yaw bend (radians) at full draw. */
const LIMB_BEND = 0.38
/** How far the nock pulls toward −Z at full draw (meters). */
const DRAW_PULL = 0.38
/** Resting string Z in bow-local space (aligned with the tips undrawn). */
const STRING_REST_Z = -0.22

const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _look = new THREE.Vector3()
const _muzzleWorld = new THREE.Vector3()
const _aimDir = new THREE.Vector3()
const _aimPoint = new THREE.Vector3()
const _targetPos = new THREE.Vector3()
const _ejectPos = new THREE.Vector3()
const _ejectVel = new THREE.Vector3()
const _tipL = new THREE.Vector3()
const _tipR = new THREE.Vector3()
const _nockPos = new THREE.Vector3()
const _ropeDir = new THREE.Vector3()
const _ropeMid = new THREE.Vector3()
const _ropeUp = new THREE.Vector3(0, 1, 0)

export type BallistaStack = { item: InventoryItem; count: number; durability?: number }

export type BallistaAmmo =
  | { kind: 'arrow'; item: ArrowItem }
  | { kind: 'spear'; item: SpearItem; durability: number }
  | { kind: 'orb'; item: 'glowing_orb' | 'crystal_berries' }

export type PlacedBallista = {
  id: string
  group: THREE.Group
  yawPivot: THREE.Group
  pitchPivot: THREE.Group
  muzzle: THREE.Object3D
  /** Animated bow limbs / string / nock. */
  anim: BowAnimParts
  collisionKey: string
  slots: (BallistaStack | null)[]
  fireRate: BallistaFireRate
  targetPriority: BallistaTargetPriority
  /** When true, the player is a valid auto-aim target (healing / traps). */
  targetPlayer: boolean
  cooldown: number
  baseYaw: number
  aimYaw: number
  aimPitch: number
  recoil: number
  /** Bow draw amount 0–1 (string pulled back). */
  draw: number
  /** Last locked aim point (world). */
  trackTarget: THREE.Vector3 | null
}

export type BallistaUpdateOpts = {
  playerPos: THREE.Vector3
}

export type BallistaFireRequest = {
  ballista: PlacedBallista
  ammo: BallistaAmmo
  origin: THREE.Vector3
  direction: THREE.Vector3
}

export type BallistaEjectRequest = {
  item: InventoryItem
  count: number
  durability?: number
  position: THREE.Vector3
  velocity: THREE.Vector3
}

function isSpearItem(item: string | null): item is SpearItem {
  return (
    item === 'spear' ||
    item === 'iron_spear' ||
    item === 'gold_spear' ||
    item === 'diamond_spear'
  )
}

/** Items the ballista will load and fire; everything else is spit out. */
export function isBallistaAmmoItem(item: InventoryItem): boolean {
  return (
    isArrowItem(item) ||
    isSpearItem(item) ||
    item === 'glowing_orb' ||
    item === 'crystal_berries'
  )
}

let sharedWoodMat: THREE.MeshStandardMaterial | null = null
let sharedDarkWoodMat: THREE.MeshStandardMaterial | null = null
let sharedIronMat: THREE.MeshStandardMaterial | null = null
let sharedRopeMat: THREE.MeshStandardMaterial | null = null

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

/** Stretch a unit-Y cylinder so it spans `from` → `to` in the parent’s local space. */
function fitRopeSegment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
  _ropeDir.subVectors(to, from)
  const len = Math.max(_ropeDir.length(), 0.001)
  _ropeMid.copy(from).add(to).multiplyScalar(0.5)
  mesh.position.copy(_ropeMid)
  mesh.quaternion.setFromUnitVectors(_ropeUp, _ropeDir.normalize())
  mesh.scale.set(1, len, 1)
}

export type BowAnimParts = {
  bow: THREE.Group
  leftLimb: THREE.Group
  rightLimb: THREE.Group
  leftTip: THREE.Object3D
  rightTip: THREE.Object3D
  stringLeft: THREE.Mesh
  stringRight: THREE.Mesh
  nock: THREE.Group
  loadedArrow: THREE.Group
}

type BallistaVisual = {
  group: THREE.Group
  yawPivot: THREE.Group
  pitchPivot: THREE.Group
  muzzle: THREE.Object3D
  anim: BowAnimParts
}

/**
 * Compact mounted bow on a short pedestal — curved limbs, live string, no gizmos.
 * Local +Z is the shot direction.
 */
function createBallistaVisual(opts?: { ghost?: boolean }): BallistaVisual {
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

  // Low platform
  const baseW = 0.72
  const baseD = 0.72
  const deckH = 0.1
  addBox(group, baseW, deckH, baseD, 0, deckH * 0.5, 0, wood, !ghost)
  addBox(group, baseW * 0.72, 0.06, baseD * 0.72, 0, deckH + 0.03, 0, dark, !ghost)

  // Pedestal post + iron collar
  addBox(group, 0.12, 0.42, 0.12, 0, deckH + 0.24, 0, wood, !ghost)
  addBox(group, 0.22, 0.06, 0.22, 0, deckH + 0.48, 0, iron, !ghost)

  const yawPivot = new THREE.Group()
  yawPivot.position.set(0, deckH + 0.52, 0)
  group.add(yawPivot)

  // Swivel collar
  addBox(yawPivot, 0.28, 0.07, 0.28, 0, 0.02, 0, dark, !ghost)

  // Fork that holds the bow
  addBox(yawPivot, 0.07, 0.3, 0.07, 0.17, 0.2, 0, wood, !ghost)
  addBox(yawPivot, 0.07, 0.3, 0.07, -0.17, 0.2, 0, wood, !ghost)
  addBox(yawPivot, 0.44, 0.055, 0.055, 0, 0.36, 0, dark, !ghost)
  // Axle pin through the forks
  addBox(yawPivot, 0.4, 0.035, 0.035, 0, 0.22, 0, iron, !ghost)

  const pitchPivot = new THREE.Group()
  pitchPivot.position.set(0, 0.22, 0)
  yawPivot.add(pitchPivot)

  // --- Mounted bow: curved limbs, live string, shoots +Z ---
  const bow = new THREE.Group()
  pitchPivot.add(bow)

  // Riser / grip
  addBox(bow, 0.08, 0.24, 0.1, 0, 0.03, 0, dark, !ghost)
  addBox(bow, 0.06, 0.1, 0.14, 0, 0.03, 0.06, wood, !ghost)
  // Arrow shelf
  addBox(bow, 0.035, 0.03, 0.12, 0, -0.02, 0.1, iron, false)
  // Short rear tiller (mount feel without looking like a siege engine)
  addBox(bow, 0.055, 0.055, 0.22, 0, -0.01, -0.14, wood, !ghost)
  addBox(bow, 0.08, 0.04, 0.06, 0, -0.01, -0.26, dark, !ghost)

  const buildLimb = (side: 1 | -1) => {
    const limb = new THREE.Group()
    // Pivot at the riser shoulder
    limb.position.set(side * 0.045, 0.05, 0.01)
    bow.add(limb)

    // Inner limb (near riser)
    const inner = addBox(limb, 0.2, 0.07, 0.07, side * 0.11, 0, -0.01, wood, !ghost)
    inner.rotation.y = side * 0.12

    // Mid limb — starts the C-curve
    const mid = addBox(limb, 0.22, 0.06, 0.06, side * 0.3, 0.015, -0.07, wood, !ghost)
    mid.rotation.y = side * 0.42

    // Outer limb / tip fade
    const outer = addBox(limb, 0.18, 0.05, 0.05, side * 0.46, 0.035, -0.16, dark, !ghost)
    outer.rotation.y = side * 0.72

    // Tip nock (iron)
    const tipCap = addBox(limb, 0.04, 0.045, 0.055, side * 0.55, 0.045, -0.22, iron, false)
    tipCap.rotation.y = side * 0.85

    const tip = new THREE.Object3D()
    tip.position.set(side * 0.56, 0.045, -0.23)
    limb.add(tip)

    return { limb, tip }
  }

  const left = buildLimb(-1)
  const right = buildLimb(1)

  // Two string halves (unit cylinders along Y; scaled each frame)
  const ropeGeo = new THREE.CylinderGeometry(0.01, 0.01, 1, 6)
  const stringLeft = new THREE.Mesh(ropeGeo, rope)
  const stringRight = new THREE.Mesh(ropeGeo, rope)
  stringLeft.castShadow = false
  stringRight.castShadow = false
  bow.add(stringLeft, stringRight)

  // Nock / serving — pulled back when drawing
  const nock = new THREE.Group()
  nock.position.set(0, 0.05, STRING_REST_Z)
  bow.add(nock)
  addBox(nock, 0.028, 0.028, 0.04, 0, 0, 0, iron, false)
  addBox(nock, 0.04, 0.018, 0.018, 0, 0, 0, rope, false)

  // Loaded projectile that rides the string while drawn
  const loadedArrow = new THREE.Group()
  nock.add(loadedArrow)
  addBox(loadedArrow, 0.018, 0.018, 0.52, 0, 0, 0.28, wood, false)
  addBox(loadedArrow, 0.032, 0.032, 0.07, 0, 0, 0.56, iron, false)
  // Fletching
  addBox(loadedArrow, 0.05, 0.012, 0.06, 0, 0, 0.04, dark, false)
  addBox(loadedArrow, 0.012, 0.05, 0.06, 0, 0, 0.04, dark, false)
  loadedArrow.visible = false

  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.05, 0.28)
  bow.add(muzzle)

  const anim: BowAnimParts = {
    bow,
    leftLimb: left.limb,
    rightLimb: right.limb,
    leftTip: left.tip,
    rightTip: right.tip,
    stringLeft,
    stringRight,
    nock,
    loadedArrow,
  }

  applyDrawToAnim(anim, 0)

  return { group, yawPivot, pitchPivot, muzzle, anim }
}

/** Pose limbs + triangle string for a given draw amount (0 = rest, 1 = full). */
function applyDrawToAnim(anim: BowAnimParts, draw: number) {
  const d = THREE.MathUtils.clamp(draw, 0, 1)
  // Ease-in so the last bit of pull reads stronger
  const t = d * d * (3 - 2 * d)

  anim.leftLimb.rotation.y = -t * LIMB_BEND
  anim.rightLimb.rotation.y = t * LIMB_BEND
  // Slight tip lift as the limbs flex
  anim.leftLimb.rotation.z = t * 0.1
  anim.rightLimb.rotation.z = -t * 0.1

  anim.nock.position.set(0, 0.05 + t * 0.01, STRING_REST_Z - t * DRAW_PULL)

  anim.bow.updateMatrixWorld(true)
  anim.leftTip.getWorldPosition(_tipL)
  anim.rightTip.getWorldPosition(_tipR)
  anim.bow.worldToLocal(_tipL)
  anim.bow.worldToLocal(_tipR)
  _nockPos.copy(anim.nock.position)

  fitRopeSegment(anim.stringLeft, _tipL, _nockPos)
  fitRopeSegment(anim.stringRight, _tipR, _nockPos)

  anim.loadedArrow.visible = d > 0.04
}

function emptySlots(): (BallistaStack | null)[] {
  return Array.from({ length: BALLISTA_SLOT_COUNT }, () => null)
}

function ammoFromStack(stack: BallistaStack): BallistaAmmo | null {
  if (isArrowItem(stack.item)) return { kind: 'arrow', item: stack.item }
  if (isSpearItem(stack.item)) {
    return {
      kind: 'spear',
      item: stack.item,
      durability: stack.durability ?? TOOL_MAX_DURABILITY,
    }
  }
  if (stack.item === 'glowing_orb' || stack.item === 'crystal_berries') {
    return { kind: 'orb', item: stack.item }
  }
  return null
}

function takeFirstAmmo(slots: (BallistaStack | null)[]): BallistaAmmo | null {
  for (let i = 0; i < slots.length; i++) {
    const stack = slots[i]
    if (!stack || stack.count <= 0) continue
    const ammo = ammoFromStack(stack)
    if (!ammo) continue
    stack.count -= 1
    if (stack.count <= 0) slots[i] = null
    return ammo
  }
  return null
}

function peekHasAmmo(slots: (BallistaStack | null)[]): boolean {
  for (const stack of slots) {
    if (stack && stack.count > 0 && isBallistaAmmoItem(stack.item)) return true
  }
  return false
}

function aimPointForEnemy(enemy: EnemyInstance, out: THREE.Vector3) {
  const p = enemy.root.position
  out.set(p.x, p.y + enemy.colFootOffset + enemy.colHeight * 0.55, p.z)
}

function aimPointForSpider(spider: SpiderInstance, out: THREE.Vector3) {
  const p = spider.root.position
  out.set(p.x, p.y + spider.colFootOffset + spider.colHeight * 0.55, p.z)
}

function aimPointForPlayer(playerPos: THREE.Vector3, out: THREE.Vector3) {
  out.set(playerPos.x, playerPos.y + PLAYER_AIM_HEIGHT, playerPos.z)
}

/**
 * Pick a target from hostiles (+ optional player) using the ballista's priority mode.
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
    if (distSq > BALLISTA_RANGE_SQ || distSq < 0.35) return
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
    // Slightly below huge bosses so “strongest” still prefers big threats when both are on.
    consider(_targetPos, PLAYER_MAX_HEALTH * 0.5)
  }

  if (!found) return false
  out.set(bestX, bestY, bestZ)
  return true
}

/** Elevate the aim point so arcing projectiles still reach the target. */
function aimDirectionWithGravity(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  speed: number,
  gravity: number,
  outDir: THREE.Vector3,
) {
  const dx = target.x - origin.x
  const dz = target.z - origin.z
  const horiz = Math.hypot(dx, dz)
  let aimY = target.y
  for (let i = 0; i < 4; i++) {
    const dy = aimY - origin.y
    const range = Math.hypot(horiz, dy)
    const t = Math.max(range / Math.max(speed, 1), 0.05)
    aimY = target.y + 0.5 * gravity * t * t
  }
  outDir.set(dx, aimY - origin.y, dz)
  if (outDir.lengthSq() < 1e-8) outDir.set(0, 0, 1)
  else outDir.normalize()
}

function flightStatsForAmmo(ammo: BallistaAmmo): { speed: number; gravity: number } {
  if (ammo.kind === 'spear') return { speed: SPEAR_SPEED, gravity: SPEAR_GRAVITY }
  if (ammo.kind === 'orb') return { speed: ORB_SPEED, gravity: ORB_GRAVITY }
  return { speed: ARROW_MAX_SPEED, gravity: ARROW_GRAVITY }
}

function applyAimPose(ballista: PlacedBallista) {
  ballista.yawPivot.rotation.y = ballista.aimYaw
  // Slight nose-down as the string comes back, plus kick on release.
  ballista.pitchPivot.rotation.x =
    ballista.aimPitch - ballista.recoil * 0.14 - ballista.draw * 0.04
  applyDrawToAnim(ballista.anim, ballista.draw)
}

/** Player-placed auto-firing mounted bow with a small ammo hopper. */
export class PlacedBallistaManager {
  readonly group = new THREE.Group()
  private readonly ghost: THREE.Group
  private readonly ballistas = new Map<string, PlacedBallista>()
  private nextId = 0

  constructor() {
    const visual = createBallistaVisual({ ghost: true })
    this.ghost = visual.group
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.ghost.traverse((child) => {
      child.raycast = () => {}
    })
    this.group.add(this.ghost)
  }

  get count() {
    return this.ballistas.size
  }

  get(id: string): PlacedBallista | undefined {
    return this.ballistas.get(id)
  }

  all(): readonly PlacedBallista[] {
    return [...this.ballistas.values()]
  }

  findIdFromObject(obj: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = obj
    while (current) {
      const id = current.userData.ballistaId as string | undefined
      if (id) return id
      current = current.parent
    }
    return null
  }

  intersectMeshes(raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
    for (const ballista of this.ballistas.values()) {
      raycaster.intersectObject(ballista.group, true, out)
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
    for (const ballista of this.ballistas.values()) {
      if (ballista.group.position.distanceToSquared(position) < MIN_SPACING_SQ) return false
    }

    _size.set(BALLISTA_WIDTH + 0.08, BALLISTA_HEIGHT + 0.04, BALLISTA_DEPTH + 0.08)
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

  worldBox(ballista: PlacedBallista, out: THREE.Box3): THREE.Box3 {
    // Short base only — projectiles must clear this AABB.
    const half = BALLISTA_WIDTH * 0.42
    out.min.set(
      ballista.group.position.x - half,
      ballista.group.position.y,
      ballista.group.position.z - half,
    )
    out.max.set(
      ballista.group.position.x + half,
      ballista.group.position.y + BALLISTA_COLLISION_HEIGHT,
      ballista.group.position.z + half,
    )
    return out
  }

  place(position: THREE.Vector3, facingYaw: number): PlacedBallista {
    const id = `ballista-${this.nextId++}`
    const visual = createBallistaVisual()
    visual.group.position.copy(position)
    visual.group.rotation.y = facingYaw
    visual.group.userData.ballistaId = id
    visual.group.traverse((child) => {
      if (child !== visual.group) child.userData.ballistaId = id
    })

    const ballista: PlacedBallista = {
      id,
      group: visual.group,
      yawPivot: visual.yawPivot,
      pitchPivot: visual.pitchPivot,
      muzzle: visual.muzzle,
      anim: visual.anim,
      collisionKey: `ballista:${id}`,
      slots: emptySlots(),
      fireRate: 'normal',
      targetPriority: 'closest',
      targetPlayer: false,
      cooldown: 0.25,
      baseYaw: facingYaw,
      aimYaw: 0,
      aimPitch: REST_PITCH,
      recoil: 0,
      draw: 0,
      trackTarget: null,
    }
    applyAimPose(ballista)
    this.ballistas.set(id, ballista)
    this.group.add(visual.group)
    return ballista
  }

  facingYawFromPlayer(ballistaPos: THREE.Vector3, playerPos: THREE.Vector3): number {
    // Aim away from the player so the bow faces into the world when placed.
    _forward.set(ballistaPos.x - playerPos.x, 0, ballistaPos.z - playerPos.z)
    if (_forward.lengthSq() < 1e-6) return 0
    _forward.normalize()
    return Math.atan2(_forward.x, _forward.z)
  }

  facingYawFromLook(lookDir: THREE.Vector3): number {
    _look.set(lookDir.x, 0, lookDir.z)
    if (_look.lengthSq() < 1e-6) return 0
    _look.normalize()
    return Math.atan2(-_look.x, -_look.z)
  }

  remove(id: string): PlacedBallista | null {
    const ballista = this.ballistas.get(id)
    if (!ballista) return null
    this.group.remove(ballista.group)
    this.ballistas.delete(id)
    return ballista
  }

  takeAllStacks(ballista: PlacedBallista): BallistaStack[] {
    const out: BallistaStack[] = []
    for (let i = 0; i < ballista.slots.length; i++) {
      const slot = ballista.slots[i]
      if (!slot) continue
      out.push(
        slot.durability !== undefined
          ? { item: slot.item, count: slot.count, durability: slot.durability }
          : { item: slot.item, count: slot.count },
      )
      ballista.slots[i] = null
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
   * Spit non-ammo items, auto-aim, and queue shots.
   * Fire/eject arrays are cleared and filled by this call.
   */
  update(
    dt: number,
    enemies: readonly EnemyInstance[],
    spiders: readonly SpiderInstance[],
    fires: BallistaFireRequest[],
    ejects: BallistaEjectRequest[],
    opts: BallistaUpdateOpts,
  ) {
    fires.length = 0
    ejects.length = 0
    const playerPos = opts.playerPos

    for (const ballista of this.ballistas.values()) {
      for (let i = 0; i < ballista.slots.length; i++) {
        const stack = ballista.slots[i]
        if (!stack || isBallistaAmmoItem(stack.item)) continue
        ballista.slots[i] = null
        const angle = Math.random() * Math.PI * 2
        _ejectPos.set(
          ballista.group.position.x + Math.cos(angle) * 0.75,
          ballista.group.position.y + 0.55,
          ballista.group.position.z + Math.sin(angle) * 0.75,
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

      if (ballista.cooldown > 0) ballista.cooldown = Math.max(0, ballista.cooldown - dt)
      if (ballista.recoil > 0) {
        ballista.recoil = Math.max(0, ballista.recoil - dt * RECOIL_RECOVER)
      }

      ballista.group.updateWorldMatrix(true, true)
      ballista.muzzle.getWorldPosition(_muzzleWorld)

      let wantYaw = 0
      let wantPitch = REST_PITCH
      ballista.trackTarget = null

      if (
        findTarget(
          _muzzleWorld,
          enemies,
          spiders,
          playerPos,
          ballista.targetPriority,
          ballista.targetPlayer,
          _targetPos,
        )
      ) {
        ballista.trackTarget = _targetPos.clone()
        _aimDir.subVectors(_targetPos, _muzzleWorld)
        const flat = Math.hypot(_aimDir.x, _aimDir.z)
        const worldYaw = Math.atan2(_aimDir.x, _aimDir.z)
        wantYaw =
          THREE.MathUtils.euclideanModulo(worldYaw - ballista.baseYaw + Math.PI, Math.PI * 2) -
          Math.PI
        wantPitch = flat > 1e-4 ? -Math.atan2(_aimDir.y, flat) : REST_PITCH
        wantPitch = THREE.MathUtils.clamp(wantPitch, -0.75, 0.45)
      }

      const yawStep = AIM_YAW_SPEED * dt
      const pitchStep = AIM_PITCH_SPEED * dt
      const yawDelta =
        THREE.MathUtils.euclideanModulo(wantYaw - ballista.aimYaw + Math.PI, Math.PI * 2) -
        Math.PI
      if (Math.abs(yawDelta) <= yawStep) ballista.aimYaw = wantYaw
      else ballista.aimYaw += Math.sign(yawDelta) * yawStep

      const pitchDelta = wantPitch - ballista.aimPitch
      if (Math.abs(pitchDelta) <= pitchStep) ballista.aimPitch = wantPitch
      else ballista.aimPitch += Math.sign(pitchDelta) * pitchStep

      const hasAmmo = peekHasAmmo(ballista.slots)
      const drawWindow = 1 / DRAW_SPEED[ballista.fireRate]
      if (ballista.trackTarget && hasAmmo) {
        if (ballista.cooldown <= 0) {
          ballista.draw = 1
        } else if (ballista.cooldown < drawWindow) {
          // Pull through the last beat of the cooldown so rate stays honest.
          ballista.draw = 1 - ballista.cooldown / drawWindow
        } else {
          ballista.draw = 0
        }
      } else {
        ballista.draw = Math.max(0, ballista.draw - dt * DRAW_RELEASE_SPEED)
      }

      applyAimPose(ballista)

      // Loose only at full draw with a live target + ammo.
      if (
        !ballista.trackTarget ||
        ballista.cooldown > 0 ||
        !hasAmmo ||
        ballista.draw < 0.999
      ) {
        continue
      }

      const ammo = takeFirstAmmo(ballista.slots)
      if (!ammo) {
        ballista.draw = 0
        applyAimPose(ballista)
        continue
      }

      const lockedTarget = ballista.trackTarget
      ballista.group.updateWorldMatrix(true, true)
      ballista.muzzle.getWorldPosition(_muzzleWorld)
      _aimPoint.copy(lockedTarget)
      const { speed, gravity } = flightStatsForAmmo(ammo)
      // Rough muzzle exit, then aim from there with gravity compensation.
      _aimDir.subVectors(_aimPoint, _muzzleWorld)
      if (_aimDir.lengthSq() > 1e-8) _aimDir.normalize()
      else _aimDir.set(0, 0, 1)
      _muzzleWorld.addScaledVector(_aimDir, MUZZLE_CLEARANCE)
      aimDirectionWithGravity(_muzzleWorld, _aimPoint, speed, gravity, _aimDir)

      fires.push({
        ballista,
        ammo,
        origin: _muzzleWorld.clone(),
        direction: _aimDir.clone(),
      })
      ballista.cooldown = FIRE_INTERVAL[ballista.fireRate]
      ballista.recoil = 1
      ballista.draw = 0
      // Snap the visual toward the shot so it reads as aiming.
      ballista.aimYaw = wantYaw
      ballista.aimPitch = wantPitch
      applyAimPose(ballista)
    }
  }
}
