import * as THREE from 'three'

const DEFAULT_SIZE = 128

/** midBrown — representative soil tone; matches procedural albedo palette below. */
export const DIRT_MID = 0x76583a
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

function valueNoise2(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = fade(xf)
  const v = fade(yf)
  const a = hash01(xi, yi)
  const b = hash01(xi + 1, yi)
  const c = hash01(xi, yi + 1)
  const d = hash01(xi + 1, yi + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

function fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq)
    freq *= lacunarity
    norm += amp
    amp *= gain
  }
  return sum / norm
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

/** Bumpy soil relief: broad patches, clods, and fine grain. High-quality only. */
export function createDirtNormalMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const height = buildHeightField(size, (u, v) => {
    const patch = fbmT(u * 5.5, v * 5.5, 4)
    const clump = fbmT(u * 14 + 3.7, v * 14 + 11.2, 3)
    const grain = fbmT(u * 40 + 1.2, v * 40 + 6.8, 2)
    return patch * 0.5 + clump * 0.34 + grain * 0.16
  })
  return heightFieldToNormalMap(height, size, size * 0.028)
}

/** Soft turf relief: tuft mounds plus faint vertical blade striations. */
export function createGrassNormalMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const height = buildHeightField(size, (u, v) => {
    const tuft = fbmT(u * 9 + 1.5, v * 9 + 7.3, 3)
    const macro = fbmT(u * 4 + 4.2, v * 4 + 12.8, 2)
    // Faint near-vertical striations read as blade direction under raking light.
    const blade =
      valueNoise2T(u * 26 + v * 3, v * 60 - u * 2) * 0.5 +
      valueNoise2T(u * 30 - v * 2, v * 72 + u * 4) * 0.5
    return macro * 0.34 + tuft * 0.46 + blade * 0.2
  })
  return heightFieldToNormalMap(height, size, size * 0.016)
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
    const grain = fbmT(u * 36 + 2.5, v * 36 + 9.1, 2)
    return 0.74 + patch * 0.2 + (grain - 0.5) * 0.12
  })
}

/** Subtle sheen variation between turf clumps. */
export function createGrassRoughnessMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  return roughnessMapFromFill(size, (u, v) => {
    const tuft = fbmT(u * 10 + 1.5, v * 10 + 7.3, 3)
    return 0.62 + tuft * 0.26
  })
}

export function invalidateGrassAlbedoCache() {
  grassAlbedoCache?.dispose()
  grassAlbedoCache = null
}

/** Procedural tiled dirt — layered soil tones, clumps, and mineral flecks. */
export function createDirtAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data

  const darkLoam = rgb(DIRT_DARK)
  const midBrown = rgb(DIRT_MID)
  const warmClay: [number, number, number] = [138, 82, 52]
  const drySand: [number, number, number] = [168, 132, 88]
  const pebble: [number, number, number] = [108, 102, 94]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size

      const patch = fbm(u * 5.5 + 17.3, v * 5.5 + 9.1, 4, 2.1, 0.52)
      const clump = fbm(u * 14 + 3.7, v * 14 + 11.2, 3, 2.0, 0.48)
      const grain = fbm(u * 38 + 1.2, v * 38 + 6.8, 2, 2.3, 0.42)
      const streak = valueNoise2(u * 24 + v * 6, v * 18 - u * 4)

      let rgb: [number, number, number]
      if (patch < 0.38) {
        rgb = mix3(darkLoam, midBrown, patch / 0.38)
      } else if (patch < 0.62) {
        rgb = mix3(midBrown, warmClay, (patch - 0.38) / 0.24)
      } else {
        rgb = mix3(warmClay, drySand, (patch - 0.62) / 0.38)
      }

      const clumpShade = (clump - 0.5) * 28
      const grainShade = (grain - 0.5) * 14
      const streakShade = (streak - 0.5) * 10
      rgb = [
        rgb[0] + clumpShade + grainShade + streakShade,
        rgb[1] + clumpShade * 0.92 + grainShade * 0.88 + streakShade * 0.9,
        rgb[2] + clumpShade * 0.78 + grainShade * 0.72 + streakShade * 0.7,
      ]

      const h = hash2(x, y)
      if ((h & 255) < 9) {
        rgb = mix3(rgb, pebble, 0.55 + (h & 15) / 31)
      } else if ((h & 255) < 22) {
        rgb = mix3(rgb, darkLoam, 0.35 + (h & 7) / 14)
      } else if ((h & 255) > 248) {
        rgb = mix3(rgb, drySand, 0.25)
      }

      const i = (y * size + x) * 4
      data[i] = clampByte(Math.max(52, rgb[0]))
      data[i + 1] = clampByte(Math.max(40, rgb[1]))
      data[i + 2] = clampByte(Math.max(28, rgb[2]))
      data[i + 3] = 255
    }
  }

  return createCanvasTextureFromImageData(image, size)
}

/** Representative turf tone; matches `grassMaterial` base in main. */
export const GRASS_MID = 0x58a042

let grassAlbedoCache: THREE.CanvasTexture | null = null

/** Procedural grass — tileable, smooth turf; precomputed layers, no soil peek. */
export function createGrassAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  if (grassAlbedoCache && size === DEFAULT_SIZE) return grassAlbedoCache

  const n = size * size
  const macro = new Float32Array(n)
  const tuft = new Float32Array(n)
  const blade = new Float32Array(n)

  fillNoiseLayer(macro, size, 4, 3, 4.2, 12.8)
  fillNoiseLayer(tuft, size, 10, 2, 1.5, 7.3)

  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const streak =
        (valueNoise2T(u * 32 + v * 4, v * 32 - u * 2) +
          valueNoise2T(u * 28 - v * 3, v * 30 + u * 5)) *
        0.5
      blade[y * size + x] = streak
    }
  }

  const image = new ImageData(size, size)
  const data = image.data

  const shadowGreen: [number, number, number] = [62, 118, 50]
  const turfGreen: [number, number, number] = [82, 148, 62]
  const brightGreen: [number, number, number] = [96, 162, 68]
  const sunTip: [number, number, number] = [108, 172, 72]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x
      const patch = macro[idx] * 0.82 + tuft[idx] * 0.18
      const t = smoothstep(0.22, 0.78, patch)

      let rgb = mix3(
        mix3(shadowGreen, turfGreen, smoothstep(0, 0.55, t)),
        mix3(brightGreen, sunTip, smoothstep(0.45, 1, t)),
        smoothstep(0.35, 0.88, t),
      )

      const tuftShade = (tuft[idx] - 0.5) * 14
      const bladeShade = (blade[idx] - 0.5) * 12
      rgb = [
        rgb[0] + tuftShade * 0.5 + bladeShade * 0.35,
        rgb[1] + tuftShade + bladeShade * 0.75,
        rgb[2] + tuftShade * 0.7 + bladeShade * 0.5,
      ]

      const i = idx * 4
      data[i] = clampByte(rgb[0])
      data[i + 1] = clampByte(rgb[1])
      data[i + 2] = clampByte(rgb[2])
      data[i + 3] = 255
    }
  }

  const map = createCanvasTextureFromImageData(image, size)
  if (size === DEFAULT_SIZE) grassAlbedoCache = map
  return map
}
