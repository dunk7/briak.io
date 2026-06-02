import * as THREE from 'three'

const DEFAULT_SIZE = 256
const TILE_PERIOD = 64

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

/** Ridged noise → 1 near crests; thresholded into thin dark crack lines. */
function ridged(x: number, y: number, octaves: number) {
  return 1 - Math.abs(fbm(x, y, octaves) * 2 - 1)
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

function makeTexture(
  image: ImageData,
  size: number,
  colorSpace: THREE.ColorSpace,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')!.putImageData(image, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = colorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

/** Mottled granite: cool/warm grey patches, mineral flecks, dark fissures. */
export function createRockAlbedoMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const image = new ImageData(size, size)
  const data = image.data

  const darkStone: [number, number, number] = [70, 70, 76]
  const midStone: [number, number, number] = [120, 120, 126]
  const lightStone: [number, number, number] = [168, 166, 162]
  const warmStone: [number, number, number] = [140, 128, 116]
  const crackColor: [number, number, number] = [44, 44, 50]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TILE_PERIOD
      const v = (y / size) * TILE_PERIOD
      const patch = fbm(u * 0.18 + 3.1, v * 0.18 + 8.7, 4)
      const warm = fbm(u * 0.32 + 21.4, v * 0.32 + 5.2, 3)
      const grain = fbm(u * 1.1 + 1.7, v * 1.1 + 12.4, 2)

      let rgb = mix3(darkStone, midStone, THREE.MathUtils.clamp(patch * 1.4, 0, 1))
      rgb = mix3(rgb, lightStone, THREE.MathUtils.clamp((patch - 0.55) * 2.2, 0, 1))
      rgb = mix3(rgb, warmStone, THREE.MathUtils.clamp((warm - 0.62) * 1.8, 0, 1) * 0.5)

      const grainShade = (grain - 0.5) * 26
      rgb = [rgb[0] + grainShade, rgb[1] + grainShade, rgb[2] + grainShade]

      const crack = ridged(u * 0.5 + 4.0, v * 0.5 + 9.0, 3)
      if (crack > 0.86) {
        rgb = mix3(rgb, crackColor, (crack - 0.86) / 0.14)
      }

      const h = hash2(x, y)
      if ((h & 255) < 6) {
        const fleck = 30 + (h & 31)
        rgb = [rgb[0] + fleck, rgb[1] + fleck, rgb[2] + fleck]
      }

      const i = (y * size + x) * 4
      data[i] = clampByte(rgb[0])
      data[i + 1] = clampByte(rgb[1])
      data[i + 2] = clampByte(rgb[2])
      data[i + 3] = 255
    }
  }
  return makeTexture(image, size, THREE.SRGBColorSpace)
}

/** Coarse stone relief with incised crack grooves. */
export function createRockNormalMap(size = DEFAULT_SIZE): THREE.CanvasTexture {
  const height = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TILE_PERIOD
      const v = (y / size) * TILE_PERIOD
      const bumps = fbm(u * 0.35 + 3.1, v * 0.35 + 8.7, 4)
      const grain = fbm(u * 1.3 + 1.7, v * 1.3 + 12.4, 2)
      const crack = ridged(u * 0.5 + 4.0, v * 0.5 + 9.0, 3)
      let h = bumps * 0.72 + grain * 0.28
      if (crack > 0.84) h -= (crack - 0.84) * 3.5
      height[y * size + x] = h
    }
  }

  const image = new ImageData(size, size)
  const data = image.data
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)]
  const strength = size * 0.04
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
  return makeTexture(image, size, THREE.NoColorSpace)
}

const _v = new THREE.Vector3()

/**
 * Box (dominant-axis planar) UVs from local positions, so a tiling stone texture
 * wraps rock meshes that ship without their own UVs. `unitsPerTile` controls scale.
 */
export function assignBoxProjectedUVs(
  geometry: THREE.BufferGeometry,
  unitsPerTile: number,
) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const nor = geometry.getAttribute('normal') as THREE.BufferAttribute
  const scale = 1 / unitsPerTile

  const uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i)
    const ax = Math.abs(nor.getX(i))
    const ay = Math.abs(nor.getY(i))
    const az = Math.abs(nor.getZ(i))
    let u: number
    let v: number
    if (ay >= ax && ay >= az) {
      u = _v.x * scale
      v = _v.z * scale
    } else if (ax >= az) {
      u = _v.z * scale
      v = _v.y * scale
    } else {
      u = _v.x * scale
      v = _v.y * scale
    }
    uv.setXY(i, u, v)
  }
  geometry.setAttribute('uv', uv)
}

/** Flat fill when rock textures are disabled (Potato tier). */
const ROCK_FLAT_COLOR = 0x8e8c94

let sharedRockMaterial: THREE.MeshStandardMaterial | null = null
let rockTexturesEnabled = true

/** Lazily-built shared stone material (albedo + normal), reused across all rocks. */
export function getRockMaterial(): THREE.MeshStandardMaterial {
  if (sharedRockMaterial) return sharedRockMaterial
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createRockAlbedoMap(),
    normalMap: createRockNormalMap(),
    roughness: 0.92,
    metalness: 0.04,
    emissive: 0x14141a,
    emissiveIntensity: 0.28,
  })
  mat.normalScale.set(0.85, 0.85)
  sharedRockMaterial = mat
  if (!rockTexturesEnabled) applyRockTextureState(mat, false)
  return mat
}

function applyRockTextureState(mat: THREE.MeshStandardMaterial, enabled: boolean) {
  if (enabled) {
    if (!mat.map) mat.map = createRockAlbedoMap()
    if (!mat.normalMap) mat.normalMap = createRockNormalMap()
    mat.color.setHex(0xffffff)
  } else {
    mat.map = null
    mat.normalMap = null
    mat.color.setHex(ROCK_FLAT_COLOR)
  }
  mat.needsUpdate = true
}

/** Toggle procedural stone maps (off in Potato graphics). */
export function setRockTexturesEnabled(enabled: boolean) {
  if (enabled === rockTexturesEnabled) return
  rockTexturesEnabled = enabled
  if (sharedRockMaterial) applyRockTextureState(sharedRockMaterial, enabled)
}
