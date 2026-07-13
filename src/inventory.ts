import { CRAFT_RECIPES, type CraftRecipe } from './craftRecipes'
import {
  ARROW_DAMAGE,
  DIAMOND_ARROW_DAMAGE,
  GOLD_ARROW_DAMAGE,
  IRON_ARROW_DAMAGE,
  meleeStatsForItem,
} from './enemy'
import { itemIconMarkup } from './itemIcons'

export type InventoryItem =
  | 'wood'
  | 'dirt'
  | 'stone'
  | 'iron'
  | 'gold'
  | 'diamond'
  | 'stick'
  | 'sword'
  | 'axe'
  | 'shovel'
  | 'pickaxe'
  | 'spear'
  | 'iron_sword'
  | 'iron_axe'
  | 'iron_shovel'
  | 'iron_pickaxe'
  | 'iron_spear'
  | 'gold_sword'
  | 'gold_axe'
  | 'gold_shovel'
  | 'gold_pickaxe'
  | 'gold_spear'
  | 'diamond_sword'
  | 'diamond_axe'
  | 'diamond_shovel'
  | 'diamond_pickaxe'
  | 'diamond_spear'
  | 'scissors'
  | 'leaves'
  | 'rope'
  | 'bow'
  | 'arrow'
  | 'iron_arrow'
  | 'gold_arrow'
  | 'diamond_arrow'
  | 'glowing_arrow'
  | 'glowing_iron_arrow'
  | 'glowing_gold_arrow'
  | 'glowing_diamond_arrow'
  | 'healing_gold_arrow'
  | 'glowing_healing_gold_arrow'
  | 'sapling'
  | 'glowberry_sapling'
  | 'crystal_berries'
  | 'glowing_orb'
  | 'torch'
  | 'chest'
  | 'bed'

export { itemIconMarkup }
export { CRAFT_RECIPES, type CraftRecipe }

export const INVENTORY_SLOT_COUNT = 9
export const BACKPACK_SLOT_COUNT = 27
const TOTAL_SLOTS = INVENTORY_SLOT_COUNT + BACKPACK_SLOT_COUNT

export type SlotStack = { item: InventoryItem; count: number }

/** External container (e.g. placed chest) shown beside the player inventory. */
export type ExternalContainer = {
  id: string
  title: string
  slots: (SlotStack | null)[]
}

export const ITEM_LABELS: Record<InventoryItem, string> = {
  wood: 'Wood',
  dirt: 'Dirt',
  stone: 'Stone',
  iron: 'Iron',
  gold: 'Gold',
  diamond: 'Diamond',
  stick: 'Stick',
  sword: 'Sword',
  axe: 'Axe',
  shovel: 'Shovel',
  pickaxe: 'Pickaxe',
  spear: 'Spear',
  iron_sword: 'Iron Sword',
  iron_axe: 'Iron Axe',
  iron_shovel: 'Iron Shovel',
  iron_pickaxe: 'Iron Pickaxe',
  iron_spear: 'Iron Spear',
  gold_sword: 'Gold Sword',
  gold_axe: 'Gold Axe',
  gold_shovel: 'Gold Shovel',
  gold_pickaxe: 'Gold Pickaxe',
  gold_spear: 'Gold Spear',
  diamond_sword: 'Diamond Sword',
  diamond_axe: 'Diamond Axe',
  diamond_shovel: 'Diamond Shovel',
  diamond_pickaxe: 'Diamond Pickaxe',
  diamond_spear: 'Diamond Spear',
  scissors: 'Scissors',
  leaves: 'Leaves',
  rope: 'Grass Rope',
  bow: 'Bow',
  arrow: 'Stone Arrow',
  iron_arrow: 'Iron Arrow',
  gold_arrow: 'Gold Arrow',
  diamond_arrow: 'Diamond Arrow',
  glowing_arrow: 'Glowing Stone Arrow',
  glowing_iron_arrow: 'Glowing Iron Arrow',
  glowing_gold_arrow: 'Glowing Gold Arrow',
  glowing_diamond_arrow: 'Glowing Diamond Arrow',
  healing_gold_arrow: 'Healing Gold Arrow',
  glowing_healing_gold_arrow: 'Glowing Healing Arrow',
  sapling: 'Sapling',
  glowberry_sapling: 'Glowberry Sapling',
  crystal_berries: 'Crystal Berries',
  glowing_orb: 'Glowing Orb',
  torch: 'Torch',
  chest: 'Chest',
  bed: 'Bed',
}

