import * as THREE from 'three'
import type { CollisionWorld } from './collisionWorld'
import {
  ENEMY_HIT_KNOCKBACK_SPEED,
  resolveEnemyGroundY,
} from './enemy'
import type { MeshGroundTargets } from './terrainGroundRay'

export const SPIDER_MAX_HEALTH = 25
export const SPIDER_DAMAGE = 2
export const SPIDER_LASER_RANGE = 7
export const SPIDER_LASER_COOLDOWN = 1.45
export const SPIDER_AGGRO_RANGE = 28
/** Crawl speed — deliberately slower than night crawlers. */
export const SPIDER_MOVE_SPEED = 1.05
export const SPIDER_MAX_ALIVE = 5
/** Player must be this close to the nest for spiders to spawn (any time of day). */
export const SPIDER_NEST_ACTIVATION_RANGE = 42
/** Seconds between spawn attempts while the player is near and under the alive cap. */
export const SPIDER_SPAWN_INTERVAL = 4.5
/**
 * Absolute world nest center (not relative to player spawn).
 * Defaults: (−74, −22) with a 12 m spawn circle.
 * Sliders map 0–100 → world −120…+120 (X/Z) and 3…28 m (radius).
 */
export const SPIDER_NEST_CENTER_X = -74
export const SPIDER_NEST_CENTER_Z = -22
export const SPIDER_NEST_RADIUS = 12
/** Soft personal space — spiders push apart when closer than this (center-to-center). */
export const SPIDER_SEPARATION_RADIUS = 1.45
const SPIDER_SEPARATION_STRENGTH = 4.2
export const SPIDER_HIT_KNOCKBACK_SPEED = ENEMY_HIT_KNOCKBACK_SPEED
/** Laser hits never push the player. */
export const SPIDER_LASER_KNOCKBACK = 0
export const SPIDER_LASER_KNOCKBACK_LIFT = 0

const NEST_BEACON_HEIGHT = 420
const NEST_BEACON_RADIUS = 0.55
const NEST_RING_THICKNESS = 0.35
const NEST_RING_HEIGHT = 0.08

const BODY_HEIGHT = 0.38
const BAR_WIDTH = 0.42
const BAR_HEIGHT = 0.045
const BAR_HEAD_GAP = 0.12
const HEALTH_BAR_RANGE_SQ = 38 * 38
const LEG_COUNT = 8

const _box = new THREE.Box3()
const _worldPos = new THREE.Vector3()
const _proj = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _laserEnd = new THREE.Vector3()
const _laserOrigin = new THREE.Vector3()
const _laserDir = new THREE.Vector3()
const _laserHit = new THREE.Vector3()
const _tmp = new THREE.Vector3()
/** Aim at the player's mid-torso so LOS doesn't skim the floor. */
const PLAYER_LASER_AIM_Y = 0.7
/** Ignore hits within this of the player so near-miss AABBs don't eat shots. */
const LASER_LOS_PLAYER_SLACK = 0.2

const metalMat = new THREE.MeshStandardMaterial({
  color: 0x3a424c,
  roughness: 0.42,
  metalness: 0.88,
  flatShading: true,
})
const darkMetalMat = new THREE.MeshStandardMaterial({
  color: 0x1c222a,
  roughness: 0.55,
  metalness: 0.92,
  flatShading: true,
})
const accentMat = new THREE.MeshStandardMaterial({
  color: 0x8a1010,
  roughness: 0.35,
  metalness: 0.7,
  emissive: 0x660000,
  emissiveIntensity: 0.45,
  flatShading: true,
})
const eyeMat = new THREE.MeshStandardMaterial({
  color: 0xff2222,
  roughness: 0.25,
  metalness: 0.2,
  emissive: 0xff0000,
  emissiveIntensity: 1.4,
  flatShading: true,
})
const jointMat = new THREE.MeshStandardMaterial({
  color: 0x5a6570,
  roughness: 0.38,
  metalness: 0.85,
  flatShading: true,
})

