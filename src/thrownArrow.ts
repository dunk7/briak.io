import * as THREE from 'three'
import type { CollisionWorld } from './collisionWorld'
import {
  ARROW_DAMAGE,
  ARROW_HIT_KNOCKBACK_SPEED,
  DIAMOND_ARROW_DAMAGE,
  GOLD_ARROW_DAMAGE,
  IRON_ARROW_DAMAGE,
  damageEnemy,
  healEnemy,
  type EnemyDeathContext,
  type EnemyInstance,
} from './enemy'
import type { Inventory, InventoryItem } from './inventory'
import type { CapsuleCollider } from './meshCollider'
import {
  damageSpider,
  SPIDER_HIT_KNOCKBACK_SPEED,
  type SpiderDeathContext,
  type SpiderInstance,
} from './roboticSpider'
import { type MeshGroundTargets } from './terrainGroundRay'

/** Full-draw flight speed — snappy and flat compared to spears. */
export const ARROW_MAX_SPEED = 42
export const ARROW_MIN_SPEED = 14
const ARROW_GRAVITY = 9.5
/** Long enough for a full-draw vertical shot (~9s round-trip) plus elevated terrain. */
const ARROW_MAX_FLIGHT = 14
const ARROW_DROP_LIFE = 3.2
/** How long stuck / pickable arrows linger before despawning (matches ground items). */
const ARROW_STUCK_LIFE = 60
const ARROW_HIT_HORIZ_KEEP = 0.12
const ARROW_HIT_UP_BOUNCE = 1.0
const PICKUP_RADIUS = 1.4
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS
const TIP_OFFSET = 0.28
const STICK_EMBED = 0.1
const GROUND_PROBE_DROP = 6
/** Apex of a full-draw vertical shot is ~93 units; probe far enough if life expires high. */
const TIMEOUT_GROUND_DROP = 120
/** Skip terrain/voxel mesh casts when this far above the column-top estimate. */
const AIR_CLEARANCE = 8
/** Glowing-arrow impact blast — damages every enemy inside this radius. */
const GLOW_BLAST_RADIUS = 1
const GLOW_BLAST_RADIUS_SQ = GLOW_BLAST_RADIUS * GLOW_BLAST_RADIUS
const GLOW_BLAST_DURATION = 0.32
const GLOW_BLAST_KNOCKBACK = ARROW_HIT_KNOCKBACK_SPEED * 0.85
/** Crystal-berry arrows heal this much — matches eating crystal berries. */
export const HEALING_ARROW_HEAL = 5
/** Player body height used for proximity heal checks (feet → head). */
const PLAYER_HEAL_HEIGHT = 1.8
/** Extra horizontal padding so landing at your feet reliably counts. */
const PLAYER_HEAL_RADIUS_PAD = 0.35
const PLAYER_HEAL_RADIUS = GLOW_BLAST_RADIUS + PLAYER_HEAL_RADIUS_PAD
const PLAYER_HEAL_RADIUS_SQ = PLAYER_HEAL_RADIUS * PLAYER_HEAL_RADIUS

const _prev = new THREE.Vector3()
const _next = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _tip = new THREE.Vector3()
const _playerDelta = new THREE.Vector3()
const _boxHit = new THREE.Vector3()
const _blastCenter = new THREE.Vector3()
const _hits: THREE.Intersection[] = []
const _nearbyProps: THREE.Object3D[] = []
const _zAxis = new THREE.Vector3(0, 0, 1)
const _pickMeshes: THREE.Object3D[] = []
const _glowBlasts: GlowArrowBlast[] = []
/** Per-frame ground-probe cache so clustered falling arrows share one raycast. */
const _groundCacheKeys: number[] = []
const _groundCacheVals: (number | null)[] = []

export type ArrowVoxelHit = {
  cellKey: string
  layer: number
}

export type ArrowItem = Extract<
  InventoryItem,
  | 'arrow'
  | 'iron_arrow'
  | 'gold_arrow'
  | 'diamond_arrow'
  | 'glowing_arrow'
  | 'glowing_iron_arrow'
  | 'glowing_gold_arrow'
  | 'glowing_diamond_arrow'
  | 'healing_gold_arrow'
  | 'glowing_healing_gold_arrow'
>

export const ARROW_ITEMS: readonly ArrowItem[] = [
  'glowing_diamond_arrow',
  'diamond_arrow',
  'glowing_healing_gold_arrow',
  'healing_gold_arrow',
  'glowing_gold_arrow',
  'gold_arrow',
  'glowing_iron_arrow',
  'iron_arrow',
  'glowing_arrow',
  'arrow',
]

