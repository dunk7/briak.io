import * as THREE from 'three'
import { buildPlacementNormalFromFace } from './buildBlocks'
import type { InventoryItem } from './inventory'
import { createWoodPlankAlbedoMap } from './woodTexture'
import { createGoldAlbedoMap, GOLD_MID } from './goldTexture'

/** Footprint width — roughly a meter wide as requested. */
export const CHEST_WIDTH = 1.0
export const CHEST_DEPTH = 0.62
export const CHEST_HEIGHT = 0.68
export const CHEST_SLOT_COUNT = 27

/** Only plant on roughly upward-facing ground. */
const MIN_UP_DOT = 0.55
const SURFACE_NUDGE = 0.02
const MIN_SPACING = 1.15
const MIN_SPACING_SQ = MIN_SPACING * MIN_SPACING

/** Lid swings open ~115° around the back hinge. */
const LID_OPEN_ANGLE = THREE.MathUtils.degToRad(115)
const LID_OPEN_DURATION = 0.38
const LID_CLOSE_DURATION = 0.32

const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _look = new THREE.Vector3()

export type ChestStack = { item: InventoryItem; count: number; durability?: number }

export type PlacedChest = {
  id: string
  group: THREE.Group
  lid: THREE.Group
  /** 0 = shut, 1 = fully open. */
  lidAmount: number
  lidTarget: number
  /** Collision key for CollisionWorld.buildSlots. */
  collisionKey: string
  slots: (ChestStack | null)[]
}

let sharedWoodMat: THREE.MeshStandardMaterial | null = null
let sharedGoldMat: THREE.MeshStandardMaterial | null = null
let sharedDarkWoodMat: THREE.MeshStandardMaterial | null = null

