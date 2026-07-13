import * as THREE from 'three'
import {
  type CollisionBox,
  acquireCollisionBox,
  appendBoxesFromObject,
  findGroundTopInBoxes,
  raycastBoxes,
  releaseCollisionBoxes,
  setBoxFromBounds,
  setVoxelBox,
} from './collision'
import {
  type MeshGroundTargets,
  sampleMeshGroundY,
} from './terrainGroundRay'

const DEFAULT_GRID_CELL = 5

function gridKey(gx: number, gz: number) {
  return `${gx},${gz}`
}

export type TerrainCellCollision = {
  key: string
  centerX: number
  centerZ: number
  capBottomY: number
  voxelBaseY?: number
  /** Full-cube voxel bits. */
  layerMask: number
  /** Remaining partial surface-piece bits. */
  surfaceLayerMask?: number
  bounds?: { min: number[]; max: number[] }
  capTopY?: number
}

type CellSlots = {
  voxel: (number | null)[]
  surface: number | null
}

/** Spatial hash of AABBs with per-cell slots for fast incremental updates. */
export class CollisionWorld {
  readonly boxes: CollisionBox[] = []
  private readonly boxActive: boolean[] = []
  // Coarse per-cell top-surface AABBs. The smooth surface mesh is authoritative
  // for walking, so these are skipped by player/ground queries (excludeSurface).
  private readonly boxIsSurface: boolean[] = []
  private readonly grid = new Map<string, number[]>()
  private readonly queryIndices: number[] = []
  private readonly cellSlots = new Map<string, CellSlots>()
  private readonly heightGrid = new Map<string, number>()
  private readonly columnHints = new Map<
    string,
    { x: number; z: number; top: number }
  >()
  private readonly hintsByBucket = new Map<
    string,
    { x: number; z: number; top: number; key: string }[]
  >()
  private queryStamp = 0
  private queryStamped: number[] = []
  private gridCell = DEFAULT_GRID_CELL
  private staticBoxIndices: number[] = []
  private readonly buildSlots = new Map<string, number>()
  private maxLayers = 5
  private meshGround: MeshGroundTargets | null = null
  private readonly meshGroundHits: THREE.Intersection[] = []
  // Frame-coherent multi-key cache: enemy packs probe many nearby XZ cells per
  // frame; a single-slot cache thrashed and re-raycast every enemy.
  private readonly meshGroundCache = new Map<number, number | null>()
  private static readonly MESH_GROUND_CACHE_MAX = 96

  setMeshGroundTargets(surface: THREE.Object3D, chunkRoot?: THREE.Object3D) {
    this.meshGround = { surface, chunkRoot }
  }

  /** Clear the mesh-ground sample cache once per frame. */
  beginFrame() {
    this.meshGroundCache.clear()
  }

  private meshGroundCacheKey(feetX: number, feetZ: number, rayStartY: number): number {
    // ~5 cm XZ buckets; ~2 m Y bands so cave vs outdoor probes don't collide.
    const qx = Math.round(feetX * 20)
    const qz = Math.round(feetZ * 20)
    const qy = Math.round(rayStartY * 0.5)
    return (qx * 73856093) ^ (qz * 19349663) ^ (qy * 83492791)
  }

  private sampleMeshGround(
    feetX: number,
    feetZ: number,
    rayStartY: number,
    maxDistance: number,
  ): number | null {
    if (!this.meshGround) return null
    const key = this.meshGroundCacheKey(feetX, feetZ, rayStartY)
    if (this.meshGroundCache.has(key)) return this.meshGroundCache.get(key)!
    // Hit distance-culled chunk meshes too — enemies (and props) often stand on
    // terrain whose merged chunk was hidden relative to the player camera.
    const y = sampleMeshGroundY(
      feetX,
      feetZ,
      rayStartY,
      this.meshGround,
      this.meshGroundHits,
      maxDistance,
      { intersectInvisibleChunks: true },
    )
    // Never cache misses: key is XZ+Y-band, so a short/failed probe from one enemy
    // (or a mid-rebuild frame) would make every later probe at that cell return
    // null and drop packs through the floor for the rest of the frame.
    if (y !== null && this.meshGroundCache.size < CollisionWorld.MESH_GROUND_CACHE_MAX) {
      this.meshGroundCache.set(key, y)
    }
    return y
  }

  /** Cheap outdoor spawn height from registered cell caps (no mesh raycast). */
  heightHintAt(x: number, z: number): number | null {
    const gx = Math.floor(x / this.gridCell)
    const gz = Math.floor(z / this.gridCell)
    return this.heightGrid.get(gridKey(gx, gz)) ?? null
  }

