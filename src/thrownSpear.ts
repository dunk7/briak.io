import * as THREE from 'three'
import type { CollisionWorld } from './collisionWorld'
import {
  damageEnemy,
  DIAMOND_SPEAR_THROW_DAMAGE,
  GOLD_SPEAR_THROW_DAMAGE,
  IRON_SPEAR_THROW_DAMAGE,
  SPEAR_HIT_KNOCKBACK_SPEED,
  SPEAR_THROW_DAMAGE,
  type EnemyDeathContext,
  type EnemyInstance,
} from './enemy'
import type { Inventory, InventoryItem } from './inventory'
import type { CapsuleCollider } from './meshCollider'
import { type MeshGroundTargets } from './terrainGroundRay'

const SPEAR_SPEED = 22
/** Mild drop so throws read as an arc without feeling floaty. */
const SPEAR_GRAVITY = 13.5
const SPEAR_MAX_FLIGHT = 4.5
/** Extra air time after an enemy hit so the spear can fall to the ground. */
const SPEAR_DROP_LIFE = 3.5
/** Keep a little forward drift after a hit, then fall. */
const SPEAR_HIT_HORIZ_KEEP = 0.18
const SPEAR_HIT_UP_BOUNCE = 1.2
const PICKUP_RADIUS = 1.4
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS
/** Distance from spear root to tip along local +Z. */
const TIP_OFFSET = 0.44
const STICK_EMBED = 0.14
/** How far below the tip we probe for a local floor (caves / under overhangs). */
const GROUND_PROBE_DROP = 6
/** On flight timeout, settle onto a floor within this drop instead of vanishing. */
const TIMEOUT_GROUND_DROP = 12
/** Skip terrain/voxel mesh casts when this far above the column-top estimate. */
const AIR_CLEARANCE = 8

const _prev = new THREE.Vector3()
const _next = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _tip = new THREE.Vector3()
const _playerDelta = new THREE.Vector3()
const _boxHit = new THREE.Vector3()
const _hits: THREE.Intersection[] = []
const _nearbyProps: THREE.Object3D[] = []
const _zAxis = new THREE.Vector3(0, 0, 1)
const _pickMeshes: THREE.Object3D[] = []
/** Per-frame ground-probe cache so clustered falling spears share one raycast. */
const _groundCacheKeys: number[] = []
const _groundCacheVals: (number | null)[] = []

export type SpearVoxelHit = {
  cellKey: string
  layer: number
}

export type SpearItem = Extract<
  InventoryItem,
  'spear' | 'iron_spear' | 'gold_spear' | 'diamond_spear'
>

export type ThrownSpear = {
  root: THREE.Group
  item: SpearItem
  velocity: THREE.Vector3
  life: number
  stuck: boolean
  /** After damaging an enemy, skip further enemy hits while falling. */
  ignoreEnemies: boolean
  /** Tree/rock the spear is planted in, if any. */
  stuckTo: THREE.Object3D | null
  /** Placed build-block cell key, if planted in a player block. */
  stuckBlockKey: string | null
  /** Underground voxel cell key + layer, if planted in dug terrain. */
  stuckVoxelKey: string | null
  stuckVoxelLayer: number | null
}

export type ThrownSpearUpdateOpts = {
  groundTargets: MeshGroundTargets
  /** Trees spears can plant into. */
  trees: readonly THREE.Object3D[]
  /** Rocks spears can plant into. */
  rocks: readonly THREE.Object3D[]
  /** Underground voxel instanced meshes. */
  voxelMeshes: readonly THREE.Object3D[]
  resolveVoxelHit: (mesh: THREE.Object3D, instanceId: number) => SpearVoxelHit | null
  intersectBuildBlocks: (raycaster: THREE.Raycaster, out: THREE.Intersection[]) => void
  resolveBuildBlockHit: (mesh: THREE.Object3D, instanceId: number) => string | null
  playerPos: THREE.Vector3
  inventory: Inventory
  deathCtx?: EnemyDeathContext
  /** Cave-aware floor / solid queries (avoids sky-down outdoor-lid sticks). */
  collisionWorld?: CollisionWorld
  capsuleCollider?: CapsuleCollider
}

