import * as THREE from 'three'
import { buildPlacementNormalFromFace } from './buildBlocks'

export const TORCH_LIGHT_COLOR = 0xff6a2a
export const TORCH_LIGHT_INTENSITY = 16
export const TORCH_LIGHT_DISTANCE = 20
/**
 * Fixed PointLight count. Adding/removing lights at runtime forces Three.js to
 * recompile every MeshStandardMaterial (half-second hitch). Keep this pool in
 * the scene from day one and only move / modulate intensity.
 */
const MAX_TORCH_LIGHTS = 12
const TORCH_HEIGHT = 0.56
const TORCH_STICK_RADIUS = 0.048
const TORCH_FLAME_RADIUS = 0.07
const TORCH_INNER_FLAME_RADIUS = 0.035
const SURFACE_NUDGE = 0.05
const MIN_SPACING_SQ = 0.38 * 0.38
const LIGHT_LOCAL_Y = TORCH_HEIGHT + 0.06

const _up = new THREE.Vector3(0, 1, 0)
const _quat = new THREE.Quaternion()
const _box = new THREE.Box3()
const _flameLocal = new THREE.Vector3(0, LIGHT_LOCAL_Y, 0)
const _flameWorld = new THREE.Vector3()

export type PlacedTorch = {
  id: string
  group: THREE.Group
  /** Index into the fixed light pool, or -1 if unlit (pool exhausted / far). */
  lightIndex: number
  baseIntensity: number
}

type PooledLight = {
  light: THREE.PointLight
  torchId: string | null
}

let sharedStickGeo: THREE.BoxGeometry | null = null
let sharedFlameGeo: THREE.SphereGeometry | null = null
let sharedInnerFlameGeo: THREE.SphereGeometry | null = null
let sharedHaloGeo: THREE.SphereGeometry | null = null
let sharedStickMat: THREE.MeshStandardMaterial | null = null
let sharedFlameMat: THREE.MeshBasicMaterial | null = null
let sharedInnerFlameMat: THREE.MeshBasicMaterial | null = null
let sharedHaloMat: THREE.MeshBasicMaterial | null = null

function getSharedStickGeo() {
  return (sharedStickGeo ??= new THREE.BoxGeometry(
    TORCH_STICK_RADIUS,
    TORCH_HEIGHT,
    TORCH_STICK_RADIUS,
  ))
}

function getSharedFlameGeo() {
  return (sharedFlameGeo ??= new THREE.SphereGeometry(TORCH_FLAME_RADIUS, 10, 10))
}

function getSharedInnerFlameGeo() {
  return (sharedInnerFlameGeo ??= new THREE.SphereGeometry(TORCH_INNER_FLAME_RADIUS, 8, 8))
}

function getSharedHaloGeo() {
  return (sharedHaloGeo ??= new THREE.SphereGeometry(TORCH_FLAME_RADIUS * 2.4, 10, 10))
}

function getSharedStickMat() {
  return (sharedStickMat ??= new THREE.MeshStandardMaterial({
    color: 0x6b4428,
    roughness: 0.88,
    flatShading: true,
  }))
}

