import * as THREE from 'three'

/** Shared wind-phase uniform; advanced once per frame by the game loop. */
export const grassWind = { value: 0 }

export function updateGrassWind(elapsedSeconds: number) {
  grassWind.value = elapsedSeconds
}

const BLADE_HEIGHT = 0.22
const BLADE_BASE_WIDTH = 0.032
const BLADE_TIP_WIDTH = 0.007
/** Two crossed cards are enough at this scale and cost half the verts. */
const CARDS = 2

const TUFT_GEOMETRY_REV = 2
let sharedTuftGeometry: THREE.BufferGeometry | null = null
let sharedTuftGeometryRev = 0
let sharedBladeMaterial: THREE.MeshStandardMaterial | null = null

/** A small fan of tapered cards, vertex-shaded dark→bright from base to tip. */
function getTuftGeometry(): THREE.BufferGeometry {
  if (sharedTuftGeometry && sharedTuftGeometryRev === TUFT_GEOMETRY_REV) {
    return sharedTuftGeometry
  }
  sharedTuftGeometry?.dispose()
  sharedTuftGeometry = null

  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []

  const baseCol = new THREE.Color(0x3a6a28)
  const tipCol = new THREE.Color(0x84d05c)
  const c = new THREE.Color()

  const card = [
    [-BLADE_BASE_WIDTH * 0.5, 0],
    [BLADE_BASE_WIDTH * 0.5, 0],
    [-BLADE_TIP_WIDTH * 0.5, BLADE_HEIGHT],
    [BLADE_TIP_WIDTH * 0.5, BLADE_HEIGHT],
  ]

  let vbase = 0
  for (let cd = 0; cd < CARDS; cd++) {
    const ang = (cd / CARDS) * Math.PI
    const cos = Math.cos(ang)
    const sin = Math.sin(ang)
    for (const [vx, vy] of card) {
      positions.push(vx * cos, vy, vx * sin)
      // Up-biased normals keep blades lit by the sky instead of going black.
      normals.push(0, 1, 0)
      c.copy(baseCol).lerp(tipCol, vy / BLADE_HEIGHT)
      colors.push(c.r, c.g, c.b)
    }
    indices.push(vbase, vbase + 1, vbase + 2, vbase + 1, vbase + 3, vbase + 2)
    vbase += 4
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  sharedTuftGeometry = geo
  sharedTuftGeometryRev = TUFT_GEOMETRY_REV
  return geo
}

function getBladeMaterial(): THREE.MeshStandardMaterial {
  if (sharedBladeMaterial) return sharedBladeMaterial
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0,
    emissive: 0x142e0c,
    emissiveIntensity: 0.22,
  })

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassWind
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float windPhase = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.45;
          float gust = sin(uTime * 1.7 + windPhase) * 0.6 + sin(uTime * 3.1 + windPhase * 1.7) * 0.4;
          float bend = position.y * position.y * 0.9;
          transformed.x += gust * bend;
          transformed.z += gust * bend * 0.4;
        #endif`,
      )
  }
  mat.customProgramCacheKey = () => 'grass-blade'
  sharedBladeMaterial = mat
  return mat
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _ab = new THREE.Vector3()
const _ac = new THREE.Vector3()
const _normal = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _tiltAxis = new THREE.Vector3()
const _scale = new THREE.Vector3()
const _mat = new THREE.Matrix4()
const _up = new THREE.Vector3(0, 1, 0)
const _color = new THREE.Color()

export type GrassBladeOptions = {
  /** Tufts per square metre of grass surface. */
  density: number
  /** Hard cap on instances per chunk (perf guard). */
  maxInstances: number
  /** 0 = even scatter; 1 = tight patches with bare gaps between. */
  clump: number
}

