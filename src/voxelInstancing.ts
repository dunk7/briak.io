import * as THREE from 'three'
import { composeVoxelMatrix, type VoxelPlacementCell } from './voxelPlacement'
import { createVoxelBoxGeometry } from './surfaceCapMaterials'
import { VOXEL_FACE_OVERLAP } from './voxelPlacement'

const _matrix = new THREE.Matrix4()
const _zeroScale = new THREE.Vector3(0, 0, 0)
const _hiddenPos = new THREE.Vector3(0, -1e6, 0)
const _hiddenQuat = new THREE.Quaternion()
const _hiddenMatrix = new THREE.Matrix4()
const _wobblePos = new THREE.Vector3()
const _wobbleQuat = new THREE.Quaternion()
const _wobbleScale = new THREE.Vector3()
const _wobbleEuler = new THREE.Euler()
const _wobbleOffset = new THREE.Quaternion()

export type VoxelCellRef = VoxelPlacementCell

/** One InstancedMesh per layer — 5 draw calls instead of thousands. */
export class VoxelInstancer {
  readonly group = new THREE.Group()
  readonly meshes: THREE.InstancedMesh[] = []
  readonly geometry: THREE.BoxGeometry
  private readonly cellKeys: string[] = []
  private readonly hiddenDuringDig = new Set<string>()
  private digWobbleId: string | null = null

  constructor(
    material: THREE.Material,
    layerCount: number,
    cellCount: number,
    voxelSize: number,
  ) {
    this.geometry = createVoxelBoxGeometry(voxelSize, VOXEL_FACE_OVERLAP)
    for (let layer = 0; layer < layerCount; layer++) {
      const mesh = new THREE.InstancedMesh(this.geometry, material, cellCount)
      mesh.userData.layer = layer
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = true
      mesh.count = cellCount
      this.meshes.push(mesh)
      this.group.add(mesh)
    }
  }

  getCellKey(_layer: number, instanceId: number): string | undefined {
    if (instanceId < 0 || instanceId >= this.cellKeys.length) return undefined
    return this.cellKeys[instanceId]
  }

  getLayerFromMesh(mesh: THREE.Object3D): number | undefined {
    return mesh.userData.layer as number | undefined
  }

  build(cells: VoxelCellRef[], voxelSize: number, layerCount: number) {
    this.cellKeys.length = 0
    let index = 0
    for (const cell of cells) {
      cell.instanceIndex = index
      cell.layerMask = 0
      this.cellKeys[index] = cell.key
      index++
    }
    this.applyPlacement(cells, voxelSize, layerCount)
  }

  applyPlacement(cells: VoxelCellRef[], voxelSize: number, layerCount: number) {
    for (const cell of cells) {
      this.applyCell(cell, voxelSize, layerCount)
    }
  }

