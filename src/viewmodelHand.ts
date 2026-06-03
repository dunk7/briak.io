import * as THREE from 'three'
import type { InventoryItem } from './inventory'

const DEG = Math.PI / 180
const SWING_DURATION = 0.32
const SWING_INTERVAL = 0.42
const THROW_DURATION = 0.38
export const SPEAR_THROW_COOLDOWN = 1

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
const _throwQuat = new THREE.Quaternion()
/** Capsule arm — hand sits at the distal end. */
const CAPSULE_RADIUS = 0.062
const CAPSULE_LENGTH = 0.24
const CAPSULE_CENTER_Y = -0.14
const HAND_Y = CAPSULE_CENTER_Y - CAPSULE_LENGTH / 2 - CAPSULE_RADIUS + 0.01

/** Palm mesh is 0.068×0.048×0.075 at z=0.012 — grip on top-front. */
const GRIP_MOUNT_POS = new THREE.Vector3(0, -0.006, 0.048)
const GRIP_MOUNT_ROT = new THREE.Euler(-0.14, 0.06, 0.08)

/** Point tools toward the crosshair from the lower-right hand. */
const TOOL_HELD_ROT = new THREE.Euler(0.58, -0.36, -0.16)
const SPEAR_HELD_ROT = new THREE.Euler(0.22, -0.28, -0.1)
const ITEM_HELD_ROT = new THREE.Euler(0.42, -0.2, -0.2)

const _spearTipLocal = new THREE.Vector3(0, 0, 0.46)

type HeldPose = { rotation: THREE.Euler; scale?: number }

function wrapHeldItem(content: THREE.Object3D, pose: HeldPose): THREE.Object3D {
  const root = new THREE.Group()
  root.add(content)
  root.rotation.copy(pose.rotation)
  if (pose.scale !== undefined) root.scale.setScalar(pose.scale)
  return root
}

const ITEM_COLORS: Record<InventoryItem, number> = {
  dirt: 0x76583a,
  wood: 0x5c3a22,
  stone: 0x7a7a74,
  stick: 0x8b5e34,
  sword: 0xd0d4dc,
  axe: 0x7a7a74,
  shovel: 0x9a9a92,
  pickaxe: 0x8a8580,
  spear: 0x9a9a92,
  crystal_berries: 0xa855f7,
  glowing_orb: 0xff3300,
  torch: 0xff5522,
}

function itemMaterial(color: number, opts?: { metalness?: number; roughness?: number }) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.roughness ?? 0.82,
    metalness: opts?.metalness ?? 0.04,
    flatShading: true,
    fog: false,
  })
}

function boxMesh(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

function createBlockHeldItem(item: 'dirt' | 'wood' | 'stone'): THREE.Object3D {
  const content = new THREE.Group()
  const s = 0.1
  content.add(boxMesh(s, s, s, itemMaterial(ITEM_COLORS[item]), 0, s * 0.5, 0.03))
  return wrapHeldItem(content, { rotation: ITEM_HELD_ROT })
}

function createStickHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const mat = itemMaterial(ITEM_COLORS.stick)
  content.add(boxMesh(0.032, 0.26, 0.032, mat, 0, 0.13, 0.02))
  return wrapHeldItem(content, { rotation: ITEM_HELD_ROT })
}

function createSwordHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const blade = itemMaterial(ITEM_COLORS.sword, { metalness: 0.35, roughness: 0.45 })
  const guard = itemMaterial(0x6b5038)
  const handle = itemMaterial(0x5c3a22)

  content.add(boxMesh(0.03, 0.11, 0.032, handle, 0, 0.055, 0))
  content.add(boxMesh(0.1, 0.026, 0.036, guard, 0, 0.12, 0.01))
  const bladeMesh = boxMesh(0.026, 0.24, 0.048, blade, 0, 0.25, 0.06)
  bladeMesh.rotation.x = -0.52
  content.add(bladeMesh)

  return wrapHeldItem(content, { rotation: TOOL_HELD_ROT })
}

function createAxeHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const head = itemMaterial(ITEM_COLORS.axe, { metalness: 0.12, roughness: 0.68 })
  const headDark = itemMaterial(0x686860, { metalness: 0.08, roughness: 0.72 })
  const handle = itemMaterial(0x5c3a22)

  content.add(boxMesh(0.032, 0.19, 0.032, handle, 0, 0.095, 0))
  content.add(boxMesh(0.11, 0.046, 0.04, head, 0.04, 0.21, 0.025))
  content.add(boxMesh(0.048, 0.048, 0.036, headDark, -0.03, 0.2, -0.01))

  return wrapHeldItem(content, { rotation: TOOL_HELD_ROT })
}

function createShovelHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const blade = itemMaterial(ITEM_COLORS.shovel, { metalness: 0.1, roughness: 0.65 })
  const handle = itemMaterial(0x5c3a22)

  content.add(boxMesh(0.032, 0.17, 0.032, handle, 0, 0.085, 0))
  content.add(boxMesh(0.1, 0.038, 0.05, blade, 0, 0.2, 0.02))

  return wrapHeldItem(content, { rotation: TOOL_HELD_ROT })
}

function createPickaxeHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const head = itemMaterial(ITEM_COLORS.pickaxe, { metalness: 0.2, roughness: 0.52 })
  const headDark = itemMaterial(0x686860, { metalness: 0.12, roughness: 0.62 })
  const headLight = itemMaterial(0xd0d0c8, { metalness: 0.28, roughness: 0.38 })
  const handle = itemMaterial(0x5c3a22)

  content.add(boxMesh(0.03, 0.15, 0.03, handle, 0, 0.075, 0))
  content.add(boxMesh(0.048, 0.036, 0.032, headDark, 0, 0.16, 0))

  const leftArm = boxMesh(0.032, 0.09, 0.028, head, -0.036, 0.2, 0.01)
  leftArm.rotation.z = 0.78
  content.add(leftArm)
  const leftTip = boxMesh(0.022, 0.034, 0.024, headLight, -0.068, 0.24, 0.01)
  leftTip.rotation.z = 0.78
  content.add(leftTip)

  const rightArm = boxMesh(0.032, 0.09, 0.028, head, 0.036, 0.2, 0.01)
  rightArm.rotation.z = -0.78
  content.add(rightArm)
  const rightTip = boxMesh(0.022, 0.034, 0.024, headLight, 0.068, 0.24, 0.01)
  rightTip.rotation.z = -0.78
  content.add(rightTip)

  return wrapHeldItem(content, { rotation: TOOL_HELD_ROT })
}

function createSpearHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const shaft = itemMaterial(0x5c3a22)
  const tip = itemMaterial(ITEM_COLORS.spear, { metalness: 0.12, roughness: 0.6 })

  content.add(boxMesh(0.028, 0.028, 0.36, shaft, 0, 0, 0.18))
  content.add(boxMesh(0.042, 0.042, 0.09, tip, 0, 0, 0.405))

  return wrapHeldItem(content, { rotation: SPEAR_HELD_ROT })
}

function createCrystalBerriesHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const mat = itemMaterial(ITEM_COLORS.crystal_berries, { metalness: 0.18, roughness: 0.42 })
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), mat)
  gem.rotation.z = Math.PI * 0.25
  gem.position.set(0, 0.05, 0.04)
  content.add(gem)
  return wrapHeldItem(content, { rotation: ITEM_HELD_ROT })
}

function createGlowingOrbHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const mat = itemMaterial(ITEM_COLORS.glowing_orb, { metalness: 0.05, roughness: 0.35 })
  mat.emissive = new THREE.Color(0xff2200)
  mat.emissiveIntensity = 0.85
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), mat)
  orb.position.set(0, 0.05, 0.04)
  content.add(orb)
  return wrapHeldItem(content, { rotation: ITEM_HELD_ROT })
}

function createTorchHeldItem(): THREE.Object3D {
  const content = new THREE.Group()
  const handle = itemMaterial(0x6b4428)
  content.add(boxMesh(0.03, 0.17, 0.03, handle, 0, 0.085, 0))

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff3300,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), flameMat)
  flame.position.set(0, 0.2, 0)
  content.add(flame)

  return wrapHeldItem(content, { rotation: TOOL_HELD_ROT, scale: 0.95 })
}

function createHeldItemMesh(item: InventoryItem): THREE.Object3D {
  switch (item) {
    case 'dirt':
    case 'wood':
    case 'stone':
      return createBlockHeldItem(item)
    case 'stick':
      return createStickHeldItem()
    case 'sword':
      return createSwordHeldItem()
    case 'axe':
      return createAxeHeldItem()
    case 'shovel':
      return createShovelHeldItem()
    case 'pickaxe':
      return createPickaxeHeldItem()
    case 'spear':
      return createSpearHeldItem()
    case 'crystal_berries':
      return createCrystalBerriesHeldItem()
    case 'glowing_orb':
      return createGlowingOrbHeldItem()
    case 'torch':
      return createTorchHeldItem()
  }
}

/** 0–1 strike weight for the current swing frame (peaks on impact). */
export function swingStrikeIntensity(swingProgress: number): number {
  const f1 = Math.sin(Math.sqrt(Math.min(1, Math.max(0, swingProgress))) * Math.PI)
  return f1 * f1
}

