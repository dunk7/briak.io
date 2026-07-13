import * as THREE from 'three'

/** Extra XZ size on voxel boxes; keep at 0 — overlap reads as stacked blocks clipping. */
export const VOXEL_FACE_OVERLAP = 0

export type TerrainGrid = {
  minX: number
  minZ: number
  cellSize: number
}

export type VoxelPlacementCell = {
  key: string
  ix: number
  iy: number
  centerX: number
  centerZ: number
  capBottomY: number
  /** Top of layer 0 on the uniform grid (voxel_top_y). */
  voxelBaseY?: number
  /** Full-cube diggable voxels. */
  layerMask: number
  /** Partial atmosphere-cut cells with smooth surface meshes. */
  surfaceLayerMask?: number
  /** Subset of layerMask bits that are iron ore instead of dirt. */
  oreLayerMask?: number
  /** Subset of layerMask bits that are gold ore instead of dirt. */
  goldOreLayerMask?: number
  /** Subset of layerMask bits that are diamond ore instead of dirt. */
  diamondOreLayerMask?: number
  instanceIndex: number
  _voxelVisible?: boolean
  surfaceRoot?: THREE.Object3D
  bounds?: { min: number[]; max: number[] }
}

export type OreType = 'iron' | 'gold' | 'diamond'

/** Chance each underground dirt voxel is replaced with iron ore. */
export const IRON_ORE_CHANCE = 0.0175
/** Gold is half as common as iron. */
export const GOLD_ORE_CHANCE = IRON_ORE_CHANCE / 2
/** Diamond is half as common as gold. */
export const DIAMOND_ORE_CHANCE = GOLD_ORE_CHANCE / 2

/** Deterministic 0–1 hash from cell key + layer (stable across reloads). */
export function oreChanceHash(cellKey: string, layer: number): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < cellKey.length; i++) {
    h ^= cellKey.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= (layer + 1) * 374761393
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h >>> 0) / 4294967296
}

const _composePos = new THREE.Vector3()
const _composeQuat = new THREE.Quaternion()
const _composeScale = new THREE.Vector3(1, 1, 1)
const _cellBox = new THREE.Box3()

export function cellWorldOrigin(grid: TerrainGrid, ix: number, iy: number) {
  return {
    x: grid.minX + ix * grid.cellSize,
    z: grid.minZ + iy * grid.cellSize,
  }
}

/** Snap a Y value to the voxel grid. */
export function voxelStackBase(y: number, voxelSize: number) {
  return Math.round(y / voxelSize) * voxelSize
}

export function voxelSeamY(cell: VoxelPlacementCell, voxelSize: number) {
  return cell.voxelBaseY ?? voxelStackBase(cell.capBottomY + voxelSize, voxelSize)
}

/** World Y of the top face of a layer (layer 0 top = seam). */
export function layerTopY(cell: VoxelPlacementCell, layer: number, voxelSize: number) {
  return voxelSeamY(cell, voxelSize) - layer * voxelSize
}

/** World Y band for a layer: [bottom, top]. */
export function layerYRange(
  cell: VoxelPlacementCell,
  layer: number,
  voxelSize: number,
): { y0: number; y1: number } {
  const y1 = layerTopY(cell, layer, voxelSize)
  return { y0: y1 - voxelSize, y1 }
}

/** Map a world Y to the layer index in this column (0 = top). */
export function layerIndexAtY(
  cell: VoxelPlacementCell,
  y: number,
  voxelSize: number,
  maxLayers: number,
): number {
  const seam = voxelSeamY(cell, voxelSize)
  const raw = Math.floor((seam - y) / voxelSize)
  if (raw < 0) return 0
  if (raw >= maxLayers) return maxLayers - 1
  return raw
}

/** Sub-millimeter nudge when a face was snapped to the grid during export. */
const GRID_FACE_NUDGE = 0.02

/**
 * Lock the voxel seam to metadata and record the cap mesh AABB.
 * Pieces are exported in world space; do not pull partial caps to the cell corner.
 */
export function alignSurfaceToCellGrid(
  cell: Pick<
    VoxelPlacementCell,
    'ix' | 'iy' | 'capBottomY' | 'surfaceRoot' | 'bounds' | 'voxelBaseY'
  >,
  grid: TerrainGrid,
  voxelSize: number,
) {
  if (cell.voxelBaseY === undefined) {
    cell.voxelBaseY = voxelStackBase(cell.capBottomY + voxelSize, voxelSize)
  }

  if (!cell.surfaceRoot) return

  const { x: x0, z: z0 } = cellWorldOrigin(grid, cell.ix, cell.iy)
  const x1 = x0 + grid.cellSize
  const z1 = z0 + grid.cellSize

  const root = cell.surfaceRoot
  _cellBox.setFromObject(root)

  let dx = 0
  let dz = 0
  if (Math.abs(_cellBox.min.x - x0) < GRID_FACE_NUDGE) dx = x0 - _cellBox.min.x
  else if (Math.abs(_cellBox.min.x - x1) < GRID_FACE_NUDGE) dx = x1 - _cellBox.min.x
  if (Math.abs(_cellBox.min.z - z0) < GRID_FACE_NUDGE) dz = z0 - _cellBox.min.z
  else if (Math.abs(_cellBox.min.z - z1) < GRID_FACE_NUDGE) dz = z1 - _cellBox.min.z

  if (Math.abs(dx) > 1e-9 || Math.abs(dz) > 1e-9) {
    root.position.x += dx
    root.position.z += dz
    // matrixAutoUpdate may already be off (post-freeze re-align) — bake local TRS.
    root.updateMatrix()
    root.updateMatrixWorld(true)
    _cellBox.setFromObject(root)
  }

  cell.bounds = {
    min: [_cellBox.min.x, _cellBox.min.y, _cellBox.min.z],
    max: [_cellBox.max.x, _cellBox.max.y, _cellBox.max.z],
  }
}

