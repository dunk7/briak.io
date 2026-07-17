import * as THREE from 'three'
import type { Inventory, InventoryItem } from './inventory'
import type { CollisionWorld } from './collisionWorld'
import { createGroundExtrudedItem } from './itemMeshes'

const GRAVITY = 26
const LIFETIME = 60
const FADE_SEC = 1.6
const PICKUP_RADIUS = 1.35
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS
const GROUND_CACHE_CELL = 0.4
const SETTLE_FRICTION = 0.78
const BOUNCE = 0.28
const GROUND_PAD = 0.12
const BOB_AMP = 0.06
const BOB_SPEED = 2.4
const SPIN_SPEED = 1.35
/** Brief delay so you don't instantly re-collect what you just dropped. */
const DEFAULT_PICKUP_DELAY = 0.85

const _playerDelta = new THREE.Vector3()
const _forward = new THREE.Vector3()

type GroundItemEntity = {
  root: THREE.Group
  mesh: THREE.Object3D
  item: InventoryItem
  count: number
  durability?: number
  vel: THREE.Vector3
  life: number
  pickupDelay: number
  settled: boolean
  groundY: number | null
  bobPhase: number
  baseY: number
  active: boolean
}

/**
 * Generic inventory item drops: extruded icon meshes that bounce, float for up
 * to 60s, and get sucked into inventory when the player walks near.
 */
export class GroundItems {
  private readonly parent: THREE.Object3D
  private readonly entities: GroundItemEntity[] = []
  private inventory: Inventory | null = null
  private collisionWorld: CollisionWorld | null = null
  private readonly groundCache = new Map<number, number | null>()

  constructor(parent: THREE.Object3D) {
    this.parent = parent
  }

  setCollisionWorld(world: CollisionWorld | null) {
    this.collisionWorld = world
  }

  setInventory(inv: Inventory) {
    this.inventory = inv
  }

  /**
   * Toss a stack from the player (inventory drag-out / Q-style drop).
   * Items fly forward a bit so they land in front of the camera.
   */
  spawnFromPlayer(
    item: InventoryItem,
    count: number,
    origin: THREE.Vector3,
    forward: THREE.Vector3,
    durability?: number,
  ) {
    if (count <= 0) return
    _forward.copy(forward)
    _forward.y = 0
    if (_forward.lengthSq() < 1e-6) _forward.set(0, 0, -1)
    else _forward.normalize()

    const pos = origin.clone()
    pos.y += 1.15
    pos.addScaledVector(_forward, 0.55)

    const vel = _forward
      .clone()
      .multiplyScalar(2.8 + Math.random() * 1.2)
    vel.y = 2.2 + Math.random() * 1.4
    vel.x += (Math.random() - 0.5) * 0.8
    vel.z += (Math.random() - 0.5) * 0.8

    this.spawnAt(item, count, pos, vel, DEFAULT_PICKUP_DELAY, durability)
  }

  /** Scatter stacks around a death point. */
  spawnDeathScatter(
    stacks: { item: InventoryItem; count: number; durability?: number }[],
    origin: THREE.Vector3,
  ) {
    for (const stack of stacks) {
      if (stack.count <= 0) continue
      const angle = Math.random() * Math.PI * 2
      const dist = 0.35 + Math.random() * 1.1
      const pos = new THREE.Vector3(
        origin.x + Math.cos(angle) * dist,
        origin.y + 0.9 + Math.random() * 0.5,
        origin.z + Math.sin(angle) * dist,
      )
      const vel = new THREE.Vector3(
        Math.cos(angle) * (1.6 + Math.random() * 2.4),
        2.4 + Math.random() * 2.2,
        Math.sin(angle) * (1.6 + Math.random() * 2.4),
      )
      this.spawnAt(stack.item, stack.count, pos, vel, 1.1, stack.durability)
    }
  }

  spawnAt(
    item: InventoryItem,
    count: number,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    pickupDelay = DEFAULT_PICKUP_DELAY,
    durability?: number,
  ) {
    if (count <= 0) return

    const mesh = createGroundExtrudedItem(item)
    const root = new THREE.Group()
    root.position.copy(position)
    root.add(mesh)
    this.parent.add(root)

    this.entities.push({
      root,
      mesh,
      item,
      count,
      durability,
      vel: velocity.clone(),
      life: LIFETIME,
      pickupDelay,
      settled: false,
      groundY: null,
      bobPhase: Math.random() * Math.PI * 2,
      baseY: position.y,
      active: true,
    })
  }

