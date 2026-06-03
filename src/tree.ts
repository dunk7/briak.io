import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { sampleMeshGroundY, type MeshGroundTargets } from './terrainGroundRay'

const TRUNK_EMISSIVE = 0x140b06
const FOLIAGE_EMISSIVE = 0x081406

/** Bark tones — the lower trunk blob reads darker/rooty, the upper one warmer. */
const TRUNK_PALETTE = [0x4a2f1c, 0x66421f]
/** Distinct canopy greens so the morphed icospheres layer with depth. */
const FOLIAGE_PALETTE = [0x4d9234, 0x5da642, 0x6cb84e]

/** World scale applied when placing trees (authored GLB is 1 unit = 1 world unit). */
const TREE_SCALE = 0.55

const _box = new THREE.Box3()
const _rayHits: THREE.Intersection[] = []
const RAY_ORIGIN_Y = 500
const RAYCAST_FAR = 1200

export {
  DEFAULT_TREE_COUNT,
  DEFAULT_TREE_MAX_HEIGHT_DELTA,
  DEFAULT_TREE_SAMPLE_RADIUS,
} from './tuneDefaults'

export type TreeCellMeta = {
  ix: number
  iy: number
  center_x: number
  center_y: number
  cap_top_y: number
  bounds?: { min: number[]; max: number[] }
}

/** Walkable surface height; `cap_top_y` is the voxel lip and sits above the mesh top. */
export function cellSurfaceY(cell: TreeCellMeta): number {
  return cell.bounds?.max[1] ?? cell.cap_top_y
}

export type TreeSpawnOptions = {
  /** Max height spread (world units) across the sample ring; lower = stricter. */
  maxHeightDelta: number
  /** Radius (world units) of the flatness check around each candidate. */
  sampleRadius: number
  /** How many trees to place. */
  treeCount: number
  /** Minimum grid-cell distance between trees and spawn. */
  minCellSpacing?: number
}

function createTreeMaterial(emissive: number) {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 0.92,
    metalness: 0,
    emissive,
    emissiveIntensity: 0.16,
  })
}

function hashUnit(i: number): number {
  let n = (i * 374761393) & 0xffffffff
  n = (n ^ (n >> 13)) * 1274126177
  return ((n ^ (n >> 16)) >>> 0) / 4294967295
}

/**
 * Bake per-vertex shading into a mesh: darker toward the blob's base (ambient
 * occlusion fake) plus light grain, multiplied onto a linear base color. Keeps
 * the faceted flat-shaded look while adding organic variation.
 */
function bakeBlobColors(
  geometry: THREE.BufferGeometry,
  baseHex: number,
  bottomDarken: number,
  grain: number,
) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  geometry.computeBoundingBox()
  const bb = geometry.boundingBox!
  const minY = bb.min.y
  const range = bb.max.y - bb.min.y || 1

  const base = new THREE.Color(baseHex)
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const fy = (pos.getY(i) - minY) / range
    const shade = 1 - bottomDarken * (1 - fy)
    const jitter = (hashUnit(i + 1) - 0.5) * 2 * grain
    const m = THREE.MathUtils.clamp(shade + jitter, 0.2, 1.25)
    colors[i * 3] = base.r * m
    colors[i * 3 + 1] = base.g * m
    colors[i * 3 + 2] = base.b * m
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

type TreeMeshClass = { mesh: THREE.Mesh; foliage: boolean }

/** Number of lowest meshes treated as the (brown) trunk; the rest are leaves. */
const TRUNK_MESH_COUNT = 2

/**
 * Sort meshes into trunk vs foliage by height: the lowest `TRUNK_MESH_COUNT`
 * meshes are the trunk pieces, the rest are the leaf icospheres above them.
 * (Robust to however the GLB names its meshes.)
 */
function classifyTreeMeshes(root: THREE.Object3D): TreeMeshClass[] {
  const withBottom: { mesh: THREE.Mesh; bottom: number }[] = []
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    _box.setFromObject(child)
    withBottom.push({ mesh: child, bottom: _box.min.y })
  })

  withBottom.sort((a, b) => a.bottom - b.bottom)
  // With ≤2 meshes everything is trunk; otherwise leaves are everything above.
  const trunkCount = Math.min(TRUNK_MESH_COUNT, Math.max(0, withBottom.length - 1))
  return withBottom.map((m, idx) => ({ mesh: m.mesh, foliage: idx >= trunkCount }))
}

