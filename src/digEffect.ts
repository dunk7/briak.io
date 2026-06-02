import * as THREE from 'three'
import { separationMtvInto } from './collision'
import type { CollisionWorld } from './collisionWorld'

const _mtv = new THREE.Vector3()

const _box = new THREE.Box3()
const _center = new THREE.Vector3()
const _size = new THREE.Vector3()
const _crumbPos = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _pMin = new THREE.Vector3()
const _pMax = new THREE.Vector3()

const GRAVITY = 32
const RESTITUTION = 0.22
const WALL_FRICTION = 0.55
const GROUND_FRICTION = 0.42
const DEBRIS_LIFETIME_MIN = 1.0
const DEBRIS_LIFETIME_MAX = 1.85
const FADE_OUT_SEC = 0.2
const SETTLE_SPEED = 0.35
/** Dig progress 0–1 at which all grid crumbs have appeared. */
const SPAWN_END = 0.62
const MAX_SPAWN_PER_UPDATE = 4
const POP_IN_SEC = 0.14

type CrumbSlot = {
  base: THREE.Vector3
  half: number
  mesh: THREE.Mesh | null
  spawned: boolean
  released: boolean
  pop: number
}

type DebrisPiece = {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  angVel: THREE.Vector3
  half: number
  life: number
}

export class DigBreakEffect {
  readonly group = new THREE.Group()
  private slots: CrumbSlot[] = []
  private spawnOrder: number[] = []
  private nextSpawn = 0
  private flying: DebrisPiece[] = []
  private hidden: THREE.Object3D[] = []
  private originalsHidden = false
  private collisionWorld: CollisionWorld | null = null
  private sharedGeo: THREE.BufferGeometry | null = null
  private material: THREE.Material | null = null
  private finished = false
  private breakFloorY = 0

  constructor(parent: THREE.Object3D) {
    parent.add(this.group)
  }

  setCollisionWorld(world: CollisionWorld) {
    this.collisionWorld = world
  }

  hasActiveDebris(): boolean {
    return this.flying.length > 0
  }

  startFromObject(
    root: THREE.Object3D,
    material: THREE.Material,
    divisions = 4,
    options?: { excludeBottomFace?: boolean },
  ) {
    this.finished = false
    this.cancelDig()
    _box.setFromObject(root)
    if (_box.isEmpty()) return
    this.startFromBox(_box, material, divisions, [root], options)
  }

