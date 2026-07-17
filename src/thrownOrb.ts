import * as THREE from 'three'
import type { CollisionWorld } from './collisionWorld'
import {
  ARROW_HIT_KNOCKBACK_SPEED,
  damageEnemy,
  healEnemy,
  type EnemyDeathContext,
  type EnemyInstance,
} from './enemy'
import type { CapsuleCollider } from './meshCollider'
import {
  damageSpider,
  type SpiderDeathContext,
  type SpiderInstance,
} from './roboticSpider'
import { type MeshGroundTargets } from './terrainGroundRay'

const ORB_SPEED = 28
const ORB_GRAVITY = 11
const ORB_MAX_FLIGHT = 5
const ORB_RADIUS = 0.1
/** Matches glowing-arrow blast size / feel. */
const BLAST_RADIUS = 1
const BLAST_RADIUS_SQ = BLAST_RADIUS * BLAST_RADIUS
const BLAST_DURATION = 0.32
const BLAST_DAMAGE = 1
const BLAST_HEAL = 1
const BLAST_KNOCKBACK = ARROW_HIT_KNOCKBACK_SPEED * 0.85
const PLAYER_HEAL_HEIGHT = 1.8
const PLAYER_HEAL_RADIUS_PAD = 0.35
const PLAYER_HEAL_RADIUS = BLAST_RADIUS + PLAYER_HEAL_RADIUS_PAD
const PLAYER_HEAL_RADIUS_SQ = PLAYER_HEAL_RADIUS * PLAYER_HEAL_RADIUS
/** Body hit radius for direct orb contact (ballista “shoot me”). */
const PLAYER_HIT_RADIUS = 0.45
const PLAYER_HIT_RADIUS_SQ = PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS
/** Clear the muzzle before player hits count — distance, not time. */
const PLAYER_HIT_GRACE_DIST = 0.55
const PLAYER_HIT_GRACE_DIST_SQ = PLAYER_HIT_GRACE_DIST * PLAYER_HIT_GRACE_DIST
const AIR_CLEARANCE = 8
const GROUND_PROBE_DROP = 6
const STICK_PROP_RADIUS = 8
const STICK_PROP_RADIUS_SQ = STICK_PROP_RADIUS * STICK_PROP_RADIUS
/**
 * Tiny fixed blast-light pool. Kept always-visible on Medium+ so throws never
 * change NUM_POINT_LIGHTS (recompile hitch). Cap is deliberately low — unused
 * berry/torch slots used to leave ~40 PointLights in every PBR shader.
 */
const MAX_ORB_BLAST_LIGHTS = 1
const BLAST_LIGHT_INTENSITY = 11
const BLAST_LIGHT_DISTANCE = 5.5
const BLAST_LIGHT_COLOR_DAMAGE = 0xff5522
const BLAST_LIGHT_COLOR_HEAL = 0xb070ff

const DAMAGE_ORB = {
  core: 0xff5533,
  glow: 0xff3300,
  halo: 0xff2200,
} as const
const HEAL_ORB = {
  core: 0xd8b4fe,
  glow: 0xc084fc,
  halo: 0x7c3aed,
} as const

const _prev = new THREE.Vector3()
const _next = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _boxHit = new THREE.Vector3()
const _blastCenter = new THREE.Vector3()
const _groundHit = new THREE.Vector3()
const _hits: THREE.Intersection[] = []
const _nearbyProps: THREE.Object3D[] = []
const _pickMeshes: THREE.Object3D[] = []

export type ThrownOrbKind = 'damage' | 'heal'

export type ThrownOrb = {
  root: THREE.Group
  velocity: THREE.Vector3
  life: number
  kind: ThrownOrbKind
  /** World position at spawn — used for close-range player-hit grace. */
  spawnPos: THREE.Vector3
}

export type ThrownOrbUpdateOpts = {
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
  playerPos?: THREE.Vector3
  onHeal?: (amount: number) => void
  spiders?: SpiderInstance[]
  spidersGroup?: THREE.Object3D
  spiderDeathCtx?: SpiderDeathContext
}

type OrbBlast = {
  root: THREE.Group
  core: THREE.Mesh
  halo: THREE.Mesh
  age: number
  kind: ThrownOrbKind
  lightIndex: number
}

type OrbBlastLightSlot = {
  light: THREE.PointLight
  inUse: boolean
}