const pickMat = new THREE.MeshBasicMaterial({
  visible: false,
  transparent: true,
  opacity: 0,
})
const healthBarPlane = new THREE.PlaneGeometry(1, 1)
const healthBarBorderMat = new THREE.MeshBasicMaterial({
  color: 0x0a0a0a,
  depthTest: false,
  depthWrite: false,
  transparent: true,
  opacity: 0.85,
})
const healthBarTrackMat = new THREE.MeshBasicMaterial({
  color: 0x2a1010,
  depthTest: false,
  depthWrite: false,
  transparent: true,
  opacity: 0.9,
})
const laserMat = new THREE.LineBasicMaterial({
  color: 0xff1a1a,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})

export type SpiderDeathContext = {
  parent: THREE.Object3D
  spiders: SpiderInstance[]
  onChipDrop: (x: number, y: number, z: number) => void
}

export type SpiderInstance = {
  root: THREE.Group
  visual: THREE.Group
  pickMesh: THREE.Mesh
  legs: THREE.Group[]
  eyeAnchor: THREE.Object3D
  laserLine: THREE.Line
  colHalfX: number
  colHalfZ: number
  colHeight: number
  colFootOffset: number
  maxHealth: number
  health: number
  attackCooldown: number
  laserFlashT: number
  knockVX: number
  knockVZ: number
  hitSpinT: number
  animT: number
  healthBarGroup: THREE.Group
  healthFill: THREE.Mesh
  healthBarWidth: number
  spawnProtectT: number
}

export type SpiderUpdateResult = {
  damage: number
  knockbackX: number
  knockbackZ: number
}

function createHealthBar(): { group: THREE.Group; fill: THREE.Mesh; width: number } {
  const group = new THREE.Group()
  group.renderOrder = 12

  const border = new THREE.Mesh(healthBarPlane, healthBarBorderMat)
  border.scale.set(BAR_WIDTH + 0.012, BAR_HEIGHT + 0.012, 1)
  group.add(border)

  const track = new THREE.Mesh(healthBarPlane, healthBarTrackMat)
  track.scale.set(BAR_WIDTH, BAR_HEIGHT, 1)
  group.add(track)

  const fillMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setStyle('hsl(0, 68%, 36%)'),
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.95,
  })
  const fill = new THREE.Mesh(healthBarPlane, fillMat)
  fill.scale.set(BAR_WIDTH, BAR_HEIGHT, 1)
  fill.position.z = 0.002
  group.add(fill)

  return { group, fill, width: BAR_WIDTH }
}

function addBox(
  parent: THREE.Object3D,
  mat: THREE.Material,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  mesh.castShadow = false
  mesh.receiveShadow = false
  parent.add(mesh)
  return mesh
}