export const ALL_INVENTORY_ITEMS = Object.keys(ITEM_LABELS) as InventoryItem[]

/** Hotbar loadout for the M+7 debug cheat (diamond tools instead of stone). */
const DEBUG_HOTBAR_ITEMS: InventoryItem[] = [
  'wood',
  'dirt',
  'stone',
  'bow',
  'diamond_sword',
  'diamond_axe',
  'diamond_shovel',
  'diamond_pickaxe',
  'diamond_spear',
]

/** Stone- and iron-tier tools excluded from the M+7 debug cheat. */
const DEBUG_SKIP_ITEMS = new Set<InventoryItem>([
  'sword',
  'axe',
  'shovel',
  'pickaxe',
  'spear',
  'iron_sword',
  'iron_axe',
  'iron_shovel',
  'iron_pickaxe',
  'iron_spear',
])

const BUILDABLE: Record<InventoryItem, boolean> = {
  wood: true,
  dirt: true,
  stone: true,
  iron: true,
  gold: true,
  diamond: true,
  stick: false,
  sword: false,
  axe: false,
  shovel: false,
  pickaxe: false,
  spear: false,
  iron_sword: false,
  iron_axe: false,
  iron_shovel: false,
  iron_pickaxe: false,
  iron_spear: false,
  gold_sword: false,
  gold_axe: false,
  gold_shovel: false,
  gold_pickaxe: false,
  gold_spear: false,
  diamond_sword: false,
  diamond_axe: false,
  diamond_shovel: false,
  diamond_pickaxe: false,
  diamond_spear: false,
  scissors: false,
  leaves: false,
  rope: false,
  bow: false,
  arrow: false,
  iron_arrow: false,
  gold_arrow: false,
  diamond_arrow: false,
  glowing_arrow: false,
  glowing_iron_arrow: false,
  glowing_gold_arrow: false,
  glowing_diamond_arrow: false,
  healing_gold_arrow: false,
  glowing_healing_gold_arrow: false,
  sapling: false,
  glowberry_sapling: false,
  crystal_berries: false,
  glowing_orb: false,
  torch: false,
  chest: false,
  bed: false,
}

export const MAX_ITEM_STACK = 999

function maxStack(_item: InventoryItem): number {
  return MAX_ITEM_STACK
}

/** Heal amount for crystal-berry arrows — matches eating crystal berries. */
const HEALING_ARROW_HEAL_TOOLTIP = 5

/** True for weapons/tools that should show combat damage in inventory tooltips. */
function isDamageTooltipItem(item: InventoryItem): boolean {
  return (
    item === 'sword' ||
    item === 'axe' ||
    item === 'shovel' ||
    item === 'pickaxe' ||
    item === 'spear' ||
    item === 'iron_sword' ||
    item === 'iron_axe' ||
    item === 'iron_shovel' ||
    item === 'iron_pickaxe' ||
    item === 'iron_spear' ||
    item === 'gold_sword' ||
    item === 'gold_axe' ||
    item === 'gold_shovel' ||
    item === 'gold_pickaxe' ||
    item === 'gold_spear' ||
    item === 'diamond_sword' ||
    item === 'diamond_axe' ||
    item === 'diamond_shovel' ||
    item === 'diamond_pickaxe' ||
    item === 'diamond_spear' ||
    item === 'scissors' ||
    item === 'arrow' ||
    item === 'iron_arrow' ||
    item === 'gold_arrow' ||
    item === 'diamond_arrow' ||
    item === 'glowing_arrow' ||
    item === 'glowing_iron_arrow' ||
    item === 'glowing_gold_arrow' ||
    item === 'glowing_diamond_arrow'
  )
}

