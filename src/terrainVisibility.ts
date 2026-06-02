import * as THREE from 'three'
import type { SurfaceChunkManager, SurfaceChunkCell } from './surfaceChunks'
import type { VoxelInstancer, VoxelCellRef } from './voxelInstancing'

const VOXEL_RADIUS = 58
const VOXEL_RADIUS_SQ = VOXEL_RADIUS * VOXEL_RADIUS
const CHUNK_RADIUS = 95

export type VisibilityContext = {
  cells: Map<string, SurfaceChunkCell & VoxelCellRef>
  surfaceChunks: SurfaceChunkManager
  voxelInstancer: VoxelInstancer
  voxelSize: number
  layerCount: number
}

/** Distance culling for chunk meshes, source roots (raycast), and voxel instances. */
export function updateTerrainVisibility(
  px: number,
  pz: number,
  ctx: VisibilityContext,
) {
  const { cells, surfaceChunks, voxelInstancer, voxelSize, layerCount } = ctx

  for (const mesh of surfaceChunks.group.children) {
    if (!(mesh instanceof THREE.Mesh)) continue
    const bs = mesh.geometry.boundingSphere
    if (!bs) {
      mesh.visible = true
      continue
    }
    const dx = bs.center.x - px
    const dz = bs.center.z - pz
    const r = bs.radius + CHUNK_RADIUS
    mesh.visible = dx * dx + dz * dz < r * r
  }

  for (const cell of cells.values()) {
    const dx = cell.centerX - px
    const dz = cell.centerZ - pz
    const distSq = dx * dx + dz * dz

    const wantVoxel = distSq < VOXEL_RADIUS_SQ
    if (cell._voxelVisible === wantVoxel) continue
    cell._voxelVisible = wantVoxel

    for (let layer = 0; layer < layerCount; layer++) {
      if (!voxelInstancer.hasLayer(cell, layer)) continue
      voxelInstancer.setLayerVisible(cell, layer, wantVoxel, voxelSize)
    }
  }
}