/** Procedural gunmetal spider with red optics and segmented legs. */
export function buildRoboticSpiderVisual(): THREE.Group {
  const root = new THREE.Group()

  const thorax = addBox(root, metalMat, 0.28, 0.14, 0.32, 0, 0.2, 0.02)
  thorax.rotation.x = -0.08

  const abdomen = addBox(root, darkMetalMat, 0.34, 0.18, 0.38, 0, 0.22, -0.28)
  abdomen.rotation.x = 0.12

  // Red status strip on the abdomen
  addBox(root, accentMat, 0.12, 0.04, 0.28, 0, 0.32, -0.28)

  // Head / sensor array
  addBox(root, metalMat, 0.2, 0.12, 0.16, 0, 0.22, 0.22)
  const eyeAnchor = new THREE.Group()
  eyeAnchor.position.set(0, 0.24, 0.3)
  root.add(eyeAnchor)

  const eyeGeo = new THREE.SphereGeometry(0.035, 6, 6)
  for (const [ex, ey] of [
    [-0.05, 0.02],
    [0.05, 0.02],
    [-0.025, -0.02],
    [0.025, -0.02],
  ] as const) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.set(ex, ey, 0.02)
    eyeAnchor.add(eye)
  }

  // Mandibles
  addBox(root, jointMat, 0.04, 0.05, 0.1, -0.06, 0.16, 0.3)
  addBox(root, jointMat, 0.04, 0.05, 0.1, 0.06, 0.16, 0.3)

  // Antennae
  const antGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.18, 5)
  for (const side of [-1, 1]) {
    const ant = new THREE.Mesh(antGeo, accentMat)
    ant.position.set(side * 0.07, 0.34, 0.22)
    ant.rotation.z = side * 0.35
    ant.rotation.x = -0.5
    root.add(ant)
  }

  const legs: THREE.Group[] = []
  const legGeo = new THREE.CylinderGeometry(0.022, 0.016, 1, 5)
  const jointGeo = new THREE.SphereGeometry(0.03, 5, 5)

  for (let i = 0; i < LEG_COUNT; i++) {
    const side = i < 4 ? -1 : 1
    const slot = i % 4
    const leg = new THREE.Group()
    const baseZ = 0.14 - slot * 0.12
    leg.position.set(side * 0.12, 0.18, baseZ)

    const upper = new THREE.Mesh(legGeo, metalMat)
    upper.scale.set(1, 0.22, 1)
    upper.position.set(side * 0.08, 0.02, 0)
    upper.rotation.z = side * 1.05
    leg.add(upper)

    const joint = new THREE.Mesh(jointGeo, jointMat)
    joint.position.set(side * 0.16, -0.02, 0)
    leg.add(joint)

    const lower = new THREE.Mesh(legGeo, darkMetalMat)
    lower.scale.set(1, 0.26, 1)
    lower.position.set(side * 0.22, -0.14, 0)
    lower.rotation.z = side * 0.55
    leg.add(lower)

    const tip = new THREE.Mesh(jointGeo, accentMat)
    tip.scale.setScalar(0.7)
    tip.position.set(side * 0.28, -0.28, 0)
    leg.add(tip)

    // Rest pose: splay outward
    leg.rotation.y = side * (0.15 + slot * 0.08)
    leg.rotation.z = side * 0.12
    root.add(leg)
    legs.push(leg)
  }

  root.userData.legs = legs
  root.userData.eyeAnchor = eyeAnchor

  // Sit feet on y=0
  root.updateWorldMatrix(true, true)
  _box.setFromObject(root)
  root.position.y -= _box.min.y

  return root
}

function createPickMesh(): THREE.Mesh {
  const geo = new THREE.CapsuleGeometry(0.28, 0.22, 3, 6)
  const mesh = new THREE.Mesh(geo, pickMat)
  mesh.position.set(0, 0.28, -0.04)
  mesh.userData.spiderPick = true
  mesh.userData.enemyPick = true
  return mesh
}

function createLaserLine(): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 0, 1),
  ])
  const line = new THREE.Line(geo, laserMat.clone())
  line.visible = false
  line.frustumCulled = false
  line.renderOrder = 20
  return line
}

export function createSpider(
  x: number,
  y: number,
  z: number,
  parent: THREE.Object3D,
  barParent: THREE.Object3D,
): SpiderInstance {
  const root = new THREE.Group()
  root.position.set(x, y, z)
  root.rotation.y = Math.random() * Math.PI * 2

  const visual = buildRoboticSpiderVisual()
  root.add(visual)

  const pickMesh = createPickMesh()
  root.add(pickMesh)

  const laserLine = createLaserLine()
  root.add(laserLine)

  const { group: healthBarGroup, fill: healthFill, width: healthBarWidth } =
    createHealthBar()
  barParent.add(healthBarGroup)

  parent.add(root)

  const legs = (visual.userData.legs as THREE.Group[]) ?? []
  const eyeAnchor = (visual.userData.eyeAnchor as THREE.Object3D) ?? visual

  return {
    root,
    visual,
    pickMesh,
    legs,
    eyeAnchor,
    laserLine,
    colHalfX: 0.28,
    colHalfZ: 0.32,
    colHeight: BODY_HEIGHT,
    colFootOffset: 0,
    maxHealth: SPIDER_MAX_HEALTH,
    health: SPIDER_MAX_HEALTH,
    attackCooldown: 0.6 + Math.random() * 0.8,
    laserFlashT: 0,
    knockVX: 0,
    knockVZ: 0,
    hitSpinT: 0,
    animT: Math.random() * Math.PI * 2,
    healthBarGroup,
    healthFill,
    healthBarWidth,
    spawnProtectT: 0.35,
  }
}