/** Overhand throw: wind back, then snap forward. */
function applyThrowRotation(throwProgress: number, target: THREE.Object3D) {
  const t = Math.min(1, Math.max(0, throwProgress))
  const wind = Math.sin(Math.min(t * 1.6, 1) * Math.PI * 0.5)
  const snap = Math.sin(Math.max(0, t - 0.18) * 1.22 * Math.PI)

  _qy.setFromAxisAngle(_AXIS_Y, wind * 28 * DEG - snap * 14 * DEG)
  _qz.setFromAxisAngle(_AXIS_Z, wind * 12 * DEG - snap * 42 * DEG)
  _qx.setFromAxisAngle(_AXIS_X, wind * 24 * DEG - snap * 95 * DEG)

  _throwQuat.copy(_qy).multiply(_qz).multiply(_qx)
  target.quaternion.copy(_throwQuat)
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
  private readonly heldItemMount = new THREE.Group()
  private readonly heldMeshes = new Map<InventoryItem, THREE.Object3D>()

  private swingT = 0
  private swingCooldown = 0
  private throwT = 0
  private heldItem: InventoryItem | null = null

  constructor(camera: THREE.PerspectiveCamera) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xd4a574,
      roughness: 0.88,
      metalness: 0,
      fog: false,
    })
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 6, 10),
      material,
    )
    capsule.position.set(0, CAPSULE_CENTER_Y, 0.02)
    capsule.rotation.x = 0.18
    capsule.castShadow = false
    capsule.receiveShadow = false

    const hand = new THREE.Group()
    hand.position.set(0, HAND_Y, 0.038)
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.048, 0.075), material)
    palm.position.set(0, 0, 0.012)
    palm.castShadow = false
    palm.receiveShadow = false
    hand.add(palm)

    this.heldItemMount.position.copy(GRIP_MOUNT_POS)
    this.heldItemMount.rotation.copy(GRIP_MOUNT_ROT)
    hand.add(this.heldItemMount)

    this.armMount.add(capsule)
    this.armMount.add(hand)
    this.armMount.position.copy(ARM_OFFSET)
    this.swingPivot.add(this.armMount)
    this.group.add(this.swingPivot)
    this.group.scale.setScalar(1.1)
    this.group.position.copy(PIVOT_POS)
    this.group.rotation.order = 'YXZ'
    camera.add(this.group)
    this.resetPose()
  }

  setHeldItem(item: InventoryItem | null) {
    if (item === this.heldItem) return
    this.heldItem = item

    for (const mesh of this.heldMeshes.values()) {
      mesh.visible = false
    }

    if (!item) return

    let mesh = this.heldMeshes.get(item)
    if (!mesh) {
      mesh = createHeldItemMesh(item)
      this.heldMeshes.set(item, mesh)
      this.heldItemMount.add(mesh)
    }
    mesh.visible = true
  }

  private resetPose() {
    this.group.position.copy(PIVOT_POS)
    this.group.rotation.set(0, BASE_YAW, 0, 'YXZ')
    this.swingPivot.quaternion.identity()
  }

  whack() {
    if (this.throwT > 0) return
    this.swingT = 1
    this.swingCooldown = SWING_INTERVAL
  }

  /** Overhand spear throw; blocks swing until finished. */
  startThrow(): boolean {
    if (this.throwT > 0) return false
    this.swingT = 0
    this.swingCooldown = SPEAR_THROW_COOLDOWN
    this.throwT = 1
    return true
  }

  isThrowing(): boolean {
    return this.throwT > 0
  }

  /** 0 at wind-up, ~0.42 at release, 1 at follow-through. */
  getThrowProgress(): number {
    if (this.throwT <= 0) return 1
    return 1 - this.throwT
  }

  /** World position at the spear tip when the throw releases. */
  getThrowSpawnPosition(out: THREE.Vector3): void {
    const spear = this.heldMeshes.get('spear')
    if (spear) {
      out.copy(_spearTipLocal)
      spear.localToWorld(out)
      return
    }
    out.copy(_spearTipLocal)
    this.heldItemMount.localToWorld(out)
  }

  /** 0–1 while swinging; strongest at the strike frame (use for dig hit reactions). */
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
      if (this.heldItem === 'spear') {
        const mesh = this.heldMeshes.get('spear')
        if (mesh) mesh.visible = throwProgress < 0.34
      }
      return
    }

    if (this.heldItem === 'spear') {
      const mesh = this.heldMeshes.get('spear')
      if (mesh) mesh.visible = true
    }

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
