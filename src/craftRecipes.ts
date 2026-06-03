import type { InventoryItem } from './inventory'

export type CraftRecipe = {
  id: string
  output: InventoryItem
  outputCount: number
  ingredients: { item: InventoryItem; count: number }[]
}

/** Add recipes here — rendered in a scrollable auto-fill grid. */
export const CRAFT_RECIPES: CraftRecipe[] = [
  { id: 'sticks', output: 'stick', outputCount: 2, ingredients: [{ item: 'wood', count: 1 }] },
  {
    id: 'spear',
    output: 'spear',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'stone', count: 1 },
    ],
  },
  {
    id: 'shovel',
    output: 'shovel',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'stone', count: 1 },
    ],
  },
  {
    id: 'sword',
    output: 'sword',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'stone', count: 2 },
    ],
  },
  {
    id: 'pickaxe',
    output: 'pickaxe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'stone', count: 2 },
    ],
  },
  {
    id: 'axe',
    output: 'axe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'stone', count: 3 },
    ],
  },
  {
    id: 'torch',
    output: 'torch',
    outputCount: 1,
    ingredients: [
      { item: 'glowing_orb', count: 1 },
      { item: 'stick', count: 1 },
    ],
  },
]
