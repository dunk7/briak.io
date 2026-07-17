import * as THREE from 'three'
import {
  createDirtAlbedoMap,
  createGrassAlbedoMap,
  DIRT_DARK,
  DIRT_MID,
  DIRT_TEXTURE_REPEAT,
  GRASS_MID,
  invalidateGrassAlbedoCache,
} from './dirtTexture'
import { setRockTexturesEnabled } from './rockTexture'

/** Slider tier boundary for the "Potato" label (matches `qualityLabel`). */
export const POTATO_MAX_T = 0.18
/** Slider tier boundary for the "Low" label (matches `qualityLabel`). */
export const LOW_MAX_T = 0.42
/** Below this, terrain uses flat brown / green (no texture sampling). Low+. */
const TEXTURED_MIN_T = 0.22
/** Below this, shadows are fully disabled (cheapest tier). */
const SHADOWS_MIN_T = 0.3
/** Below this, the atmospheric Sky shader is swapped for a flat horizon color. */
const SKY_MIN_T = 0.3
/**
 * Below this (Potato/Low), fill directionals + berry/torch/enemy PointLights are
 * off — sun/hemi/ambient only. Medium+ enables point glows; unused pool slots
 * must stay hidden (intensity 0 still costs while visible).
 */
const FILL_LIGHTS_MIN_T = LOW_MAX_T
/** Medium+ — berry canopy, torch, and enemy PointLights. */
const POINT_GLOWS_MIN_T = LOW_MAX_T
/** At/above this ("High" tier and up), scattered grass-blade tufts are drawn. */
const GRASS_BLADES_MIN_T = 0.68

/** Slider 0–100 → 0 (fast) … 1 (pretty). */
export function qualityTFromSlider(sliderValue: number) {
  return THREE.MathUtils.clamp(sliderValue / 100, 0, 1)
}

/** Fog slider 0–100 → 0 (thick) … 1 (clear vista). Independent of graphics tier. */
export function fogTFromSlider(sliderValue: number) {
  return THREE.MathUtils.clamp(sliderValue / 100, 0, 1)
}

export function fogDensityFromSlider(sliderValue: number) {
  const t = fogTFromSlider(sliderValue)
  // Slightly clearer than before — Exp2 fog + dark tint was crushing mid-ground.
  return lerp(0.042, 0.0065, t)
}

export function isPotatoGraphics(t: number) {
  return t < POTATO_MAX_T
}

/** Berry / torch / enemy PointLights — Medium and above only. */
export function pointGlowsEnabledFromT(t: number) {
  return t >= POINT_GLOWS_MIN_T
}

export function qualityLabel(t: number): string {
  if (t < POTATO_MAX_T) return 'Potato'
  if (t < LOW_MAX_T) return 'Low'
  if (t < 0.68) return 'Medium'
  if (t < 0.9) return 'High'
  return 'Ultra'
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function pow2Size(t: number, min: number, max: number) {
  const size = Math.round(lerp(min, max, t))
  return 2 ** Math.round(Math.log2(size))
}

export type GraphicsQualityContext = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sky: THREE.Object3D
  horizonColor: THREE.Color
  sun: THREE.DirectionalLight
  hemisphereLight: THREE.HemisphereLight
  ambientLight: THREE.AmbientLight
  fill: THREE.DirectionalLight
  fill2: THREE.DirectionalLight
  dirtMaterial: THREE.MeshStandardMaterial
  grassMaterial: THREE.MeshStandardMaterial
  dirtMap: THREE.CanvasTexture
  grassMap: THREE.CanvasTexture
  /** Groups whose meshes get shadow cast/receive flags from quality. */
  shadowRoots: THREE.Object3D[]
}

const BASE = {
  emissive: 0.4,
}

let lastTextureSize = 128
let texturesEnabled = true
let lastShadowSize = 0

function clearTerrainRoughness(ctx: GraphicsQualityContext) {
  if (ctx.dirtMaterial.roughnessMap === null && ctx.grassMaterial.roughnessMap === null) {
    return
  }
  // Roughness maps accent cell-border lighting creases on outer surface caps.
  ctx.dirtMaterial.roughnessMap = null
  ctx.grassMaterial.roughnessMap = null
  ctx.dirtMaterial.needsUpdate = true
  ctx.grassMaterial.needsUpdate = true
}

/** Fill-light multiplier from the graphics slider (day/night cycle scales on top in main). */
export let graphicsLightScale = 1

function applyFlatTerrainMaterials(ctx: GraphicsQualityContext) {
  ctx.dirtMaterial.map = null
  ctx.dirtMaterial.color.setHex(DIRT_MID)
  ctx.dirtMaterial.emissive.setHex(DIRT_DARK)
  ctx.grassMaterial.map = null
  ctx.grassMaterial.color.setHex(GRASS_MID)
  ctx.grassMaterial.emissive.setHex(0x2a2218)
}

