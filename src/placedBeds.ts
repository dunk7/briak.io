import * as THREE from 'three'
import { buildPlacementNormalFromFace } from './buildBlocks'
import { createWoodPlankAlbedoMap } from './woodTexture'

/** Side-to-side width. */
export const BED_WIDTH = 0.95
/** Head-to-foot length — long enough for a full player to lie on. */
export const BED_DEPTH = 2.15
export const BED_HEIGHT = 0.52

const LEG_H = 0.14
const FRAME_H = 0.12
const MATTRESS_H = 0.17
/** Local Y of the mattress top surface. */
export const BED_MATTRESS_TOP_Y = LEG_H + FRAME_H + MATTRESS_H + 0.01

/** Only plant on roughly upward-facing ground. */
const MIN_UP_DOT = 0.55
const SURFACE_NUDGE = 0.02
const MIN_SPACING = 2.4
const MIN_SPACING_SQ = MIN_SPACING * MIN_SPACING

const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _wakeLocal = new THREE.Vector3()

export type PlacedBed = {
  id: string
  group: THREE.Group
  /** Collision key for CollisionWorld.buildSlots. */
  collisionKey: string
}

let sharedWoodMat: THREE.MeshStandardMaterial | null = null
let sharedDarkWoodMat: THREE.MeshStandardMaterial | null = null
let sharedMattressMat: THREE.MeshStandardMaterial | null = null
let sharedPillowMat: THREE.MeshStandardMaterial | null = null
let sharedBlanketMat: THREE.MeshStandardMaterial | null = null

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

function getMattressMat() {
  return (sharedMattressMat ??= new THREE.MeshStandardMaterial({
    color: 0x6db850,
    roughness: 0.92,
    metalness: 0,
    emissive: new THREE.Color(0x2a4820),
    emissiveIntensity: 0.22,
  }))
}

function getPillowMat() {
  return (sharedPillowMat ??= new THREE.MeshStandardMaterial({
    color: 0xb8e898,
    roughness: 0.95,
    metalness: 0,
    emissive: new THREE.Color(0x3a6030),
    emissiveIntensity: 0.18,
  }))
}

