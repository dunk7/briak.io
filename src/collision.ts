import * as THREE from 'three'
import { VOXEL_FACE_OVERLAP } from './voxelPlacement'

export type CollisionBox = {
  min: THREE.Vector3
  max: THREE.Vector3
}

const _box3 = new THREE.Box3()
const _mtv = new THREE.Vector3()
const _closest = new THREE.Vector3()

/** Writes MTV into `out` when overlapping; returns whether a separation was found. */
export function separationMtvInto(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  box: CollisionBox,
  out: THREE.Vector3,
): boolean {
  const overlapX = Math.min(playerMax.x - box.min.x, box.max.x - playerMin.x)
  const overlapY = Math.min(playerMax.y - box.min.y, box.max.y - playerMin.y)
  const overlapZ = Math.min(playerMax.z - box.min.z, box.max.z - playerMin.z)

  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return false

  if (overlapX <= overlapY && overlapX <= overlapZ) {
    const sign =
      (playerMin.x + playerMax.x) * 0.5 < (box.min.x + box.max.x) * 0.5 ? -1 : 1
    out.set(sign * overlapX, 0, 0)
    return true
  }
  if (overlapY <= overlapZ) {
    const sign =
      (playerMin.y + playerMax.y) * 0.5 < (box.min.y + box.max.y) * 0.5 ? -1 : 1
    out.set(0, sign * overlapY, 0)
    return true
  }
  const sign =
    (playerMin.z + playerMax.z) * 0.5 < (box.min.z + box.max.z) * 0.5 ? -1 : 1
  out.set(0, 0, sign * overlapZ)
  return true
}

/** @deprecated Prefer separationMtvInto to avoid allocations. */
export function separationMtv(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  box: CollisionBox,
): THREE.Vector3 | null {
  return separationMtvInto(playerMin, playerMax, box, _mtv) ? _mtv.clone() : null
}

export function xzOverlaps(
  feetX: number,
  feetZ: number,
  radius: number,
  box: CollisionBox,
): boolean {
  return (
    feetX + radius > box.min.x &&
    feetX - radius < box.max.x &&
    feetZ + radius > box.min.z &&
    feetZ - radius < box.max.z
  )
}

/** True when the feet point is over this box's XZ footprint (not a nearby column). */
export function feetOverBoxXz(
  feetX: number,
  feetZ: number,
  box: CollisionBox,
  inset = 0.02,
): boolean {
  return (
    feetX > box.min.x + inset &&
    feetX < box.max.x - inset &&
    feetZ > box.min.z + inset &&
    feetZ < box.max.z - inset
  )
}

export function findGroundTopInBoxes(
  feetX: number,
  feetY: number,
  feetZ: number,
  _radius: number,
  boxes: readonly CollisionBox[],
  indices: readonly number[],
  stepHeight: number,
  recoverBelow = 1.85,
  excludeIndex?: (index: number) => boolean,
): number | null {
  let best: number | null = null
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!
    if (excludeIndex?.(idx)) continue
    const box = boxes[idx]
    const top = box.max.y
    if (top > feetY + stepHeight + 0.05) continue
    if (top < feetY - stepHeight - recoverBelow) continue
    if (!feetOverBoxXz(feetX, feetZ, box)) continue
    // Feet below the solid — standing under it, not on its walkable top.
    if (feetY < box.min.y - 0.02) continue
    if (best === null || top > best) best = top
  }
  return best
}

/** Highest walkable top under the feet column within step range. */
export function findGroundTop(
  feetX: number,
  feetY: number,
  feetZ: number,
  _radius: number,
  boxes: readonly CollisionBox[],
  stepHeight: number,
  recoverBelow = 1.85,
): number | null {
  let best: number | null = null
  for (const box of boxes) {
    const top = box.max.y
    if (top > feetY + stepHeight + 0.05) continue
    if (top < feetY - stepHeight - recoverBelow) continue
    if (!feetOverBoxXz(feetX, feetZ, box)) continue
    if (feetY < box.min.y - 0.02) continue
    if (best === null || top > best) best = top
  }
  return best
}

export type DepenetrateMode = 'all' | 'floor' | 'ceiling' | 'walls'

