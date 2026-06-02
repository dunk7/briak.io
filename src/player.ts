import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import {
  depenetrateAabbInBoxes,
  depenetratePlayerInBoxes,
  depenetrateSphereInBoxes,
  separationMtvInto,
  xzOverlaps,
} from './collision'
import type { CollisionWorld } from './collisionWorld'

const DEFAULT_EYE_HEIGHT = 1.65
const PLAYER_RADIUS = 0.36
const PLAYER_HEIGHT = 1.78
const CAMERA_RADIUS = 0.18
const DEFAULT_WALK_SPEED = 7.5
const DEFAULT_RUN_SPEED = 13.5
const SPRINT_SPEED_RATIO = DEFAULT_RUN_SPEED / DEFAULT_WALK_SPEED
const BASE_GRAVITY = 32
const JUMP_HEIGHT = 1.15
const DEFAULT_GRAVITY = BASE_GRAVITY * 0.22
const DEFAULT_JUMP_SPEED = Math.sqrt(2 * DEFAULT_GRAVITY * JUMP_HEIGHT)
const MOVE_SUBSTEP = PLAYER_RADIUS * 0.22
const MAX_MOVE_SUBSTEPS = 16
const GROUND_ACCEL = 52
const AIR_ACCEL = 14
const GROUND_DRAG = 14
const AIR_DRAG = 2
const MAX_FALL = 55
const STEP_HEIGHT = 0.55
const COYOTE_SEC = 0.1
const BOB_FREQ = 11
const BOB_AMP = 0.045
const LAND_BOB = 0.12
const SPAWN_CLEARANCE = 0.35
const SKIN = 0.03
const GROUND_OFFSET = 0.015
const AIR_SNAP_DOWN_MAX = STEP_HEIGHT + 0.12
const GROUNDED_SNAP_DOWN_MAX = STEP_HEIGHT + 0.12

export type PlayerInput = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  sprint: boolean
  jump: boolean
}

export class PlayerController {
  readonly object = new THREE.Object3D()
  readonly velocity = new THREE.Vector3()
  readonly controls: PointerLockControls

  private readonly camera: THREE.PerspectiveCamera
  private readonly moveDir = new THREE.Vector3()
  private readonly wishVel = new THREE.Vector3()
  private readonly lookFlat = new THREE.Vector3()
  private readonly rightFlat = new THREE.Vector3()
  private readonly yAxis = new THREE.Vector3(0, 1, 0)
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly playerMin = new THREE.Vector3()
  private readonly playerMax = new THREE.Vector3()
  private readonly moveDelta = new THREE.Vector3()
  private readonly nearby = new THREE.Vector3()