function getBlanketMat() {
  return (sharedBlanketMat ??= new THREE.MeshStandardMaterial({
    color: 0x4a8838,
    roughness: 0.9,
    metalness: 0,
    emissive: new THREE.Color(0x203818),
    emissiveIntensity: 0.2,
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

/** Procedural wood-frame bed with a long green mattress. */
function createBedVisual(opts?: { ghost?: boolean }): THREE.Group {
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
  const mattress = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0x6db850,
        roughness: 0.9,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    : getMattressMat()
  const pillow = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0xb8e898,
        roughness: 0.95,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
    : getPillowMat()
  const blanket = ghost
    ? new THREE.MeshStandardMaterial({
        color: 0x4a8838,
        roughness: 0.9,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      })
    : getBlanketMat()

  const headboardH = 0.38
  const footboardH = 0.24

  // Four legs
  const leg = 0.07
  const legInsetX = BED_WIDTH * 0.5 - leg * 0.55
  const legInsetZ = BED_DEPTH * 0.5 - leg * 0.55
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(
        group,
        leg,
        LEG_H,
        leg,
        sx * legInsetX,
        LEG_H * 0.5,
        sz * legInsetZ,
        dark,
        !ghost,
      )
    }
  }

  // Platform / frame
  const platformY = LEG_H + FRAME_H * 0.5
  addBox(group, BED_WIDTH, FRAME_H, BED_DEPTH, 0, platformY, 0, wood, !ghost)

  // Side rails
  const railT = 0.045
  const railH = 0.08
  const railY = LEG_H + FRAME_H + railH * 0.35
  addBox(
    group,
    BED_WIDTH + 0.02,
    railH,
    railT,
    0,
    railY,
    BED_DEPTH * 0.5 - railT * 0.2,
    wood,
    !ghost,
  )
  addBox(
    group,
    BED_WIDTH + 0.02,
    railH,
    railT,
    0,
    railY,
    -BED_DEPTH * 0.5 + railT * 0.2,
    wood,
    !ghost,
  )

  // Headboard (+Z) and footboard (−Z)
  const boardY = LEG_H + FRAME_H + headboardH * 0.5
  addBox(
    group,
    BED_WIDTH + 0.04,
    headboardH,
    0.055,
    0,
    boardY - 0.02,
    BED_DEPTH * 0.5 + 0.01,
    wood,
    !ghost,
  )
  addBox(
    group,
    BED_WIDTH * 0.72,
    0.04,
    0.03,
    0,
    boardY + headboardH * 0.28,
    BED_DEPTH * 0.5 + 0.03,
    dark,
    false,
  )
  addBox(
    group,
    BED_WIDTH + 0.02,
    footboardH,
    0.05,
    0,
    LEG_H + FRAME_H + footboardH * 0.45,
    -BED_DEPTH * 0.5 - 0.005,
    wood,
    !ghost,
  )

  // Green mattress
  const matY = LEG_H + FRAME_H + MATTRESS_H * 0.5 + 0.01
  addBox(
    group,
    BED_WIDTH * 0.9,
    MATTRESS_H,
    BED_DEPTH * 0.9,
    0,
    matY,
    0,
    mattress,
    !ghost,
  )

  // Blanket fold covering the lower ~55% toward the foot
  addBox(
    group,
    BED_WIDTH * 0.86,
    0.05,
    BED_DEPTH * 0.52,
    0,
    matY + MATTRESS_H * 0.42,
    -BED_DEPTH * 0.14,
    blanket,
    false,
  )

  // Pillow at the head
  addBox(
    group,
    BED_WIDTH * 0.58,
    0.09,
    0.22,
    0,
    matY + MATTRESS_H * 0.55,
    BED_DEPTH * 0.34,
    pillow,
    !ghost,
  )

  return group
}

/** Player-placed beds — sleep to skip night and set respawn. */
export class PlacedBedManager {
  readonly group = new THREE.Group()
  private readonly ghost: THREE.Group
  private readonly beds = new Map<string, PlacedBed>()
  private nextId = 0

  constructor() {
    this.ghost = createBedVisual({ ghost: true })
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.ghost.traverse((child) => {
      child.raycast = () => {}
    })
    this.group.add(this.ghost)
  }

  get count() {
    return this.beds.size
  }

  get(id: string): PlacedBed | undefined {
    return this.beds.get(id)
  }

  all(): readonly PlacedBed[] {
    return [...this.beds.values()]
  }

  findIdFromObject(obj: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = obj
    while (current) {
      const id = current.userData.bedId as string | undefined
      if (id) return id
      current = current.parent
    }
    return null
  }

  intersectMeshes(raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
    for (const bed of this.beds.values()) {
      raycaster.intersectObject(bed.group, true, out)
    }
  }

  /** Floor-only placement. Yaw faces the player (headboard toward them). */
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
    for (const bed of this.beds.values()) {
      if (bed.group.position.distanceToSquared(position) < MIN_SPACING_SQ) return false
    }

    _size.set(BED_WIDTH + 0.08, BED_HEIGHT + 0.04, BED_DEPTH + 0.08)
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

  worldBox(bed: PlacedBed, out: THREE.Box3): THREE.Box3 {
    bed.group.updateWorldMatrix(true, false)
    out.setFromObject(bed.group)
    return out
  }

  place(position: THREE.Vector3, facingYaw: number): PlacedBed {
    const id = `bed-${this.nextId++}`
    const visual = createBedVisual()
    visual.position.copy(position)
    visual.rotation.y = facingYaw
    visual.userData.bedId = id
    visual.traverse((child) => {
      if (child !== visual) child.userData.bedId = id
    })

    const bed: PlacedBed = {
      id,
      group: visual,
      collisionKey: `bed:${id}`,
    }
    this.beds.set(id, bed)
    this.group.add(visual)
    return bed
  }

  /** Yaw so the headboard faces the player. */
  facingYawFromPlayer(bedPos: THREE.Vector3, playerPos: THREE.Vector3): number {
    _forward.set(playerPos.x - bedPos.x, 0, playerPos.z - bedPos.z)
    if (_forward.lengthSq() < 1e-6) return 0
    _forward.normalize()
    return Math.atan2(_forward.x, _forward.z)
  }

  /**
   * First-person camera point while lying down — just above the mattress,
   * slightly toward the pillow so the headboard frames the view.
   */
  sleepCameraWorld(bed: PlacedBed, out: THREE.Vector3): THREE.Vector3 {
    bed.group.updateWorldMatrix(true, false)
    out.set(0, BED_MATTRESS_TOP_Y + 0.14, BED_DEPTH * 0.22)
    return bed.group.localToWorld(out)
  }

  /** Yaw while asleep: looking toward the footboard, reclined. */
  sleepLookYaw(bed: PlacedBed): number {
    return bed.group.rotation.y + Math.PI
  }

  /** Stand-up spot beside the bed (right side in bed-local space). */
  wakePosition(bed: PlacedBed, out: THREE.Vector3): THREE.Vector3 {
    bed.group.updateWorldMatrix(true, false)
    _wakeLocal.set(BED_WIDTH * 0.5 + 0.55, 0, 0)
    return bed.group.localToWorld(out.copy(_wakeLocal))
  }

  remove(id: string): PlacedBed | null {
    const bed = this.beds.get(id)
    if (!bed) return null
    this.group.remove(bed.group)
    this.beds.delete(id)
    return bed
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
