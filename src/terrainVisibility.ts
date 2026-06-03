import * as THREE from 'three'
import type { SurfaceChunkManager, SurfaceChunkCell } from './surfaceChunks'
import type { VoxelInstancer, VoxelCellRef } from './voxelInstancing'

/** Fallback radii (overridden per quality tier by the graphics slider). */
export const DEFAULT_VOXEL_RADIUS = 58
export const DEFAULT_CHUNK_RADIUS = 95

export type VisibilityCell = SurfaceChunkCell & VoxelCellRef

export type VisibilityContext = {
  cells: Map<string, VisibilityCell>
  /** `cellGrid[ix][iy]` for O(ring) updates instead of scanning every cell. */
  cellGrid: (VisibilityCell | undefined)[][]
  gridMinX: number
  gridMinZ: number
  cellSize: number
  gridSpan: number
  surfaceChunks: SurfaceChunkManager
  voxelInstancer: VoxelInstancer
  voxelSize: number
  layerCount: number
  /** Quality-driven cull distance (m) for surface chunk meshes. */
  chunkRadius: number
  /** Quality-driven cull distance (m) for underground voxel columns. */
  voxelRadius: number
  /** Cells with voxel layers currently shown (for hide-when-left-range). */
  voxelVisibleSet: Set<VisibilityCell>
}

function worldToCellIndex(
  p: number,
  gridMin: number,
  cellSize: number,
  gridSpan: number,
): number {
  return THREE.MathUtils.clamp(Math.floor((p - gridMin) / cellSize), 0, gridSpan - 1)
}

/** Distance culling for chunk meshes, source roots (raycast), and voxel instances. */
export function updateTerrainVisibility(
  px: number,
  pz: number,
  ctx: VisibilityContext,
) {
  const {
    cellGrid,
    gridMinX,
    gridMinZ,
    cellSize,
    gridSpan,
    surfaceChunks,
    voxelInstancer,
    voxelSize,
    layerCount,
    voxelVisibleSet,
  } = ctx
  const chunkRadius = ctx.chunkRadius
  const voxelRadius = ctx.voxelRadius
  const voxelRadiusSq = voxelRadius * voxelRadius
  const cellRing = Math.ceil(voxelRadius / cellSize) + 1

  for (const mesh of surfaceChunks.group.children) {
    if (!(mesh instanceof THREE.Mesh)) continue
    const bs = mesh.geometry.boundingSphere
    if (!bs) {
      mesh.visible = true
      continue
    }
    const dx = bs.center.x - px
    const dz = bs.center.z - pz
    const r = bs.radius + chunkRadius
    mesh.visible = dx * dx + dz * dz < r * r
  }

  const pix = worldToCellIndex(px, gridMinX, cellSize, gridSpan)
  const piy = worldToCellIndex(pz, gridMinZ, cellSize, gridSpan)

  for (let dix = -cellRing; dix <= cellRing; dix++) {
    const ix = pix + dix
    if (ix < 0 || ix >= gridSpan) continue
    const row = cellGrid[ix]
    if (!row) continue
    for (let diy = -cellRing; diy <= cellRing; diy++) {
      const iy = piy + diy
      if (iy < 0 || iy >= gridSpan) continue
      const cell = row[iy]
      if (!cell) continue

      const dx = cell.centerX - px
      const dz = cell.centerZ - pz
      const distSq = dx * dx + dz * dz

      const wantVoxel = distSq < voxelRadiusSq
      if (cell._voxelVisible === wantVoxel) continue
      cell._voxelVisible = wantVoxel
      if (wantVoxel) voxelVisibleSet.add(cell)
      else voxelVisibleSet.delete(cell)

      for (let layer = 0; layer < layerCount; layer++) {
        if (!voxelInstancer.hasLayer(cell, layer)) continue
        voxelInstancer.setLayerVisible(cell, layer, wantVoxel, voxelSize)
      }
    }
  }

  // Hide voxels that were shown earlier but are now outside cull distance.
  for (const cell of voxelVisibleSet) {
    const dx = cell.centerX - px
    const dz = cell.centerZ - pz
    if (dx * dx + dz * dz < voxelRadiusSq) continue
    cell._voxelVisible = false
    voxelVisibleSet.delete(cell)
    for (let layer = 0; layer < layerCount; layer++) {
      if (!voxelInstancer.hasLayer(cell, layer)) continue
      voxelInstancer.setLayerVisible(cell, layer, false, voxelSize)
    }
  }
}