type GrassTriangle = {
  a: THREE.Vector3
  ab: THREE.Vector3
  ac: THREE.Vector3
  area: number
  up: THREE.Vector3
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function hash2(ix: number, iz: number): number {
  let n = ix * 374761393 + iz * 668265263
  n = (n ^ (n >> 13)) * 1274126177
  return ((n ^ (n >> 16)) >>> 0) / 4294967296
}

/** Tileable value noise in world XZ — used to form grassy patches vs bare turf. */
function patchNoise(x: number, z: number, scale: number): number {
  const fx = x / scale
  const fz = z / scale
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const tx = fx - x0
  const tz = fz - z0
  const sx = tx * tx * (3 - 2 * tx)
  const sz = tz * tz * (3 - 2 * tz)
  const n00 = hash2(x0, z0)
  const n10 = hash2(x0 + 1, z0)
  const n01 = hash2(x0, z0 + 1)
  const n11 = hash2(x0 + 1, z0 + 1)
  const nx0 = n00 + (n10 - n00) * sx
  const nx1 = n01 + (n11 - n01) * sx
  const coarse = nx0 + (nx1 - nx0) * sz
  const fine = valueNoiseOctave(x + 41.3, z - 17.8, scale * 0.42)
  return THREE.MathUtils.clamp(coarse * 0.72 + fine * 0.28, 0, 1)
}

function valueNoiseOctave(x: number, z: number, scale: number): number {
  const fx = x / scale
  const fz = z / scale
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const tx = fx - x0
  const tz = fz - z0
  const sx = tx * tx * (3 - 2 * tx)
  const sz = tz * tz * (3 - 2 * tz)
  const n00 = hash2(x0 + 97, z0 + 131)
  const n10 = hash2(x0 + 98, z0 + 131)
  const n01 = hash2(x0 + 97, z0 + 132)
  const n11 = hash2(x0 + 98, z0 + 132)
  const nx0 = n00 + (n10 - n00) * sx
  const nx1 = n01 + (n11 - n01) * sx
  return nx0 + (nx1 - nx0) * sz
}

function sampleOnTriangle(tri: GrassTriangle, target: THREE.Vector3) {
  let r1 = Math.random()
  let r2 = Math.random()
  if (r1 + r2 > 1) {
    r1 = 1 - r1
    r2 = 1 - r2
  }
  return target.copy(tri.a).addScaledVector(tri.ab, r1).addScaledVector(tri.ac, r2)
}

function pickTriangle(triangles: GrassTriangle[], totalArea: number): GrassTriangle {
  let r = Math.random() * totalArea
  for (const tri of triangles) {
    if (r <= tri.area) return tri
    r -= tri.area
  }
  return triangles[triangles.length - 1]!
}

function sampleSurfacePoint(
  triangles: GrassTriangle[],
  totalArea: number,
): { p: THREE.Vector3; up: THREE.Vector3 } {
  const tri = pickTriangle(triangles, totalArea)
  return { p: sampleOnTriangle(tri, new THREE.Vector3()), up: tri.up }
}

/**
 * Scatter grass-blade tufts across the upward-facing triangles of a (world-space)
 * grass geometry, returning an InstancedMesh. Returns null if nothing to place.
 */
export function buildGrassBladeField(
  grassGeometry: THREE.BufferGeometry,
  options: GrassBladeOptions,
): THREE.InstancedMesh | null {
  const pos = grassGeometry.getAttribute('position') as THREE.BufferAttribute | undefined
  const index = grassGeometry.getIndex()
  if (!pos || !index) return null

  const { density, maxInstances } = options
  if (density <= 0 || maxInstances <= 0) return null

  const clumpT = THREE.MathUtils.clamp(options.clump, 0, 1)

  const triangles: GrassTriangle[] = []
  let totalArea = 0

  for (let i = 0; i < index.count; i += 3) {
    const i0 = index.getX(i)
    const i1 = index.getX(i + 1)
    const i2 = index.getX(i + 2)
    _a.fromBufferAttribute(pos, i0)
    _b.fromBufferAttribute(pos, i1)
    _c.fromBufferAttribute(pos, i2)
    _ab.subVectors(_b, _a)
    _ac.subVectors(_c, _a)
    _normal.crossVectors(_ab, _ac)
    const area = _normal.length() * 0.5
    if (area <= 0) continue
    _normal.normalize()
    if (_normal.y < 0.45) continue // skip near-vertical faces

    triangles.push({
      a: _a.clone(),
      ab: _ab.clone(),
      ac: _ac.clone(),
      area,
      up: _normal.clone(),
    })
    totalArea += area
  }

  if (triangles.length === 0) return null

  let targetCount = Math.floor(totalArea * density)
  if (Math.random() < totalArea * density - targetCount) targetCount++
  targetCount = Math.min(targetCount, maxInstances)
  if (targetCount <= 0) return null

  type Sample = { p: THREE.Vector3; up: THREE.Vector3 }
  const samples: Sample[] = []

  const patchScale = lerp(16, 2.8, clumpT)

  if (clumpT <= 0.001) {
    for (let n = 0; n < targetCount; n++) {
      const { p, up } = sampleSurfacePoint(triangles, totalArea)
      samples.push({ p, up })
    }
  } else {
    type PoolPoint = { p: THREE.Vector3; up: THREE.Vector3; patch: number }
    const poolSize = Math.min(
      Math.ceil(targetCount * (4 + clumpT * 14)),
      maxInstances * 4,
    )
    const pool: PoolPoint[] = []
    for (let i = 0; i < poolSize; i++) {
      const { p, up } = sampleSurfacePoint(triangles, totalArea)
      pool.push({ p, up, patch: patchNoise(p.x, p.z, patchScale) })
    }
    pool.sort((a, b) => b.patch - a.patch)

    const topCount = Math.max(
      targetCount,
      Math.ceil(pool.length * lerp(1, 0.12, clumpT)),
    )
    const top = pool.slice(0, Math.min(topCount, pool.length))
    const biasPower = 1 + clumpT * 6

    while (samples.length < targetCount) {
      const u = Math.random()
      const idx = Math.min(top.length - 1, Math.floor(u ** biasPower * top.length))
      const pick = top[idx]!
      samples.push({ p: pick.p, up: pick.up })
    }
  }

  if (samples.length === 0) return null

  const mesh = new THREE.InstancedMesh(getTuftGeometry(), getBladeMaterial(), samples.length)
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.userData.skipDigPick = true

  for (let i = 0; i < samples.length; i++) {
    const { p, up } = samples[i]!
    // Mostly upright, leaning slightly toward the surface normal.
    _up.set(0, 1, 0)
    const tilt = 0.18 * Math.random()
    _tiltAxis.set(up.z, 0, -up.x)
    if (_tiltAxis.lengthSq() < 1e-6) _tiltAxis.set(1, 0, 0)
    _tiltAxis.normalize()
    _quat.setFromAxisAngle(_tiltAxis, tilt)
    const yaw = new THREE.Quaternion().setFromAxisAngle(_up, Math.random() * Math.PI * 2)
    _quat.multiply(yaw)

    const s = 0.42 + Math.random() * 0.38
    _scale.set(s, s * (0.85 + Math.random() * 0.35), s)
    _pos.copy(p)
    _mat.compose(_pos, _quat, _scale)
    mesh.setMatrixAt(i, _mat)

    // Per-tuft green tint variation.
    _color.setHSL(0.27 + (Math.random() - 0.5) * 0.04, 0.5, 0.5 + (Math.random() - 0.5) * 0.18)
    mesh.setColorAt(i, _color)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}