function getSharedFlameMat() {
  return (sharedFlameMat ??= new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getSharedInnerFlameMat() {
  return (sharedInnerFlameMat ??= new THREE.MeshBasicMaterial({
    color: 0xffcc88,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getSharedHaloMat() {
  return (sharedHaloMat ??= new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function createTorchVisual(opts?: { ghost?: boolean }): THREE.Group {
  const ghost = opts?.ghost ?? false
  const group = new THREE.Group()

  if (ghost) {
    const stickMat = new THREE.MeshStandardMaterial({
      color: 0x6b4428,
      roughness: 0.88,
      flatShading: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    })
    const stick = new THREE.Mesh(getSharedStickGeo(), stickMat)
    stick.position.y = TORCH_HEIGHT * 0.5
    stick.castShadow = false
    group.add(stick)

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    const flame = new THREE.Mesh(getSharedFlameGeo(), flameMat)
    flame.position.y = TORCH_HEIGHT + 0.05
    group.add(flame)

    const innerFlame = new THREE.Mesh(getSharedInnerFlameGeo(), flameMat.clone())
    ;(innerFlame.material as THREE.MeshBasicMaterial).color.setHex(0xffcc88)
    innerFlame.position.y = TORCH_HEIGHT + 0.04
    group.add(innerFlame)
    return group
  }

  const stick = new THREE.Mesh(getSharedStickGeo(), getSharedStickMat())
  stick.position.y = TORCH_HEIGHT * 0.5
  stick.castShadow = true
  group.add(stick)

  const flame = new THREE.Mesh(getSharedFlameGeo(), getSharedFlameMat())
  flame.position.y = TORCH_HEIGHT + 0.05
  group.add(flame)

  const innerFlame = new THREE.Mesh(getSharedInnerFlameGeo(), getSharedInnerFlameMat())
  innerFlame.position.y = TORCH_HEIGHT + 0.04
  group.add(innerFlame)

  const halo = new THREE.Mesh(getSharedHaloGeo(), getSharedHaloMat())
  halo.position.y = TORCH_HEIGHT + 0.05
  group.add(halo)

  return group
}

function orientGroupToNormal(group: THREE.Object3D, normal: THREE.Vector3) {
  _quat.setFromUnitVectors(_up, normal)
  group.quaternion.copy(_quat)
}

/** Player-placed torches with a fixed PointLight pool (no place-time shader hitch). */
export class PlacedTorchManager {
  readonly group = new THREE.Group()
  private readonly ghost: THREE.Group
  private readonly torches = new Map<string, PlacedTorch>()
  private readonly pool: PooledLight[] = []
  private nextId = 0
  /** Medium+ graphics — Potato/Low hide the pool so NUM_POINT_LIGHTS drops. */
  private pointLightsEnabled = true

  constructor() {
    this.ghost = createTorchVisual({ ghost: true })
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.ghost.traverse((child) => {
      child.raycast = () => {}
    })
    this.group.add(this.ghost)

    // Pre-add a fixed set of lights so place/remove never changes NUM_POINT_LIGHTS
    // while Medium+ is active. Potato/Low hide the whole pool via setPointLightsEnabled.
    for (let i = 0; i < MAX_TORCH_LIGHTS; i++) {
      const light = new THREE.PointLight(
        TORCH_LIGHT_COLOR,
        0,
        TORCH_LIGHT_DISTANCE,
        2,
      )
      light.visible = true
      light.position.set(0, -9999, 0)
      this.group.add(light)
      this.pool.push({ light, torchId: null })
    }
  }

  get count() {
    return this.torches.size
  }

  get(id: string): PlacedTorch | undefined {
    return this.torches.get(id)
  }

  all(): readonly PlacedTorch[] {
    return [...this.torches.values()]
  }

  findIdFromObject(obj: THREE.Object3D): string | null {
    let current: THREE.Object3D | null = obj
    while (current) {
      const id = current.userData.torchId as string | undefined
      if (id) return id
      current = current.parent
    }
    return null
  }

  intersectMeshes(raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
    for (const torch of this.torches.values()) {
      raycaster.intersectObject(torch.group, true, out)
    }
  }

  /** World position + axis-aligned normal for a surface hit. */
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
    outPos.copy(hit.point).addScaledVector(outNormal, SURFACE_NUDGE)
    return true
  }

  isPlacementValid(
    position: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerRadius: number,
    playerHeight: number,
  ): boolean {
    for (const torch of this.torches.values()) {
      if (torch.group.position.distanceToSquared(position) < MIN_SPACING_SQ) return false
    }

    _box.setFromCenterAndSize(position, new THREE.Vector3(0.17, TORCH_HEIGHT + 0.11, 0.17))
    return !(
      playerPos.x + playerRadius > _box.min.x &&
      playerPos.x - playerRadius < _box.max.x &&
      playerPos.y + playerHeight > _box.min.y &&
      playerPos.y < _box.max.y &&
      playerPos.z + playerRadius > _box.min.z &&
      playerPos.z - playerRadius < _box.max.z
    )
  }

  private parkLight(slot: PooledLight) {
    slot.torchId = null
    slot.light.intensity = 0
    slot.light.position.set(0, -9999, 0)
    if (!this.pointLightsEnabled) slot.light.visible = false
  }

  private bindLight(slotIndex: number, torch: PlacedTorch) {
    const slot = this.pool[slotIndex]!
    if (slot.torchId) {
      const prev = this.torches.get(slot.torchId)
      if (prev) prev.lightIndex = -1
    }
    slot.torchId = torch.id
    torch.lightIndex = slotIndex
    this.syncLightTransform(torch, slot.light)
    if (this.pointLightsEnabled) {
      slot.light.visible = true
      slot.light.intensity = torch.baseIntensity
    } else {
      slot.light.visible = false
      slot.light.intensity = 0
    }
  }

  private syncLightTransform(torch: PlacedTorch, light: THREE.PointLight) {
    torch.group.updateWorldMatrix(true, false)
    _flameWorld.copy(_flameLocal).applyMatrix4(torch.group.matrixWorld)
    light.position.copy(_flameWorld)
  }

  private acquireLight(torch: PlacedTorch): boolean {
    if (!this.pointLightsEnabled) return false
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i]!.torchId === null) {
        this.bindLight(i, torch)
        return true
      }
    }

    // Pool full: steal from the farthest lit torch relative to the new one.
    let farthestIdx = -1
    let farthestDist = -1
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i]!
      if (!slot.torchId) continue
      const other = this.torches.get(slot.torchId)
      if (!other) continue
      const d = other.group.position.distanceToSquared(torch.group.position)
      if (d > farthestDist) {
        farthestDist = d
        farthestIdx = i
      }
    }
    if (farthestIdx < 0) return false
    this.bindLight(farthestIdx, torch)
    return true
  }

  /**
   * Potato/Low: hide the fixed pool (drops NUM_POINT_LIGHTS). Medium+: restore
   * and re-bind lights to placed torches. Expect a one-time material recompile
   * when the graphics slider crosses the Medium boundary.
   */
  setPointLightsEnabled(enabled: boolean) {
    if (this.pointLightsEnabled === enabled) return
    this.pointLightsEnabled = enabled
    if (!enabled) {
      for (const torch of this.torches.values()) {
        torch.lightIndex = -1
      }
      for (const slot of this.pool) {
        this.parkLight(slot)
        slot.light.visible = false
      }
      return
    }
    for (const slot of this.pool) {
      slot.light.visible = true
      this.parkLight(slot)
    }
    for (const torch of this.torches.values()) {
      this.acquireLight(torch)
    }
  }

  place(position: THREE.Vector3, normal: THREE.Vector3): PlacedTorch | null {
    const id = `torch-${this.nextId++}`
    const group = createTorchVisual()
    group.position.copy(position)
    orientGroupToNormal(group, normal)
    group.userData.torchId = id
    group.traverse((child) => {
      if (child !== group) child.userData.torchId = id
    })

    const torch: PlacedTorch = {
      id,
      group,
      lightIndex: -1,
      baseIntensity: TORCH_LIGHT_INTENSITY,
    }
    this.torches.set(id, torch)
    this.group.add(group)
    this.acquireLight(torch)
    return torch
  }

  remove(id: string): boolean {
    const torch = this.torches.get(id)
    if (!torch) return false
    if (torch.lightIndex >= 0) {
      const slot = this.pool[torch.lightIndex]
      if (slot) this.parkLight(slot)
      torch.lightIndex = -1
    }
    this.group.remove(torch.group)
    this.torches.delete(id)
    return true
  }

  setGhost(
    position: THREE.Vector3 | null,
    normal: THREE.Vector3 | null,
    valid: boolean,
  ) {
    if (!position || !normal) {
      this.ghost.visible = false
      return
    }
    this.ghost.position.copy(position)
    orientGroupToNormal(this.ghost, normal)
    const tint = valid ? 0x88ff88 : 0xff6666
    this.ghost.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial
        if ('color' in mat) mat.color.setHex(tint)
      }
    })
    this.ghost.visible = true
  }

  /**
   * Flicker assigned lights. `exposureScale` (≈ dayPeak / currentExposure) keeps
   * torches readable when tone-mapping exposure drops at night.
   */
  update(elapsedSec: number, exposureScale = 1) {
    if (!this.pointLightsEnabled) return
    for (const torch of this.torches.values()) {
      if (torch.lightIndex < 0) continue
      const slot = this.pool[torch.lightIndex]
      if (!slot || slot.torchId !== torch.id) continue
      const flicker =
        0.88 +
        0.12 * Math.sin(elapsedSec * 9.5 + torch.group.position.x * 3.1) +
        0.06 * Math.sin(elapsedSec * 17.3 + torch.group.position.z * 2.7)
      this.syncLightTransform(torch, slot.light)
      slot.light.intensity = torch.baseIntensity * flicker * exposureScale
    }
  }
}
