import * as THREE from 'three'

/** Player-placed build cubes are 2.5 m on a side, snapped to their own grid. */
export const BUILD_BLOCK_SIZE = 2.5

/** Box with +Y top face in material group 1; other faces in group 0. */
export function createGrassTopDirtBoxGeometry(size: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(size, size, size)
  geo.clearGroups()
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (6 indices per face).
  const face = 6
  geo.addGroup(0, face * 2, 0)
  geo.addGroup(face * 2, face, 1)
  geo.addGroup(face * 3, face * 3, 0)
  return geo
}

export type BuildBlockType = 'dirt' | 'wood' | 'stone' | 'iron' | 'gold' | 'diamond'

export const BUILD_BLOCK_TYPES: readonly BuildBlockType[] = [
  'dirt',
  'wood',
  'stone',
  'iron',
  'gold',
  'diamond',
]

/** How long placed blocks persist before despawning. */
export const BUILD_BLOCK_LIFETIME_MS: Record<BuildBlockType, number> = {
  dirt: 30 * 60 * 1000,
  wood: 12 * 60 * 60 * 1000,
  stone: 48 * 60 * 60 * 1000,
  iron: 72 * 60 * 60 * 1000,
  gold: 96 * 60 * 60 * 1000,
  diamond: 120 * 60 * 60 * 1000,
}

/** Base seconds to mine a placed block at 1.0× dig speed (wood 2× dirt, stone 4× dirt). */
export const BUILD_BLOCK_DIG_TIME_BASE: Record<BuildBlockType, number> = {
  dirt: 1.1,
  wood: 2.2,
  stone: 4.4,
  iron: 6.0,
  gold: 7.0,
  diamond: 9.0,
}

const GHOST_COLORS: Record<BuildBlockType, { valid: number; invalid: number }> = {
  dirt: { valid: 0x9ad16a, invalid: 0xd1564a },
  wood: { valid: 0xc4a574, invalid: 0xd1564a },
  stone: { valid: 0xa8b0b8, invalid: 0xd1564a },
  iron: { valid: 0xd0ccc4, invalid: 0xd1564a },
  gold: { valid: 0xe8c84a, invalid: 0xd1564a },
  diamond: { valid: 0x5aeee4, invalid: 0xd1564a },
}

export type BuildCell = {
  gx: number
  gy: number
  gz: number
  key: string
  type: BuildBlockType
  placedAt: number
}

const _p = new THREE.Vector3()
const _matrix = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _scale = new THREE.Vector3(1, 1, 1)
const _center = new THREE.Vector3()

export function buildCellKey(gx: number, gy: number, gz: number) {
  return `${gx},${gy},${gz}`
}

/** Nudge past the hit face so floor() lands in the adjacent empty cell, not on a seam. */
const PLACEMENT_FACE_NUDGE = 0.02

const _snappedNormal = new THREE.Vector3()

/**
 * Snap a mesh face normal to ±X / ±Y / ±Z so placement stays on the 2.5 m grid
 * (sloped terrain triangles often return diagonal normals).
 */
export function snapBuildFaceNormal(
  normal: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ax = Math.abs(normal.x)
  const ay = Math.abs(normal.y)
  const az = Math.abs(normal.z)
  if (ax >= ay && ax >= az) {
    out.set(Math.sign(normal.x) || 1, 0, 0)
  } else if (ay >= ax && ay >= az) {
    out.set(0, Math.sign(normal.y) || 1, 0)
  } else {
    out.set(0, 0, Math.sign(normal.z) || 1)
  }
  return out
}

/** Grid cell one step outward from an existing block along an axis-aligned face normal. */
export function buildCellAdjacent(
  cell: Pick<BuildCell, 'gx' | 'gy' | 'gz'>,
  axisNormal: THREE.Vector3,
  out: BuildCell,
  type: BuildBlockType,
): BuildCell {
  out.gx = cell.gx + Math.round(axisNormal.x)
  out.gy = cell.gy + Math.round(axisNormal.y)
  out.gz = cell.gz + Math.round(axisNormal.z)
  out.key = buildCellKey(out.gx, out.gy, out.gz)
  out.type = type
  out.placedAt = 0
  return out
}

/**
 * Grid cell to occupy when placing against a surface hit: nudge the hit point a
 * half-block along the snapped face normal so we land in the neighbouring (empty) cell.
 */