export function removeSpider(
  spider: SpiderInstance,
  parent: THREE.Object3D,
  spiders: SpiderInstance[],
) {
  parent.remove(spider.root)
  parent.remove(spider.healthBarGroup)
  const idx = spiders.indexOf(spider)
  if (idx >= 0) spiders.splice(idx, 1)
}

export function clearSpiders(spiders: SpiderInstance[], parent: THREE.Object3D) {
  while (spiders.length > 0) {
    removeSpider(spiders[0]!, parent, spiders)
  }
}

export function killSpider(spider: SpiderInstance, ctx: SpiderDeathContext) {
  const pos = spider.root.position
  const dropY = pos.y + spider.colHeight * 0.55
  ctx.onChipDrop(pos.x, dropY, pos.z)
  removeSpider(spider, ctx.parent, ctx.spiders)
}

export function damageSpider(
  spider: SpiderInstance,
  amount: number,
  parent: THREE.Object3D,
  spiders: SpiderInstance[],
  hitterX: number,
  hitterZ: number,
  knockSpeed = SPIDER_HIT_KNOCKBACK_SPEED,
  deathCtx?: SpiderDeathContext,
): boolean {
  if (spider.spawnProtectT > 0) return false

  spider.hitSpinT = 0.35

  const dx = spider.root.position.x - hitterX
  const dz = spider.root.position.z - hitterZ
  const len = Math.hypot(dx, dz)
  if (len > 1e-4) {
    const impulse = knockSpeed / len
    spider.knockVX += dx * impulse
    spider.knockVZ += dz * impulse
  } else {
    const angle = Math.random() * Math.PI * 2
    spider.knockVX += Math.cos(angle) * knockSpeed
    spider.knockVZ += Math.sin(angle) * knockSpeed
  }

  spider.health = Math.max(0, spider.health - amount)
  if (spider.health <= 0) {
    if (deathCtx) killSpider(spider, deathCtx)
    else removeSpider(spider, parent, spiders)
    return true
  }
  return false
}

export function spiderFromIntersection(
  hit: THREE.Intersection,
  spiders: SpiderInstance[],
): SpiderInstance | undefined {
  let obj: THREE.Object3D | null = hit.object
  while (obj) {
    if (obj.userData.spiderPick) {
      for (const spider of spiders) {
        if (spider.pickMesh === obj) return spider
      }
    }
    obj = obj.parent
  }
  return undefined
}