export type VoxelMaskCell = VoxelPlacementCell & {
  voxelLayerMask?: number
  surfaceLayerMask?: number
  voxelTopY?: number
}

/**
 * Apply baked full/partial masks. Full cubes → layerMask; partials → surfaceLayerMask.
 * Ore only rolls on full-cube voxel layers (mutually exclusive iron / gold / diamond).
 */
export function refineVoxelPlacement(
  cells: Iterable<VoxelMaskCell>,
  grid: TerrainGrid,
  voxelSize: number,
  layerCount: number,
) {
  const goldEnd = DIAMOND_ORE_CHANCE + GOLD_ORE_CHANCE
  const ironEnd = goldEnd + IRON_ORE_CHANCE

  for (const cell of cells) {
    if (cell.voxelTopY !== undefined) {
      cell.voxelBaseY = voxelStackBase(cell.voxelTopY, voxelSize)
    } else if (cell.voxelBaseY === undefined) {
      cell.voxelBaseY = voxelStackBase(cell.capBottomY + voxelSize, voxelSize)
    }

    if (cell.surfaceRoot) {
      alignSurfaceToCellGrid(cell, grid, voxelSize)
    }

    const voxelMask =
      cell.voxelLayerMask !== undefined
        ? cell.voxelLayerMask
        : cell.layerMask !== 0
          ? cell.layerMask
          : layerCount > 0
            ? (1 << layerCount) - 1
            : 0
    cell.layerMask = voxelMask

    if (cell.surfaceLayerMask === undefined) cell.surfaceLayerMask = 0

    let iron = 0
    let gold = 0
    let diamond = 0
    for (let layer = 0; layer < layerCount; layer++) {
      if ((voxelMask & (1 << layer)) === 0) continue
      const roll = oreChanceHash(cell.key, layer)
      const bit = 1 << layer
      if (roll < DIAMOND_ORE_CHANCE) diamond |= bit
      else if (roll < goldEnd) gold |= bit
      else if (roll < ironEnd) iron |= bit
    }
    cell.oreLayerMask = iron
    cell.goldOreLayerMask = gold
    cell.diamondOreLayerMask = diamond
  }
}

export function cellHasIronOre(cell: VoxelPlacementCell, layer: number): boolean {
  return ((cell.oreLayerMask ?? 0) & (1 << layer)) !== 0
}

export function cellHasGoldOre(cell: VoxelPlacementCell, layer: number): boolean {
  return ((cell.goldOreLayerMask ?? 0) & (1 << layer)) !== 0
}

export function cellHasDiamondOre(cell: VoxelPlacementCell, layer: number): boolean {
  return ((cell.diamondOreLayerMask ?? 0) & (1 << layer)) !== 0
}

export function cellOreType(cell: VoxelPlacementCell, layer: number): OreType | null {
  if (cellHasDiamondOre(cell, layer)) return 'diamond'
  if (cellHasGoldOre(cell, layer)) return 'gold'
  if (cellHasIronOre(cell, layer)) return 'iron'
  return null
}

export function cellHasSurfaceLayer(cell: VoxelPlacementCell, layer: number): boolean {
  return ((cell.surfaceLayerMask ?? 0) & (1 << layer)) !== 0
}

export function clearSurfaceLayer(cell: VoxelPlacementCell, layer: number) {
  cell.surfaceLayerMask = (cell.surfaceLayerMask ?? 0) & ~(1 << layer)
}

export function composeVoxelMatrix(
  cell: VoxelPlacementCell,
  layer: number,
  voxelSize: number,
  out: THREE.Matrix4,
) {
  const base = voxelSeamY(cell, voxelSize)
  const y = base - (layer + 0.5) * voxelSize
  _composePos.set(cell.centerX, y, cell.centerZ)
  out.compose(_composePos, _composeQuat, _composeScale)
}

export function voxelWorldBox(
  cell: VoxelPlacementCell,
  layer: number,
  voxelSize: number,
  out: THREE.Box3,
) {
  const base = voxelSeamY(cell, voxelSize)
  const y = base - (layer + 0.5) * voxelSize
  const half = voxelSize * 0.5
  const xzPad = VOXEL_FACE_OVERLAP * 0.5
  out.min.set(cell.centerX - half - xzPad, y - half, cell.centerZ - half - xzPad)
  out.max.set(cell.centerX + half + xzPad, y + half, cell.centerZ + half + xzPad)
  return out
}
