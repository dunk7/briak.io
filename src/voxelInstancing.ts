import * as THREE from 'three'
import {
  composeVoxelMatrix,
  cellOreType,
  type OreType,
  type VoxelPlacementCell,
} from './voxelPlacement'
import { createVoxelBoxGeometry } from './surfaceCapMaterials'
import { VOXEL_FACE_OVERLAP } from './voxelPlacement'

const _matrix = new THREE.Matrix4()
const _zeroScale = new THREE.Vector3(0, 0, 0)
const _hiddenPos = new THREE.Vector3(0, -1e6, 0)
const _hiddenQuat = new THREE.Quaternion()
const _hiddenMatrix = new THREE.Matrix4()
export type VoxelCellRef = VoxelPlacementCell

type OreMaterials = {
  iron: THREE.Material
  gold: THREE.Material
  diamond: THREE.Material
}

/** One InstancedMesh per layer × material (dirt / ores) — few draw calls. */
export class VoxelInstancer {
  readonly group = new THREE.Group()
  /** All pickable voxel meshes (dirt + ores). */
  readonly meshes: THREE.InstancedMesh[] = []
  readonly geometry: THREE.BoxGeometry
  private readonly dirtMeshes: THREE.InstancedMesh[] = []
  private readonly ironMeshes: THREE.InstancedMesh[] = []
  private readonly goldMeshes: THREE.InstancedMesh[] = []
  private readonly diamondMeshes: THREE.InstancedMesh[] = []
  private readonly oreMeshLists: Record<OreType, THREE.InstancedMesh[]>
  private readonly cellKeys: string[] = []
  private readonly hiddenDuringDig = new Set<string>()

  constructor(
    dirtMaterial: THREE.Material,
    oreMaterials: OreMaterials,
    layerCount: number,
    cellCount: number,
    voxelSize: number,
  ) {
    this.geometry = createVoxelBoxGeometry(voxelSize, VOXEL_FACE_OVERLAP)
    this.oreMeshLists = {
      iron: this.ironMeshes,
      gold: this.goldMeshes,
      diamond: this.diamondMeshes,
    }
    for (let layer = 0; layer < layerCount; layer++) {
      const dirt = this.makeLayerMesh(dirtMaterial, layer, cellCount, null)
      const iron = this.makeLayerMesh(oreMaterials.iron, layer, cellCount, 'iron')
      const gold = this.makeLayerMesh(oreMaterials.gold, layer, cellCount, 'gold')
      const diamond = this.makeLayerMesh(oreMaterials.diamond, layer, cellCount, 'diamond')
      this.dirtMeshes.push(dirt)
      this.ironMeshes.push(iron)
      this.goldMeshes.push(gold)
      this.diamondMeshes.push(diamond)
      this.meshes.push(dirt, iron, gold, diamond)
      this.group.add(dirt, iron, gold, diamond)
    }
  }

  private makeLayerMesh(
    material: THREE.Material,
    layer: number,
    cellCount: number,
    oreType: OreType | null,
  ) {
    const mesh = new THREE.InstancedMesh(this.geometry, material, cellCount)
    mesh.userData.layer = layer
    mesh.userData.oreType = oreType
    mesh.userData.isIronOre = oreType === 'iron'
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = true
    mesh.count = cellCount
    return mesh
  }

  getCellKey(_layer: number, instanceId: number): string | undefined {
    if (instanceId < 0 || instanceId >= this.cellKeys.length) return undefined
    return this.cellKeys[instanceId]
  }

  getLayerFromMesh(mesh: THREE.Object3D): number | undefined {
    return mesh.userData.layer as number | undefined
  }

  isIronMesh(mesh: THREE.Object3D): boolean {
    return mesh.userData.oreType === 'iron'
  }

  oreTypeFromMesh(mesh: THREE.Object3D): OreType | null {
    const t = mesh.userData.oreType
    return t === 'iron' || t === 'gold' || t === 'diamond' ? t : null
  }

  build(cells: VoxelCellRef[], voxelSize: number, layerCount: number) {
    this.cellKeys.length = 0
    let index = 0
    for (const cell of cells) {
      cell.instanceIndex = index
      this.cellKeys[index] = cell.key
      index++
    }
    this.applyPlacement(cells, voxelSize, layerCount)
  }

