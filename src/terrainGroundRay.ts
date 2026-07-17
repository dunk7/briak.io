import * as THREE from 'three'

const _rayOrigin = new THREE.Vector3()
const _down = new THREE.Vector3(0, -1, 0)
const _raycaster = new THREE.Raycaster()
const _xzSphereCenter = new THREE.Vector3()

export type MeshGroundTargets = {
  surface: THREE.Object3D
  chunkRoot?: THREE.Object3D
}

export type SampleMeshGroundOptions = {
  /** Raycast distance-culled chunk meshes (e.g. prop placement at load time). */
  intersectInvisibleChunks?: boolean
}

/** True when a vertical ray at (x,z) can hit this mesh's bounding sphere. */
function meshMayHitVerticalRay(mesh: THREE.Mesh, x: number, z: number, pad = 0.75): boolean {
  const geo = mesh.geometry
  if (!geo.boundingSphere) geo.computeBoundingSphere()
  const bs = geo.boundingSphere
  if (!bs) return true
  _xzSphereCenter.copy(bs.center).applyMatrix4(mesh.matrixWorld)
  const dx = _xzSphereCenter.x - x
  const dz = _xzSphereCenter.z - z
  const r = bs.radius * Math.max(mesh.scale.x, mesh.scale.z) + pad
  return dx * dx + dz * dz <= r * r
}

/** Local terrain height at (x, z) from merged chunk meshes and surface GLTF roots. */
export function sampleMeshGroundY(
  x: number,
  z: number,
  rayStartY: number,
  targets: MeshGroundTargets,
  hits: THREE.Intersection[],
  maxDistance: number,
  options?: SampleMeshGroundOptions,
): number | null {
  _rayOrigin.set(x, rayStartY, z)
  _raycaster.near = 0
  _raycaster.set(_rayOrigin, _down)
  _raycaster.far = maxDistance
  hits.length = 0

  const chunkRoot = targets.chunkRoot
  // The merged chunk meshes are the authoritative walking surface.
  // Always XZ-cull per mesh — intersecting every chunk (including hidden ones
  // toggled visible) was a major dig hitch when many rocks re-checked support.
  if (chunkRoot && chunkRoot.children.length > 0) {
    const includeHidden = options?.intersectInvisibleChunks === true
    for (const child of chunkRoot.children) {
      if (!(child instanceof THREE.Mesh)) continue
      if (!includeHidden && !child.visible) continue
      if (!meshMayHitVerticalRay(child, x, z)) continue
      _raycaster.intersectObject(child, false, hits)
    }
  }
  // Only raycast individual cell roots that are actually visible (e.g. the cell
  // peeled out for a dig preview). Skipping the ~thousands of hidden roots — and
  // the chunk group nested under `surface` — avoids redundant per-substep work.
  const surfaceChildren = targets.surface.children
  for (let i = 0; i < surfaceChildren.length; i++) {
    const child = surfaceChildren[i]!
    if (!child.visible || child === chunkRoot) continue
    _raycaster.intersectObject(child, true, hits)
  }

  if (hits.length === 0) return null

  let bestY: number | null = null
  let bestDist = Infinity
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!
    if (hit.distance < bestDist) {
      bestDist = hit.distance
      bestY = hit.point.y
    }
  }
  return bestY
}
