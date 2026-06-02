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
  /** Seam Y for voxel stack; aligned to cap_bottom_y on the grid. */
  voxelBaseY?: number
  layerMask: number
  instanceIndex: number
  _voxelVisible?: boolean
  surfaceRoot?: THREE.Object3D
  bounds?: { min: number[]; max: number[] }
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

/** Snap cap seam to whole-number voxel layers (5 m steps). */
export function voxelStackBase(capBottomY: number, voxelSize: number) {
  return Math.round(capBottomY / voxelSize) * voxelSize
}

export function voxelSeamY(cell: VoxelPlacementCell, voxelSize: number) {
  return cell.voxelBaseY ?? voxelStackBase(cell.capBottomY, voxelSize)
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
  cell.voxelBaseY = voxelStackBase(cell.capBottomY, voxelSize)

  if (!cell.surfaceRoot) return

  const { x: x0, z: z0 } = cellWorldOrigin(grid, cell.ix, cell.iy)
  const x1 = x0 + grid.cellSize
  const z1 = z0 + grid.cellSize
  const targetY = cell.capBottomY

  const root = cell.surfaceRoot
  _cellBox.setFromObject(root)

  let dx = 0
  let dy = 0
  let dz = 0
  if (Math.abs(_cellBox.min.x - x0) < GRID_FACE_NUDGE) dx = x0 - _cellBox.min.x
  else if (Math.abs(_cellBox.min.x - x1) < GRID_FACE_NUDGE) dx = x1 - _cellBox.min.x
  if (Math.abs(_cellBox.min.y - targetY) < GRID_FACE_NUDGE) dy = targetY - _cellBox.min.y
  if (Math.abs(_cellBox.min.z - z0) < GRID_FACE_NUDGE) dz = z0 - _cellBox.min.z
  else if (Math.abs(_cellBox.min.z - z1) < GRID_FACE_NUDGE) dz = z1 - _cellBox.min.z

  if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9 || Math.abs(dz) > 1e-9) {
    root.position.x += dx
    root.position.y += dy
    root.position.z += dz
    root.updateMatrixWorld(true)
    _cellBox.setFromObject(root)
  }

  cell.bounds = {
    min: [_cellBox.min.x, _cellBox.min.y, _cellBox.min.z],
    max: [_cellBox.max.x, _cellBox.max.y, _cellBox.max.z],
  }
}

/** Full grid columns under each loaded surface cap. */
export function refineVoxelPlacement(
  cells: Iterable<VoxelPlacementCell>,
  grid: TerrainGrid,
  voxelSize: number,
  layerCount: number,
) {
  const mask = layerCount > 0 ? (1 << layerCount) - 1 : 0
  for (const cell of cells) {
    if (!cell.surfaceRoot) continue
    alignSurfaceToCellGrid(cell, grid, voxelSize)
    cell.layerMask = mask
  }
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
