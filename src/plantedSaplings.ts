import * as THREE from 'three'
import { buildPlacementNormalFromFace } from './buildBlocks'
import {
  TREE_GROWTH_FRACTIONS,
  TREE_SCALE,
  treeWorldScale,
  attachCrystalBerries,
  assignBerryGlowLight,
  type TreeGrowthStage,
} from './tree'
import { freezeSubtreeMatrices } from './surfacePieceLoader'

export const SAPLING_GROWTH_INTERVAL_SEC = 30
/** Min distance between planted saplings / trees. */
const MIN_SPACING = 1.6
const MIN_SPACING_SQ = MIN_SPACING * MIN_SPACING
const SURFACE_NUDGE = 0.02
/** Only plant on roughly upward-facing ground. */
const MIN_UP_DOT = 0.55
/** Pre-cloned trees so place() never pays clone cost on the click frame. */
const TREE_POOL_SIZE = 4

const _box = new THREE.Box3()
const _size = new THREE.Vector3()
const _center = new THREE.Vector3()

export type SaplingKind = 'sapling' | 'glowberry_sapling'

export type PlantedTreeUserData = {
  isPlanted: true
  saplingKind: SaplingKind
  growthStage: TreeGrowthStage
  growthTimer: number
  hasCrystalBerries?: boolean
}

function tintGhostMaterials(root: THREE.Object3D, valid: boolean) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    for (const mat of mats) {
      if (!mat || typeof mat !== 'object') continue
      const m = mat as THREE.MeshStandardMaterial
      if ('transparent' in m) {
        m.transparent = true
        m.opacity = valid ? 0.42 : 0.28
        m.depthWrite = false
      }
      if ('color' in m && m.color) {
        m.color.setHex(valid ? 0x6db850 : 0xd1564a)
      }
      if ('emissive' in m && m.emissive) {
        m.emissive.setHex(valid ? 0x1a3a12 : 0x4a1810)
        m.emissiveIntensity = 0.35
      }
    }
  })
}

/** Player-planted trees that grow through scale stages. */
export class PlantedSaplingManager {
  readonly ghost = new THREE.Group()
  private ghostTree: THREE.Group | null = null
  private ghostKind: SaplingKind | null = null
  private treeTemplate: THREE.Group | null = null
  private berriesTemplate: THREE.Group | null = null
  private readonly treePool: THREE.Group[] = []

  constructor() {
    this.ghost.visible = false
    this.ghost.renderOrder = 3
    this.ghost.traverse((child) => {
      child.raycast = () => {}
    })
  }

  setTemplates(treeTemplate: THREE.Group, berriesTemplate: THREE.Group | undefined) {
    this.treeTemplate = treeTemplate
    this.berriesTemplate = berriesTemplate ?? null
    this.clearGhostMesh()
    this.treePool.length = 0
    for (let i = 0; i < TREE_POOL_SIZE; i++) {
      this.treePool.push(treeTemplate.clone(true))
    }
  }

  private acquireTree(): THREE.Group | null {
    if (!this.treeTemplate) return null
    return this.treePool.pop() ?? this.treeTemplate.clone(true)
  }

  private clearGhostMesh() {
    if (this.ghostTree) {
      this.ghost.remove(this.ghostTree)
      this.ghostTree = null
    }
    this.ghostKind = null
  }

