import * as THREE from 'three'
import {
  mergeGeometries,
  mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  assignWorldTerrainUVs,
  DEFAULT_TOP_SLOPE_THRESHOLD,
} from './surfaceCapMaterials'
import { buildTerrainBVH, disposeTerrainBVH } from './meshCollider'
import { buildGrassBladeField } from './grassBlades'
import type { TerrainGrid } from './voxelPlacement'

/** Per-chunk instance cap for grass-blade tufts (perf guard). */
const GRASS_BLADE_MAX_PER_CHUNK = 2400

const _matrix = new THREE.Matrix4()
const _fa = new THREE.Vector3()
const _fb = new THREE.Vector3()
const _fc = new THREE.Vector3()
const _fn = new THREE.Vector3()
const _v0 = new THREE.Vector3()
const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()

/** Cells per merged surface block (aligned to terrain grid indices). */
const CELLS_PER_CHUNK_AXIS = 12

/** Pull near-border verts onto the exact cell plane before welding. */
const SNAP_EPS = 0.06
/** Adjacent cell caps often sit a few cm apart at borders. */
const WELD_TOLERANCE = 0.15

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

/** Drop doubled tris from adjacent cell caps that share the same welded vertices. */
function removeDuplicateTriangles(geometry: THREE.BufferGeometry) {
  const index = geometry.getIndex()
  if (!index || index.count < 3) return

  const seen = new Set<string>()
  const kept: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i)
    const ib = index.getX(i + 1)
    const ic = index.getX(i + 2)
    const sorted =
      ia < ib
        ? ib < ic
          ? [ia, ib, ic]
          : ia < ic
            ? [ia, ic, ib]
            : [ic, ia, ib]
        : ia < ic
          ? [ib, ia, ic]
          : ib < ic
            ? [ib, ic, ia]
            : [ic, ib, ia]
    const key = `${sorted[0]},${sorted[1]},${sorted[2]}`
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(ia, ib, ic)
  }
  if (kept.length < index.count) geometry.setIndex(kept)
}

/**
 * Softly bias near-up normals toward straight up.
 * A hard snap at ny≥0.82 drew a dark contour across curved outer caps.
 */
function softenUpFacingNormals(geometry: THREE.BufferGeometry, startNy = 0.7) {
  const nor = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (!nor) return
  const span = Math.max(1e-4, 1 - startNy)
  for (let i = 0; i < nor.count; i++) {
    const nx = nor.getX(i)
    const ny = nor.getY(i)
    const nz = nor.getZ(i)
    if (ny < startNy) continue
    const t = (ny - startNy) / span
    const s = t * t * (3 - 2 * t)
    const mx = nx * (1 - s)
    const my = ny * (1 - s) + s
    const mz = nz * (1 - s)
    const len = Math.hypot(mx, my, mz) || 1
    nor.setXYZ(i, mx / len, my / len, mz / len)
  }
  nor.needsUpdate = true
}

/**
 * Average normals along cell-grid borders so adjacent caps share lighting.
 * This is what kills the shaded "voxel outline" lines on outer curved surfaces.
 */
function softenCellBorderNormals(
  geometry: THREE.BufferGeometry,
  grid: TerrainGrid,
  band = 0.18,
) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  const nor = geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (!pos || !nor) return

  const { minX, minZ, cellSize } = grid
  type Accum = { nx: number; ny: number; nz: number; n: number }
  const buckets = new Map<string, Accum>()
  const vertKeys: (string | null)[] = new Array(pos.count).fill(null)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const relX = x - minX
    const relZ = z - minZ
    const nearestX = Math.round(relX / cellSize) * cellSize
    const nearestZ = Math.round(relZ / cellSize) * cellSize
    const onX = Math.abs(relX - nearestX) < band
    const onZ = Math.abs(relZ - nearestZ) < band
    if (!onX && !onZ) continue

    // Bin along the border so we average local neighborhoods, not the whole plane.
    const yQ = Math.round(y * 5) / 5
    const key =
      onX && onZ
        ? `c:${nearestX}:${nearestZ}:${yQ}`
        : onX
          ? `x:${nearestX}:${yQ}:${Math.round(z * 4) / 4}`
          : `z:${nearestZ}:${yQ}:${Math.round(x * 4) / 4}`
    vertKeys[i] = key
    let a = buckets.get(key)
    if (!a) {
      a = { nx: 0, ny: 0, nz: 0, n: 0 }
      buckets.set(key, a)
    }
    a.nx += nor.getX(i)
    a.ny += nor.getY(i)
    a.nz += nor.getZ(i)
    a.n++
  }

  for (let i = 0; i < pos.count; i++) {
    const key = vertKeys[i]
    if (!key) continue
    const a = buckets.get(key)!
    if (a.n < 2) continue
    const len = Math.hypot(a.nx, a.ny, a.nz) || 1
    const ax = a.nx / len
    const ay = a.ny / len
    const az = a.nz / len
    const nx = nor.getX(i) * 0.2 + ax * 0.8
    const ny = nor.getY(i) * 0.2 + ay * 0.8
    const nz = nor.getZ(i) * 0.2 + az * 0.8
    const nlen = Math.hypot(nx, ny, nz) || 1
    nor.setXYZ(i, nx / nlen, ny / nlen, nz / nlen)
  }
  nor.needsUpdate = true
}