/** Warm plank wood — white tint so the albedo map isn't crushed darker. */
function getWoodMat() {
  if (sharedWoodMat) return sharedWoodMat
  const map = createWoodPlankAlbedoMap(128)
  map.colorSpace = THREE.SRGBColorSpace
  sharedWoodMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    roughness: 0.78,
    metalness: 0,
    // Soft fill so shaded faces stay readable (same idea as terrain mats).
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

/**
 * Bright gold trim. Keep metalness moderate — without an envMap, high metalness
 * reads nearly black. Lean on warm albedo + emissive so rims stay golden in-game.
 */
function getGoldMat() {
  if (sharedGoldMat) return sharedGoldMat
  const map = createGoldAlbedoMap(64)
  map.colorSpace = THREE.SRGBColorSpace
  sharedGoldMat = new THREE.MeshStandardMaterial({
    color: 0xffe08a,
    map,
    roughness: 0.28,
    metalness: 0.45,
    emissive: new THREE.Color(GOLD_MID),
    emissiveIntensity: 0.45,
  })
  return sharedGoldMat
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

/** Ease-out with a soft overshoot so the lid feels weighty. */
function easeOutBack(t: number): number {
  const c1 = 1.55
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/** Ease-in cubic — lid settles shut with a little snap. */
function easeInCubic(t: number): number {
  return t * t * t
}

type ChestVisual = {
  group: THREE.Group
  lid: THREE.Group
}

/** Procedural wooden chest with a hinged lid and bold gold rims (~1 m wide). */
function createChestVisual(opts?: { ghost?: boolean }): ChestVisual {
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
  const gold = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0xffd060,
        roughness: 0.3,
        metalness: 0.4,
        emissive: new THREE.Color(0xd4a82a),
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    : getGoldMat()

  const bodyH = CHEST_HEIGHT * 0.56
  const lidH = CHEST_HEIGHT * 0.34
  const gap = 0.014
  const bodyY = bodyH * 0.5
  const lidY = bodyH + gap + lidH * 0.5
  const lidW = CHEST_WIDTH + 0.06
  const lidD = CHEST_DEPTH + 0.06

  // --- Body (stays put) ---
  addBox(group, CHEST_WIDTH, bodyH, CHEST_DEPTH, 0, bodyY, 0, wood, !ghost)

  // Dark seam under the lid so wood/gold layers read apart
  addBox(
    group,
    CHEST_WIDTH * 0.94,
    0.03,
    CHEST_DEPTH * 0.9,
    0,
    bodyH + gap * 0.35,
    0,
    dark,
    false,
  )

  // Thick gold hoop bands wrapping the body
  const bandT = 0.07
  const bandOut = 0.028
  const bandY1 = bodyH * 0.22
  const bandY2 = bodyH * 0.78
  for (const by of [bandY1, bandY2]) {
    addBox(group, CHEST_WIDTH + bandOut * 2, bandT, bandOut, 0, by, CHEST_DEPTH * 0.5 + bandOut * 0.5, gold, !ghost)
    addBox(group, CHEST_WIDTH + bandOut * 2, bandT, bandOut, 0, by, -CHEST_DEPTH * 0.5 - bandOut * 0.5, gold, !ghost)
    addBox(group, bandOut, bandT, CHEST_DEPTH + bandOut * 2, CHEST_WIDTH * 0.5 + bandOut * 0.5, by, 0, gold, !ghost)
    addBox(group, bandOut, bandT, CHEST_DEPTH + bandOut * 2, -CHEST_WIDTH * 0.5 - bandOut * 0.5, by, 0, gold, !ghost)
  }

  // Vertical gold corner posts on the body only
  const post = 0.055
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(
        group,
        post,
        bodyH * 0.96,
        post,
        sx * (CHEST_WIDTH * 0.5 - post * 0.15),
        bodyH * 0.48,
        sz * (CHEST_DEPTH * 0.5 - post * 0.15),
        gold,
        !ghost,
      )
    }
  }

  // Latch plate stays on the body so it reads as the lock the lid lifts off of
  const latchY = bodyH + gap * 0.5
  const frontZ = CHEST_DEPTH * 0.5
  addBox(group, 0.2, 0.1, 0.05, 0, latchY - 0.02, frontZ + 0.035, gold, !ghost)
  addBox(group, 0.045, 0.045, 0.04, 0, latchY - 0.02, frontZ + 0.1, dark, false)

  // --- Lid (hinged at the back top edge) ---
  const hingeY = bodyH + gap * 0.5
  const hingeZ = -CHEST_DEPTH * 0.5
  const lid = new THREE.Group()
  lid.position.set(0, hingeY, hingeZ)
  group.add(lid)

  // Lid meshes are authored in chest space; offset into hinge-local space.
  const lidLocal = new THREE.Group()
  lidLocal.position.set(0, -hingeY, -hingeZ)
  lid.add(lidLocal)

  addBox(lidLocal, lidW, lidH, lidD, 0, lidY, 0, wood, !ghost)

  // Gold rim around the lid edge
  const rimT = 0.045
  const rimOut = 0.022
  const rimY = lidY - lidH * 0.28
  addBox(lidLocal, lidW + rimOut * 2, rimT, rimOut, 0, rimY, lidD * 0.5 + rimOut * 0.5, gold, !ghost)
  addBox(lidLocal, lidW + rimOut * 2, rimT, rimOut, 0, rimY, -lidD * 0.5 - rimOut * 0.5, gold, !ghost)
  addBox(lidLocal, rimOut, rimT, lidD + rimOut * 2, lidW * 0.5 + rimOut * 0.5, rimY, 0, gold, !ghost)
  addBox(lidLocal, rimOut, rimT, lidD + rimOut * 2, -lidW * 0.5 - rimOut * 0.5, rimY, 0, gold, !ghost)

  // Top lid gold frame / crown
  const crownY = lidY + lidH * 0.5 - 0.012
  addBox(lidLocal, lidW * 0.88, 0.028, lidD * 0.72, 0, crownY, 0, gold, false)
  addBox(lidLocal, lidW * 0.55, 0.02, lidD * 0.4, 0, crownY + 0.012, 0, dark, false)

  // Clasp on the lid front — lifts with the lid
  addBox(lidLocal, 0.1, 0.1, 0.06, 0, latchY + 0.04, frontZ + 0.06, gold, !ghost)

  return { group, lid }
}

function emptySlots(): (ChestStack | null)[] {
  return Array.from({ length: CHEST_SLOT_COUNT }, () => null)
}

function applyLidPose(chest: PlacedChest) {
  const t =
    chest.lidTarget >= chest.lidAmount
      ? easeOutBack(THREE.MathUtils.clamp(chest.lidAmount, 0, 1))
      : easeInCubic(THREE.MathUtils.clamp(chest.lidAmount, 0, 1))
  // Negative X swings the front of the lid up and back (front is +Z).
  chest.lid.rotation.x = -LID_OPEN_ANGLE * Math.min(t, 1.08)
}

/** Player-placed storage chests with per-chest inventory slots. */
export class PlacedChestManager {
  readonly group = new THREE.Group()
  private readonly ghost: THREE.Group
  private readonly chests = new Map<string, PlacedChest>()
  private nextId = 0
  private openChestId: string | null = null

  constructor() {
    const visual = createChestVisual({ ghost: true })
    this.ghost = visual.group
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.ghost.traverse((child) => {
      child.raycast = () => {}
    })
    this.group.add(this.ghost)
  }

  get count() {
    return this.chests.size
  }

  get(id: string): PlacedChest | undefined {
    return this.chests.get(id)
  }

  all(): readonly PlacedChest[] {
    return [...this.chests.values()]
  }

  findIdFromObject(obj: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = obj
    while (current) {
      const id = current.userData.chestId as string | undefined
      if (id) return id
      current = current.parent
    }
    return null
  }

  intersectMeshes(raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
    for (const chest of this.chests.values()) {
      raycaster.intersectObject(chest.group, true, out)
    }
  }

  /** Floor-only placement. Yaw faces the player (looking at the front latch). */
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
    for (const chest of this.chests.values()) {
      if (chest.group.position.distanceToSquared(position) < MIN_SPACING_SQ) return false
    }

    _size.set(CHEST_WIDTH + 0.08, CHEST_HEIGHT + 0.04, CHEST_DEPTH + 0.08)
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

  worldBox(chest: PlacedChest, out: THREE.Box3): THREE.Box3 {
    chest.group.updateWorldMatrix(true, false)
    out.setFromObject(chest.group)
    return out
  }

  place(position: THREE.Vector3, facingYaw: number): PlacedChest {
    const id = `chest-${this.nextId++}`
    const visual = createChestVisual()
    visual.group.position.copy(position)
    visual.group.rotation.y = facingYaw
    visual.group.userData.chestId = id
    visual.group.traverse((child) => {
      if (child !== visual.group) child.userData.chestId = id
    })

    const chest: PlacedChest = {
      id,
      group: visual.group,
      lid: visual.lid,
      lidAmount: 0,
      lidTarget: 0,
      collisionKey: `chest:${id}`,
      slots: emptySlots(),
    }
    applyLidPose(chest)
    this.chests.set(id, chest)
    this.group.add(visual.group)
    return chest
  }

  /** Yaw so the latch faces the player (or camera look on XZ). */
  facingYawFromPlayer(chestPos: THREE.Vector3, playerPos: THREE.Vector3): number {
    _forward.set(playerPos.x - chestPos.x, 0, playerPos.z - chestPos.z)
    if (_forward.lengthSq() < 1e-6) return 0
    _forward.normalize()
    // Model front is +Z; atan2(x,z) gives yaw that aims +Z toward the player.
    return Math.atan2(_forward.x, _forward.z)
  }

  facingYawFromLook(lookDir: THREE.Vector3): number {
    _look.set(lookDir.x, 0, lookDir.z)
    if (_look.lengthSq() < 1e-6) return 0
    _look.normalize()
    // Face opposite to look so the front faces the placer.
    return Math.atan2(-_look.x, -_look.z)
  }

  /**
   * Drive lid open/close from the currently open container id.
   * Inventory UI stays instant; this only animates the 3D lid.
   */
  syncOpenId(openId: string | null) {
    if (this.openChestId === openId) return
    if (this.openChestId) {
      const prev = this.chests.get(this.openChestId)
      if (prev) prev.lidTarget = 0
    }
    this.openChestId = openId
    if (openId) {
      const next = this.chests.get(openId)
      if (next) next.lidTarget = 1
    }
  }

  /** Advance lid animations. Call every frame. */
  update(dt: number) {
    for (const chest of this.chests.values()) {
      if (Math.abs(chest.lidAmount - chest.lidTarget) < 1e-4) {
        if (chest.lidAmount !== chest.lidTarget) {
          chest.lidAmount = chest.lidTarget
          applyLidPose(chest)
        }
        continue
      }
      const dur = chest.lidTarget > chest.lidAmount ? LID_OPEN_DURATION : LID_CLOSE_DURATION
      const step = dt / Math.max(dur, 1e-4)
      if (chest.lidAmount < chest.lidTarget) {
        chest.lidAmount = Math.min(chest.lidTarget, chest.lidAmount + step)
      } else {
        chest.lidAmount = Math.max(chest.lidTarget, chest.lidAmount - step)
      }
      applyLidPose(chest)
    }
  }

  remove(id: string): PlacedChest | null {
    const chest = this.chests.get(id)
    if (!chest) return null
    if (this.openChestId === id) this.openChestId = null
    this.group.remove(chest.group)
    this.chests.delete(id)
    return chest
  }

  takeAllStacks(chest: PlacedChest): ChestStack[] {
    const out: ChestStack[] = []
    for (let i = 0; i < chest.slots.length; i++) {
      const slot = chest.slots[i]
      if (!slot) continue
      out.push(
        slot.durability !== undefined
          ? { item: slot.item, count: slot.count, durability: slot.durability }
          : { item: slot.item, count: slot.count },
      )
      chest.slots[i] = null
    }
    return out
  }

  setGhost(
    position: THREE.Vector3 | null,
    yaw: number | null,
    valid: boolean,
  ) {
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
}
