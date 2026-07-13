import * as THREE from 'three'
import { DEFAULT_BRIGHTNESS } from './tuneDefaults'

/** Full dark → bright → dark cycle length (seconds). */
export const DAY_NIGHT_CYCLE_SEC = 480

/**
 * Night exposure floor. Sky blackness comes from collapsed scattering / fog,
 * not from crushing exposure (that also kills ground lighting).
 */
export const BRIGHTNESS_MIN = 0.88
export const BRIGHTNESS_MAX = DEFAULT_BRIGHTNESS

/**
 * World-time offset at spawn: late morning (phase ~0.42).
 * Sun is high enough that ground isn't grazing-lit / near-black.
 */
export const DAY_START_ELAPSED_SEC = 0.42 * DAY_NIGHT_CYCLE_SEC

/** Cycle factor below this counts as night (enemy spawns). */
export const NIGHT_CYCLE_THRESHOLD = 0.38

const _cA = new THREE.Color()
const _cB = new THREE.Color()

function lerpColor(out: THREE.Color, a: number, b: number, t: number) {
  _cA.setHex(a)
  _cB.setHex(b)
  return out.copy(_cA).lerp(_cB, t)
}

function smooth01(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

/** 0–1 phase within one full day (0 and 1 = midnight, 0.5 = noon). */
export function cyclePhase(elapsedSec: number): number {
  return (elapsedSec % DAY_NIGHT_CYCLE_SEC) / DAY_NIGHT_CYCLE_SEC
}

/** 0 = darkest, 1 = brightest; triangle wave over `DAY_NIGHT_CYCLE_SEC`. */
export function cycleFactor(elapsedSec: number): number {
  const phase = cyclePhase(elapsedSec)
  return phase < 0.5 ? phase * 2 : 2 - phase * 2
}

export function exposureFromCycle(t: number): number {
  return THREE.MathUtils.lerp(BRIGHTNESS_MIN, BRIGHTNESS_MAX, t)
}

export function isNight(t: number): boolean {
  return t < NIGHT_CYCLE_THRESHOLD
}

/**
 * Jump world time to the next morning (same phase as spawn day-start).
 * Always advances at least a little so sleep never no-ops mid-morning.
 */
export function skipToMorning(elapsedSec: number): number {
  const cycleLen = DAY_NIGHT_CYCLE_SEC
  const morningOffset = DAY_START_ELAPSED_SEC
  const cycleIndex = Math.floor(elapsedSec / cycleLen)
  let next = cycleIndex * cycleLen + morningOffset
  if (next <= elapsedSec + 0.5) next += cycleLen
  return next
}

/** Ray origin for “outdoor” height at (x, z): topmost mesh hit when casting down from sky. */
export const OUTDOOR_RAY_ORIGIN_Y = 2000

/** Depth below outdoor roof (m) before cave lighting engages. */
export const UNDERGROUND_ENTER_DEPTH = 4
/** Shallower than this (m) while already sheltered → return to outdoor sky. */
export const UNDERGROUND_EXIT_DEPTH = 1.5

/** Fixed cycle values when underground (stable cave lighting). */
export const SHELTERED_CYCLE_T = 0.72
export const SHELTERED_PHASE = 0.5

/**
 * Medium+ (torch PointLights on): how hard global fill drops underground.
 * Unlit tunnels go dim so placed torches are worth crafting. Potato/Low skip
 * this path and keep the bright sheltered wash (no local lights to lean on).
 */
export const CAVE_FILL_LIGHT_MUL = 0.14
/** Directional sun is the worst offender underground — nearly kill it. */
export const CAVE_SUN_LIGHT_MUL = 0.04
/** Terrain self-glow floor underground (still readable at the feet). */
export const CAVE_EMISSIVE_MUL = 0.22
/** Fog tint pulled toward this hex when Medium+ caves darken. */
export const CAVE_FOG_HEX = 0x0c0a08

export type CaveDarknessScale = {
  /** 0 = outdoor / Potato-Low, 1 = fully darkened Medium+ cave. */
  dim: number
  fillMul: number
  sunMul: number
  emissiveMul: number
}

/**
 * How much to crush global lights underground when torch PointLights are available.
 * `shelterBlend` 0…1, `torchLitCaves` true on Medium+.
 */
export function caveDarknessScale(
  shelterBlend: number,
  torchLitCaves: boolean,
): CaveDarknessScale {
  const dim = torchLitCaves ? smooth01(shelterBlend) : 0
  return {
    dim,
    fillMul: THREE.MathUtils.lerp(1, CAVE_FILL_LIGHT_MUL, dim),
    sunMul: THREE.MathUtils.lerp(1, CAVE_SUN_LIGHT_MUL, dim),
    emissiveMul: THREE.MathUtils.lerp(1, CAVE_EMISSIVE_MUL, dim),
  }
}

/**
 * Hysteresis so jumping / small vertical motion does not toggle cave lighting.
 * `outdoorSurfaceY` must be the topmost outdoor roof at (x,z) from a sky-down raycast.
 */
export function updateShelteredFromSky(
  playerY: number,
  outdoorSurfaceY: number | null,
  wasSheltered: boolean,
): boolean {
  if (outdoorSurfaceY === null) return false
  const depthBelow = outdoorSurfaceY - playerY
  if (!wasSheltered) return depthBelow >= UNDERGROUND_ENTER_DEPTH
  return depthBelow >= UNDERGROUND_EXIT_DEPTH
}

const blendedAtmosphereScratch: SkyAtmosphere = {
  turbidity: 5,
  rayleigh: 2.4,
  mieCoefficient: 0.004,
  mieDirectionalG: 0.76,
  sunColor: new THREE.Color(),
  hemisphereSky: new THREE.Color(),
  hemisphereGround: new THREE.Color(),
  ambientColor: new THREE.Color(),
  fillColor: new THREE.Color(),
  fill2Color: new THREE.Color(),
  fogColor: new THREE.Color(),
}

/** Smoothly mix outdoor time-of-day with underground lighting. `blend` 0 = outdoor, 1 = cave. */
export function blendSkyAtmosphere(phase: number, cycleT: number, blend: number): SkyAtmosphere {
  const out = blendedAtmosphereScratch
  const outdoor = skyAtmosphereFromPhase(phase, cycleT)

  out.turbidity = outdoor.turbidity
  out.rayleigh = outdoor.rayleigh
  out.mieCoefficient = outdoor.mieCoefficient
  out.mieDirectionalG = outdoor.mieDirectionalG
  out.sunColor.copy(outdoor.sunColor)
  out.hemisphereSky.copy(outdoor.hemisphereSky)
  out.hemisphereGround.copy(outdoor.hemisphereGround)
  out.ambientColor.copy(outdoor.ambientColor)
  out.fillColor.copy(outdoor.fillColor)
  out.fill2Color.copy(outdoor.fill2Color)
  out.fogColor.copy(outdoor.fogColor)

  const cave = skyAtmosphereFromPhase(SHELTERED_PHASE, SHELTERED_CYCLE_T)
  const t = smooth01(blend)

  out.turbidity = THREE.MathUtils.lerp(out.turbidity, cave.turbidity, t)
  out.rayleigh = THREE.MathUtils.lerp(out.rayleigh, cave.rayleigh, t)
  out.mieCoefficient = THREE.MathUtils.lerp(out.mieCoefficient, cave.mieCoefficient, t)
  out.mieDirectionalG = THREE.MathUtils.lerp(out.mieDirectionalG, cave.mieDirectionalG, t)
  out.sunColor.lerp(cave.sunColor, t)
  out.hemisphereSky.lerp(cave.hemisphereSky, t)
  out.hemisphereGround.lerp(cave.hemisphereGround, t)
  out.ambientColor.lerp(cave.ambientColor, t)
  out.fillColor.lerp(cave.fillColor, t)
  out.fill2Color.lerp(cave.fill2Color, t)
  out.fogColor.lerp(cave.fogColor, t)

  return out
}

const _shelterSunDir = new THREE.Vector3()

/** Blend sun directions on the sphere (outdoor → fixed noon underground). */
export function blendSunDirection(
  outdoorDir: THREE.Vector3,
  blend: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const { elevationDeg, azimuthDeg } = sunAnglesFromPhase(SHELTERED_PHASE)
  _shelterSunDir.setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - elevationDeg),
    THREE.MathUtils.degToRad(azimuthDeg),
  )
  return out.copy(outdoorDir).lerp(_shelterSunDir, smooth01(blend)).normalize()
}

