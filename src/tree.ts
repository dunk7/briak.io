import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const TRUNK_COLOR = 0x5c3a22
const TRUNK_EMISSIVE = 0x1a0f08
const FOLIAGE_COLOR = 0x58a042
const FOLIAGE_EMISSIVE = 0x0a1808

const FOLIAGE_NAMES = new Set(['Icosphere'])

const _box = new THREE.Box3()
const _rayOrigin = new THREE.Vector3()
const _down = new THREE.Vector3(0, -1, 0)
const _raycaster = new THREE.Raycaster()

export const DEFAULT_TREE_MAX_HEIGHT_DELTA = 1.25
export const DEFAULT_TREE_SAMPLE_RADIUS = 4
export const DEFAULT_TREE_COUNT = 4

export type TreeCellMeta = {
  ix: number
  iy: number
  center_x: number
  center_y: number
  cap_top_y: number
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

function createTreeMaterial(color: number, emissive: number) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
    emissive,
    emissiveIntensity: 0.18,
  })
}

export function applyTreeMaterials(root: THREE.Object3D) {
  const trunkMaterial = createTreeMaterial(TRUNK_COLOR, TRUNK_EMISSIVE)
  const foliageMaterial = createTreeMaterial(FOLIAGE_COLOR, FOLIAGE_EMISSIVE)

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.material = FOLIAGE_NAMES.has(child.name) ? foliageMaterial : trunkMaterial
    child.castShadow = true
    child.receiveShadow = true
  })
}

function trunkBottomY(root: THREE.Object3D): number | null {
  root.updateWorldMatrix(true, true)
  let bottom = Infinity

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    if (FOLIAGE_NAMES.has(child.name)) return
    _box.setFromObject(child)
    bottom = Math.min(bottom, _box.min.y)
  })

  return Number.isFinite(bottom) ? bottom : null
}

/** Load at the model's authored scale (1 Blender unit = 1 world unit). */
export async function loadTreeModel(url: string): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url)
  const model = gltf.scene
  applyTreeMaterials(model)

  const bottom = trunkBottomY(model)
  if (bottom !== null) {
    model.position.y -= bottom
  } else {
    model.updateWorldMatrix(true, true)
    _box.setFromObject(model)
    model.position.y -= _box.min.y
  }

  const wrapper = new THREE.Group()
  wrapper.add(model)
  return wrapper
}

function raycastGroundY(x: number, z: number, surface: THREE.Object3D): number | null {
  _rayOrigin.set(x, 500, z)
  _raycaster.near = 0
  _raycaster.set(_rayOrigin, _down)
  _raycaster.far = 500

  const hits = _raycaster.intersectObject(surface, true)
  return hits.length > 0 ? hits[0].point.y : null
}

/**
 * Height range across center + ring samples. Lower = flatter; null if terrain missing.
 */
export function measureTerrainFlatness(
  x: number,
  z: number,
  surface: THREE.Object3D,
  sampleRadius: number,
): number | null {
  const centerY = raycastGroundY(x, z, surface)
  if (centerY === null) return null

  let minY = centerY
  let maxY = centerY
  const sampleCount = 8

  for (let i = 0; i < sampleCount; i++) {
    const angle = (i / sampleCount) * Math.PI * 2
    const sx = x + Math.cos(angle) * sampleRadius
    const sz = z + Math.sin(angle) * sampleRadius
    const y = raycastGroundY(sx, sz, surface)
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
  let minY = cell.cap_top_y
  let maxY = cell.cap_top_y
  const sampleCount = 8

  for (let i = 0; i < sampleCount; i++) {
    const angle = (i / sampleCount) * Math.PI * 2
    const dIx = Math.round((Math.cos(angle) * sampleRadius) / cellSize)
    const dIy = Math.round((Math.sin(angle) * sampleRadius) / cellSize)
    const neighbor = cells[`${cell.ix + dIx}_${cell.iy + dIy}`]
    if (!neighbor) return null
    minY = Math.min(minY, neighbor.cap_top_y)
    maxY = Math.max(maxY, neighbor.cap_top_y)
  }

  return maxY - minY
}

/** Raycast the terrain surface so trees sit on actual mesh height, not cell metadata max. */
export function resolveTreeGroundY(
  placements: TreePlacement[],
  surface: THREE.Object3D,
): void {
  for (const spot of placements) {
    const y = raycastGroundY(spot.x, spot.z, surface)
    if (y !== null) spot.y = y
  }
}

export type TreePlacement = {
  x: number
  y: number
  z: number
  rotationY?: number
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

/** Pick the flattest well-spaced cells; skips spawn and its neighbors. */
export function findTreePlacements(
  cells: Record<string, TreeCellMeta>,
  spawnIx: number,
  spawnIy: number,
  options: TreeSpawnOptions,
  cellSize: number,
): TreePlacement[] {
  const minSpacing = options.minCellSpacing ?? 2
  const candidates: { cell: TreeCellMeta; flatness: number }[] = []

  for (const cell of Object.values(cells)) {
    if (Math.abs(cell.ix - spawnIx) <= 1 && Math.abs(cell.iy - spawnIy) <= 1) continue

    const flatness = measureFlatnessFromMeta(
      cell,
      cells,
      options.sampleRadius,
      cellSize,
    )
    if (flatness === null || flatness > options.maxHeightDelta) continue

    candidates.push({ cell, flatness })
  }

  candidates.sort((a, b) => a.flatness - b.flatness)

  const picked: { ix: number; iy: number }[] = [{ ix: spawnIx, iy: spawnIy }]
  const placements: TreePlacement[] = []

  for (const { cell } of candidates) {
    if (placements.length >= options.treeCount) break
    if (!cellSpacingOk(cell.ix, cell.iy, picked, minSpacing)) continue

    picked.push({ ix: cell.ix, iy: cell.iy })
    placements.push({
      x: cell.center_x,
      y: cell.cap_top_y,
      z: cell.center_y,
      rotationY: rotationForCell(cell.ix, cell.iy),
    })
  }

  return placements
}

export function placeTrees(
  template: THREE.Group,
  placements: TreePlacement[],
  parent: THREE.Object3D,
): THREE.Group[] {
  const trees: THREE.Group[] = []

  for (const spot of placements) {
    const tree = template.clone(true)
    tree.position.set(spot.x, spot.y, spot.z)
    if (spot.rotationY !== undefined) tree.rotation.y = spot.rotationY
    parent.add(tree)
    trees.push(tree)
  }

  return trees
}
