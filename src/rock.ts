import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CollisionWorld } from './collisionWorld'
import { cellWorldOrigin, type TerrainGrid } from './voxelPlacement'
import { assignBoxProjectedUVs, getRockMaterial } from './rockTexture'
import { sampleMeshGroundY } from './terrainGroundRay'
import {
  freezeSubtreeMatrices,
  thawSubtreeMatrices,
} from './surfacePieceLoader'

/** World units covered by one stone-texture tile across a rock surface. */
const ROCK_TEXTURE_UNITS_PER_TILE = 0.7

const ROCK_MODEL_URLS = [
  '/assets/rock1.glb',
  '/assets/rock2.glb',
  '/assets/rock3.glb',
] as const

const _box = new THREE.Box3()
const _rayHits: THREE.Intersection[] = []

/** Rays start at y = RAY_ORIGIN_Y; far must reach lowest terrain from that height. */
const RAY_ORIGIN_Y = 500
const RAYCAST_FAR = 1200

/** Fraction of rock height buried below the terrain surface (0 = on top, 0.5 = halfway). */
const ROCK_BURY_FRACTION = 0.5
const ROCK_SUPPORT_RADIUS = 0.4
/** Cell AABB / cap lip can sit this far above the sloped mesh; prefer mesh beyond that. */
const ROCK_MESH_OVER_COLLISION_EPS = 0.25
const ROCK_FALL_GRAVITY = 32
const ROCK_MAX_DROP = 64
const ROCK_FALL_VY_KEY = 'fallVy'
/**
 * Rocks at rest are skipped by the physics loop. Probing a rock's support point
 * costs a full terrain raycast (over every chunk mesh) plus several bounding-box
 * passes, so re-checking already-settled rocks every frame was a large per-frame
 * cost. Rocks are re-woken (see `wakeRocks`) whenever terrain is dug away.
 */
const ROCK_SETTLED_KEY = 'settled'

export type RockGroundTargets = {
  surface: THREE.Object3D
  chunkRoot?: THREE.Object3D
}

export {
  DEFAULT_ROCK_CLUMP_COUNT,
  DEFAULT_ROCK_CLUMP_RADIUS,
  DEFAULT_ROCK_CLUMP_SPACING,
  DEFAULT_ROCKS_PER_CLUMP,
} from './tuneDefaults'

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
  /** Max rocks placed in each clump (actual count is random from 1 to this). */
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
  const rockMaterial = getRockMaterial()
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.castShadow = true
    child.receiveShadow = true
    assignBoxProjectedUVs(child.geometry, ROCK_TEXTURE_UNITS_PER_TILE)
    child.material = rockMaterial
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

/** World XZ at the center of a terrain grid cell (metadata center_y is world Z). */
function cellCenterXZ(grid: TerrainGrid, ix: number, iy: number) {
  const { x: x0, z: z0 } = cellWorldOrigin(grid, ix, iy)
  const half = grid.cellSize * 0.5
  return { x: x0 + half, z: z0 + half }
}

function raycastGroundY(
  x: number,
  z: number,
  surface: THREE.Object3D,
  chunkRoot?: THREE.Object3D,
): number | null {
  return sampleMeshGroundY(
    x,
    z,
    RAY_ORIGIN_Y,
    { surface, chunkRoot },
    _rayHits,
    RAYCAST_FAR,
    { intersectInvisibleChunks: true },
  )
}

function rockHeight(rock: THREE.Object3D): number {
  rock.updateWorldMatrix(true, true)
  _box.setFromObject(rock)
  return _box.max.y - _box.min.y
}

function rockBottomY(rock: THREE.Object3D): number {
  rock.updateWorldMatrix(true, true)
  _box.setFromObject(rock)
  return _box.min.y
}

function buriedBottomY(groundY: number, height: number): number {
  return groundY - height * ROCK_BURY_FRACTION
}

function resolveRockSupportY(
  x: number,
  z: number,
  probeY: number,
  ground: RockGroundTargets,
  collisionWorld?: CollisionWorld,
): number | null {
  const meshY = raycastGroundY(x, z, ground.surface, ground.chunkRoot)
  if (!collisionWorld) return meshY

  const collY = collisionWorld.findTerrainGroundTop(
    x,
    probeY,
    z,
    ROCK_SUPPORT_RADIUS,
    ROCK_MAX_DROP,
  )
  if (meshY === null) return collY
  if (collY === null) return meshY
  // Sloped cells expose a flat AABB/cap lip above the local surface mesh.
  if (collY > meshY + ROCK_MESH_OVER_COLLISION_EPS) return meshY
  return Math.max(meshY, collY)
}