export function blendExposure(cycleT: number, shelterBlend: number): number {
  const outdoor = exposureFromCycle(cycleT)
  const cave = exposureFromCycle(SHELTERED_CYCLE_T)
  return THREE.MathUtils.lerp(outdoor, cave, smooth01(shelterBlend))
}

/** 0 = full day, 1 = deep night (for stars, moon, sky decor). */
export function nightStrength(cycleT: number): number {
  return 1 - smooth01((cycleT - 0.08) / 0.22)
}

/** Sun elevation (deg) and azimuth (deg) for the day arc. */
export function sunAnglesFromPhase(phase: number): { elevationDeg: number; azimuthDeg: number } {
  const dayArc = Math.sin((phase - 0.25) * Math.PI * 2)
  // Peak ~54° at noon; horizon crossings sit closer to dawn/dusk so daytime
  // ground isn't stuck in long grazing-light shadows.
  const elevationDeg = dayArc * 58 - 4
  const azimuthDeg = 48 + phase * 292
  return { elevationDeg, azimuthDeg }
}

/** 0–1 strength of sunrise/sunset color grading (peaks at dawn and dusk). */
export function goldenHourStrength(phase: number): number {
  const dawn = 1 - Math.abs(phase - 0.25) / 0.1
  const dusk = 1 - Math.abs(phase - 0.75) / 0.1
  return smooth01(Math.max(dawn, dusk))
}

