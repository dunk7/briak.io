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
const _wobbleEuler = new THREE.Euler()
const _wobbleQuat = new THREE.Quaternion()

const GRAVITY = 32
const RESTITUTION = 0.22
const WALL_FRICTION = 0.55
const GROUND_FRICTION = 0.42
const DEBRIS_LIFETIME_MIN = 1.0
const DEBRIS_LIFETIME_MAX = 1.85
const FADE_OUT_SEC = 0.28
const SETTLE_SPEED = 0.35
/** Delay between piece releases on break (seconds). */
const SPLIT_STAGGER = 0.012

export type DigBreakStyle = 'dirt' | 'stone' | 'wood'

export type DigBreakOptions = {
  excludeBottomFace?: boolean
  style?: DigBreakStyle
}

type StyleTuning = {
  targetShake: number
  hitSquash: number
  burstMul: number
  spinMul: number
}

const STYLE_TUNING: Record<DigBreakStyle, StyleTuning> = {
  dirt: { targetShake: 0.038, hitSquash: 0.13, burstMul: 1, spinMul: 1 },
  stone: { targetShake: 0.028, hitSquash: 0.09, burstMul: 0.92, spinMul: 0.75 },
  wood: { targetShake: 0.048, hitSquash: 0.15, burstMul: 1.12, spinMul: 1.4 },
}

type CrumbSlot = {
  base: THREE.Vector3
  half: number
  mesh: THREE.Mesh | null
  released: boolean
}

type DebrisPiece = {
  mesh: THREE.Mesh
  vel: THREE.Vector3
  angVel: THREE.Vector3
  half: number
  life: number
  settle: number
}

