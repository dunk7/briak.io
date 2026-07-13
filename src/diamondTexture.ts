import * as THREE from 'three'

/** Soft diamond-block cyan mid-tone. */
export const DIAMOND_MID = 0x5aeee4
/** Deep teal for shaded / break debris. */
export const DIAMOND_DARK = 0x0a5a5c

const DEFAULT_SIZE = 128

/**
 * 16×16 diamond face — mostly cyan gem pixels with soft light/dark speckles.
 * No heavy vein lines.
 *
 * Palette: X rim, D soft shade, M mid, B bright, L light, H highlight
 */
const TILE = [
  'XXXXXXXXXXXXXXXX',
  'XHHLLBBMMBBLHHHX',
  'XHLLBBMMMBBLLHHX',
  'XLLBBMMM MBBLLHX',
  'XLBBMMMMMMBBLLLX',
  'XBBMMMMMMMBBBLLX',
  'XBMMMMMMMMMBBBLX',
  'XMMMMLMMMMMMBBBX',
  'XMMMLLLMMMMMBBBX',
  'XMMLLLLMMMMMBBBX',
  'XMLLLLLMMM MBBBX',
  'XLLLLBBMMM MBBBX',
  'XLLLBBMMMMMBBLDX',
  'XLHHBBMMMMBBLLDX',
  'XHHHLLBBBBLLDDDX',
  'XXXXXXXXXXXXXXXX',
].map((row) => row.replace(/ /g, 'M'))

const PALETTE: Record<string, [number, number, number]> = {
  X: [18, 120, 118],
  D: [48, 180, 174],
  M: [90, 238, 228],
  B: [120, 244, 234],
  L: [170, 250, 242],
  H: [230, 255, 250],
}

function clampByte(v: number) {
  return Math.min(255, Math.max(0, Math.round(v)))
}

/**
 * Diamond block albedo — soft cyan pixel mottling, no dark vein stripes.
 * Nearest-neighbor upscaled from a 16×16 pixel pattern.
 */
export function createDiamondAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data
  const cell = size / 16

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = Math.min(15, Math.floor(x / cell))
      const py = Math.min(15, Math.floor(y / cell))
      const key = TILE[py]![px]!
      const rgb = PALETTE[key] ?? PALETTE.M!

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
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