const _orbBlasts: OrbBlast[] = []
const _blastLightPool: OrbBlastLightSlot[] = []
/** Medium+ graphics — Potato/Low hide the pool so NUM_POINT_LIGHTS drops. */
let orbBlastLightsEnabled = true
let sharedDamageCoreMat: THREE.MeshBasicMaterial | null = null
let sharedDamageGlowMat: THREE.MeshBasicMaterial | null = null
let sharedDamageHaloMat: THREE.MeshBasicMaterial | null = null
let sharedHealCoreMat: THREE.MeshBasicMaterial | null = null
let sharedHealGlowMat: THREE.MeshBasicMaterial | null = null
let sharedHealHaloMat: THREE.MeshBasicMaterial | null = null
let sharedBlastCoreMat: THREE.MeshBasicMaterial | null = null
let sharedBlastHaloMat: THREE.MeshBasicMaterial | null = null
let sharedHealBlastCoreMat: THREE.MeshBasicMaterial | null = null
let sharedHealBlastHaloMat: THREE.MeshBasicMaterial | null = null
const coreGeo = new THREE.SphereGeometry(ORB_RADIUS, 10, 10)
const glowGeo = new THREE.SphereGeometry(ORB_RADIUS * 1.35, 8, 8)
const blastCoreGeo = new THREE.SphereGeometry(1, 12, 12)
const blastHaloGeo = new THREE.SphereGeometry(1, 10, 10)

function parkBlastLight(slot: OrbBlastLightSlot) {
  slot.inUse = false
  slot.light.intensity = 0
  slot.light.position.set(0, -9999, 0)
  // Quality-off: drop from the light list. Quality-on: keep visible so the
  // fixed pool size (and shader) stays stable across throws.
  slot.light.visible = orbBlastLightsEnabled
}

function acquireBlastLight(
  point: THREE.Vector3,
  kind: ThrownOrbKind,
): number {
  if (!orbBlastLightsEnabled || _blastLightPool.length === 0) return -1
  for (let i = 0; i < _blastLightPool.length; i++) {
    const slot = _blastLightPool[i]!
    if (slot.inUse) continue
    slot.inUse = true
    slot.light.color.setHex(
      kind === 'heal' ? BLAST_LIGHT_COLOR_HEAL : BLAST_LIGHT_COLOR_DAMAGE,
    )
    slot.light.position.copy(point)
    slot.light.intensity = BLAST_LIGHT_INTENSITY
    slot.light.distance = BLAST_LIGHT_DISTANCE
    slot.light.visible = true
    return i
  }
  // All slots busy — steal the oldest blast's light if any.
  return -1
}

/**
 * Pre-add a fixed set of blast lights so throws never change NUM_POINT_LIGHTS
 * while Medium+ is active. Potato/Low hide the pool via setOrbBlastLightsEnabled.
 */
export function initOrbBlastLightPool(parent: THREE.Object3D) {
  if (_blastLightPool.length > 0) return
  for (let i = 0; i < MAX_ORB_BLAST_LIGHTS; i++) {
    const light = new THREE.PointLight(
      BLAST_LIGHT_COLOR_DAMAGE,
      0,
      BLAST_LIGHT_DISTANCE,
      2,
    )
    light.visible = orbBlastLightsEnabled
    light.userData.orbBlastLight = true
    const slot: OrbBlastLightSlot = { light, inUse: false }
    parkBlastLight(slot)
    parent.add(light)
    _blastLightPool.push(slot)
  }
}

/**
 * Potato/Low: hide the fixed pool (drops NUM_POINT_LIGHTS). Medium+: restore
 * the tiny always-on pool. Expect a one-time material recompile on the slider.
 */
export function setOrbBlastLightsEnabled(enabled: boolean) {
  if (orbBlastLightsEnabled === enabled) return
  orbBlastLightsEnabled = enabled
  if (!enabled) {
    for (const blast of _orbBlasts) blast.lightIndex = -1
    for (const slot of _blastLightPool) {
      slot.inUse = false
      slot.light.intensity = 0
      slot.light.position.set(0, -9999, 0)
      slot.light.visible = false
    }
    return
  }
  for (const slot of _blastLightPool) parkBlastLight(slot)
}

function makeBasicMat(color: number, opacity: number, additive: boolean) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !additive,
    toneMapped: false,
  })
}