export function isArrowItem(item: string | null): item is ArrowItem {
  return (
    item === 'arrow' ||
    item === 'iron_arrow' ||
    item === 'gold_arrow' ||
    item === 'diamond_arrow' ||
    item === 'glowing_arrow' ||
    item === 'glowing_iron_arrow' ||
    item === 'glowing_gold_arrow' ||
    item === 'glowing_diamond_arrow' ||
    item === 'healing_gold_arrow' ||
    item === 'glowing_healing_gold_arrow'
  )
}

export function isGlowingArrow(item: ArrowItem): boolean {
  return (
    item === 'glowing_arrow' ||
    item === 'glowing_iron_arrow' ||
    item === 'glowing_gold_arrow' ||
    item === 'glowing_diamond_arrow' ||
    item === 'glowing_healing_gold_arrow'
  )
}

export function isHealingArrow(item: ArrowItem): boolean {
  return item === 'healing_gold_arrow' || item === 'glowing_healing_gold_arrow'
}

export function arrowDamage(item: ArrowItem): number {
  if (isHealingArrow(item)) return 0
  if (item === 'diamond_arrow' || item === 'glowing_diamond_arrow') {
    return DIAMOND_ARROW_DAMAGE
  }
  if (item === 'gold_arrow' || item === 'glowing_gold_arrow') {
    return GOLD_ARROW_DAMAGE
  }
  if (item === 'iron_arrow' || item === 'glowing_iron_arrow') {
    return IRON_ARROW_DAMAGE
  }
  return ARROW_DAMAGE
}

/** Prefer the strongest arrow available in inventory. */
export function findBestArrow(inventory: Inventory): ArrowItem | null {
  for (const item of ARROW_ITEMS) {
    if (inventory.countItem(item) > 0) return item
  }
  return null
}

export type ThrownArrow = {
  root: THREE.Group
  item: ArrowItem
  velocity: THREE.Vector3
  life: number
  stuck: boolean
  ignoreEnemies: boolean
  /** World position at spawn — used for close-range player-hit grace. */
  spawnPos: THREE.Vector3
  stuckTo: THREE.Object3D | null
  stuckBlockKey: string | null
  stuckVoxelKey: string | null
  stuckVoxelLayer: number | null
}

export type ThrownArrowUpdateOpts = {
  groundTargets: MeshGroundTargets
  trees: readonly THREE.Object3D[]
  rocks: readonly THREE.Object3D[]
  voxelMeshes: readonly THREE.Object3D[]
  resolveVoxelHit: (mesh: THREE.Object3D, instanceId: number) => ArrowVoxelHit | null
  intersectBuildBlocks: (raycaster: THREE.Raycaster, out: THREE.Intersection[]) => void
  resolveBuildBlockHit: (mesh: THREE.Object3D, instanceId: number) => string | null
  playerPos: THREE.Vector3
  inventory: Inventory
  deathCtx?: EnemyDeathContext
  collisionWorld?: CollisionWorld
  capsuleCollider?: CapsuleCollider
  /** Called when a healing arrow should restore player health. */
  onHeal?: (amount: number) => void
  /** Called when a damage arrow hits the player (e.g. ballista “shoot me”). */
  onPlayerDamage?: (amount: number) => void
  spiders?: SpiderInstance[]
  spidersGroup?: THREE.Object3D
  spiderDeathCtx?: SpiderDeathContext
}