function facingYaw(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

function syncSpiderHealthBar(spider: SpiderInstance, camera: THREE.Camera) {
  const pos = spider.root.position
  if (spider.health >= spider.maxHealth) {
    spider.healthBarGroup.visible = false
    return
  }
  const cdx = pos.x - _camPos.x
  const cdz = pos.z - _camPos.z
  if (cdx * cdx + cdz * cdz > HEALTH_BAR_RANGE_SQ) {
    spider.healthBarGroup.visible = false
    return
  }
  _worldPos.set(pos.x, pos.y + spider.colHeight + BAR_HEAD_GAP, pos.z)
  _proj.copy(_worldPos).project(camera)
  if (_proj.z > 1 || _proj.z < -1) {
    spider.healthBarGroup.visible = false
    return
  }
  spider.healthBarGroup.visible = true
  spider.healthBarGroup.position.copy(_worldPos)
  spider.healthBarGroup.quaternion.copy(camera.quaternion)

  const t = Math.max(0, spider.health / spider.maxHealth)
  const w = spider.healthBarWidth
  spider.healthFill.scale.set(w * t, BAR_HEIGHT, 1)
  spider.healthFill.position.x = (-w * (1 - t)) / 2
}

export function syncSpiderHealthBars(spiders: SpiderInstance[], camera: THREE.Camera) {
  _camPos.setFromMatrixPosition(camera.matrixWorld)
  for (const spider of spiders) syncSpiderHealthBar(spider, camera)
}

function animateLegs(spider: SpiderInstance, moving: boolean, dt: number) {
  if (moving) spider.animT += dt * 10
  const t = spider.animT
  for (let i = 0; i < spider.legs.length; i++) {
    const leg = spider.legs[i]!
    const side = i < 4 ? -1 : 1
    const phase = t + i * 0.7
    const stride = moving ? Math.sin(phase) * 0.28 : 0
    const lift = moving ? Math.max(0, Math.sin(phase)) * 0.12 : 0
    leg.rotation.x = stride * 0.35
    leg.rotation.z = side * (0.12 + lift)
  }
}

function playerLaserAim(playerPos: THREE.Vector3, out: THREE.Vector3) {
  out.set(playerPos.x, playerPos.y + PLAYER_LASER_AIM_Y, playerPos.z)
}

/**
 * True when a projectile-solid voxel/build AABB sits between the eye and the
 * player aim point. Trees/rocks use mesh-only colliders and are not checked.
 */
function laserBlockedByWorld(
  from: THREE.Vector3,
  to: THREE.Vector3,
  collisionWorld: CollisionWorld | undefined,
  outHit?: THREE.Vector3,
): boolean {
  if (!collisionWorld) return false
  _laserDir.subVectors(to, from)
  const dist = _laserDir.length()
  if (dist < 1e-4) return false
  _laserDir.multiplyScalar(1 / dist)
  const hitDist = collisionWorld.castSegment(
    from.x,
    from.y,
    from.z,
    _laserDir.x,
    _laserDir.y,
    _laserDir.z,
    dist,
    outHit ?? _laserHit,
  )
  return hitDist !== null && hitDist < dist - LASER_LOS_PLAYER_SLACK
}

function updateLaserVisual(
  spider: SpiderInstance,
  playerPos: THREE.Vector3,
  dt: number,
  collisionWorld?: CollisionWorld,
) {
  if (spider.laserFlashT <= 0) {
    spider.laserLine.visible = false
    return
  }
  spider.laserFlashT = Math.max(0, spider.laserFlashT - dt)
  spider.eyeAnchor.getWorldPosition(_laserOrigin)
  playerLaserAim(playerPos, _laserEnd)
  if (laserBlockedByWorld(_laserOrigin, _laserEnd, collisionWorld, _laserHit)) {
    _laserEnd.copy(_laserHit)
  }

  // Line lives under root — convert endpoints to local space
  _tmp.copy(_laserOrigin)
  spider.root.worldToLocal(_tmp)
  spider.root.worldToLocal(_laserEnd)
  const pos = spider.laserLine.geometry.attributes.position as THREE.BufferAttribute
  pos.setXYZ(0, _tmp.x, _tmp.y, _tmp.z)
  pos.setXYZ(1, _laserEnd.x, _laserEnd.y, _laserEnd.z)
  pos.needsUpdate = true
  spider.laserLine.visible = true
  const mat = spider.laserLine.material as THREE.LineBasicMaterial
  mat.opacity = 0.35 + 0.65 * Math.min(1, spider.laserFlashT / 0.12)
}

function snapSpiderToGround(
  spider: SpiderInstance,
  targets: MeshGroundTargets,
  collisionWorld: CollisionWorld | undefined,
) {
  const pos = spider.root.position
  const gy = resolveEnemyGroundY(pos.x, pos.z, targets, collisionWorld, pos.y)
  if (gy !== null) pos.y = gy
}

export function updateSpiders(
  spiders: SpiderInstance[],
  playerPos: THREE.Vector3,
  targets: MeshGroundTargets,
  dt: number,
  collisionWorld?: CollisionWorld,
): SpiderUpdateResult {
  let damage = 0
  let knockbackX = 0
  let knockbackZ = 0
  const knockDrag = Math.exp(-8 * dt)
  const aggroSq = SPIDER_AGGRO_RANGE * SPIDER_AGGRO_RANGE
  const laserSq = SPIDER_LASER_RANGE * SPIDER_LASER_RANGE

  for (const spider of spiders) {
    if (spider.spawnProtectT > 0) {
      spider.spawnProtectT = Math.max(0, spider.spawnProtectT - dt)
    }
    spider.attackCooldown = Math.max(0, spider.attackCooldown - dt)
    spider.knockVX *= knockDrag
    spider.knockVZ *= knockDrag

    if (spider.hitSpinT > 0) {
      spider.hitSpinT = Math.max(0, spider.hitSpinT - dt)
      spider.visual.rotation.y += dt * 14
    } else {
      spider.visual.rotation.y *= Math.exp(-10 * dt)
    }

    const pos = spider.root.position
    pos.x += spider.knockVX * dt
    pos.z += spider.knockVZ * dt

    const dx = playerPos.x - pos.x
    const dz = playerPos.z - pos.z
    const distSq = dx * dx + dz * dz
    const dist = Math.sqrt(distSq)
    let moving = false

    if (distSq <= aggroSq && dist > 0.35) {
      spider.root.rotation.y = facingYaw(dx, dz)
      // Keep a bit of standoff so lasers read clearly (~4 m preferred)
      const prefer = 4.2
      if (dist > prefer) {
        const step = Math.min(SPIDER_MOVE_SPEED * dt, dist - prefer)
        pos.x += (dx / dist) * step
        pos.z += (dz / dist) * step
        moving = true
      } else if (dist < 2.8) {
        // Back up slightly if the player gets too close
        const step = Math.min(SPIDER_MOVE_SPEED * 0.7 * dt, prefer - dist)
        pos.x -= (dx / dist) * step
        pos.z -= (dz / dist) * step
        moving = true
      }
    }

    snapSpiderToGround(spider, targets, collisionWorld)
    animateLegs(spider, moving, dt)

    // Laser attack within range — only if nothing solid is between eye and player
    if (
      distSq <= laserSq &&
      dist > 0.4 &&
      spider.attackCooldown <= 0 &&
      spider.spawnProtectT <= 0
    ) {
      spider.eyeAnchor.getWorldPosition(_laserOrigin)
      playerLaserAim(playerPos, _laserEnd)
      if (!laserBlockedByWorld(_laserOrigin, _laserEnd, collisionWorld)) {
        spider.attackCooldown = SPIDER_LASER_COOLDOWN
        spider.laserFlashT = 0.22
        damage += SPIDER_DAMAGE
      }
    }

    updateLaserVisual(spider, playerPos, dt, collisionWorld)
  }

  applySpiderSeparation(spiders, dt)
  for (const spider of spiders) {
    snapSpiderToGround(spider, targets, collisionWorld)
  }

  return { damage, knockbackX, knockbackZ }
}

function applySpiderSeparation(spiders: SpiderInstance[], dt: number) {
  const n = spiders.length
  if (n < 2) return
  const minDist = SPIDER_SEPARATION_RADIUS * 2
  const minDistSq = minDist * minDist
  const scale = SPIDER_SEPARATION_STRENGTH * dt

  for (let i = 0; i < n; i++) {
    const a = spiders[i]!
    const pos = a.root.position
    for (let j = i + 1; j < n; j++) {
      const b = spiders[j]!
      const ox = pos.x - b.root.position.x
      const oz = pos.z - b.root.position.z
      const distSq = ox * ox + oz * oz
      if (distSq >= minDistSq) continue

      if (distSq < 1e-8) {
        const angle = (i * 7 + j * 13) * 0.91
        const fx = Math.cos(angle) * 0.5 * scale
        const fz = Math.sin(angle) * 0.5 * scale
        pos.x += fx
        pos.z += fz
        b.root.position.x -= fx
        b.root.position.z -= fz
        continue
      }

      const dist = Math.sqrt(distSq)
      const overlap = (minDist - dist) / minDist
      const push = overlap * 0.5 * scale
      const fx = (ox / dist) * push
      const fz = (oz / dist) * push
      pos.x += fx
      pos.z += fz
      b.root.position.x -= fx
      b.root.position.z -= fz
    }
  }
}

export type SpiderNestParams = {
  centerX: number
  centerZ: number
  radius: number
}

export type SpiderNestBeacon = {
  root: THREE.Group
  beam: THREE.Mesh
  core: THREE.Mesh
  ring: THREE.Mesh
}

const nestBeaconBeamMat = new THREE.MeshBasicMaterial({
  color: 0xff3344,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  fog: false,
})
const nestBeaconCoreMat = new THREE.MeshBasicMaterial({
  color: 0xffccaa,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  fog: false,
})
const nestBeaconRingMat = new THREE.MeshBasicMaterial({
  color: 0xff5566,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  fog: false,
})

/** Giant sky beam + ground ring marking the spider nest center / spawn circle. */
export function createSpiderNestBeacon(parent: THREE.Object3D): SpiderNestBeacon {
  const root = new THREE.Group()
  root.name = 'spiderNestBeacon'

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(
      NEST_BEACON_RADIUS,
      NEST_BEACON_RADIUS * 0.35,
      NEST_BEACON_HEIGHT,
      12,
      1,
      true,
    ),
    nestBeaconBeamMat,
  )
  beam.position.y = NEST_BEACON_HEIGHT * 0.5
  beam.frustumCulled = false
  beam.renderOrder = 8
  root.add(beam)

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(
      NEST_BEACON_RADIUS * 0.22,
      NEST_BEACON_RADIUS * 0.12,
      NEST_BEACON_HEIGHT,
      8,
      1,
      true,
    ),
    nestBeaconCoreMat,
  )
  core.position.y = NEST_BEACON_HEIGHT * 0.5
  core.frustumCulled = false
  core.renderOrder = 9
  root.add(core)

  // Unit ring (radius 1) — scaled to nest radius in update.
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, NEST_RING_HEIGHT, 48, 1, true),
    nestBeaconRingMat,
  )
  ring.position.y = NEST_RING_HEIGHT * 0.5 + 0.04
  ring.frustumCulled = false
  ring.renderOrder = 8
  root.add(ring)

  parent.add(root)
  return { root, beam, core, ring }
}