function applyTexturedTerrainMaterials(
  ctx: GraphicsQualityContext,
  dirtMap: THREE.CanvasTexture,
  grassMap: THREE.CanvasTexture,
) {
  ctx.dirtMaterial.map = dirtMap
  ctx.dirtMaterial.color.setHex(0xffffff)
  ctx.dirtMaterial.emissive.setHex(DIRT_DARK)
  ctx.grassMaterial.map = grassMap
  ctx.grassMaterial.color.setHex(0xffffff)
  ctx.grassMaterial.emissive.setHex(0x2a2218)
}

function configureTexture(
  map: THREE.Texture,
  renderer: THREE.WebGLRenderer,
  t: number,
  useMipmaps: boolean,
) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  map.anisotropy = Math.max(1, Math.round(lerp(1, Math.min(16, maxAniso), t)))
  if (useMipmaps) {
    map.generateMipmaps = true
    map.minFilter = THREE.LinearMipmapLinearFilter
  } else {
    map.generateMipmaps = false
    map.minFilter = THREE.LinearFilter
  }
  map.magFilter = THREE.LinearFilter
  map.needsUpdate = true
}

function setShadowRoots(
  roots: THREE.Object3D[],
  cast: boolean,
  receive: boolean,
) {
  for (const root of roots) {
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.castShadow = cast
      obj.receiveShadow = receive
    })
  }
}

/** How the main-loop adaptive resolution scaler behaves for this quality tier. */
export type AdaptiveResolutionPolicy = {
  /** When false, render at maxPixelRatio only (no extra downscale under load). */
  enabled: boolean
  /** Minimum multiplier applied on top of maxPixelRatio when enabled. */
  floor: number
  /** Smoothed frame time (ms) above which resolution scales down. */
  frameMsHigh: number
  /** Smoothed frame time (ms) below which resolution scales back up. */
  frameMsLow: number
}

/** Potato/Low already cap pixel ratio — do not stack adaptive downscaling on top. */
export function adaptiveResolutionPolicy(t: number): AdaptiveResolutionPolicy {
  if (t < LOW_MAX_T) {
    return { enabled: false, floor: 1, frameMsHigh: Infinity, frameMsLow: Infinity }
  }
  // Wide hysteresis + higher "drop" threshold: the old 17/14 band sat right on a
  // 60 Hz frame budget and thrash-resized the canvas every half-second — HUD still
  // averaged ~60 while motion felt like ~10 fps from the hitch cadence.
  if (t < 0.68) {
    return { enabled: true, floor: 0.72, frameMsHigh: 28, frameMsLow: 15 }
  }
  return { enabled: true, floor: 0.55, frameMsHigh: 26, frameMsLow: 14 }
}

export type GraphicsQualityResult = {
  /** True when the graphics slider is in the Potato tier (no textures anywhere). */
  potatoMode: boolean
  dirtMap: THREE.CanvasTexture
  grassMap: THREE.CanvasTexture
  /** Upper bound for renderer pixel ratio (adaptive scaler multiplies below this). */
  maxPixelRatio: number
  adaptiveResolution: AdaptiveResolutionPolicy
  /** How often (s) the visibility pass runs; longer on low tiers saves CPU. */
  visibilityInterval: number
  /** Distance (m) at which surface chunk meshes are culled. */
  chunkRadius: number
  /** Distance (m) at which underground voxel columns are culled. */
  voxelRadius: number
  /** Camera far plane; coupled to render distance for depth precision. */
  cameraFar: number
  shadowsEnabled: boolean
  /**
   * Berry / torch / enemy PointLights. Off on Potato/Low so MeshStandardMaterial
   * does not evaluate a large fixed light pool every fragment.
   */
  pointGlowsEnabled: boolean
  /** Whether scattered grass-blade tufts should be drawn (high tiers only). */
  grassBladesEnabled: boolean
  /** Tuft density (blades per m²) when enabled; 0 otherwise. */
  grassBladeDensity: number
  /** Max distance (m) at which 3D grass tufts are drawn. */
  grassBladeCullRadius: number
}

/**
 * Applies the full quality ladder. Mutates renderer, lights, sky, and camera
 * and materials directly; returns render-distance + pixel-ratio numbers for the
 * caller to feed into the visibility system and adaptive resolution scaler.
 */
