import * as THREE from 'three'

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _cb = new THREE.Vector3()
const _ab = new THREE.Vector3()
const _v = new THREE.Vector3()

/**
 * World-space planar UVs so surface caps sample the dirt/grass maps like voxel boxes.
 */
export function assignWorldTerrainUVs(
  geometry: THREE.BufferGeometry,
  worldUnitsPerTile: number,
) {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return

  const scale = 1 / worldUnitsPerTile
  let uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!uv || uv.count !== pos.count) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)
    geometry.setAttribute('uv', uv)
  }

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals()
  }
  const nor = geometry.getAttribute('normal') as THREE.BufferAttribute

  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i)
    const nx = nor.getX(i)
    const ny = nor.getY(i)
    const nz = nor.getZ(i)
    const ax = Math.abs(nx)
    const ay = Math.abs(ny)
    const az = Math.abs(nz)
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
}

/** Face normal Y above this in the top band → grass; below → dirt. */
export const DEFAULT_TOP_SLOPE_THRESHOLD = 0.2
export const DEFAULT_UP_THRESHOLD = 0.88

export function createVoxelBoxGeometry(
  size: number,
  xzOverlap = 0,
): THREE.BoxGeometry {
  const pad = xzOverlap * 2
  return new THREE.BoxGeometry(size + pad, size, size + pad)
}

function attributeMaxY(pos: THREE.BufferAttribute): number {
  let maxY = -Infinity
  for (let i = 0; i < pos.count; i++) {
    maxY = Math.max(maxY, pos.getY(i))
  }
  return maxY
}

export function applySurfaceCapMaterials(
  root: THREE.Object3D,
  dirtMaterial: THREE.MeshStandardMaterial,
  grassMaterial: THREE.MeshStandardMaterial,
  worldUnitsPerTile: number,
  upThreshold = DEFAULT_UP_THRESHOLD,
  topBand = 1.5,
  topSlopeThreshold = DEFAULT_TOP_SLOPE_THRESHOLD,
) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return

    const srcGeo = child.geometry
    const pos = srcGeo.getAttribute('position') as THREE.BufferAttribute | undefined
    if (!pos) return

    assignWorldTerrainUVs(srcGeo, worldUnitsPerTile)

    const meshTopY = attributeMaxY(pos)
    const grassMinY = meshTopY - topBand
    const triCount = srcGeo.index ? srcGeo.index.count / 3 : pos.count / 3
    const dirtIdx = new Uint32Array(triCount * 3)
    const grassIdx = new Uint32Array(triCount * 3)
    let dirtLen = 0
    let grassLen = 0

    const classify = (i0: number, i1: number, i2: number) => {
      _a.fromBufferAttribute(pos, i0)
      _b.fromBufferAttribute(pos, i1)
      _c.fromBufferAttribute(pos, i2)
      _cb.subVectors(_c, _b)
      _ab.subVectors(_a, _b)
      const ny = _cb.cross(_ab).normalize().y
      const faceTopY = Math.max(_a.y, _b.y, _c.y)
      const inTopBand = faceTopY >= grassMinY
      const isGrass = inTopBand
        ? ny >= topSlopeThreshold
        : ny >= upThreshold
      const bucket = isGrass ? grassIdx : dirtIdx
      let len = isGrass ? grassLen : dirtLen
      bucket[len++] = i0
      bucket[len++] = i1
      bucket[len++] = i2
      if (isGrass) grassLen = len
      else dirtLen = len
    }

    const index = srcGeo.index
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        classify(index.getX(i), index.getX(i + 1), index.getX(i + 2))
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        classify(i, i + 1, i + 2)
      }
    }

    child.castShadow = false
    child.receiveShadow = false

    if (grassLen === 0) {
      child.material = dirtMaterial
      return
    }
    if (dirtLen === 0) {
      child.material = grassMaterial
      return
    }

    const merged = new Uint32Array(dirtLen + grassLen)
    merged.set(dirtIdx.subarray(0, dirtLen), 0)
    merged.set(grassIdx.subarray(0, grassLen), dirtLen)

    const geo = srcGeo.clone()
    geo.setIndex(new THREE.BufferAttribute(merged, 1))
    geo.clearGroups()
    geo.addGroup(0, dirtLen, 0)
    geo.addGroup(dirtLen, grassLen, 1)
    child.geometry = geo
    child.material = [dirtMaterial, grassMaterial]
  })
}