/** Combat damage shown on inventory hover; null when the item is not a tool/weapon. */
function itemDamageForTooltip(item: InventoryItem): number | null {
  if (!isDamageTooltipItem(item)) return null
  if (item === 'diamond_arrow' || item === 'glowing_diamond_arrow') {
    return DIAMOND_ARROW_DAMAGE
  }
  if (item === 'gold_arrow' || item === 'glowing_gold_arrow') {
    return GOLD_ARROW_DAMAGE
  }
  if (item === 'iron_arrow' || item === 'glowing_iron_arrow') {
    return IRON_ARROW_DAMAGE
  }
  if (item === 'arrow' || item === 'glowing_arrow') return ARROW_DAMAGE
  return meleeStatsForItem(item).damage
}

/** Melee range for tooltip; null for arrows (projectile) or non-combat items. */
function itemRangeForTooltip(item: InventoryItem): number | null {
  if (!isDamageTooltipItem(item)) return null
  if (
    item === 'arrow' ||
    item === 'iron_arrow' ||
    item === 'gold_arrow' ||
    item === 'diamond_arrow' ||
    item === 'glowing_arrow' ||
    item === 'glowing_iron_arrow' ||
    item === 'glowing_gold_arrow' ||
    item === 'glowing_diamond_arrow'
  ) {
    return null
  }
  return meleeStatsForItem(item).reach
}

function itemTooltipText(item: InventoryItem): string {
  const label = ITEM_LABELS[item]
  if (item === 'healing_gold_arrow') {
    return `${label}\nHeal: +${HEALING_ARROW_HEAL_TOOLTIP}\nDamage: 0`
  }
  if (item === 'glowing_healing_gold_arrow') {
    return `${label}\nHeal: +${HEALING_ARROW_HEAL_TOOLTIP}\nBlast: 1 m\nDamage: 0`
  }
  const damage = itemDamageForTooltip(item)
  if (damage == null) return label
  const range = itemRangeForTooltip(item)
  const isGlowArrow =
    item === 'glowing_arrow' ||
    item === 'glowing_iron_arrow' ||
    item === 'glowing_gold_arrow' ||
    item === 'glowing_diamond_arrow'
  if (range == null) {
    return isGlowArrow
      ? `${label}\nDamage: ${damage}\nBlast: 1 m`
      : `${label}\nDamage: ${damage}`
  }
  const rangeLabel = Number.isInteger(range) ? `${range}` : range.toFixed(1)
  return `${label}\nDamage: ${damage}\nRange: ${rangeLabel} m`
}

function itemTooltipHtml(item: InventoryItem): string {
  const lines = itemTooltipText(item).split('\n')
  return `<span class="inventory-tooltip" aria-hidden="true">${lines.join('<br>')}</span>`
}

function slotHtml(
  slot: SlotStack | null,
  index: number,
  opts: { hotbar?: boolean; selected?: boolean; chest?: boolean },
): string {
  const chest = opts.chest ?? false
  const hotbar = !chest && (opts.hotbar ?? index < INVENTORY_SLOT_COUNT)
  const selected = opts.selected ?? false
  const key = hotbar ? `<span class="inventory-key" aria-hidden="true">${index + 1}</span>` : ''
  const count =
    slot && slot.count > 1 ? `<span class="inventory-count">${slot.count}</span>` : ''
  const empty = !slot ? ' empty' : ''
  const sel = selected ? ' selected' : ''
  const dataItem = slot ? ` data-item="${slot.item}"` : ''
  const tooltip = slot ? itemTooltipHtml(slot.item) : ''
  const aria = slot
    ? ` aria-label="${itemTooltipText(slot.item).replace(/"/g, '&quot;').replace(/\n/g, ', ')}"`
    : ''
  const icon = slot ? itemIconMarkup(slot.item) : ''
  const region = chest ? 'chest' : hotbar ? 'hotbar' : 'backpack'
  const slotAttr = chest ? `data-chest-slot="${index}"` : `data-slot="${index}"`
  return `<div class="inventory-slot${empty}${sel}" ${slotAttr} data-region="${region}"${dataItem}${aria} role="button" tabindex="-1">
    ${key}
    ${icon}
    ${count}
    ${tooltip}
  </div>`
}

