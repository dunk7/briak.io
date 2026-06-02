import * as THREE from 'three'

const DEG = Math.PI / 180
const SWING_DURATION = 0.32
const SWING_INTERVAL = 0.42

/** Shoulder pivot — off-screen bottom-right; swing rotates here. */
const PIVOT_POS = new THREE.Vector3(0.92, -0.58, -0.46)
/** Forearm offset from pivot into the visible lower-center. */
const ARM_OFFSET = new THREE.Vector3(-0.44, 0.4, 0.06)
const BASE_YAW = 45 * DEG

const _AXIS_X = new THREE.Vector3(1, 0, 0)
const _AXIS_Y = new THREE.Vector3(0, 1, 0)
const _AXIS_Z = new THREE.Vector3(0, 0, 1)
const _qy = new THREE.Quaternion()
const _qz = new THREE.Quaternion()
const _qx = new THREE.Quaternion()
const _swingQuat = new THREE.Quaternion()

/** 0–1 strike weight for the current swing frame (peaks on impact). */
export function swingStrikeIntensity(swingProgress: number): number {
  const f1 = Math.sin(Math.sqrt(Math.min(1, Math.max(0, swingProgress))) * Math.PI)
  return f1 * f1
}

/** Vanilla first-person attack swing (Y → Z → X). */
function applyMinecraftSwingRotation(swingProgress: number, target: THREE.Object3D) {
  const f = Math.sin(swingProgress * swingProgress * Math.PI)
  const f1 = Math.sin(Math.sqrt(swingProgress) * Math.PI)

  _qy.setFromAxisAngle(_AXIS_Y, f * -20 * DEG)
  _qz.setFromAxisAngle(_AXIS_Z, f1 * -20 * DEG)
  _qx.setFromAxisAngle(_AXIS_X, f1 * -80 * DEG)

  _swingQuat.copy(_qy).multiply(_qz).multiply(_qx)
  target.quaternion.copy(_swingQuat)
}

/** Minecraft-style capsule arm attached to the camera. */
export class ViewmodelHand {
  /** Off-screen shoulder; only the offset arm is visible. */
  readonly group = new THREE.Group()

  private readonly swingPivot = new THREE.Group()
  private readonly armMount = new THREE.Group()

  private swingT = 0
  private swingCooldown = 0

  constructor(camera: THREE.PerspectiveCamera) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      roughness: 0.88,
      metalness: 0,
      fog: false,
    })
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.24, 6, 10), material)
    capsule.position.set(0, -0.14, 0.02)
    capsule.rotation.x = 0.18
    capsule.castShadow = false
    capsule.receiveShadow = false

    this.armMount.add(capsule)
    this.armMount.position.copy(ARM_OFFSET)
    this.swingPivot.add(this.armMount)
    this.group.add(this.swingPivot)
    this.group.scale.setScalar(1.1)
    this.group.position.copy(PIVOT_POS)
    this.group.rotation.order = 'YXZ'
    camera.add(this.group)
    this.resetPose()
  }

  private resetPose() {
    this.group.position.copy(PIVOT_POS)
    this.group.rotation.set(0, BASE_YAW, 0, 'YXZ')
    this.swingPivot.quaternion.identity()
  }

  whack() {
    this.swingT = 1
    this.swingCooldown = SWING_INTERVAL
  }

  /** 0–1 while swinging; strongest at the strike frame (use for dig hit reactions). */
  getSwingImpact(): number {
    if (this.swingT <= 0) return 0
    return swingStrikeIntensity(1 - this.swingT)
  }

  update(dt: number, active: boolean) {
    if (active) {
      this.swingCooldown -= dt
      if (this.swingCooldown <= 0) this.whack()
    } else {
      this.swingCooldown = 0
    }

    if (this.swingT <= 0) {
      this.resetPose()
      return
    }

    this.swingT = Math.max(0, this.swingT - dt / SWING_DURATION)
    const swingProgress = 1 - this.swingT

    this.group.rotation.y = BASE_YAW
    applyMinecraftSwingRotation(swingProgress, this.swingPivot)
  }
}
