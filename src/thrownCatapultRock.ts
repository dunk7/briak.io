import * as THREE from 'three'
import type { CollisionWorld } from './collisionWorld'
import {
  ARROW_HIT_KNOCKBACK_SPEED,
  damageEnemy,
  type EnemyDeathContext,
  type EnemyInstance,
} from './enemy'
import type { InventoryItem } from './inventory'
import type { CapsuleCollider } from './meshCollider'
import {
  damageSpider,
  type SpiderDeathContext,
  type SpiderInstance,
} from './roboticSpider'
import { type MeshGroundTargets } from './terrainGroundRay'

/** Match player gravity so riders follow the same parabola. */
export const CATAPULT_ROCK_GRAVITY = 16
/** Default / max launch speed for a 45° lob (range ≈ v²/g ≈ 64 m). */
export const CATAPULT_ROCK_SPEED = 32
const ROCK_MAX_FLIGHT = 10
const ROCK_RADIUS = 0.42
/** Chunky blast from a siege stone. */
const BLAST_RADIUS = 3.1
const BLAST_RADIUS_SQ = BLAST_RADIUS * BLAST_RADIUS
/** Detonate early when the rock flies this close to a hostile (forgiving aim). */
const AIRBURST_RADIUS = 2.4
const AIRBURST_RADIUS_SQ = AIRBURST_RADIUS * AIRBURST_RADIUS
const BLAST_DURATION = 0.4
const BLAST_KNOCKBACK = ARROW_HIT_KNOCKBACK_SPEED * 1.15
/** Skip airburst until the rock has cleared the scoop. */
const AIRBURST_GRACE_DIST = 2.5
const AIRBURST_GRACE_DIST_SQ = AIRBURST_GRACE_DIST * AIRBURST_GRACE_DIST
const AIR_CLEARANCE = 12
const GROUND_PROBE_DROP = 10
const STICK_PROP_RADIUS = 12
const STICK_PROP_RADIUS_SQ = STICK_PROP_RADIUS * STICK_PROP_RADIUS
/** One fixed blast light — enough for a terrain flash without bloating Medium PBR. */
const MAX_BLAST_LIGHTS = 1
const BLAST_LIGHT_INTENSITY = 14
const BLAST_LIGHT_DISTANCE = 7

export type CatapultAmmoItem = 'stone' | 'iron' | 'gold' | 'diamond'

export function isCatapultAmmoItem(item: InventoryItem | string | null): item is CatapultAmmoItem {
  return item === 'stone' || item === 'iron' || item === 'gold' || item === 'diamond'
}

export function catapultAmmoDamage(ammo: CatapultAmmoItem): number {
  switch (ammo) {
    case 'iron':
      return 7
    case 'gold':
      return 9
    case 'diamond':
      return 12
    default:
      return 5
  }
}

const AMMO_COLORS: Record<
  CatapultAmmoItem,
  { core: number; glow: number; blast: number; rock: number }
> = {
  stone: { core: 0xb8b0a4, glow: 0x8a8074, blast: 0xff8844, rock: 0x8a8680 },
  iron: { core: 0xe8e4dc, glow: 0xc8c4bc, blast: 0xffaa66, rock: 0xb8b4ac },
  gold: { core: 0xffe07a, glow: 0xf0d060, blast: 0xffcc44, rock: 0xe8c84a },
  diamond: { core: 0xe8fcff, glow: 0x7ad8f0, blast: 0x88eeff, rock: 0xa8e8f0 },
}

const _prev = new THREE.Vector3()
const _next = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _boxHit = new THREE.Vector3()
const _blastCenter = new THREE.Vector3()
const _hits: THREE.Intersection[] = []
const _nearbyProps: THREE.Object3D[] = []
const _pickMeshes: THREE.Object3D[] = []

export type ThrownCatapultRock = {
  root: THREE.Group
  velocity: THREE.Vector3
  life: number
  ammo: CatapultAmmoItem
  spin: THREE.Vector3
  /** World position at spawn — airburst grace from the scoop. */
  spawnPos: THREE.Vector3
}