function tipColors(item: ArrowItem): {
  color: number
  roughness: number
  metalness: number
  emissive?: number
  emissiveIntensity?: number
} {
  if (item === 'healing_gold_arrow') {
    return {
      color: 0xe8c84a,
      roughness: 0.18,
      metalness: 0.78,
      emissive: 0x9333ea,
      emissiveIntensity: 0.55,
    }
  }
  if (item === 'glowing_healing_gold_arrow') {
    return {
      color: 0xd4a8ff,
      roughness: 0.28,
      metalness: 0.4,
      emissive: 0xa855f7,
      emissiveIntensity: 1.55,
    }
  }
  const glowing = isGlowingArrow(item)
  switch (item) {
    case 'iron_arrow':
    case 'glowing_iron_arrow':
      return {
        color: glowing ? 0xff8844 : 0xd8d4cc,
        roughness: glowing ? 0.35 : 0.22,
        metalness: glowing ? 0.35 : 0.72,
        ...(glowing
          ? { emissive: 0xff3300, emissiveIntensity: 1.4 }
          : {}),
      }
    case 'gold_arrow':
    case 'glowing_gold_arrow':
      return {
        color: glowing ? 0xffaa44 : 0xe8c84a,
        roughness: glowing ? 0.3 : 0.18,
        metalness: glowing ? 0.4 : 0.78,
        ...(glowing
          ? { emissive: 0xff4400, emissiveIntensity: 1.5 }
          : {}),
      }
    case 'diamond_arrow':
    case 'glowing_diamond_arrow':
      return {
        color: glowing ? 0xff9966 : 0x7ad8f0,
        roughness: glowing ? 0.25 : 0.12,
        metalness: glowing ? 0.45 : 0.85,
        ...(glowing
          ? { emissive: 0xff2200, emissiveIntensity: 1.6 }
          : {}),
      }
    default:
      return {
        color: glowing ? 0xff5522 : 0x5a5a54,
        roughness: glowing ? 0.45 : 0.9,
        metalness: glowing ? 0.15 : 0.04,
        ...(glowing
          ? { emissive: 0xff3300, emissiveIntensity: 1.35 }
          : {}),
      }
  }
}

let sharedArrowGlowMat: THREE.MeshBasicMaterial | null = null
let sharedArrowGlowHaloMat: THREE.MeshBasicMaterial | null = null
let sharedHealArrowGlowMat: THREE.MeshBasicMaterial | null = null
let sharedHealArrowGlowHaloMat: THREE.MeshBasicMaterial | null = null

