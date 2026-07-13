import * as THREE from 'three'

const DEFAULT_SIZE = 128

/** midBrown — representative soil tone; matches procedural albedo palette below. */
export const DIRT_MID = 0x7a5e40
/** Texture repeats per voxel face (must match `dirtMap.repeat` in main). */
export const DIRT_TEXTURE_REPEAT = 3
/** darkLoam — shadow fill for dirt materials (emissive). */
export const DIRT_DARK = 0x4e3828

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

function hash2(x: number, y: number) {
  let n = x * 374761393 + y * 668265263
  n = (n ^ (n >> 13)) * 1274126177
  return (n ^ (n >> 16)) >>> 0
}

function hash01(x: number, y: number) {
  return hash2(x, y) / 4294967295
}

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

const TILE_PERIOD = 32

function wrapTile(n: number) {
  return ((n % TILE_PERIOD) + TILE_PERIOD) % TILE_PERIOD
}

/** Tileable value noise — seams match at texture repeat boundaries. */
function valueNoise2T(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = fade(xf)
  const v = fade(yf)
  const a = hash01(wrapTile(xi), wrapTile(yi))
  const b = hash01(wrapTile(xi + 1), wrapTile(yi))
  const c = hash01(wrapTile(xi), wrapTile(yi + 1))
  const d = hash01(wrapTile(xi + 1), wrapTile(yi + 1))
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

function fbmT(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2T(x * freq, y * freq)
    freq *= lacunarity
    norm += amp
    amp *= gain
  }
  return sum / norm
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function fillNoiseLayer(
  out: Float32Array,
  size: number,
  scale: number,
  octaves: number,
  offsetX: number,
  offsetY: number,
) {
  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      out[y * size + x] = fbmT(u * scale + offsetX, v * scale + offsetY, octaves)
    }
  }
}

function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function clampByte(v: number) {
  return Math.min(255, Math.max(0, Math.round(v)))
}

function createCanvasTextureFromImageData(
  image: ImageData,
  size: number,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(image, 0, 0)

  const map = new THREE.CanvasTexture(canvas)
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.colorSpace = colorSpace
  map.minFilter = THREE.LinearFilter
  map.magFilter = THREE.LinearFilter
  map.generateMipmaps = false
  map.needsUpdate = true
  return map
}

/** Tiled value-noise height field, normalized to [0, 1], wraps at TILE_PERIOD. */
function buildHeightField(
  size: number,
  fill: (u: number, v: number) => number,
): Float32Array {
  const out = new Float32Array(size * size)
  let min = Infinity
  let max = -Infinity
  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const h = fill(x / size, v)
      out[y * size + x] = h
      if (h < min) min = h
      if (h > max) max = h
    }
  }
  const range = max - min || 1
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range
  return out
}

/**
 * Convert a tileable height field into a tangent-space normal map. Slopes are
 * derived from wrapped central differences so the result tiles seamlessly.
 */
function heightFieldToNormalMap(
  height: Float32Array,
  size: number,
  strength: number,
): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength
      const len = Math.sqrt(dx * dx + dy * dy + 1)
      const i = (y * size + x) * 4
      data[i] = clampByte(((dx / len) * 0.5 + 0.5) * 255)
      data[i + 1] = clampByte(((dy / len) * 0.5 + 0.5) * 255)
      data[i + 2] = clampByte(((1 / len) * 0.5 + 0.5) * 255)
      data[i + 3] = 255
    }
  }
  return createCanvasTextureFromImageData(image, size, THREE.NoColorSpace)
}

/** Bumpy soil relief: broad patches, clods, and soft hollows. */
export function createDirtNormalMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const height = buildHeightField(size, (u, v) => {
    const patch = fbmT(u * 5.5, v * 5.5, 4)
    const clump = fbmT(u * 14 + 3.7, v * 14 + 11.2, 4)
    const grain = fbmT(u * 36 + 1.2, v * 36 + 6.8, 2)
    const hollow = fbmT(u * 12 + 4.0, v * 12 + 9.0, 3)
    let h = patch * 0.44 + clump * 0.4 + grain * 0.16
    if (hollow < 0.35) h -= (0.35 - hollow) * 0.9
    return h
  })
  return heightFieldToNormalMap(height, size, size * 0.032)
}

/** Turf relief: tuft mounds plus anisotropic blade striations. */
export function createGrassNormalMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const height = buildHeightField(size, (u, v) => {
    const tuft = fbmT(u * 11 + 1.5, v * 11 + 7.3, 4)
    const macro = fbmT(u * 4.5 + 4.2, v * 4.5 + 12.8, 3)
    // Near-vertical striations read as blade direction under raking light.
    const blade =
      valueNoise2T(u * 34 + v * 4, v * 78 - u * 3) * 0.45 +
      valueNoise2T(u * 42 - v * 3, v * 96 + u * 5) * 0.35 +
      valueNoise2T(u * 22 + v * 2, v * 52 - u * 1) * 0.2
    return macro * 0.28 + tuft * 0.48 + blade * 0.24
  })
  return heightFieldToNormalMap(height, size, size * 0.022)
}

