/**
 * Mobile / touch gameplay overlay: left stick, right-side look drag,
 * and action buttons. Feeds the same PlayerInput / action APIs as keyboard.
 */

export type TouchMoveState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  sprint: boolean
  sneak: boolean
  jump: boolean
}

export type TouchControlsHandlers = {
  onPrimaryPress: () => void
  onPrimaryRelease: () => void
  onSecondaryPress: () => void
  onSecondaryRelease: () => void
  onToggleInventory: () => void
  onHotbarCycle: (dir: -1 | 1) => void
  onLookDelta: (dx: number, dy: number) => void
  onBeginPlay: () => void
  isPlaying: () => boolean
  isInventoryOpen: () => boolean
}

const STICK_DEADZONE = 0.22
const STICK_SPRINT = 0.82
const LOOK_PX_SCALE = 1.35

export function prefersTouchControls(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('touch') === '1' || params.get('mobile') === '1') return true
  if (params.get('touch') === '0' || params.get('mobile') === '0') return false

  const touchPoints = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
  if (!touchPoints) return false

  const coarse = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= 920
  return coarse || noHover || narrow
}

export class TouchControls {
  readonly enabled: boolean
  private readonly root: HTMLElement
  private readonly stickBase: HTMLElement
  private readonly stickKnob: HTMLElement
  private readonly lookPad: HTMLElement
  private readonly btnJump: HTMLElement
  private readonly btnSneak: HTMLElement
  private readonly btnPrimary: HTMLElement
  private readonly btnSecondary: HTMLElement
  private readonly btnInv: HTMLElement
  private readonly btnHotPrev: HTMLElement
  private readonly btnHotNext: HTMLElement

  private handlers: TouchControlsHandlers | null = null
  private stickPointerId: number | null = null
  private lookPointerId: number | null = null
  private stickCenterX = 0
  private stickCenterY = 0
  private stickRadius = 54
  private stickX = 0
  private stickY = 0
  private lastLookX = 0
  private lastLookY = 0
  private sneakHeld = false
  private jumpHeld = false
  private primaryHeld = false
  private secondaryHeld = false

  constructor(root: HTMLElement) {
    this.enabled = prefersTouchControls()
    this.root = root

    root.innerHTML = `
      <div class="touch-stick" data-touch-stick aria-hidden="true">
        <div class="touch-stick-base"></div>
        <div class="touch-stick-knob" data-touch-knob></div>
      </div>
      <div class="touch-look" data-touch-look aria-label="Look"></div>
      <div class="touch-actions" data-touch-actions>
        <button type="button" class="touch-btn touch-btn--inv" data-touch-inv title="Inventory">Bag</button>
        <button type="button" class="touch-btn touch-btn--hot" data-touch-hot-prev title="Previous item">◀</button>
        <button type="button" class="touch-btn touch-btn--hot" data-touch-hot-next title="Next item">▶</button>
        <button type="button" class="touch-btn touch-btn--sneak" data-touch-sneak title="Sneak">Sneak</button>
        <button type="button" class="touch-btn touch-btn--jump" data-touch-jump title="Jump">Jump</button>
        <button type="button" class="touch-btn touch-btn--secondary" data-touch-secondary title="Use / Place">Use</button>
        <button type="button" class="touch-btn touch-btn--primary" data-touch-primary title="Attack / Dig">Atk</button>
      </div>
    `

    this.stickBase = root.querySelector('[data-touch-stick]') as HTMLElement
    this.stickKnob = root.querySelector('[data-touch-knob]') as HTMLElement
    this.lookPad = root.querySelector('[data-touch-look]') as HTMLElement
    this.btnJump = root.querySelector('[data-touch-jump]') as HTMLElement
    this.btnSneak = root.querySelector('[data-touch-sneak]') as HTMLElement
    this.btnPrimary = root.querySelector('[data-touch-primary]') as HTMLElement
    this.btnSecondary = root.querySelector('[data-touch-secondary]') as HTMLElement
    this.btnInv = root.querySelector('[data-touch-inv]') as HTMLElement
    this.btnHotPrev = root.querySelector('[data-touch-hot-prev]') as HTMLElement
    this.btnHotNext = root.querySelector('[data-touch-hot-next]') as HTMLElement

    if (!this.enabled) {
      root.hidden = true
      root.setAttribute('aria-hidden', 'true')
      return
    }

    document.body.classList.add('touch-device')
    root.hidden = false
    root.removeAttribute('hidden')
    this.setOverlayVisible(false)
    this.bind()
  }

