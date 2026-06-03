import * as THREE from 'three'
import { buildPlacementNormalFromFace } from './buildBlocks'

export const TORCH_LIGHT_COLOR = 0xff5522
export const TORCH_LIGHT_INTENSITY = 6.2
export const TORCH_LIGHT_DISTANCE = 10
const TORCH_HEIGHT = 0.56
const TORCH_STICK_RADIUS = 0.048
const TORCH_FLAME_RADIUS = 0.07
const TORCH_INNER_FLAME_RADIUS = 0.035
const SURFACE_NUDGE = 0.05
const MIN_SPACING_SQ = 0.38 * 0.38

const _up = new THREE.Vector3(0, 1, 0)
const _quat = new THREE.Quaternion()
const _box = new THREE.Box3()

export type PlacedTorch = {
  id: string
  group: THREE.Group
  light: THREE.PointLight
  baseIntensity: number
}

function createTorchVisual(opts?: { ghost?: boolean }): THREE.Group {
  const ghost = opts?.ghost ?? false
  const group = new THREE.Group()

  const stickMat = new THREE.MeshStandardMaterial({
    color: 0x6b4428,
    roughness: 0.88,
    flatShading: true,
    transparent: ghost,
    opacity: ghost ? 0.45 : 1,
    depthWrite: !ghost,
  })
  const stick = new THREE.Mesh(
    new THREE.BoxGeometry(TORCH_STICK_RADIUS, TORCH_HEIGHT, TORCH_STICK_RADIUS),
    stickMat,
  )
  stick.position.y = TORCH_HEIGHT * 0.5
  stick.castShadow = !ghost
  group.add(stick)

  const flameMat = new THREE.MeshBasicMaterial({
    color: 0xff3300,
    transparent: true,
    opacity: ghost ? 0.55 : 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const flame = new THREE.Mesh(new THREE.SphereGeometry(TORCH_FLAME_RADIUS, 10, 10), flameMat)
  flame.position.y = TORCH_HEIGHT + 0.05
  group.add(flame)

  const innerFlame = new THREE.Mesh(new THREE.SphereGeometry(TORCH_INNER_FLAME_RADIUS, 8, 8), flameMat.clone())
  innerFlame.material = (innerFlame.material as THREE.MeshBasicMaterial).clone()
  ;(innerFlame.material as THREE.MeshBasicMaterial).color.setHex(0xffaa66)
  innerFlame.position.y = TORCH_HEIGHT + 0.04
  group.add(innerFlame)

  if (!ghost) {
    const light = new THREE.PointLight(
      TORCH_LIGHT_COLOR,
      TORCH_LIGHT_INTENSITY,
      TORCH_LIGHT_DISTANCE,
      1,
    )
    light.position.set(0, TORCH_HEIGHT + 0.06, 0)
    group.add(light)
    group.userData.torchLight = light
  }

  return group
}

function orientGroupToNormal(group: THREE.Object3D, normal: THREE.Vector3) {
  _quat.setFromUnitVectors(_up, normal)
  group.quaternion.copy(_quat)
}

/** Instanced player-placed torches with warm point lights. */
export class PlacedTorchManager {
  readonly group = new THREE.Group()
  private readonly ghost: THREE.Group
  private readonly torches = new Map<string, PlacedTorch>()
  private nextId = 0

  constructor() {
    this.ghost = createTorchVisual({ ghost: true })
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.ghost.traverse((child) => {
      child.raycast = () => {}
    })
    this.group.add(this.ghost)
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

  place(position: THREE.Vector3, normal: THREE.Vector3): PlacedTorch | null {
    const id = `torch-${this.nextId++}`
    const group = createTorchVisual()
    group.position.copy(position)
    orientGroupToNormal(group, normal)
    group.userData.torchId = id
    group.traverse((child) => {
      if (child !== group) child.userData.torchId = id
    })

    const light = group.userData.torchLight as THREE.PointLight
    const torch: PlacedTorch = {
      id,
      group,
      light,
      baseIntensity: TORCH_LIGHT_INTENSITY,
    }
    this.torches.set(id, torch)
    this.group.add(group)
    return torch
  }

  remove(id: string): boolean {
    const torch = this.torches.get(id)
    if (!torch) return false
    this.group.remove(torch.group)
    torch.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) mat.dispose()
      }
    })
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

  update(elapsedSec: number) {
    for (const torch of this.torches.values()) {
      const flicker =
        0.88 +
        0.12 * Math.sin(elapsedSec * 9.5 + torch.group.position.x * 3.1) +
        0.06 * Math.sin(elapsedSec * 17.3 + torch.group.position.z * 2.7)
      torch.light.intensity = torch.baseIntensity * flicker
    }
  }
}
