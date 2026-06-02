import * as THREE from 'three'

/** Slight XZ overlap so instanced voxel faces do not show hairline cracks. */
export const VOXEL_FACE_OVERLAP = 0.04

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

/**
 * Snap the loaded cap mesh to the integer cell corner on the terrain grid and
 * lock the voxel seam to metadata so columns line up with neighbors.
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
  const targetY = cell.capBottomY

  const root = cell.surfaceRoot
  _cellBox.setFromObject(root)

  const dx = x0 - _cellBox.min.x
  const dy = targetY - _cellBox.min.y
  const dz = z0 - _cellBox.min.z
  if (Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6 || Math.abs(dz) > 1e-6) {
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
