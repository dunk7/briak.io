import * as THREE from 'three'
import {
  mergeGeometries,
  mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { assignWorldTerrainUVs } from './surfaceCapMaterials'
import type { TerrainGrid } from './voxelPlacement'

const _matrix = new THREE.Matrix4()

/** Cells per merged surface block (aligned to terrain grid indices). */
const CELLS_PER_CHUNK_AXIS = 6

const SNAP_EPS = 0.12
const WELD_TOLERANCE = 0.05

/** Snap verts on cell faces to exact grid planes so neighbors share coordinates. */
function snapPositionsToTerrainGrid(
  geometry: THREE.BufferGeometry,
  grid: TerrainGrid,
) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return

  const { minX, minZ, cellSize } = grid
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let z = pos.getZ(i)
    const relX = x - minX
    const relZ = z - minZ
    const nearestX = Math.round(relX / cellSize) * cellSize
    const nearestZ = Math.round(relZ / cellSize) * cellSize
    if (Math.abs(relX - nearestX) < SNAP_EPS) x = minX + nearestX
    if (Math.abs(relZ - nearestZ) < SNAP_EPS) z = minZ + nearestZ
    pos.setXYZ(i, x, pos.getY(i), z)
  }
  pos.needsUpdate = true
}

/** Weld cell-border vertices and rebuild normals/UVs to remove grid lighting seams. */
function finalizeMergedSurfaceGeometry(
  geometry: THREE.BufferGeometry,
  worldUnitsPerTile: number,
  grid: TerrainGrid,
): THREE.BufferGeometry {
  snapPositionsToTerrainGrid(geometry, grid)
  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')
  const welded = mergeVertices(geometry, WELD_TOLERANCE)
  geometry.dispose()
  snapPositionsToTerrainGrid(welded, grid)
  assignWorldTerrainUVs(welded, worldUnitsPerTile)
  welded.computeVertexNormals()
  welded.computeBoundingSphere()
  return welded
}

export type SurfaceChunkCell = {
  key: string
  ix: number
  iy: number
  centerX: number
  centerZ: number
  surfaceRoot?: THREE.Object3D
}

/** Merges nearby surface GLTF meshes into draw-call batches aligned to the terrain grid. */
export class SurfaceChunkManager {
  readonly group = new THREE.Group()
  private readonly grid: TerrainGrid
  private readonly chunks = new Map<string, SurfaceChunkCell[]>()
  private readonly chunkMeshes = new Map<string, THREE.Mesh[]>()
  private dirtMaterial: THREE.Material
  private grassMaterial: THREE.Material
  private readonly worldUnitsPerTile: number

  constructor(
    grid: TerrainGrid,
    dirtMaterial: THREE.Material,
    grassMaterial: THREE.Material,
    worldUnitsPerTile: number,
  ) {
    this.grid = grid
    this.dirtMaterial = dirtMaterial
    this.grassMaterial = grassMaterial
    this.worldUnitsPerTile = worldUnitsPerTile
    this.group.matrixAutoUpdate = false
    this.group.updateMatrixWorld(true)
  }

  private chunkId(cell: SurfaceChunkCell) {
    const cx = Math.floor(cell.ix / CELLS_PER_CHUNK_AXIS)
    const cz = Math.floor(cell.iy / CELLS_PER_CHUNK_AXIS)
    return `${cx},${cz}`
  }

  registerCell(cell: SurfaceChunkCell) {
    const id = this.chunkId(cell)
    let list = this.chunks.get(id)
    if (!list) {
      list = []
      this.chunks.set(id, list)
    }
    list.push(cell)
  }

  buildAll() {
    for (const id of this.chunks.keys()) {
      this.rebuildChunk(id)
    }
  }

  rebuildForCell(cell: SurfaceChunkCell) {
    this.rebuildChunk(this.chunkId(cell))
  }

  private readonly dirtyChunkIds = new Set<string>()
  private flushGen = 0

  markDirtyForCell(cell: SurfaceChunkCell) {
    this.dirtyChunkIds.add(this.chunkId(cell))
  }

  flushDirty() {
    if (this.dirtyChunkIds.size === 0) return
    for (const id of this.dirtyChunkIds) {
      this.rebuildChunk(id)
    }
    this.dirtyChunkIds.clear()
  }

