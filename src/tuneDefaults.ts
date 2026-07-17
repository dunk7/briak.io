export type TuneState = {
  gravity: number
  jumpVelocity: number
  jetpackHold: number
  moveSpeed: number
  cameraHeight: number
  lookSpeed: number
  digSpeed: number
  debrisDivisions: number
  graphics: number
  fog: number
  grassGreenSlope: number
  grassTuftCluster: number
  treeFlatness: number
  treeRadius: number
  treeCount: number
  rockClumpCount: number
  rocksPerClump: number
  rockClumpRadius: number
  rockClumpSpacing: number
  enemySpawnRate: number
  enemySpeed: number
  enemyLightHeight: number
  /** Nest center X offset from world spawn (−120…+120 via slider). */
  spiderNestOffsetX: number
  /** Nest center Z offset from world spawn (−120…+120 via slider). */
  spiderNestOffsetZ: number
  /** Spawn circle radius (meters via slider). */
  spiderNestRadius: number
}

/** Canonical tuning defaults — keep `index.html` slider `value`s in sync. */
export const TUNE_DEFAULTS: TuneState = {
  gravity: 17,
  jumpVelocity: 2.3,
  jetpackHold: 0.5,
  moveSpeed: 3.5,
  cameraHeight: 0.75,
  lookSpeed: 3.75,
  digSpeed: 0.45,
  debrisDivisions: 2,
  graphics: 45,
  fog: 82,
  grassGreenSlope: 90,
  grassTuftCluster: 82,
  treeFlatness: 3.05,
  treeRadius: 2.5,
  treeCount: 48,
  rockClumpCount: 40,
  rocksPerClump: 9,
  rockClumpRadius: 7,
  rockClumpSpacing: 2,
  enemySpawnRate: 78,
  enemySpeed: 58,
  enemyLightHeight: 33,
  spiderNestOffsetX: 19,
  spiderNestOffsetZ: 41,
  spiderNestRadius: 36,
}

export const DEFAULT_GRAVITY = TUNE_DEFAULTS.gravity
export const DEFAULT_JUMP_SPEED = TUNE_DEFAULTS.jumpVelocity
export const DEFAULT_JETPACK_HOLD = TUNE_DEFAULTS.jetpackHold
export const DEFAULT_WALK_SPEED = TUNE_DEFAULTS.moveSpeed
const SPRINT_SPEED_RATIO = 13.5 / 7.5
export const DEFAULT_RUN_SPEED = DEFAULT_WALK_SPEED * SPRINT_SPEED_RATIO
export const DEFAULT_EYE_HEIGHT = TUNE_DEFAULTS.cameraHeight
export const DEFAULT_LOOK_SPEED = TUNE_DEFAULTS.lookSpeed
/** Peak exposure during the day phase of the automatic cycle. */
export const DEFAULT_BRIGHTNESS = 1.55
export const DEFAULT_GRAPHICS = TUNE_DEFAULTS.graphics
export const DEFAULT_DIG_SPEED = TUNE_DEFAULTS.digSpeed
export const DEFAULT_GRASS_GREEN_SLOPE_SLIDER = TUNE_DEFAULTS.grassGreenSlope
export const DEFAULT_TOP_SLOPE_THRESHOLD = TUNE_DEFAULTS.grassGreenSlope / 100

/** 0–100 slider → 0–1 tuft patch tightness. */
export function grassTuftClusterFromSlider(sliderValue: number) {
  const t = Math.max(0, Math.min(100, sliderValue)) / 100
  return 1 - (1 - t) ** 1.35
}

export const DEFAULT_TREE_MAX_HEIGHT_DELTA = TUNE_DEFAULTS.treeFlatness
export const DEFAULT_TREE_SAMPLE_RADIUS = TUNE_DEFAULTS.treeRadius
export const DEFAULT_TREE_COUNT = TUNE_DEFAULTS.treeCount

export const DEFAULT_ROCK_CLUMP_COUNT = TUNE_DEFAULTS.rockClumpCount
export const DEFAULT_ROCKS_PER_CLUMP = TUNE_DEFAULTS.rocksPerClump
export const DEFAULT_ROCK_CLUMP_RADIUS = TUNE_DEFAULTS.rockClumpRadius
export const DEFAULT_ROCK_CLUMP_SPACING = TUNE_DEFAULTS.rockClumpSpacing

export type TuneSliderElements = {
  [K in keyof TuneState]: HTMLInputElement
}

const STORAGE_KEY = 'briak-tune-v1'

function sliderValue(sliders: TuneSliderElements, key: keyof TuneState): number {
  const el = sliders[key]
  return el ? Number(el.value) : TUNE_DEFAULTS[key]
}

