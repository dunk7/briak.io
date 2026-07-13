import * as THREE from 'three'
import type { Inventory } from './inventory'
import type { CollisionWorld } from './collisionWorld'

const ORB_COLOR = 0xff2200
const ORB_CORE_COLOR = 0xff5533
const GLOW_COLOR = 0xff3300
const GRAVITY = 28
const PIECE_COUNT = 4
const PIECE_RADIUS = 0.055
const CORE_RADIUS = 0.09
const LIFETIME = 2.0
const FADE_SEC = 0.4
const PICKUP_RADIUS = 1.15
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS
const BURST_SPEED = 4.2
/** Reuse ground samples within this XZ distance (orb pieces land near each other). */
const GROUND_CACHE_CELL = 0.35

const _playerDelta = new THREE.Vector3()

/** Shared geometries — allocating SphereGeometry per piece caused hit-frame freezes. */
const pieceGeo = new THREE.SphereGeometry(PIECE_RADIUS, 6, 6)
const pieceGlowGeo = new THREE.SphereGeometry(PIECE_RADIUS * 1.12, 6, 6)
const coreGeo = new THREE.SphereGeometry(CORE_RADIUS, 8, 8)
const coreGlowGeo = new THREE.SphereGeometry(CORE_RADIUS * 1.12, 8, 8)

function makeGlowMat(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
}

type OrbPiece = {
  root: THREE.Group
  mesh: THREE.Mesh
  glow: THREE.Mesh
  vel: THREE.Vector3
  life: number
  isCore: boolean
  baseMeshOpacity: number
  baseGlowOpacity: number
  active: boolean
}

type OrbBatch = {
  pieces: OrbPiece[]
  picked: boolean
  /** Approximate landing Y from first ground sample in the batch. */
  groundY: number | null
}

export class EnemyOrbDrops {
  private readonly parent: THREE.Object3D
  private readonly batches: OrbBatch[] = []
  private readonly pool: OrbPiece[] = []
  private inventory: Inventory | null = null
  private nightStrength = 1
  private collisionWorld: CollisionWorld | null = null
  /** Per-update ground cache keyed by quantized XZ. */
  private readonly groundCache = new Map<number, number | null>()

  constructor(parent: THREE.Object3D) {
    this.parent = parent
  }

  /** Pre-allocate orb pieces so the first kills never allocate materials. */
  prewarm(bursts = 3) {
    const needPieces = bursts * PIECE_COUNT
    const needCores = bursts
    let pieces = 0
    let cores = 0
    for (const p of this.pool) {
      if (p.isCore) cores++
      else pieces++
    }
    while (pieces < needPieces) {
      const p = this.acquirePiece(false)
      p.active = false
      pieces++
    }
    while (cores < needCores) {
      const p = this.acquirePiece(true)
      p.active = false
      cores++
    }
  }

  setCollisionWorld(world: CollisionWorld | null) {
    this.collisionWorld = world
  }

  setInventory(inv: Inventory) {
    this.inventory = inv
  }

  /** Match enemy inner-light day/night fade (0 = day, 1 = night). */
  setNightStrength(night: number) {
    this.nightStrength = THREE.MathUtils.clamp(night, 0, 1)
    for (const batch of this.batches) {
      for (const piece of batch.pieces) {
        if (piece.active) this.applyNightToPiece(piece)
      }
    }
  }

  private applyNightToPiece(piece: OrbPiece, fadeMul = 1) {
    const t = this.nightStrength * fadeMul
    const meshMat = piece.mesh.material as THREE.MeshBasicMaterial
    const glowMat = piece.glow.material as THREE.MeshBasicMaterial
    meshMat.opacity = piece.baseMeshOpacity * fadeMul
    if (t <= 0.001) {
      piece.glow.visible = false
      return
    }
    piece.glow.visible = true
    glowMat.opacity = piece.baseGlowOpacity * t * fadeMul
  }

