import * as THREE from 'three'
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js'
import { depenetrateSphereInBoxes, xzOverlaps } from './collision'
import type { CollisionWorld } from './collisionWorld'
import type { CapsuleCollider } from './meshCollider'
import {
  DEFAULT_EYE_HEIGHT,
  DEFAULT_LOOK_SPEED,
  DEFAULT_GRAVITY,
  DEFAULT_JETPACK_HOLD,
  DEFAULT_JUMP_SPEED,
  DEFAULT_RUN_SPEED,
  DEFAULT_WALK_SPEED,
} from './tuneDefaults'

export const PLAYER_RADIUS = 0.125
export const PLAYER_HEIGHT = 0.95
const CAMERA_RADIUS = 0.1
const SPRINT_SPEED_RATIO = DEFAULT_RUN_SPEED / DEFAULT_WALK_SPEED
// Fixed (not size-derived) so fast movement can't tunnel through thin walls/floors.
const MOVE_SUBSTEP = 0.12
const MAX_MOVE_SUBSTEPS = 40
const GROUND_ACCEL = 52
const AIR_ACCEL = 14
const GROUND_DRAG = 14
const AIR_DRAG = 2
const MAX_FALL = 55
const STEP_HEIGHT = 0.55
const COYOTE_SEC = 0.1
const BOB_FREQ = 8
const BOB_AMP = 0.022
const LAND_BOB = 0.06
const SPAWN_CLEARANCE = 0.35
// Max drop a grounded player stays glued to while walking downhill before going airborne.
const STICK_DOWN = 0.6
const GROUND_PROBE_EPS = 0.06
const RESOLVE_ITERS = 5
const LOOK_SENSITIVITY_SCALE = 0.002
const PI_2 = Math.PI / 2
/** Brief window where movement input does not override enemy knockback. */
const KNOCKBACK_CONTROL_SEC = 0.2
/** Minecraft-style hurt camera wobble duration. */
const HURT_SHAKE_SEC = 0.38
const HURT_SHAKE_YAW = 0.11
const HURT_SHAKE_PITCH = 0.065

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
  private readonly horizontal = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly lookFlat = new THREE.Vector3()
  private readonly rightFlat = new THREE.Vector3()
  private readonly yAxis = new THREE.Vector3(0, 1, 0)
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ')

  private world: CollisionWorld | null = null
  private terrain: CapsuleCollider | null = null
  private gravity = DEFAULT_GRAVITY
  private jumpSpeed = DEFAULT_JUMP_SPEED
  private jetpackMaxSec = DEFAULT_JETPACK_HOLD
  private jetpackFuel = DEFAULT_JETPACK_HOLD
  private walkSpeed = DEFAULT_WALK_SPEED
  private runSpeed = DEFAULT_RUN_SPEED
  private eyeHeight = DEFAULT_EYE_HEIGHT
  private grounded = false
  private coyoteTimer = 0
  private jumpKeyPrev = false
  private jumpQueued = false
  private bobPhase = 0
  private landBob = 0
  private displayBob = 0
  private wasGrounded = false
  private lookSpeed = DEFAULT_LOOK_SPEED
  private pendingLookX = 0
  private pendingLookY = 0
  private knockbackTimer = 0
  private hurtShakeTime = 0
  private hurtShakeSign = 1
  private readonly hurtShakeQuat = new THREE.Quaternion()
  private readonly hurtShakeEuler = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly onLookMouseMove = (e: MouseEvent) => {
    if (!this.controls.isLocked) return
    this.pendingLookX += e.movementX
    this.pendingLookY += e.movementY
  }

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera
    this.camera.near = 0.05
    this.camera.updateProjectionMatrix()
    this.controls = new PointerLockControls(camera, domElement)
    // Rotation is applied in update() from accumulated deltas so look speed
    // stays consistent when the main thread drops or coalesces mousemove events.
    this.controls.enabled = false
    domElement.ownerDocument.addEventListener('mousemove', this.onLookMouseMove)
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

  /** Max seconds of hold-jump boost per air time (0 = off). */
  setJetpackHold(seconds: number) {
    this.jetpackMaxSec = Math.max(0, Math.min(2, seconds))
    if (this.grounded) this.jetpackFuel = this.jetpackMaxSec
    else this.jetpackFuel = Math.min(this.jetpackFuel, this.jetpackMaxSec)
  }

  getJetpackHold() {
    return this.jetpackMaxSec
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

  setLookSpeed(value: number) {
    this.lookSpeed = Math.max(0.1, Math.min(8, value))
  }

  getLookSpeed() {
    return this.lookSpeed
  }

  setCollisionWorld(world: CollisionWorld) {
    this.world = world
  }

  setTerrainCollider(collider: CapsuleCollider) {
    this.terrain = collider
  }

  isLocked() {
    return this.controls.isLocked
  }

  lock() {
    this.controls.lock(true)
    this.euler.setFromQuaternion(this.camera.quaternion, 'YXZ')
  }

  private applyLookDelta(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return
    const scale = LOOK_SENSITIVITY_SCALE * this.lookSpeed
    this.euler.y -= dx * scale
    this.euler.x -= dy * scale
    this.euler.x = Math.max(
      PI_2 - this.controls.maxPolarAngle,
      Math.min(PI_2 - this.controls.minPolarAngle, this.euler.x),
    )
    this.camera.quaternion.setFromEuler(this.euler)
  }

  // --- Box broadphase ------------------------------------------------------

  private nearbyBoxIndices(): readonly number[] {
    const world = this.world
    const pos = this.object.position
    if (!world) return EMPTY
    return world.queryNear(
      pos.x,
      pos.z,
      PLAYER_RADIUS + 1.5,
      pos.y - 1,
      pos.y + PLAYER_HEIGHT + 1,
      true,
    )
  }

  /** Push the capsule out of all nearby terrain triangles and voxel/prop boxes. */
  private resolveCapsule(iterations = RESOLVE_ITERS) {
    const terrain = this.terrain
    const world = this.world
    if (!terrain || !world) {
      return { grounded: false, pushUp: 0, ceiling: false, hit: false }
    }
    return terrain.resolve(
      this.object.position,
      PLAYER_RADIUS,
      PLAYER_HEIGHT,
      world.boxes,
      this.nearbyBoxIndices(),
      iterations,
    )
  }

  /**
   * Nearest walkable floor at/below the feet within `maxDrop`. Casts a ray straight
   * down from just above the feet (so inside a cave it finds the cave floor, not a
   * ceiling far above) and also considers voxel/prop box tops the feet stand over.
   */
  private probeGround(maxDrop: number): number | null {
    const pos = this.object.position
    let best: number | null = null

    const terrain = this.terrain
    if (terrain) {
      const ty = terrain.raycastDownY(
        pos.x,
        pos.z,
        pos.y + GROUND_PROBE_EPS,
        maxDrop + GROUND_PROBE_EPS + 0.1,
      )
      if (ty !== null && ty <= pos.y + GROUND_PROBE_EPS && ty >= pos.y - maxDrop - 0.2) {
        best = ty
      }
    }

    const world = this.world
    if (world) {
      const indices = world.queryNear(
        pos.x,
        pos.z,
        PLAYER_RADIUS + 0.3,
        pos.y - maxDrop - 0.3,
        pos.y + GROUND_PROBE_EPS + 0.1,
        true,
      )
      const boxes = world.boxes
      for (let i = 0; i < indices.length; i++) {
        const box = boxes[indices[i]!]!
        if (!xzOverlaps(pos.x, pos.z, PLAYER_RADIUS, box)) continue
        const top = box.max.y
        if (top > pos.y + GROUND_PROBE_EPS) continue
        if (top < pos.y - maxDrop - 0.2) continue
        if (best === null || top > best) best = top
      }
    }
    return best
  }

  /** Topmost walkable surface at (x, z) regardless of where the feet currently are. */
  findWalkableY(x: number, z: number): number | null {
    let best: number | null = null
    const terrain = this.terrain
    if (terrain) {
      const ty = terrain.raycastDownY(x, z, 2000, 4000)
      if (ty !== null) best = ty
    }
    const world = this.world
    if (world) {
      const bw = world.findWalkableY(x, z, PLAYER_RADIUS)
      if (bw !== null && (best === null || bw > best)) best = bw
    }
    return best
  }

  /**
   * Walkable floor near `feetY` (not the topmost surface in the column).
   * Used by enemies so they follow terrain without snapping onto distant voxel tops.
   */
  probeWalkableY(
    x: number,
    z: number,
    feetY: number,
    stepHeight = STEP_HEIGHT,
  ): number | null {
    const recoverBelow = 1.85
    const maxAbove = stepHeight + 0.05
    const minBelow = feetY - stepHeight - recoverBelow

    let best: number | null = null
    const terrain = this.terrain
    if (terrain) {
      const ty = terrain.raycastDownY(x, z, feetY + 1.5, stepHeight + 3)
      if (ty !== null && ty <= feetY + maxAbove && ty >= minBelow) best = ty
    }
    const world = this.world
    if (world) {
      const bw = world.findGroundTop(x, feetY, z, PLAYER_RADIUS, stepHeight)
      if (bw !== null && bw <= feetY + maxAbove && bw >= minBelow) {
        if (best === null) {
          best = bw
        } else if (bw > best && feetY - best < 0.22) {
          best = bw
        }
      }
    }
    return best
  }

  /** Shove the player along a world XZ direction (need not be normalized). */
  applyKnockback(dirX: number, dirZ: number, speed: number, lift = 2.2) {
    const len = Math.hypot(dirX, dirZ)
    if (len > 1e-6) {
      this.velocity.x = (dirX / len) * speed
      this.velocity.z = (dirZ / len) * speed
    }
    this.velocity.y = Math.max(this.velocity.y, lift)
    this.grounded = false
    this.knockbackTimer = KNOCKBACK_CONTROL_SEC
  }

  /** Quick decaying camera wobble when taking damage (Minecraft-style). */
  applyHurtCameraShake() {
    this.hurtShakeTime = HURT_SHAKE_SEC
    this.hurtShakeSign = Math.random() < 0.5 ? -1 : 1
  }

  spawnAt(x: number, z: number, fallbackY = 12) {
    const ground = this.findWalkableY(x, z)
    const y = (ground ?? fallbackY) + SPAWN_CLEARANCE
    this.object.position.set(x, y, z)
    this.velocity.set(0, 0, 0)
    // Settle: lift out of anything, then drop onto the surface.
    for (let i = 0; i < 6; i++) this.resolveCapsule(6)
    const floor = this.probeGround(8)
    if (floor !== null) this.object.position.y = floor
    this.resolveCapsule(6)
    this.grounded = true
    this.coyoteTimer = COYOTE_SEC
    this.syncCamera()
  }

  update(dt: number, input: PlayerInput) {
    if (this.controls.isLocked) {
      this.applyLookDelta(this.pendingLookX, this.pendingLookY)
    }
    this.pendingLookX = 0
    this.pendingLookY = 0

    if (input.jump && !this.jumpKeyPrev) this.jumpQueued = true
    if (!input.jump) this.jumpQueued = false
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

    this.knockbackTimer = Math.max(0, this.knockbackTimer - dt)
    if (this.knockbackTimer > 0) {
      this.horizontal.set(this.velocity.x, 0, this.velocity.z)
      this.horizontal.multiplyScalar(Math.exp(-AIR_DRAG * 0.4 * dt))
      this.velocity.x = this.horizontal.x
      this.velocity.z = this.horizontal.z
    } else {
      const accel = this.grounded ? GROUND_ACCEL : AIR_ACCEL
      const drag = this.grounded ? GROUND_DRAG : AIR_DRAG
      this.horizontal.set(this.velocity.x, 0, this.velocity.z)
      this.target.set(this.wishVel.x, 0, this.wishVel.z)
      this.horizontal.lerp(this.target, 1 - Math.exp(-accel * dt))
      if (this.wishVel.lengthSq() < 0.01) {
        this.horizontal.multiplyScalar(Math.exp(-drag * dt))
      }
      this.velocity.x = this.horizontal.x
      this.velocity.z = this.horizontal.z
    }

    if (this.grounded) this.coyoteTimer = COYOTE_SEC
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt)

    if (
      this.jumpQueued &&
      (this.grounded || this.coyoteTimer > 0) &&
      this.jumpSpeed > 0
    ) {
      this.velocity.y = this.jumpSpeed
      this.grounded = false
      this.coyoteTimer = 0
      this.jumpQueued = false
      this.jetpackFuel = this.jetpackMaxSec
    }

    if (this.grounded) {
      this.jetpackFuel = this.jetpackMaxSec
    } else if (
      input.jump &&
      this.jetpackMaxSec > 0 &&
      this.jetpackFuel > 0
    ) {
      const burn = Math.min(dt, this.jetpackFuel)
      this.jetpackFuel -= burn
      const lift = this.gravity * 1.45 + this.jumpSpeed * 0.35
      this.velocity.y += lift * burn
    }

    this.velocity.y -= this.gravity * dt
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0
    this.velocity.y = Math.max(this.velocity.y, -MAX_FALL)

    this.moveAndCollide(dt)

    const moving =
      this.grounded &&
      (Math.abs(this.velocity.x) > 0.4 || Math.abs(this.velocity.z) > 0.4)
    if (moving) this.bobPhase += dt * BOB_FREQ * (input.sprint ? 1.25 : 1)
    else this.bobPhase *= 0.85

    if (this.grounded && !this.wasGrounded && this.velocity.y <= 0.1) {
      this.landBob = LAND_BOB
    }
    this.wasGrounded = this.grounded
    this.landBob = Math.max(0, this.landBob - dt * 3.5)

    if (this.hurtShakeTime > 0) {
      this.hurtShakeTime = Math.max(0, this.hurtShakeTime - dt)
    }

    this.syncCamera(moving, input.sprint, dt)
  }

  private moveAndCollide(dt: number) {
    const wasGrounded = this.grounded
    this.grounded = false

    this.moveHorizontal(this.velocity.x * dt, this.velocity.z * dt, wasGrounded)
    this.moveVertical(this.velocity.y * dt)

    if (this.velocity.y <= 1e-4) {
      this.snapToGround(wasGrounded)
    }

    // Final cleanup pass to clear any residual penetration after the moves.
    const hit = this.resolveCapsule(RESOLVE_ITERS)
    if (hit.grounded && this.velocity.y <= 0) {
      this.grounded = true
      this.velocity.y = 0
    }
    if (hit.ceiling && this.velocity.y > 0) this.velocity.y = 0
  }

  private moveHorizontal(dx: number, dz: number, wasGrounded: boolean) {
    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 1e-9) return
    const steps = Math.min(MAX_MOVE_SUBSTEPS, Math.max(1, Math.ceil(len / MOVE_SUBSTEP)))
    const sx = dx / steps
    const sz = dz / steps
    const pos = this.object.position

    for (let i = 0; i < steps; i++) {
      const beforeX = pos.x
      const beforeZ = pos.z
      const beforeY = pos.y
      pos.x += sx
      pos.z += sz
      this.resolveCapsule(4)

      const achievedX = pos.x - beforeX
      const achievedZ = pos.z - beforeZ
      const want = sx * sx + sz * sz
      const got = sx * achievedX + sz * achievedZ
      // Blocked by a wall: if we were on the ground, try to step up onto a low ledge.
      if (wasGrounded && got < want * 0.7) {
        if (!this.tryStepUp(beforeX, beforeY, beforeZ, sx, sz)) {
          // Step-up failed; accept the wall slide produced by resolveCapsule.
        }
      }
    }
  }

  /** Raise the capsule by STEP_HEIGHT, advance, then settle back down onto the ledge. */
  private tryStepUp(
    beforeX: number,
    beforeY: number,
    beforeZ: number,
    sx: number,
    sz: number,
  ): boolean {
    const pos = this.object.position
    const slidX = pos.x
    const slidZ = pos.z
    const slidY = pos.y

    pos.set(beforeX, beforeY + STEP_HEIGHT, beforeZ)
    this.resolveCapsule(3)
    pos.x += sx
    pos.z += sz
    this.resolveCapsule(4)

    const floor = this.probeGround(STEP_HEIGHT + 0.1)
    if (floor === null || floor <= beforeY + 0.02) {
      // No ledge to stand on — revert to the plain wall-slide result.
      pos.set(slidX, slidY, slidZ)
      return false
    }
    pos.y = floor
    this.resolveCapsule(3)
    this.grounded = true
    if (this.velocity.y < 0) this.velocity.y = 0
    return true
  }

  private moveVertical(dy: number) {
    if (Math.abs(dy) < 1e-9) return
    const steps = Math.min(
      MAX_MOVE_SUBSTEPS,
      Math.max(1, Math.ceil(Math.abs(dy) / MOVE_SUBSTEP)),
    )
    const sy = dy / steps
    const pos = this.object.position
    const falling = dy < 0

    for (let i = 0; i < steps; i++) {
      pos.y += sy
      const hit = this.resolveCapsule(4)
      if (falling && hit.grounded) {
        this.grounded = true
        this.velocity.y = 0
        break
      }
      if (!falling && hit.ceiling) {
        this.velocity.y = 0
        break
      }
    }
  }

  private snapToGround(wasGrounded: boolean) {
    const maxDrop = wasGrounded ? STEP_HEIGHT + STICK_DOWN : GROUND_PROBE_EPS
    const floor = this.probeGround(maxDrop)
    if (floor === null) return
    const pos = this.object.position
    const drop = pos.y - floor
    if (drop > maxDrop || drop < -GROUND_PROBE_EPS) return
    pos.y = floor
    this.resolveCapsule(3)
    if (this.velocity.y < 0) this.velocity.y = 0
    this.grounded = true
  }

  syncCamera(moving?: boolean, sprint?: boolean, dt = 1 / 60) {
    const m =
      moving ??
      (this.grounded &&
        (Math.abs(this.velocity.x) > 0.4 || Math.abs(this.velocity.z) > 0.4))
    const targetBob = this.cameraBobOffset(m, sprint ?? false)
    const bobBlend = 1 - Math.exp(-14 * dt)
    this.displayBob += (targetBob - this.displayBob) * bobBlend
    const p = this.object.position
    const eyeY = p.y + this.eyeHeight + this.displayBob
    this.camera.position.set(p.x, eyeY, p.z)
    this.applyHurtCameraShakeOffset()
    const world = this.world
    if (!world) return
    const indices = world.queryNear(
      p.x,
      p.z,
      CAMERA_RADIUS + 2,
      eyeY - CAMERA_RADIUS - 1,
      eyeY + CAMERA_RADIUS + 1,
      true,
    )
    depenetrateSphereInBoxes(this.camera.position, CAMERA_RADIUS, world.boxes, indices)
  }

  /** Visual-only wobble layered on the locked look quaternion. */
  private applyHurtCameraShakeOffset() {
    this.camera.quaternion.setFromEuler(this.euler)
    if (this.hurtShakeTime <= 0) return
    const t = this.hurtShakeTime / HURT_SHAKE_SEC
    const amp = t * t
    const phase = (1 - t) * Math.PI * 7
    const yaw = Math.sin(phase) * HURT_SHAKE_YAW * amp * this.hurtShakeSign
    const pitch = Math.sin(phase * 1.37 + 0.6) * HURT_SHAKE_PITCH * amp
    this.hurtShakeEuler.set(pitch, yaw, 0)
    this.hurtShakeQuat.setFromEuler(this.hurtShakeEuler)
    this.camera.quaternion.multiply(this.hurtShakeQuat)
  }

  private cameraBobOffset(moving: boolean, sprint: boolean): number {
    const target =
      moving && this.grounded
        ? Math.sin(this.bobPhase) * BOB_AMP * (sprint ? 1.1 : 1)
        : 0
    return target - this.landBob
  }
}

const EMPTY: readonly number[] = []
