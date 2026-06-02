import * as THREE from 'three'
import {
  type CollisionBox,
  acquireCollisionBox,
  appendBoxesFromObject,
  findGroundTopInBoxes,
  releaseCollisionBoxes,
  setBoxFromBounds,
  setVoxelBox,
} from './collision'

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
  layerMask: number
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
  private readonly grid = new Map<string, number[]>()
  private readonly queryIndices: number[] = []
  private readonly cellSlots = new Map<string, CellSlots>()
  private readonly heightGrid = new Map<string, number>()
  private readonly columnHints = new Map<
    string,
    { x: number; z: number; top: number }
  >()
  private queryStamp = 0
  private queryStamped: number[] = []
  private gridCell = DEFAULT_GRID_CELL
  private staticBoxIndices: number[] = []
  private maxLayers = 5

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
    this.grid.clear()
    this.cellSlots.clear()
    this.heightGrid.clear()
    this.columnHints.clear()
    this.staticBoxIndices.length = 0
  }

  private deactivateBox(index: number) {
    if (index >= 0 && index < this.boxActive.length) {
      this.boxActive[index] = false
    }
  }

  addBox(box: CollisionBox): number {
    const index = this.boxes.length
    this.boxes.push(box)
    this.boxActive.push(true)
    this.insertIntoGrid(index, box.min.x, box.min.z, box.max.x, box.max.z)
    return index
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
    const min = [...cell.bounds.min]
    const max = cell.bounds.max
    const seam = cell.voxelBaseY ?? cell.capBottomY
    const topLayer = this.topmostVoxelLayer(cell)
    if (topLayer !== null) {
      const clipY = seam - topLayer * voxelSize
      min[1] = Math.max(min[1], clipY)
    }
    if (min[1] >= max[1] - 0.01) return null
    return { min, max }
  }

  private computeColumnWalkableTop(
    cell: TerrainCellCollision,
    voxelSize: number,
  ): number | null {
    const seam = cell.voxelBaseY ?? cell.capBottomY
    let top = -Infinity
    for (let layer = 0; layer < this.maxLayers; layer++) {
      if ((cell.layerMask & (1 << layer)) === 0) continue
      top = Math.max(top, seam - layer * voxelSize)
    }
    const surface = this.surfaceCollisionBounds(cell, voxelSize)
    if (surface) top = Math.max(top, surface.max[1]!)
    if (top === -Infinity) return null
    return top
  }

  private updateColumnHint(cell: TerrainCellCollision, voxelSize: number) {
    const top = this.computeColumnWalkableTop(cell, voxelSize)
    if (top === null) this.columnHints.delete(cell.key)
    else this.columnHints.set(cell.key, { x: cell.centerX, z: cell.centerZ, top })
    this.rebuildHeightGridBucket(cell.centerX, cell.centerZ)
  }

  private rebuildHeightGridBucket(centerX: number, centerZ: number) {
    const gx0 = Math.floor(centerX / this.gridCell)
    const gz0 = Math.floor(centerZ / this.gridCell)
    const gk = gridKey(gx0, gz0)
    let maxTop = -Infinity
    for (const hint of this.columnHints.values()) {
      if (Math.floor(hint.x / this.gridCell) !== gx0) continue
      if (Math.floor(hint.z / this.gridCell) !== gz0) continue
      if (hint.top > maxTop) maxTop = hint.top
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
        slots.surface = this.addBox(box)
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

  addStaticFromObject(root: THREE.Object3D, skin = 0.01) {
    const start = this.boxes.length
    appendBoxesFromObject(root, this.boxes, skin)
    while (this.boxActive.length < this.boxes.length) {
      this.boxActive.push(true)
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
          this.queryStamped[idx] = stamp
          const box = this.boxes[idx]!
          if (box.max.y < yMin || box.min.y > yMax) continue
          out.push(idx)
        }
      }
    }
    return out
  }

  /** Walkable top from column hints only when feet overlap that column in XZ. */
  private columnHintAt(
    feetX: number,
    feetZ: number,
    feetY: number,
    radius: number,
    stepHeight: number,
    recoverBelow = 1.85,
  ) {
    const half = this.gridCell * 0.5
    let best: number | null = null
    for (const hint of this.columnHints.values()) {
      if (
        feetX + radius <= hint.x - half ||
        feetX - radius >= hint.x + half ||
        feetZ + radius <= hint.z - half ||
        feetZ - radius >= hint.z + half
      ) {
        continue
      }
      if (hint.top > feetY + stepHeight + 0.05) continue
      if (hint.top < feetY - stepHeight - recoverBelow) continue
      if (best === null || hint.top > best) best = hint.top
    }
    return best
  }

  findGroundTop(
    feetX: number,
    feetY: number,
    feetZ: number,
    radius: number,
    stepHeight: number,
  ): number | null {
    const below = Math.max(stepHeight + 2.5, 4)
    const above = stepHeight + 1.5
    const indices = this.queryNear(
      feetX,
      feetZ,
      radius + 1,
      feetY - below,
      feetY + above,
    )
    let best = findGroundTopInBoxes(
      feetX,
      feetY,
      feetZ,
      radius,
      this.boxes,
      indices,
      stepHeight,
    )
    const hint = this.columnHintAt(feetX, feetZ, feetY, radius, stepHeight)
    if (hint !== null && (best === null || hint > best)) best = hint
    return best
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
}
