import * as THREE from 'three'
import type { Inventory } from './inventory'
import { sampleMeshGroundY, type MeshGroundTargets } from './terrainGroundRay'

const ORB_COLOR = 0xff2200
const ORB_CORE_COLOR = 0xff5533
const GRAVITY = 28
const PIECE_COUNT_MIN = 5
const PIECE_COUNT_MAX = 8
const PIECE_RADIUS = 0.055
const CORE_RADIUS = 0.09
const LIFETIME = 2.4
const FADE_SEC = 0.45
const PICKUP_RADIUS = 1.15
const PICKUP_RADIUS_SQ = PICKUP_RADIUS * PICKUP_RADIUS
const BURST_SPEED = 4.2
const RAY_ORIGIN_Y = 500
const RAYCAST_FAR = 1200

const _rayHits: THREE.Intersection[] = []
const _playerDelta = new THREE.Vector3()

const orbMaterial = new THREE.MeshBasicMaterial({
  color: ORB_COLOR,
  transparent: true,
  opacity: 0.92,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
})

const coreMaterial = new THREE.MeshBasicMaterial({
  color: ORB_CORE_COLOR,
  transparent: true,
  opacity: 0.98,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
})

type OrbPiece = {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  life: number
  isCore: boolean
}

type OrbBatch = {
  pieces: OrbPiece[]
  picked: boolean
  center: THREE.Vector3
}

export class EnemyOrbDrops {
  private readonly parent: THREE.Object3D
  private readonly groundTargets: MeshGroundTargets
  private readonly batches: OrbBatch[] = []
  private inventory: Inventory | null = null

  constructor(parent: THREE.Object3D, groundTargets: MeshGroundTargets) {
    this.parent = parent
    this.groundTargets = groundTargets
  }

  setInventory(inv: Inventory) {
    this.inventory = inv
  }

  spawnBurst(x: number, y: number, z: number) {
    const center = new THREE.Vector3(x, y + 0.12, z)
    const pieces: OrbPiece[] = []
    const count =
      PIECE_COUNT_MIN +
      Math.floor(Math.random() * (PIECE_COUNT_MAX - PIECE_COUNT_MIN + 1))

    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(PIECE_RADIUS, 8, 8),
        orbMaterial,
      )
      mesh.position.copy(center)
      mesh.position.x += (Math.random() - 0.5) * 0.2
      mesh.position.y += (Math.random() - 0.5) * 0.16
      mesh.position.z += (Math.random() - 0.5) * 0.2
      this.parent.add(mesh)

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        1.4 + Math.random() * 1.6,
        (Math.random() - 0.5) * 2,
      ).multiplyScalar(BURST_SPEED * 0.35)

      pieces.push({ mesh, vel, life: LIFETIME, isCore: false })
    }

    const core = new THREE.Mesh(new THREE.SphereGeometry(CORE_RADIUS, 10, 10), coreMaterial)
    core.position.copy(center)
    this.parent.add(core)
    pieces.push({
      mesh: core,
      vel: new THREE.Vector3(0, 2.2, 0),
      life: LIFETIME + 0.4,
      isCore: true,
    })

    this.batches.push({ pieces, picked: false, center })
  }

  update(dt: number, playerPos: THREE.Vector3) {
    for (let b = this.batches.length - 1; b >= 0; b--) {
      const batch = this.batches[b]!

      if (!batch.picked) {
        let near = false
        for (const piece of batch.pieces) {
          _playerDelta.subVectors(playerPos, piece.mesh.position)
          _playerDelta.y = 0
          if (_playerDelta.lengthSq() <= PICKUP_RADIUS_SQ) {
            near = true
            break
          }
        }
        if (near) {
          this.inventory?.add('glowing_orb', 1)
          batch.picked = true
          for (const piece of batch.pieces) piece.life = Math.min(piece.life, 0.35)
        }
      }

      let alive = false
      for (const piece of batch.pieces) {
        piece.life -= dt
        if (piece.life <= 0) continue
        alive = true

        piece.vel.y -= GRAVITY * dt
        piece.mesh.position.addScaledVector(piece.vel, dt)

        const groundY = sampleMeshGroundY(
          piece.mesh.position.x,
          piece.mesh.position.z,
          RAY_ORIGIN_Y,
          this.groundTargets,
          _rayHits,
          RAYCAST_FAR,
          { intersectInvisibleChunks: true },
        )
        if (groundY !== null) {
          const r = piece.isCore ? CORE_RADIUS : PIECE_RADIUS
          const floor = groundY + r
          if (piece.mesh.position.y < floor) {
            piece.mesh.position.y = floor
            if (piece.vel.y < 0) piece.vel.y = -piece.vel.y * 0.28
            piece.vel.x *= 0.72
            piece.vel.z *= 0.72
          }
        }

        if (piece.life < FADE_SEC) {
          const t = piece.life / FADE_SEC
          const mat = piece.mesh.material as THREE.MeshBasicMaterial
          mat.opacity = (piece.isCore ? 0.98 : 0.92) * t
        }
      }

      if (!alive || (batch.picked && batch.pieces.every((p) => p.life <= 0))) {
        for (const piece of batch.pieces) {
          this.parent.remove(piece.mesh)
          piece.mesh.geometry.dispose()
        }
        this.batches.splice(b, 1)
      }
    }
  }

  clear() {
    while (this.batches.length > 0) {
      const batch = this.batches.pop()!
      for (const piece of batch.pieces) {
        this.parent.remove(piece.mesh)
        piece.mesh.geometry.dispose()
      }
    }
  }
}
