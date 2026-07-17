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
    id: 'iron_spear',
    output: 'iron_spear',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'iron', count: 1 },
    ],
  },
  {
    id: 'iron_shovel',
    output: 'iron_shovel',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'iron', count: 1 },
    ],
  },
  {
    id: 'iron_sword',
    output: 'iron_sword',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'iron', count: 2 },
    ],
  },
  {
    id: 'iron_pickaxe',
    output: 'iron_pickaxe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'iron', count: 2 },
    ],
  },
  {
    id: 'iron_axe',
    output: 'iron_axe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'iron', count: 3 },
    ],
  },
  {
    id: 'gold_spear',
    output: 'gold_spear',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'gold', count: 1 },
    ],
  },
  {
    id: 'gold_shovel',
    output: 'gold_shovel',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'gold', count: 1 },
    ],
  },
  {
    id: 'gold_sword',
    output: 'gold_sword',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'gold', count: 2 },
    ],
  },
  {
    id: 'gold_pickaxe',
    output: 'gold_pickaxe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'gold', count: 2 },
    ],
  },
  {
    id: 'gold_axe',
    output: 'gold_axe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'gold', count: 3 },
    ],
  },
  {
    id: 'diamond_spear',
    output: 'diamond_spear',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'diamond', count: 1 },
    ],
  },
  {
    id: 'diamond_shovel',
    output: 'diamond_shovel',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'diamond', count: 1 },
    ],
  },
  {
    id: 'diamond_sword',
    output: 'diamond_sword',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 1 },
      { item: 'diamond', count: 2 },
    ],
  },
  {
    id: 'diamond_pickaxe',
    output: 'diamond_pickaxe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'diamond', count: 2 },
    ],
  },
  {
    id: 'diamond_axe',
    output: 'diamond_axe',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'diamond', count: 3 },
    ],
  },
  {
    id: 'scissors',
    output: 'scissors',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 2 },
      { item: 'iron', count: 2 },
    ],
  },
  {
    id: 'rope',
    output: 'rope',
    outputCount: 1,
    ingredients: [{ item: 'leaves', count: 10 }],
  },
  {
    id: 'bow',
    output: 'bow',
    outputCount: 1,
    ingredients: [
      { item: 'stick', count: 3 },
      { item: 'rope', count: 1 },
    ],
  },
  {
    id: 'arrow',
    output: 'arrow',
    outputCount: 4,
    ingredients: [
      { item: 'spear', count: 1 },
      { item: 'leaves', count: 4 },
    ],
  },
  {
    id: 'iron_arrow',
    output: 'iron_arrow',
    outputCount: 4,
    ingredients: [
      { item: 'iron_spear', count: 1 },
      { item: 'leaves', count: 4 },
    ],
  },
  {
    id: 'gold_arrow',
    output: 'gold_arrow',
    outputCount: 4,
    ingredients: [
      { item: 'gold_spear', count: 1 },
      { item: 'leaves', count: 4 },
    ],
  },
  {
    id: 'diamond_arrow',
    output: 'diamond_arrow',
    outputCount: 4,
    ingredients: [
      { item: 'diamond_spear', count: 1 },
      { item: 'leaves', count: 4 },
    ],
  },
  {
    id: 'glowing_arrow',
    output: 'glowing_arrow',
    outputCount: 1,
    ingredients: [
      { item: 'glowing_orb', count: 1 },
      { item: 'arrow', count: 1 },
    ],
  },
  {
    id: 'glowing_iron_arrow',
    output: 'glowing_iron_arrow',
    outputCount: 1,
    ingredients: [
      { item: 'glowing_orb', count: 1 },
      { item: 'iron_arrow', count: 1 },
    ],
  },
  {
    id: 'glowing_gold_arrow',
    output: 'glowing_gold_arrow',
    outputCount: 1,
    ingredients: [
      { item: 'glowing_orb', count: 1 },
      { item: 'gold_arrow', count: 1 },
    ],
  },
  {
    id: 'glowing_diamond_arrow',
    output: 'glowing_diamond_arrow',
    outputCount: 1,
    ingredients: [
      { item: 'glowing_orb', count: 1 },
      { item: 'diamond_arrow', count: 1 },
    ],
  },
  {
    id: 'healing_gold_arrow',
    output: 'healing_gold_arrow',
    outputCount: 1,
    ingredients: [
      { item: 'gold_arrow', count: 1 },
      { item: 'crystal_berries', count: 1 },
    ],
  },
  {
    id: 'glowing_healing_gold_arrow',
    output: 'glowing_healing_gold_arrow',
    outputCount: 1,
    ingredients: [
      { item: 'glowing_orb', count: 1 },
      { item: 'healing_gold_arrow', count: 1 },
    ],
  },
  {
    id: 'sapling',
    output: 'sapling',
    outputCount: 1,
    ingredients: [
      { item: 'leaves', count: 1 },
      { item: 'stick', count: 1 },
      { item: 'dirt', count: 1 },
    ],
  },
  {
    id: 'glowberry_sapling',
    output: 'glowberry_sapling',
    outputCount: 1,
    ingredients: [
      { item: 'sapling', count: 1 },
      { item: 'crystal_berries', count: 1 },
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
  {
    id: 'chest',
    output: 'chest',
    outputCount: 1,
    ingredients: [
      { item: 'wood', count: 5 },
      { item: 'gold', count: 1 },
    ],
  },
  {
    id: 'bed',
    output: 'bed',
    outputCount: 1,
    ingredients: [{ item: 'rope', count: 5 }],
  },
  {
    id: 'ballista',
    output: 'ballista',
    outputCount: 1,
    ingredients: [
      { item: 'stone', count: 5 },
      { item: 'wood', count: 5 },
      { item: 'computer_chip', count: 1 },
      { item: 'bow', count: 1 },
    ],
  },
  {
    id: 'catapult',
    output: 'catapult',
    outputCount: 1,
    ingredients: [
      { item: 'wood', count: 10 },
      { item: 'stone', count: 5 },
      { item: 'iron', count: 1 },
      { item: 'computer_chip', count: 1 },
      { item: 'rope', count: 2 },
    ],
  },
]
