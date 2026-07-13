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
// Reusable scratch for composing instance matrices.
const _instMatrix = new THREE.Matrix4()
const _instPos = new THREE.Vector3()
const _instQuat = new THREE.Quaternion()
const _instScale = new THREE.Vector3()
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0)
const _instColor = new THREE.Color()

/** Bark / canopy tones (match tree.ts palettes). */
const TREE_DEBRIS_TRUNK = [0x4a2f1c, 0x66421f]
const TREE_DEBRIS_FOLIAGE = [0x4d9234, 0x5da642, 0x6cb84e]
/** Grid slots with norm.y above this tint as foliage. */
const TREE_FOLIAGE_NORM_Y = 0.02

const GRAVITY = 32
const RESTITUTION = 0.22
const WALL_FRICTION = 0.55
const GROUND_FRICTION = 0.42
const DEBRIS_LIFETIME_MIN = 1.0
const DEBRIS_LIFETIME_MAX = 1.85
const FADE_OUT_SEC = 0.32
const SETTLE_SPEED = 0.35
/** Below this speed a grounded piece goes to sleep and skips physics. */
const SLEEP_SPEED = 0.12
/** Delay between piece releases on break (seconds). */
const SPLIT_STAGGER = 0.01
/** Crumb geometry vs grid cell size (shared InstancedMesh box). */
const DEBRIS_CRUMB_SCALE = 0.7
/** Spawn volume as a fraction of the broken bounds, centered on the break. */
const DEBRIS_CENTER_SPREAD = 0.52
const DEBRIS_SIZE_SCALE_MIN = 0.4
const DEBRIS_SIZE_SCALE_RANGE = 0.6

export type DigBreakStyle = 'dirt' | 'stone' | 'wood' | 'tree'

export type DigBreakOptions = {
  excludeBottomFace?: boolean
  style?: DigBreakStyle
}

type StyleTuning = {
  burstMul: number
  spinMul: number
  /** Multiplier on crumb box size (default 1). */
  crumbScaleMul: number
  /** Multiplier on per-piece size variation (default 1). */
  pieceSizeMul: number
  /** World-space spawn shift along box height (negative = lower). */
  spawnYOffsetFrac: number
  /** How far below terrain the piece bottom rests, as a fraction of half-extent. */
  groundEmbed: number
}

const STYLE_TUNING: Record<DigBreakStyle, StyleTuning> = {
  dirt: {
    burstMul: 1,
    spinMul: 1,
    crumbScaleMul: 1,
    pieceSizeMul: 1,
    spawnYOffsetFrac: 0,
    groundEmbed: 0,
  },
  stone: {
    burstMul: 0.92,
    spinMul: 0.75,
    crumbScaleMul: 0.48,
    pieceSizeMul: 0.72,
    spawnYOffsetFrac: -0.22,
    groundEmbed: 0.38,
  },
  wood: {
    burstMul: 1.12,
    spinMul: 1.4,
    crumbScaleMul: 1,
    pieceSizeMul: 1,
    spawnYOffsetFrac: 0,
    groundEmbed: 0,
  },
  tree: {
    burstMul: 1.12,
    spinMul: 1.4,
    crumbScaleMul: 0.52,
    pieceSizeMul: 0.62,
    spawnYOffsetFrac: 0,
    groundEmbed: 0,
  },
}

type CrumbSlot = {
  base: THREE.Vector3
  half: number
  /** Per-piece size variation so debris does not look uniform. */
  sizeScale: number
  /** Grid offset from break center in [-0.5, 0.5] per axis (pre-spread). */
  norm: THREE.Vector3
}

type DebrisPiece = {
  /** Index into the batch's InstancedMesh. */
  index: number
  pos: THREE.Vector3
  rot: THREE.Euler
  vel: THREE.Vector3
  angVel: THREE.Vector3
  /** Collision half-extent (already includes per-piece size variation). */
  half: number
  /** Visual size multiplier applied to the shared crumb geometry. */
  sizeScale: number
  /** Animated scale multiplier (fade-out). */
  anim: number
  life: number
  settle: number
  asleep: boolean
}

/**
 * A self-contained burst of debris from one broken block. Each batch owns a
 * single InstancedMesh (one draw call) plus its own geometry, so several
 * breaks can fly at once without interfering.
 */