  startFromBox(
    box: THREE.Box3,
    material: THREE.Material,
    divisions: number,
    hide: THREE.Object3D[],
    options?: { excludeBottomFace?: boolean },
  ) {
    this.finished = false
    this.cancelDig()
    box.getCenter(_center)
    box.getSize(_size)

    const nx = divisions
    const ny = divisions
    const nz = divisions
    const sx = _size.x / nx
    const sy = _size.y / ny
    const sz = _size.z / nz
    const crumbScale = 0.88
    this.sharedGeo = new THREE.BoxGeometry(
      sx * crumbScale,
      sy * crumbScale,
      sz * crumbScale,
    )
    this.material = material
    this.breakFloorY = box.min.y

    const halfX = (sx * crumbScale) * 0.5
    const distances: { i: number; d: number }[] = []
    const excludeBottomFace = options?.excludeBottomFace ?? false

    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        if (excludeBottomFace && iy === 0) continue
        for (let iz = 0; iz < nz; iz++) {
          _crumbPos.set(
            box.min.x + (ix + 0.5) * sx,
            box.min.y + (iy + 0.5) * sy,
            box.min.z + (iz + 0.5) * sz,
          )
          const idx = this.slots.length
          this.slots.push({
            base: _crumbPos.clone(),
            half: Math.max(halfX, (sy * crumbScale) * 0.5, (sz * crumbScale) * 0.5),
            mesh: null,
            spawned: false,
            released: false,
            pop: 0,
          })
          distances.push({
            i: idx,
            d: _crumbPos.distanceToSquared(_center),
          })
        }
      }
    }

    distances.sort((a, b) => b.d - a.d)
    this.spawnOrder = distances.map((d) => d.i)
    this.nextSpawn = 0

    for (const obj of hide) this.hidden.push(obj)
  }

  update(progress: number) {
    if (this.finished) return

    const spawnT = Math.min(1, progress / SPAWN_END)
    const targetSpawned = Math.floor(spawnT * this.spawnOrder.length)
    let spawnedNow = 0
    while (
      this.nextSpawn < targetSpawned &&
      spawnedNow < MAX_SPAWN_PER_UPDATE
    ) {
      const idx = this.spawnOrder[this.nextSpawn++]
      if (this.spawnSlot(this.slots[idx])) spawnedNow++
    }

    const shake = (1 - progress) * 0.014
    const t = performance.now() * 0.001
    for (const slot of this.slots) {
      if (!slot.spawned || slot.released || !slot.mesh) continue
      const { mesh, base } = slot
      mesh.position.set(
        base.x + Math.sin(t * 38 + base.x * 7) * shake,
        base.y + Math.sin(t * 44 + base.y * 9) * shake * 0.5,
        base.z + Math.sin(t * 31 + base.z * 5) * shake * 0.6,
      )
    }
  }

  tick(dt: number) {
    for (const slot of this.slots) {
      if (!slot.spawned || slot.released || !slot.mesh) continue
      if (slot.pop >= 1) continue
      slot.pop = Math.min(1, slot.pop + dt / POP_IN_SEC)
      const s = slot.pop * slot.pop * (3 - 2 * slot.pop)
      slot.mesh.scale.setScalar(s)
    }

    if (this.flying.length === 0) return

    for (let i = this.flying.length - 1; i >= 0; i--) {
      const piece = this.flying[i]
      this.stepDebris(piece, dt)
      piece.life -= dt
      if (piece.life <= 0) {
        const geo = piece.mesh.geometry
        this.group.remove(piece.mesh)
        this.flying.splice(i, 1)
        this.tryDisposeGeometry(geo)
      } else if (piece.life < FADE_OUT_SEC) {
        piece.mesh.scale.setScalar(piece.life / FADE_OUT_SEC)
      }
    }

    if (this.flying.length === 0 && this.finished) {
      this.finished = false
    }
  }

  finish(_material: THREE.Material, onRemoved?: () => void) {
    if (this.finished) return
    this.finished = true
    this.hideOriginals()

    for (let i = this.nextSpawn; i < this.spawnOrder.length; i++) {
      this.spawnSlot(this.slots[this.spawnOrder[i]])
    }
    this.nextSpawn = this.spawnOrder.length

    for (const slot of this.slots) {
      if (slot.spawned && !slot.released) this.releaseSlot(slot, true)
    }
    this.slots.length = 0

    onRemoved?.()
  }

  releaseHidden() {
    this.hidden.length = 0
  }

  /** Stop the in-progress dig preview; leaves falling debris alone. */
  cancelDig() {
    this.showHidden()
    this.clearDigSlots()
  }

  /** Stop dig and remove all debris. */
  cancel() {
    this.cancelDig()
    for (const { mesh } of this.flying) {
      const geo = mesh.geometry
      this.group.remove(mesh)
      this.tryDisposeGeometry(geo)
    }
    this.flying.length = 0
    this.finished = false
  }

  private spawnSlot(slot: CrumbSlot | undefined): boolean {
    if (!slot || slot.spawned || !this.sharedGeo || !this.material) return false

    slot.spawned = true
    if (!this.originalsHidden) this.hideOriginals()

    const mesh = new THREE.Mesh(this.sharedGeo, this.material)
    mesh.position.copy(slot.base)
    mesh.scale.setScalar(0.001)
    mesh.castShadow = true
    mesh.receiveShadow = true
    slot.pop = 0
    slot.mesh = mesh
    this.group.add(mesh)
    return true
  }

  private releaseSlot(slot: CrumbSlot, burst: boolean) {
    if (slot.released || !slot.mesh) return
    slot.released = true
    const mesh = slot.mesh
    if (!mesh.parent) return

    _dir.subVectors(mesh.position, _center)
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 1, 0)
    else _dir.normalize()

    mesh.scale.setScalar(1)

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * (burst ? 1.4 : 0.9),
      burst ? 0.15 + Math.random() * 0.45 : 0.2 + Math.random() * 0.35,
      (Math.random() - 0.5) * (burst ? 1.4 : 0.9),
    )
    vel.addScaledVector(_dir, burst ? 0.35 + Math.random() * 0.55 : 0.25 + Math.random() * 0.35)

    const life =
      DEBRIS_LIFETIME_MIN +
      Math.random() * (DEBRIS_LIFETIME_MAX - DEBRIS_LIFETIME_MIN)

    this.flying.push({
      mesh,
      vel,
      angVel: new THREE.Vector3(
        (Math.random() - 0.5) * (burst ? 12 : 6),
        (Math.random() - 0.5) * (burst ? 12 : 6),
        (Math.random() - 0.5) * (burst ? 12 : 6),
      ),
      half: slot.half,
      life,
    })
    slot.mesh = null
  }

  private stepDebris(piece: DebrisPiece, dt: number) {
    const { mesh, vel, angVel, half } = piece
    vel.y -= GRAVITY * dt
    mesh.position.addScaledVector(vel, dt)
    mesh.rotation.x += angVel.x * dt
    mesh.rotation.y += angVel.y * dt
    mesh.rotation.z += angVel.z * dt

    _pMin.set(
      mesh.position.x - half,
      mesh.position.y - half,
      mesh.position.z - half,
    )
    _pMax.set(
      mesh.position.x + half,
      mesh.position.y + half,
      mesh.position.z + half,
    )

    const world = this.collisionWorld
    if (!world) return

    for (let iter = 0; iter < 5; iter++) {
      let moved = false
      const indices = world.queryNear(
        mesh.position.x,
        mesh.position.z,
        half + 0.5,
        _pMin.y - 1,
        _pMax.y + 1,
      )
      const boxes = world.boxes
      for (let i = 0; i < indices.length; i++) {
        const box = boxes[indices[i]!]!
        if (!separationMtvInto(_pMin, _pMax, box, _mtv)) continue
        mesh.position.add(_mtv)
        _pMin.add(_mtv)
        _pMax.add(_mtv)
        moved = true

        if (_mtv.y > 0.0005) {
          if (vel.y < 0) {
            vel.y = -vel.y * RESTITUTION
            vel.x *= GROUND_FRICTION
            vel.z *= GROUND_FRICTION
            angVel.multiplyScalar(0.82)
            if (Math.abs(vel.y) < SETTLE_SPEED) vel.y = 0
          }
        } else if (_mtv.y < -0.0005) {
          vel.y = Math.min(0, vel.y * 0.35)
        }
        if (Math.abs(_mtv.x) > 0.0005) vel.x *= WALL_FRICTION
        if (Math.abs(_mtv.z) > 0.0005) vel.z *= WALL_FRICTION
      }
      if (!moved) break
    }

    const speed = vel.length()
    if (speed < SETTLE_SPEED) {
      vel.multiplyScalar(0.88)
      angVel.multiplyScalar(0.85)
    }

    this.snapDebrisToGround(piece)
  }

  private snapDebrisToGround(piece: DebrisPiece) {
    const { mesh, vel, angVel, half } = piece
    const bottom = mesh.position.y - half

    let groundY = this.collisionWorld?.findGroundTop(
      mesh.position.x,
      mesh.position.y,
      mesh.position.z,
      half,
      64,
    ) ?? null
    if (groundY === null) groundY = this.breakFloorY

    if (bottom < groundY - 0.01) {
      mesh.position.y = groundY + half + 0.002
      if (vel.y < 0) vel.y = 0
      return
    }

    if (vel.length() < SETTLE_SPEED && bottom <= groundY + 0.05) {
      mesh.position.y = groundY + half + 0.002
      vel.set(0, 0, 0)
      angVel.multiplyScalar(0.7)
    }
  }

  private hideOriginals() {
    if (this.originalsHidden) return
    for (const obj of this.hidden) obj.visible = false
    this.originalsHidden = true
  }

  private showHidden() {
    for (const obj of this.hidden) obj.visible = true
    this.hidden.length = 0
    this.originalsHidden = false
  }

  private clearDigSlots() {
    for (const slot of this.slots) {
      if (slot.mesh?.parent) this.group.remove(slot.mesh)
    }
    this.slots.length = 0
    this.spawnOrder.length = 0
    this.nextSpawn = 0
    if (this.sharedGeo) {
      this.tryDisposeGeometry(this.sharedGeo)
      this.sharedGeo = null
    }
    this.material = null
    this.finished = false
  }

  private tryDisposeGeometry(geo: THREE.BufferGeometry) {
    if (this.sharedGeo === geo) return
    for (const piece of this.flying) {
      if (piece.mesh.geometry === geo) return
    }
    geo.dispose()
  }
}
