import * as THREE from 'three'

/** Warm metallic mid-tone for gold ore / gold blocks. */
export const GOLD_MID = 0xd4a82a
/** Soft fill so shaded faces stay readable. */
export const GOLD_DARK = 0x3a2a0c

const DEFAULT_SIZE = 128
const TILE_PERIOD = 32

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

function wrap(n: number) {
  return ((n % TILE_PERIOD) + TILE_PERIOD) % TILE_PERIOD
}

function valueNoise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = fade(xf)
  const v = fade(yf)
  const a = hash01(wrap(xi), wrap(yi))
  const b = hash01(wrap(xi + 1), wrap(yi))
  const c = hash01(wrap(xi), wrap(yi + 1))
  const d = hash01(wrap(xi + 1), wrap(yi + 1))
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

function fbm(x: number, y: number, octaves: number) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq)
    freq *= 2
    norm += amp
    amp *= 0.5
  }
  return sum / norm
}

function clampByte(v: number) {
  return Math.min(255, Math.max(0, Math.round(v)))
}

function mix3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Organic gold albedo — warm nugget mottling, no grid or streak tiling. */
export function createGoldAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data

  const deep: [number, number, number] = [110, 72, 14]
  const mid: [number, number, number] = [212, 168, 42]
  const bright: [number, number, number] = [255, 232, 140]
  const rose: [number, number, number] = [200, 140, 48]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TILE_PERIOD
      const v = (y / size) * TILE_PERIOD
      const patch = fbm(u * 0.2 + 4.1, v * 0.2 + 9.6, 4)
      const swirl = fbm(u * 0.48 + 18.0, v * 0.48 + 2.7, 3)
      const grain = fbm(u * 1.5 + 6.2, v * 1.5 + 13.4, 2)
      const speck = valueNoise(u * 3.2 + 1.8, v * 3.2 + 7.9)

      let rgb = mix3(deep, mid, THREE.MathUtils.clamp(patch * 1.35, 0, 1))
      rgb = mix3(rgb, bright, THREE.MathUtils.clamp((swirl - 0.56) * 2.5, 0, 1) * 0.6)
      rgb = mix3(rgb, rose, THREE.MathUtils.clamp((patch - 0.45) * 1.4, 0, 1) * 0.28)

      const grainShade = (grain - 0.5) * 20
      rgb = [rgb[0] + grainShade, rgb[1] + grainShade * 0.9, rgb[2] + grainShade * 0.55]

      if (speck > 0.88) {
        const spark = (speck - 0.88) / 0.12
        rgb = mix3(rgb, bright, spark * 0.75)
      } else if (speck < 0.1) {
        rgb = mix3(rgb, deep, ((0.1 - speck) / 0.1) * 0.4)
      }

      const i = (y * size + x) * 4
      data[i] = clampByte(rgb[0])
      data[i + 1] = clampByte(rgb[1])
      data[i + 2] = clampByte(rgb[2])
      data[i + 3] = 255
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