  /** Rebuild dirty chunks across frames so the game loop stays responsive. */
  flushDirtyChunked(budgetMs = 6, onComplete?: () => void) {
    if (this.dirtyChunkIds.size === 0) {
      onComplete?.()
      return
    }
    const gen = ++this.flushGen
    const ids = [...this.dirtyChunkIds]
    this.dirtyChunkIds.clear()
    let index = 0
    const step = () => {
      if (gen !== this.flushGen) return
      const t0 = performance.now()
      while (index < ids.length && performance.now() - t0 < budgetMs) {
        this.rebuildChunk(ids[index++]!)
      }
      if (index < ids.length) {
        requestAnimationFrame(step)
      } else {
        onComplete?.()
      }
    }
    requestAnimationFrame(step)
  }

  private rebuildChunk(id: string) {
    const prev = this.chunkMeshes.get(id)
    if (prev) {
      for (const mesh of prev) {
        this.group.remove(mesh)
        mesh.geometry.dispose()
      }
      this.chunkMeshes.delete(id)
    }

    const cells = this.chunks.get(id)
    if (!cells) return

    const dirtGeos: THREE.BufferGeometry[] = []
    const grassGeos: THREE.BufferGeometry[] = []

    for (const cell of cells) {
      if (!cell.surfaceRoot) continue
      cell.surfaceRoot.updateWorldMatrix(true, false)
      cell.surfaceRoot.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        appendMeshGeometry(child, dirtGeos, grassGeos)
      })
      cell.surfaceRoot.visible = false
    }

    const meshes: THREE.Mesh[] = []
    const mergedDirtRaw = mergeGeometries(dirtGeos, false)
    if (mergedDirtRaw) {
      const mergedDirt = finalizeMergedSurfaceGeometry(
        mergedDirtRaw,
        this.worldUnitsPerTile,
        this.grid,
      )
      const mesh = new THREE.Mesh(mergedDirt, this.dirtMaterial)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = true
      mesh.matrixAutoUpdate = false
      mesh.updateMatrixWorld(true)
      meshes.push(mesh)
      this.group.add(mesh)
    }
    for (const g of dirtGeos) g.dispose()

    const mergedGrassRaw = mergeGeometries(grassGeos, false)
    if (mergedGrassRaw) {
      const mergedGrass = finalizeMergedSurfaceGeometry(
        mergedGrassRaw,
        this.worldUnitsPerTile,
        this.grid,
      )
      const mesh = new THREE.Mesh(mergedGrass, this.grassMaterial)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = true
      mesh.matrixAutoUpdate = false
      mesh.updateMatrixWorld(true)
      meshes.push(mesh)
      this.group.add(mesh)
    }
    for (const g of grassGeos) g.dispose()

    for (const mesh of meshes) {
      mesh.userData.chunkCells = cells.filter((c) => c.surfaceRoot)
    }

    if (meshes.length > 0) {
      this.chunkMeshes.set(id, meshes)
    }
  }

  setMaterials(dirt: THREE.Material, grass: THREE.Material) {
    this.dirtMaterial = dirt
    this.grassMaterial = grass
    for (const meshes of this.chunkMeshes.values()) {
      if (meshes.length >= 1) meshes[0]!.material = dirt
      if (meshes.length >= 2) meshes[1]!.material = grass
    }
  }

  dispose() {
    for (const meshes of this.chunkMeshes.values()) {
      for (const mesh of meshes) {
        mesh.geometry.dispose()
        this.group.remove(mesh)
      }
    }
    this.chunkMeshes.clear()
  }
}

function appendMeshGeometry(
  mesh: THREE.Mesh,
  dirtGeos: THREE.BufferGeometry[],
  grassGeos: THREE.BufferGeometry[],
) {
  const geo = mesh.geometry
  const pos = geo.getAttribute('position')
  if (!pos) return

  _matrix.copy(mesh.matrixWorld)

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  const groups =
    geo.groups.length > 0
      ? geo.groups
      : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }]

  for (const group of groups) {
    const sub = new THREE.BufferGeometry()
    if (geo.index) {
      const indexArr = geo.index.array
      const slice = new Uint32Array(
        indexArr.subarray(group.start, group.start + group.count),
      )
      sub.setIndex(new THREE.BufferAttribute(slice, 1))
    }
    sub.setAttribute('position', pos.clone())
    const normal = geo.getAttribute('normal')
    if (normal) sub.setAttribute('normal', normal.clone())
    const uv = geo.getAttribute('uv')
    if (uv) sub.setAttribute('uv', uv.clone())
    sub.applyMatrix4(_matrix)

    const matIndex = group.materialIndex ?? 0
    const isGrass = materials.length > 1 && matIndex === 1
    if (isGrass) grassGeos.push(sub)
    else dirtGeos.push(sub)
  }
}