export type ThrownCatapultRockUpdateOpts = {
  groundTargets: MeshGroundTargets
  trees: readonly THREE.Object3D[]
  rocks: readonly THREE.Object3D[]
  voxelMeshes: readonly THREE.Object3D[]
  resolveVoxelHit: (mesh: THREE.Object3D, instanceId: number) => unknown
  intersectBuildBlocks: (raycaster: THREE.Raycaster, out: THREE.Intersection[]) => void
  resolveBuildBlockHit: (mesh: THREE.Object3D, instanceId: number) => string | null
  deathCtx?: EnemyDeathContext
  collisionWorld?: CollisionWorld
  capsuleCollider?: CapsuleCollider
  spiders?: SpiderInstance[]
  spidersGroup?: THREE.Object3D
  spiderDeathCtx?: SpiderDeathContext
}

type RockBlast = {
  root: THREE.Group
  core: THREE.Mesh
  halo: THREE.Mesh
  age: number
  lightIndex: number
}

type BlastLightSlot = {
  light: THREE.PointLight
  inUse: boolean
}

const _rockBlasts: RockBlast[] = []
const _blastLightPool: BlastLightSlot[] = []
let rockBlastLightsEnabled = true

const rockGeo = new THREE.IcosahedronGeometry(ROCK_RADIUS, 1)
const blastCoreGeo = new THREE.SphereGeometry(1, 12, 12)
const blastHaloGeo = new THREE.SphereGeometry(1, 10, 10)

const sharedRockMats = new Map<CatapultAmmoItem, THREE.MeshStandardMaterial>()
let sharedBlastCoreMat: THREE.MeshBasicMaterial | null = null
let sharedBlastHaloMat: THREE.MeshBasicMaterial | null = null

function getRockMat(ammo: CatapultAmmoItem) {
  let mat = sharedRockMats.get(ammo)
  if (mat) return mat
  const colors = AMMO_COLORS[ammo]
  mat = new THREE.MeshStandardMaterial({
    color: colors.rock,
    roughness: ammo === 'diamond' ? 0.35 : ammo === 'gold' ? 0.45 : 0.9,
    metalness: ammo === 'iron' || ammo === 'gold' ? 0.55 : ammo === 'diamond' ? 0.35 : 0.05,
    emissive: new THREE.Color(colors.glow),
    emissiveIntensity: ammo === 'stone' ? 0.12 : 0.28,
  })
  sharedRockMats.set(ammo, mat)
  return mat
}

function getBlastCoreMat() {
  return (sharedBlastCoreMat ??= new THREE.MeshBasicMaterial({
    color: 0xff8844,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  }))
}

function getBlastHaloMat() {
  return (sharedBlastHaloMat ??= new THREE.MeshBasicMaterial({
    color: 0xffcc88,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  }))
}

function parkBlastLight(slot: BlastLightSlot) {
  slot.inUse = false
  slot.light.intensity = 0
  slot.light.position.set(0, -9999, 0)
  slot.light.visible = rockBlastLightsEnabled
}

function acquireBlastLight(point: THREE.Vector3, ammo: CatapultAmmoItem): number {
  if (!rockBlastLightsEnabled || _blastLightPool.length === 0) return -1
  for (let i = 0; i < _blastLightPool.length; i++) {
    const slot = _blastLightPool[i]!
    if (slot.inUse) continue
    slot.inUse = true
    slot.light.color.setHex(AMMO_COLORS[ammo].blast)
    slot.light.position.copy(point)
    slot.light.intensity = BLAST_LIGHT_INTENSITY
    slot.light.distance = BLAST_LIGHT_DISTANCE
    slot.light.visible = true
    return i
  }
  return -1
}

/** Call once after the scene is ready (same pattern as orb blasts). */
export function initCatapultRockBlastLights(parent: THREE.Object3D) {
  if (_blastLightPool.length > 0) return
  for (let i = 0; i < MAX_BLAST_LIGHTS; i++) {
    const light = new THREE.PointLight(0xff8844, 0, BLAST_LIGHT_DISTANCE, 2)
    light.visible = rockBlastLightsEnabled
    parent.add(light)
    const slot: BlastLightSlot = { light, inUse: false }
    parkBlastLight(slot)
    _blastLightPool.push(slot)
  }
}