/**
 * Nearest floor at/below the tip — casts down from just above the tip so caves
 * find the cave floor instead of the outdoor surface lid above.
 */
function probeSpearGroundY(
  tipX: number,
  tipY: number,
  tipZ: number,
  maxDrop: number,
  collisionWorld: CollisionWorld | undefined,
  capsule: CapsuleCollider | undefined,
): number | null {
  const fromY = tipY + 0.35
  let best: number | null = null

  if (capsule) {
    const meshY = capsule.raycastDownY(tipX, tipZ, fromY, maxDrop + 0.35)
    if (meshY !== null && meshY <= tipY + 0.08 && meshY >= tipY - maxDrop) {
      best = meshY
    }
  }

  if (collisionWorld) {
    const boxY = collisionWorld.findGroundTop(
      tipX,
      tipY,
      tipZ,
      0.12,
      0.35,
      true,
      maxDrop,
      false,
    )
    if (boxY !== null && boxY <= tipY + 0.08 && boxY >= tipY - maxDrop) {
      if (best === null || boxY > best) best = boxY
    }
  }

  return best
}

function cachedProbeSpearGroundY(
  tipX: number,
  tipY: number,
  tipZ: number,
  maxDrop: number,
  collisionWorld: CollisionWorld | undefined,
  capsule: CapsuleCollider | undefined,
): number | null {
  const key =
    (Math.round(tipX * 4) * 73856093) ^
    (Math.round(tipZ * 4) * 19349663) ^
    (Math.round(tipY * 2) * 83492791) ^
    (maxDrop | 0)
  for (let i = 0; i < _groundCacheKeys.length; i++) {
    if (_groundCacheKeys[i] === key) return _groundCacheVals[i]!
  }
  const y = probeSpearGroundY(tipX, tipY, tipZ, maxDrop, collisionWorld, capsule)
  _groundCacheKeys.push(key)
  _groundCacheVals.push(y)
  return y
}

function createSpearMesh(item: SpearItem = 'spear'): THREE.Group {
  const group = new THREE.Group()
  const handle = new THREE.MeshStandardMaterial({
    color: 0x5c3a22,
    roughness: 0.85,
    metalness: 0,
    flatShading: true,
    fog: false,
  })
  const tipColors: Record<SpearItem, { color: number; roughness: number; metalness: number }> = {
    spear: { color: 0x5a5a54, roughness: 0.9, metalness: 0.04 },
    iron_spear: { color: 0xd8d4cc, roughness: 0.22, metalness: 0.72 },
    gold_spear: { color: 0xe8c84a, roughness: 0.18, metalness: 0.78 },
    diamond_spear: { color: 0x7ad8f0, roughness: 0.12, metalness: 0.85 },
  }
  const tipSpec = tipColors[item]
  const tip = new THREE.MeshStandardMaterial({
    color: tipSpec.color,
    roughness: tipSpec.roughness,
    metalness: tipSpec.metalness,
    flatShading: true,
    fog: false,
  })

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.62), handle)
  shaft.position.z = -0.08
  shaft.castShadow = false
  shaft.receiveShadow = false

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.18), tip)
  head.position.z = 0.35
  head.castShadow = false
  head.receiveShadow = false

  group.add(shaft, head)
  return group
}

function orientSpear(spear: ThrownSpear, dir: THREE.Vector3) {
  const len = dir.length()
  if (len < 1e-5) return
  _fwd.copy(dir).multiplyScalar(1 / len)
  spear.root.quaternion.setFromUnitVectors(_zAxis, _fwd)
}

