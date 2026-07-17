import * as THREE from 'three'
import type { InventoryItem } from './inventory'
import { createHeldBowPullingItem, createHeldExtrudedItem } from './itemMeshes'
import type { ArrowItem } from './thrownArrow'

const DEG = Math.PI / 180
/** Default melee / dig tools (pickaxe, shovel, fist, etc.). */
const SWING_DURATION = 0.36
const SWING_INTERVAL = 0.44
/** Axe: full 1s swing animation, 1 swing/s. */
const AXE_SWING_DURATION = 1
const AXE_SWING_INTERVAL = 1
/** Sword: faster recovery between swings. */
const SWORD_SWING_DURATION = SWING_DURATION
const SWORD_SWING_INTERVAL = 0.7
/** Spear melee: slow swing cadence (throw cooldown is separate). */
const SPEAR_SWING_DURATION = SWING_DURATION
const SPEAR_SWING_INTERVAL = 1.5
const THROW_DURATION = 0.28
export const SPEAR_THROW_COOLDOWN = 0.55

function isAxeItem(item: InventoryItem | null): boolean {
  return (
    item === 'axe' ||
    item === 'iron_axe' ||
    item === 'gold_axe' ||
    item === 'diamond_axe'
  )
}

function isSwordItem(item: InventoryItem | null): boolean {
  return (
    item === 'sword' ||
    item === 'iron_sword' ||
    item === 'gold_sword' ||
    item === 'diamond_sword'
  )
}

function isSpearItem(item: InventoryItem | null): boolean {
  return (
    item === 'spear' ||
    item === 'iron_spear' ||
    item === 'gold_spear' ||
    item === 'diamond_spear'
  )
}

function swingTimingFor(item: InventoryItem | null): {
  duration: number
  interval: number
} {
  if (isAxeItem(item)) {
    return { duration: AXE_SWING_DURATION, interval: AXE_SWING_INTERVAL }
  }
  if (isSwordItem(item)) {
    return { duration: SWORD_SWING_DURATION, interval: SWORD_SWING_INTERVAL }
  }
  if (isSpearItem(item)) {
    return { duration: SPEAR_SWING_DURATION, interval: SPEAR_SWING_INTERVAL }
  }
  return { duration: SWING_DURATION, interval: SWING_INTERVAL }
}
/** Time to reach full bow draw. */
export const BOW_DRAW_DURATION = 0.62
export const BOW_FIRE_COOLDOWN = 0.28
/** Floor draw (0–1) for click / short releases — low power, never full draw. */
export const BOW_MIN_RELEASE = 0.18
/** Hide the shared charge ring until draw is past this (avoids flash on micro-taps). */
export const BOW_DRAW_HUD_MIN = 0.06
/** Default / zoomed FOV while aiming with the bow (RMB). */
export const BOW_BASE_FOV = 70
export const BOW_ZOOM_FOV = 48
/** How quickly FOV eases toward zoom / base (higher = snappier). */
export const BOW_ZOOM_LERP = 14
/**
 * Look sensitivity at full bow zoom, relative to hip-fire.
 * Slower than FOV-matched (~0.69) so ADS aiming feels deliberate.
 */
export const BOW_ZOOM_LOOK_SCALE = 0.4

/**
 * Minecraft-style bow model stages while drawing:
 * 0 = idle (no arrow), 1 = light pull, 2 = full pull.
 */
export function bowDrawStage(draw: number): 0 | 1 | 2 {
  const d = Math.min(1, Math.max(0, draw))
  if (d <= 0.02) return 0
  if (d < 0.65) return 1
  return 2
}

/**
 * Shoulder pivot in camera space. Arm stays mostly vertical (low yaw);
 * items tip right from the top of the capsule.
 */
const PIVOT_POS = new THREE.Vector3(0.62, -0.55, -0.78)
/** Minecraft-like bow hold — fixed; does not slide while drawing. */
const BOW_PIVOT_POS = new THREE.Vector3(0.38, -0.5, -0.7)
const ARM_OFFSET = new THREE.Vector3(-0.12, 0.28, 0.02)
const BASE_YAW = 8 * DEG
/** Slight upward tip so the bow reads more upright in first person. */
const BOW_HOLD_PITCH = 10 * DEG
/** Bank the bow a bit toward the left of the screen. */
const BOW_HOLD_ROLL = -10 * DEG