function getArrowGlowMat() {
  return (sharedArrowGlowMat ??= new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getArrowGlowHaloMat() {
  return (sharedArrowGlowHaloMat ??= new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getHealArrowGlowMat() {
  return (sharedHealArrowGlowMat ??= new THREE.MeshBasicMaterial({
    color: 0xc084fc,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getHealArrowGlowHaloMat() {
  return (sharedHealArrowGlowHaloMat ??= new THREE.MeshBasicMaterial({
    color: 0x7c3aed,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

type GlowBlastKind = 'damage' | 'heal'

type GlowArrowBlast = {
  root: THREE.Group
  core: THREE.Mesh
  halo: THREE.Mesh
  age: number
  kind: GlowBlastKind
}

let sharedBlastCoreMat: THREE.MeshBasicMaterial | null = null
let sharedBlastHaloMat: THREE.MeshBasicMaterial | null = null
let sharedHealBlastCoreMat: THREE.MeshBasicMaterial | null = null
let sharedHealBlastHaloMat: THREE.MeshBasicMaterial | null = null
const blastCoreGeo = new THREE.SphereGeometry(1, 12, 12)
const blastHaloGeo = new THREE.SphereGeometry(1, 10, 10)

function getBlastCoreMat() {
  return (sharedBlastCoreMat ??= new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getBlastHaloMat() {
  return (sharedBlastHaloMat ??= new THREE.MeshBasicMaterial({
    color: 0xff2200,
    transparent: true,
    opacity: 0.45,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getHealBlastCoreMat() {
  return (sharedHealBlastCoreMat ??= new THREE.MeshBasicMaterial({
    color: 0xd8b4fe,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function getHealBlastHaloMat() {
  return (sharedHealBlastHaloMat ??= new THREE.MeshBasicMaterial({
    color: 0x7c3aed,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }))
}

function spawnGlowArrowBlast(
  parent: THREE.Object3D,
  point: THREE.Vector3,
  kind: GlowBlastKind = 'damage',
) {
  const root = new THREE.Group()
  root.position.copy(point)
  const coreMat =
    kind === 'heal' ? getHealBlastCoreMat().clone() : getBlastCoreMat().clone()
  const haloMat =
    kind === 'heal' ? getHealBlastHaloMat().clone() : getBlastHaloMat().clone()
  const core = new THREE.Mesh(blastCoreGeo, coreMat)
  core.scale.setScalar(0.08)
  core.castShadow = false
  core.receiveShadow = false
  const halo = new THREE.Mesh(blastHaloGeo, haloMat)
  halo.scale.setScalar(0.16)
  halo.castShadow = false
  halo.receiveShadow = false
  root.add(core, halo)
  parent.add(root)
  _glowBlasts.push({ root, core, halo, age: 0, kind })
}

function removeGlowBlast(blast: GlowArrowBlast, parent: THREE.Object3D) {
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
  const i = _glowBlasts.indexOf(blast)
  if (i >= 0) _glowBlasts.splice(i, 1)
}

function updateGlowArrowBlasts(dt: number, parent: THREE.Object3D) {
  for (let i = _glowBlasts.length - 1; i >= 0; i--) {
    const blast = _glowBlasts[i]!
    blast.age += dt
    const t = Math.min(1, blast.age / GLOW_BLAST_DURATION)
    const grow = 1 - (1 - t) * (1 - t)
    const fade = 1 - t * t
    blast.core.scale.setScalar(0.08 + grow * (GLOW_BLAST_RADIUS * 0.55))
    blast.halo.scale.setScalar(0.16 + grow * GLOW_BLAST_RADIUS)
    const coreMat = blast.core.material as THREE.MeshBasicMaterial
    const haloMat = blast.halo.material as THREE.MeshBasicMaterial
    coreMat.opacity = 0.9 * fade
    haloMat.opacity = (blast.kind === 'heal' ? 0.5 : 0.45) * fade
    if (t >= 1) removeGlowBlast(blast, parent)
  }
}

/** Closest-point distance² from blast center to enemy combat volume. */
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

/**
 * Glowing / healing arrow impact effects.
 * Damage glow: orange blast + AoE enemy damage.
 * Healing glow: purple blast + heal player/enemies in radius.
 * Healing (non-glow): heal the struck enemy, and heal the player if near the impact.
 */
function triggerGlowArrowBlast(
  hitPoint: THREE.Vector3,
  arrow: ThrownArrow,
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  deathCtx: EnemyDeathContext | undefined,
  playerPos?: THREE.Vector3,
  onHeal?: (amount: number) => void,
  primaryEnemy?: EnemyInstance | null,
  spiders?: SpiderInstance[],
  spidersGroup?: THREE.Object3D,
  spiderDeathCtx?: SpiderDeathContext,
) {
  if (isHealingArrow(arrow.item)) {
    _blastCenter.copy(hitPoint)
    if (isGlowingArrow(arrow.item)) {
      spawnGlowArrowBlast(parent, hitPoint, 'heal')
      for (const enemy of enemies) {
        if (enemyDistSqToBlast(enemy, _blastCenter) > GLOW_BLAST_RADIUS_SQ) continue
        healEnemy(enemy, HEALING_ARROW_HEAL)
      }
    } else if (primaryEnemy) {
      healEnemy(primaryEnemy, HEALING_ARROW_HEAL)
    }
    if (playerPos && onHeal && playerInHealBlast(playerPos, hitPoint)) {
      onHeal(HEALING_ARROW_HEAL)
    }
    return
  }
  if (!isGlowingArrow(arrow.item)) return
  spawnGlowArrowBlast(parent, hitPoint, 'damage')
  const damage = arrowDamage(arrow.item)
  _blastCenter.copy(hitPoint)
  // Snapshot list — damageEnemy may remove enemies mid-loop.
  const targets = enemies.slice()
  for (const enemy of targets) {
    if (!enemies.includes(enemy)) continue
    if (enemyDistSqToBlast(enemy, _blastCenter) > GLOW_BLAST_RADIUS_SQ) continue
    damageEnemy(
      enemy,
      damage,
      enemiesGroup,
      enemies,
      _blastCenter.x,
      _blastCenter.z,
      GLOW_BLAST_KNOCKBACK,
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
      if (dx * dx + dy * dy + dz * dz > GLOW_BLAST_RADIUS_SQ) continue
      damageSpider(
        spider,
        damage,
        spidersGroup,
        spiders,
        _blastCenter.x,
        _blastCenter.z,
        GLOW_BLAST_KNOCKBACK,
        spiderDeathCtx,
      )
    }
  }
}

/** Closest-point distance check against a rough player capsule. */
function playerInHealBlast(playerPos: THREE.Vector3, hitPoint: THREE.Vector3): boolean {
  const minY = playerPos.y
  const maxY = playerPos.y + PLAYER_HEAL_HEIGHT
  const cy = Math.min(Math.max(hitPoint.y, minY), maxY)
  const dx = playerPos.x - hitPoint.x
  const dy = cy - hitPoint.y
  const dz = playerPos.z - hitPoint.z
  return dx * dx + dy * dy + dz * dz <= PLAYER_HEAL_RADIUS_SQ
}

/** Generous body radius so ballista shots can land on the player. */
const PLAYER_HIT_RADIUS = 0.42
const PLAYER_HIT_RADIUS_SQ = PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS
/**
 * Skip player hits until the projectile has cleared the muzzle / bow hand.
 * Distance-based so close-range ballista “shoot me” heals still connect
 * (a time grace at arrow speed skipped the whole player capsule).
 */
const PLAYER_HIT_GRACE_DIST = 0.55
const PLAYER_HIT_GRACE_DIST_SQ = PLAYER_HIT_GRACE_DIST * PLAYER_HIT_GRACE_DIST

/**
 * True when the flight segment comes within the player capsule.
 * Writes the closest point on the segment into `outHit`.
 */
function segmentHitsPlayer(
  prev: THREE.Vector3,
  next: THREE.Vector3,
  playerPos: THREE.Vector3,
  outHit: THREE.Vector3,
): boolean {
  const minY = playerPos.y
  const maxY = playerPos.y + PLAYER_HEAL_HEIGHT
  // Sample a few points along the segment (short steps; cheap).
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

function createArrowMesh(item: ArrowItem): THREE.Group {
  const group = new THREE.Group()
  const shaftMat = new THREE.MeshStandardMaterial({
    color: 0x7a5030,
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
    fog: false,
  })
  const fletchMat = new THREE.MeshStandardMaterial({
    color: 0xf0ece4,
    roughness: 0.75,
    metalness: 0,
    flatShading: true,
    fog: false,
  })
  const fletchDarkMat = new THREE.MeshStandardMaterial({
    color: 0xa8a49c,
    roughness: 0.8,
    metalness: 0,
    flatShading: true,
    fog: false,
  })
  const tipSpec = tipColors(item)
  const tipMat = new THREE.MeshStandardMaterial({
    color: tipSpec.color,
    roughness: tipSpec.roughness,
    metalness: tipSpec.metalness,
    flatShading: true,
    fog: false,
    ...(tipSpec.emissive != null
      ? {
          emissive: tipSpec.emissive,
          emissiveIntensity: tipSpec.emissiveIntensity ?? 1,
        }
      : {}),
  })

  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.42), shaftMat)
  shaft.position.z = -0.04
  shaft.castShadow = false
  shaft.receiveShadow = false

  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.12), tipMat)
  tip.position.z = 0.22
  tip.castShadow = false
  tip.receiveShadow = false

  const fletchA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.12), fletchMat)
  fletchA.position.set(0, 0, -0.22)
  fletchA.castShadow = false
  fletchA.receiveShadow = false

  const fletchB = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.08, 0.12), fletchDarkMat)
  fletchB.position.set(0, 0, -0.22)
  fletchB.castShadow = false
  fletchB.receiveShadow = false

  group.add(shaft, tip, fletchA, fletchB)

  // Additive tip glow — no PointLight (avoids shader recompile hitch).
  if (isGlowingArrow(item)) {
    const healGlow = isHealingArrow(item)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 8),
      healGlow ? getHealArrowGlowMat() : getArrowGlowMat(),
    )
    core.position.z = 0.26
    core.castShadow = false
    core.receiveShadow = false
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 8),
      healGlow ? getHealArrowGlowHaloMat() : getArrowGlowHaloMat(),
    )
    halo.position.z = 0.24
    halo.castShadow = false
    halo.receiveShadow = false
    group.add(core, halo)
  }

  return group
}

function orientArrow(arrow: ThrownArrow, dir: THREE.Vector3) {
  const len = dir.length()
  if (len < 1e-5) return
  _fwd.copy(dir).multiplyScalar(1 / len)
  arrow.root.quaternion.setFromUnitVectors(_zAxis, _fwd)
}

function clearStickTarget(arrow: ThrownArrow) {
  arrow.stuckTo = null
  arrow.stuckBlockKey = null
  arrow.stuckVoxelKey = null
  arrow.stuckVoxelLayer = null
}

function stickArrow(
  arrow: ThrownArrow,
  tipPoint: THREE.Vector3,
  along: THREE.Vector3,
  target?: {
    prop?: THREE.Object3D | null
    blockKey?: string | null
    voxel?: ArrowVoxelHit | null
  },
) {
  orientArrow(arrow, along)
  arrow.root.position.copy(tipPoint).addScaledVector(_fwd, -TIP_OFFSET + STICK_EMBED)
  arrow.velocity.set(0, 0, 0)
  arrow.stuck = true
  clearStickTarget(arrow)
  if (target?.prop) arrow.stuckTo = target.prop
  if (target?.blockKey) arrow.stuckBlockKey = target.blockKey
  if (target?.voxel) {
    arrow.stuckVoxelKey = target.voxel.cellKey
    arrow.stuckVoxelLayer = target.voxel.layer
  }
  arrow.life = ARROW_STUCK_LIFE
}

function dropArrowFromHit(arrow: ThrownArrow, hitPoint: THREE.Vector3) {
  arrow.root.position.copy(hitPoint).addScaledVector(_dir, -0.06)
  arrow.velocity.x *= ARROW_HIT_HORIZ_KEEP
  arrow.velocity.z *= ARROW_HIT_HORIZ_KEEP
  arrow.velocity.y = Math.max(arrow.velocity.y * 0.12, ARROW_HIT_UP_BOUNCE)
  arrow.ignoreEnemies = true
  arrow.stuck = false
  clearStickTarget(arrow)
  arrow.life = ARROW_DROP_LIFE
  orientArrow(arrow, arrow.velocity)
}

function probeArrowGroundY(
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

function cachedProbeArrowGroundY(
  tipX: number,
  tipY: number,
  tipZ: number,
  maxDrop: number,
  collisionWorld: CollisionWorld | undefined,
  capsule: CapsuleCollider | undefined,
): number | null {
  // Quantize so arrows falling together reuse one probe (~25cm xz, ~50cm y).
  const key =
    (Math.round(tipX * 4) * 73856093) ^
    (Math.round(tipZ * 4) * 19349663) ^
    (Math.round(tipY * 2) * 83492791) ^
    (maxDrop | 0)
  for (let i = 0; i < _groundCacheKeys.length; i++) {
    if (_groundCacheKeys[i] === key) return _groundCacheVals[i]!
  }
  const y = probeArrowGroundY(tipX, tipY, tipZ, maxDrop, collisionWorld, capsule)
  _groundCacheKeys.push(key)
  _groundCacheVals.push(y)
  return y
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

function removeArrow(arrow: ThrownArrow, parent: THREE.Object3D, arrows: ThrownArrow[]) {
  parent.remove(arrow.root)
  arrow.root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) {
        // Tip glow spheres share materials across arrows — don't dispose them.
        if (mat === sharedArrowGlowMat || mat === sharedArrowGlowHaloMat) continue
        if (mat === sharedHealArrowGlowMat || mat === sharedHealArrowGlowHaloMat) continue
        mat.dispose()
      }
    }
  })
  const i = arrows.indexOf(arrow)
  if (i >= 0) arrows.splice(i, 1)
}

function tryPickupArrow(
  arrow: ThrownArrow,
  parent: THREE.Object3D,
  arrows: ThrownArrow[],
  playerPos: THREE.Vector3,
  inventory: Inventory,
): boolean {
  _playerDelta.subVectors(playerPos, arrow.root.position)
  _playerDelta.y = 0
  if (_playerDelta.lengthSq() > PICKUP_RADIUS_SQ) return false
  inventory.add(arrow.item, 1)
  removeArrow(arrow, parent, arrows)
  return true
}

export function spawnThrownArrow(
  parent: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  arrows: ThrownArrow[],
  item: ArrowItem,
  speed = ARROW_MAX_SPEED,
) {
  const root = createArrowMesh(item)
  root.position.copy(origin)
  _fwd.copy(direction).normalize()
  root.quaternion.setFromUnitVectors(_zAxis, _fwd)

  const vel = _fwd.clone().multiplyScalar(speed)
  parent.add(root)
  arrows.push({
    root,
    item,
    velocity: vel,
    life: ARROW_MAX_FLIGHT,
    stuck: false,
    ignoreEnemies: false,
    spawnPos: origin.clone(),
    stuckTo: null,
    stuckBlockKey: null,
    stuckVoxelKey: null,
    stuckVoxelLayer: null,
  })
}

function dropMatchingArrows(
  arrows: ThrownArrow[],
  match: (arrow: ThrownArrow) => boolean,
) {
  for (const arrow of arrows) {
    if (!arrow.stuck || !match(arrow)) continue
    _dir.set(0, -1, 0)
    dropArrowFromHit(arrow, arrow.root.position)
  }
}

export function dropArrowsFromProp(prop: THREE.Object3D, arrows: ThrownArrow[]) {
  dropMatchingArrows(arrows, (arrow) => arrow.stuckTo === prop)
}

export function dropArrowsFromBlock(blockKey: string, arrows: ThrownArrow[]) {
  dropMatchingArrows(arrows, (arrow) => arrow.stuckBlockKey === blockKey)
}

export function dropArrowsFromVoxel(
  cellKey: string,
  layer: number,
  arrows: ThrownArrow[],
) {
  dropMatchingArrows(
    arrows,
    (arrow) => arrow.stuckVoxelKey === cellKey && arrow.stuckVoxelLayer === layer,
  )
}

export function updateThrownArrows(
  dt: number,
  arrows: ThrownArrow[],
  parent: THREE.Object3D,
  enemies: EnemyInstance[],
  enemiesGroup: THREE.Object3D,
  raycaster: THREE.Raycaster,
  opts: ThrownArrowUpdateOpts,
): number {
  updateGlowArrowBlasts(dt, parent)
  if (arrows.length === 0) return 0

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
    onHeal,
    onPlayerDamage,
    spiders,
    spidersGroup,
    spiderDeathCtx,
  } = opts
  const fireImpact = (
    hitPoint: THREE.Vector3,
    arrow: ThrownArrow,
    primaryEnemy: EnemyInstance | null = null,
  ) => {
    triggerGlowArrowBlast(
      hitPoint,
      arrow,
      parent,
      enemies,
      enemiesGroup,
      deathCtx,
      playerPos,
      onHeal,
      primaryEnemy,
      spiders,
      spidersGroup,
      spiderDeathCtx,
    )
  }
  _pickMeshes.length = 0
  for (let i = 0; i < enemies.length; i++) _pickMeshes.push(enemies[i]!.pickMesh)
  if (spiders) {
    for (let i = 0; i < spiders.length; i++) _pickMeshes.push(spiders[i]!.pickMesh)
  }
  _groundCacheKeys.length = 0
  _groundCacheVals.length = 0
  let pickedUp = 0

  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i]!

    if (arrow.stuck) {
      arrow.life -= dt
      if (arrow.life <= 0) {
        removeArrow(arrow, parent, arrows)
        continue
      }
      if (tryPickupArrow(arrow, parent, arrows, playerPos, inventory)) pickedUp++
      continue
    }

    arrow.life -= dt
    if (arrow.life <= 0) {
      if (arrow.velocity.lengthSq() > 1e-8) _fwd.copy(arrow.velocity).normalize()
      else _fwd.set(0, -1, 0)
      const tipX = arrow.root.position.x + _fwd.x * TIP_OFFSET
      const tipZ = arrow.root.position.z + _fwd.z * TIP_OFFSET
      const tipY = arrow.root.position.y + _fwd.y * TIP_OFFSET
      const groundY = probeArrowGroundY(
        tipX,
        tipY,
        tipZ,
        TIMEOUT_GROUND_DROP,
        collisionWorld,
        capsuleCollider,
      )
      if (groundY !== null) {
        _tip.set(tipX, groundY, tipZ)
        stickArrow(arrow, _tip, _fwd)
      } else {
        arrow.velocity.set(0, 0, 0)
        arrow.stuck = true
        arrow.life = ARROW_STUCK_LIFE
      }
      continue
    }

    arrow.velocity.y -= ARROW_GRAVITY * dt

    _prev.copy(arrow.root.position)
    _next.copy(arrow.velocity).multiplyScalar(dt).add(_prev)
    _dir.subVectors(_next, _prev)
    const stepLen = _dir.length()

    // Dropped / post-hit arrows: cheap settle only. Full flight raycasts (dozens of
    // voxel meshes + props + terrain) thrash when many detach from a mined block.
    if (arrow.ignoreEnemies) {
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
          stickArrow(arrow, _boxHit, _dir)
          continue
        }
      }

      arrow.root.position.copy(_next)
      orientArrow(arrow, arrow.velocity)

      // Skip probe during the brief upward bounce after detach.
      if (arrow.velocity.y > 0.15) continue

      const tipX = arrow.root.position.x + _fwd.x * TIP_OFFSET
      const tipZ = arrow.root.position.z + _fwd.z * TIP_OFFSET
      const tipY = arrow.root.position.y + _fwd.y * TIP_OFFSET
      const groundY = cachedProbeArrowGroundY(
        tipX,
        tipY,
        tipZ,
        GROUND_PROBE_DROP,
        collisionWorld,
        capsuleCollider,
      )
      if (groundY !== null && tipY <= groundY) {
        _tip.set(tipX, groundY, tipZ)
        stickArrow(arrow, _tip, arrow.velocity)
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

      // Player body hits (ballista healing / “shoot me”, stray arrows).
      if (
        !arrow.ignoreEnemies &&
        arrow.root.position.distanceToSquared(arrow.spawnPos) >= PLAYER_HIT_GRACE_DIST_SQ &&
        segmentHitsPlayer(_prev, _next, playerPos, _tip)
      ) {
        if (isHealingArrow(arrow.item) || isGlowingArrow(arrow.item)) {
          // Heal / blast FX; glowing damage also hurts the player below.
          fireImpact(_tip, arrow, null)
        }
        if (!isHealingArrow(arrow.item) && onPlayerDamage) {
          onPlayerDamage(arrowDamage(arrow.item))
        }
        dropArrowFromHit(arrow, _tip)
        continue
      }

      if (_pickMeshes.length > 0) {
        _hits.length = 0
        raycaster.intersectObjects(_pickMeshes, false, _hits)
        if (_hits.length > 0) {
          const hit = _hits[0]!
          if (isGlowingArrow(arrow.item) || isHealingArrow(arrow.item)) {
            const enemy = enemies.find((e) => e.pickMesh === hit.object) ?? null
            // Blast / heal covers the primary target — don't also deal direct damage.
            fireImpact(hit.point, arrow, enemy)
          } else {
            const enemy = enemies.find((e) => e.pickMesh === hit.object)
            const spider =
              !enemy && spiders
                ? spiders.find((s) => s.pickMesh === hit.object)
                : undefined
            if (enemy) {
              damageEnemy(
                enemy,
                arrowDamage(arrow.item),
                enemiesGroup,
                enemies,
                _prev.x,
                _prev.z,
                ARROW_HIT_KNOCKBACK_SPEED,
                deathCtx,
              )
            } else if (spider && spiders && spidersGroup) {
              damageSpider(
                spider,
                arrowDamage(arrow.item),
                spidersGroup,
                spiders,
                _prev.x,
                _prev.z,
                SPIDER_HIT_KNOCKBACK_SPEED,
                spiderDeathCtx,
              )
            }
          }
          dropArrowFromHit(arrow, hit.point)
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
          fireImpact(hit.point, arrow)
          stickArrow(arrow, hit.point, _dir, { prop: propRoot })
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
              fireImpact(hit.point, arrow)
              stickArrow(arrow, hit.point, _dir, { blockKey })
              continue
            }
            const voxel = resolveVoxelHit(hit.object, hit.instanceId)
            if (voxel) {
              fireImpact(hit.point, arrow)
              stickArrow(arrow, hit.point, _dir, { voxel })
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
            fireImpact(_boxHit, arrow)
            stickArrow(arrow, _boxHit, _dir)
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
          const hit = _hits[0]!
          fireImpact(hit.point, arrow)
          stickArrow(arrow, hit.point, _dir)
          continue
        }
      }
    }

    arrow.root.position.copy(_next)
    orientArrow(arrow, arrow.velocity)

    // Ground probe only when descending near the floor — high shots used to
    // raycast all terrain meshes every frame for a 6m probe that can't hit.
    if (arrow.velocity.y > 0.15) continue
    const tipX = arrow.root.position.x + _fwd.x * TIP_OFFSET
    const tipZ = arrow.root.position.z + _fwd.z * TIP_OFFSET
    const tipY = arrow.root.position.y + _fwd.y * TIP_OFFSET
    const groundEst = collisionWorld?.columnTopNear(tipX, tipZ) ?? null
    if (groundEst !== null && tipY > groundEst + AIR_CLEARANCE) continue
    const groundY = cachedProbeArrowGroundY(
      tipX,
      tipY,
      tipZ,
      GROUND_PROBE_DROP,
      collisionWorld,
      capsuleCollider,
    )
    if (groundY !== null && tipY <= groundY) {
      _tip.set(tipX, groundY, tipZ)
      fireImpact(_tip, arrow)
      stickArrow(arrow, _tip, arrow.velocity)
    }
  }

  return pickedUp
}

/** Remove in-flight arrows (and glow blasts). Stuck ground arrows are kept for pickup. */
export function clearThrownArrows(arrows: ThrownArrow[], parent: THREE.Object3D) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const arrow = arrows[i]!
    if (arrow.stuck) continue
    removeArrow(arrow, parent, arrows)
  }
  while (_glowBlasts.length > 0) {
    removeGlowBlast(_glowBlasts[0]!, parent)
  }
}

export function hasGlowArrowBlasts() {
  return _glowBlasts.length > 0
}