  private ensureGhost(kind: SaplingKind) {
    if (!this.treeTemplate) return
    if (this.ghostTree && this.ghostKind === kind) return
    this.clearGhostMesh()
    const tree = this.treeTemplate.clone(true)
    if (kind === 'glowberry_sapling' && this.berriesTemplate) {
      // Preview only — never bind a real PointLight (that recompiles shaders).
      attachCrystalBerries(tree, this.treeTemplate, this.berriesTemplate, {
        assignLight: false,
      })
    }
    tree.scale.setScalar(treeWorldScale(0))
    tree.traverse((child) => {
      child.raycast = () => {}
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material]
        child.material = mats.map((m) => (m ? (m as THREE.Material).clone() : m))
        child.castShadow = false
      }
    })
    tintGhostMaterials(tree, true)
    this.ghost.add(tree)
    this.ghostTree = tree
    this.ghostKind = kind
  }

  placementFromHit(
    hit: THREE.Intersection,
    rayDirection: THREE.Vector3,
    outPos: THREE.Vector3,
    outNormal: THREE.Vector3,
  ): boolean {
    if (!hit.face) return false
    buildPlacementNormalFromFace(
      hit.face.normal,
      hit.object.matrixWorld,
      rayDirection,
      outNormal,
    )
    if (outNormal.y < MIN_UP_DOT) return false
    outPos.copy(hit.point).addScaledVector(outNormal, SURFACE_NUDGE)
    return true
  }

  isPlacementValid(
    position: THREE.Vector3,
    playerPos: THREE.Vector3,
    playerRadius: number,
    playerHeight: number,
    existingTrees: readonly THREE.Object3D[],
  ): boolean {
    for (const tree of existingTrees) {
      const dx = tree.position.x - position.x
      const dz = tree.position.z - position.z
      if (dx * dx + dz * dz < MIN_SPACING_SQ) return false
    }

    // Approximate young-sapling footprint so the player isn't blocked.
    _size.set(0.35, 0.9, 0.35)
    _center.set(position.x, position.y + _size.y * 0.5, position.z)
    _box.setFromCenterAndSize(_center, _size)
    return !(
      playerPos.x + playerRadius > _box.min.x &&
      playerPos.x - playerRadius < _box.max.x &&
      playerPos.y + playerHeight > _box.min.y &&
      playerPos.y < _box.max.y &&
      playerPos.z + playerRadius > _box.min.z &&
      playerPos.z - playerRadius < _box.max.z
    )
  }

  place(
    kind: SaplingKind,
    position: THREE.Vector3,
    parent: THREE.Object3D,
  ): THREE.Group | null {
    if (!this.treeTemplate) return null
    const tree = this.acquireTree()
    if (!tree) return null
    tree.position.copy(position)
    tree.rotation.y = Math.random() * Math.PI * 2
    tree.scale.setScalar(treeWorldScale(0))
    // Young saplings skip shadow casting — avoids a full shadow-map rebuild on plant.
    tree.traverse((child) => {
      if (child instanceof THREE.Mesh) child.castShadow = false
    })
    parent.add(tree)
    if (kind === 'glowberry_sapling' && this.berriesTemplate) {
      attachCrystalBerries(tree, this.treeTemplate, this.berriesTemplate, {
        assignLight: false,
      })
    }
    const data: PlantedTreeUserData = {
      isPlanted: true,
      saplingKind: kind,
      growthStage: 0,
      growthTimer: SAPLING_GROWTH_INTERVAL_SEC,
      hasCrystalBerries: kind === 'glowberry_sapling',
    }
    Object.assign(tree.userData, data)
    tree.updateMatrixWorld(true)
    if (kind === 'glowberry_sapling') assignBerryGlowLight(tree)
    return tree
  }

  setGhost(
    kind: SaplingKind | null,
    position: THREE.Vector3 | null,
    valid: boolean,
  ) {
    if (!kind || !position) {
      this.ghost.visible = false
      return
    }
    this.ensureGhost(kind)
    if (!this.ghostTree) {
      this.ghost.visible = false
      return
    }
    tintGhostMaterials(this.ghostTree, valid)
    this.ghost.position.copy(position)
    this.ghost.visible = true
  }

  /**
   * Advance planted trees through growth stages. Returns true if any tree
   * changed scale (caller should rebuild prop collision).
   */
  update(dt: number, trees: readonly THREE.Group[]): boolean {
    let grew = false
    for (const tree of trees) {
      if (!tree.userData.isPlanted) continue
      let stage = tree.userData.growthStage as TreeGrowthStage
      if (stage >= 3) continue
      let timer = (tree.userData.growthTimer as number) - dt
      if (timer > 0) {
        tree.userData.growthTimer = timer
        continue
      }
      stage = (stage + 1) as TreeGrowthStage
      tree.userData.growthStage = stage
      tree.userData.growthTimer = SAPLING_GROWTH_INTERVAL_SEC
      tree.scale.setScalar(treeWorldScale(stage))
      tree.updateMatrixWorld(true)
      if (tree.userData.hasCrystalBerries) assignBerryGlowLight(tree)
      if (stage >= 3) {
        tree.traverse((child) => {
          if (child instanceof THREE.Mesh) child.castShadow = true
        })
        freezeSubtreeMatrices(tree)
      }
      grew = true
    }
    return grew
  }
}

export function treeGrowthFraction(tree: THREE.Object3D | undefined | null): number {
  if (!tree?.userData.isPlanted) return 1
  const stage = tree.userData.growthStage as number | undefined
  if (stage === undefined) return 1
  return TREE_GROWTH_FRACTIONS[Math.min(3, Math.max(0, stage))] ?? 1
}

export function woodFromTree(tree: THREE.Object3D, fullWood: number): number {
  const fraction = treeGrowthFraction(tree)
  return Math.max(1, Math.round(fullWood * fraction))
}

export function isSaplingItem(item: string | null): item is SaplingKind {
  return item === 'sapling' || item === 'glowberry_sapling'
}

export { TREE_SCALE, TREE_GROWTH_FRACTIONS, treeWorldScale }