/** Snap the beacon to nest XZ, ground Y, and spawn-circle radius. */
export function updateSpiderNestBeacon(
  beacon: SpiderNestBeacon,
  nest: SpiderNestParams,
  targets: MeshGroundTargets,
  collisionWorld: CollisionWorld | undefined,
  yHint?: number,
) {
  const gy =
    resolveEnemyGroundY(nest.centerX, nest.centerZ, targets, collisionWorld, yHint) ??
    yHint ??
    0
  beacon.root.position.set(nest.centerX, gy, nest.centerZ)
  const r = Math.max(NEST_RING_THICKNESS + 0.5, nest.radius)
  beacon.ring.scale.set(r, 1, r)
  // Soft pulse so the marker reads from a distance.
  const pulse = 0.55 + 0.25 * Math.sin(performance.now() * 0.003)
  nestBeaconBeamMat.opacity = 0.28 + pulse * 0.22
  nestBeaconCoreMat.opacity = 0.65 + pulse * 0.25
  nestBeaconRingMat.opacity = 0.4 + pulse * 0.25
}

/** Slider 0–100 → absolute nest world X/Z (−120 … +120). */
export function spiderNestWorldFromSlider(slider: number): number {
  const t = Math.max(0, Math.min(100, slider)) / 100
  return (t - 0.5) * 240
}