export function wallsMtvInto(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  box: CollisionBox,
  out: THREE.Vector3,
): boolean {
  const overlapX = Math.min(playerMax.x - box.min.x, box.max.x - playerMin.x)
  const overlapY = Math.min(playerMax.y - box.min.y, box.max.y - playerMin.y)
  const overlapZ = Math.min(playerMax.z - box.min.z, box.max.z - playerMin.z)
  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return false

  if (overlapX <= overlapZ) {
    const sign =
      (playerMin.x + playerMax.x) * 0.5 < (box.min.x + box.max.x) * 0.5 ? -1 : 1
    out.set(sign * overlapX, 0, 0)
    return true
  }
  const sign =
    (playerMin.z + playerMax.z) * 0.5 < (box.min.z + box.max.z) * 0.5 ? -1 : 1
  out.set(0, 0, sign * overlapZ)
  return true
}

export function ceilingMtvInto(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  box: CollisionBox,
  out: THREE.Vector3,
): boolean {
  const overlapX = Math.min(playerMax.x - box.min.x, box.max.x - playerMin.x)
  const overlapY = Math.min(playerMax.y - box.min.y, box.max.y - playerMin.y)
  const overlapZ = Math.min(playerMax.z - box.min.z, box.max.z - playerMin.z)
  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return false
  if (playerMax.y <= box.min.y + 1e-4) return false
  out.set(0, -overlapY, 0)
  return true
}

export function floorMtvInto(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  box: CollisionBox,
  out: THREE.Vector3,
  feetSkin = 0,
): boolean {
  const overlapX = Math.min(playerMax.x - box.min.x, box.max.x - playerMin.x)
  const overlapY = Math.min(playerMax.y - box.min.y, box.max.y - playerMin.y)
  const overlapZ = Math.min(playerMax.z - box.min.z, box.max.z - playerMin.z)
  if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) return false
  const feetY = playerMin.y - feetSkin
  // Under an overhang — hit the bottom, don't get pushed onto the top.
  if (feetY < box.min.y - 0.02) return false
  // Head must be above the deck we're landing on (not standing under a slab).
  if (playerMax.y <= box.max.y + 1e-4) return false
  if (playerMax.y < box.min.y + 0.05) return false
  // Clearly above this surface — not standing on it.
  if (feetY > box.max.y + 0.12) return false
  out.set(0, overlapY, 0)
  return true
}

export function depenetrateAabbInBoxes(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  boxes: readonly CollisionBox[],
  indices: readonly number[],
  maxIter = 6,
  mode: DepenetrateMode = 'all',
  feetSkin = 0,
): boolean {
  let moved = false
  for (let iter = 0; iter < maxIter; iter++) {
    let any = false
    for (let i = 0; i < indices.length; i++) {
      const box = boxes[indices[i]!]
      let hit = false
      if (mode === 'ceiling') {
        hit = ceilingMtvInto(playerMin, playerMax, box, _mtv)
      } else if (mode === 'floor') {
        hit = floorMtvInto(playerMin, playerMax, box, _mtv, feetSkin)
      } else if (mode === 'walls') {
        hit = wallsMtvInto(playerMin, playerMax, box, _mtv)
      } else {
        hit = separationMtvInto(playerMin, playerMax, box, _mtv)
      }
      if (!hit) continue
      playerMin.add(_mtv)
      playerMax.add(_mtv)
      any = true
      moved = true
    }
    if (!any) break
  }
  return moved
}

export function depenetrateAabb(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  boxes: readonly CollisionBox[],
  maxIter = 6,
  mode: DepenetrateMode = 'all',
  feetSkin = 0,
): boolean {
  const all = boxes.map((_, i) => i)
  return depenetrateAabbInBoxes(
    playerMin,
    playerMax,
    boxes,
    all,
    maxIter,
    mode,
    feetSkin,
  )
}

export type DepenetratePlayerOpts = {
  floor?: boolean
  ceiling?: boolean
  feetSkin?: number
}

export function depenetratePlayerInBoxes(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  boxes: readonly CollisionBox[],
  indices: readonly number[],
  maxIter = 10,
  opts: DepenetratePlayerOpts = { floor: true, ceiling: false, feetSkin: 0 },
): boolean {
  const skin = opts.feetSkin ?? 0
  const w = depenetrateAabbInBoxes(
    playerMin,
    playerMax,
    boxes,
    indices,
    maxIter,
    'walls',
    skin,
  )
  const c = opts.ceiling
    ? depenetrateAabbInBoxes(
        playerMin,
        playerMax,
        boxes,
        indices,
        maxIter,
        'ceiling',
        skin,
      )
    : false
  const f = opts.floor
    ? depenetrateAabbInBoxes(
        playerMin,
        playerMax,
        boxes,
        indices,
        maxIter,
        'floor',
        skin,
      )
    : false
  return w || c || f
}