export function setCatapultRockBlastLightsEnabled(enabled: boolean) {
  if (rockBlastLightsEnabled === enabled) return
  rockBlastLightsEnabled = enabled
  for (const slot of _blastLightPool) {
    if (!enabled) {
      slot.inUse = false
      slot.light.intensity = 0
      slot.light.position.set(0, -9999, 0)
      slot.light.visible = false
      continue
    }
    if (!slot.inUse) parkBlastLight(slot)
    else slot.light.visible = true
  }
}

function createRockMesh(ammo: CatapultAmmoItem): THREE.Group {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(rockGeo, getRockMat(ammo))
  mesh.scale.set(1.2, 0.95, 1.1)
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)
  // Chunkier silhouette — a second offset lump
  const lump = new THREE.Mesh(rockGeo, getRockMat(ammo))
  lump.scale.set(0.55, 0.5, 0.6)
  lump.position.set(0.18, 0.08, -0.12)
  lump.castShadow = true
  root.add(lump)
  return root
}

function spawnRockBlast(parent: THREE.Object3D, point: THREE.Vector3, ammo: CatapultAmmoItem) {
  const colors = AMMO_COLORS[ammo]
  const coreMat = getBlastCoreMat().clone()
  coreMat.color.setHex(colors.blast)
  const haloMat = getBlastHaloMat().clone()
  haloMat.color.setHex(colors.core)

  const root = new THREE.Group()
  root.position.copy(point)
  const core = new THREE.Mesh(blastCoreGeo, coreMat)
  const halo = new THREE.Mesh(blastHaloGeo, haloMat)
  core.scale.setScalar(0.4)
  halo.scale.setScalar(0.7)
  root.add(core, halo)
  parent.add(root)

  const lightIndex = acquireBlastLight(point, ammo)
  _rockBlasts.push({ root, core, halo, age: 0, lightIndex })
}

function removeRockBlast(blast: RockBlast, parent: THREE.Object3D) {
  parent.remove(blast.root)
  blast.core.geometry // shared
  ;(blast.core.material as THREE.Material).dispose()
  ;(blast.halo.material as THREE.Material).dispose()
  if (blast.lightIndex >= 0) {
    const slot = _blastLightPool[blast.lightIndex]
    if (slot) parkBlastLight(slot)
  }
  const i = _rockBlasts.indexOf(blast)
  if (i >= 0) _rockBlasts.splice(i, 1)
}