function craftTileHtml(recipe: CraftRecipe, canCraft: boolean): string {
  const label = ITEM_LABELS[recipe.output]
  const countLabel = recipe.outputCount > 1 ? `×${recipe.outputCount}` : ''
  const ingredients = recipe.ingredients
    .map(
      (ing) =>
        `<span class="craft-tile-ing" title="${ITEM_LABELS[ing.item]}">${itemIconMarkup(ing.item)}<span class="craft-tile-ing-count">${ing.count}</span></span>`,
    )
    .join('')

  return `<button type="button" class="craft-tile${canCraft ? '' : ' craft-tile--disabled'}" data-craft-recipe="${recipe.id}" title="${canCraft ? `Craft ${label}` : 'Not enough materials'}" aria-label="${label}${countLabel ? ` ${countLabel}` : ''}" ${canCraft ? '' : 'disabled'}>
    <span class="craft-tile-output">${itemIconMarkup(recipe.output)}${countLabel ? `<span class="craft-tile-out-count">${countLabel}</span>` : ''}</span>
    <span class="craft-tile-name">${label}</span>
    <span class="craft-tile-ingredients">${ingredients}</span>
  </button>`
}

export type InventoryDropHandler = (item: InventoryItem, count: number) => void

export class Inventory {
  private readonly slots: (SlotStack | null)[] = Array.from({ length: TOTAL_SLOTS }, () => null)
  private selectedIndex = 0
  private panelOpen = false
  private cursor: SlotStack | null = null
  private external: ExternalContainer | null = null
  private readonly hotbarRoot: HTMLElement
  private readonly panelRoot: HTMLElement
  private readonly panelInner: HTMLElement
  private readonly panelTitle: HTMLElement
  private readonly craftColumn: HTMLElement
  private readonly craftRoot: HTMLElement
  private readonly chestColumn: HTMLElement
  private readonly chestRoot: HTMLElement
  private readonly chestLabel: HTMLElement
  private readonly backpackRoot: HTMLElement
  private readonly cursorFloat: HTMLElement
  private wasLockedBeforePanel = false
  private lockChange?: (locked: boolean) => void
  private lastPointer = { x: 0, y: 0 }
  private onDropCursor: InventoryDropHandler | null = null
  private readonly onWindowPointerUp = (e: PointerEvent) => this.handleOutsidePointerUp(e)

  constructor(hotbarId = 'inventory-hud', panelId = 'inventory-panel') {
    const hotbar = document.getElementById(hotbarId)
    const panel = document.getElementById(panelId)
    if (!hotbar || !panel) throw new Error('Missing inventory DOM (#inventory-hud / #inventory-panel)')

    this.hotbarRoot = hotbar
    this.panelRoot = panel
    this.panelInner = panel.querySelector('.inventory-panel-inner') as HTMLElement
    this.panelTitle = panel.querySelector('.inventory-panel-title') as HTMLElement
    this.craftColumn = panel.querySelector('[data-craft-column]') as HTMLElement
    this.craftRoot = panel.querySelector('[data-craft-grid]') as HTMLElement
    this.chestColumn = panel.querySelector('[data-chest-column]') as HTMLElement
    this.chestRoot = panel.querySelector('[data-chest-grid]') as HTMLElement
    this.chestLabel = panel.querySelector('[data-chest-label]') as HTMLElement
    this.backpackRoot = panel.querySelector('[data-backpack-grid]') as HTMLElement
    this.cursorFloat = panel.querySelector('#inventory-cursor-float') as HTMLElement
    if (
      !this.panelInner ||
      !this.panelTitle ||
      !this.craftColumn ||
      !this.craftRoot ||
      !this.chestColumn ||
      !this.chestRoot ||
      !this.chestLabel ||
      !this.backpackRoot ||
      !this.cursorFloat
    ) {
      throw new Error('Missing inventory panel regions')
    }

    const closeBtn = panel.querySelector('[data-inventory-close]')
    closeBtn?.addEventListener('click', () => this.closePanel())
    panel.addEventListener('pointerdown', (e) => {
      if (e.target !== panel) return
      // Clicking the dimmed backdrop while holding a stack drops it into the world.
      if (this.cursor) {
        this.dropCursorStack()
        return
      }
      this.closePanel()
    })
    panel.addEventListener('pointerdown', (e) => this.onPanelPointerDown(e), true)
    panel.addEventListener('pointermove', (e) => this.onPanelPointerMove(e))
    window.addEventListener('pointerup', this.onWindowPointerUp)

    this.renderHotbar()
    this.renderPanel()
  }