  mount(handlers: TouchControlsHandlers) {
    this.handlers = handlers
  }

  setOverlayVisible(visible: boolean) {
    this.root.classList.toggle('touch-controls--active', visible)
    this.root.setAttribute('aria-hidden', visible ? 'false' : 'true')
    if (!visible) this.resetTransient()
  }

  isPrimaryHeld() {
    return this.primaryHeld
  }

  isSecondaryHeld() {
    return this.secondaryHeld
  }

  readMove(): TouchMoveState {
    const mag = Math.hypot(this.stickX, this.stickY)
    const active = mag >= STICK_DEADZONE
    const nx = active ? this.stickX : 0
    const ny = active ? this.stickY : 0
    // Stick Y: up (negative screen Y) = forward.
    return {
      forward: ny < -STICK_DEADZONE,
      backward: ny > STICK_DEADZONE,
      left: nx < -STICK_DEADZONE,
      right: nx > STICK_DEADZONE,
      sprint: active && mag >= STICK_SPRINT && !this.sneakHeld,
      sneak: this.sneakHeld,
      jump: this.jumpHeld,
    }
  }

  private bind() {
    this.stickBase.addEventListener('pointerdown', this.onStickDown)
    this.lookPad.addEventListener('pointerdown', this.onLookDown)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)

    this.bindHoldButton(this.btnJump, (down) => {
      this.jumpHeld = down
      this.btnJump.classList.toggle('touch-btn--held', down)
      if (down) this.ensurePlaying()
    })
    this.bindHoldButton(this.btnSneak, (down) => {
      this.sneakHeld = down
      this.btnSneak.classList.toggle('touch-btn--held', down)
      if (down) this.ensurePlaying()
    })
    this.bindHoldButton(this.btnPrimary, (down) => {
      if (down) {
        this.ensurePlaying()
        if (this.handlers?.isInventoryOpen()) return
        this.primaryHeld = true
        this.btnPrimary.classList.add('touch-btn--held')
        this.handlers?.onPrimaryPress()
      } else if (this.primaryHeld) {
        this.primaryHeld = false
        this.btnPrimary.classList.remove('touch-btn--held')
        this.handlers?.onPrimaryRelease()
      }
    })
    this.bindHoldButton(this.btnSecondary, (down) => {
      if (down) {
        this.ensurePlaying()
        if (this.handlers?.isInventoryOpen()) return
        this.secondaryHeld = true
        this.btnSecondary.classList.add('touch-btn--held')
        this.handlers?.onSecondaryPress()
      } else if (this.secondaryHeld) {
        this.secondaryHeld = false
        this.btnSecondary.classList.remove('touch-btn--held')
        this.handlers?.onSecondaryRelease()
      }
    })

