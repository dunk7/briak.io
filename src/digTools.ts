import type { InventoryItem } from './inventory'

export type DigToolTarget = {
  kind: 'surface' | 'voxel' | 'rock' | 'tree' | 'block' | 'torch'
  blockType?: 'dirt' | 'wood' | 'stone'
}

function isStoneTarget(target: DigToolTarget): boolean {
  return target.kind === 'rock' || target.blockType === 'stone'
}

function isWoodTarget(target: DigToolTarget): boolean {
  return target.kind === 'tree' || target.blockType === 'wood' || target.kind === 'torch'
}

/** Multiplier applied on top of the dig-speed slider. */
export function digToolMultiplier(item: InventoryItem | null, target: DigToolTarget): number {
  if (!item) return 1
  if (item === 'shovel') {
    return isStoneTarget(target) ? 1 : 2.5
  }
  if (item === 'pickaxe') {
    return isStoneTarget(target) ? 2.5 : 1.35
  }
  if (item === 'axe') {
    return isWoodTarget(target) ? 2.5 : 1
  }
  return 1
}
