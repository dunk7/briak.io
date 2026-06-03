import * as THREE from 'three'
import {
  mergeGeometries,
  mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { assignWorldTerrainUVs } from './surfaceCapMaterials'
import { buildTerrainBVH, disposeTerrainBVH } from './meshCollider'
import { buildGrassBladeField } from './grassBlades'
import type { TerrainGrid } from './voxelPlacement'

/** Per-chunk instance cap for grass-blade tufts (perf guard). */
const GRASS_BLADE_MAX_PER_CHUNK = 3200

const _matrix = new THREE.Matrix4()

/** Cells per merged surface block (aligned to terrain grid indices). */
const CELLS_PER_CHUNK_AXIS = 6

const SNAP_EPS = 0.02
const WELD_TOLERANCE = 0.05

/** Nudge verts already on a cell face onto the exact grid plane (seam weld only). */
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
  /** Grass-blade tufts live in a separate group (kept out of collision/dig picks). */
  readonly bladeGroup = new THREE.Group()
  private readonly grid: TerrainGrid
  private readonly chunks = new Map<string, SurfaceChunkCell[]>()
  private readonly chunkMeshes = new Map<string, THREE.Mesh[]>()
  /** Merged grass geometry per chunk, kept so blades can be (re)built on demand. */
  private readonly chunkGrassGeometry = new Map<string, THREE.BufferGeometry>()
  private readonly chunkBlades = new Map<string, THREE.InstancedMesh>()
  private grassBladesEnabled = false
  private grassBladeDensity = 0
  private grassTuftCluster = 0
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
    this.bladeGroup.matrixAutoUpdate = false
    this.bladeGroup.updateMatrixWorld(true)
  }

  /** Enable/disable scattered grass blades, density (tufts/m²), and clump amount (0–1). */
  setGrassBlades(enabled: boolean, density: number, clump = 0) {
    if (
      this.grassBladesEnabled === enabled &&
      this.grassBladeDensity === density &&
      this.grassTuftCluster === clump
    ) {
      return
    }
    this.grassBladesEnabled = enabled
    this.grassBladeDensity = density
    this.grassTuftCluster = clump
    for (const id of this.chunkGrassGeometry.keys()) {
      this.buildBladesForChunk(id)
    }
  }

  private disposeBladesForChunk(id: string) {
    const mesh = this.chunkBlades.get(id)
    if (!mesh) return
    this.bladeGroup.remove(mesh)
    mesh.dispose()
    this.chunkBlades.delete(id)
  }

  private buildBladesForChunk(id: string) {
    this.disposeBladesForChunk(id)
    if (!this.grassBladesEnabled) return
    const geo = this.chunkGrassGeometry.get(id)
    if (!geo) return
    const mesh = buildGrassBladeField(geo, {
      density: this.grassBladeDensity,
      maxInstances: GRASS_BLADE_MAX_PER_CHUNK,
      clump: this.grassTuftCluster,
    })
    if (!mesh) return
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = true
    mesh.matrixAutoUpdate = false
    mesh.updateMatrixWorld(true)
    this.bladeGroup.add(mesh)
    this.chunkBlades.set(id, mesh)
  }

  /** Hide blade tufts beyond `bladeRadius` (much shorter than terrain draw distance). */
  cullBlades(px: number, pz: number, bladeRadius: number) {
    if (bladeRadius <= 0) {
      for (const mesh of this.chunkBlades.values()) mesh.visible = false
      return
    }
    for (const mesh of this.chunkBlades.values()) {
      const bs = mesh.boundingSphere
      if (!bs) {
        mesh.visible = false
        continue
      }
      const dx = bs.center.x - px
      const dz = bs.center.z - pz
      // Chunk center must be within blade radius (small margin for chunk footprint).
      const margin = Math.min(bs.radius * 0.25, 6)
      mesh.visible = dx * dx + dz * dz <= (bladeRadius + margin) ** 2
      if (!mesh.visible) continue
      // Near the fade edge, drop to a cheaper material path if we add LOD later.
      mesh.frustumCulled = true
    }
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
  /** Cell shown solo while digging; excluded from merged chunk meshes. */
  private digPreviewCell: SurfaceChunkCell | null = null

  markDirtyForCell(cell: SurfaceChunkCell) {
    this.dirtyChunkIds.add(this.chunkId(cell))
  }

  /** Peel one cell out of the chunk batch so it can wobble in place while digging. */
  setDigPreviewCell(cell: SurfaceChunkCell | null) {
    if (this.digPreviewCell?.key === cell?.key) return
    const prev = this.digPreviewCell
    this.digPreviewCell = cell
    if (prev) this.rebuildChunk(this.chunkId(prev))
    if (cell) this.rebuildChunk(this.chunkId(cell))
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
        disposeTerrainBVH(mesh.geometry)
        mesh.geometry.dispose()
      }
      this.chunkMeshes.delete(id)
    }
    this.disposeBladesForChunk(id)
    this.chunkGrassGeometry.delete(id)

    const cells = this.chunks.get(id)
    if (!cells) return

    const dirtGeos: THREE.BufferGeometry[] = []
    const grassGeos: THREE.BufferGeometry[] = []

    for (const cell of cells) {
      if (!cell.surfaceRoot) continue
      if (this.digPreviewCell?.key === cell.key) continue
      cell.surfaceRoot.updateWorldMatrix(true, false)
      cell.surfaceRoot.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        appendMeshGeometry(child, dirtGeos, grassGeos)
      })
      cell.surfaceRoot.visible = false
    }

    const meshes: THREE.Mesh[] = []
    const mergedDirtRaw =
      dirtGeos.length > 0 ? mergeGeometries(dirtGeos, false) : null
    if (mergedDirtRaw) {
      const mergedDirt = finalizeMergedSurfaceGeometry(
        mergedDirtRaw,
        this.worldUnitsPerTile,
        this.grid,
      )
      buildTerrainBVH(mergedDirt)
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

    const mergedGrassRaw =
      grassGeos.length > 0 ? mergeGeometries(grassGeos, false) : null
    if (mergedGrassRaw) {
      const mergedGrass = finalizeMergedSurfaceGeometry(
        mergedGrassRaw,
        this.worldUnitsPerTile,
        this.grid,
      )
      buildTerrainBVH(mergedGrass)
      const mesh = new THREE.Mesh(mergedGrass, this.grassMaterial)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = true
      mesh.matrixAutoUpdate = false
      mesh.updateMatrixWorld(true)
      meshes.push(mesh)
      this.group.add(mesh)
      this.chunkGrassGeometry.set(id, mergedGrass)
    }
    for (const g of grassGeos) g.dispose()

    for (const mesh of meshes) {
      mesh.userData.chunkCells = cells.filter((c) => c.surfaceRoot)
    }

    if (meshes.length > 0) {
      this.chunkMeshes.set(id, meshes)
    }

    this.buildBladesForChunk(id)
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
        disposeTerrainBVH(mesh.geometry)
        mesh.geometry.dispose()
        this.group.remove(mesh)
      }
    }
    this.chunkMeshes.clear()
    for (const id of [...this.chunkBlades.keys()]) {
      this.disposeBladesForChunk(id)
    }
    this.chunkGrassGeometry.clear()
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