type HiddenOriginal = {
  obj: THREE.Object3D
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
  /** Restored when dig preview ends (surface caps use manual matrices). */
  matrixAutoUpdate: boolean
  /** Scale about mesh center — needed when matrixAutoUpdate is off. */
  worldPivot: THREE.Vector3 | null
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

export class DigBreakEffect {
  readonly group = new THREE.Group()
  private slots: CrumbSlot[] = []
  private spawnOrder: number[] = []
  private flying: DebrisPiece[] = []
  private hidden: THREE.Object3D[] = []
  private hiddenState: HiddenOriginal[] = []
  private originalsHidden = false
  private collisionWorld: CollisionWorld | null = null
  private sharedGeo: THREE.BufferGeometry | null = null
  private material: THREE.Material | null = null
  private finished = false
  private breakFloorY = 0
  private style: DigBreakStyle = 'dirt'
  private tuning = STYLE_TUNING.dirt
  private splitQueue: number[] = []
  private splitTimer = 0

  constructor(parent: THREE.Object3D) {
    parent.add(this.group)
  }

  setCollisionWorld(world: CollisionWorld) {
    this.collisionWorld = world
  }

  hasActiveDebris(): boolean {
    return this.flying.length > 0 || this.splitQueue.length > 0
  }

  startFromObject(
    root: THREE.Object3D,
    material: THREE.Material,
    divisions = 4,
    options?: DigBreakOptions,
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
    options?: DigBreakOptions,
  ) {
    this.finished = false
    this.cancelDig()
    this.style = options?.style ?? 'dirt'
    this.tuning = STYLE_TUNING[this.style]

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
            released: false,
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

    for (const obj of hide) {
      this.hidden.push(obj)
      const matrixAutoUpdate = obj.matrixAutoUpdate
      let worldPivot: THREE.Vector3 | null = null
      if (!matrixAutoUpdate) {
        obj.updateMatrixWorld(true)
        _box.setFromObject(obj)
        if (!_box.isEmpty()) worldPivot = _box.getCenter(new THREE.Vector3())
        obj.matrixAutoUpdate = true
      }
      this.hiddenState.push({
        obj,
        position: obj.position.clone(),
        quaternion: obj.quaternion.clone(),
        scale: obj.scale.clone(),
        matrixAutoUpdate,
        worldPivot,
      })
    }
  }

  /** Wobble the intact model while digging; no debris until finish(). */
  update(progress: number, swingImpact = 0) {
    if (this.finished) return
    this.animateHiddenTargets(progress, swingImpact)
  }

  tick(dt: number) {
    this.tickSplit(dt)

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

    if (
      this.flying.length === 0 &&
      this.splitQueue.length === 0 &&
      this.finished
    ) {
      this.cleanupBreakSlots()
      this.finished = false
    }
  }

  finish(_material: THREE.Material, onRemoved?: () => void) {
    if (this.finished) return
    this.finished = true
    this.hideOriginals()
    this.beginSplit()
    onRemoved?.()
  }

  releaseHidden() {
    this.hidden.length = 0
    this.hiddenState.length = 0
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

  private beginSplit() {
    this.splitQueue = [...this.spawnOrder]
    this.splitTimer = 0
    if (this.splitQueue.length > 0) this.flushSplitPiece()
  }

  private tickSplit(dt: number) {
    if (this.splitQueue.length === 0) return
    this.splitTimer -= dt
    while (this.splitTimer <= 0 && this.splitQueue.length > 0) {
      this.flushSplitPiece()
      this.splitTimer += SPLIT_STAGGER
    }
  }

  private flushSplitPiece() {
    const idx = this.splitQueue.shift()
    if (idx === undefined) return
    const slot = this.slots[idx]
    if (!slot || slot.released) return
    if (!slot.mesh) this.spawnSlot(slot)
    this.releaseSlot(slot, true)
  }

  private animateHiddenTargets(progress: number, swingImpact: number) {
    if (this.originalsHidden || this.hiddenState.length === 0) return

    const stress = smoothstep(progress)
    const intensity = stress * stress * this.tuning.targetShake
    const progressSquash = 1 - stress * 0.08
    const hitSquash =
      1 - Math.min(1, swingImpact) * this.tuning.hitSquash * (0.65 + stress * 0.35)
    const scaleMul = progressSquash * hitSquash
    const t = performance.now() * 0.001

    for (const state of this.hiddenState) {
      const { obj, position, quaternion, scale, worldPivot } = state
      const hitKick = swingImpact * this.tuning.hitSquash * 0.04
      const wobbleX = Math.sin(t * 54 + position.x * 11) * intensity
      const wobbleY =
        Math.sin(t * 63 + position.y * 8) * intensity * 0.45 - hitKick
      const wobbleZ = Math.sin(t * 49 + position.z * 12) * intensity * 0.9

      obj.scale.set(
        scale.x * scaleMul,
        scale.y * scaleMul,
        scale.z * scaleMul,
      )

      if (worldPivot) {
        obj.position.set(
          worldPivot.x + (position.x - worldPivot.x) * scaleMul + wobbleX,
          worldPivot.y + (position.y - worldPivot.y) * scaleMul + wobbleY,
          worldPivot.z + (position.z - worldPivot.z) * scaleMul + wobbleZ,
        )
      } else {
        obj.position.set(
          position.x + wobbleX,
          position.y + wobbleY,
          position.z + wobbleZ,
        )
      }

      const twist = intensity * 0.14
      _wobbleEuler.set(
        Math.sin(t * 42 + position.x) * twist,
        Math.sin(t * 37 + position.y) * twist * 1.15,
        Math.sin(t * 45 + position.z) * twist * 0.8,
      )
      _wobbleQuat.setFromEuler(_wobbleEuler).premultiply(quaternion)
      obj.quaternion.copy(_wobbleQuat)

      if (!obj.matrixAutoUpdate) {
        obj.updateMatrix()
        obj.updateMatrixWorld(true)
      }
    }
  }

  private spawnSlot(slot: CrumbSlot) {
    if (!this.sharedGeo || !this.material) return

    const mesh = new THREE.Mesh(this.sharedGeo, this.material)
    mesh.position.copy(slot.base)
    mesh.scale.setScalar(1)
    mesh.castShadow = true
    mesh.receiveShadow = true
    slot.mesh = mesh
    this.group.add(mesh)
  }

  private releaseSlot(slot: CrumbSlot, burst: boolean) {
    if (slot.released || !slot.mesh) return
    slot.released = true
    const mesh = slot.mesh
    if (!mesh.parent) return

    _dir.subVectors(mesh.position, _center)
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 1, 0)
    else _dir.normalize()

    mesh.scale.setScalar(1.06)
    mesh.rotation.set(
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35,
    )

    const burstScale = this.tuning.burstMul * (burst ? 1.4 : 1)
    const lateral = burst ? 1.75 : 1.05
    const lift = burst ? 0.6 : 0.38

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * lateral,
      lift * (0.4 + Math.random() * 0.6),
      (Math.random() - 0.5) * lateral,
    )
    vel.addScaledVector(
      _dir,
      (burst ? 0.6 : 0.32) + Math.random() * (burst ? 0.7 : 0.4),
    )
    vel.multiplyScalar(burstScale)

    if (this.style === 'wood') {
      vel.y += 0.14
      vel.x += (Math.random() - 0.5) * 0.3
      vel.z += (Math.random() - 0.5) * 0.3
    } else if (this.style === 'stone') {
      vel.y *= 0.8
      vel.multiplyScalar(1.06)
    }

    const spin = (burst ? 15 : 8) * this.tuning.spinMul
    const life =
      DEBRIS_LIFETIME_MIN +
      Math.random() * (DEBRIS_LIFETIME_MAX - DEBRIS_LIFETIME_MIN)

    this.flying.push({
      mesh,
      vel,
      angVel: new THREE.Vector3(
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin,
      ),
      half: slot.half,
      life,
      settle: 0,
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

    if (piece.settle < 0.12) {
      piece.settle += dt
      const settleT = piece.settle / 0.12
      const scale = THREE.MathUtils.lerp(1.06, 1, smoothstep(settleT))
      mesh.scale.setScalar(scale)
    }

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

  private restoreHiddenTransform(state: HiddenOriginal) {
    state.obj.position.copy(state.position)
    state.obj.quaternion.copy(state.quaternion)
    state.obj.scale.copy(state.scale)
    state.obj.matrixAutoUpdate = state.matrixAutoUpdate
    state.obj.updateMatrix()
    state.obj.updateMatrixWorld(true)
  }

  private hideOriginals() {
    if (this.originalsHidden) return
    for (const state of this.hiddenState) {
      this.restoreHiddenTransform(state)
      state.obj.visible = false
    }
    this.originalsHidden = true
  }

  private showHidden() {
    for (const state of this.hiddenState) {
      this.restoreHiddenTransform(state)
      state.obj.visible = true
    }
    this.hidden.length = 0
    this.hiddenState.length = 0
    this.originalsHidden = false
  }

  private cleanupBreakSlots() {
    this.splitQueue.length = 0
    this.splitTimer = 0
    for (const slot of this.slots) {
      if (slot.mesh?.parent) this.group.remove(slot.mesh)
    }
    this.slots.length = 0
    this.spawnOrder.length = 0
    if (this.sharedGeo) {
      this.tryDisposeGeometry(this.sharedGeo)
      this.sharedGeo = null
    }
    this.material = null
  }

  private clearDigSlots() {
    this.cleanupBreakSlots()
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