function getOrbCoreMat(kind: ThrownOrbKind) {
  if (kind === 'heal') {
    return (sharedHealCoreMat ??= makeBasicMat(HEAL_ORB.core, 0.95, false))
  }
  return (sharedDamageCoreMat ??= makeBasicMat(DAMAGE_ORB.core, 0.95, false))
}

function getOrbGlowMat(kind: ThrownOrbKind) {
  if (kind === 'heal') {
    return (sharedHealGlowMat ??= makeBasicMat(HEAL_ORB.glow, 0.7, true))
  }
  return (sharedDamageGlowMat ??= makeBasicMat(DAMAGE_ORB.glow, 0.7, true))
}

function getOrbHaloMat(kind: ThrownOrbKind) {
  if (kind === 'heal') {
    return (sharedHealHaloMat ??= makeBasicMat(HEAL_ORB.halo, 0.35, true))
  }
  return (sharedDamageHaloMat ??= makeBasicMat(DAMAGE_ORB.halo, 0.35, true))
}

function getBlastCoreMat(kind: ThrownOrbKind) {
  if (kind === 'heal') {
    return (sharedHealBlastCoreMat ??= makeBasicMat(0xd8b4fe, 0.9, true))
  }
  return (sharedBlastCoreMat ??= makeBasicMat(0xff6622, 0.9, true))
}

function getBlastHaloMat(kind: ThrownOrbKind) {
  if (kind === 'heal') {
    return (sharedHealBlastHaloMat ??= makeBasicMat(0x7c3aed, 0.5, true))
  }
  return (sharedBlastHaloMat ??= makeBasicMat(0xff2200, 0.45, true))
}

function createOrbMesh(kind: ThrownOrbKind): THREE.Group {
  const root = new THREE.Group()
  const core = new THREE.Mesh(coreGeo, getOrbCoreMat(kind))
  core.castShadow = false
  core.receiveShadow = false
  const glow = new THREE.Mesh(glowGeo, getOrbGlowMat(kind))
  glow.castShadow = false
  glow.receiveShadow = false
  const halo = new THREE.Mesh(glowGeo, getOrbHaloMat(kind))
  halo.scale.setScalar(1.45)
  halo.castShadow = false
  halo.receiveShadow = false
  root.add(core, glow, halo)
  return root
}

function spawnOrbBlast(parent: THREE.Object3D, point: THREE.Vector3, kind: ThrownOrbKind) {
  const root = new THREE.Group()
  root.position.copy(point)
  const core = new THREE.Mesh(blastCoreGeo, getBlastCoreMat(kind).clone())
  core.scale.setScalar(0.08)
  core.castShadow = false
  core.receiveShadow = false
  const halo = new THREE.Mesh(blastHaloGeo, getBlastHaloMat(kind).clone())
  halo.scale.setScalar(0.16)
  halo.castShadow = false
  halo.receiveShadow = false
  root.add(core, halo)
  parent.add(root)
  const lightIndex = acquireBlastLight(point, kind)
  _orbBlasts.push({ root, core, halo, age: 0, kind, lightIndex })
}

function removeOrbBlast(blast: OrbBlast, parent: THREE.Object3D) {
  if (blast.lightIndex >= 0) {
    const slot = _blastLightPool[blast.lightIndex]
    if (slot) parkBlastLight(slot)
    blast.lightIndex = -1
  }
  parent.remove(blast.root)
  const coreMat = blast.core.material
  const haloMat = blast.halo.material
  if (
    !Array.isArray(coreMat) &&
    coreMat !== sharedBlastCoreMat &&
    coreMat !== sharedHealBlastCoreMat
  ) {
    coreMat.dispose()
  }
  if (
    !Array.isArray(haloMat) &&
    haloMat !== sharedBlastHaloMat &&
    haloMat !== sharedHealBlastHaloMat
  ) {
    haloMat.dispose()
  }
  const i = _orbBlasts.indexOf(blast)
  if (i >= 0) _orbBlasts.splice(i, 1)
}