export function applyTreeMaterials(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  const classified = classifyTreeMeshes(root)

  const trunkMaterial = createTreeMaterial(TRUNK_EMISSIVE)
  const foliageMaterial = createTreeMaterial(FOLIAGE_EMISSIVE)

  let trunkIdx = 0
  let foliageIdx = 0
  for (const { mesh, foliage } of classified) {
    if (foliage) {
      const hex = FOLIAGE_PALETTE[foliageIdx % FOLIAGE_PALETTE.length]!
      bakeBlobColors(mesh.geometry, hex, 0.42, 0.06)
      mesh.material = foliageMaterial
      foliageIdx++
    } else {
      const hex = TRUNK_PALETTE[trunkIdx % TRUNK_PALETTE.length]!
      bakeBlobColors(mesh.geometry, hex, 0.3, 0.05)
      mesh.material = trunkMaterial
      trunkIdx++
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.treeFoliage = foliage
  }
}

function trunkBottomY(root: THREE.Object3D): number | null {
  root.updateWorldMatrix(true, true)
  let bottom = Infinity

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (child.userData.treeFoliage) return
    _box.setFromObject(child)
    bottom = Math.min(bottom, _box.min.y)
  })

  return Number.isFinite(bottom) ? bottom : null
}

function alignModelToGround(model: THREE.Object3D, bottomY: number | null) {
  if (bottomY !== null) {
    model.position.y -= bottomY
  } else {
    model.updateWorldMatrix(true, true)
    _box.setFromObject(model)
    model.position.y -= _box.min.y
  }
}

/** Load at the model's authored scale (1 Blender unit = 1 world unit). */
export async function loadTreeModel(url: string): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const model = gltf.scene
  applyTreeMaterials(model)
  alignModelToGround(model, trunkBottomY(model))

  const wrapper = new THREE.Group()
  wrapper.add(model)
  return wrapper
}

const BERRY_EMISSIVE = 0x280840
const BERRY_PALETTE = [0x8b4fd4, 0xa066e8, 0x7038b8, 0xc090f8]

function applyBerryMaterials(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 0.35,
    metalness: 0.08,
    emissive: BERRY_EMISSIVE,
    emissiveIntensity: 0.28,
  })

  let idx = 0
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const hex = BERRY_PALETTE[idx % BERRY_PALETTE.length]!
    bakeBlobColors(child.geometry, hex, 0.28, 0.05)
    child.material = material
    child.castShadow = true
    child.receiveShadow = true
    idx++
  })
}

/** Purple berry cluster authored to align with the tree GLB at the same origin. */
export async function loadTreeBerriesModel(url: string): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const model = gltf.scene
  applyBerryMaterials(model)

  const wrapper = new THREE.Group()
  wrapper.add(model)
  return wrapper
}

function raycastGroundY(x: number, z: number, targets: MeshGroundTargets): number | null {
  return sampleMeshGroundY(x, z, RAY_ORIGIN_Y, targets, _rayHits, RAYCAST_FAR, {
    intersectInvisibleChunks: true,
  })
}

/**
 * Height range across center + ring samples. Lower = flatter; null if terrain missing.
 */
export function measureTerrainFlatness(
  x: number,
  z: number,
  targets: MeshGroundTargets,
  sampleRadius: number,
): number | null {
  const centerY = raycastGroundY(x, z, targets)
  if (centerY === null) return null

  let minY = centerY
  let maxY = centerY
  const sampleCount = 8

  for (let i = 0; i < sampleCount; i++) {
    const angle = (i / sampleCount) * Math.PI * 2
    const sx = x + Math.cos(angle) * sampleRadius
    const sz = z + Math.sin(angle) * sampleRadius
    const y = raycastGroundY(sx, sz, targets)
    if (y === null) return null
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }

  return maxY - minY
}

/**
 * Height range from neighboring cell cap tops (no raycasts).
 * Matches the ring samples used by measureTerrainFlatness.
 */
export function measureFlatnessFromMeta(
  cell: TreeCellMeta,
  cells: Record<string, TreeCellMeta>,
  sampleRadius: number,
  cellSize: number,
): number | null {
  let minY = cellSurfaceY(cell)
  let maxY = cellSurfaceY(cell)
  const sampleCount = 8

  for (let i = 0; i < sampleCount; i++) {
    const angle = (i / sampleCount) * Math.PI * 2
    const dIx = Math.round((Math.cos(angle) * sampleRadius) / cellSize)
    const dIy = Math.round((Math.sin(angle) * sampleRadius) / cellSize)
    const neighbor = cells[`${cell.ix + dIx}_${cell.iy + dIy}`]
    if (!neighbor) return null
    const ny = cellSurfaceY(neighbor)
    minY = Math.min(minY, ny)
    maxY = Math.max(maxY, ny)
  }

  return maxY - minY
}