const _AXIS_X = new THREE.Vector3(1, 0, 0)
const _AXIS_Y = new THREE.Vector3(0, 1, 0)
const _AXIS_Z = new THREE.Vector3(0, 0, 1)
const _qy = new THREE.Quaternion()
const _qz = new THREE.Quaternion()
const _qx = new THREE.Quaternion()
const _swingQuat = new THREE.Quaternion()
const _throwQuat = new THREE.Quaternion()
const _swingPos = new THREE.Vector3()

const CAPSULE_RADIUS = 0.055
const CAPSULE_LENGTH = 0.22
const CAPSULE_CENTER_Y = -0.1
/**
 * Proximal / upper end of the capsule (toward screen center), not the distal
 * tip at the bottom of the frame.
 */
const GRIP_MOUNT_POS = new THREE.Vector3(
  0,
  CAPSULE_CENTER_Y + CAPSULE_LENGTH / 2 + CAPSULE_RADIUS * 0.35,
  0.04,
)

/** Held extruded icons need depth so voxels occlude correctly (same as ground drops). */
function markHeldItem(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.renderOrder = 11
    child.frustumCulled = false
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      mat.depthTest = true
      mat.depthWrite = true
      mat.fog = false
    }
  })
}

function createHeldItemMesh(item: InventoryItem): THREE.Object3D {
  return createHeldExtrudedItem(item)
}

/** 0–1 strike weight for the current swing frame (peaks on impact). */
export function swingStrikeIntensity(swingProgress: number): number {
  const f1 = Math.sin(Math.sqrt(Math.min(1, Math.max(0, swingProgress))) * Math.PI)
  return f1 * f1
}

function applyThrowRotation(throwProgress: number, target: THREE.Object3D) {
  const t = Math.min(1, Math.max(0, throwProgress))
  const wind = Math.sin(Math.min(t * 1.6, 1) * Math.PI * 0.5)
  const snap = Math.sin(Math.max(0, t - 0.18) * 1.22 * Math.PI)

  _qy.setFromAxisAngle(_AXIS_Y, wind * 28 * DEG - snap * 14 * DEG)
  _qz.setFromAxisAngle(_AXIS_Z, wind * 12 * DEG - snap * 42 * DEG)
  _qx.setFromAxisAngle(_AXIS_X, wind * 24 * DEG - snap * 95 * DEG)

  _throwQuat.copy(_qy).multiply(_qz).multiply(_qx)
  target.quaternion.copy(_throwQuat)
  target.position.set(0, 0, 0)
}

/**
 * Forward slice: wind back, then drive into the world (-Z) while cutting left.
 * Translation carries the strike; rotation is a light left tilt — not a big roll arc.
 */
function applySwingPose(swingProgress: number, target: THREE.Object3D) {
  const p = Math.min(1, Math.max(0, swingProgress))

  // Wind-up first third, then commit forward.
  const wind = Math.max(0, 1 - p / 0.28)
  const strike = Math.min(1, Math.max(0, (p - 0.18) / 0.55))
  const strikeEase = strike * strike * (3 - 2 * strike) // smoothstep

  // Light left tilt through the cut (not a big curving roll).
  const roll = (-12 * wind + 42 * strikeEase) * DEG
  const pitch = (8 * wind - 28 * strikeEase) * DEG

  _qz.setFromAxisAngle(_AXIS_Z, roll)
  _qx.setFromAxisAngle(_AXIS_X, pitch)
  _swingQuat.copy(_qz).multiply(_qx)
  target.quaternion.copy(_swingQuat)

  // Pull back on wind-up, then slice forward into the scene and left.
  _swingPos.set(
    0.04 * wind - 0.18 * strikeEase,
    0.05 * wind - 0.08 * strikeEase,
    0.06 * wind - 0.22 * strikeEase,
  )
  target.position.copy(_swingPos)
}

/** First-person capsule arm attached to the camera. */
export class ViewmodelHand {
  readonly group = new THREE.Group()

  private readonly swingPivot = new THREE.Group()
  private readonly armMount = new THREE.Group()
  private readonly heldItemMount = new THREE.Group()
  private readonly heldMeshes = new Map<InventoryItem, THREE.Object3D>()
  /** Lazy-built bow pull stage meshes keyed by `stage:arrow`. */
  private readonly bowPullMeshes = new Map<string, THREE.Object3D>()