  private acquirePiece(isCore: boolean): OrbPiece {
    for (let i = 0; i < this.pool.length; i++) {
      const p = this.pool[i]!
      if (!p.active && p.isCore === isCore) {
        p.active = true
        return p
      }
    }
    const meshColor = isCore ? ORB_CORE_COLOR : ORB_COLOR
    const meshOpacity = isCore ? 0.98 : 0.92
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(
      isCore ? coreGeo : pieceGeo,
      makeGlowMat(meshColor, meshOpacity),
    )
    const glow = new THREE.Mesh(
      isCore ? coreGlowGeo : pieceGlowGeo,
      makeGlowMat(GLOW_COLOR, meshOpacity),
    )
    root.add(mesh)
    root.add(glow)
    const piece: OrbPiece = {
      root,
      mesh,
      glow,
      vel: new THREE.Vector3(),
      life: 0,
      isCore,
      baseMeshOpacity: meshOpacity,
      baseGlowOpacity: meshOpacity,
      active: true,
    }
    this.pool.push(piece)
    return piece
  }

  private releasePiece(piece: OrbPiece) {
    piece.active = false
    piece.life = 0
    this.parent.remove(piece.root)
  }

  spawnBurst(x: number, y: number, z: number) {
    const pieces: OrbPiece[] = []
    const cx = x
    const cy = y + 0.12
    const cz = z

    for (let i = 0; i < PIECE_COUNT; i++) {
      const piece = this.acquirePiece(false)
      piece.root.position.set(
        cx + (Math.random() - 0.5) * 0.2,
        cy + (Math.random() - 0.5) * 0.16,
        cz + (Math.random() - 0.5) * 0.2,
      )
      piece.vel
        .set(
          (Math.random() - 0.5) * 2,
          1.4 + Math.random() * 1.6,
          (Math.random() - 0.5) * 2,
        )
        .multiplyScalar(BURST_SPEED * 0.35)
      piece.life = LIFETIME
      this.applyNightToPiece(piece)
      this.parent.add(piece.root)
      pieces.push(piece)
    }

    const core = this.acquirePiece(true)
    core.root.position.set(cx, cy, cz)
    core.vel.set(0, 2.2, 0)
    core.life = LIFETIME + 0.35
    this.applyNightToPiece(core)
    this.parent.add(core.root)
    pieces.push(core)

    this.batches.push({ pieces, picked: false, groundY: null })
  }

  private sampleGround(x: number, z: number, feetHintY: number): number | null {
    const qx = Math.round(x / GROUND_CACHE_CELL)
    const qz = Math.round(z / GROUND_CACHE_CELL)
    const key = qx * 73856093 ^ qz * 19349663
    if (this.groundCache.has(key)) return this.groundCache.get(key)!

    let y: number | null = null
    const world = this.collisionWorld
    if (world) {
      y = world.findGroundTop(
        x,
        feetHintY,
        z,
        0.12,
        0.4,
        false,
        3,
        true,
      )
    }
    this.groundCache.set(key, y)
    return y
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.groundCache.clear()

    for (let b = this.batches.length - 1; b >= 0; b--) {
      const batch = this.batches[b]!

      if (!batch.picked) {
        let near = false
        for (const piece of batch.pieces) {
          if (!piece.active) continue
          _playerDelta.subVectors(playerPos, piece.root.position)
          _playerDelta.y = 0
          if (_playerDelta.lengthSq() <= PICKUP_RADIUS_SQ) {
            near = true
            break
          }
        }
        if (near) {
          this.inventory?.add('glowing_orb', 1)
          batch.picked = true
          for (const piece of batch.pieces) {
            if (piece.active) piece.life = Math.min(piece.life, 0.3)
          }
        }
      }

      let alive = false
      for (const piece of batch.pieces) {
        if (!piece.active) continue
        piece.life -= dt
        if (piece.life <= 0) {
          this.releasePiece(piece)
          continue
        }
        alive = true

        piece.vel.y -= GRAVITY * dt
        piece.root.position.addScaledVector(piece.vel, dt)

        // One ground sample per batch when possible; pieces share nearby landing height.
        let groundY = batch.groundY
        if (groundY === null) {
          groundY = this.sampleGround(
            piece.root.position.x,
            piece.root.position.z,
            piece.root.position.y + 1.5,
          )
          if (groundY !== null) batch.groundY = groundY
        }
        if (groundY !== null) {
          const r = piece.isCore ? CORE_RADIUS : PIECE_RADIUS
          const floor = groundY + r
          if (piece.root.position.y < floor) {
            piece.root.position.y = floor
            if (piece.vel.y < 0) piece.vel.y = -piece.vel.y * 0.28
            piece.vel.x *= 0.72
            piece.vel.z *= 0.72
          }
        }

        const fadeMul = piece.life < FADE_SEC ? piece.life / FADE_SEC : 1
        this.applyNightToPiece(piece, fadeMul)
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