export function buildCellFromPoint(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  type: BuildBlockType,
  out: BuildCell,
): BuildCell {
  snapBuildFaceNormal(normal, _snappedNormal)
  _p
    .copy(point)
    .addScaledVector(_snappedNormal, BUILD_BLOCK_SIZE * 0.5 + PLACEMENT_FACE_NUDGE)
  out.gx = Math.floor(_p.x / BUILD_BLOCK_SIZE)
  out.gy = Math.floor(_p.y / BUILD_BLOCK_SIZE)
  out.gz = Math.floor(_p.z / BUILD_BLOCK_SIZE)
  out.key = buildCellKey(out.gx, out.gy, out.gz)
  out.type = type
  out.placedAt = 0
  return out
}

export function buildCellWorldCenter(cell: Pick<BuildCell, 'gx' | 'gy' | 'gz'>, out: THREE.Vector3) {
  return out.set(
    (cell.gx + 0.5) * BUILD_BLOCK_SIZE,
    (cell.gy + 0.5) * BUILD_BLOCK_SIZE,
    (cell.gz + 0.5) * BUILD_BLOCK_SIZE,
  )
}

/** World-space face normal pointing into empty space (toward the camera side of the surface). */
export function buildPlacementNormalFromFace(
  faceNormal: THREE.Vector3,
  objectMatrixWorld: THREE.Matrix4,
  rayDirection: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  out.copy(faceNormal).transformDirection(objectMatrixWorld).normalize()
  if (out.dot(rayDirection) > 0) out.negate()
  return snapBuildFaceNormal(out, out)
}

/**
 * Outward placement axis for a struck build block: hit point relative to the cell
 * center (robust on edges) with a face-normal fallback.
 */