type DebrisBatch = {
  mesh: THREE.InstancedMesh
  geo: THREE.BufferGeometry
  slots: CrumbSlot[]
  pieces: DebrisPiece[]
  splitQueue: number[]
  splitTimer: number
  center: THREE.Vector3
  floorY: number
  style: DigBreakStyle
  tuning: StyleTuning
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

export class DigBreakEffect {
  readonly group = new THREE.Group()
  private collisionWorld: CollisionWorld | null = null

  // --- In-progress dig preview state ---
  private slots: CrumbSlot[] = []
  private spawnOrder: number[] = []
  private sharedGeo: THREE.BufferGeometry | null = null
  private material: THREE.Material | null = null
  private digCenter = new THREE.Vector3()
  private breakFloorY = 0
  private style: DigBreakStyle = 'dirt'
  private tuning = STYLE_TUNING.dirt
  private hidden: THREE.Object3D[] = []
  private hiddenState: HiddenOriginal[] = []
  private originalsHidden = false
  private finished = false

  // --- Active debris bursts (post-break) ---
  private batches: DebrisBatch[] = []

  constructor(parent: THREE.Object3D) {
    parent.add(this.group)
  }

  setCollisionWorld(world: CollisionWorld) {
    this.collisionWorld = world
  }

  hasActiveDebris(): boolean {
    for (const b of this.batches) {
      if (b.pieces.length > 0 || b.splitQueue.length > 0) return true
    }
    return false
  }

  startFromObject(
    root: THREE.Object3D,
    material: THREE.Material,
    divisions = 4,
    options?: DigBreakOptions,
  ) {
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
    this.cancelDig()
    this.style = options?.style ?? 'dirt'
    this.tuning = STYLE_TUNING[this.style]

    box.getCenter(_center)
    box.getSize(_size)
    this.digCenter.copy(_center)

    const nx = divisions
    const ny = divisions
    const nz = divisions
    const sx = _size.x / nx
    const sy = _size.y / ny
    const sz = _size.z / nz
    const crumbScale = DEBRIS_CRUMB_SCALE * this.tuning.crumbScaleMul
    const spawnYOffset = _size.y * this.tuning.spawnYOffsetFrac
    this.sharedGeo = new THREE.BoxGeometry(
      sx * crumbScale,
      sy * crumbScale,
      sz * crumbScale,
    )
    this.material = material
    this.breakFloorY = box.min.y

    const halfBase =
      Math.max(sx * crumbScale, sy * crumbScale, sz * crumbScale) * 0.5
    const distances: { i: number; d: number }[] = []
    const excludeBottomFace = options?.excludeBottomFace ?? false

    for (let ix = 0; ix < nx; ix++) {
      for (let iy = 0; iy < ny; iy++) {
        if (excludeBottomFace && iy === 0) continue
        for (let iz = 0; iz < nz; iz++) {
          const spread = DEBRIS_CENTER_SPREAD
          const normX = (ix + 0.5) / nx - 0.5
          const normY = (iy + 0.5) / ny - 0.5
          const normZ = (iz + 0.5) / nz - 0.5
          _crumbPos.set(
            _center.x + normX * _size.x * spread,
            _center.y + normY * _size.y * spread + spawnYOffset,
            _center.z + normZ * _size.z * spread,
          )
          const idx = this.slots.length
          const sizeScale =
            (DEBRIS_SIZE_SCALE_MIN + Math.random() * DEBRIS_SIZE_SCALE_RANGE) *
            this.tuning.pieceSizeMul
          this.slots.push({
            base: _crumbPos.clone(),
            half: halfBase * sizeScale,
            sizeScale,
            norm: new THREE.Vector3(normX, normY, normZ),
          })
          distances.push({ i: idx, d: _crumbPos.distanceToSquared(_center) })
        }
      }
    }

    // Outer pieces fly first for a clean shell-to-core peel.
    distances.sort((a, b) => b.d - a.d)
    this.spawnOrder = distances.map((d) => d.i)

    for (const obj of hide) {
      this.hidden.push(obj)
      const matrixAutoUpdate = obj.matrixAutoUpdate
      let worldPivot: THREE.Vector3 | null = null
      if (!matrixAutoUpdate) {
        obj.updateMatrix()
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

  /** Dig progress hook (crack overlay is handled in main). */
  update(_progress: number, _swingImpact = 0) {
    if (this.finished) return
  }

  tick(dt: number) {
    if (this.batches.length === 0) return
    for (let b = this.batches.length - 1; b >= 0; b--) {
      const batch = this.batches[b]!
      this.tickSplit(batch, dt)

      const pieces = batch.pieces
      for (let i = pieces.length - 1; i >= 0; i--) {
        const piece = pieces[i]!
        this.stepDebris(batch, piece, dt)
        piece.life -= dt
        if (piece.life <= 0) {
          batch.mesh.setMatrixAt(piece.index, _zeroMatrix)
          pieces.splice(i, 1)
          continue
        }
        if (piece.life < FADE_OUT_SEC) piece.anim = piece.life / FADE_OUT_SEC
        this.writeInstance(batch, piece)
      }
      batch.mesh.instanceMatrix.needsUpdate = true

      if (pieces.length === 0 && batch.splitQueue.length === 0) {
        this.disposeBatch(batch)
        this.batches.splice(b, 1)
      }
    }
  }

  /** Re-snap crumb spawn points to a world-space box (e.g. after dig wobble). */
  refreshBreakBox(box: THREE.Box3) {
    if (this.slots.length === 0) return

    box.getCenter(_center)
    box.getSize(_size)
    this.digCenter.copy(_center)
    this.breakFloorY = box.min.y

    const spread = DEBRIS_CENTER_SPREAD
    const spawnYOffset = _size.y * this.tuning.spawnYOffsetFrac
    for (const slot of this.slots) {
      _crumbPos.set(
        _center.x + slot.norm.x * _size.x * spread,
        _center.y + slot.norm.y * _size.y * spread + spawnYOffset,
        _center.z + slot.norm.z * _size.z * spread,
      )
      slot.base.copy(_crumbPos)
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
    this.clearDigPreview()
    this.finished = false
  }

  /** Stop dig and remove all debris. */
  cancel() {
    this.cancelDig()
    for (const batch of this.batches) this.disposeBatch(batch)
    this.batches.length = 0
  }

  // --- Break / debris ---

  private beginSplit() {
    if (this.slots.length === 0 || !this.sharedGeo || !this.material) {
      this.clearDigPreview()
      return
    }

    const capacity = this.slots.length
    const mesh = new THREE.InstancedMesh(this.sharedGeo, this.material, capacity)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, _zeroMatrix)
    mesh.instanceMatrix.needsUpdate = true
    if (this.style === 'tree') {
      for (let i = 0; i < capacity; i++) {
        const slot = this.slots[i]!
        const palette =
          slot.norm.y > TREE_FOLIAGE_NORM_Y ? TREE_DEBRIS_FOLIAGE : TREE_DEBRIS_TRUNK
        const pick = Math.floor(((i * 374761393) >>> 0) % palette.length)
        _instColor.setHex(palette[pick]!)
        mesh.setColorAt(i, _instColor)
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    this.group.add(mesh)

    const batch: DebrisBatch = {
      mesh,
      geo: this.sharedGeo,
      slots: this.slots,
      pieces: [],
      splitQueue: [...this.spawnOrder],
      splitTimer: 0,
      center: this.digCenter.clone(),
      floorY: this.breakFloorY,
      style: this.style,
      tuning: this.tuning,
    }
    this.batches.push(batch)

    // Ownership of geometry + slots transferred to the batch.
    this.sharedGeo = null
    this.material = null
    this.slots = []
    this.spawnOrder = []

    if (batch.splitQueue.length > 0) this.flushSplitPiece(batch)
  }

  private tickSplit(batch: DebrisBatch, dt: number) {
    if (batch.splitQueue.length === 0) return
    batch.splitTimer -= dt
    while (batch.splitTimer <= 0 && batch.splitQueue.length > 0) {
      this.flushSplitPiece(batch)
      batch.splitTimer += SPLIT_STAGGER
    }
  }

  private flushSplitPiece(batch: DebrisBatch) {
    const idx = batch.splitQueue.shift()
    if (idx === undefined) return
    const slot = batch.slots[idx]
    if (!slot) return
    this.releaseSlot(batch, idx, slot)
  }

  private releaseSlot(batch: DebrisBatch, index: number, slot: CrumbSlot) {
    _dir.subVectors(slot.base, batch.center)
    // Outer pieces (the shell) get flung harder than core crumbs.
    const radial = Math.min(1, _dir.length() / (slot.half * 6 + 1e-3))
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 1, 0)
    else _dir.normalize()

    const burstScale = batch.tuning.burstMul * 1.5
    const lateral = 1.6
    const lift = 0.9

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * lateral,
      lift * (0.5 + Math.random() * 0.8),
      (Math.random() - 0.5) * lateral,
    )
    // Push outward, stronger for the shell, so the burst opens up cleanly.
    vel.addScaledVector(_dir, 0.5 + radial * 1.1 + Math.random() * 0.5)
    vel.multiplyScalar(burstScale)

    if (batch.style === 'wood' || batch.style === 'tree') {
      // Splinters tumble and drift more than dirt.
      vel.y += 0.2
      vel.x += (Math.random() - 0.5) * 0.45
      vel.z += (Math.random() - 0.5) * 0.45
    } else if (batch.style === 'stone') {
      // Heavier chunks: less float, slightly snappier outward kick.
      vel.y *= 0.78
      vel.multiplyScalar(1.08)
    }

    const spin = 18 * batch.tuning.spinMul
    const life =
      DEBRIS_LIFETIME_MIN +
      Math.random() * (DEBRIS_LIFETIME_MAX - DEBRIS_LIFETIME_MIN)

    const piece: DebrisPiece = {
      index,
      pos: slot.base.clone(),
      rot: new THREE.Euler(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.6,
      ),
      vel,
      angVel: new THREE.Vector3(
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin,
        (Math.random() - 0.5) * spin,
      ),
      half: slot.half,
      sizeScale: slot.sizeScale,
      anim: 1,
      life,
      settle: 0,
      asleep: false,
    }
    batch.pieces.push(piece)
    this.writeInstance(batch, piece)
    batch.mesh.instanceMatrix.needsUpdate = true
  }

  /** Compose this piece's transform into its instance slot. */
  private writeInstance(batch: DebrisBatch, piece: DebrisPiece) {
    // Subtle pop on spawn that settles to the piece's natural size.
    const pop = piece.settle < 0.12 ? 1 + (1 - piece.settle / 0.12) * 0.08 : 1
    const s = piece.sizeScale * piece.anim * pop
    _instQuat.setFromEuler(piece.rot)
    _instScale.set(s, s, s)
    // piece.pos is world space; instance matrices are mesh-local.
    _instPos.copy(piece.pos)
    batch.mesh.updateWorldMatrix(true, false)
    batch.mesh.worldToLocal(_instPos)
    _instMatrix.compose(_instPos, _instQuat, _instScale)
    batch.mesh.setMatrixAt(piece.index, _instMatrix)
  }

  private stepDebris(batch: DebrisBatch, piece: DebrisPiece, dt: number) {
    if (piece.asleep) return

    const { pos, vel, angVel, half } = piece
    vel.y -= GRAVITY * dt
    pos.addScaledVector(vel, dt)
    piece.rot.x += angVel.x * dt
    piece.rot.y += angVel.y * dt
    piece.rot.z += angVel.z * dt

    if (piece.settle < 0.12) piece.settle += dt

    _pMin.set(pos.x - half, pos.y - half, pos.z - half)
    _pMax.set(pos.x + half, pos.y + half, pos.z + half)

    const world = this.collisionWorld
    if (world) {
      // 3 resolution passes is plenty for small crumbs; 5 was overkill.
      for (let iter = 0; iter < 3; iter++) {
        let moved = false
        const indices = world.queryNear(
          pos.x,
          pos.z,
          half + 0.5,
          _pMin.y - 1,
          _pMax.y + 1,
        )
        const boxes = world.boxes
        for (let i = 0; i < indices.length; i++) {
          const box = boxes[indices[i]!]!
          if (!separationMtvInto(_pMin, _pMax, box, _mtv)) continue
          pos.add(_mtv)
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
    }

    const speed = vel.length()
    if (speed < SETTLE_SPEED) {
      vel.multiplyScalar(0.88)
      angVel.multiplyScalar(0.85)
    }

    this.snapDebrisToGround(batch, piece)

    // Put fully-settled pieces to sleep so they stop costing physics.
    if (vel.lengthSq() < SLEEP_SPEED * SLEEP_SPEED && angVel.lengthSq() < 0.04) {
      vel.set(0, 0, 0)
      angVel.set(0, 0, 0)
      piece.asleep = true
    }
  }

  private snapDebrisToGround(batch: DebrisBatch, piece: DebrisPiece) {
    const { pos, vel, angVel, half } = piece
    const bottom = pos.y - half

    let groundY =
      this.collisionWorld?.findGroundTop(pos.x, pos.y, pos.z, half, 64) ?? null
    if (groundY === null) groundY = batch.floorY

    const embed = STYLE_TUNING[batch.style].groundEmbed
    const restY = groundY + half * (1 - embed) + 0.002

    if (bottom < groundY - 0.01) {
      pos.y = restY
      if (vel.y < 0) vel.y = 0
      return
    }

    if (vel.length() < SETTLE_SPEED && bottom <= groundY + 0.05) {
      pos.y = restY
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

  // --- Teardown ---

  private clearDigPreview() {
    this.slots = []
    this.spawnOrder = []
    if (this.sharedGeo) {
      this.sharedGeo.dispose()
      this.sharedGeo = null
    }
    this.material = null
  }

  private disposeBatch(batch: DebrisBatch) {
    this.group.remove(batch.mesh)
    batch.mesh.dispose()
    batch.geo.dispose()
    batch.pieces.length = 0
    batch.splitQueue.length = 0
  }
}
