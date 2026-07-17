import type { InventoryItem } from './inventory'
import type { OreType } from './voxelPlacement'

export type DigToolTarget = {
  kind:
    | 'surface'
    | 'voxel'
    | 'rock'
    | 'tree'
    | 'block'
    | 'torch'
    | 'chest'
    | 'bed'
    | 'ballista'
    | 'catapult'
  blockType?: 'dirt' | 'wood' | 'stone' | 'iron' | 'gold' | 'diamond'
  /** Underground iron ore voxel (mined from dirt columns). */
  isIronOre?: boolean
  /** Underground ore type when mining a voxel. */
  oreType?: OreType | null
}

function isStoneTarget(target: DigToolTarget): boolean {
  return (
    target.kind === 'rock' ||
    target.blockType === 'stone' ||
    target.blockType === 'iron' ||
    target.blockType === 'gold' ||
    target.blockType === 'diamond' ||
    !!target.isIronOre ||
    !!target.oreType
  )
}

function isWoodTarget(target: DigToolTarget): boolean {
  return (
    target.kind === 'tree' ||
    target.blockType === 'wood' ||
    target.kind === 'torch' ||
    target.kind === 'chest' ||
    target.kind === 'bed' ||
    target.kind === 'ballista' ||
    target.kind === 'catapult'
  )
}

function toolKind(
  item: InventoryItem,
): 'shovel' | 'pickaxe' | 'axe' | null {
  if (
    item === 'shovel' ||
    item === 'iron_shovel' ||
    item === 'gold_shovel' ||
    item === 'diamond_shovel'
  ) {
    return 'shovel'
  }
  if (
    item === 'pickaxe' ||
    item === 'iron_pickaxe' ||
    item === 'gold_pickaxe' ||
    item === 'diamond_pickaxe'
  ) {
    return 'pickaxe'
  }
  if (
    item === 'axe' ||
    item === 'iron_axe' ||
    item === 'gold_axe' ||
    item === 'diamond_axe'
  ) {
    return 'axe'
  }
  return null
}

/** Mining speed bonus over stone-tier tools. */
function toolTierBonus(item: InventoryItem): number {
  if (
    item === 'diamond_shovel' ||
    item === 'diamond_pickaxe' ||
    item === 'diamond_axe' ||
    item === 'diamond_sword' ||
    item === 'diamond_spear'
  ) {
    return 1.55
  }
  if (
    item === 'gold_shovel' ||
    item === 'gold_pickaxe' ||
    item === 'gold_axe' ||
    item === 'gold_sword' ||
    item === 'gold_spear'
  ) {
    return 1.4
  }
  if (
    item === 'iron_shovel' ||
    item === 'iron_pickaxe' ||
    item === 'iron_axe' ||
    item === 'iron_sword' ||
    item === 'iron_spear'
  ) {
    return 1.25
  }
  return 1
}

/** Multiplier applied on top of the dig-speed slider. */
export function digToolMultiplier(item: InventoryItem | null, target: DigToolTarget): number {
  if (!item) return 1
  const kind = toolKind(item)
  const tierBonus = toolTierBonus(item)

  if (kind === 'shovel') {
    return (isStoneTarget(target) ? 1 : 2.5) * tierBonus
  }
  if (kind === 'pickaxe') {
    return (isStoneTarget(target) ? 2.5 : 1.35) * tierBonus
  }
  if (kind === 'axe') {
    // Strong on wood; still usable on rocks (pickaxe remains faster on stone).
    if (isWoodTarget(target)) return 2.5 * tierBonus
    if (isStoneTarget(target)) return 1.35 * tierBonus
    return tierBonus
  }
  return tierBonus > 1 ? tierBonus : 1
}