function updateRockBlasts(dt: number, parent: THREE.Object3D) {
  for (let i = _rockBlasts.length - 1; i >= 0; i--) {
    const blast = _rockBlasts[i]!
    blast.age += dt
    const t = blast.age / BLAST_DURATION
    if (t >= 1) {
      removeRockBlast(blast, parent)
      continue
    }
    const grow = 0.5 + t * BLAST_RADIUS * 1.15
    blast.core.scale.setScalar(grow * 0.55)
    blast.halo.scale.setScalar(grow)
    const fade = 1 - t
    ;(blast.core.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade
    ;(blast.halo.material as THREE.MeshBasicMaterial).opacity = 0.4 * fade
    if (blast.lightIndex >= 0) {
      const slot = _blastLightPool[blast.lightIndex]
      if (slot) slot.light.intensity = BLAST_LIGHT_INTENSITY * fade
    }
  }
}

function enemyDistSqToBlast(enemy: EnemyInstance, center: THREE.Vector3): number {
  const pos = enemy.root.position
  const minX = pos.x - enemy.colHalfX
  const maxX = pos.x + enemy.colHalfX
  const minY = pos.y + enemy.colFootOffset
  const maxY = minY + enemy.colHeight
  const minZ = pos.z - enemy.colHalfZ
  const maxZ = pos.z + enemy.colHalfZ
  const cx = Math.min(Math.max(center.x, minX), maxX)
  const cy = Math.min(Math.max(center.y, minY), maxY)
  const cz = Math.min(Math.max(center.z, minZ), maxZ)
  const dx = center.x - cx
  const dy = center.y - cy
  const dz = center.z - cz
  return dx * dx + dy * dy + dz * dz
}

function triggerRockBlast(
  hitPoint: THREE.Vector3,
  ammo: CatapultAmmoItem,
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  deathCtx: EnemyDeathContext | undefined,
  spiders?: SpiderInstance[],
  spidersGroup?: THREE.Object3D,
  spiderDeathCtx?: SpiderDeathContext,
) {
  spawnRockBlast(parent, hitPoint, ammo)
  _blastCenter.copy(hitPoint)
  const damage = catapultAmmoDamage(ammo)
  const targets = enemies.slice()
  for (const enemy of targets) {
    if (!enemies.includes(enemy)) continue
    if (enemyDistSqToBlast(enemy, _blastCenter) > BLAST_RADIUS_SQ) continue
    damageEnemy(
      enemy,
      damage,
      enemiesGroup,
      enemies,
      _blastCenter.x,
      _blastCenter.z,
      BLAST_KNOCKBACK,
      deathCtx,
    )
  }
  if (spiders && spidersGroup) {
    const spiderTargets = spiders.slice()
    for (const spider of spiderTargets) {
      if (!spiders.includes(spider)) continue
      const dx = spider.root.position.x - _blastCenter.x
      const dy = spider.root.position.y + spider.colHeight * 0.5 - _blastCenter.y
      const dz = spider.root.position.z - _blastCenter.z
      if (dx * dx + dy * dy + dz * dz > BLAST_RADIUS_SQ) continue
      damageSpider(
        spider,
        damage,
        spidersGroup,
        spiders,
        _blastCenter.x,
        _blastCenter.z,
        BLAST_KNOCKBACK,
        spiderDeathCtx,
      )
    }
  }
}

function removeRock(rock: ThrownCatapultRock, parent: THREE.Object3D, rocks: ThrownCatapultRock[]) {
  parent.remove(rock.root)
  const i = rocks.indexOf(rock)
  if (i >= 0) rocks.splice(i, 1)
}

function collectNearbyProps(
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

function probeGroundY(
  x: number,
  y: number,
  z: number,
  maxDrop: number,
  collisionWorld: CollisionWorld | undefined,
  capsule: CapsuleCollider | undefined,
): number | null {
  const fromY = y + 0.35
  let best: number | null = null

  if (capsule) {
    const meshY = capsule.raycastDownY(x, z, fromY, maxDrop + 0.35)
    if (meshY !== null && meshY <= y + 0.08 && meshY >= y - maxDrop) {
      best = meshY
    }
  }

  if (collisionWorld) {
    const boxY = collisionWorld.findGroundTop(x, y, z, 0.12, 0.35, true, maxDrop, false)
    if (boxY !== null && boxY <= y + 0.08 && boxY >= y - maxDrop) {
      if (best === null || boxY > best) best = boxY
    }
  }

  return best
}

export function spawnThrownCatapultRock(
  parent: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  rocks: ThrownCatapultRock[],
  ammo: CatapultAmmoItem,
  speed = CATAPULT_ROCK_SPEED,
) {
  const root = createRockMesh(ammo)
  root.position.copy(origin)
  _fwd.copy(direction).normalize()
  const vel = _fwd.clone().multiplyScalar(speed)
  parent.add(root)
  rocks.push({
    root,
    velocity: vel,
    life: ROCK_MAX_FLIGHT,
    ammo,
    spin: new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 8,
    ),
    spawnPos: origin.clone(),
  })
}

export function hasCatapultRockBlasts() {
  return _rockBlasts.length > 0
}

export function clearThrownCatapultRocks(rocks: ThrownCatapultRock[], parent: THREE.Object3D) {
  while (rocks.length > 0) {
    removeRock(rocks[0]!, parent, rocks)
  }
  while (_rockBlasts.length > 0) {
    removeRockBlast(_rockBlasts[0]!, parent)
  }
}

export function updateThrownCatapultRocks(
  dt: number,
  rocks: ThrownCatapultRock[],
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  raycaster: THREE.Raycaster,
  opts: ThrownCatapultRockUpdateOpts,
) {
  updateRockBlasts(dt, parent)
  if (rocks.length === 0) return

  const {
    groundTargets,
    trees,
    rocks: worldRocks,
    voxelMeshes,
    resolveVoxelHit,
    intersectBuildBlocks,
    resolveBuildBlockHit,
    deathCtx,
    collisionWorld,
    capsuleCollider,
    spiders,
    spidersGroup,
    spiderDeathCtx,
  } = opts

  _pickMeshes.length = 0
  for (let i = 0; i < enemies.length; i++) _pickMeshes.push(enemies[i]!.pickMesh)
  if (spiders) {
    for (let i = 0; i < spiders.length; i++) _pickMeshes.push(spiders[i]!.pickMesh)
  }

  for (let i = rocks.length - 1; i >= 0; i--) {
    const rock = rocks[i]!

    const explode = (point: THREE.Vector3) => {
      triggerRockBlast(
        point,
        rock.ammo,
        parent,
        enemies,
        enemiesGroup,
        deathCtx,
        spiders,
        spidersGroup,
        spiderDeathCtx,
      )
      removeRock(rock, parent, rocks)
    }

    rock.life -= dt
    if (rock.life <= 0) {
      explode(rock.root.position)
      continue
    }

    rock.velocity.y -= CATAPULT_ROCK_GRAVITY * dt
    rock.root.rotation.x += rock.spin.x * dt
    rock.root.rotation.y += rock.spin.y * dt
    rock.root.rotation.z += rock.spin.z * dt

    _prev.copy(rock.root.position)
    _next.copy(rock.velocity).multiplyScalar(dt).add(_prev)
    _dir.subVectors(_next, _prev)
    const stepLen = _dir.length()

    // Airburst when flying near a hostile — much more forgiving than a direct hit.
    if (_prev.distanceToSquared(rock.spawnPos) >= AIRBURST_GRACE_DIST_SQ) {
      _blastCenter.copy(_prev).add(_next).multiplyScalar(0.5)
      let nearHostile = false
      for (const enemy of enemies) {
        if (enemy.health <= 0) continue
        if (enemyDistSqToBlast(enemy, _blastCenter) <= AIRBURST_RADIUS_SQ) {
          nearHostile = true
          break
        }
      }
      if (!nearHostile && spiders) {
        for (const spider of spiders) {
          if (spider.health <= 0) continue
          const dx = spider.root.position.x - _blastCenter.x
          const dy =
            spider.root.position.y + spider.colHeight * 0.5 - _blastCenter.y
          const dz = spider.root.position.z - _blastCenter.z
          if (dx * dx + dy * dy + dz * dz <= AIRBURST_RADIUS_SQ) {
            nearHostile = true
            break
          }
        }
      }
      if (nearHostile) {
        explode(_blastCenter)
        continue
      }
    }

    if (stepLen > 1e-5) {
      _dir.multiplyScalar(1 / stepLen)
      raycaster.set(_prev, _dir)
      raycaster.far = stepLen + ROCK_RADIUS * 0.5
      raycaster.near = 0

      const groundEst = collisionWorld?.columnTopNear(_prev.x, _prev.z) ?? null
      const highAboveFloor =
        groundEst !== null && Math.min(_prev.y, _next.y) > groundEst + AIR_CLEARANCE

      if (_pickMeshes.length > 0) {
        _hits.length = 0
        raycaster.intersectObjects(_pickMeshes, false, _hits)
        if (_hits.length > 0) {
          explode(_hits[0]!.point)
          continue
        }
      }

      collectNearbyProps(_prev, trees, worldRocks, _nearbyProps)
      if (_nearbyProps.length > 0) {
        _hits.length = 0
        for (const prop of _nearbyProps) {
          raycaster.intersectObject(prop, true, _hits)
        }
        if (_hits.length > 0) {
          _hits.sort((a, b) => a.distance - b.distance)
          explode(_hits[0]!.point)
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
              explode(hit.point)
              continue
            }
            const voxel = resolveVoxelHit(hit.object, hit.instanceId)
            if (voxel) {
              explode(hit.point)
              continue
            }
          }
        }
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
            explode(_boxHit)
            continue
          }
        }
      }

      if (!highAboveFloor) {
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
          explode(_hits[0]!.point)
          continue
        }
      }
    }

    rock.root.position.copy(_next)

    if (rock.velocity.y > 0.15) continue
    const groundEst = collisionWorld?.columnTopNear(_next.x, _next.z) ?? null
    if (groundEst !== null && _next.y > groundEst + AIR_CLEARANCE) continue
    const groundY = probeGroundY(
      _next.x,
      _next.y,
      _next.z,
      GROUND_PROBE_DROP,
      collisionWorld,
      capsuleCollider,
    )
    if (groundY !== null && _next.y - ROCK_RADIUS <= groundY + 0.05) {
      explode(new THREE.Vector3(_next.x, groundY + ROCK_RADIUS * 0.25, _next.z))
    }
  }
}