  applyPlacement(cells: VoxelCellRef[], voxelSize: number, layerCount: number) {
    for (const cell of cells) {
      this.applyCell(cell, voxelSize, layerCount, false)
    }
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true
    }
  }

  private hideAllAt(index: number, layer: number) {
    _hiddenMatrix.compose(_hiddenPos, _hiddenQuat, _zeroScale)
    this.dirtMeshes[layer]!.setMatrixAt(index, _hiddenMatrix)
    this.ironMeshes[layer]!.setMatrixAt(index, _hiddenMatrix)
    this.goldMeshes[layer]!.setMatrixAt(index, _hiddenMatrix)
    this.diamondMeshes[layer]!.setMatrixAt(index, _hiddenMatrix)
  }

  private markLayerDirty(layer: number) {
    this.dirtMeshes[layer]!.instanceMatrix.needsUpdate = true
    this.ironMeshes[layer]!.instanceMatrix.needsUpdate = true
    this.goldMeshes[layer]!.instanceMatrix.needsUpdate = true
    this.diamondMeshes[layer]!.instanceMatrix.needsUpdate = true
  }

  applyCell(
    cell: VoxelCellRef,
    voxelSize: number,
    layerCount: number,
    markDirty = true,
  ) {
    const index = cell.instanceIndex
    for (let layer = 0; layer < layerCount; layer++) {
      const present = this.hasLayer(cell, layer)
      const ore = present ? cellOreType(cell, layer) : null
      this.hideAllAt(index, layer)
      if (present && !ore) {
        composeVoxelMatrix(cell, layer, voxelSize, _matrix)
        this.dirtMeshes[layer]!.setMatrixAt(index, _matrix)
      } else if (ore) {
        composeVoxelMatrix(cell, layer, voxelSize, _matrix)
        this.oreMeshLists[ore][layer]!.setMatrixAt(index, _matrix)
      }
      if (markDirty) this.markLayerDirty(layer)
    }
  }

  tempHideLayer(cell: VoxelCellRef, layer: number) {
    this.digHideKey(cell.key, layer)
    this.hideAllAt(cell.instanceIndex, layer)
    this.markLayerDirty(layer)
  }

  hideLayer(cell: VoxelCellRef, layer: number, _voxelSize: number) {
    const bit = 1 << layer
    if ((cell.layerMask & bit) === 0) return
    cell.layerMask &= ~bit
    cell.oreLayerMask = (cell.oreLayerMask ?? 0) & ~bit
    cell.goldOreLayerMask = (cell.goldOreLayerMask ?? 0) & ~bit
    cell.diamondOreLayerMask = (cell.diamondOreLayerMask ?? 0) & ~bit
    this.hiddenDuringDig.delete(`${cell.key}:${layer}`)
    this.hideAllAt(cell.instanceIndex, layer)
    this.markLayerDirty(layer)
  }

  hasLayer(cell: VoxelCellRef, layer: number) {
    return (cell.layerMask & (1 << layer)) !== 0
  }

  hasIronOre(cell: VoxelCellRef, layer: number) {
    return this.hasLayer(cell, layer) && cellOreType(cell, layer) === 'iron'
  }

  oreTypeAt(cell: VoxelCellRef, layer: number): OreType | null {
    if (!this.hasLayer(cell, layer)) return null
    return cellOreType(cell, layer)
  }

  /** InstancedMesh used to draw this cell layer (dirt or ore). */
  meshForCellLayer(cell: VoxelCellRef, layer: number): THREE.InstancedMesh | undefined {
    const ore = this.oreTypeAt(cell, layer)
    if (ore) return this.oreMeshLists[ore][layer]
    return this.dirtMeshes[layer]
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
    const ore = cellOreType(cell, layer)
    this.hideAllAt(cell.instanceIndex, layer)
    if (visible) {
      composeVoxelMatrix(cell, layer, voxelSize, _matrix)
      if (ore) {
        this.oreMeshLists[ore][layer]!.setMatrixAt(cell.instanceIndex, _matrix)
      } else {
        this.dirtMeshes[layer]!.setMatrixAt(cell.instanceIndex, _matrix)
      }
    }
    this.markLayerDirty(layer)
  }

  restoreDigHidden(cells: Map<string, VoxelCellRef>, voxelSize: number) {
    for (const id of this.hiddenDuringDig) {
      const [key, layerStr] = id.split(':')
      const layer = Number(layerStr)
      const cell = cells.get(key!)
      if (!cell || !this.hasLayer(cell, layer)) continue
      this.setLayerVisible(cell, layer, true, voxelSize)
    }
    this.hiddenDuringDig.clear()
  }

  dispose() {
    this.geometry.dispose()
    for (const mesh of this.meshes) {
      mesh.dispose()
    }
  }
}