    this.btnInv.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.handlers?.onToggleInventory()
      },
      { passive: false },
    )
    this.btnHotPrev.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.ensurePlaying()
        this.handlers?.onHotbarCycle(-1)
      },
      { passive: false },
    )
    this.btnHotNext.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.ensurePlaying()
        this.handlers?.onHotbarCycle(1)
      },
      { passive: false },
    )

    // First tap on the look pad / stick starts play.
    this.root.addEventListener(
      'pointerdown',
      () => {
        this.ensurePlaying()
      },
      { capture: true },
    )
  }

  private bindHoldButton(el: HTMLElement, onChange: (down: boolean) => void) {
    let pointerId: number | null = null
    el.addEventListener(
      'pointerdown',
      (e) => {
        if (pointerId !== null) return
        e.preventDefault()
        e.stopPropagation()
        pointerId = e.pointerId
        try {
          el.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        onChange(true)
      },
      { passive: false },
    )
    const end = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return
      pointerId = null
      onChange(false)
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener('lostpointercapture', (e) => {
      if (pointerId !== e.pointerId) return
      pointerId = null
      onChange(false)
    })
  }

  private ensurePlaying() {
    if (!this.handlers) return
    if (!this.handlers.isPlaying() && !this.handlers.isInventoryOpen()) {
      this.handlers.onBeginPlay()
    }
  }

  private readonly onStickDown = (e: PointerEvent) => {
    if (this.stickPointerId !== null) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    this.ensurePlaying()
    this.stickPointerId = e.pointerId
    const rect = this.stickBase.getBoundingClientRect()
    this.stickCenterX = rect.left + rect.width / 2
    this.stickCenterY = rect.top + rect.height / 2
    this.stickRadius = Math.max(36, rect.width * 0.42)
    try {
      this.stickBase.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    this.updateStick(e.clientX, e.clientY)
  }

  private readonly onLookDown = (e: PointerEvent) => {
    if (this.lookPointerId !== null) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Don't steal touches that start on action buttons (they're outside look pad).
    e.preventDefault()
    this.ensurePlaying()
    if (this.handlers?.isInventoryOpen()) return
    this.lookPointerId = e.pointerId
    this.lastLookX = e.clientX
    this.lastLookY = e.clientY
    try {
      this.lookPad.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  private readonly onPointerMove = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointerId) {
      e.preventDefault()
      this.updateStick(e.clientX, e.clientY)
      return
    }
    if (e.pointerId === this.lookPointerId) {
      e.preventDefault()
      if (this.handlers?.isInventoryOpen()) return
      const dx = (e.clientX - this.lastLookX) * LOOK_PX_SCALE
      const dy = (e.clientY - this.lastLookY) * LOOK_PX_SCALE
      this.lastLookX = e.clientX
      this.lastLookY = e.clientY
      if (dx !== 0 || dy !== 0) this.handlers?.onLookDelta(dx, dy)
    }
  }

  private readonly onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.stickPointerId) {
      this.stickPointerId = null
      this.stickX = 0
      this.stickY = 0
      this.stickKnob.style.transform = 'translate(-50%, -50%)'
      return
    }
    if (e.pointerId === this.lookPointerId) {
      this.lookPointerId = null
    }
  }

  private updateStick(clientX: number, clientY: number) {
    let dx = clientX - this.stickCenterX
    let dy = clientY - this.stickCenterY
    const mag = Math.hypot(dx, dy)
    if (mag > this.stickRadius && mag > 0) {
      dx = (dx / mag) * this.stickRadius
      dy = (dy / mag) * this.stickRadius
    }
    this.stickX = this.stickRadius > 0 ? dx / this.stickRadius : 0
    this.stickY = this.stickRadius > 0 ? dy / this.stickRadius : 0
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  }

  private resetTransient() {
    this.stickPointerId = null
    this.lookPointerId = null
    this.stickX = 0
    this.stickY = 0
    this.stickKnob.style.transform = 'translate(-50%, -50%)'
    if (this.primaryHeld) {
      this.primaryHeld = false
      this.btnPrimary.classList.remove('touch-btn--held')
      this.handlers?.onPrimaryRelease()
    }
    if (this.secondaryHeld) {
      this.secondaryHeld = false
      this.btnSecondary.classList.remove('touch-btn--held')
      this.handlers?.onSecondaryRelease()
    }
    this.jumpHeld = false
    this.sneakHeld = false
    this.btnJump.classList.remove('touch-btn--held')
    this.btnSneak.classList.remove('touch-btn--held')
  }
}