export function depenetratePlayer(
  playerMin: THREE.Vector3,
  playerMax: THREE.Vector3,
  boxes: readonly CollisionBox[],
  maxIter = 10,
  opts: DepenetratePlayerOpts = { floor: true, ceiling: false, feetSkin: 0 },
): boolean {
  const all = boxes.map((_, i) => i)
  return depenetratePlayerInBoxes(playerMin, playerMax, boxes, all, maxIter, opts)
}

export function depenetrateSphereInBoxes(
  center: THREE.Vector3,
  radius: number,
  boxes: readonly CollisionBox[],
  indices: readonly number[],
  maxIter = 5,
): void {
  const r2 = radius * radius
  for (let iter = 0; iter < maxIter; iter++) {
    let any = false
    for (let i = 0; i < indices.length; i++) {
      const box = boxes[indices[i]!]
      _closest.set(
        THREE.MathUtils.clamp(center.x, box.min.x, box.max.x),
        THREE.MathUtils.clamp(center.y, box.min.y, box.max.y),
        THREE.MathUtils.clamp(center.z, box.min.z, box.max.z),
      )
      const dx = center.x - _closest.x
      const dy = center.y - _closest.y
      const dz = center.z - _closest.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq >= r2 || distSq < 1e-8) continue
      const dist = Math.sqrt(distSq)
      const push = (radius - dist) / dist
      center.x += dx * push
      center.y += dy * push
      center.z += dz * push
      any = true
    }
    if (!any) break
  }
}

export function depenetrateSphere(
  center: THREE.Vector3,
  radius: number,
  boxes: readonly CollisionBox[],
  maxIter = 5,
): void {
  const all = boxes.map((_, i) => i)
  depenetrateSphereInBoxes(center, radius, boxes, all, maxIter)
}

const _boxPool: CollisionBox[] = []

export function acquireCollisionBox(): CollisionBox {
  const box = _boxPool.pop()
  if (box) return box
  return { min: new THREE.Vector3(), max: new THREE.Vector3() }
}

export function releaseCollisionBoxes(boxes: CollisionBox[]) {
  for (const box of boxes) _boxPool.push(box)
}

export function setBoxFromBounds(
  box: CollisionBox,
  min: readonly number[],
  max: readonly number[],
  skin = 0,
) {
  box.min.set(min[0] + skin, min[1] + skin, min[2] + skin)
  box.max.set(max[0] - skin, max[1] - skin, max[2] - skin)
}

export function setVoxelBox(
  box: CollisionBox,
  centerX: number,
  centerZ: number,
  capBottomY: number,
  layer: number,
  voxelSize: number,
  skin = 0,
  halfX?: number,
  halfZ?: number,
) {
  const xzHalf = voxelSize * 0.5 + VOXEL_FACE_OVERLAP * 0.5
  if (halfX === undefined) halfX = xzHalf
  if (halfZ === undefined) halfZ = xzHalf
  const halfY = voxelSize * 0.5
  const y = capBottomY - (layer + 0.5) * voxelSize
  box.min.set(centerX - halfX + skin, y - halfY + skin, centerZ - halfZ + skin)
  box.max.set(centerX + halfX - skin, y + halfY - skin, centerZ + halfZ - skin)
}

export function setBoxFromMesh(box: CollisionBox, mesh: THREE.Mesh, skin = 0) {
  _box3.setFromObject(mesh)
  box.min.copy(_box3.min).addScalar(skin)
  box.max.copy(_box3.max).addScalar(-skin)
}

/** One AABB per mesh under a loaded object (e.g. trees). */
export function appendBoxesFromObject(
  root: THREE.Object3D,
  out: CollisionBox[],
  skin = 0,
) {
  root.updateWorldMatrix(true, true)
  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const box = acquireCollisionBox()
    setBoxFromMesh(box, child as THREE.Mesh, skin)
    out.push(box)
  })
}