  setGridCell(size: number) {
    this.gridCell = size
  }

  setMaxLayers(n: number) {
    this.maxLayers = n
  }

  /** Register walkable height hints from terrain meta (cap tops). */
  registerHeightHint(centerX: number, centerZ: number, capTopY: number) {
    const gx = Math.floor(centerX / this.gridCell)
    const gz = Math.floor(centerZ / this.gridCell)
    const gk = gridKey(gx, gz)
    const prev = this.heightGrid.get(gk)
    if (prev === undefined || capTopY > prev) {
      this.heightGrid.set(gk, capTopY)
    }
  }

  clear() {
    releaseCollisionBoxes(this.boxes)
    this.boxes.length = 0
    this.boxActive.length = 0
    this.boxIsSurface.length = 0
    this.grid.clear()
    this.cellSlots.clear()
    this.heightGrid.clear()
    this.columnHints.clear()
    this.hintsByBucket.clear()
    this.staticBoxIndices.length = 0
    this.buildSlots.clear()
  }

  /**
   * Add or re-activate a solid AABB for a player-placed build block. The block
   * position is fixed per key, so the grid bucket from the first insert is reused.
   */
  setBuildBox(
    key: string,
    min: THREE.Vector3,
    max: THREE.Vector3,
    skin = 0.01,
  ) {
    const idx = this.buildSlots.get(key)
    if (idx === undefined) {
      const box = acquireCollisionBox()
      box.min.set(min.x + skin, min.y + skin, min.z + skin)
      box.max.set(max.x - skin, max.y - skin, max.z - skin)
      this.buildSlots.set(key, this.addBox(box))
    } else {
      const box = this.boxes[idx]!
      box.min.set(min.x + skin, min.y + skin, min.z + skin)
      box.max.set(max.x - skin, max.y - skin, max.z - skin)
      this.boxActive[idx] = true
    }
  }

  removeBuildBox(key: string) {
    const idx = this.buildSlots.get(key)
    if (idx !== undefined) this.deactivateBox(idx)
  }

  private deactivateBox(index: number) {
    if (index >= 0 && index < this.boxActive.length) {
      this.boxActive[index] = false
    }
  }

  addBox(box: CollisionBox, isSurface = false): number {
    const index = this.boxes.length
    this.boxes.push(box)
    this.boxActive.push(true)
    this.boxIsSurface.push(isSurface)
    this.insertIntoGrid(index, box.min.x, box.min.z, box.max.x, box.max.z)
    return index
  }

  /** True when this slot is a coarse outdoor surface-cap AABB (not a voxel/build). */
  isSurfaceBox(index: number): boolean {
    return this.boxIsSurface[index] === true
  }

  private ensureCellSlots(key: string): CellSlots {
    let slots = this.cellSlots.get(key)
    if (!slots) {
      slots = {
        voxel: new Array(this.maxLayers).fill(null),
        surface: null,
      }
      this.cellSlots.set(key, slots)
    }
    return slots
  }

  buildCells(cells: Iterable<TerrainCellCollision>, voxelSize: number) {
    for (const cell of cells) {
      this.syncCell(cell, voxelSize)
      this.updateColumnHint(cell, voxelSize)
    }
  }

  /** Update one column after digging (voxels and/or surface). */
  patchCell(cell: TerrainCellCollision, voxelSize: number) {
    this.syncCell(cell, voxelSize)
    this.updateColumnHint(cell, voxelSize)
  }

  private topmostVoxelLayer(cell: TerrainCellCollision): number | null {
    for (let layer = 0; layer < this.maxLayers; layer++) {
      if ((cell.layerMask & (1 << layer)) !== 0) return layer
    }
    return null
  }

  /** Clip surface AABB so dug voxel gaps are not blocked by the column bounds. */
  private surfaceCollisionBounds(
    cell: TerrainCellCollision,
    voxelSize: number,
  ): { min: number[]; max: number[] } | null {
    if (!cell.bounds) return null
    const surfaceMask = cell.surfaceLayerMask ?? 0
    // Prefer mesh BVH for multi-layer / complex outer pieces; only keep a coarse
    // AABB when the top layer is still an undug surface piece and no voxels sit above.
    if (surfaceMask === 0) return null
    const topLayer = this.topmostVoxelLayer(cell)
    if (topLayer !== null && topLayer === 0) return null
    if ((surfaceMask & 1) === 0) return null

    const min = [...cell.bounds.min]
    const max = [...cell.bounds.max]
    const seam = cell.voxelBaseY ?? cell.capBottomY + voxelSize
    // Restrict coarse AABB to the top surface layer band.
    min[1] = Math.max(min[1], seam - voxelSize)
    max[1] = Math.min(max[1], seam)
    if (min[1] >= max[1] - 0.01) return null
    return { min, max }
  }