function clearStickTarget(spear: ThrownSpear) {
  spear.stuckTo = null
  spear.stuckBlockKey = null
  spear.stuckVoxelKey = null
  spear.stuckVoxelLayer = null
}

function stickSpear(
  spear: ThrownSpear,
  tipPoint: THREE.Vector3,
  along: THREE.Vector3,
  target?: {
    prop?: THREE.Object3D | null
    blockKey?: string | null
    voxel?: SpearVoxelHit | null
  },
) {
  orientSpear(spear, along)
  // Seat the tip a little into the surface so it reads as planted.
  spear.root.position.copy(tipPoint).addScaledVector(_fwd, -TIP_OFFSET + STICK_EMBED)
  spear.velocity.set(0, 0, 0)
  spear.stuck = true
  clearStickTarget(spear)
  if (target?.prop) spear.stuckTo = target.prop
  if (target?.blockKey) spear.stuckBlockKey = target.blockKey
  if (target?.voxel) {
    spear.stuckVoxelKey = target.voxel.cellKey
    spear.stuckVoxelLayer = target.voxel.layer
  }
  spear.life = Infinity
}

/** Knock the spear off an enemy / destroyed prop so gravity can carry it to the ground. */
function dropSpearFromHit(spear: ThrownSpear, hitPoint: THREE.Vector3) {
  spear.root.position.copy(hitPoint).addScaledVector(_dir, -0.08)
  spear.velocity.x *= SPEAR_HIT_HORIZ_KEEP
  spear.velocity.z *= SPEAR_HIT_HORIZ_KEEP
  spear.velocity.y = Math.max(spear.velocity.y * 0.15, SPEAR_HIT_UP_BOUNCE)
  spear.ignoreEnemies = true
  spear.stuck = false
  clearStickTarget(spear)
  spear.life = SPEAR_DROP_LIFE
  orientSpear(spear, spear.velocity)
}

function findStickPropRoot(
  hitObject: THREE.Object3D,
  stickProps: readonly THREE.Object3D[],
): THREE.Object3D | null {
  let current: THREE.Object3D | null = hitObject
  while (current) {
    if (stickProps.includes(current)) return current
    current = current.parent
  }
  return null
}

/** Horizontal reach for tree/rock stick raycasts (covers wide canopies + rocks). */
const STICK_PROP_RADIUS = 8
const STICK_PROP_RADIUS_SQ = STICK_PROP_RADIUS * STICK_PROP_RADIUS

/** Collect nearby trees/rocks for a short flight-step raycast. */
function collectNearbyStickProps(
  origin: THREE.Vector3,
  trees: readonly THREE.Object3D[],
  rocks: readonly THREE.Object3D[],
  out: THREE.Object3D[],
) {
  out.length = 0
  for (const prop of trees) {
    const dx = prop.position.x - origin.x
    const dz = prop.position.z - origin.z
    if (dx * dx + dz * dz <= STICK_PROP_RADIUS_SQ) out.push(prop)
  }
  for (const prop of rocks) {
    const dx = prop.position.x - origin.x
    const dz = prop.position.z - origin.z
    if (dx * dx + dz * dz <= STICK_PROP_RADIUS_SQ) out.push(prop)
  }
}

function removeSpear(spear: ThrownSpear, parent: THREE.Object3D, spears: ThrownSpear[]) {
  parent.remove(spear.root)
  spear.root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
      else child.material.dispose()
    }
  })
  const i = spears.indexOf(spear)
  if (i >= 0) spears.splice(i, 1)
}

function tryPickupSpear(
  spear: ThrownSpear,
  parent: THREE.Object3D,
  spears: ThrownSpear[],
  playerPos: THREE.Vector3,
  inventory: Inventory,
): boolean {
  _playerDelta.subVectors(playerPos, spear.root.position)
  _playerDelta.y = 0
  if (_playerDelta.lengthSq() > PICKUP_RADIUS_SQ) return false
  inventory.add(spear.item, 1)
  removeSpear(spear, parent, spears)
  return true
}

