import * as THREE from 'three'
import type { Inventory } from './inventory'
import type { CollisionWorld } from './collisionWorld'

const GRAVITY = 26
const PICKUP_RADIUS = 1.45
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS
const BURST_SPEED = 3.6
const GROUND_CACHE_CELL = 0.4
const SETTLE_FRICTION = 0.78
const BOUNCE = 0.32
/** Approx half-height of a scaled berry diamond for ground contact. */
const GROUND_PAD = 0.07
/** After pickup, crystals shrink away over this many seconds. */
const COLLECT_FADE_SEC = 0.45

const _worldPos = new THREE.Vector3()
const _worldQuat = new THREE.Quaternion()
const _worldScale = new THREE.Vector3()
const _playerDelta = new THREE.Vector3()
const _spinAxis = new THREE.Vector3()

export type CrystalBerryDropPiece = {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  angVel: THREE.Vector3
  /** Countdown only while fading out after pickup; Infinity until then. */
  life: number
  settled: boolean
  active: boolean
}

type CrystalBerryBatch = {
  pieces: CrystalBerryDropPiece[]
  picked: boolean
  groundY: number | null
}

/**
 * Detach crystal-berry diamond meshes from a chopped tree and drop them with
 * gravity. Walking near the pile collects them into inventory.
 */
export class CrystalBerryDrops {
  private readonly parent: THREE.Object3D
  private readonly batches: CrystalBerryBatch[] = []
  private inventory: Inventory | null = null
  private collisionWorld: CollisionWorld | null = null
  private readonly groundCache = new Map<number, number | null>()
  private onCollected: ((count: number) => void) | null = null

  constructor(parent: THREE.Object3D) {
    this.parent = parent
  }

  setCollisionWorld(world: CollisionWorld | null) {
    this.collisionWorld = world
  }

  setInventory(inv: Inventory) {
    this.inventory = inv
  }

  setOnCollected(cb: ((count: number) => void) | null) {
    this.onCollected = cb
  }

  /**
   * Pull every crystal-berry mesh off `treeRoot`, reparent into the scene, and
   * give each a scatter burst. Returns how many diamonds were spawned.
   */
  spawnFromTree(treeRoot: THREE.Object3D): number {
    treeRoot.updateMatrixWorld(true)
    const meshes: THREE.Mesh[] = []
    treeRoot.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.crystalBerry) {
        meshes.push(child)
      }
    })
    if (meshes.length === 0) return 0

    const pieces: CrystalBerryDropPiece[] = []
    for (const mesh of meshes) {
      mesh.getWorldPosition(_worldPos)
      mesh.getWorldQuaternion(_worldQuat)
      mesh.getWorldScale(_worldScale)

      mesh.removeFromParent()
      mesh.position.copy(_worldPos)
      mesh.quaternion.copy(_worldQuat)
      mesh.scale.copy(_worldScale)
      mesh.userData.dropBaseScale = _worldScale.clone()
      mesh.matrixAutoUpdate = true
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Dropped berries are pickups, not dig targets.
      mesh.raycast = () => {}
      this.parent.add(mesh)

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        1.1 + Math.random() * 2.4,
        (Math.random() - 0.5) * 2.2,
      ).multiplyScalar(BURST_SPEED * 0.45)

      _spinAxis
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
      const angVel = _spinAxis.multiplyScalar(4 + Math.random() * 8).clone()

      pieces.push({
        mesh,
        vel,
        angVel,
        life: Infinity,
        settled: false,
        active: true,
      })
    }

    this.batches.push({ pieces, picked: false, groundY: null })
    return pieces.length
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

  private releasePiece(piece: CrystalBerryDropPiece) {
    if (!piece.active) return
    piece.active = false
    piece.life = 0
    this.parent.remove(piece.mesh)
    // Geometry is shared with the berry template — do not dispose.
  }

  private collectBatch(batch: CrystalBerryBatch) {
    if (batch.picked) return
    batch.picked = true
    let count = 0
    for (const piece of batch.pieces) {
      if (!piece.active) continue
      count++
      piece.life = COLLECT_FADE_SEC
      piece.vel.set(0, 0.55 + Math.random() * 0.55, 0)
      piece.settled = false
    }
    if (count > 0) {
      this.inventory?.add('crystal_berries', count)
      this.onCollected?.(count)
    }
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.groundCache.clear()

    for (let b = this.batches.length - 1; b >= 0; b--) {
      const batch = this.batches[b]!

      if (!batch.picked) {
        for (const piece of batch.pieces) {
          if (!piece.active) continue
          _playerDelta.subVectors(playerPos, piece.mesh.position)
          _playerDelta.y = 0
          if (_playerDelta.lengthSq() <= PICKUP_RADIUS_SQ) {
            this.collectBatch(batch)
            break
          }
        }
      }

      let alive = false
      for (const piece of batch.pieces) {
        if (!piece.active) continue
        if (Number.isFinite(piece.life)) {
          piece.life -= dt
          if (piece.life <= 0) {
            this.releasePiece(piece)
            continue
          }
        }
        alive = true

        if (!piece.settled) {
          piece.vel.y -= GRAVITY * dt
          piece.mesh.position.addScaledVector(piece.vel, dt)
          piece.mesh.rotation.x += piece.angVel.x * dt
          piece.mesh.rotation.y += piece.angVel.y * dt
          piece.mesh.rotation.z += piece.angVel.z * dt
        }

        let groundY = batch.groundY
        if (groundY === null) {
          groundY = this.sampleGround(
            piece.mesh.position.x,
            piece.mesh.position.z,
            piece.mesh.position.y + 1.5,
          )
          if (groundY !== null) batch.groundY = groundY
        }
        if (groundY !== null) {
          const floor = groundY + GROUND_PAD
          if (piece.mesh.position.y < floor) {
            piece.mesh.position.y = floor
            if (piece.vel.y < 0) piece.vel.y = -piece.vel.y * BOUNCE
            piece.vel.x *= SETTLE_FRICTION
            piece.vel.z *= SETTLE_FRICTION
            piece.angVel.multiplyScalar(0.82)
            if (
              !batch.picked &&
              Math.abs(piece.vel.y) < 0.35 &&
              piece.vel.x * piece.vel.x + piece.vel.z * piece.vel.z < 0.08
            ) {
              piece.settled = true
              piece.vel.set(0, 0, 0)
              piece.angVel.set(0, 0.35 + Math.random() * 0.45, 0)
            }
          }
        }

        if (piece.settled) {
          // Idle tumble so settled crystals keep a little life.
          piece.mesh.rotation.y += piece.angVel.y * dt
        }

        if (Number.isFinite(piece.life) && piece.life < COLLECT_FADE_SEC) {
          const t = piece.life / COLLECT_FADE_SEC
          const base =
            (piece.mesh.userData.dropBaseScale as THREE.Vector3 | undefined) ??
            piece.mesh.scale.clone()
          piece.mesh.userData.dropBaseScale = base
          piece.mesh.scale.copy(base).multiplyScalar(0.35 + 0.65 * t)
        }
      }

      if (!alive) this.batches.splice(b, 1)
    }
  }

  clear() {
    while (this.batches.length > 0) {
      const batch = this.batches.pop()!
      for (const piece of batch.pieces) {
        if (piece.active) this.releasePiece(piece)
      }
    }
  }
}
