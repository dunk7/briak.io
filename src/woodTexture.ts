import * as THREE from 'three'

const DEFAULT_SIZE = 256
const TILE_PERIOD = 64
/** Plank boards per texture tile (horizontal bands in image space). */
const PLANKS_PER_TILE = 4

/** Representative oak tone; matches placed wood blocks and break debris. */
export const WOOD_MID = 0x5c3a22

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

function makeTexture(image: ImageData, size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

/** Tileable oak planks: board bands, end-grain seams, and lengthwise grain. */
export function createWoodPlankAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data

  const seam: [number, number, number] = [36, 22, 12]
  const dark: [number, number, number] = [58, 36, 20]
  const mid: [number, number, number] = [92, 58, 34]
  const light: [number, number, number] = [118, 76, 46]
  const highlight: [number, number, number] = [132, 88, 52]

  const plankSpan = TILE_PERIOD / PLANKS_PER_TILE

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TILE_PERIOD
      const v = (y / size) * TILE_PERIOD

      const plankFrac = ((v % plankSpan) + plankSpan) % plankSpan
      const plankId = Math.floor(v / plankSpan)
      const plankT = plankFrac / plankSpan
      const plankHue = hash01(plankId, 17) * 0.5 + 0.25

      const seamDist = Math.min(plankFrac, plankSpan - plankFrac)
      const seamT = THREE.MathUtils.clamp(1 - seamDist / 0.22, 0, 1)

      let rgb = mix3(dark, mid, plankHue)
      rgb = mix3(rgb, light, THREE.MathUtils.clamp((plankHue - 0.45) * 2.4, 0, 1))
      if (plankT > 0.72) rgb = mix3(rgb, highlight, (plankT - 0.72) / 0.28)

      const ring = fbm(u * 0.12 + plankId * 1.7, v * 0.9 + 4.2, 2)
      const grain = fbm(u * 2.4 + plankId * 3.1, v * 0.08 + 9.5, 3)
      const fine = valueNoise(u * 6.5 + plankId, v * 0.25 + 2.1)
      const grainShade = (grain - 0.5) * 22 + (fine - 0.5) * 8 + (ring - 0.5) * 10
      rgb = [
        rgb[0] + grainShade,
        rgb[1] + grainShade * 0.88,
        rgb[2] + grainShade * 0.72,
      ]

      if (seamT > 0) rgb = mix3(rgb, seam, seamT * seamT)

      const knot = fbm(u * 0.35 + 11.2, v * 0.35 + plankId * 2.3, 2)
      if (knot > 0.82) {
        rgb = mix3(rgb, dark, ((knot - 0.82) / 0.18) * 0.55)
      }

      const h = hash2(x, y)
      if ((h & 255) < 5) {
        rgb = mix3(rgb, light, 0.2 + (h & 15) / 31)
      }

      const i = (y * size + x) * 4
      data[i] = clampByte(rgb[0])
      data[i + 1] = clampByte(rgb[1])
      data[i + 2] = clampByte(rgb[2])
      data[i + 3] = 255
    }
  }
  return makeTexture(image, size)
}