/** Weld cell-border vertices and rebuild normals/UVs to remove grid lighting seams. */
function finalizeMergedSurfaceGeometry(
  geometry: THREE.BufferGeometry,
  worldUnitsPerTile: number,
  grid: TerrainGrid,
): THREE.BufferGeometry {
  snapPositionsToTerrainGrid(geometry, grid)
  if (!geometry.getIndex()) {
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute
    const idx = new Uint32Array(pos.count)
    for (let i = 0; i < pos.count; i++) idx[i] = i
    geometry.setIndex(new THREE.BufferAttribute(idx, 1))
  }
  // NOTE: Do not strip vertical cell-cut walls or down-facing lids here.
  // Wall stripping deleted outer map skirts (missing sides / fall-through).
  // Lid stripping deleted the undersides of surface caps — after digging under
  // a piece and looking up, those faces were gone so the cap looked invisible.
  // Interior grid seams are handled by welding + duplicate-tri removal below.
  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')
  const welded = mergeVertices(geometry, WELD_TOLERANCE)
  geometry.dispose()
  snapPositionsToTerrainGrid(welded, grid)
  removeDuplicateTriangles(welded)
  assignWorldTerrainUVs(welded, worldUnitsPerTile)
  welded.computeVertexNormals()
  softenUpFacingNormals(welded)
  softenCellBorderNormals(welded, grid)
  welded.computeBoundingSphere()
  return welded
}

/**
 * Split welded surface tris into dirt/grass groups on one shared vertex buffer.
 * Classifies by face normal only so adjacent cells always agree at borders.
 */
function assignDirtGrassGroups(
  geometry: THREE.BufferGeometry,
  topSlopeThreshold: number,
): { dirtCount: number; grassCount: number } {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  if (!index || index.count < 3) {
    geometry.clearGroups()
    geometry.addGroup(0, index?.count ?? 0, 0)
    return { dirtCount: index?.count ?? 0, grassCount: 0 }
  }

  const dirt: number[] = []
  const grass: number[] = []
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i)
    const ib = index.getX(i + 1)
    const ic = index.getX(i + 2)
    _fa.fromBufferAttribute(pos, ia)
    _fb.fromBufferAttribute(pos, ib)
    _fc.fromBufferAttribute(pos, ic)
    _fn.subVectors(_fc, _fb)
    _fa.sub(_fb)
    const ny = _fn.cross(_fa).normalize().y
    if (ny >= topSlopeThreshold) grass.push(ia, ib, ic)
    else dirt.push(ia, ib, ic)
  }

  const merged = new Uint32Array(dirt.length + grass.length)
  merged.set(dirt, 0)
  merged.set(grass, dirt.length)
  geometry.setIndex(new THREE.BufferAttribute(merged, 1))
  geometry.clearGroups()
  if (dirt.length > 0) geometry.addGroup(0, dirt.length, 0)
  if (grass.length > 0) geometry.addGroup(dirt.length, grass.length, 1)
  return { dirtCount: dirt.length, grassCount: grass.length }
}

/** Compact grass-only copy for blade scattering (owns its buffers). */
function extractGrassGeometry(
  geometry: THREE.BufferGeometry,
  grassStart: number,
  grassCount: number,
): THREE.BufferGeometry | null {
  if (grassCount < 3) return null
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  if (!index) return null

  const positions: number[] = []
  const indices: number[] = []
  const remap = new Map<number, number>()
  for (let i = 0; i < grassCount; i++) {
    const src = index.getX(grassStart + i)
    let dst = remap.get(src)
    if (dst === undefined) {
      dst = remap.size
      remap.set(src, dst)
      positions.push(pos.getX(src), pos.getY(src), pos.getZ(src))
    }
    indices.push(dst)
  }
  const grass = new THREE.BufferGeometry()
  grass.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(new Float32Array(positions), 3),
  )
  grass.setIndex(indices)
  grass.computeBoundingSphere()
  return grass
}

