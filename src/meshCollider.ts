import * as THREE from 'three'
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  type MeshBVH,
} from 'three-mesh-bvh'
import type { CollisionBox } from './collision'

/**
 * Install three-mesh-bvh's accelerated geometry/mesh prototype helpers once. After
 * this, any BufferGeometry can build a `boundsTree` and meshes raycast through it.
 */
let extensionsInstalled = false
export function registerBVHExtensions() {
  if (extensionsInstalled) return
  extensionsInstalled = true
  ;(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree
  ;(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree
  ;(THREE.Mesh.prototype as any).raycast = acceleratedRaycast
}

type GeometryWithTree = THREE.BufferGeometry & {
  boundsTree?: MeshBVH
  computeBoundsTree?: () => void
  disposeBoundsTree?: () => void
}

/** Build (or rebuild) the BVH on a terrain geometry so the capsule can collide with it. */
export function buildTerrainBVH(geometry: THREE.BufferGeometry) {
  const geo = geometry as GeometryWithTree
  if (geo.boundsTree) geo.disposeBoundsTree?.()
  geo.computeBoundsTree?.()
}

export function disposeTerrainBVH(geometry: THREE.BufferGeometry) {
  const geo = geometry as GeometryWithTree
  if (geo.boundsTree) geo.disposeBoundsTree?.()
}

const _segment = new THREE.Line3()
const _raycaster = new THREE.Raycaster()
const _rayOrigin = new THREE.Vector3()
const _downDir = new THREE.Vector3(0, -1, 0)
const _upDir = new THREE.Vector3(0, 1, 0)
const _rayHits: THREE.Intersection[] = []
const _triPoint = new THREE.Vector3()
const _capPoint = new THREE.Vector3()
const _localBox = new THREE.Box3()
const _localStart = new THREE.Vector3()
const _localEnd = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _invMat = new THREE.Matrix4()
const _meshBox = new THREE.Box3()
const _capsuleBox = new THREE.Box3()
const _xzSphereCenter = new THREE.Vector3()

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

export type CapsuleHit = {
  /** True when geometry pushed the capsule up enough to be considered a floor. */
  grounded: boolean
  /** Net upward push this resolve produced (world units). */
  pushUp: number
  /** True when geometry pushed the capsule down (a ceiling while rising). */
  ceiling: boolean
  hit: boolean
}

/**
 * Resolves a vertical capsule against the triangle meshes under a terrain group and a
 * set of axis-aligned boxes (voxels / props). The capsule is defined by its feet
 * position; `start`/`end` are the lower/upper sphere centres.
 *
 * The terrain pass follows the canonical three-mesh-bvh character pattern: it walks
 * every triangle near the capsule and pushes the swept segment out along the contact
 * normal. Because terrain triangles can face any direction, this handles overhangs,
 * cave ceilings/walls/floors and arbitrary slopes — things a top-down ray cannot.
 */
export class CapsuleCollider {
  private chunkRoot: THREE.Object3D | null = null
  private surfaceRoot: THREE.Object3D | null = null
  /**
   * When true, collide with distance-culled (invisible) chunk meshes.
   * Ground probes already hit those meshes for enemies/props; capsule collision
   * must match or pursuers fall through terrain outside the player's chunk radius.
   */
  collideInvisibleChunks = false

  setTargets(chunkRoot: THREE.Object3D, surfaceRoot?: THREE.Object3D) {
    this.chunkRoot = chunkRoot
    this.surfaceRoot = surfaceRoot ?? null
  }

  /**
   * Nearest terrain surface Y at or below `fromY` at (x, z), or null. Casting downward
   * from the start point means a player inside a cave finds the cave floor, never a
   * ceiling far overhead (the failure mode of a top-down ray).
   */
  raycastDownY(x: number, z: number, fromY: number, maxDistance: number): number | null {
    _rayOrigin.set(x, fromY, z)
    _raycaster.set(_rayOrigin, _downDir)
    _raycaster.near = 0
    _raycaster.far = maxDistance
    _rayHits.length = 0

    if (this.chunkRoot) {
      const children = this.chunkRoot.children
      for (let i = 0; i < children.length; i++) {
        const mesh = children[i] as THREE.Mesh
        if (!mesh.visible || !(mesh instanceof THREE.Mesh)) continue
        if (!meshMayHitVerticalRay(mesh, x, z)) continue
        _raycaster.intersectObject(mesh, false, _rayHits)
      }
    }
    if (this.surfaceRoot) {
      const children = this.surfaceRoot.children
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!
        if (!child.visible || child === this.chunkRoot) continue
        if (child instanceof THREE.Mesh && !meshMayHitVerticalRay(child, x, z)) continue
        _raycaster.intersectObject(child, true, _rayHits)
      }
    }
    if (_rayHits.length === 0) return null
    let bestDist = Infinity
    let bestY: number | null = null
    for (let i = 0; i < _rayHits.length; i++) {
      const hit = _rayHits[i]!
      if (hit.distance < bestDist) {
        bestDist = hit.distance
        bestY = hit.point.y
      }
    }
    return bestY
  }

  /** Distance to the nearest terrain surface above (x, y, z), or null if none within range. */
  raycastUpDistance(x: number, y: number, z: number, maxDistance: number): number | null {
    _rayOrigin.set(x, y, z)
    _raycaster.set(_rayOrigin, _upDir)
    _raycaster.near = 0
    _raycaster.far = maxDistance
    _rayHits.length = 0

    if (this.chunkRoot) {
      const children = this.chunkRoot.children
      for (let i = 0; i < children.length; i++) {
        const mesh = children[i] as THREE.Mesh
        if (!mesh.visible || !(mesh instanceof THREE.Mesh)) continue
        if (!meshMayHitVerticalRay(mesh, x, z)) continue
        _raycaster.intersectObject(mesh, false, _rayHits)
      }
    }
    if (this.surfaceRoot) {
      const children = this.surfaceRoot.children
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!
        if (!child.visible || child === this.chunkRoot) continue
        if (child instanceof THREE.Mesh && !meshMayHitVerticalRay(child, x, z)) continue
        _raycaster.intersectObject(child, true, _rayHits)
      }
    }
    if (_rayHits.length === 0) return null
    let bestDist = Infinity
    for (let i = 0; i < _rayHits.length; i++) {
      const hit = _rayHits[i]!
      if (hit.distance < bestDist) bestDist = hit.distance
    }
    return bestDist
  }

  /**
   * Push a vertical capsule out of all nearby geometry. Mutates `feet` and returns a
   * summary used for grounded / ceiling state. `radius` is the capsule radius, the
   * segment spans [feet.y + radius, feet.y + height - radius].
   */
  resolve(
    feet: THREE.Vector3,
    radius: number,
    height: number,
    boxes: readonly CollisionBox[],
    boxIndices: readonly number[],
    iterations = 5,
    collideTerrain = true,
    lockVertical = false,
    /** Keep feet XZ fixed (stand planted; depenetrate by lifting instead of sliding). */
    lockHorizontal = false,
  ): CapsuleHit {
    let pushUpTotal = 0
    let pushDownTotal = 0
    let hitAny = false
    const lockFeetX = feet.x
    const lockFeetY = feet.y
    const lockFeetZ = feet.z

    for (let iter = 0; iter < iterations; iter++) {
      if (lockVertical) feet.y = lockFeetY
      if (lockHorizontal) {
        feet.x = lockFeetX
        feet.z = lockFeetZ
      }
      // Rebuild the vertical segment from the (possibly moved) feet each iteration.
      _segment.start.set(feet.x, feet.y + radius, feet.z)
      _segment.end.set(feet.x, feet.y + height - radius, feet.z)

      const beforeX = feet.x
      const beforeY = feet.y
      const beforeZ = feet.z

      if (collideTerrain) this.collideTerrain(_segment, radius)
      this.collideBoxes(_segment, radius, boxes, boxIndices)

      // The segment moved; map it back to a feet position (segment start is feet+radius).
      const rawX = _segment.start.x
      const rawY = _segment.start.y - radius
      const rawZ = _segment.start.z
      let newX = rawX
      let newY = rawY
      let newZ = rawZ
      if (lockHorizontal) {
        const rdx = rawX - lockFeetX
        const rdz = rawZ - lockFeetZ
        const rejected = Math.sqrt(rdx * rdx + rdz * rdz)
        newX = lockFeetX
        newZ = lockFeetZ
        // Lateral depenetration on slopes becomes lift so we stay planted without
        // tunneling into the surface.
        if (!lockVertical && rejected > 0) newY = rawY + rejected
      }
      if (lockVertical) newY = lockFeetY

      const dx = newX - beforeX
      const dy = newY - beforeY
      const dz = newZ - beforeZ
      feet.x = newX
      feet.y = newY
      feet.z = newZ

      if (!lockVertical) {
        if (dy > 0) pushUpTotal += dy
        else if (dy < 0) pushDownTotal += -dy
      }

      const moved = dx * dx + dy * dy + dz * dz
      if (moved > 1e-12) hitAny = true
      if (moved < 1e-10) break
    }

    return {
      grounded: pushUpTotal > 1e-4 || (lockHorizontal && hitAny),
      pushUp: pushUpTotal,
      ceiling: pushDownTotal > 1e-4,
      hit: hitAny,
    }
  }

  private collideTerrain(segment: THREE.Line3, radius: number) {
    _capsuleBox.makeEmpty()
    _capsuleBox.expandByPoint(segment.start)
    _capsuleBox.expandByPoint(segment.end)
    _capsuleBox.min.addScalar(-radius)
    _capsuleBox.max.addScalar(radius)

    const includeHiddenChunks = this.collideInvisibleChunks
    const capX = (segment.start.x + segment.end.x) * 0.5
    const capZ = (segment.start.z + segment.end.z) * 0.5
    // Capsule XZ reach — skip far merged chunks before AABB/BVH work.
    const chunkCullPad = radius + 2
    if (this.chunkRoot) {
      const children = this.chunkRoot.children
      for (let i = 0; i < children.length; i++) {
        const mesh = children[i] as THREE.Mesh
        if (!includeHiddenChunks && !mesh.visible) continue
        const geo = mesh.geometry
        if (!geo.boundingSphere) geo.computeBoundingSphere()
        const bs = geo.boundingSphere
        if (bs) {
          _xzSphereCenter.copy(bs.center).applyMatrix4(mesh.matrixWorld)
          const dx = _xzSphereCenter.x - capX
          const dz = _xzSphereCenter.z - capZ
          const r = bs.radius + chunkCullPad
          if (dx * dx + dz * dz > r * r) continue
        }
        this.collideMesh(mesh, segment, radius, includeHiddenChunks)
      }
    }
    if (this.surfaceRoot) {
      // Surface-cell GLTFs stay hidden after merge — never collide them, even when
      // collideInvisibleChunks is on. Traversing hundreds of dig-source meshes
      // per capsule substep is what melted FPS during night fights.
      const children = this.surfaceRoot.children
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!
        if (!child.visible || child === this.chunkRoot) continue
        child.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            this.collideMesh(node as THREE.Mesh, segment, radius, false)
          }
        })
      }
    }
  }

  private collideMesh(
    mesh: THREE.Mesh,
    segment: THREE.Line3,
    radius: number,
    allowInvisible = false,
  ) {
    if (!(mesh as THREE.Mesh).isMesh) return
    if (!allowInvisible && !mesh.visible) return
    const geo = mesh.geometry as GeometryWithTree

    // Cheap broadphase: skip meshes whose world bounds miss the capsule.
    if (!geo.boundingBox) geo.computeBoundingBox()
    _meshBox.copy(geo.boundingBox!).applyMatrix4(mesh.matrixWorld)
    if (!_meshBox.intersectsBox(_capsuleBox)) return

    // Only visible cells peeled out for digging reach here without a tree; build it
    // once (the broadphase guarantees we are standing next to it).
    let tree = geo.boundsTree
    if (!tree) {
      geo.computeBoundsTree?.()
      tree = geo.boundsTree
      if (!tree) return
    }

    _invMat.copy(mesh.matrixWorld).invert()
    _localStart.copy(segment.start).applyMatrix4(_invMat)
    _localEnd.copy(segment.end).applyMatrix4(_invMat)
    _localBox.makeEmpty()
    _localBox.expandByPoint(_localStart)
    _localBox.expandByPoint(_localEnd)
    _localBox.min.addScalar(-radius)
    _localBox.max.addScalar(radius)

    const localSeg = _segmentLocal
    localSeg.start.copy(_localStart)
    localSeg.end.copy(_localEnd)

    tree.shapecast({
      intersectsBounds: (box: THREE.Box3) => box.intersectsBox(_localBox),
      intersectsTriangle: (tri: any) => {
        const distance = tri.closestPointToSegment(localSeg, _triPoint, _capPoint)
        if (distance < radius) {
          const depth = radius - distance
          _dir.copy(_capPoint).sub(_triPoint)
          const len = _dir.length()
          if (len > 1e-9) {
            _dir.multiplyScalar(1 / len)
            localSeg.start.addScaledVector(_dir, depth)
            localSeg.end.addScaledVector(_dir, depth)
          }
        }
        return false
      },
    })

    // Map the resolved local segment back to world space.
    segment.start.copy(localSeg.start).applyMatrix4(mesh.matrixWorld)
    segment.end.copy(localSeg.end).applyMatrix4(mesh.matrixWorld)
  }

  /**
   * Resolve the vertical capsule against axis-aligned boxes. Because both the capsule
   * axis and the boxes are axis-aligned, the closest distance decomposes per-axis,
   * giving an exact, allocation-free push.
   */
  private collideBoxes(
    segment: THREE.Line3,
    radius: number,
    boxes: readonly CollisionBox[],
    indices: readonly number[],
  ) {
    const x = segment.start.x
    const z = segment.start.z
    const y0 = segment.start.y
    const y1 = segment.end.y

    for (let i = 0; i < indices.length; i++) {
      const box = boxes[indices[i]!]
      if (!box) continue
      const min = box.min
      const max = box.max

      const bx = clamp(x, min.x, max.x)
      const bz = clamp(z, min.z, max.z)
      const dx = x - bx
      const dz = z - bz

      let dy: number
      let segY: number
      let boxY: number
      if (y1 < min.y) {
        dy = min.y - y1
        segY = y1
        boxY = min.y
      } else if (y0 > max.y) {
        dy = y0 - max.y
        segY = y0
        boxY = max.y
      } else {
        dy = 0
        segY = clamp((min.y + max.y) * 0.5, y0, y1)
        boxY = clamp(segY, min.y, max.y)
      }

      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq >= radius * radius) continue

      if (distSq > 1e-12) {
        const dist = Math.sqrt(distSq)
        const depth = radius - dist
        const nx = (x - bx) / dist
        const nyRaw = segY - boxY
        const ny = dy === 0 ? 0 : nyRaw / dist
        const nz = (z - bz) / dist
        segment.start.x += nx * depth
        segment.end.x += nx * depth
        segment.start.y += ny * depth
        segment.end.y += ny * depth
        segment.start.z += nz * depth
        segment.end.z += nz * depth
      } else {
        // Capsule axis is inside the box interior — separate along the minimum-overlap
        // axis (treat the swept capsule as its own AABB to find the shallowest exit).
        const capBottom = y0 - radius
        const capTop = y1 + radius
        const pushXpos = max.x - (x - radius)
        const pushXneg = x + radius - min.x
        const pushZpos = max.z - (z - radius)
        const pushZneg = z + radius - min.z
        const upPush = max.y - capBottom // lift so the capsule bottom rests on the box top
        const downPush = capTop - min.y // drop so the capsule top sits below the box bottom
        const minX = Math.min(pushXpos, pushXneg)
        const minZ = Math.min(pushZpos, pushZneg)
        const minY = Math.min(upPush, downPush)
        const minOverlap = Math.min(minX, minZ, minY)
        if (minOverlap === minX) {
          const d = pushXpos < pushXneg ? pushXpos : -pushXneg
          segment.start.x += d
          segment.end.x += d
        } else if (minOverlap === minZ) {
          const d = pushZpos < pushZneg ? pushZpos : -pushZneg
          segment.start.z += d
          segment.end.z += d
        } else {
          const d = upPush < downPush ? upPush : -downPush
          segment.start.y += d
          segment.end.y += d
        }
      }
    }
  }
}

const _segmentLocal = new THREE.Line3()

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