  applyCell(cell: VoxelCellRef, voxelSize: number, layerCount: number) {
    const index = cell.instanceIndex
    for (let layer = 0; layer < layerCount; layer++) {
      if (this.hasLayer(cell, layer)) {
        composeVoxelMatrix(cell, layer, voxelSize, _matrix)
      } else {
        _hiddenMatrix.compose(_hiddenPos, _hiddenQuat, _zeroScale)
        _matrix.copy(_hiddenMatrix)
      }
      this.meshes[layer]!.setMatrixAt(index, _matrix)
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  tempHideLayer(cell: VoxelCellRef, layer: number) {
    this.digHideKey(cell.key, layer)
    _hiddenMatrix.compose(_hiddenPos, _hiddenQuat, _zeroScale)
    this.meshes[layer]!.setMatrixAt(cell.instanceIndex, _hiddenMatrix)
    this.meshes[layer]!.instanceMatrix.needsUpdate = true
  }

  hideLayer(cell: VoxelCellRef, layer: number, _voxelSize: number) {
    const bit = 1 << layer
    if ((cell.layerMask & bit) === 0) return
    cell.layerMask &= ~bit
    this.hiddenDuringDig.delete(`${cell.key}:${layer}`)
    _hiddenMatrix.compose(_hiddenPos, _hiddenQuat, _zeroScale)
    this.meshes[layer]!.setMatrixAt(cell.instanceIndex, _hiddenMatrix)
    this.meshes[layer]!.instanceMatrix.needsUpdate = true
  }

  hasLayer(cell: VoxelCellRef, layer: number) {
    return (cell.layerMask & (1 << layer)) !== 0
  }

  layerCount(cell: VoxelCellRef) {
    let n = 0
    let m = cell.layerMask
    while (m) {
      n += m & 1
      m >>= 1
    }
    return n
  }

  digHideKey(cellKey: string, layer: number) {
    this.hiddenDuringDig.add(`${cellKey}:${layer}`)
  }

  clearDigHide() {
    this.hiddenDuringDig.clear()
  }

  setLayerVisible(
    cell: VoxelCellRef,
    layer: number,
    visible: boolean,
    voxelSize: number,
  ) {
    if (!this.hasLayer(cell, layer)) return
    if (visible) {
      composeVoxelMatrix(cell, layer, voxelSize, _matrix)
    } else {
      _hiddenMatrix.compose(_hiddenPos, _hiddenQuat, _zeroScale)
      _matrix.copy(_hiddenMatrix)
    }
    this.meshes[layer]!.setMatrixAt(cell.instanceIndex, _matrix)
    this.meshes[layer]!.instanceMatrix.needsUpdate = true
  }

  restoreDigHidden(cells: Map<string, VoxelCellRef>, voxelSize: number) {
    for (const id of this.hiddenDuringDig) {
      const [key, layerStr] = id.split(':')
      const layer = Number(layerStr)
      const cell = cells.get(key!)
      if (!cell || !this.hasLayer(cell, layer)) continue
      composeVoxelMatrix(cell, layer, voxelSize, _matrix)
      this.meshes[layer]!.setMatrixAt(cell.instanceIndex, _matrix)
      this.meshes[layer]!.instanceMatrix.needsUpdate = true
    }
    this.hiddenDuringDig.clear()
    this.clearDigWobble(cells, voxelSize)
  }

  applyDigWobble(
    cell: VoxelCellRef,
    layer: number,
    progress: number,
    voxelSize: number,
    swingImpact = 0,
  ) {
    if (!this.hasLayer(cell, layer)) return
    this.digWobbleId = `${cell.key}:${layer}`

    composeVoxelMatrix(cell, layer, voxelSize, _matrix)
    _wobblePos.setFromMatrixPosition(_matrix)
    _wobbleQuat.setFromRotationMatrix(_matrix)
    _wobbleScale.setFromMatrixScale(_matrix)

    const stress = progress * progress
    const intensity = stress * 0.042
    const progressSquash = 1 - stress * 0.07
    const hitSquash = 1 - Math.min(1, swingImpact) * 0.12 * (0.65 + stress * 0.35)
    const scaleMul = progressSquash * hitSquash
    const hitKick = swingImpact * 0.05
    const t = performance.now() * 0.001

    _wobblePos.x += Math.sin(t * 54 + _wobblePos.x * 11) * intensity
    _wobblePos.y += Math.sin(t * 63 + _wobblePos.y * 8) * intensity * 0.4 - hitKick
    _wobblePos.z += Math.sin(t * 49 + _wobblePos.z * 12) * intensity * 0.85

    const twist = intensity * 0.1
    _wobbleEuler.set(
      Math.sin(t * 42) * twist,
      Math.sin(t * 37 + 1) * twist * 1.1,
      Math.sin(t * 45 + 2) * twist * 0.75,
    )
    _wobbleOffset.setFromEuler(_wobbleEuler)
    _wobbleQuat.premultiply(_wobbleOffset)

    _wobbleScale.multiplyScalar(scaleMul)
    _matrix.compose(_wobblePos, _wobbleQuat, _wobbleScale)
    this.meshes[layer]!.setMatrixAt(cell.instanceIndex, _matrix)
    this.meshes[layer]!.instanceMatrix.needsUpdate = true
  }

  clearDigWobble(cells: Map<string, VoxelCellRef>, voxelSize: number) {
    if (!this.digWobbleId) return
    const [key, layerStr] = this.digWobbleId.split(':')
    const layer = Number(layerStr)
    const cell = cells.get(key!)
    this.digWobbleId = null
    if (!cell || !this.hasLayer(cell, layer)) return
    composeVoxelMatrix(cell, layer, voxelSize, _matrix)
    this.meshes[layer]!.setMatrixAt(cell.instanceIndex, _matrix)
    this.meshes[layer]!.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.geometry.dispose()
    for (const mesh of this.meshes) {
      mesh.dispose()
    }
  }
}