function updateOrbBlasts(dt: number, parent: THREE.Object3D) {
  for (let i = _orbBlasts.length - 1; i >= 0; i--) {
    const blast = _orbBlasts[i]!
    blast.age += dt
    const t = Math.min(1, blast.age / BLAST_DURATION)
    const grow = 1 - (1 - t) * (1 - t)
    const fade = 1 - t * t
    blast.core.scale.setScalar(0.08 + grow * (BLAST_RADIUS * 0.55))
    blast.halo.scale.setScalar(0.16 + grow * BLAST_RADIUS)
    ;(blast.core.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade
    ;(blast.halo.material as THREE.MeshBasicMaterial).opacity =
      (blast.kind === 'heal' ? 0.5 : 0.45) * fade
    if (blast.lightIndex >= 0) {
      const slot = _blastLightPool[blast.lightIndex]
      if (slot) {
        // Bright flash that falls off with the visual — slightly front-loaded.
        const lightFade = fade * fade
        slot.light.intensity = BLAST_LIGHT_INTENSITY * lightFade
        slot.light.distance = BLAST_LIGHT_DISTANCE * (0.65 + 0.35 * fade)
      }
    }
    if (t >= 1) removeOrbBlast(blast, parent)
  }
}

function enemyDistSqToBlast(enemy: EnemyInstance, center: THREE.Vector3): number {
  const pos = enemy.root.position
  const feetY = pos.y + enemy.colFootOffset + enemy.visual.position.y
  const minX = pos.x - enemy.colHalfX
  const maxX = pos.x + enemy.colHalfX
  const minY = feetY
  const maxY = feetY + enemy.colHeight
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

function playerInHealBlast(playerPos: THREE.Vector3, hitPoint: THREE.Vector3): boolean {
  const minY = playerPos.y
  const maxY = playerPos.y + PLAYER_HEAL_HEIGHT
  const cy = Math.min(Math.max(hitPoint.y, minY), maxY)
  const dx = playerPos.x - hitPoint.x
  const dy = cy - hitPoint.y
  const dz = playerPos.z - hitPoint.z
  return dx * dx + dy * dy + dz * dz <= PLAYER_HEAL_RADIUS_SQ
}

/**
 * True when the flight segment comes within the player capsule.
 * Writes the closest sample into `outHit`.
 */
function segmentHitsPlayer(
  prev: THREE.Vector3,
  next: THREE.Vector3,
  playerPos: THREE.Vector3,
  outHit: THREE.Vector3,
): boolean {
  const minY = playerPos.y
  const maxY = playerPos.y + PLAYER_HEAL_HEIGHT
  for (let i = 0; i <= 4; i++) {
    const t = i / 4
    outHit.lerpVectors(prev, next, t)
    const cy = Math.min(Math.max(outHit.y, minY), maxY)
    const dx = playerPos.x - outHit.x
    const dy = cy - outHit.y
    const dz = playerPos.z - outHit.z
    if (dx * dx + dy * dy + dz * dz <= PLAYER_HIT_RADIUS_SQ) {
      outHit.y = cy
      return true
    }
  }
  return false
}

function triggerOrbBlast(
  hitPoint: THREE.Vector3,
  kind: ThrownOrbKind,
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  deathCtx: EnemyDeathContext | undefined,
  playerPos?: THREE.Vector3,
  onHeal?: (amount: number) => void,
  spiders?: SpiderInstance[],
  spidersGroup?: THREE.Object3D,
  spiderDeathCtx?: SpiderDeathContext,
) {
  spawnOrbBlast(parent, hitPoint, kind)
  _blastCenter.copy(hitPoint)
  if (kind === 'heal') {
    for (const enemy of enemies) {
      if (enemyDistSqToBlast(enemy, _blastCenter) > BLAST_RADIUS_SQ) continue
      healEnemy(enemy, BLAST_HEAL)
    }
    if (playerPos && onHeal && playerInHealBlast(playerPos, hitPoint)) {
      onHeal(BLAST_HEAL)
    }
    return
  }
  const targets = enemies.slice()
  for (const enemy of targets) {
    if (!enemies.includes(enemy)) continue
    if (enemyDistSqToBlast(enemy, _blastCenter) > BLAST_RADIUS_SQ) continue
    damageEnemy(
      enemy,
      BLAST_DAMAGE,
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
      const dy =
        spider.root.position.y + spider.colHeight * 0.5 - _blastCenter.y
      const dz = spider.root.position.z - _blastCenter.z
      if (dx * dx + dy * dy + dz * dz > BLAST_RADIUS_SQ) continue
      damageSpider(
        spider,
        BLAST_DAMAGE,
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

function removeOrb(orb: ThrownOrb, parent: THREE.Object3D, orbs: ThrownOrb[]) {
  parent.remove(orb.root)
  const i = orbs.indexOf(orb)
  if (i >= 0) orbs.splice(i, 1)
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

export function spawnThrownOrb(
  parent: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  orbs: ThrownOrb[],
  kind: ThrownOrbKind = 'damage',
) {
  const root = createOrbMesh(kind)
  root.position.copy(origin)
  _fwd.copy(direction).normalize()
  const vel = _fwd.clone().multiplyScalar(ORB_SPEED)
  parent.add(root)
  orbs.push({ root, velocity: vel, life: ORB_MAX_FLIGHT, kind, spawnPos: origin.clone() })
}

export function hasOrbBlasts() {
  return _orbBlasts.length > 0
}

export function clearThrownOrbs(orbs: ThrownOrb[], parent: THREE.Object3D) {
  while (orbs.length > 0) {
    removeOrb(orbs[0]!, parent, orbs)
  }
  while (_orbBlasts.length > 0) {
    removeOrbBlast(_orbBlasts[0]!, parent)
  }
}

export function updateThrownOrbs(
  dt: number,
  orbs: ThrownOrb[],
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  raycaster: THREE.Raycaster,
  opts: ThrownOrbUpdateOpts,
) {
  updateOrbBlasts(dt, parent)
  if (orbs.length === 0) return

  const {
    groundTargets,
    trees,
    rocks,
    voxelMeshes,
    resolveVoxelHit,
    intersectBuildBlocks,
    resolveBuildBlockHit,
    deathCtx,
    collisionWorld,
    capsuleCollider,
    playerPos,
    onHeal,
    spiders,
    spidersGroup,
    spiderDeathCtx,
  } = opts

  _pickMeshes.length = 0
  for (let i = 0; i < enemies.length; i++) _pickMeshes.push(enemies[i]!.pickMesh)
  if (spiders) {
    for (let i = 0; i < spiders.length; i++) _pickMeshes.push(spiders[i]!.pickMesh)
  }

  for (let i = orbs.length - 1; i >= 0; i--) {
    const orb = orbs[i]!

    const explode = (point: THREE.Vector3) => {
      triggerOrbBlast(
        point,
        orb.kind,
        parent,
        enemies,
        enemiesGroup,
        deathCtx,
        playerPos,
        onHeal,
        spiders,
        spidersGroup,
        spiderDeathCtx,
      )
      removeOrb(orb, parent, orbs)
    }

    orb.life -= dt
    if (orb.life <= 0) {
      explode(orb.root.position)
      continue
    }

    orb.velocity.y -= ORB_GRAVITY * dt

    _prev.copy(orb.root.position)
    _next.copy(orb.velocity).multiplyScalar(dt).add(_prev)
    _dir.subVectors(_next, _prev)
    const stepLen = _dir.length()

    if (stepLen > 1e-5) {
      _dir.multiplyScalar(1 / stepLen)
      raycaster.set(_prev, _dir)
      raycaster.far = stepLen
      raycaster.near = 0

      const groundEst = collisionWorld?.columnTopNear(_prev.x, _prev.z) ?? null
      const highAboveFloor =
        groundEst !== null && Math.min(_prev.y, _next.y) > groundEst + AIR_CLEARANCE

      // Direct player hits — ballista healing berries / “shoot me” at close range.
      if (
        playerPos &&
        _prev.distanceToSquared(orb.spawnPos) >= PLAYER_HIT_GRACE_DIST_SQ &&
        segmentHitsPlayer(_prev, _next, playerPos, _boxHit)
      ) {
        explode(_boxHit)
        continue
      }

      if (_pickMeshes.length > 0) {
        _hits.length = 0
        raycaster.intersectObjects(_pickMeshes, false, _hits)
        if (_hits.length > 0) {
          explode(_hits[0]!.point)
          continue
        }
      }

      collectNearbyProps(_prev, trees, rocks, _nearbyProps)
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

    orb.root.position.copy(_next)

    if (orb.velocity.y > 0.15) continue
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
    if (groundY !== null && _next.y <= groundY + ORB_RADIUS) {
      _groundHit.set(_next.x, groundY, _next.z)
      explode(_groundHit)
    }
  }
}