export function buildPlacementNormalAgainstBlock(
  hitPoint: THREE.Vector3,
  cell: Pick<BuildCell, 'gx' | 'gy' | 'gz'>,
  faceNormal: THREE.Vector3,
  objectMatrixWorld: THREE.Matrix4,
  rayDirection: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 {
  buildCellWorldCenter(cell, _center)
  out.subVectors(hitPoint, _center)
  if (out.lengthSq() >= 1e-8) return snapBuildFaceNormal(out, out)
  return buildPlacementNormalFromFace(faceNormal, objectMatrixWorld, rayDirection, out)
}

/** Fraction of a build block: hits closer than this to a side count as "on the edge". */
const SNEAK_BRIDGE_EDGE_FRAC = 0.28

/**
 * Minecraft-style sneak bridging: when aiming at a top face near an edge, return
 * the outward ±X/±Z axis to place against instead of stacking on top of yourself.
 * Returns null when the hit is not a brink top-face placement.
 */
export function sneakBridgeOutwardNormal(
  hitPoint: THREE.Vector3,
  placementNormal: THREE.Vector3,
  lookDir: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 | null {
  if (placementNormal.y < 0.5) return null

  const gx = Math.floor(hitPoint.x / BUILD_BLOCK_SIZE)
  const gz = Math.floor(hitPoint.z / BUILD_BLOCK_SIZE)
  const minX = gx * BUILD_BLOCK_SIZE
  const maxX = minX + BUILD_BLOCK_SIZE
  const minZ = gz * BUILD_BLOCK_SIZE
  const maxZ = minZ + BUILD_BLOCK_SIZE
  const edgeLimit = BUILD_BLOCK_SIZE * SNEAK_BRIDGE_EDGE_FRAC

  const toMinX = hitPoint.x - minX
  const toMaxX = maxX - hitPoint.x
  const toMinZ = hitPoint.z - minZ
  const toMaxZ = maxZ - hitPoint.z
  const nearMinX = toMinX <= edgeLimit
  const nearMaxX = toMaxX <= edgeLimit
  const nearMinZ = toMinZ <= edgeLimit
  const nearMaxZ = toMaxZ <= edgeLimit
  if (!nearMinX && !nearMaxX && !nearMinZ && !nearMaxZ) return null

  const ax = Math.abs(lookDir.x)
  const az = Math.abs(lookDir.z)
  if (ax >= az && ax > 1e-4) {
    if (lookDir.x > 0 && nearMaxX) return out.set(1, 0, 0)
    if (lookDir.x < 0 && nearMinX) return out.set(-1, 0, 0)
  }
  if (az > 1e-4) {
    if (lookDir.z > 0 && nearMaxZ) return out.set(0, 0, 1)
    if (lookDir.z < 0 && nearMinZ) return out.set(0, 0, -1)
  }

  const nearest = Math.min(
    nearMinX ? toMinX : Infinity,
    nearMaxX ? toMaxX : Infinity,
    nearMinZ ? toMinZ : Infinity,
    nearMaxZ ? toMaxZ : Infinity,
  )
  if (nearest === toMinX) return out.set(-1, 0, 0)
  if (nearest === toMaxX) return out.set(1, 0, 0)
  if (nearest === toMinZ) return out.set(0, 0, -1)
  return out.set(0, 0, 1)
}

/**
 * Support cell under a top-face hit (nudge below the surface so floor() stays in
 * the stood-on cell even when the hit lands exactly on a grid seam).
 */
export function supportCellFromTopHit(
  hitPoint: THREE.Vector3,
  out: Pick<BuildCell, 'gx' | 'gy' | 'gz'>,
): Pick<BuildCell, 'gx' | 'gy' | 'gz'> {
  _p.copy(hitPoint)
  _p.y -= PLACEMENT_FACE_NUDGE
  out.gx = Math.floor(_p.x / BUILD_BLOCK_SIZE)
  out.gy = Math.floor(_p.y / BUILD_BLOCK_SIZE)
  out.gz = Math.floor(_p.z / BUILD_BLOCK_SIZE)
  return out
}

function cellCenter(cell: Pick<BuildCell, 'gx' | 'gy' | 'gz'>, out: THREE.Vector3) {
  return buildCellWorldCenter(cell, out)
}

type TypeLayer = {
  mesh: THREE.InstancedMesh
  order: string[]
  indexByKey: Map<string, number>
  capacity: number
}

/** Instanced cubes for player-placed dirt/wood/stone blocks, with a placement ghost. */
export class BlockBuilder {
  readonly group = new THREE.Group()
  readonly ghost = new THREE.Group()
  readonly materials: Record<BuildBlockType, THREE.Material>
  readonly grassTopMaterial: THREE.Material | null

  private readonly plainGeometry: THREE.BoxGeometry
  private readonly dirtGeometry: THREE.BoxGeometry
  private readonly ghostBox: THREE.Mesh
  private readonly layers = new Map<BuildBlockType, TypeLayer>()
  private readonly cellByKey = new Map<string, BuildCell>()

  constructor(
    materials: Record<BuildBlockType, THREE.Material>,
    grassTopMaterial: THREE.Material | null = null,
    capacity = 4096,
  ) {
    this.materials = materials
    this.grassTopMaterial = grassTopMaterial
    this.plainGeometry = new THREE.BoxGeometry(
      BUILD_BLOCK_SIZE,
      BUILD_BLOCK_SIZE,
      BUILD_BLOCK_SIZE,
    )
    this.dirtGeometry = grassTopMaterial
      ? createGrassTopDirtBoxGeometry(BUILD_BLOCK_SIZE)
      : this.plainGeometry
    for (const type of BUILD_BLOCK_TYPES) {
      const geometry = type === 'dirt' ? this.dirtGeometry : this.plainGeometry
      const material =
        type === 'dirt' && grassTopMaterial
          ? [materials.dirt, grassTopMaterial]
          : materials[type]
      const mesh = this.createMesh(material, geometry, capacity)
      this.layers.set(type, {
        mesh,
        order: [],
        indexByKey: new Map(),
        capacity,
      })
      this.group.add(mesh)
    }

    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x9ad16a,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    this.ghostBox = new THREE.Mesh(this.plainGeometry, ghostMat)
    this.ghostBox.raycast = () => {}
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.plainGeometry),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 }),
    )
    edges.raycast = () => {}
    this.ghost.add(this.ghostBox)
    this.ghost.add(edges)
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.group.add(this.ghost)
  }

  private createMesh(
    material: THREE.Material | THREE.Material[],
    geometry: THREE.BufferGeometry,
    capacity: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity)
    mesh.count = 0
    mesh.castShadow = false
    mesh.receiveShadow = false
    // Bounding sphere is refreshed on place/remove — safe to frustum-cull.
    mesh.frustumCulled = true
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    return mesh
  }

  get count() {
    return this.cellByKey.size
  }

  isBlockMesh(object: THREE.Object3D): boolean {
    for (const layer of this.layers.values()) {
      if (object === layer.mesh) return true
    }
    return false
  }

  has(key: string) {
    return this.cellByKey.has(key)
  }

  getCell(key: string): BuildCell | undefined {
    return this.cellByKey.get(key)
  }

  instanceCellKey(mesh: THREE.InstancedMesh, instanceId: number): string | undefined {
    for (const layer of this.layers.values()) {
      if (layer.mesh !== mesh) continue
      return layer.order[instanceId]
    }
    return undefined
  }

  place(cell: BuildCell): boolean {
    if (this.cellByKey.has(cell.key)) return false
    const layer = this.layers.get(cell.type)
    if (!layer) return false
    if (layer.order.length >= layer.capacity) this.grow(layer)

    const index = layer.order.length
    const stored: BuildCell = {
      gx: cell.gx,
      gy: cell.gy,
      gz: cell.gz,
      key: cell.key,
      type: cell.type,
      placedAt: cell.placedAt || performance.now(),
    }
    layer.order.push(cell.key)
    layer.indexByKey.set(cell.key, index)
    this.cellByKey.set(cell.key, stored)

    cellCenter(stored, _center)
    _matrix.compose(_center, _quat, _scale)
    layer.mesh.setMatrixAt(index, _matrix)
    layer.mesh.count = layer.order.length
    layer.mesh.instanceMatrix.needsUpdate = true
    this.refreshRaycastBounds(layer)
    return true
  }

  /** Swap-remove the block so the instance buffer stays dense. */
  removeAt(key: string): BuildCell | null {
    const cell = this.cellByKey.get(key)
    if (!cell) return null
    const layer = this.layers.get(cell.type)
    if (!layer) return null

    const index = layer.indexByKey.get(key)
    if (index === undefined) return null

    const last = layer.order.length - 1
    if (index !== last) {
      const lastKey = layer.order[last]!
      layer.mesh.getMatrixAt(last, _matrix)
      layer.mesh.setMatrixAt(index, _matrix)
      layer.order[index] = lastKey
      layer.indexByKey.set(lastKey, index)
    }
    layer.order.pop()
    layer.indexByKey.delete(key)
    this.cellByKey.delete(key)
    layer.mesh.count = layer.order.length
    layer.mesh.instanceMatrix.needsUpdate = true
    this.refreshRaycastBounds(layer)
    return cell
  }

  /** Remove blocks whose lifetime has elapsed. */
  expireBefore(nowMs: number): BuildCell[] {
    const expired: BuildCell[] = []
    for (const cell of this.cellByKey.values()) {
      const lifetime = BUILD_BLOCK_LIFETIME_MS[cell.type]
      if (nowMs - cell.placedAt >= lifetime) {
        const removed = this.removeAt(cell.key)
        if (removed) expired.push(removed)
      }
    }
    return expired
  }

  worldBox(cell: BuildCell, out: THREE.Box3): THREE.Box3 {
    out.min.set(
      cell.gx * BUILD_BLOCK_SIZE,
      cell.gy * BUILD_BLOCK_SIZE,
      cell.gz * BUILD_BLOCK_SIZE,
    )
    out.max.set(
      (cell.gx + 1) * BUILD_BLOCK_SIZE,
      (cell.gy + 1) * BUILD_BLOCK_SIZE,
      (cell.gz + 1) * BUILD_BLOCK_SIZE,
    )
    return out
  }

  worldBoxByKey(key: string, out: THREE.Box3): THREE.Box3 | null {
    const cell = this.cellByKey.get(key)
    if (!cell) return null
    return this.worldBox(cell, out)
  }

  setGhost(cell: BuildCell | null, valid = true, type: BuildBlockType = 'dirt') {
    if (!cell) {
      this.ghost.visible = false
      return
    }
    cellCenter(cell, _center)
    this.ghost.position.copy(_center)
    const colors = GHOST_COLORS[type]
    ;(this.ghostBox.material as THREE.MeshBasicMaterial).color.setHex(
      valid ? colors.valid : colors.invalid,
    )
    this.ghost.visible = true
  }

  intersectMeshes(raycaster: THREE.Raycaster, out: THREE.Intersection[]) {
    for (const layer of this.layers.values()) {
      if (layer.mesh.count === 0) continue
      raycaster.intersectObject(layer.mesh, false, out)
    }
  }

  private refreshRaycastBounds(layer: TypeLayer) {
    if (layer.order.length === 0) {
      layer.mesh.boundingSphere = null
      return
    }
    layer.mesh.computeBoundingSphere()
  }

  private grow(layer: TypeLayer) {
    const old = layer.mesh
    const newCapacity = layer.capacity * 2
    const type = [...this.layers.entries()].find(([, l]) => l === layer)?.[0] ?? 'dirt'
    const geometry = type === 'dirt' ? this.dirtGeometry : this.plainGeometry
    const material =
      type === 'dirt' && this.grassTopMaterial
        ? [this.materials.dirt, this.grassTopMaterial]
        : this.materials[type]
    const grown = this.createMesh(material, geometry, newCapacity)
    for (let i = 0; i < layer.order.length; i++) {
      old.getMatrixAt(i, _matrix)
      grown.setMatrixAt(i, _matrix)
    }
    grown.count = layer.order.length
    grown.instanceMatrix.needsUpdate = true
    this.group.remove(old)
    old.dispose()
    layer.mesh = grown
    layer.capacity = newCapacity
    this.group.add(grown)
    this.refreshRaycastBounds(layer)
  }
}