export function applyGraphicsQuality(
  t: number,
  ctx: GraphicsQualityContext,
): GraphicsQualityResult {
  const { renderer, sun, camera, sky, scene } = ctx
  const potato = isPotatoGraphics(t)
  setRockTexturesEnabled(!potato)

  // ---- Resolution ceiling (adaptive scaler multiplies this in main) --------
  const dprCeil = Math.min(window.devicePixelRatio, 2)
  const maxPixelRatio = lerp(0.45, dprCeil, t)
  const adaptiveResolution = adaptiveResolutionPolicy(t)
  const visibilityInterval = lerp(0.4, 0.2, t)

  // ---- Shadows -------------------------------------------------------------
  const shadowsEnabled = t > SHADOWS_MIN_T
  renderer.shadowMap.enabled = shadowsEnabled
  sun.castShadow = shadowsEnabled

  if (shadowsEnabled) {
    // Cap at 2048 — 4096 shadow maps dominate GPU time on Ultra with little visual gain.
    const shadowSize = pow2Size(t, 1024, 2048)
    if (shadowSize !== lastShadowSize) {
      lastShadowSize = shadowSize
      sun.shadow.mapSize.set(shadowSize, shadowSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
    sun.shadow.radius = lerp(0.5, 2.4, t)
    renderer.shadowMap.type = t < 0.6 ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap
  }

  // ---- Lighting ------------------------------------------------------------
  // Floor light scale higher so Low/Medium never look pitch-black outdoors.
  graphicsLightScale = lerp(0.88, 1, t)
  const fillLightsEnabled = t >= FILL_LIGHTS_MIN_T
  ctx.fill.visible = fillLightsEnabled
  ctx.fill2.visible = fillLightsEnabled
  const pointGlowsEnabled = pointGlowsEnabledFromT(t)

  const treeShadows = shadowsEnabled
  setShadowRoots(ctx.shadowRoots, treeShadows, treeShadows)

  // ---- Render distance + camera far ----------------------------------------
  const chunkRadius = lerp(42, 150, t)
  const voxelRadius = lerp(26, 88, t)
  const cameraFar = chunkRadius * 2 + 60
  camera.far = cameraFar
  camera.updateProjectionMatrix()

  // ---- Sky: expensive atmospheric shader only above the Sky tier -----------
  const skyEnabled = t > SKY_MIN_T
  sky.visible = skyEnabled
  scene.background = skyEnabled ? null : ctx.horizonColor

  // ---- Terrain material detail ---------------------------------------------
  const emissive = lerp(0.52, BASE.emissive, t)
  ctx.dirtMaterial.userData.terrainEmissiveBase = emissive
  ctx.grassMaterial.userData.terrainEmissiveBase = emissive
  ctx.dirtMaterial.emissiveIntensity = emissive
  ctx.grassMaterial.emissiveIntensity = emissive

  const flat = t < 0.35
  ctx.dirtMaterial.flatShading = flat
  ctx.grassMaterial.flatShading = flat

  const grassBladesEnabled = t >= GRASS_BLADES_MIN_T
  const grassDetailT = THREE.MathUtils.clamp(
    (t - GRASS_BLADES_MIN_T) / (1 - GRASS_BLADES_MIN_T),
    0,
    1,
  )
  // Slightly leaner Ultra grass — density was a major fragment cost for little read.
  const grassBladeDensity = grassBladesEnabled ? lerp(1.4, 2.6, grassDetailT) : 0
  const grassBladeCullRadius = grassBladesEnabled ? lerp(16, 28, grassDetailT) : 0

  const wantTextures = t >= TEXTURED_MIN_T
  let dirtMap = ctx.dirtMap
  let grassMap = ctx.grassMap

  if (!wantTextures) {
    if (texturesEnabled) {
      texturesEnabled = false
      applyFlatTerrainMaterials(ctx)
    }
    clearTerrainRoughness(ctx)
    return {
      potatoMode: potato,
      dirtMap,
      grassMap,
      maxPixelRatio,
      adaptiveResolution,
      visibilityInterval,
      chunkRadius,
      voxelRadius,
      cameraFar,
      shadowsEnabled,
      pointGlowsEnabled,
      grassBladesEnabled,
      grassBladeDensity,
      grassBladeCullRadius,
    }
  }

  // Floor at 128 so Low/Medium dirt sides read as soil, not muddy blobs.
  const textureSize = pow2Size(t, 128, 512)
  const useMipmaps = t > 0.38

  if (textureSize !== lastTextureSize) {
    lastTextureSize = textureSize
    invalidateGrassAlbedoCache()
    dirtMap.dispose()
    grassMap.dispose()
    dirtMap = createDirtAlbedoMap(textureSize)
    grassMap = createGrassAlbedoMap(textureSize)
    dirtMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
    grassMap.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  }

  texturesEnabled = true
  configureTexture(dirtMap, renderer, t, useMipmaps)
  configureTexture(grassMap, renderer, t, useMipmaps)
  applyTexturedTerrainMaterials(ctx, dirtMap, grassMap)
  clearTerrainRoughness(ctx)

  return {
    potatoMode: potato,
    dirtMap,
    grassMap,
    maxPixelRatio,
    adaptiveResolution,
    visibilityInterval,
    chunkRadius,
    voxelRadius,
    cameraFar,
    shadowsEnabled,
    pointGlowsEnabled,
    grassBladesEnabled,
    grassBladeDensity,
    grassBladeCullRadius,
  }
}