  private computeColumnWalkableTop(
    cell: TerrainCellCollision,
    voxelSize: number,
  ): number | null {
    const seam = cell.voxelBaseY ?? cell.capBottomY + voxelSize
    let top = -Infinity
    for (let layer = 0; layer < this.maxLayers; layer++) {
      if ((cell.layerMask & (1 << layer)) === 0) continue
      top = Math.max(top, seam - layer * voxelSize)
    }
    const surfaceMask = cell.surfaceLayerMask ?? 0
    if (surfaceMask !== 0 && cell.bounds) {
      // Approximate: highest remaining surface layer top.
      for (let layer = 0; layer < this.maxLayers; layer++) {
        if ((surfaceMask & (1 << layer)) === 0) continue
        top = Math.max(top, seam - layer * voxelSize)
        break
      }
      top = Math.max(top, cell.bounds.max[1]!)
    }
    if (top === -Infinity) return null
    return top
  }

  private hintBucketKey(centerX: number, centerZ: number) {
    return gridKey(
      Math.floor(centerX / this.gridCell),
      Math.floor(centerZ / this.gridCell),
    )
  }

  private removeHintFromBucket(key: string, centerX: number, centerZ: number) {
    const list = this.hintsByBucket.get(this.hintBucketKey(centerX, centerZ))
    if (!list) return
    const idx = list.findIndex((h) => h.key === key)
    if (idx >= 0) list.splice(idx, 1)
    if (list.length === 0) this.hintsByBucket.delete(this.hintBucketKey(centerX, centerZ))
  }

  private updateColumnHint(cell: TerrainCellCollision, voxelSize: number) {
    const prev = this.columnHints.get(cell.key)
    if (prev) this.removeHintFromBucket(cell.key, prev.x, prev.z)

    const top = this.computeColumnWalkableTop(cell, voxelSize)
    if (top === null) {
      this.columnHints.delete(cell.key)
    } else {
      const hint = { x: cell.centerX, z: cell.centerZ, top, key: cell.key }
      this.columnHints.set(cell.key, hint)
      const gk = this.hintBucketKey(cell.centerX, cell.centerZ)
      let list = this.hintsByBucket.get(gk)
      if (!list) {
        list = []
        this.hintsByBucket.set(gk, list)
      }
      list.push(hint)
    }
    this.rebuildHeightGridBucket(cell.centerX, cell.centerZ)
  }

  private rebuildHeightGridBucket(centerX: number, centerZ: number) {
    const gk = this.hintBucketKey(centerX, centerZ)
    let maxTop = -Infinity
    const list = this.hintsByBucket.get(gk)
    if (list) {
      for (let i = 0; i < list.length; i++) {
        const top = list[i]!.top
        if (top > maxTop) maxTop = top
      }
    }
    if (maxTop === -Infinity) this.heightGrid.delete(gk)
    else this.heightGrid.set(gk, maxTop)
  }

  private syncCell(cell: TerrainCellCollision, voxelSize: number) {
    const slots = this.ensureCellSlots(cell.key)

    for (let layer = 0; layer < this.maxLayers; layer++) {
      const bit = 1 << layer
      const active = (cell.layerMask & bit) !== 0
      const idx = slots.voxel[layer]

      if (active) {
        const seam = cell.voxelBaseY ?? cell.capBottomY
        if (idx === null) {
          const box = acquireCollisionBox()
          setVoxelBox(
            box,
            cell.centerX,
            cell.centerZ,
            seam,
            layer,
            voxelSize,
            0.01,
          )
          slots.voxel[layer] = this.addBox(box)
        } else {
          setVoxelBox(
            this.boxes[idx]!,
            cell.centerX,
            cell.centerZ,
            seam,
            layer,
            voxelSize,
            0.01,
          )
          this.boxActive[idx] = true
        }
      } else if (idx !== null) {
        this.deactivateBox(idx)
      }
    }

    const surfaceBounds = this.surfaceCollisionBounds(cell, voxelSize)
    if (surfaceBounds) {
      if (slots.surface === null) {
        const box = acquireCollisionBox()
        setBoxFromBounds(box, surfaceBounds.min, surfaceBounds.max, 0.01)
        slots.surface = this.addBox(box, true)
      } else {
        setBoxFromBounds(
          this.boxes[slots.surface]!,
          surfaceBounds.min,
          surfaceBounds.max,
          0.01,
        )
        this.boxActive[slots.surface] = true
      }
    } else if (slots.surface !== null) {
      this.deactivateBox(slots.surface)
    }
  }