/** Inverse of spiderNestWorldFromSlider (for defaults / labels). */
export function spiderNestSliderFromWorld(world: number): number {
  return Math.round(((world / 240) + 0.5) * 100)
}

/** Slider 0–100 → nest radius meters (3 … 28). */
export function spiderNestRadiusFromSlider(slider: number): number {
  const t = Math.max(0, Math.min(100, slider)) / 100
  return 3 + t * 25
}

/** @deprecated Use spiderNestWorldFromSlider — kept as alias for older call sites. */
export const spiderNestOffsetFromSlider = spiderNestWorldFromSlider

/** Fixed absolute nest params (map world space). */
export function defaultSpiderNestParams(): SpiderNestParams {
  return {
    centerX: SPIDER_NEST_CENTER_X,
    centerZ: SPIDER_NEST_CENTER_Z,
    radius: SPIDER_NEST_RADIUS,
  }
}

/** Random point inside a circle on the XZ plane — biased toward the center. */
export function pickSpiderSpawnInCircle(
  centerX: number,
  centerZ: number,
  radius: number,
): { x: number; z: number } {
  const angle = Math.random() * Math.PI * 2
  // Squared random → most spawns land near the nest center, not the rim.
  const r = Math.random() * Math.random() * Math.max(0.5, radius)
  return {
    x: centerX + Math.cos(angle) * r,
    z: centerZ + Math.sin(angle) * r,
  }
}

