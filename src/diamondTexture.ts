import * as THREE from 'three'

/** Soft diamond-block cyan mid-tone. */
export const DIAMOND_MID = 0x5aeee4
/** Deep teal for shaded / break debris. */
export const DIAMOND_DARK = 0x0a5a5c

const DEFAULT_SIZE = 128

/**
 * 16×16 diamond ore face — stone matrix with bright cyan crystal flecks.
 * Reads clearly underground (not glassy / clear).
 *
 * Palette: S stone, D deep stone, R rock rim, C crystal mid, B bright, L light, H highlight
 */
const TILE = [
  'RRRRRRRRRRRRRRRR',
  'RSSSDSSSCCSDSSSR',
  'RSDSSSCCBBCCSSDR',
  'RSSSCCBBHHBBCCSR',
  'RDSSCBBHHHBBCSRR',
  'RSSSCBBLLLBBCCSR',
  'RSSSCCBLLLBBCCDR',
  'RSDSSCCBBBBCCSSR',
  'RSSSDSSSCCSSSDSR',
  'RSSSCCBBHHBBCCSR',
  'RDSSCBBHHHBBCSRR',
  'RSSSCBBLLLBBCCSR',
  'RSSSCCBLLLBBCCDR',
  'RSDSSCCBBBBCCSSR',
  'RSSSDSSSCCSSSDSR',
  'RRRRRRRRRRRRRRRR',
]

const PALETTE: Record<string, [number, number, number]> = {
  R: [72, 68, 62],
  S: [98, 94, 86],
  D: [58, 54, 48],
  C: [56, 210, 200],
  B: [90, 238, 228],
  L: [150, 248, 240],
  H: [220, 255, 250],
}

function clampByte(v: number) {
  return Math.min(255, Math.max(0, Math.round(v)))
}

/**
 * Diamond ore albedo — stone with bright cyan crystals (nearest-upscaled 16×16).
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
      const rgb = PALETTE[key] ?? PALETTE.S!

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