  /** Called when the player drops the cursor stack outside the inventory UI. */
  setOnDropCursor(handler: InventoryDropHandler | null) {
    this.onDropCursor = handler
  }

  isPanelOpen() {
    return this.panelOpen
  }

  /** Id of the open external container, or null. */
  getOpenContainerId(): string | null {
    return this.external?.id ?? null
  }

  togglePanel(onLockChange?: (locked: boolean) => void) {
    if (onLockChange) this.lockChange = onLockChange
    if (this.panelOpen) this.closePanel()
    else this.openPanel()
  }

  openPanel(onLockChange?: (locked: boolean) => void) {
    if (onLockChange) this.lockChange = onLockChange
    if (this.panelOpen) {
      // Switching from chest → normal inventory keeps the panel open.
      if (this.external) {
        this.external = null
        this.renderPanel()
      }
      return
    }
    this.external = null
    this.panelOpen = true
    document.body.classList.add('inventory-open')
    this.panelRoot.hidden = false
    this.lastPointer.x = window.innerWidth * 0.5
    this.lastPointer.y = window.innerHeight * 0.5
    this.renderPanel()
    this.lockChange?.(false)
  }

  /** Open the panel showing an external container (chest) beside the player inventory. */
  openContainer(container: ExternalContainer, onLockChange?: (locked: boolean) => void) {
    if (onLockChange) this.lockChange = onLockChange
    this.external = container
    if (this.panelOpen) {
      this.renderPanel()
      return
    }
    this.panelOpen = true
    document.body.classList.add('inventory-open')
    this.panelRoot.hidden = false
    this.lastPointer.x = window.innerWidth * 0.5
    this.lastPointer.y = window.innerHeight * 0.5
    this.renderPanel()
    this.lockChange?.(false)
  }

  closePanel(onLockChange?: (locked: boolean) => void) {
    if (onLockChange) this.lockChange = onLockChange
    if (!this.panelOpen) return
    this.panelOpen = false
    this.external = null
    document.body.classList.remove('inventory-open')
    this.panelRoot.hidden = true
    if (this.cursor) {
      this.addStack(this.cursor.item, this.cursor.count)
      this.cursor = null
    }
    this.renderFloatingCursor()
    this.renderHotbar()
    this.renderPanel()
    if (this.wasLockedBeforePanel) this.lockChange?.(true)
    this.wasLockedBeforePanel = false
  }

  /** Call before openPanel when pointer was locked — restore on close. */
  noteLockedBeforePanel(locked: boolean) {
    if (locked) this.wasLockedBeforePanel = true
  }

  /** Add items; returns how many were actually stored (remainder when full). */
  add(item: InventoryItem, amount = 1): number {
    if (amount <= 0) return 0
    const added = this.addStack(item, amount)
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
    return added
  }