/**
 * All-day nest spawner: when the player is within SPIDER_NEST_ACTIVATION_RANGE
 * of the nest center, attempt one spawn every SPIDER_SPAWN_INTERVAL seconds
 * until SPIDER_MAX_ALIVE spiders are out. Each spawn lands at a random point
 * inside the nest radius circle (ground-snapped), spaced from existing spiders.
 */
export function tickSpiderNestSpawns(
  spiders: SpiderInstance[],
  nest: SpiderNestParams,
  playerPos: THREE.Vector3,
  parent: THREE.Object3D,
  barParent: THREE.Object3D,
  targets: MeshGroundTargets,
  collisionWorld: CollisionWorld | undefined,
  spawnTimer: { value: number },
  dt: number,
): void {
  const dx = playerPos.x - nest.centerX
  const dz = playerPos.z - nest.centerZ
  const nearNest =
    dx * dx + dz * dz <= SPIDER_NEST_ACTIVATION_RANGE * SPIDER_NEST_ACTIVATION_RANGE
  if (!nearNest) {
    spawnTimer.value = 0
    return
  }
  if (spiders.length >= SPIDER_MAX_ALIVE) {
    spawnTimer.value = 0
    return
  }

  spawnTimer.value += dt
  if (spawnTimer.value < SPIDER_SPAWN_INTERVAL) return
  spawnTimer.value = 0

  const minSpawnSep = SPIDER_SEPARATION_RADIUS * 2
  const minSpawnSepSq = minSpawnSep * minSpawnSep

  for (let attempt = 0; attempt < 12; attempt++) {
    const spot = pickSpiderSpawnInCircle(nest.centerX, nest.centerZ, nest.radius)
    let tooClose = false
    for (const spider of spiders) {
      const sdx = spider.root.position.x - spot.x
      const sdz = spider.root.position.z - spot.z
      if (sdx * sdx + sdz * sdz < minSpawnSepSq) {
        tooClose = true
        break
      }
    }
    if (tooClose) continue
    const gy = resolveEnemyGroundY(
      spot.x,
      spot.z,
      targets,
      collisionWorld,
      playerPos.y,
    )
    if (gy === null) continue
    spiders.push(createSpider(spot.x, gy, spot.z, parent, barParent))
    return
  }
}