  addStaticFromObject(
    root: THREE.Object3D,
    skin = 0.01,
    opts?: { projectileSolid?: boolean },
  ) {
    const start = this.boxes.length
    appendBoxesFromObject(root, this.boxes, skin, opts)
    while (this.boxActive.length < this.boxes.length) {
      this.boxActive.push(true)
    }
    while (this.boxIsSurface.length < this.boxes.length) {
      this.boxIsSurface.push(false)
    }
    for (let i = start; i < this.boxes.length; i++) {
      this.staticBoxIndices.push(i)
      const box = this.boxes[i]!
      this.insertIntoGrid(i, box.min.x, box.min.z, box.max.x, box.max.z)
    }
  }

  /** Replace props/base collision without rebuilding terrain columns. */
  replaceStaticFromObjects(roots: readonly THREE.Object3D[], skin = 0.01) {
    for (const idx of this.staticBoxIndices) {
      this.deactivateBox(idx)
    }
    this.staticBoxIndices.length = 0
    for (const root of roots) {
      this.addStaticFromObject(root, skin)
    }
  }

  /** Clear prop/base static AABBs so callers can re-add with per-root options. */
  clearStaticObjects() {
    for (const idx of this.staticBoxIndices) {
      this.deactivateBox(idx)
    }
    this.staticBoxIndices.length = 0
  }