/** Drop rock so it sits half-buried in the terrain surface. */
function snapRockToGround(
  rock: THREE.Object3D,
  ground: RockGroundTargets,
  collisionWorld?: CollisionWorld,
): boolean {
  const bottom = rockBottomY(rock)
  const groundY = resolveRockSupportY(
    rock.position.x,
    rock.position.z,
    bottom,
    ground,
    collisionWorld,
  )
  if (groundY === null) return false

  const height = rockHeight(rock)
  const targetBottom = buriedBottomY(groundY, height)
  rock.position.y += targetBottom - bottom
  delete rock.userData[ROCK_FALL_VY_KEY]
  return true
}

/** Gravity + terrain snap when the block under a rock is mined away. */
export function updateRocksPhysics(
  rocks: readonly THREE.Group[],
  ground: RockGroundTargets,
  collisionWorld: CollisionWorld,
  dt: number,
): boolean {
  let moved = false

  for (const rock of rocks) {
    // Resting rocks are inert until terrain changes under them (see wakeRocks).
    if (rock.userData[ROCK_SETTLED_KEY] === true) continue

    // Falling rocks need live matrices; they may have been frozen at spawn.
    if (!rock.matrixAutoUpdate) thawSubtreeMatrices(rock)

    const bottom = rockBottomY(rock)
    const groundY = resolveRockSupportY(
      rock.position.x,
      rock.position.z,
      bottom,
      ground,
      collisionWorld,
    )
    if (groundY === null) continue

    const height = rockHeight(rock)
    const targetBottom = buriedBottomY(groundY, height)
    const gap = bottom - targetBottom

    if (gap <= 0.02) {
      if (gap > 0.001) {
        rock.position.y -= gap
        moved = true
      }
      delete rock.userData[ROCK_FALL_VY_KEY]
      rock.userData[ROCK_SETTLED_KEY] = true
      rock.updateMatrixWorld(true)
      freezeSubtreeMatrices(rock)
      continue
    }

    let vy = (rock.userData[ROCK_FALL_VY_KEY] as number | undefined) ?? 0
    vy -= ROCK_FALL_GRAVITY * dt
    rock.position.y += vy * dt
    rock.userData[ROCK_FALL_VY_KEY] = vy
    moved = true

    const newBottom = rockBottomY(rock)
    if (newBottom <= targetBottom) {
      rock.position.y += targetBottom - newBottom
      delete rock.userData[ROCK_FALL_VY_KEY]
      rock.userData[ROCK_SETTLED_KEY] = true
    }
  }

  return moved
}

/**
 * Mark rocks as needing a physics re-check (e.g. after a dig removed terrain that
 * a rock may have been resting on). Settled rocks are otherwise skipped entirely.
 */
export function wakeRocks(rocks: readonly THREE.Group[]): void {
  for (const rock of rocks) {
    rock.userData[ROCK_SETTLED_KEY] = false
    thawSubtreeMatrices(rock)
  }
}

export function resolveRockGroundY(
  placements: RockPlacement[],
  surface: THREE.Object3D,
  chunkRoot?: THREE.Object3D,
): void {
  for (const spot of placements) {
    const y = raycastGroundY(spot.x, spot.z, surface, chunkRoot)
    if (y !== null) spot.y = y
  }
}

/** Random clumps: pick spaced cells, then scatter rocks in a disk around each center. */
export function findRockPlacements(
  cells: Record<string, RockCellMeta>,
  grid: TerrainGrid,
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
    const { x: cx, z: cz } = cellCenterXZ(grid, center.ix, center.iy)

    const rocksInClump = 1 + Math.floor(Math.random() * options.rocksPerClump)
    for (let r = 0; r < rocksInClump; r++) {
      const angle = Math.random() * Math.PI * 2
      const dist =
        options.clumpRadius > 0
          ? Math.sqrt(Math.random()) * options.clumpRadius
          : 0
      placements.push({
        x: cx + Math.cos(angle) * dist,
        y: center.cap_top_y,
        z: cz + Math.sin(angle) * dist,
        modelIndex: Math.floor(Math.random() * ROCK_MODEL_URLS.length),
        rotationY: Math.random() * Math.PI * 2,
        scale: 0.5 + Math.random() * 0.5,
      })
    }
  }

  return placements
}

export function placeRocks(
  templates: THREE.Group[],
  placements: RockPlacement[],
  parent: THREE.Object3D,
  ground?: RockGroundTargets,
  collisionWorld?: CollisionWorld,
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

    if (ground && !snapRockToGround(rock, ground, collisionWorld)) {
      parent.remove(rock)
      continue
    }

    rocks.push(rock)
  }

  return rocks
}