export function spawnThrownSpear(
  parent: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  spears: ThrownSpear[],
  item: SpearItem = 'spear',
) {
  const root = createSpearMesh(item)
  root.position.copy(origin)
  _fwd.copy(direction).normalize()
  root.quaternion.setFromUnitVectors(_zAxis, _fwd)

  const vel = _fwd.clone().multiplyScalar(SPEAR_SPEED)

  parent.add(root)
  spears.push({
    root,
    item,
    velocity: vel,
    life: SPEAR_MAX_FLIGHT,
    stuck: false,
    ignoreEnemies: false,
    stuckTo: null,
    stuckBlockKey: null,
    stuckVoxelKey: null,
    stuckVoxelLayer: null,
  })
}

function dropMatchingSpears(
  spears: ThrownSpear[],
  match: (spear: ThrownSpear) => boolean,
) {
  for (const spear of spears) {
    if (!spear.stuck || !match(spear)) continue
    _dir.set(0, -1, 0)
    dropSpearFromHit(spear, spear.root.position)
  }
}

/** When a tree/rock is destroyed, knock any planted spears loose so they fall. */
export function dropSpearsFromProp(prop: THREE.Object3D, spears: ThrownSpear[]) {
  dropMatchingSpears(spears, (spear) => spear.stuckTo === prop)
}

/** When a placed build block is removed, knock planted spears loose. */
export function dropSpearsFromBlock(blockKey: string, spears: ThrownSpear[]) {
  dropMatchingSpears(spears, (spear) => spear.stuckBlockKey === blockKey)
}

/** When an underground voxel layer is mined, knock planted spears loose. */
export function dropSpearsFromVoxel(
  cellKey: string,
  layer: number,
  spears: ThrownSpear[],
) {
  dropMatchingSpears(
    spears,
    (spear) => spear.stuckVoxelKey === cellKey && spear.stuckVoxelLayer === layer,
  )
}

