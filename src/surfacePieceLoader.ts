import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applySurfaceCapMaterials } from './surfaceCapMaterials'
import { alignSurfaceToCellGrid, type TerrainGrid } from './voxelPlacement'
import type { SurfaceChunkManager } from './surfaceChunks'

export const SURFACE_LOAD_CONCURRENCY = 12
/** Nearest surface cells to load before the game is playable. */
export const MAX_INITIAL_SURFACE_CELLS = 80

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
  surfaceSource?: THREE.Object3D
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

export function sortSurfaceCellsBySpawn<T extends SurfaceCellMeta>(
  metas: T[],
  spawnX: number,
  spawnZ: number,
): { priority: T[]; deferred: T[] } {
  const sorted = [...metas].sort((a, b) => {
    const da = (a.center_x - spawnX) ** 2 + (a.center_y - spawnZ) ** 2
    const db = (b.center_x - spawnX) ** 2 + (b.center_y - spawnZ) ** 2
    return da - db
  })
  return {
    priority: sorted.slice(0, MAX_INITIAL_SURFACE_CELLS),
    deferred: sorted.slice(MAX_INITIAL_SURFACE_CELLS),
  }
}

export async function runLoadPool<T>(
  items: readonly T[],
  concurrency: number,
  loadOne: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let next = 0
  const worker = async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      await loadOne(items[i]!)
    }
  }
  const workers = Math.min(concurrency, items.length)
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
        const pristine = root.clone()
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
        root.matrixAutoUpdate = false
        root.updateMatrixWorld(true)
        ctx.surfaceGroup.add(root)
        alignSurfaceToCellGrid(cell, ctx.terrainGrid, ctx.voxelSize)
        ctx.surfaceChunks.registerCell(cell)
        ctx.surfaceChunks.markDirtyForCell(cell)
        queueSurfaceSource(cell, pristine)
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

const pendingSources: { cell: SurfaceLoadCell; source: THREE.Object3D }[] = []
let idleFlushScheduled = false

function queueSurfaceSource(cell: SurfaceLoadCell, source: THREE.Object3D) {
  pendingSources.push({ cell, source })
  scheduleIdleSourceFlush()
}

function scheduleIdleSourceFlush() {
  if (idleFlushScheduled) return
  idleFlushScheduled = true
  const run = () => {
    idleFlushScheduled = false
    const batch = pendingSources.splice(0, 16)
    for (const { cell, source } of batch) {
      cell.surfaceSource = source
    }
    if (pendingSources.length > 0) scheduleIdleSourceFlush()
  }
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2000 })
  } else {
    setTimeout(run, 0)
  }
}

/** Assign any queued grass-slope source clones immediately (e.g. before slope refresh). */
export function flushPendingSurfaceSources() {
  while (pendingSources.length > 0) {
    const batch = pendingSources.splice(0, pendingSources.length)
    for (const { cell, source } of batch) {
      cell.surfaceSource = source
    }
  }
}