export type SurfaceChunkCell = {
  key: string
  ix: number
  iy: number
  centerX: number
  centerZ: number
  surfaceRoot?: THREE.Object3D
  /** Remaining full-cube voxel layers. */
  layerMask?: number
  /** Remaining partial surface-piece layers (bits). */
  surfaceLayerMask?: number
  voxelBaseY?: number
  capBottomY?: number
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
  private voxelSize = 5
  private maxLayers = 5
  /** Face normal Y ≥ this → grass (world-consistent across cell borders). */
  private topSlopeThreshold = DEFAULT_TOP_SLOPE_THRESHOLD

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

  /** Update grass-vs-dirt slope cutoff; caller should rebuild dirty/all chunks. */
  setTopSlopeThreshold(threshold: number) {
    this.topSlopeThreshold = threshold
  }

  /** Voxel column layout for clipping merged surface meshes after digging. */
  setDigClipParams(voxelSize: number, maxLayers: number) {
    this.voxelSize = voxelSize
    this.maxLayers = maxLayers
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
  flushDirtyChunked(
    budgetMs = 6,
    onComplete?: () => void,
    onProgress?: (done: number, total: number) => void,
  ) {
    if (this.dirtyChunkIds.size === 0) {
      onComplete?.()
      return
    }
    const gen = ++this.flushGen
    const ids = [...this.dirtyChunkIds]
    this.dirtyChunkIds.clear()
    const total = ids.length
    let index = 0
    const step = () => {
      if (gen !== this.flushGen) {
        // A newer flush superseded this one — still settle waiters.
        onComplete?.()
        return
      }
      const t0 = performance.now()
      while (index < ids.length && performance.now() - t0 < budgetMs) {
        this.rebuildChunk(ids[index++]!)
      }
      onProgress?.(index, total)
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
    const prevGrass = this.chunkGrassGeometry.get(id)
    if (prevGrass) {
      prevGrass.dispose()
      this.chunkGrassGeometry.delete(id)
    }

    const cells = this.chunks.get(id)
    if (!cells) return

    // Merge every cell into one buffer first so dirt/grass share welded verts —
    // separate material meshes left T-junction seams on curved outer caps.
    const cellGeos: THREE.BufferGeometry[] = []

    for (const cell of cells) {
      if (!cell.surfaceRoot) continue
      if (this.digPreviewCell?.key === cell.key) continue
      if ((cell.surfaceLayerMask ?? 0) === 0) {
        cell.surfaceRoot.visible = false
        continue
      }
      // Bake full subtree world matrices (matrixAutoUpdate is off on frozen roots).
      cell.surfaceRoot.traverse((node) => {
        node.updateMatrix()
        node.matrixWorldNeedsUpdate = true
      })
      cell.surfaceRoot.updateMatrixWorld(true)
      cell.surfaceRoot.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const layer = child.userData.surfaceLayer as number | undefined
        if (layer !== undefined) {
          if (((cell.surfaceLayerMask ?? 0) & (1 << layer)) === 0) return
          appendMeshGeometry(child, cellGeos, null)
        } else {
          const clipMaxY = surfaceMeshClipMaxY(cell, this.voxelSize, this.maxLayers)
          appendMeshGeometry(child, cellGeos, clipMaxY)
        }
      })
      cell.surfaceRoot.visible = false
    }

    const meshes: THREE.Mesh[] = []
    const mergedRaw = cellGeos.length > 0 ? mergeGeometries(cellGeos, false) : null
    for (const g of cellGeos) g.dispose()

    if (mergedRaw) {
      const merged = finalizeMergedSurfaceGeometry(
        mergedRaw,
        this.worldUnitsPerTile,
        this.grid,
      )
      const { dirtCount, grassCount } = assignDirtGrassGroups(
        merged,
        this.topSlopeThreshold,
      )
      buildTerrainBVH(merged)

      let material: THREE.Material | THREE.Material[]
      let kind: 'dirt' | 'grass' | 'both'
      if (dirtCount > 0 && grassCount > 0) {
        material = [this.dirtMaterial, this.grassMaterial]
        kind = 'both'
      } else if (grassCount > 0) {
        merged.clearGroups()
        merged.addGroup(0, grassCount, 0)
        material = this.grassMaterial
        kind = 'grass'
      } else {
        merged.clearGroups()
        merged.addGroup(0, dirtCount, 0)
        material = this.dirtMaterial
        kind = 'dirt'
      }

      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = true
      mesh.matrixAutoUpdate = false
      mesh.updateMatrixWorld(true)
      mesh.userData.chunkCells = cells.filter((c) => c.surfaceRoot)
      mesh.userData.surfaceKind = kind
      meshes.push(mesh)
      this.group.add(mesh)

      if (grassCount > 0) {
        const grassGeo = extractGrassGeometry(merged, dirtCount, grassCount)
        if (grassGeo) this.chunkGrassGeometry.set(id, grassGeo)
      }
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
      for (const mesh of meshes) {
        const kind = mesh.userData.surfaceKind as 'dirt' | 'grass' | 'both' | undefined
        if (kind === 'both' || Array.isArray(mesh.material)) {
          mesh.material = [dirt, grass]
        } else if (kind === 'grass') {
          mesh.material = grass
        } else {
          mesh.material = dirt
        }
      }
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
    for (const geo of this.chunkGrassGeometry.values()) geo.dispose()
    this.chunkGrassGeometry.clear()
  }
}

/**
 * Max world Y for merged surface collision mesh after digging.
 * Layer 0 is the top voxel; only clip when upper layers were removed (topLayer > 0).
 * Using topLayer === 0 would clip at the seam and delete the intact surface cap.
 */
function surfaceMeshClipMaxY(
  cell: SurfaceChunkCell,
  voxelSize: number,
  maxLayers: number,
): number | null {
  const mask = cell.layerMask
  if (mask === undefined) return null
  let topLayer: number | null = null
  for (let layer = 0; layer < maxLayers; layer++) {
    if ((mask & (1 << layer)) !== 0) {
      topLayer = layer
      break
    }
  }
  if (topLayer === null || topLayer === 0) return null
  const seam = cell.voxelBaseY ?? cell.capBottomY
  if (seam === undefined) return null
  return seam - topLayer * voxelSize
}

/** Collect world-space mesh triangles (material split happens after chunk weld). */
function appendMeshGeometry(
  mesh: THREE.Mesh,
  out: THREE.BufferGeometry[],
  clipMaxY: number | null = null,
) {
  const geo = mesh.geometry
  const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return

  _matrix.copy(mesh.matrixWorld)

  const clipY = clipMaxY
  const clipEps = 0.04

  if (geo.index) {
    const indexArr = geo.index.array
    const kept: number[] = []
    const triCount = geo.index.count
    for (let t = 0; t < triCount; t += 3) {
      const i0 = indexArr[t]!
      const i1 = indexArr[t + 1]!
      const i2 = indexArr[t + 2]!
      const y0 = pos.getY(i0)
      const y1 = pos.getY(i1)
      const y2 = pos.getY(i2)
      _v0.set(pos.getX(i0), y0, pos.getZ(i0)).applyMatrix4(_matrix)
      _v1.set(pos.getX(i1), y1, pos.getZ(i1)).applyMatrix4(_matrix)
      _v2.set(pos.getX(i2), y2, pos.getZ(i2)).applyMatrix4(_matrix)
      const cy = (_v0.y + _v1.y + _v2.y) / 3
      if (clipY !== null && cy > clipY + clipEps) continue
      kept.push(i0, i1, i2)
    }
    if (kept.length === 0) return
    const sub = new THREE.BufferGeometry()
    sub.setIndex(kept)
    sub.setAttribute('position', pos.clone())
    const normal = geo.getAttribute('normal')
    if (normal) sub.setAttribute('normal', normal.clone())
    const uv = geo.getAttribute('uv')
    if (uv) sub.setAttribute('uv', uv.clone())
    sub.applyMatrix4(_matrix)
    out.push(sub)
    return
  }

  const sub = new THREE.BufferGeometry()
  sub.setAttribute('position', pos.clone())
  const normal = geo.getAttribute('normal')
  if (normal) sub.setAttribute('normal', normal.clone())
  const uv = geo.getAttribute('uv')
  if (uv) sub.setAttribute('uv', uv.clone())
  sub.applyMatrix4(_matrix)
  if (clipY !== null) {
    const p = sub.getAttribute('position') as THREE.BufferAttribute
    const kept: number[] = []
    for (let t = 0; t < p.count; t += 3) {
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3
      if (cy > clipY + clipEps) continue
      kept.push(t, t + 1, t + 2)
    }
    if (kept.length === 0) {
      sub.dispose()
      return
    }
    const clipped = new THREE.BufferGeometry()
    const positions = new Float32Array(kept.length * 3)
    for (let i = 0; i < kept.length; i++) {
      positions[i * 3] = p.getX(kept[i]!)
      positions[i * 3 + 1] = p.getY(kept[i]!)
      positions[i * 3 + 2] = p.getZ(kept[i]!)
    }
    clipped.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    sub.dispose()
    out.push(clipped)
    return
  }

  out.push(sub)
}