/** Raycast merged chunk meshes so trees sit on the visible surface, not hidden cell roots. */
export function resolveTreeGroundY(
  placements: TreePlacement[],
  surface: THREE.Object3D,
  chunkRoot?: THREE.Object3D,
): void {
  const targets: MeshGroundTargets = { surface, chunkRoot }
  for (const spot of placements) {
    const y = raycastGroundY(spot.x, spot.z, targets)
    if (y !== null) spot.y = y
  }
}

export type TreePlacement = {
  x: number
  y: number
  z: number
  rotationY?: number
  /** ~1/5 of trees carry crystal berries (stable per cell). */
  hasBerries?: boolean
}

/** Fraction of trees that spawn with crystal berries. */
export const BERRY_TREE_FRACTION = 0.2

export function hasCrystalBerriesForCell(ix: number, iy: number): boolean {
  return hashUnit(ix * 48271 + iy * 8191) < BERRY_TREE_FRACTION
}

function cellSpacingOk(
  ix: number,
  iy: number,
  others: { ix: number; iy: number }[],
  minSpacing: number,
): boolean {
  for (const o of others) {
    if (Math.max(Math.abs(ix - o.ix), Math.abs(iy - o.iy)) < minSpacing) return false
  }
  return true
}

function rotationForCell(ix: number, iy: number): number {
  return ((ix * 17 + iy * 31) % 628) / 100
}

/** Stable horizontal offset within a cell so respawns don't jump around. */
function offsetXZForCell(ix: number, iy: number, cellSize: number) {
  const spread = cellSize * 0.42
  const ox = (hashUnit(ix * 7919 + iy * 104729) * 2 - 1) * spread
  const oz = (hashUnit(ix * 109 + iy * 1009) * 2 - 1) * spread
  return { ox, oz }
}

/** Pick flat, well-spaced cells spread across the map; skips spawn and its neighbors. */
export function findTreePlacements(
  cells: Record<string, TreeCellMeta>,
  spawnIx: number,
  spawnIy: number,
  options: TreeSpawnOptions,
  cellSize: number,
): TreePlacement[] {
  const minSpacing = options.minCellSpacing ?? 4
  const pool: { cell: TreeCellMeta; flatness: number }[] = []

  for (const cell of Object.values(cells)) {
    if (Math.abs(cell.ix - spawnIx) <= 1 && Math.abs(cell.iy - spawnIy) <= 1) continue

    const flatness = measureFlatnessFromMeta(
      cell,
      cells,
      options.sampleRadius,
      cellSize,
    )
    if (flatness === null || flatness > options.maxHeightDelta) continue

    pool.push({ cell, flatness })
  }

  const picked: { ix: number; iy: number }[] = [{ ix: spawnIx, iy: spawnIy }]
  const placements: TreePlacement[] = []

  // Farthest-from-existing placement so trees spread across the whole map.
  while (placements.length < options.treeCount && pool.length > 0) {
    let bestIdx = -1
    let bestSep = -1

    for (let i = 0; i < pool.length; i++) {
      const { cell } = pool[i]!
      if (!cellSpacingOk(cell.ix, cell.iy, picked, minSpacing)) continue

      let minSep = Infinity
      for (const p of picked) {
        const sep = Math.max(Math.abs(cell.ix - p.ix), Math.abs(cell.iy - p.iy))
        if (sep < minSep) minSep = sep
      }
      if (minSep > bestSep) {
        bestSep = minSep
        bestIdx = i
      }
    }

    if (bestIdx < 0) break

    const { cell } = pool.splice(bestIdx, 1)[0]!
    picked.push({ ix: cell.ix, iy: cell.iy })
    const { ox, oz } = offsetXZForCell(cell.ix, cell.iy, cellSize)
    placements.push({
      x: cell.center_x + ox,
      y: cellSurfaceY(cell),
      z: cell.center_y + oz,
      rotationY: rotationForCell(cell.ix, cell.iy),
      hasBerries: hasCrystalBerriesForCell(cell.ix, cell.iy),
    })
  }

  return placements
}

export function placeTrees(
  template: THREE.Group,
  placements: TreePlacement[],
  parent: THREE.Object3D,
  berriesTemplate?: THREE.Group,
): THREE.Group[] {
  const trees: THREE.Group[] = []

  for (const spot of placements) {
    const tree = template.clone(true)
    tree.position.set(spot.x, spot.y, spot.z)
    if (spot.rotationY !== undefined) tree.rotation.y = spot.rotationY
    tree.scale.setScalar(TREE_SCALE)
    if (spot.hasBerries && berriesTemplate) {
      const berries = berriesTemplate.clone(true)
      const treeModelY = template.children[0]?.position.y ?? 0
      const berriesModel = berries.children[0]
      if (berriesModel) berriesModel.position.y = treeModelY
      tree.add(berries)
      tree.userData.hasCrystalBerries = true
    }
    parent.add(tree)
    trees.push(tree)
  }

  return trees
}