/** 0 = dawn, 1 = dusk (only meaningful when golden hour is active). */
function goldenHourDuskBlend(phase: number): number {
  const dawnDist = Math.abs(phase - 0.25)
  const duskDist = Math.abs(phase - 0.75)
  return smooth01(duskDist < dawnDist ? 1 : 0)
}

export interface SkyAtmosphere {
  turbidity: number
  rayleigh: number
  mieCoefficient: number
  mieDirectionalG: number
  sunColor: THREE.Color
  hemisphereSky: THREE.Color
  hemisphereGround: THREE.Color
  ambientColor: THREE.Color
  fillColor: THREE.Color
  fill2Color: THREE.Color
  fogColor: THREE.Color
}

const skyAtmosphereScratch: SkyAtmosphere = {
  turbidity: 5,
  rayleigh: 2.4,
  mieCoefficient: 0.004,
  mieDirectionalG: 0.76,
  sunColor: new THREE.Color(),
  hemisphereSky: new THREE.Color(),
  hemisphereGround: new THREE.Color(),
  ambientColor: new THREE.Color(),
  fillColor: new THREE.Color(),
  fill2Color: new THREE.Color(),
  fogColor: new THREE.Color(),
}

/** Sky shader + light colors for the current time of day. */
export function skyAtmosphereFromPhase(phase: number, cycleT: number): SkyAtmosphere {
  const out = skyAtmosphereScratch
  const golden = goldenHourStrength(phase)
  const duskBlend = goldenHourDuskBlend(phase)
  const night = nightStrength(cycleT)
  // Brighten early: dawn/dusk still read as day, not near-black fog.
  const day = smooth01((cycleT - 0.18) / 0.38)

  // Keep air clear at golden hour — high turbidity / Mie read as dusty haze.
  out.turbidity = THREE.MathUtils.lerp(
    1.4,
    THREE.MathUtils.lerp(4.2, 3.2, golden),
    Math.max(day, golden * 0.5),
  )
  // Collapse scattering at night so the Sky dome goes near-black for stars/moon.
  out.turbidity = THREE.MathUtils.lerp(out.turbidity, 0.2, night)
  out.rayleigh = THREE.MathUtils.lerp(
    0.35,
    THREE.MathUtils.lerp(2.5, THREE.MathUtils.lerp(2.8, 3.4, golden), golden),
    day,
  )
  out.rayleigh = THREE.MathUtils.lerp(out.rayleigh, 0.02, night)
  out.mieCoefficient = THREE.MathUtils.lerp(
    0.0018,
    THREE.MathUtils.lerp(0.004, 0.0032, golden),
    Math.max(day * 0.7, golden * 0.4),
  )
  out.mieCoefficient = THREE.MathUtils.lerp(out.mieCoefficient, 0.0002, night)
  out.mieDirectionalG = THREE.MathUtils.lerp(0.62, THREE.MathUtils.lerp(0.76, 0.82, golden), day)

  const dawnSun = 0xfff0d8
  const duskSun = 0xff6a48
  const goldenSun = duskBlend > 0.5 ? duskSun : dawnSun

  // Directional light stays cool moonlight at night (grounds the scene, not the sky).
  lerpColor(out.sunColor, 0xc8d4e8, 0xfff8f0, day)
  out.sunColor.lerp(_cA.setHex(goldenSun), golden * 0.92)
  out.sunColor.lerp(_cA.setHex(0xd8e4f8), night * 0.55)

  const dawnSky = 0xffc8a8
  const duskSky = 0xff9078
  const dawnZenith = 0x6888c8
  const duskZenith = 0x4858a8
  const goldenHorizon = duskBlend > 0.5 ? duskSky : dawnSky
  const goldenZenith = duskBlend > 0.5 ? duskZenith : dawnZenith

  // Visual sky tint → pitch black at night (stars/moon sit on top).
  lerpColor(out.hemisphereSky, 0x020408, 0xd0e8ff, day)
  out.hemisphereSky.lerp(_cA.setHex(goldenHorizon), golden * 0.58)
  out.hemisphereSky.lerp(_cA.setHex(goldenZenith), golden * 0.38)
  out.hemisphereSky.lerp(_cA.setHex(0xc878a8), golden * duskBlend * 0.22)
  out.hemisphereSky.lerp(_cA.setHex(0x010204), night)

  // Soft bounce on the ground — never crush to black (no envMap on PBR mats).
  lerpColor(out.hemisphereGround, 0x788090, 0x7a6a58, day)
  out.hemisphereGround.lerp(_cA.setHex(0x5a5850), golden * 0.28)
  out.hemisphereGround.lerp(_cA.setHex(0xa8a8c0), night * 0.65)

  // Cool moonlight wash on the world — independent of the black sky.
  lerpColor(out.ambientColor, 0x7a8a9a, 0xd0dce8, day)
  out.ambientColor.lerp(_cA.setHex(0xf0d8c8), golden * (1 - duskBlend * 0.35))
  out.ambientColor.lerp(_cA.setHex(0xe8b0c0), golden * duskBlend * 0.42)
  out.ambientColor.lerp(_cA.setHex(0xc0d0e8), night * 0.55)

  lerpColor(out.fillColor, 0x687888, 0xb8d8ff, day)
  out.fillColor.lerp(_cA.setHex(0xffd8c0), golden * (1 - duskBlend * 0.25))
  out.fillColor.lerp(_cA.setHex(0xffa8b8), golden * duskBlend * 0.48)
  out.fillColor.lerp(_cA.setHex(0xb0c0e0), night * 0.5)

  lerpColor(out.fill2Color, 0x505860, 0xfff0e0, day)
  out.fill2Color.lerp(_cA.setHex(0xffd0a8), golden * (1 - duskBlend * 0.3))
  out.fill2Color.lerp(_cA.setHex(0xff98b0), golden * duskBlend * 0.5)
  out.fill2Color.lerp(_cA.setHex(0x9098b0), night * 0.4)

  // Fog tints the whole frame — never near-black or mid-range ground goes dead.
  lerpColor(out.fogColor, 0x1a2438, 0x8ab4d8, day)
  out.fogColor.lerp(_cA.setHex(0xffd0b8), golden * (1 - duskBlend * 0.2) * 0.52)
  out.fogColor.lerp(_cA.setHex(0xf0a0b0), golden * duskBlend * 0.45)
  out.fogColor.lerp(_cA.setHex(0x1c2840), night)

  return out
}