/** Grayscale roughness map (G channel) tiled to match the albedo noise. */
function roughnessMapFromFill(
  size: number,
  fill: (u: number, v: number) => number,
): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data
  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const r = clampByte(THREE.MathUtils.clamp(fill(x / size, v), 0, 1) * 255)
      const i = (y * size + x) * 4
      data[i] = r
      data[i + 1] = r
      data[i + 2] = r
      data[i + 3] = 255
    }
  }
  return createCanvasTextureFromImageData(image, size, THREE.NoColorSpace)
}

/** Damp clay patches read glossier; dry crumbs stay matte. */
export function createDirtRoughnessMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  return roughnessMapFromFill(size, (u, v) => {
    const patch = fbmT(u * 5.5, v * 5.5, 4)
    const grain = fbmT(u * 40 + 2.5, v * 40 + 9.1, 2)
    const damp = fbmT(u * 8 + 6.1, v * 8 + 2.4, 3)
    return 0.7 + patch * 0.18 + (grain - 0.5) * 0.1 - (damp - 0.5) * 0.08
  })
}

/** Subtle sheen variation between turf clumps and blade streaks. */
export function createGrassRoughnessMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  return roughnessMapFromFill(size, (u, v) => {
    const tuft = fbmT(u * 11 + 1.5, v * 11 + 7.3, 3)
    const blade = valueNoise2T(u * 36 + v * 3, v * 80 - u * 2)
    return 0.58 + tuft * 0.28 + (blade - 0.5) * 0.08
  })
}

export function invalidateGrassAlbedoCache() {
  grassAlbedoCache?.dispose()
  grassAlbedoCache = null
}

/** Procedural tiled dirt — layered soil, clods, mineral flecks, and soft cracks. */
export function createDirtAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data

  const darkLoam = rgb(DIRT_DARK)
  const midBrown = rgb(DIRT_MID)
  const warmClay: [number, number, number] = [138, 82, 50]
  const richUmber: [number, number, number] = [92, 58, 36]
  const drySand: [number, number, number] = [158, 124, 86]
  const pebble: [number, number, number] = [108, 100, 90]
  const mossFleck: [number, number, number] = [62, 88, 42]
  const rootStreak: [number, number, number] = [58, 42, 28]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size

      // Tileable layers so repeats don't seam.
      const patch = fbmT(u * 5.5 + 17.3, v * 5.5 + 9.1, 4, 2.1, 0.52)
      const clump = fbmT(u * 14 + 3.7, v * 14 + 11.2, 4, 2.0, 0.5)
      const grain = fbmT(u * 36 + 1.2, v * 36 + 6.8, 2, 2.2, 0.45)
      const clayVein = fbmT(u * 8 + 8.4, v * 8 + 2.1, 3, 2.05, 0.5)
      const streak = valueNoise2T(u * 22 + v * 5, v * 18 - u * 4)
      // Soft damp hollows instead of a hard crack lattice.
      const hollow = fbmT(u * 12 + 4.0, v * 12 + 9.0, 3)

      let rgb: [number, number, number]
      if (patch < 0.38) {
        rgb = mix3(darkLoam, richUmber, patch / 0.38)
      } else if (patch < 0.62) {
        rgb = mix3(richUmber, midBrown, (patch - 0.38) / 0.24)
      } else if (patch < 0.82) {
        rgb = mix3(midBrown, warmClay, (patch - 0.62) / 0.2)
      } else {
        // Keep dry sand rare so soil stays rich rather than chalky.
        rgb = mix3(warmClay, drySand, ((patch - 0.82) / 0.18) * 0.55)
      }

      // Clay veins — warmer orange-brown ribbons through the loam.
      const clayAmt = smoothstep(0.6, 0.8, clayVein) * 0.32
      rgb = mix3(rgb, warmClay, clayAmt)

      // Soft clod shading — mid-frequency structure, not salt-and-pepper.
      const clumpShade = (clump - 0.5) * 30
      const grainShade = (grain - 0.5) * 10
      const streakShade = (streak - 0.5) * 8
      rgb = [
        rgb[0] + clumpShade + grainShade + streakShade,
        rgb[1] + clumpShade * 0.88 + grainShade * 0.82 + streakShade * 0.85,
        rgb[2] + clumpShade * 0.68 + grainShade * 0.62 + streakShade * 0.6,
      ]

      // Damp hollows — deepen loam pockets without a cellular crack grid.
      if (hollow < 0.32) {
        rgb = mix3(rgb, rootStreak, (0.32 - hollow) * 0.7)
      }

      // Sparse rootlet streaks.
      if (streak > 0.86 && clump < 0.38) {
        rgb = mix3(rgb, rootStreak, (streak - 0.86) * 1.2)
      }

      const h = hash2(x, y)
      const fleck = h & 255
      if (fleck < 6) {
        rgb = mix3(rgb, pebble, 0.4 + (h & 15) / 40)
      } else if (fleck < 22) {
        rgb = mix3(rgb, darkLoam, 0.28 + (h & 7) / 18)
      } else if (fleck > 251) {
        rgb = mix3(rgb, drySand, 0.2)
      } else if (fleck > 244) {
        rgb = mix3(rgb, mossFleck, 0.2)
      }

      const i = (y * size + x) * 4
      data[i] = clampByte(Math.max(48, rgb[0]))
      data[i + 1] = clampByte(Math.max(36, rgb[1]))
      data[i + 2] = clampByte(Math.max(24, rgb[2]))
      data[i + 3] = 255
    }
  }

  return createCanvasTextureFromImageData(image, size)
}

