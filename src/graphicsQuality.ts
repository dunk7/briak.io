import * as THREE from 'three'
import {
  createDirtAlbedoMap,
  createDirtRoughnessMap,
  createGrassAlbedoMap,
  createGrassRoughnessMap,
  DIRT_DARK,
  DIRT_MID,
  DIRT_TEXTURE_REPEAT,
  GRASS_MID,
  invalidateGrassAlbedoCache,
} from './dirtTexture'
import { setRockTexturesEnabled } from './rockTexture'

/** Slider tier boundary for the "Potato" label (matches `qualityLabel`). */
export const POTATO_MAX_T = 0.18
/** Below this, terrain uses flat brown / green (no texture sampling). */
const TEXTURED_MIN_T = 0.4
/** Below this, shadows are fully disabled (cheapest tier). */
const SHADOWS_MIN_T = 0.3
/** Below this, the atmospheric Sky shader is swapped for a flat horizon color. */
const SKY_MIN_T = 0.3
/** Below this, the two fill directional lights are disabled. */
const FILL_LIGHTS_MIN_T = 0.25
/** At/above this ("High" tier and up), terrain gets normal + roughness maps. */
const TERRAIN_DETAIL_MIN_T = 0.68
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
  return lerp(0.055, 0.008, t)
}

export function isPotatoGraphics(t: number) {
  return t < POTATO_MAX_T
}

export function qualityLabel(t: number): string {
  if (t < POTATO_MAX_T) return 'Potato'
  if (t < 0.42) return 'Low'
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
  emissive: 0.42,
}

let lastTextureSize = 128
let texturesEnabled = true
let lastShadowSize = 0

// ---- High-quality terrain roughness maps (triplanar-sampled) ---------------
// Note: normal maps are intentionally NOT used on terrain — per-vertex planar UVs
// stretch on diagonal surface-cap faces, and triplanar tangents are unavailable.
let detailEnabled = false
let detailSize = 0
let dirtRoughMap: THREE.CanvasTexture | null = null
let grassRoughMap: THREE.CanvasTexture | null = null

function disposeDetailMaps() {
  dirtRoughMap?.dispose()
  grassRoughMap?.dispose()
  dirtRoughMap = grassRoughMap = null
  detailSize = 0
}

function ensureDetailMaps(size: number) {
  if (detailSize === size && dirtRoughMap) return
  disposeDetailMaps()
  detailSize = size
  dirtRoughMap = createDirtRoughnessMap(size)
  grassRoughMap = createGrassRoughnessMap(size)
  for (const m of [dirtRoughMap, grassRoughMap]) {
    m.repeat.set(DIRT_TEXTURE_REPEAT, DIRT_TEXTURE_REPEAT)
  }
}

function applyTerrainDetail(
  ctx: GraphicsQualityContext,
  renderer: THREE.WebGLRenderer,
  t: number,
  size: number,
  useMipmaps: boolean,
) {
  ensureDetailMaps(size)
  ctx.dirtMaterial.roughnessMap = dirtRoughMap
  ctx.grassMaterial.roughnessMap = grassRoughMap
  if (dirtRoughMap) configureTexture(dirtRoughMap, renderer, t, useMipmaps)
  if (grassRoughMap) configureTexture(grassRoughMap, renderer, t, useMipmaps)
  if (!detailEnabled) {
    detailEnabled = true
    ctx.dirtMaterial.needsUpdate = true
    ctx.grassMaterial.needsUpdate = true
  }
}

function clearTerrainDetail(ctx: GraphicsQualityContext) {
  if (!detailEnabled && ctx.dirtMaterial.roughnessMap === null) return
  ctx.dirtMaterial.roughnessMap = null
  ctx.grassMaterial.roughnessMap = null
  ctx.dirtMaterial.needsUpdate = true
  ctx.grassMaterial.needsUpdate = true
  detailEnabled = false
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
  if (t < 0.42) {
    return { enabled: false, floor: 1, frameMsHigh: Infinity, frameMsLow: Infinity }
  }
  if (t < 0.68) {
    return { enabled: true, floor: 0.72, frameMsHigh: 22, frameMsLow: 18 }
  }
  return { enabled: true, floor: 0.5, frameMsHigh: 17, frameMsLow: 14 }
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
    const shadowSize = pow2Size(t, 1024, 4096)
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
  graphicsLightScale = lerp(0.72, 1, t)
  const fillLightsEnabled = t > FILL_LIGHTS_MIN_T
  ctx.fill.visible = fillLightsEnabled
  ctx.fill2.visible = fillLightsEnabled

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
  const emissive = lerp(0.58, BASE.emissive, t)
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
  const grassBladeDensity = grassBladesEnabled ? lerp(1.4, 3.2, grassDetailT) : 0
  const grassBladeCullRadius = grassBladesEnabled ? lerp(16, 34, grassDetailT) : 0

  const wantTextures = t >= TEXTURED_MIN_T
  let dirtMap = ctx.dirtMap
  let grassMap = ctx.grassMap

  if (!wantTextures) {
    if (texturesEnabled) {
      texturesEnabled = false
      applyFlatTerrainMaterials(ctx)
    }
    clearTerrainDetail(ctx)
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
      grassBladesEnabled,
      grassBladeDensity,
      grassBladeCullRadius,
    }
  }

  const textureSize = pow2Size(t, 64, 512)
  const useMipmaps = t > 0.5

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

  if (t >= TERRAIN_DETAIL_MIN_T) {
    applyTerrainDetail(ctx, renderer, t, textureSize, useMipmaps)
  } else {
    clearTerrainDetail(ctx)
  }

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
    grassBladesEnabled,
    grassBladeDensity,
    grassBladeCullRadius,
  }
}