  private sampleGround(x: number, z: number, feetHintY: number): number | null {
    const qx = Math.round(x / GROUND_CACHE_CELL)
    const qz = Math.round(z / GROUND_CACHE_CELL)
    const key = (qx * 73856093) ^ (qz * 19349663)
    if (this.groundCache.has(key)) return this.groundCache.get(key)!

    let y: number | null = null
    const world = this.collisionWorld
    if (world) {
      y = world.findGroundTop(x, feetHintY, z, 0.12, 0.4, false, 3, true)
    }
    this.groundCache.set(key, y)
    return y
  }

  private release(entity: GroundItemEntity) {
    if (!entity.active) return
    entity.active = false
    entity.life = 0
    this.parent.remove(entity.root)
    // Extruded geometries are cached/shared — only dispose cloned materials.
    entity.mesh.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const mats = Array.isArray(child.material) ? child.material : [child.material]
      for (const mat of mats) mat.dispose()
    })
  }

  private tryPickup(entity: GroundItemEntity): boolean {
    if (!this.inventory || entity.pickupDelay > 0) return false
    const added = this.inventory.add(entity.item, entity.count, entity.durability)
    if (added <= 0) return false
    entity.count -= added
    if (entity.count <= 0) {
      this.release(entity)
      return true
    }
    return false
  }

  update(dt: number, playerPos: THREE.Vector3, canPickup = true) {
    this.groundCache.clear()

    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i]!
      if (!entity.active) {
        this.entities.splice(i, 1)
        continue
      }

      entity.life -= dt
      if (entity.pickupDelay > 0) {
        entity.pickupDelay = Math.max(0, entity.pickupDelay - dt)
      }

      if (entity.life <= 0) {
        this.release(entity)
        this.entities.splice(i, 1)
        continue
      }

      if (canPickup && entity.pickupDelay <= 0) {
        _playerDelta.subVectors(playerPos, entity.root.position)
        _playerDelta.y = 0
        if (_playerDelta.lengthSq() <= PICKUP_RADIUS_SQ) {
          if (this.tryPickup(entity)) {
            this.entities.splice(i, 1)
            continue
          }
        }
      }

      if (!entity.settled) {
        entity.vel.y -= GRAVITY * dt
        entity.root.position.addScaledVector(entity.vel, dt)
      }

      let groundY = entity.groundY
      if (groundY === null || !entity.settled) {
        groundY = this.sampleGround(
          entity.root.position.x,
          entity.root.position.z,
          entity.root.position.y + 1.5,
        )
        if (groundY !== null) entity.groundY = groundY
      }

      if (groundY !== null) {
        const floor = groundY + GROUND_PAD
        if (entity.root.position.y < floor) {
          entity.root.position.y = floor
          if (entity.vel.y < 0) entity.vel.y = -entity.vel.y * BOUNCE
          entity.vel.x *= SETTLE_FRICTION
          entity.vel.z *= SETTLE_FRICTION
          if (
            Math.abs(entity.vel.y) < 0.4 &&
            entity.vel.x * entity.vel.x + entity.vel.z * entity.vel.z < 0.1
          ) {
            entity.settled = true
            entity.vel.set(0, 0, 0)
            entity.baseY = floor
          }
        }
      }

      if (entity.settled) {
        entity.bobPhase += dt * BOB_SPEED
        entity.root.position.y = entity.baseY + Math.sin(entity.bobPhase) * BOB_AMP
        entity.mesh.rotation.y += SPIN_SPEED * dt
      } else {
        entity.mesh.rotation.y += SPIN_SPEED * 1.6 * dt
        entity.mesh.rotation.x += entity.vel.length() * 0.15 * dt
      }

      const fadeMul = entity.life < FADE_SEC ? entity.life / FADE_SEC : 1
      entity.root.scale.setScalar(0.55 + 0.45 * fadeMul)
      entity.mesh.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        for (const mat of mats) {
          if ('opacity' in mat) {
            const m = mat as THREE.MeshStandardMaterial
            m.transparent = fadeMul < 0.999
            m.opacity = fadeMul
            m.depthWrite = fadeMul > 0.85
          }
        }
      })
    }
  }

  clear() {
    for (const entity of this.entities) {
      if (entity.active) this.release(entity)
    }
    this.entities.length = 0
  }
}