export function readTuneFromSliders(sliders: TuneSliderElements): TuneState {
  return {
    gravity: sliderValue(sliders, 'gravity'),
    jumpVelocity: sliderValue(sliders, 'jumpVelocity'),
    jetpackHold: sliderValue(sliders, 'jetpackHold'),
    moveSpeed: sliderValue(sliders, 'moveSpeed'),
    cameraHeight: sliderValue(sliders, 'cameraHeight'),
    lookSpeed: sliderValue(sliders, 'lookSpeed'),
    digSpeed: sliderValue(sliders, 'digSpeed'),
    debrisDivisions: sliderValue(sliders, 'debrisDivisions'),
    graphics: sliderValue(sliders, 'graphics'),
    fog: sliderValue(sliders, 'fog'),
    grassGreenSlope: sliderValue(sliders, 'grassGreenSlope'),
    grassTuftCluster: sliderValue(sliders, 'grassTuftCluster'),
    treeFlatness: sliderValue(sliders, 'treeFlatness'),
    treeRadius: sliderValue(sliders, 'treeRadius'),
    treeCount: sliderValue(sliders, 'treeCount'),
    rockClumpCount: sliderValue(sliders, 'rockClumpCount'),
    rocksPerClump: sliderValue(sliders, 'rocksPerClump'),
    rockClumpRadius: sliderValue(sliders, 'rockClumpRadius'),
    rockClumpSpacing: sliderValue(sliders, 'rockClumpSpacing'),
    enemySpawnRate: sliderValue(sliders, 'enemySpawnRate'),
    enemySpeed: sliderValue(sliders, 'enemySpeed'),
    enemyLightHeight: sliderValue(sliders, 'enemyLightHeight'),
    spiderNestOffsetX: sliderValue(sliders, 'spiderNestOffsetX'),
    spiderNestOffsetZ: sliderValue(sliders, 'spiderNestOffsetZ'),
    spiderNestRadius: sliderValue(sliders, 'spiderNestRadius'),
  }
}

export function applyTuneToSliders(sliders: TuneSliderElements, state: TuneState) {
  for (const key of Object.keys(TUNE_DEFAULTS) as (keyof TuneState)[]) {
    const el = sliders[key]
    if (!el) continue
    el.value = String(state[key])
  }
}

function migrateSavedTune(raw: Record<string, unknown>): Partial<TuneState> {
  const out = { ...raw } as Partial<TuneState> & {
    grassSlope?: number
    grassClump?: number
  }
  if (out.grassGreenSlope === undefined && raw.grassSlope !== undefined) {
    out.grassGreenSlope = raw.grassSlope as number
  }
  if (out.grassTuftCluster === undefined && raw.grassClump !== undefined) {
    out.grassTuftCluster = raw.grassClump as number
  }
  // Bump default look speed down; keep custom values the user actually changed.
  if (out.lookSpeed === 5.25) {
    out.lookSpeed = TUNE_DEFAULTS.lookSpeed
  }
  // Remap prior nest defaults to the current absolute world spot (−74 / −22).
  if (
    (out.spiderNestOffsetX === 62 && out.spiderNestOffsetZ === 48) ||
    (out.spiderNestOffsetX === 63 && out.spiderNestOffsetZ === 49)
  ) {
    out.spiderNestOffsetX = TUNE_DEFAULTS.spiderNestOffsetX
    out.spiderNestOffsetZ = TUNE_DEFAULTS.spiderNestOffsetZ
  }
  return out
}

function loadSavedTune(): Partial<TuneState> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    return migrateSavedTune(parsed)
  } catch {
    return null
  }
}

/**
 * Read the persisted graphics-slider value (0–100) before any sliders are wired up,
 * so one-time renderer decisions (e.g. MSAA) can match the user's saved quality tier.
 */
export function peekSavedGraphics(): number {
  const saved = loadSavedTune()
  const value = saved?.graphics
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_GRAPHICS
}

export function saveTuneState(state: TuneState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / private mode */
  }
}

/** Apply saved tune if present; otherwise keep DOM values and persist them. */
export function applyTuneFromStorage(sliders: TuneSliderElements) {
  const saved = loadSavedTune()
  if (saved) {
    applyTuneToSliders(sliders, { ...TUNE_DEFAULTS, ...saved })
    return
  }
  const domValues = readTuneFromSliders(sliders)
  applyTuneToSliders(sliders, domValues)
  saveTuneState(domValues)
}

export function bindTunePersistence(sliders: TuneSliderElements) {
  const persist = () => saveTuneState(readTuneFromSliders(sliders))
  for (const key of Object.keys(TUNE_DEFAULTS) as (keyof TuneState)[]) {
    sliders[key]?.addEventListener('input', persist)
  }
}

/** Dev helper: `exportTuneDefaults()` in the browser console → paste into `TUNE_DEFAULTS`. */
export function exportTuneDefaults(sliders: TuneSliderElements) {
  return JSON.stringify(readTuneFromSliders(sliders), null, 2)
}