  /** Remove every slot (+ cursor) and return the stacks — used on death. */
  takeAllStacks(): { item: InventoryItem; count: number }[] {
    const out: { item: InventoryItem; count: number }[] = []
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      if (!slot) continue
      out.push({ item: slot.item, count: slot.count })
      this.slots[i] = null
    }
    if (this.cursor) {
      out.push({ item: this.cursor.item, count: this.cursor.count })
      this.cursor = null
    }
    this.renderFloatingCursor()
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
    return out
  }

  /** Drop the floating cursor stack into the world (if a drop handler is set). */
  dropCursorStack(): boolean {
    if (!this.cursor || !this.onDropCursor) return false
    const { item, count } = this.cursor
    this.cursor = null
    this.renderFloatingCursor()
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
    this.onDropCursor(item, count)
    return true
  }

  /** Debug cheat: one stack of every item type (skip sticks so spear fits on the hotbar). */
  giveAllItems(amount = 64) {
    for (const item of DEBUG_HOTBAR_ITEMS) {
      this.addStack(item, amount)
    }
    for (const item of ALL_INVENTORY_ITEMS) {
      if (item === 'stick') continue
      if (DEBUG_SKIP_ITEMS.has(item)) continue
      if (DEBUG_HOTBAR_ITEMS.includes(item)) continue
      this.addStack(item, amount)
    }
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
  }

  private addStack(item: InventoryItem, amount: number): number {
    let remaining = amount
    const cap = maxStack(item)

    for (const slot of this.slots) {
      if (remaining <= 0) break
      if (slot?.item !== item) continue
      const room = cap - slot.count
      if (room <= 0) continue
      const take = Math.min(room, remaining)
      slot.count += take
      remaining -= take
    }

    while (remaining > 0) {
      const empty = this.slots.findIndex((s) => s === null)
      if (empty < 0) break
      const take = Math.min(cap, remaining)
      this.slots[empty] = { item, count: take }
      remaining -= take
    }

    return amount - remaining
  }

  consumeSelected(amount = 1): boolean {
    if (amount <= 0) return true
    const slot = this.slots[this.selectedIndex]
    if (!slot || slot.count < amount) return false
    slot.count -= amount
    if (slot.count <= 0) this.slots[this.selectedIndex] = null
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
    return true
  }

  /** Consume `amount` of `item` from any slots (hotbar + backpack). */
  consumeItem(item: InventoryItem, amount = 1): boolean {
    if (amount <= 0) return true
    if (this.countItem(item) < amount) return false
    let need = amount
    for (let i = 0; i < this.slots.length && need > 0; i++) {
      const slot = this.slots[i]
      if (!slot || slot.item !== item) continue
      const take = Math.min(slot.count, need)
      slot.count -= take
      need -= take
      if (slot.count <= 0) this.slots[i] = null
    }
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
    return need <= 0
  }

  getSelected(): InventoryItem | null {
    return this.slots[this.selectedIndex]?.item ?? null
  }

  getSelectedCount(): number {
    return this.slots[this.selectedIndex]?.count ?? 0
  }

  selectedIsBuildable() {
    const item = this.getSelected()
    return item !== null && BUILDABLE[item]
  }

  getSelectedBuildable(): 'wood' | 'dirt' | 'stone' | 'iron' | 'gold' | 'diamond' | null {
    const item = this.getSelected()
    if (
      item === 'wood' ||
      item === 'dirt' ||
      item === 'stone' ||
      item === 'iron' ||
      item === 'gold' ||
      item === 'diamond'
    ) {
      return item
    }
    return null
  }

  /** Sword / spear — combat only; no mining or dig overlay. */
  isSwordOrSpearEquipped() {
    const item = this.getSelected()
    return (
      item === 'sword' ||
      item === 'spear' ||
      item === 'iron_sword' ||
      item === 'iron_spear' ||
      item === 'gold_sword' ||
      item === 'gold_spear' ||
      item === 'diamond_sword' ||
      item === 'diamond_spear'
    )
  }

  /** Axe — combat + chopping trees only (no dirt/stone dig overlay). */
  isAxeEquipped() {
    const item = this.getSelected()
    return (
      item === 'axe' ||
      item === 'iron_axe' ||
      item === 'gold_axe' ||
      item === 'diamond_axe'
    )
  }

  /** Sword / axe / spear — melee combat weapons. */
  hasWeaponEquipped() {
    return this.isSwordOrSpearEquipped() || this.isAxeEquipped()
  }

  /** Selected stack in hand (null if empty slot). */
  getHeldItem(): InventoryItem | null {
    if (this.getSelectedCount() <= 0) return null
    return this.getSelected()
  }

  selectIndex(index: number) {
    if (index < 0 || index >= INVENTORY_SLOT_COUNT) return
    if (this.selectedIndex === index) return
    this.selectedIndex = index
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
  }

  cycle(dir: number) {
    const next =
      (this.selectedIndex + dir + INVENTORY_SLOT_COUNT) % INVENTORY_SLOT_COUNT
    this.selectIndex(next)
  }

  countItem(item: InventoryItem): number {
    let n = 0
    for (const slot of this.slots) {
      if (slot?.item === item) n += slot.count
    }
    if (this.cursor?.item === item) n += this.cursor.count
    return n
  }

  canCraft(recipe: CraftRecipe): boolean {
    for (const ing of recipe.ingredients) {
      if (this.countItem(ing.item) < ing.count) return false
    }
    return true
  }

  craft(recipeId: string): boolean {
    const recipe = CRAFT_RECIPES.find((r) => r.id === recipeId)
    if (!recipe || !this.canCraft(recipe)) return false

    for (const ing of recipe.ingredients) {
      let need = ing.count
      for (let i = 0; i < this.slots.length && need > 0; i++) {
        const slot = this.slots[i]
        if (!slot || slot.item !== ing.item) continue
        const take = Math.min(slot.count, need)
        slot.count -= take
        need -= take
        if (slot.count <= 0) this.slots[i] = null
      }
    }

    this.addStack(recipe.output, recipe.outputCount)
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
    return true
  }

  private onPanelPointerMove(e: PointerEvent) {
    this.lastPointer.x = e.clientX
    this.lastPointer.y = e.clientY
    this.positionFloatingCursor(e.clientX, e.clientY)
  }

  private positionFloatingCursor(x: number, y: number) {
    if (!this.cursor) return
    this.cursorFloat.style.left = `${x}px`
    this.cursorFloat.style.top = `${y}px`
  }

  private pointerOverPanelInner(x: number, y: number): boolean {
    const el = document.elementFromPoint(x, y)
    if (!el) return false
    return this.panelInner.contains(el) || this.cursorFloat.contains(el)
  }

  /** Release outside the inventory window while holding a stack → drop. */
  private handleOutsidePointerUp(e: PointerEvent) {
    if (!this.panelOpen || !this.cursor) return
    if (this.pointerOverPanelInner(e.clientX, e.clientY)) return
    this.dropCursorStack()
  }

  private onPanelPointerDown(e: PointerEvent) {
    if (!this.panelOpen) return
    const target = (e.target as HTMLElement).closest(
      '[data-slot], [data-chest-slot], [data-craft-recipe]',
    ) as HTMLElement | null
    if (!target) return

    e.preventDefault()
    e.stopPropagation()

    this.lastPointer.x = e.clientX
    this.lastPointer.y = e.clientY

    const recipeId = target.getAttribute('data-craft-recipe')
    if (recipeId) {
      this.craft(recipeId)
      return
    }

    const chestIndex = target.getAttribute('data-chest-slot')
    if (chestIndex !== null) {
      this.clickExternalSlot(Number(chestIndex))
      return
    }

    const slotIndex = target.getAttribute('data-slot')
    if (slotIndex !== null) this.clickSlot(Number(slotIndex))
  }

  private clickExternalSlot(index: number) {
    if (!this.external) return
    if (index < 0 || index >= this.external.slots.length) return
    const stack = this.external.slots[index]

    if (!this.cursor) {
      if (!stack) return
      this.cursor = { item: stack.item, count: stack.count }
      this.external.slots[index] = null
      this.refresh()
      return
    }

    if (!stack) {
      this.external.slots[index] = { item: this.cursor.item, count: this.cursor.count }
      this.cursor = null
      this.refresh()
      return
    }

    if (stack.item === this.cursor.item) {
      const cap = maxStack(stack.item)
      const room = cap - stack.count
      if (room > 0) {
        const move = Math.min(room, this.cursor.count)
        stack.count += move
        this.cursor.count -= move
        if (this.cursor.count <= 0) this.cursor = null
      } else {
        this.swapExternalStacks(index)
      }
    } else {
      this.swapExternalStacks(index)
    }
    this.refresh()
  }

  private swapExternalStacks(index: number) {
    if (!this.cursor || !this.external) return
    const prev = this.external.slots[index]
    this.external.slots[index] = { item: this.cursor.item, count: this.cursor.count }
    this.cursor = prev ? { item: prev.item, count: prev.count } : null
  }

  private clickSlot(index: number) {
    const stack = this.slots[index]

    if (!this.cursor) {
      if (!stack) return
      this.cursor = { item: stack.item, count: stack.count }
      this.slots[index] = null
      this.refresh()
      return
    }

    if (!stack) {
      this.slots[index] = { item: this.cursor.item, count: this.cursor.count }
      this.cursor = null
      this.refresh()
      return
    }

    if (stack.item === this.cursor.item) {
      const cap = maxStack(stack.item)
      const room = cap - stack.count
      if (room > 0) {
        const move = Math.min(room, this.cursor.count)
        stack.count += move
        this.cursor.count -= move
        if (this.cursor.count <= 0) this.cursor = null
      } else {
        this.swapStacks(index)
      }
    } else {
      this.swapStacks(index)
    }
    this.refresh()
  }

  private swapStacks(index: number) {
    if (!this.cursor) return
    const prev = this.slots[index]
    this.slots[index] = { item: this.cursor.item, count: this.cursor.count }
    this.cursor = prev ? { item: prev.item, count: prev.count } : null
  }

  private refresh() {
    this.renderHotbar()
    if (this.panelOpen) this.renderPanel()
  }

  private renderHotbar() {
    const items = this.slots.slice(0, INVENTORY_SLOT_COUNT).map((slot, i) =>
      slotHtml(slot, i, { hotbar: true, selected: i === this.selectedIndex }),
    )
    this.hotbarRoot.innerHTML = items.join('')
  }

  private renderCraftGrid() {
    this.craftRoot.innerHTML = CRAFT_RECIPES.map((recipe) =>
      craftTileHtml(recipe, this.canCraft(recipe)),
    ).join('')
  }

  private renderFloatingCursor() {
    const hasCursor = this.cursor !== null
    this.cursorFloat.hidden = !hasCursor
    if (!hasCursor) {
      this.cursorFloat.innerHTML = ''
      return
    }
    const cursor = this.cursor!
    const count =
      cursor.count > 1
        ? `<span class="inventory-count">${cursor.count}</span>`
        : ''
    this.cursorFloat.innerHTML = `${itemIconMarkup(cursor.item)}${count}`
    this.positionFloatingCursor(this.lastPointer.x, this.lastPointer.y)
  }

  private renderPanel() {
    if (!this.panelOpen) return

    const chestMode = this.external !== null
    this.panelTitle.textContent = chestMode ? this.external!.title : 'Inventory'
    this.craftColumn.hidden = chestMode
    this.chestColumn.hidden = !chestMode

    if (chestMode) {
      this.chestLabel.textContent = this.external!.title
      this.chestRoot.innerHTML = this.external!.slots
        .map((slot, i) => slotHtml(slot, i, { chest: true }))
        .join('')
    } else {
      this.renderCraftGrid()
    }

    const backpack = this.slots
      .slice(INVENTORY_SLOT_COUNT)
      .map((slot, i) => slotHtml(slot, INVENTORY_SLOT_COUNT + i, { hotbar: false }))
    this.backpackRoot.innerHTML = backpack.join('')

    const hotbar = this.slots
      .slice(0, INVENTORY_SLOT_COUNT)
      .map((slot, i) =>
        slotHtml(slot, i, { hotbar: true, selected: i === this.selectedIndex }),
      )
    const hotbarEl = this.panelRoot.querySelector('[data-panel-hotbar]') as HTMLElement
    hotbarEl.innerHTML = hotbar.join('')

    this.renderFloatingCursor()
  }
}