  private swingT = 0
  private swingCooldown = 0
  /** Duration of the in-progress swing (set in beginSwing). */
  private swingDuration = SWING_DURATION
  /** Clicked during cooldown — fire one swing when reload finishes. */
  private swingPending = false
  private throwT = 0
  private bowDraw = 0
  private nockedArrow: ArrowItem | null = null
  private bowVisualKey = 'idle'
  private heldItem: InventoryItem | null = null

  constructor(camera: THREE.PerspectiveCamera) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      roughness: 0.88,
      metalness: 0,
      fog: false,
      depthTest: false,
      depthWrite: false,
    })
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 6, 10),
      material,
    )
    capsule.position.set(0, CAPSULE_CENTER_Y, 0.01)
    capsule.rotation.x = 0.04
    capsule.castShadow = false
    capsule.receiveShadow = false
    capsule.renderOrder = 10
    capsule.frustumCulled = false

    this.heldItemMount.position.copy(GRIP_MOUNT_POS)
    this.armMount.add(capsule)
    this.armMount.add(this.heldItemMount)
    this.armMount.position.copy(ARM_OFFSET)
    this.swingPivot.add(this.armMount)
    this.group.add(this.swingPivot)
    this.group.scale.setScalar(1.12)
    this.group.position.copy(PIVOT_POS)
    this.group.rotation.order = 'YXZ'
    camera.add(this.group)
    this.resetPose()
  }

  setHeldItem(item: InventoryItem | null) {
    if (item === this.heldItem) return
    if (this.heldItem === 'bow' && item !== 'bow') {
      this.bowDraw = 0
      this.nockedArrow = null
      this.showBowVisual('idle')
    }
    this.heldItem = item
    this.applyPivotForHeldItem()

    for (const mesh of this.heldMeshes.values()) {
      mesh.visible = false
    }
    for (const mesh of this.bowPullMeshes.values()) {
      mesh.visible = false
    }

    if (!item) return

    let mesh = this.heldMeshes.get(item)
    if (!mesh) {
      mesh = createHeldItemMesh(item)
      markHeldItem(mesh)
      this.heldMeshes.set(item, mesh)
      this.heldItemMount.add(mesh)
    }
    mesh.visible = true
    if (item === 'bow') {
      this.bowVisualKey = 'idle'
      this.showBowVisual('idle')
    }
  }

  private applyPivotForHeldItem() {
    if (this.heldItem === 'bow') {
      this.applyBowArmPose()
      return
    }
    this.group.position.copy(PIVOT_POS)
    this.group.rotation.set(0, BASE_YAW, 0, 'YXZ')
    this.swingPivot.quaternion.identity()
    this.swingPivot.position.set(0, 0, 0)
  }

  /** Fixed Minecraft-like bow arm — stays put while drawing; slight upward tilt. */
  private applyBowArmPose() {
    this.group.position.copy(BOW_PIVOT_POS)
    this.group.rotation.set(BOW_HOLD_PITCH, BASE_YAW, BOW_HOLD_ROLL, 'YXZ')
    this.swingPivot.quaternion.identity()
    this.swingPivot.position.set(0, 0, 0)
  }

  /** Which arrow tip to paint on pull-stage bow sprites. */
  setNockedArrow(item: ArrowItem | null) {
    if (item === this.nockedArrow) return
    this.nockedArrow = item
    if (this.heldItem === 'bow') this.refreshBowDrawVisual()
  }

  private bowPullKey(stage: 0 | 1, arrow: ArrowItem): string {
    return `${stage}:${arrow}`
  }

  private showBowVisual(key: string) {
    const idle = this.heldMeshes.get('bow')
    for (const mesh of this.bowPullMeshes.values()) mesh.visible = false
    if (key === 'idle') {
      if (idle) idle.visible = true
      this.bowVisualKey = 'idle'
      return
    }
    if (idle) idle.visible = false
    const pull = this.bowPullMeshes.get(key)
    if (pull) pull.visible = true
    this.bowVisualKey = key
  }

  private ensureBowPullMesh(stage: 0 | 1, arrow: ArrowItem): THREE.Object3D {
    const key = this.bowPullKey(stage, arrow)
    let mesh = this.bowPullMeshes.get(key)
    if (!mesh) {
      mesh = createHeldBowPullingItem(stage, arrow)
      markHeldItem(mesh)
      this.bowPullMeshes.set(key, mesh)
      this.heldItemMount.add(mesh)
      mesh.visible = false
    }
    return mesh
  }

  /** Swap idle ↔ pulling_0 ↔ pulling_1 extruded bow models (Minecraft-style). */
  private refreshBowDrawVisual() {
    if (this.heldItem !== 'bow') return
    const stage = bowDrawStage(this.bowDraw)
    if (stage === 0 || !this.nockedArrow) {
      this.showBowVisual('idle')
      return
    }
    const pullStage = (stage - 1) as 0 | 1
    const key = this.bowPullKey(pullStage, this.nockedArrow)
    this.ensureBowPullMesh(pullStage, this.nockedArrow)
    if (this.bowVisualKey !== key) this.showBowVisual(key)
  }

  private resetPose() {
    this.applyPivotForHeldItem()
  }

  whack() {
    if (this.throwT > 0 || this.bowDraw > 0) return
    // Respect reload: buffer a click instead of restarting mid-swing / mid-cooldown.
    if (this.swingT > 0 || this.swingCooldown > 0) {
      this.swingPending = true
      return
    }
    this.beginSwing()
  }

  private beginSwing() {
    const timing = swingTimingFor(this.heldItem)
    this.swingPending = false
    this.swingT = 1
    this.swingDuration = timing.duration
    this.swingCooldown = timing.interval
  }

  startThrow(): boolean {
    if (this.throwT > 0 || this.bowDraw > 0) return false
    this.swingT = 0
    this.swingPending = false
    this.swingCooldown = SPEAR_THROW_COOLDOWN
    this.throwT = 1
    return true
  }

  /** Update bow draw amount (0–1). Pass 0 to cancel / after loosing (idle model). */
  setBowDraw(amount: number) {
    this.bowDraw = Math.min(1, Math.max(0, amount))
    if (this.bowDraw > 0) {
      this.swingT = 0
      this.swingPending = false
      this.swingCooldown = 0
      this.refreshBowDrawVisual()
      this.applyBowArmPose()
      return
    }
    // Shot / cancel — back to idle bow (nocked arrow gone from the sprite).
    this.nockedArrow = null
    this.showBowVisual('idle')
    this.applyBowArmPose()
  }

  getBowDraw(): number {
    return this.bowDraw
  }

  isDrawingBow(): boolean {
    return this.bowDraw > 0
  }

  isThrowing(): boolean {
    return this.throwT > 0
  }

  getThrowProgress(): number {
    if (this.throwT <= 0) return 1
    return 1 - this.throwT
  }

  getSwingImpact(): number {
    if (this.swingT <= 0) return 0
    return swingStrikeIntensity(1 - this.swingT)
  }

  update(dt: number, active: boolean) {
    if (this.throwT > 0) {
      this.throwT = Math.max(0, this.throwT - dt / THROW_DURATION)
      const throwProgress = 1 - this.throwT
      this.group.rotation.y = BASE_YAW
      applyThrowRotation(throwProgress, this.swingPivot)
      if (
        this.heldItem === 'spear' ||
        this.heldItem === 'iron_spear' ||
        this.heldItem === 'gold_spear' ||
        this.heldItem === 'diamond_spear' ||
        this.heldItem === 'glowing_orb' ||
        this.heldItem === 'crystal_berries'
      ) {
        const mesh = this.heldMeshes.get(this.heldItem)
        if (mesh) mesh.visible = throwProgress < 0.34
      }
      return
    }

    // Bow: fixed hold pose (sprite stages change; arm does not slide).
    if (this.heldItem === 'bow') {
      this.applyBowArmPose()
      return
    }

    if (
      this.heldItem === 'spear' ||
      this.heldItem === 'iron_spear' ||
      this.heldItem === 'gold_spear' ||
      this.heldItem === 'diamond_spear' ||
      this.heldItem === 'glowing_orb' ||
      this.heldItem === 'crystal_berries'
    ) {
      const mesh = this.heldMeshes.get(this.heldItem)
      if (mesh) mesh.visible = true
    }

    if (active || this.swingPending || this.swingCooldown > 0) {
      this.swingCooldown = Math.max(0, this.swingCooldown - dt)
    }
    // Hold-to-repeat, or a buffered click after reload — never restart mid-swing.
    if (
      (active || this.swingPending) &&
      this.swingT <= 0 &&
      this.swingCooldown <= 0
    ) {
      this.beginSwing()
    }

    if (this.swingT <= 0) {
      this.resetPose()
      return
    }

    this.swingT = Math.max(0, this.swingT - dt / this.swingDuration)
    const swingProgress = 1 - this.swingT

    this.group.rotation.y = BASE_YAW
    applySwingPose(swingProgress, this.swingPivot)
  }
}