  private world: CollisionWorld | null = null
  private gravity = DEFAULT_GRAVITY
  private jumpSpeed = DEFAULT_JUMP_SPEED
  private walkSpeed = DEFAULT_WALK_SPEED
  private runSpeed = DEFAULT_RUN_SPEED
  private eyeHeight = DEFAULT_EYE_HEIGHT
  private grounded = false
  private coyoteTimer = 0
  private jumpKeyPrev = false
  private jumpQueued = false
  private bobPhase = 0
  private landBob = 0
  private wasGrounded = false

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera
    this.camera.near = 0.05
    this.camera.updateProjectionMatrix()
    this.controls = new PointerLockControls(camera, domElement)
  }

  setGravity(value: number) {
    this.gravity = Math.max(1, Math.min(80, value))
  }

  getGravity() {
    return this.gravity
  }

  setJumpSpeed(value: number) {
    this.jumpSpeed = Math.max(0, Math.min(20, value))
  }

  getJumpSpeed() {
    return this.jumpSpeed
  }

  setWalkSpeed(value: number) {
    this.walkSpeed = Math.max(1, Math.min(25, value))
    this.runSpeed = this.walkSpeed * SPRINT_SPEED_RATIO
  }

  getWalkSpeed() {
    return this.walkSpeed
  }

  setEyeHeight(value: number) {
    this.eyeHeight = Math.max(0.4, Math.min(3.5, value))
  }

  getEyeHeight() {
    return this.eyeHeight
  }

  setCollisionWorld(world: CollisionWorld) {
    this.world = world
  }

  isLocked() {
    return this.controls.isLocked
  }

  lock() {
    this.controls.lock()
  }

  private groundY(
    x: number,
    z: number,
    feetY: number,
    stepHeight = STEP_HEIGHT + 0.5,
  ): number | null {
    return this.world?.findGroundTop(x, feetY, z, PLAYER_RADIUS, stepHeight) ?? null
  }

  findWalkableY(x: number, z: number): number | null {
    return this.world?.findWalkableY(x, z, PLAYER_RADIUS) ?? null
  }

  spawnAt(x: number, z: number, fallbackY = 12) {
    const ground = this.findWalkableY(x, z)
    let y = (ground ?? fallbackY) + SPAWN_CLEARANCE

    const indices = this.world?.queryNear(x, z, PLAYER_RADIUS + 1, y - 2, y + 8) ?? []
    const boxes = this.world?.boxes ?? []
    for (let i = 0; i < indices.length; i++) {
      const box = boxes[indices[i]!]!
      if (!xzOverlaps(x, z, PLAYER_RADIUS, box)) continue
      y = Math.max(y, box.max.y + SPAWN_CLEARANCE)
    }

    for (let i = 0; i < 24 && !this.hasHeadroom(y, x, z); i++) {
      y += 0.5
    }

    this.object.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    this.resolveIfStuck()
    const walkable = this.groundY(x, z, this.object.position.y, STEP_HEIGHT + 2)
    if (walkable !== null) {
      this.object.position.y = walkable + GROUND_OFFSET
    }
    this.grounded = true
    this.coyoteTimer = COYOTE_SEC
    this.syncCamera()
  }

  private setPlayerAabbFromFeet(feetX: number, feetY: number, feetZ: number) {
    this.playerMin.set(
      feetX - PLAYER_RADIUS + SKIN,
      feetY + SKIN,
      feetZ - PLAYER_RADIUS + SKIN,
    )
    this.playerMax.set(
      feetX + PLAYER_RADIUS - SKIN,
      feetY + PLAYER_HEIGHT - SKIN,
      feetZ + PLAYER_RADIUS - SKIN,
    )
  }

  private syncFeetFromAabb() {
    const pos = this.object.position
    pos.set(
      (this.playerMin.x + this.playerMax.x) * 0.5,
      this.playerMin.y - SKIN,
      (this.playerMin.z + this.playerMax.z) * 0.5,
    )
  }

  private depenetrateAtFeet(
    maxIter = 10,
    opts: { floor?: boolean; ceiling?: boolean } = { floor: true, ceiling: false },
  ) {
    const world = this.world
    if (!world) return
    const pos = this.object.position
    this.setPlayerAabbFromFeet(pos.x, pos.y, pos.z)
    const indices = world.queryNear(
      pos.x,
      pos.z,
      PLAYER_RADIUS + 1.5,
      this.playerMin.y - 1,
      this.playerMax.y + 1,
    )
    depenetratePlayerInBoxes(
      this.playerMin,
      this.playerMax,
      world.boxes,
      indices,
      maxIter,
      { ...opts, feetSkin: SKIN },
    )
    this.syncFeetFromAabb()
  }

  private walkSurfaceY(feetY: number) {
    return feetY - GROUND_OFFSET
  }

  private refreshGroundContact(stepHeight = STEP_HEIGHT + 0.5) {
    const pos = this.object.position
    const ground = this.groundY(pos.x, pos.z, pos.y, stepHeight)
    if (ground === null) return
    const gap = pos.y - (ground + GROUND_OFFSET)
    if (gap > STEP_HEIGHT + 0.05 || gap < -0.12) return
    if (this.overlapsAt(pos.x, pos.y, pos.z)) return
    this.grounded = true
    this.coyoteTimer = COYOTE_SEC
  }

  private isStandingOnBox(
    feetX: number,
    feetY: number,
    feetZ: number,
    boxIndex: number,
  ): boolean {
    const box = this.world!.boxes[boxIndex]!
    if (!xzOverlaps(feetX, feetZ, PLAYER_RADIUS, box)) return false
    const walkY = this.walkSurfaceY(feetY)
    return Math.abs(box.max.y - walkY) <= 0.2
  }

  private canMoveTo(feetX: number, feetY: number, feetZ: number, dx: number, dz: number) {
    return !this.overlapsAt(feetX + dx, feetY, feetZ + dz)
  }

  private overlapsAt(feetX: number, feetY: number, feetZ: number): boolean {
    const world = this.world
    if (!world) return false

    this.setPlayerAabbFromFeet(feetX, feetY, feetZ)
    const savedMinY = this.playerMin.y
    const playerMax = this.playerMax
    const walkY = this.walkSurfaceY(feetY)
    const indices = world.queryNear(
      feetX,
      feetZ,
      PLAYER_RADIUS + 0.5,
      savedMinY - 0.5,
      playerMax.y + 0.5,
    )
    const boxes = world.boxes

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i]!
      if (this.isStandingOnBox(feetX, feetY, feetZ, idx)) continue
      const box = boxes[idx]!
      if (!xzOverlaps(feetX, feetZ, PLAYER_RADIUS, box)) continue
      if (box.max.y < walkY - 0.25) continue
      if (box.min.y > playerMax.y + 0.05) continue

      const probeMinY =
        box.max.y <= walkY + STEP_HEIGHT + 0.1
          ? Math.min(savedMinY, box.max.y - 0.02)
          : savedMinY
      this.playerMin.y = probeMinY
      if (separationMtvInto(this.playerMin, playerMax, box, this.nearby)) {
        this.playerMin.y = savedMinY
        return true
      }
    }

    this.playerMin.y = savedMinY
    return false
  }

  private hasHeadroom(feetY: number, x: number, z: number): boolean {
    this.setPlayerAabbFromFeet(x, feetY, z)
    const world = this.world
    if (!world) return true
    const indices = world.queryNear(
      x,
      z,
      PLAYER_RADIUS + 0.5,
      this.playerMin.y,
      this.playerMax.y + 0.5,
    )
    const boxes = world.boxes
    for (let i = 0; i < indices.length; i++) {
      if (separationMtvInto(this.playerMin, this.playerMax, boxes[indices[i]!]!, this.nearby)) {
        return false
      }
    }
    return true
  }

  update(dt: number, input: PlayerInput) {
    if (input.jump && !this.jumpKeyPrev) {
      this.jumpQueued = true
    }
    if (!input.jump) {
      this.jumpQueued = false
    }
    this.jumpKeyPrev = input.jump

    const speed = input.sprint ? this.runSpeed : this.walkSpeed

    this.controls.getDirection(this.lookFlat)
    this.lookFlat.y = 0
    if (this.lookFlat.lengthSq() < 1e-6) {
      this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ')
      this.lookFlat.set(Math.sin(this.euler.y), 0, -Math.cos(this.euler.y))
    } else {
      this.lookFlat.normalize()
    }
    this.rightFlat.crossVectors(this.lookFlat, this.yAxis).normalize()

    this.moveDir.set(0, 0, 0)
    if (input.forward) this.moveDir.add(this.lookFlat)
    if (input.backward) this.moveDir.sub(this.lookFlat)
    if (input.left) this.moveDir.sub(this.rightFlat)
    if (input.right) this.moveDir.add(this.rightFlat)
    if (this.moveDir.lengthSq() > 0) this.moveDir.normalize()

    this.wishVel.copy(this.moveDir).multiplyScalar(speed)

    const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL
    const drag = this.grounded ? GROUND_DRAG : AIR_DRAG
    const horizontal = new THREE.Vector3(this.velocity.x, 0, this.velocity.z)
    const target = new THREE.Vector3(this.wishVel.x, 0, this.wishVel.z)
    horizontal.lerp(target, 1 - Math.exp(-accel * dt))

    if (this.wishVel.lengthSq() < 0.01) {
      horizontal.multiplyScalar(Math.exp(-drag * dt))
    }

    this.velocity.x = horizontal.x
    this.velocity.z = horizontal.z

    if (this.grounded) {
      this.coyoteTimer = COYOTE_SEC
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt)
    }

    if (this.jumpQueued && !this.grounded && this.coyoteTimer <= 0) {
      this.refreshGroundContact()
    }

    if (
      this.jumpQueued &&
      (this.grounded || this.coyoteTimer > 0) &&
      this.jumpSpeed > 0
    ) {
      this.velocity.y = this.jumpSpeed
      this.grounded = false
      this.coyoteTimer = 0
      this.jumpQueued = false
      this.object.position.y += 0.05
    }

    this.velocity.y -= this.gravity * dt
    if (this.grounded && this.velocity.y <= 0) this.velocity.y = 0
    this.velocity.y = Math.max(this.velocity.y, -MAX_FALL)

    this.moveDelta.set(
      this.velocity.x * dt,
      this.velocity.y * dt,
      this.velocity.z * dt,
    )
    this.moveWithCollision(this.moveDelta)
    this.snapToGround()
    this.resolveIfStuck()

    const moving =
      this.grounded &&
      (Math.abs(this.velocity.x) > 0.4 || Math.abs(this.velocity.z) > 0.4)
    if (moving) {
      this.bobPhase += dt * BOB_FREQ * (input.sprint ? 1.25 : 1)
    } else {
      this.bobPhase *= 0.85
    }

    if (this.grounded && !this.wasGrounded && this.velocity.y <= 0.1) {
      this.landBob = LAND_BOB
    }
    this.wasGrounded = this.grounded
    this.landBob = Math.max(0, this.landBob - dt * 3.5)

    this.syncCamera(moving, input.sprint)
  }

  syncCamera(moving?: boolean, sprint?: boolean) {
    const m =
      moving ??
      (this.grounded &&
        (Math.abs(this.velocity.x) > 0.4 || Math.abs(this.velocity.z) > 0.4))
    const bob = this.cameraBobOffset(m, sprint ?? false)
    const p = this.object.position
    const eyeY = p.y + this.eyeHeight + bob
    this.camera.position.set(p.x, eyeY, p.z)
    const world = this.world
    if (!world) return
    const indices = world.queryNear(
      p.x,
      p.z,
      CAMERA_RADIUS + 2,
      eyeY - CAMERA_RADIUS - 1,
      eyeY + CAMERA_RADIUS + 1,
    )
    depenetrateSphereInBoxes(
      this.camera.position,
      CAMERA_RADIUS,
      world.boxes,
      indices,
    )
  }

  private cameraBobOffset(moving: boolean, sprint: boolean): number {
    const bob =
      moving && this.grounded
        ? Math.sin(this.bobPhase) * BOB_AMP * (sprint ? 1.15 : 1)
        : 0
    return bob - this.landBob
  }

  private moveWithCollision(delta: THREE.Vector3) {
    const len = Math.sqrt(
      delta.x * delta.x + delta.y * delta.y + delta.z * delta.z,
    )
    if (len < 1e-10) return

    const steps = Math.min(
      MAX_MOVE_SUBSTEPS,
      Math.max(1, Math.ceil(len / MOVE_SUBSTEP)),
    )
    const sx = delta.x / steps
    const sy = delta.y / steps
    const sz = delta.z / steps
    let landed = false

    for (let i = 0; i < steps; i++) {
      if (this.applyMoveSubstep(sx, sy, sz)) landed = true
    }

    if (landed) {
      this.velocity.y = 0
      this.grounded = true
    }

    this.depenetrateAtFeet(10, {
      floor: true,
      ceiling: this.velocity.y > 0,
    })
  }

  private applyMoveSubstep(dx: number, dy: number, dz: number): boolean {
    const world = this.world
    if (!world) return false
    const pos = this.object.position
    let landed = false
    const rising = dy > 1e-10
    const falling = dy < -1e-10

    if (Math.abs(dx) > 1e-10) {
      if (this.canMoveTo(pos.x, pos.y, pos.z, dx, 0)) {
        pos.x += dx
      } else {
        this.velocity.x = 0
      }
      this.depenetrateAtFeet(6, { floor: false, ceiling: rising })
    }

    if (Math.abs(dz) > 1e-10) {
      if (this.canMoveTo(pos.x, pos.y, pos.z, 0, dz)) {
        pos.z += dz
      } else {
        this.velocity.z = 0
      }
      this.depenetrateAtFeet(6, { floor: false, ceiling: rising })
    }

    if (Math.abs(dy) > 1e-10) {
      pos.y += dy
      this.setPlayerAabbFromFeet(pos.x, pos.y, pos.z)
      const indices = world.queryNear(
        pos.x,
        pos.z,
        PLAYER_RADIUS + 1,
        this.playerMin.y - 3,
        this.playerMax.y + 1.5,
      )
      depenetrateAabbInBoxes(
        this.playerMin,
        this.playerMax,
        world.boxes,
        indices,
        8,
        'walls',
        SKIN,
      )
      if (rising) {
        depenetrateAabbInBoxes(
          this.playerMin,
          this.playerMax,
          world.boxes,
          indices,
          8,
          'ceiling',
          SKIN,
        )
      } else if (falling) {
        if (
          depenetrateAabbInBoxes(
            this.playerMin,
            this.playerMax,
            world.boxes,
            indices,
            8,
            'floor',
            SKIN,
          )
        ) {
          landed = true
        }
      }
      this.syncFeetFromAabb()
    }

    return landed
  }

  private snapToGround() {
    const pos = this.object.position
    if (this.velocity.y > 0) {
      this.grounded = false
      return
    }

    const probeStep = STEP_HEIGHT + 0.5
    const ground = this.groundY(pos.x, pos.z, pos.y, probeStep)
    if (ground === null) {
      this.grounded = false
      return
    }

    const snapY = ground + GROUND_OFFSET
    const gap = pos.y - snapY
    const snapDownMax = this.grounded ? GROUNDED_SNAP_DOWN_MAX : AIR_SNAP_DOWN_MAX

    if (gap > snapDownMax) {
      this.grounded = false
      return
    }

    if (Math.abs(gap) > 1e-4) {
      pos.y = snapY
    }
    if (this.velocity.y < 0) this.velocity.y = 0
    this.grounded = true

    this.depenetrateAtFeet(8, { floor: true, ceiling: false })
  }

  private resolveIfStuck() {
    const world = this.world
    if (!world) return
    const pos = this.object.position
    this.setPlayerAabbFromFeet(pos.x, pos.y, pos.z)

    const indices = world.queryNear(
      pos.x,
      pos.z,
      PLAYER_RADIUS + 1,
      this.playerMin.y - 1,
      this.playerMax.y + 2,
    )
    const boxes = world.boxes

    let penetrating = false
    for (let i = 0; i < indices.length; i++) {
      if (separationMtvInto(this.playerMin, this.playerMax, boxes[indices[i]!]!, this.nearby)) {
        penetrating = true
        break
      }
    }

    if (penetrating) {
      depenetratePlayerInBoxes(
        this.playerMin,
        this.playerMax,
        boxes,
        indices,
        12,
        {
          floor: true,
          ceiling: this.velocity.y > 0,
          feetSkin: SKIN,
        },
      )
      this.syncFeetFromAabb()
    }

    const stepHeight = penetrating ? 4 : STEP_HEIGHT + 0.5
    const walkable = this.groundY(pos.x, pos.z, pos.y, stepHeight)
    if (walkable === null) return

    const floorY = walkable + GROUND_OFFSET
    if (pos.y >= floorY - 0.08) return
    if (floorY > pos.y + stepHeight + 0.15) return

    pos.y = floorY
    if (this.velocity.y < 0) this.velocity.y = 0
    this.grounded = true
  }
}
