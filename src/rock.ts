import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const ROCK_MODEL_URLS = [
  '/assets/rock1.glb',
  '/assets/rock2.glb',
  '/assets/rock3.glb',
] as const

const _box = new THREE.Box3()
const _rayOrigin = new THREE.Vector3()
const _down = new THREE.Vector3(0, -1, 0)
const _raycaster = new THREE.Raycaster()

export const DEFAULT_ROCK_CLUMP_COUNT = 14
export const DEFAULT_ROCKS_PER_CLUMP = 4
export const DEFAULT_ROCK_CLUMP_RADIUS = 2.5
export const DEFAULT_ROCK_CLUMP_SPACING = 3

export type RockCellMeta = {
  ix: number
  iy: number
  center_x: number
  center_y: number
  cap_top_y: number
}

export type RockSpawnOptions = {
  /** How many clumps to scatter. */
  clumpCount: number
  /** Rocks placed in each clump. */
  rocksPerClump: number
  /** Max horizontal spread from clump center (world units). */
  clumpRadius: number
  /** Minimum grid-cell distance between clump centers (and spawn). */
  clumpSpacing: number
}

export type RockPlacement = {
  x: number
  y: number
  z: number
  modelIndex: number
  rotationY: number
  scale: number
}

function shuffleInPlace<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
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

function alignModelToGround(model: THREE.Object3D) {
  model.updateWorldMatrix(true, true)
  _box.setFromObject(model)
  model.position.y -= _box.min.y
}

function prepareRockMesh(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
  })
}

/** Load rock GLBs at authored scale; bottom sits at y = 0 in the wrapper. */
export async function loadRockModels(
  urls: readonly string[] = ROCK_MODEL_URLS,
): Promise<THREE.Group[]> {
  const loader = new GLTFLoader()
  const templates: THREE.Group[] = []

  for (const url of urls) {
    const gltf = await loader.loadAsync(url)
    const model = gltf.scene
    prepareRockMesh(model)
    alignModelToGround(model)

    const wrapper = new THREE.Group()
    wrapper.add(model)
    templates.push(wrapper)
  }

  return templates
}

function raycastGroundY(x: number, z: number, surface: THREE.Object3D): number | null {
  _rayOrigin.set(x, 500, z)
  _raycaster.near = 0
  _raycaster.set(_rayOrigin, _down)
  _raycaster.far = 500

  const hits = _raycaster.intersectObject(surface, true)
  return hits.length > 0 ? hits[0].point.y : null
}

export function resolveRockGroundY(
  placements: RockPlacement[],
  surface: THREE.Object3D,
): void {
  for (const spot of placements) {
    const y = raycastGroundY(spot.x, spot.z, surface)
    if (y !== null) spot.y = y
  }
}

/** Random clumps: pick spaced cells, then scatter rocks in a disk around each center. */
export function findRockPlacements(
  cells: Record<string, RockCellMeta>,
  spawnIx: number,
  spawnIy: number,
  options: RockSpawnOptions,
): RockPlacement[] {
  if (options.clumpCount <= 0 || options.rocksPerClump <= 0) return []

  const minSpacing = Math.max(1, Math.round(options.clumpSpacing))
  const candidates = Object.values(cells).filter(
    (cell) => Math.abs(cell.ix - spawnIx) > 1 || Math.abs(cell.iy - spawnIy) > 1,
  )
  shuffleInPlace(candidates)

  const reserved: { ix: number; iy: number }[] = [{ ix: spawnIx, iy: spawnIy }]
  const placements: RockPlacement[] = []

  for (const center of candidates) {
    if (reserved.length - 1 >= options.clumpCount) break
    if (!cellSpacingOk(center.ix, center.iy, reserved, minSpacing)) continue

    reserved.push({ ix: center.ix, iy: center.iy })

    for (let r = 0; r < options.rocksPerClump; r++) {
      const angle = Math.random() * Math.PI * 2
      const dist =
        options.clumpRadius > 0
          ? Math.sqrt(Math.random()) * options.clumpRadius
          : 0
      placements.push({
        x: center.center_x + Math.cos(angle) * dist,
        y: center.cap_top_y,
        z: center.center_y + Math.sin(angle) * dist,
        modelIndex: Math.floor(Math.random() * ROCK_MODEL_URLS.length),
        rotationY: Math.random() * Math.PI * 2,
        scale: 0.75 + Math.random() * 0.55,
      })
    }
  }

  return placements
}

export function placeRocks(
  templates: THREE.Group[],
  placements: RockPlacement[],
  parent: THREE.Object3D,
): THREE.Group[] {
  const rocks: THREE.Group[] = []

  for (const spot of placements) {
    const template = templates[spot.modelIndex % templates.length]
    if (!template) continue

    const rock = template.clone(true)
    rock.position.set(spot.x, spot.y, spot.z)
    rock.rotation.y = spot.rotationY
    rock.scale.setScalar(spot.scale)
    parent.add(rock)
    rocks.push(rock)
  }

  return rocks
}