  private insertIntoGrid(
    index: number,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ) {
    const cell = this.gridCell
    const gx0 = Math.floor(minX / cell)
    const gx1 = Math.floor(maxX / cell)
    const gz0 = Math.floor(minZ / cell)
    const gz1 = Math.floor(maxZ / cell)
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const key = gridKey(gx, gz)
        let list = this.grid.get(key)
        if (!list) {
          list = []
          this.grid.set(key, list)
        }
        list.push(index)
      }
    }
  }

  queryNear(
    x: number,
    z: number,
    radius: number,
    yMin: number,
    yMax: number,
    excludeSurface = false,
    out = this.queryIndices,
  ): number[] {
    out.length = 0
    const cell = this.gridCell
    const margin = Math.ceil((radius + 0.5) / cell)
    const gx0 = Math.floor(x / cell) - margin
    const gx1 = Math.floor(x / cell) + margin
    const gz0 = Math.floor(z / cell) - margin
    const gz1 = Math.floor(z / cell) + margin
    const stamp = ++this.queryStamp
    if (this.queryStamped.length < this.boxes.length) {
      this.queryStamped.length = this.boxes.length
    }

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const list = this.grid.get(gridKey(gx, gz))
        if (!list) continue
        for (let i = 0; i < list.length; i++) {
          const idx = list[i]!
          if (this.queryStamped[idx] === stamp) continue
          if (!this.boxActive[idx]) continue
          if (excludeSurface && this.boxIsSurface[idx]) continue
          this.queryStamped[idx] = stamp
          const box = this.boxes[idx]!
          if (box.max.y < yMin || box.min.y > yMax) continue
          out.push(idx)
        }
      }
    }
    return out
  }

  /** Walkable top from column hints only when feet are over that column in XZ. */
  private columnHintAt(
    feetX: number,
    feetZ: number,
    feetY: number,
    _radius: number,
    stepHeight: number,
    recoverBelow = 1.85,
  ) {
    const half = this.gridCell * 0.5
    let best: number | null = null
    const gx = Math.floor(feetX / this.gridCell)
    const gz = Math.floor(feetZ / this.gridCell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.hintsByBucket.get(gridKey(gx + dx, gz + dz))
        if (!list) continue
        for (let i = 0; i < list.length; i++) {
          const hint = list[i]!
          if (
            feetX <= hint.x - half ||
            feetX >= hint.x + half ||
            feetZ <= hint.z - half ||
            feetZ >= hint.z + half
          ) {
            continue
          }
          if (hint.top > feetY + stepHeight + 0.05) continue
          if (hint.top < feetY - stepHeight - recoverBelow) continue
          if (best === null || hint.top > best) best = hint.top
        }
      }
    }
    return best
  }

  findGroundTop(
    feetX: number,
    feetY: number,
    feetZ: number,
    radius: number,
    stepHeight: number,
    excludeSurface = false,
    recoverBelow = 1.85,
    useMesh = true,
  ): number | null {
    const maxAbove = stepHeight + 0.05
    const minBelow = feetY - stepHeight - recoverBelow

    let best: number | null = null
    let meshHit = false
    if (useMesh && this.meshGround) {
      const meshY = this.sampleMeshGround(
        feetX,
        feetZ,
        feetY + 1.5,
        stepHeight + recoverBelow + 2,
      )
      if (
        meshY !== null &&
        meshY <= feetY + maxAbove &&
        meshY >= minBelow
      ) {
        best = meshY
        meshHit = true
      }
    }

    const below = Math.max(stepHeight + recoverBelow + 0.5, 4)
    const above = stepHeight + 1.5
    // When the smooth mesh resolved the surface, skip coarse surface boxes so the
    // player/enemies follow the mesh instead of snapping to flat per-cell box tops
    // (those sit on the voxel seam, often meters above the walkable mesh). If the
    // mesh missed, fall back to including surface boxes so we never lose the floor.
    const indices = this.queryNear(
      feetX,
      feetZ,
      radius + 1,
      feetY - below,
      feetY + above,
      excludeSurface || meshHit,
    )
    const boxBest = findGroundTopInBoxes(
      feetX,
      feetY,
      feetZ,
      radius,
      this.boxes,
      indices,
      stepHeight,
      recoverBelow,
    )
    if (boxBest !== null) {
      if (best === null) {
        best = boxBest
      } else if (
        boxBest > best &&
        boxBest <= feetY + maxAbove &&
        feetY - boxBest < 0.22
      ) {
        // Voxel / ledge tops above the mesh sample (e.g. standing on dug columns).
        best = boxBest
      }
    }

    // Neighbor column hints include intact surface caps / seam tops. Skip them when
    // the mesh already answered — otherwise enemies stick to the floating seam.
    // With excludeSurface they also yank enemies in open pits onto adjacent floors.
    if (!excludeSurface && !meshHit) {
      const hint = this.columnHintAt(
        feetX,
        feetZ,
        feetY,
        radius,
        stepHeight,
        recoverBelow,
      )
      if (hint !== null) {
        if (best === null) best = hint
        else if (feetY - hint < 0.22 && hint > best && hint <= feetY + maxAbove) {
          best = hint
        }
      }
    }
    return best
  }

  private isStaticBox(index: number): boolean {
    const staticBoxes = this.staticBoxIndices
    for (let i = 0; i < staticBoxes.length; i++) {
      if (staticBoxes[i] === index) return true
    }
    return false
  }

  /**
   * Highest walkable terrain top under (x, z), ignoring prop/base static boxes.
   * Used so rocks/trees rest on voxels and surface, not on their own colliders.
   */
  findTerrainGroundTop(
    feetX: number,
    feetY: number,
    feetZ: number,
    radius: number,
    maxDrop = 64,
  ): number | null {
    const stepHeight = maxDrop
    const recoverBelow = maxDrop
    const maxAbove = stepHeight + 0.05
    const minBelow = feetY - stepHeight - recoverBelow

    let best: number | null = null
    let meshHit = false
    if (this.meshGround) {
      const meshY = this.sampleMeshGround(feetX, feetZ, feetY + 1.5, stepHeight + 3)
      if (meshY !== null && meshY <= feetY + maxAbove && meshY >= minBelow) {
        best = meshY
        meshHit = true
      }
    }

    const below = Math.max(stepHeight + 2.5, 4)
    const above = stepHeight + 1.5
    const indices = this.queryNear(
      feetX,
      feetZ,
      radius + 1,
      feetY - below,
      feetY + above,
      meshHit,
    )
    const boxBest = findGroundTopInBoxes(
      feetX,
      feetY,
      feetZ,
      radius,
      this.boxes,
      indices,
      stepHeight,
      recoverBelow,
      (idx) => this.isStaticBox(idx),
    )
    if (boxBest !== null) {
      if (best === null) {
        best = boxBest
      } else if (
        boxBest > best &&
        boxBest <= feetY + maxAbove &&
        feetY - boxBest < 0.22
      ) {
        best = boxBest
      }
    }

    const hint = this.columnHintAt(feetX, feetZ, feetY, radius, stepHeight, recoverBelow)
    if (hint !== null) {
      if (best === null) best = hint
      else if (feetY - hint < 0.22 && hint > best && hint <= feetY + maxAbove) {
        best = hint
      }
    }
    return best
  }

  /** Lowest Y of a horizontal surface above `fromY` within `maxAbove` (voxel/prop bottoms). */
  nearestCeilingYAbove(
    x: number,
    z: number,
    fromY: number,
    radius: number,
    maxAbove: number,
  ): number | null {
    const indices = this.queryNear(x, z, radius, fromY, fromY + maxAbove, true)
    let best: number | null = null
    for (let i = 0; i < indices.length; i++) {
      const box = this.boxes[indices[i]!]!
      if (box.min.y <= fromY + 0.35) continue
      if (best === null || box.min.y < best) best = box.min.y
    }
    return best
  }

  /**
   * Segment vs voxel/build AABBs (surface caps + mesh-only props excluded).
   * Used by arrows/spears when instanced meshes are culled or the tip is under
   * an overhang the mesh ray misses. Tree/rock walk decks are not projectile-solid.
   */
  castSegment(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDist: number,
    outPoint: THREE.Vector3,
  ): number | null {
    const pad = Math.max(maxDist, 0.5) + 0.5
    const y0 = Math.min(originY, originY + dirY * maxDist) - 0.25
    const y1 = Math.max(originY, originY + dirY * maxDist) + 0.25
    const midX = originX + dirX * maxDist * 0.5
    const midZ = originZ + dirZ * maxDist * 0.5
    const indices = this.queryNear(midX, midZ, pad, y0, y1, true)
    // Drop mesh-only prop boxes (canopy decks) — keep voxels/build/base.
    for (let i = indices.length - 1; i >= 0; i--) {
      if (this.boxes[indices[i]!]?.projectileSolid === false) {
        indices.splice(i, 1)
      }
    }
    return raycastBoxes(
      originX,
      originY,
      originZ,
      dirX,
      dirY,
      dirZ,
      maxDist,
      this.boxes,
      indices,
      outPoint,
    )
  }

  findWalkableY(x: number, z: number, radius: number): number | null {
    let best: number | null = null
    for (let i = 0; i < this.boxes.length; i++) {
      if (!this.boxActive[i]) continue
      const box = this.boxes[i]!
      if (
        x + radius <= box.min.x ||
        x - radius >= box.max.x ||
        z + radius <= box.min.z ||
        z - radius >= box.max.z
      ) {
        continue
      }
      const top = box.max.y
      if (best === null || top > best) best = top
    }
    for (const hint of this.columnHints.values()) {
      if (
        x + radius <= hint.x - this.gridCell * 0.5 ||
        x - radius >= hint.x + this.gridCell * 0.5 ||
        z + radius <= hint.z - this.gridCell * 0.5 ||
        z - radius >= hint.z + this.gridCell * 0.5
      ) {
        continue
      }
      if (best === null || hint.top > best) best = hint.top
    }
    return best
  }

  /**
   * Cheap column-top from hints only (no mesh raycast). Used by projectiles to
   * skip expensive terrain/voxel checks while high in the air.
   */
  columnTopNear(x: number, z: number): number | null {
    const half = this.gridCell * 0.5
    let best: number | null = null
    const gx = Math.floor(x / this.gridCell)
    const gz = Math.floor(z / this.gridCell)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = this.hintsByBucket.get(gridKey(gx + dx, gz + dz))
        if (!list) continue
        for (let i = 0; i < list.length; i++) {
          const hint = list[i]!
          if (
            x < hint.x - half ||
            x > hint.x + half ||
            z < hint.z - half ||
            z > hint.z + half
          ) {
            continue
          }
          if (best === null || hint.top > best) best = hint.top
        }
      }
    }
    return best
  }

  /** True if any projectile-solid non-surface AABB overlaps the segment query. */
  hasSolidAlongSegment(
    originX: number,
    originY: number,
    originZ: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    maxDist: number,
  ): boolean {
    const pad = Math.max(maxDist, 0.5) + 0.5
    const y0 = Math.min(originY, originY + dirY * maxDist) - 0.25
    const y1 = Math.max(originY, originY + dirY * maxDist) + 0.25
    const midX = originX + dirX * maxDist * 0.5
    const midZ = originZ + dirZ * maxDist * 0.5
    const indices = this.queryNear(midX, midZ, pad, y0, y1, true)
    for (let i = 0; i < indices.length; i++) {
      if (this.boxes[indices[i]!]?.projectileSolid !== false) return true
    }
    return false
  }
}
