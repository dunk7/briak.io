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

/** Below this, terrain uses flat brown / green (no texture sampling). */
const TEXTURED_MIN_T = 0.45

/** Slider 0–100 → 0 (fast) … 1 (pretty). */
export function qualityTFromSlider(sliderValue: number) {
  return THREE.MathUtils.clamp(sliderValue / 100, 0, 1)
}

export function qualityLabel(t: number): string {
  if (t < 0.2) return 'Potato'
  if (t < 0.45) return 'Low'
  if (t < 0.7) return 'Medium'
  if (t < 0.88) return 'High'
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
  fog: THREE.FogExp2
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
  sun: 1.45,
  hemisphere: 0.58,
  ambient: 0.24,
  fill: 0.32,
  fill2: 0.2,
  fogDensity: 0.01,
  emissive: 0.42,
}

let lastTextureSize = 128
let texturesEnabled = true

/** Fill-light multiplier from the graphics slider (brightness scales on top in main). */
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
  map.anisotropy = Math.max(1, Math.round(lerp(1, Math.min(4, maxAniso), t)))
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

export type GraphicsQualityResult = {
  dirtMap: THREE.CanvasTexture
  grassMap: THREE.CanvasTexture
}

/** Applies quality; recreates procedural textures when resolution tier changes. */
export function applyGraphicsQuality(
  t: number,
  ctx: GraphicsQualityContext,
): GraphicsQualityResult {
  const { renderer, sun, fog } = ctx

  renderer.setPixelRatio(lerp(0.65, Math.min(window.devicePixelRatio, 1.5), t))

  const shadowsOn = t > 0.12
  renderer.shadowMap.enabled = shadowsOn
  sun.castShadow = shadowsOn

  if (shadowsOn) {
    const shadowSize = pow2Size(t, 512, 2048)
    sun.shadow.mapSize.set(shadowSize, shadowSize)
    sun.shadow.radius = lerp(0, 1.2, t)
    if (t < 0.45) {
      renderer.shadowMap.type = THREE.BasicShadowMap
    } else if (t < 0.75) {
      renderer.shadowMap.type = THREE.PCFShadowMap
    } else {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }
    sun.shadow.map?.dispose()
    sun.shadow.needsUpdate = true
  }

  graphicsLightScale = lerp(0.72, 1, t)

  fog.density = lerp(0.022, BASE.fogDensity, t)

  const emissive = lerp(0.58, BASE.emissive, t)
  ctx.dirtMaterial.emissiveIntensity = emissive
  ctx.grassMaterial.emissiveIntensity = emissive

  const treeShadows = t > 0.4
  setShadowRoots(ctx.shadowRoots, treeShadows, treeShadows)

  const flat = t < 0.35
  ctx.dirtMaterial.flatShading = flat
  ctx.grassMaterial.flatShading = flat

  const wantTextures = t >= TEXTURED_MIN_T
  let dirtMap = ctx.dirtMap
  let grassMap = ctx.grassMap

  if (!wantTextures) {
    if (texturesEnabled) {
      texturesEnabled = false
      applyFlatTerrainMaterials(ctx)
    }
    return { dirtMap, grassMap }
  }

  const textureSize = pow2Size(t, 64, 256)
  const useMipmaps = t > 0.55

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

  return { dirtMap, grassMap }
}
