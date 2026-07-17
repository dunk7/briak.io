import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applySurfaceCapMaterials } from './surfaceCapMaterials'
import { alignSurfaceToCellGrid, type TerrainGrid } from './voxelPlacement'
import type { SurfaceChunkManager } from './surfaceChunks'

/** Parallel GLTF fetches during boot — scale with cores, cap to avoid thrash. */
export const SURFACE_LOAD_CONCURRENCY = Math.min(
  32,
  Math.max(
    16,
    (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8) * 2,
  ),
)
/** @deprecated Boot now loads the full map; kept for any external callers. */
export const MAX_INITIAL_SURFACE_CELLS = 36

export type SurfaceCellMeta = {
  ix: number
  iy: number
  file: string
  center_x: number
  center_y: number
}

export type SurfaceLoadCell = {
  key: string
  ix: number
  iy: number
  centerX: number
  centerZ: number
  capBottomY: number
  bounds?: { min: number[]; max: number[] }
  surfaceRoot?: THREE.Object3D
}

export type SurfaceLoadContext = {
  gltfLoader: GLTFLoader
  cells: Map<string, SurfaceLoadCell>
  surfaceGroup: THREE.Group
  dirtMaterial: THREE.MeshStandardMaterial
  grassMaterial: THREE.MeshStandardMaterial
  terrainWorldUnitsPerTile: number
  voxelSize: number
  terrainGrid: TerrainGrid
  topSlopeThreshold: number
  surfaceChunks: SurfaceChunkManager
  tagWithCellKey: (root: THREE.Object3D, key: string) => void
}

export function cellKey(ix: number, iy: number) {
  return `${ix}_${iy}`
}

/** Tag GLB children named `layer_N` / `lN` for per-layer dig and chunk merge. */
export function tagSurfaceLayerMeshes(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (typeof child.userData.surfaceLayer === 'number') return
    const name = child.name.toLowerCase()
    const layerMatch = name.match(/layer[_-]?(\d+)/) ?? name.match(/^l(\d+)$/)
    if (layerMatch) child.userData.surfaceLayer = Number(layerMatch[1])
  })
}

/**
 * Disable matrixAutoUpdate on every node in a static subtree so the renderer's
 * per-frame scene.updateMatrixWorld() stops recomposing local matrices for it.
 *
 * Do NOT set matrixWorldAutoUpdate=false — that makes updateMatrixWorld(true)
 * skip world multiplies entirely, which breaks chunk merges, BVH collision, and
 * frustum bounds (missing faces / falling through the ground).
 *
 * Call only after the subtree's world matrices are already up to date.
 * Scene force-cascades are avoided via scene.matrixAutoUpdate=false.
 */
export function freezeSubtreeMatrices(root: THREE.Object3D) {
  root.traverse((node) => {
    node.matrixAutoUpdate = false
  })
}

/**
 * Recompose local + world matrices after moving a frozen (matrixAutoUpdate off)
 * object — dig preview, grid align, chunk extract.
 */
export function refreshFrozenMatrixWorld(root: THREE.Object3D) {
  root.traverse((node) => {
    node.updateMatrix()
    node.matrixWorldNeedsUpdate = true
  })
  root.updateMatrixWorld(true)
}

/** Update world matrices whether the subtree uses auto-update or not. */
export function ensureMatrixWorld(root: THREE.Object3D) {
  if (root.matrixAutoUpdate === false) {
    refreshFrozenMatrixWorld(root)
    return
  }
  root.updateMatrixWorld(true)
}

/** Temporarily allow TRS → matrix updates (dig wobble / rock physics). */
export function thawSubtreeMatrices(root: THREE.Object3D) {
  root.traverse((node) => {
    node.matrixAutoUpdate = true
  })
}

/** Nearest cells first so spawn ground finishes early within a full-map load. */
export function sortSurfaceCellsByDistance<T extends SurfaceCellMeta>(
  metas: T[],
  spawnX: number,
  spawnZ: number,
): T[] {
  return [...metas].sort((a, b) => {
    const da = (a.center_x - spawnX) ** 2 + (a.center_y - spawnZ) ** 2
    const db = (b.center_x - spawnX) ** 2 + (b.center_y - spawnZ) ** 2
    return da - db
  })
}

export function sortSurfaceCellsBySpawn<T extends SurfaceCellMeta>(
  metas: T[],
  spawnX: number,
  spawnZ: number,
): { priority: T[]; deferred: T[] } {
  const sorted = sortSurfaceCellsByDistance(metas, spawnX, spawnZ)
  return {
    priority: sorted.slice(0, MAX_INITIAL_SURFACE_CELLS),
    deferred: sorted.slice(MAX_INITIAL_SURFACE_CELLS),
  }
}

export async function runLoadPool<T>(
  items: readonly T[],
  concurrency: number,
  loadOne: (item: T) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (items.length === 0) {
    onProgress?.(0, 0)
    return
  }
  let next = 0
  let done = 0
  const total = items.length
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= total) break
      await loadOne(items[i]!)
      done++
      onProgress?.(done, total)
    }
  }
  const workers = Math.min(concurrency, total)
  await Promise.all(Array.from({ length: workers }, () => worker()))
}

export function loadSurfaceCell(
  cellMeta: SurfaceCellMeta,
  ctx: SurfaceLoadContext,
): Promise<void> {
  const key = cellKey(cellMeta.ix, cellMeta.iy)
  const cell = ctx.cells.get(key)
  if (!cell) return Promise.resolve()

  const url = `/assets/terrain/surface_pieces/${cellMeta.file}`
  return new Promise((resolve) => {
    ctx.gltfLoader.load(
      url,
      (gltf) => {
        const root = gltf.scene
        tagSurfaceLayerMeshes(root)
        // Skip a full scene clone for slope-refresh sources — refreshing
        // re-clones surfaceRoot and re-applies materials instead. That saves
        // one deep clone per cell during the cold-load path (~1.8k GLBs).
        applySurfaceCapMaterials(
          root,
          ctx.dirtMaterial,
          ctx.grassMaterial,
          ctx.terrainWorldUnitsPerTile,
          undefined,
          undefined,
          ctx.topSlopeThreshold,
        )
        ctx.tagWithCellKey(root, key)
        cell.surfaceRoot = root
        root.visible = false
        root.updateMatrixWorld(true)
        ctx.surfaceGroup.add(root)
        alignSurfaceToCellGrid(cell, ctx.terrainGrid, ctx.voxelSize)
        // These per-cell roots are static once placed (merged into chunk meshes
        // and invisible). Freezing matrixAutoUpdate on the WHOLE subtree — not
        // just the root — stops scene.updateMatrixWorld() from recomposing every
        // descendant mesh's local matrix on every frame.
        freezeSubtreeMatrices(root)
        ctx.surfaceChunks.registerCell(cell)
        ctx.surfaceChunks.markDirtyForCell(cell)
        resolve()
      },
      undefined,
      (err) => {
        console.error('Failed to load', url, err)
        resolve()
      },
    )
  })
}

