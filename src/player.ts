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
/** Grounded with no input: kill residual horizontal speed below this (m/s). */
const IDLE_STOP_SPEED = 0.12
const IDLE_STOP_SPEED_SQ = IDLE_STOP_SPEED * IDLE_STOP_SPEED
const MAX_FALL = 55
const STEP_HEIGHT = 0.55
const COYOTE_SEC = 0.1
const BOB_FREQ = 8
const BOB_AMP = 0.022
const LAND_BOB = 0.06
const SPAWN_CLEARANCE = 0.35
// Max drop a grounded player stays glued to while walking downhill before going airborne.
const STICK_DOWN = 0.6
/** Idle stick distance — enough to stay planted on moderate slopes without sliding. */
const IDLE_STICK_DOWN = 0.45
const GROUND_PROBE_EPS = 0.06
/**
 * Max ground rise/run while idle before we allow sliding (≈50°).
 * Shallower slopes plant the feet; steeper ones can still slip.
 */
const IDLE_MAX_SLOPE = 1.2
const IDLE_SLOPE_SAMPLE = 0.28
/** Max drop allowed while Shift-sneaking before the step is blocked. */
const SNEAK_EDGE_DROP = 0.4
/** Sneak walk speed as a fraction of walk speed. */
const SNEAK_SPEED_RATIO = 0.35
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
  /** Shift: slow walk + stop at ledge edges. */
  sneak: boolean
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
  /** Extra multiplier (e.g. bow ADS); kept separate from the user look-speed setting. */
  private lookSensitivityScale = 1
  private pendingLookX = 0
  private pendingLookY = 0
  /** Ignore look deltas until this time (ms) after pointer lock — cursor recenter warp. */
  private suppressLookUntil = 0
  private knockbackTimer = 0
  /** When true, knockback holds full 3D launch velocity with no air drag. */
  private launchFlight = false
  private hurtShakeTime = 0
  private hurtShakeSign = 1
  private readonly hurtShakeQuat = new THREE.Quaternion()
  private readonly hurtShakeEuler = new THREE.Euler(0, 0, 0, 'YXZ')
  /** True while a requestPointerLock() promise is in flight. */
  private lockPending = false
  /** Ignore lock attempts until this time (ms) — Chrome Esc cooldown / failed lock. */
  private lockCooldownUntil = 0
  /**
   * Mobile / touch play session without pointer lock. Look + actions use the
   * same isLocked() gate as desktop pointer-lock play.
   */
  private touchPlaying = false
  /**
   * Chromium coalesces `mousemove` to the animation frame, which makes look
   * feel like sparse ticks. Prefer `pointerrawupdate` when it actually delivers
   * deltas; fall back to mousemove if raw events are absent (Firefox / quirks).
   */
  private readonly supportsPointerRawUpdate =
    typeof document !== 'undefined' && 'onpointerrawupdate' in document
  private lastRawLookMs = 0
  /** After clicks, discard look spikes — normal aiming still works after a brief suppress. */
  private lookSpikeGuardUntil = 0
  /**
   * Pixels of movementX/Y treated as a click/release warp under pointer lock.
   * Kept low: browsers often split the warp into several mid-size deltas that
   * still twitch the view ("up and right") after the huge spike is filtered.
   */
  private static readonly LOOK_SPIKE_PX = 4
  /** Hard-suppress look this long after a click so sub-threshold residuals die. */
  private static readonly LOOK_CLICK_SUPPRESS_MS = 50

  /** First-person lie-down pose (bed sleep). */
  private lyingDown = false
  private readonly sleepCamFrom = new THREE.Vector3()
  private readonly sleepCamTarget = new THREE.Vector3()
  private readonly sleepEulerFrom = new THREE.Euler(0, 0, 0, 'YXZ')
  private readonly sleepEulerTo = new THREE.Euler(0, 0, 0, 'YXZ')
  private sleepBlend = 1
  /** Base recline: nearly straight up at the sky. */
  private static readonly SLEEP_PITCH = -1.42
  /** How far you can glance left/right while asleep (~40°). */
  private static readonly SLEEP_YAW_RANGE = 0.7
  /** Pitch clamp while asleep — stay looking mostly up. */
  private static readonly SLEEP_PITCH_MIN = -1.55
  private static readonly SLEEP_PITCH_MAX = -0.95

  private enqueueLookDelta(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return
    if (!this.isLocked()) return
    if (performance.now() < this.suppressLookUntil) return
    // Click/release under pointer lock can inject a huge reversed delta; drop
    // only those outliers so the camera doesn't freeze on every attack.
    if (
      performance.now() < this.lookSpikeGuardUntil &&
      (Math.abs(dx) > PlayerController.LOOK_SPIKE_PX ||
        Math.abs(dy) > PlayerController.LOOK_SPIKE_PX)
    ) {
      return
    }
    this.pendingLookX += dx
    this.pendingLookY += dy
  }

  /** Touch look pad / external look input (bypasses mouse-only pointerraw filter). */
  addLookDelta(dx: number, dy: number) {
    this.enqueueLookDelta(dx, dy)
  }

  private readonly onLookPointerRaw = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return
    this.lastRawLookMs = performance.now()
    this.enqueueLookDelta(e.movementX, e.movementY)
  }

  private readonly onLookMouseMove = (e: MouseEvent) => {
    // Skip coalesced mousemove while raw updates are actively arriving.
    if (
      this.supportsPointerRawUpdate &&
      performance.now() - this.lastRawLookMs < 120
    ) {
      return
    }
    this.enqueueLookDelta(e.movementX, e.movementY)
  }

  private readonly onPointerLockError = () => {
    this.lockPending = false
    // Chromium blocks re-lock for ~1.25s after Esc; keep retrying from spamming the console.
    this.lockCooldownUntil = performance.now() + 1300
  }

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera
    this.camera.near = 0.05
    this.camera.updateProjectionMatrix()
    this.controls = new PointerLockControls(camera, domElement)
    // Rotation is applied from accumulated deltas in update/flushLook so look
    // stays consistent when the main thread drops or coalesces input events.
    this.controls.enabled = false
    const doc = domElement.ownerDocument
    if (this.supportsPointerRawUpdate) {
      doc.addEventListener('pointerrawupdate', this.onLookPointerRaw as EventListener)
    }
    doc.addEventListener('mousemove', this.onLookMouseMove)
    doc.addEventListener('pointerlockerror', this.onPointerLockError)
    this.controls.addEventListener('lock', () => {
      this.lockPending = false
      this.lockCooldownUntil = 0
      // Pointer lock recenters the cursor; browsers emit a large movementX/Y
      // warp that would snap the view (e.g. closing inventory and re-locking).
      this.pendingLookX = 0
      this.pendingLookY = 0
      this.suppressLookUntil = performance.now() + 80
    })
    this.controls.addEventListener('unlock', () => {
      this.lockPending = false
      this.pendingLookX = 0
      this.pendingLookY = 0
    })
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

  /**
   * Ignore look briefly (ms). Only for pointer-lock recenter warps — not clicks,
   * which would freeze aiming on every attack.
   */
  suppressLook(ms = 60) {
    this.suppressLookUntil = Math.max(this.suppressLookUntil, performance.now() + ms)
    this.pendingLookX = 0
    this.pendingLookY = 0
  }

  /**
   * After a click/release under pointer lock, discard look warps.
   * Hard-suppresses for ~1–2 frames (kills mid-size residuals), then only
   * drops oversized deltas so aiming isn't frozen for the whole guard window.
   */
  guardLookSpikes(ms = 100) {
    const now = performance.now()
    this.lookSpikeGuardUntil = Math.max(this.lookSpikeGuardUntil, now + ms)
    // Sub-threshold click warps still twitch the camera; blank look briefly.
    this.suppressLookUntil = Math.max(
      this.suppressLookUntil,
      now + PlayerController.LOOK_CLICK_SUPPRESS_MS,
    )
    // The warp often lands in pending before mousedown/up runs — drop it.
    this.pendingLookX = 0
    this.pendingLookY = 0
  }

  setLookSpeed(value: number) {
    this.lookSpeed = Math.max(0.1, Math.min(8, value))
  }

  getLookSpeed() {
    return this.lookSpeed
  }

  /** Temporary look multiplier (1 = normal). Used for bow zoom, etc. */
  setLookSensitivityScale(value: number) {
    this.lookSensitivityScale = Math.max(0.05, Math.min(2, value))
  }

  getLookSensitivityScale() {
    return this.lookSensitivityScale
  }

  setCollisionWorld(world: CollisionWorld) {
    this.world = world
  }

  setTerrainCollider(collider: CapsuleCollider) {
    this.terrain = collider
  }

  /**
   * Apply any pointer deltas that arrived during the frame (after physics).
   * Long frames otherwise present last-frame look while new deltas sit queued —
   * feels like low fps even when RAF is at 60.
   */
  flushLook() {
    if (this.lyingDown) {
      // After the lie-down settle, allow a little look-around on the mattress.
      if (this.sleepBlend >= 1) this.consumeSleepLook()
      else {
        this.pendingLookX = 0
        this.pendingLookY = 0
      }
      this.camera.position.copy(this.sleepCamTarget)
      return
    }
    this.consumeLook()
  }

  isLyingDown() {
    return this.lyingDown
  }

  /**
   * Lie down for bed sleep — camera lerps onto the mattress looking up at the
   * sky. After settling you can glance around a little until `getUp`.
   */
  lieDown(camTarget: THREE.Vector3, lookYaw: number) {
    this.sleepCamFrom.copy(this.camera.position)
    this.sleepEulerFrom.copy(this.euler)
    this.sleepCamTarget.copy(camTarget)
    // Reclined on your back: pitch nearly straight up, facing the foot of the bed.
    this.sleepEulerTo.set(PlayerController.SLEEP_PITCH, lookYaw, 0)
    this.sleepBlend = 0
    this.lyingDown = true
    this.velocity.set(0, 0, 0)
    this.pendingLookX = 0
    this.pendingLookY = 0
    this.displayBob = 0
    this.landBob = 0
    this.hurtShakeTime = 0
    // Keep the capsule under the bed so death-drops / world queries stay nearby.
    this.object.position.set(camTarget.x, camTarget.y - 0.2, camTarget.z)
  }

  /** Advance the lie-down camera blend / limited sleep look. */
  updateLieDown(dt: number) {
    if (!this.lyingDown) return
    this.sleepBlend = Math.min(1, this.sleepBlend + dt * 2.8)
    const t = this.sleepBlend * this.sleepBlend * (3 - 2 * this.sleepBlend)
    this.camera.position.lerpVectors(this.sleepCamFrom, this.sleepCamTarget, t)

    if (this.sleepBlend < 1) {
      this.pendingLookX = 0
      this.pendingLookY = 0
      this.euler.x = THREE.MathUtils.lerp(this.sleepEulerFrom.x, this.sleepEulerTo.x, t)
      let dy = this.sleepEulerTo.y - this.sleepEulerFrom.y
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      this.euler.y = this.sleepEulerFrom.y + dy * t
      this.euler.z = 0
      this.camera.quaternion.setFromEuler(this.euler)
      this.camera.matrixWorldNeedsUpdate = true
      return
    }

    this.camera.position.copy(this.sleepCamTarget)
    this.consumeSleepLook()
  }

  /** Limited mouse-look while asleep — stay reclined looking mostly upward. */
  private consumeSleepLook() {
    if (!this.isLocked()) {
      this.pendingLookX = 0
      this.pendingLookY = 0
      this.camera.quaternion.setFromEuler(this.euler)
      this.camera.matrixWorldNeedsUpdate = true
      return
    }
    if (performance.now() < this.suppressLookUntil) {
      this.pendingLookX = 0
      this.pendingLookY = 0
      this.camera.quaternion.setFromEuler(this.euler)
      this.camera.matrixWorldNeedsUpdate = true
      return
    }
    if (this.pendingLookX !== 0 || this.pendingLookY !== 0) {
      if (
        performance.now() < this.lookSpikeGuardUntil &&
        (Math.abs(this.pendingLookX) > PlayerController.LOOK_SPIKE_PX ||
          Math.abs(this.pendingLookY) > PlayerController.LOOK_SPIKE_PX)
      ) {
        this.pendingLookX = 0
        this.pendingLookY = 0
      } else {
        const scale =
          LOOK_SENSITIVITY_SCALE * this.lookSpeed * this.lookSensitivityScale * 0.65
        this.euler.y -= this.pendingLookX * scale
        this.euler.x -= this.pendingLookY * scale
        this.pendingLookX = 0
        this.pendingLookY = 0
      }
    }

    this.euler.x = THREE.MathUtils.clamp(
      this.euler.x,
      PlayerController.SLEEP_PITCH_MIN,
      PlayerController.SLEEP_PITCH_MAX,
    )
    let yawDelta = this.euler.y - this.sleepEulerTo.y
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2
    yawDelta = THREE.MathUtils.clamp(
      yawDelta,
      -PlayerController.SLEEP_YAW_RANGE,
      PlayerController.SLEEP_YAW_RANGE,
    )
    this.euler.y = this.sleepEulerTo.y + yawDelta
    this.euler.z = 0
    this.camera.quaternion.setFromEuler(this.euler)
    this.camera.matrixWorldNeedsUpdate = true
  }

  /** Stand up beside the bed (or at fallback) and clear the sleep pose. */
  getUp(x: number, z: number, fallbackY: number) {
    const wakeYaw = this.euler.y
    this.lyingDown = false
    this.sleepBlend = 1
    this.pendingLookX = 0
    this.pendingLookY = 0
    this.spawnAt(x, z, fallbackY)
    this.euler.set(-0.12, wakeYaw, 0)
    this.camera.quaternion.setFromEuler(this.euler)
    this.syncCamera(false, false, 1 / 60)
  }

  /** Drain pending look into the camera. Safe to call multiple times per frame. */
  private consumeLook() {
    if (!this.isLocked()) {
      this.pendingLookX = 0
      this.pendingLookY = 0
      return
    }
    if (performance.now() < this.suppressLookUntil) {
      this.pendingLookX = 0
      this.pendingLookY = 0
      return
    }
    if (this.pendingLookX === 0 && this.pendingLookY === 0) return
    // Multi-event click warps can arrive as several sub-threshold deltas; if the
    // frame total is still a spike while guarded, drop the batch.
    if (
      performance.now() < this.lookSpikeGuardUntil &&
      (Math.abs(this.pendingLookX) > PlayerController.LOOK_SPIKE_PX ||
        Math.abs(this.pendingLookY) > PlayerController.LOOK_SPIKE_PX)
    ) {
      this.pendingLookX = 0
      this.pendingLookY = 0
      return
    }
    this.applyLookDelta(this.pendingLookX, this.pendingLookY)
    this.pendingLookX = 0
    this.pendingLookY = 0
  }

  isLocked() {
    return this.controls.isLocked || this.touchPlaying
  }

  isTouchPlaying() {
    return this.touchPlaying
  }

  /**
   * Enter / leave mobile play without pointer lock. Desktop code should keep
   * using lock() / controls.unlock().
   */
  setTouchPlaying(active: boolean) {
    if (this.touchPlaying === active) return
    this.touchPlaying = active
    this.pendingLookX = 0
    this.pendingLookY = 0
    if (active) {
      this.camera.quaternion.setFromEuler(this.euler)
      this.lockPending = false
      this.lockCooldownUntil = 0
      this.suppressLookUntil = performance.now() + 40
    }
  }

  /**
   * Request pointer lock. Falls back if `unadjustedMovement` is unsupported,
   * swallows promise rejections, and rate-limits retries so Esc-cooldown /
   * held WASD don't flood the console.
   * On touch-primary devices use setTouchPlaying() instead.
   */
  lock() {
    if (this.touchPlaying) return
    if (this.controls.isLocked || this.lockPending) return
    if (performance.now() < this.lockCooldownUntil) return

    const el = this.controls.domElement
    if (!el) return

    this.lockPending = true
    // Keep euler as the authoritative look — camera.quaternion may include
    // transient hurt-shake offset, which must not bake into yaw/pitch.
    this.camera.quaternion.setFromEuler(this.euler)
    this.pendingLookX = 0
    this.pendingLookY = 0

    const request = (unadjusted: boolean) => {
      let result: Promise<void> | void
      try {
        result = unadjusted
          ? el.requestPointerLock({ unadjustedMovement: true })
          : el.requestPointerLock()
      } catch {
        if (unadjusted) {
          request(false)
          return
        }
        this.lockPending = false
        this.lockCooldownUntil = performance.now() + 1300
        return
      }

      if (result && typeof (result as Promise<void>).then === 'function') {
        ;(result as Promise<void>).then(
          () => {
            this.lockPending = false
          },
          () => {
            // Raw-input lock unsupported or Esc cooldown — retry plain, then back off.
            if (unadjusted) {
              request(false)
              return
            }
            this.lockPending = false
            this.lockCooldownUntil = performance.now() + 1300
          },
        )
      } else {
        this.lockPending = false
      }
    }

    request(true)
  }

  private applyLookDelta(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return
    const scale = LOOK_SENSITIVITY_SCALE * this.lookSpeed * this.lookSensitivityScale
    this.euler.y -= dx * scale
    this.euler.x -= dy * scale
    this.euler.x = Math.max(
      PI_2 - this.controls.maxPolarAngle,
      Math.min(PI_2 - this.controls.minPolarAngle, this.euler.x),
    )
    this.camera.quaternion.setFromEuler(this.euler)
    // setFromEuler syncs camera.rotation via onChange but does not mark the
    // world matrix dirty by itself in all paths — force a recompose before render.
    this.camera.matrixWorldNeedsUpdate = true
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
  private resolveCapsule(
    iterations = RESOLVE_ITERS,
    lockVertical = false,
    lockHorizontal = false,
  ) {
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
      true,
      lockVertical,
      lockHorizontal,
    )
  }

  /**
   * Approximate ground steepness under the feet (rise/run). Returns 0 on flat /
   * unknown ground. Used to decide whether idle standing should plant or slide.
   */
  private estimateGroundSlope(): number {
    const pos = this.object.position
    const center = this.probeGround(IDLE_STICK_DOWN + 0.2)
    if (center === null) return 0
    const s = IDLE_SLOPE_SAMPLE
    const samples = [
      this.probeGroundAt(pos.x + s, pos.z, center),
      this.probeGroundAt(pos.x - s, pos.z, center),
      this.probeGroundAt(pos.x, pos.z + s, center),
      this.probeGroundAt(pos.x, pos.z - s, center),
    ]
    let maxRise = 0
    for (let i = 0; i < samples.length; i++) {
      const y = samples[i]
      if (y === null) continue
      maxRise = Math.max(maxRise, Math.abs(y - center))
    }
    return maxRise / s
  }

  private probeGroundAt(x: number, z: number, nearY: number): number | null {
    const maxDrop = IDLE_STICK_DOWN + 0.35
    let best: number | null = null
    const terrain = this.terrain
    if (terrain) {
      const ty = terrain.raycastDownY(x, z, nearY + GROUND_PROBE_EPS, maxDrop + 0.3)
      if (
        ty !== null &&
        ty <= nearY + GROUND_PROBE_EPS + 0.15 &&
        ty >= nearY - maxDrop
      ) {
        best = ty
      }
    }
    const world = this.world
    if (world) {
      const indices = world.queryNear(
        x,
        z,
        PLAYER_RADIUS + 0.3,
        nearY - maxDrop - 0.3,
        nearY + GROUND_PROBE_EPS + 0.2,
        true,
      )
      const boxes = world.boxes
      for (let i = 0; i < indices.length; i++) {
        const box = boxes[indices[i]!]!
        if (!xzOverlaps(x, z, PLAYER_RADIUS, box)) continue
        const top = box.max.y
        if (top > nearY + GROUND_PROBE_EPS + 0.15) continue
        if (top < nearY - maxDrop) continue
        if (best === null || top > best) best = top
      }
    }
    return best
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
    recoverBelow = 1.85,
  ): number | null {
    const maxAbove = stepHeight + 0.05
    const minBelow = feetY - stepHeight - recoverBelow

    let best: number | null = null
    const terrain = this.terrain
    if (terrain) {
      const ty = terrain.raycastDownY(
        x,
        z,
        feetY + 1.5,
        stepHeight + recoverBelow + 2,
      )
      if (ty !== null && ty <= feetY + maxAbove && ty >= minBelow) best = ty
    }
    const world = this.world
    if (world) {
      const bw = world.findGroundTop(
        x,
        feetY,
        z,
        PLAYER_RADIUS,
        stepHeight,
        false,
        recoverBelow,
      )
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
    this.launchFlight = false
    this.knockbackTimer = KNOCKBACK_CONTROL_SEC
  }

  /**
   * Fling the player with a full 3D velocity (e.g. catapult scoop).
   * Holds movement override longer and skips air drag so the arc matches a rock.
   */
  applyLaunch(vx: number, vy: number, vz: number, controlSec = 2.4) {
    this.velocity.set(vx, vy, vz)
    this.grounded = false
    this.coyoteTimer = 0
    this.launchFlight = true
    this.knockbackTimer = Math.max(controlSec, 0.05)
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
    if (this.lyingDown) {
      this.updateLieDown(dt)
      return
    }
    this.consumeLook()

    if (input.jump && !this.jumpKeyPrev) this.jumpQueued = true
    if (!input.jump) this.jumpQueued = false
    this.jumpKeyPrev = input.jump

    const sneak = input.sneak && this.grounded
    const speed = sneak
      ? this.walkSpeed * SNEAK_SPEED_RATIO
      : input.sprint
        ? this.runSpeed
        : this.walkSpeed

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
      if (!this.launchFlight) {
        this.horizontal.set(this.velocity.x, 0, this.velocity.z)
        this.horizontal.multiplyScalar(Math.exp(-AIR_DRAG * 0.4 * dt))
        this.velocity.x = this.horizontal.x
        this.velocity.z = this.horizontal.z
      }
    } else {
      this.launchFlight = false
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
      !input.sneak &&
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
      !this.launchFlight &&
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

    const wantsMove = this.wishVel.lengthSq() > 0.01
    this.moveAndCollide(dt, wantsMove, sneak)

    if (this.grounded && this.launchFlight) {
      this.launchFlight = false
      this.knockbackTimer = 0
    }

    if (
      this.grounded &&
      !wantsMove &&
      this.knockbackTimer <= 0 &&
      this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z <
        IDLE_STOP_SPEED_SQ
    ) {
      this.velocity.x = 0
      this.velocity.z = 0
    }

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

  private moveAndCollide(dt: number, wantsMove: boolean, sneak: boolean) {
    const wasGrounded = this.grounded
    this.grounded = false

    this.moveHorizontal(this.velocity.x * dt, this.velocity.z * dt, wasGrounded, sneak)
    this.moveVertical(this.velocity.y * dt)

    if (this.velocity.y <= 1e-4) {
      this.snapToGround(wasGrounded, wantsMove)
    }

    // Final cleanup: when idle on a walkable slope, freeze feet so contact
    // normals can't shove us downhill. Steep ground still resolves and can slide.
    // Never plant while wedged inside a solid — lockHorizontal would turn lateral
    // depenetration into lift and leave you stuck.
    const idleOnGround = wasGrounded && !wantsMove && this.knockbackTimer <= 0
    const wedged = this.capsulePenetratesBoxes()
    const plantIdle =
      !wedged && idleOnGround && this.estimateGroundSlope() <= IDLE_MAX_SLOPE
    let hit = this.resolveCapsule(
      RESOLVE_ITERS,
      /* lockVertical */ plantIdle || idleOnGround,
      /* lockHorizontal */ plantIdle,
    )
    if (wedged || this.capsulePenetratesBoxes()) {
      hit = this.resolveCapsule(14, false, false)
    }
    if ((hit.grounded || plantIdle) && this.velocity.y <= 0) {
      this.grounded = true
      this.velocity.y = 0
    }
    if (hit.ceiling && this.velocity.y > 0) this.velocity.y = 0
    if (plantIdle) {
      this.velocity.x = 0
      this.velocity.z = 0
    }
  }

  /**
   * True when the capsule AABB meaningfully overlaps a solid box (not just
   * resting on a top face). Used to disable idle planting / eject when stuck.
   */
  private capsulePenetratesBoxes(): boolean {
    const world = this.world
    if (!world) return false
    const p = this.object.position
    const indices = this.nearbyBoxIndices()
    // Shrink slightly so standing on a top face / brushing a wall doesn't count.
    const skin = PLAYER_RADIUS * 0.4
    const minX = p.x - PLAYER_RADIUS + skin
    const maxX = p.x + PLAYER_RADIUS - skin
    const minY = p.y + skin
    const maxY = p.y + PLAYER_HEIGHT - skin
    const minZ = p.z - PLAYER_RADIUS + skin
    const maxZ = p.z + PLAYER_RADIUS - skin
    for (let n = 0; n < indices.length; n++) {
      const box = world.boxes[indices[n]!]
      if (!box) continue
      if (
        maxX > box.min.x &&
        minX < box.max.x &&
        maxY > box.min.y &&
        minY < box.max.y &&
        maxZ > box.min.z &&
        minZ < box.max.z
      ) {
        return true
      }
    }
    return false
  }

  private moveHorizontal(
    dx: number,
    dz: number,
    wasGrounded: boolean,
    sneak: boolean,
  ) {
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
      // Lock Y so slope normals don't shove the capsule downhill while moving on XZ.
      this.resolveCapsule(4, true)

      // Shift-sneak: refuse steps that would walk off a ledge.
      if (sneak && wasGrounded && !this.hasSneakSupport(beforeY)) {
        pos.x = beforeX
        pos.z = beforeZ
        this.velocity.x = 0
        this.velocity.z = 0
        continue
      }

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

  /** True if feet still have ground within the sneak edge-drop tolerance. */
  private hasSneakSupport(fromY: number): boolean {
    const floor = this.probeGround(SNEAK_EDGE_DROP + 0.15)
    if (floor === null) return false
    return fromY - floor <= SNEAK_EDGE_DROP
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

  private snapToGround(wasGrounded: boolean, wantsMove: boolean) {
    const maxDrop = wasGrounded
      ? wantsMove
        ? STEP_HEIGHT + STICK_DOWN
        : IDLE_STICK_DOWN
      : GROUND_PROBE_EPS
    const floor = this.probeGround(maxDrop)
    if (floor === null) return
    const pos = this.object.position
    const drop = pos.y - floor
    if (drop > maxDrop || drop < -GROUND_PROBE_EPS) return
    pos.y = floor
    // Idle: freeze feet after snap so slopes don't shove us. Moving: lock Y so
    // slope normals don't convert walk intent into downhill shove.
    const plant = !wantsMove && wasGrounded
    this.resolveCapsule(3, wantsMove || plant, plant)
    if (this.velocity.y < 0) this.velocity.y = 0
    this.grounded = true
  }

  syncCamera(moving?: boolean, sprint?: boolean, dt = 1 / 60) {
    if (this.lyingDown) {
      this.updateLieDown(0)
      return
    }
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