/** Representative turf tone; matches `grassMaterial` base in main. */
export const GRASS_MID = 0x58a042

let grassAlbedoCache: THREE.CanvasTexture | null = null

/** Procedural grass — tileable turf with blade streaks, hue shifts, and micro flecks. */
export function createGrassAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  if (grassAlbedoCache && size === DEFAULT_SIZE) return grassAlbedoCache

  const n = size * size
  const macro = new Float32Array(n)
  const tuft = new Float32Array(n)
  const blade = new Float32Array(n)
  const hue = new Float32Array(n)

  fillNoiseLayer(macro, size, 4.5, 4, 4.2, 12.8)
  fillNoiseLayer(tuft, size, 10, 3, 1.5, 7.3)
  fillNoiseLayer(hue, size, 3.2, 3, 15.6, 2.4)

  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      // Strong anisotropic streaks — denser vertical frequency reads as blades.
      const streak =
        valueNoise2T(u * 42 + v * 6, v * 96 - u * 4) * 0.45 +
        valueNoise2T(u * 56 - v * 5, v * 120 + u * 7) * 0.35 +
        valueNoise2T(u * 28 + v * 3, v * 64 - u * 2) * 0.2
      blade[y * size + x] = streak
    }
  }

  const image = new ImageData(size, size)
  const data = image.data

  // Keep turf bright enough that PBR + fog never reads as black grass.
  const deepShade: [number, number, number] = [40, 88, 36]
  const coolShadow: [number, number, number] = [46, 104, 56]
  const shadowGreen: [number, number, number] = [54, 118, 46]
  const turfGreen: [number, number, number] = [70, 146, 52]
  const brightGreen: [number, number, number] = [92, 166, 60]
  const sunTip: [number, number, number] = [114, 182, 70]
  const warmMeadow: [number, number, number] = [104, 154, 50]
  const dryBlade: [number, number, number] = [136, 142, 56]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      const patch = macro[idx] * 0.58 + tuft[idx] * 0.42
      const t = smoothstep(0.14, 0.86, patch)

      let rgb = mix3(
        mix3(deepShade, shadowGreen, smoothstep(0, 0.42, t)),
        mix3(turfGreen, brightGreen, smoothstep(0.32, 0.88, t)),
        smoothstep(0.24, 0.76, t),
      )

      // Cool blue-green pockets vs warm meadow patches.
      const hueShift = hue[idx] - 0.5
      if (hueShift < -0.08) {
        rgb = mix3(rgb, coolShadow, (-hueShift - 0.08) * 1.5)
      } else if (hueShift > 0.1) {
        rgb = mix3(rgb, warmMeadow, (hueShift - 0.1) * 1.3)
      }

      // Sparse sun tips — keep highlights rare so turf stays saturated.
      if (t > 0.78) {
        rgb = mix3(rgb, sunTip, smoothstep(0.78, 1, t) * 0.55)
      }

      // Blade streaks dominate mid-frequency detail (directional, not speckly).
      const tuftShade = (tuft[idx] - 0.5) * 16
      const bladeShade = (blade[idx] - 0.5) * 28
      rgb = [
        rgb[0] + tuftShade * 0.35 + bladeShade * 0.32,
        rgb[1] + tuftShade * 1.05 + bladeShade * 1.05,
        rgb[2] + tuftShade * 0.45 + bladeShade * 0.4,
      ]

      // Bright blade ridges / dark interstices.
      if (blade[idx] > 0.62 && t > 0.4) {
        rgb = mix3(rgb, sunTip, (blade[idx] - 0.62) * 0.7)
      } else if (blade[idx] < 0.36) {
        rgb = mix3(rgb, deepShade, (0.36 - blade[idx]) * 0.55)
      }

      const h = hash2(x + 17, y + 31)
      const fleck = h & 255
      if (fleck < 5) {
        rgb = mix3(rgb, dryBlade, 0.24 + (h & 7) / 28)
      } else if (fleck > 251) {
        rgb = mix3(rgb, deepShade, 0.24)
      }

      const i = idx * 4
      data[i] = clampByte(Math.max(38, rgb[0]))
      data[i + 1] = clampByte(Math.max(70, rgb[1]))
      data[i + 2] = clampByte(Math.max(32, rgb[2]))
      data[i + 3] = 255
    }
  }

  const map = createCanvasTextureFromImageData(image, size)
  if (size === DEFAULT_SIZE) grassAlbedoCache = map
  return map
}