export function updateThrownSpears(
  dt: number,
  spears: ThrownSpear[],
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  raycaster: THREE.Raycaster,
  opts: ThrownSpearUpdateOpts,
): number {
  if (spears.length === 0) return 0

  const {
    groundTargets,
    trees,
    rocks,
    voxelMeshes,
    resolveVoxelHit,
    intersectBuildBlocks,
    resolveBuildBlockHit,
    playerPos,
    inventory,
    deathCtx,
    collisionWorld,
    capsuleCollider,
  } = opts
  _pickMeshes.length = 0
  for (let i = 0; i < enemies.length; i++) _pickMeshes.push(enemies[i]!.pickMesh)
  _groundCacheKeys.length = 0
  _groundCacheVals.length = 0
  let pickedUp = 0

  for (let i = spears.length - 1; i >= 0; i--) {
    const spear = spears[i]!

    if (spear.stuck) {
      if (tryPickupSpear(spear, parent, spears, playerPos, inventory)) pickedUp++
      continue
    }

    spear.life -= dt
    if (spear.life <= 0) {
      // Prefer settling onto a local floor over vanishing mid-flight (common in caves
      // when mesh cull / sky-down used to miss geometry).
      if (spear.velocity.lengthSq() > 1e-8) _fwd.copy(spear.velocity).normalize()
      else _fwd.set(0, -1, 0)
      const tipX = spear.root.position.x + _fwd.x * TIP_OFFSET
      const tipZ = spear.root.position.z + _fwd.z * TIP_OFFSET
      const tipY = spear.root.position.y + _fwd.y * TIP_OFFSET
      const groundY = probeSpearGroundY(
        tipX,
        tipY,
        tipZ,
        TIMEOUT_GROUND_DROP,
        collisionWorld,
        capsuleCollider,
      )
      if (groundY !== null) {
        _tip.set(tipX, groundY, tipZ)
        stickSpear(spear, _tip, _fwd)
      } else {
        spear.velocity.set(0, 0, 0)
        spear.stuck = true
        spear.life = Infinity
      }
      continue
    }

    spear.velocity.y -= SPEAR_GRAVITY * dt

    _prev.copy(spear.root.position)
    _next.copy(spear.velocity).multiplyScalar(dt).add(_prev)
    _dir.subVectors(_next, _prev)
    const stepLen = _dir.length()

    // Dropped / post-hit spears: cheap settle only. Full flight raycasts thrash when
    // many detach from a mined block at once.
    if (spear.ignoreEnemies) {
      if (stepLen > 1e-5 && collisionWorld) {
        _dir.multiplyScalar(1 / stepLen)
        const boxDist = collisionWorld.castSegment(
          _prev.x,
          _prev.y,
          _prev.z,
          _dir.x,
          _dir.y,
          _dir.z,
          stepLen,
          _boxHit,
        )
        if (boxDist !== null) {
          stickSpear(spear, _boxHit, _dir)
          continue
        }
      }

      spear.root.position.copy(_next)
      orientSpear(spear, spear.velocity)

      // Skip probe during the brief upward bounce after detach.
      if (spear.velocity.y > 0.15) continue

      const tipX = spear.root.position.x + _fwd.x * TIP_OFFSET
      const tipZ = spear.root.position.z + _fwd.z * TIP_OFFSET
      const tipY = spear.root.position.y + _fwd.y * TIP_OFFSET
      const groundY = cachedProbeSpearGroundY(
        tipX,
        tipY,
        tipZ,
        GROUND_PROBE_DROP,
        collisionWorld,
        capsuleCollider,
      )
      if (groundY !== null && tipY <= groundY) {
        _tip.set(tipX, groundY, tipZ)
        stickSpear(spear, _tip, spear.velocity)
      }
      continue
    }

    if (stepLen > 1e-5) {
      _dir.multiplyScalar(1 / stepLen)
      raycaster.set(_prev, _dir)
      raycaster.far = stepLen
      raycaster.near = 0

      const groundEst = collisionWorld?.columnTopNear(_prev.x, _prev.z) ?? null
      // Only skip terrain meshes when clearly above the floor — never skip solid
      // AABB checks (cave ceilings / overhangs sit above the column top).
      const highAboveFloor =
        groundEst !== null &&
        Math.min(_prev.y, _next.y) > groundEst + AIR_CLEARANCE

      // Enemy hits first — then the spear drops and falls to the ground.
      if (_pickMeshes.length > 0) {
        _hits.length = 0
        raycaster.intersectObjects(_pickMeshes, false, _hits)
        if (_hits.length > 0) {
          const hit = _hits[0]!
          const enemy = enemies.find((e) => e.pickMesh === hit.object)
          if (enemy) {
            const dmg =
              spear.item === 'diamond_spear'
                ? DIAMOND_SPEAR_THROW_DAMAGE
                : spear.item === 'gold_spear'
                  ? GOLD_SPEAR_THROW_DAMAGE
                  : spear.item === 'iron_spear'
                    ? IRON_SPEAR_THROW_DAMAGE
                    : SPEAR_THROW_DAMAGE
            damageEnemy(
              enemy,
              dmg,
              enemiesGroup,
              enemies,
              _prev.x,
              _prev.z,
              SPEAR_HIT_KNOCKBACK_SPEED,
              deathCtx,
            )
          }
          dropSpearFromHit(spear, hit.point)
          continue
        }
      }

      // Trees/rocks must stay hittable at any altitude — canopies sit well above
      // the floor estimate, and foliage collision AABBs are only a thin top deck.
      // `highAboveFloor` only skips expensive terrain meshes below.
      collectNearbyStickProps(_prev, trees, rocks, _nearbyProps)
      if (_nearbyProps.length > 0) {
        _hits.length = 0
        for (const prop of _nearbyProps) {
          raycaster.intersectObject(prop, true, _hits)
        }
        if (_hits.length > 0) {
          _hits.sort((a, b) => a.distance - b.distance)
          const hit = _hits[0]!
          const propRoot =
            findStickPropRoot(hit.object, trees) ?? findStickPropRoot(hit.object, rocks)
          stickSpear(spear, hit.point, _dir, { prop: propRoot })
          continue
        }
      }

      const solidsNear =
        !collisionWorld ||
        collisionWorld.hasSolidAlongSegment(
          _prev.x,
          _prev.y,
          _prev.z,
          _dir.x,
          _dir.y,
          _dir.z,
          stepLen,
        )
      if (solidsNear) {
        // Placed build blocks + underground voxels (instanced meshes).
        _hits.length = 0
        intersectBuildBlocks(raycaster, _hits)
        for (const mesh of voxelMeshes) {
          if (!mesh.visible) continue
          raycaster.intersectObject(mesh, false, _hits)
        }
        if (_hits.length > 0) {
          _hits.sort((a, b) => a.distance - b.distance)
          const hit = _hits[0]!
          if (hit.instanceId !== undefined) {
            const blockKey = resolveBuildBlockHit(hit.object, hit.instanceId)
            if (blockKey) {
              stickSpear(spear, hit.point, _dir, { blockKey })
              continue
            }
            const voxel = resolveVoxelHit(hit.object, hit.instanceId)
            if (voxel) {
              stickSpear(spear, hit.point, _dir, { voxel })
              continue
            }
          }
        }

        // Voxel / build AABBs — catches solids when instanced meshes are culled.
        if (collisionWorld) {
          const boxDist = collisionWorld.castSegment(
            _prev.x,
            _prev.y,
            _prev.z,
            _dir.x,
            _dir.y,
            _dir.z,
            stepLen,
            _boxHit,
          )
          if (boxDist !== null) {
            stickSpear(spear, _boxHit, _dir)
            continue
          }
        }
      }

      if (!highAboveFloor) {
        // Terrain along the flight path.
        _hits.length = 0
        const chunkRoot = groundTargets.chunkRoot
        if (chunkRoot) {
          for (const child of chunkRoot.children) {
            if (child instanceof THREE.Mesh && child.visible) {
              raycaster.intersectObject(child, false, _hits)
            }
          }
        }
        for (const child of groundTargets.surface.children) {
          if (!child.visible || child === chunkRoot) continue
          raycaster.intersectObject(child, true, _hits)
        }
        if (_hits.length > 0) {
          _hits.sort((a, b) => a.distance - b.distance)
          stickSpear(spear, _hits[0]!.point, _dir)
          continue
        }
      }
    }

    spear.root.position.copy(_next)
    orientSpear(spear, spear.velocity)

    // Ground probe only when descending near the floor.
    if (spear.velocity.y > 0.15) continue
    const tipX = spear.root.position.x + _fwd.x * TIP_OFFSET
    const tipZ = spear.root.position.z + _fwd.z * TIP_OFFSET
    const tipY = spear.root.position.y + _fwd.y * TIP_OFFSET
    const groundEst = collisionWorld?.columnTopNear(tipX, tipZ) ?? null
    if (groundEst !== null && tipY > groundEst + AIR_CLEARANCE) continue
    const groundY = cachedProbeSpearGroundY(
      tipX,
      tipY,
      tipZ,
      GROUND_PROBE_DROP,
      collisionWorld,
      capsuleCollider,
    )
    if (groundY !== null && tipY <= groundY) {
      _tip.set(tipX, groundY, tipZ)
      stickSpear(spear, _tip, spear.velocity)
    }
  }

  return pickedUp
}

export function clearThrownSpears(
  spears: ThrownSpear[],
  parent: THREE.Object3D,
) {
  while (spears.length > 0) {
    removeSpear(spears[0]!, parent, spears)
  }
}
