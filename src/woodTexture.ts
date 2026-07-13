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

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
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

/** Oak plank base tones — four bands like Minecraft oak_planks. */
const PLANK_BASES: [number, number, number][] = [
  [154, 118, 72],
  [142, 106, 64],
  [148, 112, 68],
  [136, 100, 60],
]

/** Tileable oak planks: sharp seams, per-board color, vertical grain streaks. */
export function createWoodPlankAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data

  const seamDark: [number, number, number] = [32, 20, 11]
  const seamMid: [number, number, number] = [48, 30, 16]
  const highlight: [number, number, number] = [178, 138, 86]
  const grainDark: [number, number, number] = [98, 62, 36]
  const knotDark: [number, number, number] = [52, 34, 18]

  const plankSpan = TILE_PERIOD / PLANKS_PER_TILE
  const seamWidth = plankSpan * 0.045

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TILE_PERIOD
      const v = (y / size) * TILE_PERIOD

      const plankFrac = ((v % plankSpan) + plankSpan) % plankSpan
      const plankId = Math.floor(v / plankSpan) % PLANKS_PER_TILE
      const plankT = plankFrac / plankSpan

      const baseIdx = plankId ^ (Math.floor(u / plankSpan) & 1)
      let rgb: [number, number, number] = [...PLANK_BASES[baseIdx % PLANK_BASES.length]]

      const plankJitter = hash01(plankId, Math.floor(u * 0.25)) * 0.14 - 0.07
      rgb = mix3(rgb, highlight, plankJitter * 0.35 + 0.02)

      const topEdge = 1 - smoothstep(0, 0.1, plankT)
      const bottomEdge = smoothstep(0.88, 1, plankT)
      rgb = mix3(rgb, highlight, topEdge * 0.22)
      rgb = mix3(rgb, grainDark, bottomEdge * 0.18)

      const col = Math.floor(u * 6.2 + plankId * 1.3)
      const colShade = hash01(col, plankId * 19) * 0.16 - 0.08
      rgb = [
        rgb[0] * (1 + colShade),
        rgb[1] * (1 + colShade * 0.92),
        rgb[2] * (1 + colShade * 0.78),
      ]

      const wave = Math.sin(v * 0.55 + hash01(plankId, 7) * Math.PI * 2) * 0.35
      const grainU = u + wave
      const streak = valueNoise(grainU * 2.8 + plankId * 4.1, v * 0.06 + 3.7)
      const streak2 = valueNoise(grainU * 5.5 + plankId, v * 0.03 + 9.2)
      const grainShade = (streak - 0.5) * 20 + (streak2 - 0.5) * 10
      rgb = [
        rgb[0] + grainShade,
        rgb[1] + grainShade * 0.9,
        rgb[2] + grainShade * 0.72,
      ]

      const seamDist = Math.min(plankFrac, plankSpan - plankFrac)
      if (seamDist < seamWidth) {
        const seamT = 1 - seamDist / seamWidth
        const seamColor = mix3(seamMid, seamDark, seamT * seamT)
        rgb = mix3(rgb, seamColor, smoothstep(0, 1, seamT))
      }

      const knot = valueNoise(u * 0.28 + plankId * 5.1, v * 0.28 + 11.4)
      if (knot > 0.86) {
        rgb = mix3(rgb, knotDark, ((knot - 0.86) / 0.14) * 0.5)
      }

      const h = hash2(x, y)
      if ((h & 255) < 4) {
        rgb = mix3(rgb, highlight, 0.15 + (h & 15) / 60)
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
