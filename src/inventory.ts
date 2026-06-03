import { CRAFT_RECIPES, type CraftRecipe } from './craftRecipes'
import { itemIconMarkup } from './itemIcons'

export type InventoryItem =
  | 'wood'
  | 'dirt'
  | 'stone'
  | 'stick'
  | 'sword'
  | 'axe'
  | 'shovel'
  | 'pickaxe'
  | 'spear'
  | 'crystal_berries'
  | 'glowing_orb'
  | 'torch'

export { itemIconMarkup }
export { CRAFT_RECIPES, type CraftRecipe }

export const INVENTORY_SLOT_COUNT = 9
export const BACKPACK_SLOT_COUNT = 27
const TOTAL_SLOTS = INVENTORY_SLOT_COUNT + BACKPACK_SLOT_COUNT

type SlotStack = { item: InventoryItem; count: number }

export const ITEM_LABELS: Record<InventoryItem, string> = {
  wood: 'Wood',
  dirt: 'Dirt',
  stone: 'Stone',
  stick: 'Stick',
  sword: 'Sword',
  axe: 'Axe',
  shovel: 'Shovel',
  pickaxe: 'Pickaxe',
  spear: 'Spear',
  crystal_berries: 'Crystal Berries',
  glowing_orb: 'Glowing Orb',
  torch: 'Torch',
}

const BUILDABLE: Record<InventoryItem, boolean> = {
  wood: true,
  dirt: true,
  stone: true,
  stick: false,
  sword: false,
  axe: false,
  shovel: false,
  pickaxe: false,
  spear: false,
  crystal_berries: false,
  glowing_orb: false,
  torch: false,
}

export const MAX_ITEM_STACK = 999

function maxStack(_item: InventoryItem): number {
  return MAX_ITEM_STACK
}

function slotHtml(
  slot: SlotStack | null,
  index: number,
  opts: { hotbar?: boolean; selected?: boolean },
): string {
  const hotbar = opts.hotbar ?? index < INVENTORY_SLOT_COUNT
  const selected = opts.selected ?? false
  const key = hotbar ? `<span class="inventory-key" aria-hidden="true">${index + 1}</span>` : ''
  const count =
    slot && slot.count > 1 ? `<span class="inventory-count">${slot.count}</span>` : ''
  const empty = !slot ? ' empty' : ''
  const sel = selected ? ' selected' : ''
  const dataItem = slot ? ` data-item="${slot.item}"` : ''
  const title = slot ? ` title="${ITEM_LABELS[slot.item]}"` : ''
  const icon = slot ? itemIconMarkup(slot.item) : ''
  const region = hotbar ? 'hotbar' : 'backpack'
  return `<div class="inventory-slot${empty}${sel}" data-slot="${index}" data-region="${region}"${dataItem}${title} role="button" tabindex="-1">
    ${key}
    ${icon}
    ${count}
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

export class Inventory {
  private readonly slots: (SlotStack | null)[] = Array.from({ length: TOTAL_SLOTS }, () => null)
  private selectedIndex = 0
  private panelOpen = false
  private cursor: SlotStack | null = null
  private readonly hotbarRoot: HTMLElement
  private readonly panelRoot: HTMLElement
  private readonly craftRoot: HTMLElement
  private readonly backpackRoot: HTMLElement
  private readonly cursorFloat: HTMLElement
  private wasLockedBeforePanel = false
  private lockChange?: (locked: boolean) => void
  private lastPointer = { x: 0, y: 0 }

  constructor(hotbarId = 'inventory-hud', panelId = 'inventory-panel') {
    const hotbar = document.getElementById(hotbarId)
    const panel = document.getElementById(panelId)
    if (!hotbar || !panel) throw new Error('Missing inventory DOM (#inventory-hud / #inventory-panel)')

    this.hotbarRoot = hotbar
    this.panelRoot = panel
    this.craftRoot = panel.querySelector('[data-craft-grid]') as HTMLElement
    this.backpackRoot = panel.querySelector('[data-backpack-grid]') as HTMLElement
    this.cursorFloat = panel.querySelector('#inventory-cursor-float') as HTMLElement
    if (!this.craftRoot || !this.backpackRoot || !this.cursorFloat) {
      throw new Error('Missing inventory panel regions')
    }

    const closeBtn = panel.querySelector('[data-inventory-close]')
    closeBtn?.addEventListener('click', () => this.closePanel())
    panel.addEventListener('pointerdown', (e) => {
      if (e.target === panel) this.closePanel()
    })
    panel.addEventListener('pointerdown', (e) => this.onPanelPointerDown(e), true)
    panel.addEventListener('pointermove', (e) => this.onPanelPointerMove(e))

    this.renderHotbar()
    this.renderPanel()
  }

  isPanelOpen() {
    return this.panelOpen
  }

  togglePanel(onLockChange?: (locked: boolean) => void) {
    if (onLockChange) this.lockChange = onLockChange
    if (this.panelOpen) this.closePanel()
    else this.openPanel()
  }

  openPanel(onLockChange?: (locked: boolean) => void) {
    if (onLockChange) this.lockChange = onLockChange
    if (this.panelOpen) return
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

  add(item: InventoryItem, amount = 1) {
    if (amount <= 0) return
    this.addStack(item, amount)
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

  getSelectedBuildable(): 'wood' | 'dirt' | 'stone' | null {
    const item = this.getSelected()
    if (item === 'wood' || item === 'dirt' || item === 'stone') return item
    return null
  }

  hasWeaponEquipped() {
    const item = this.getSelected()
    return item === 'sword' || item === 'axe'
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

  private onPanelPointerDown(e: PointerEvent) {
    if (!this.panelOpen) return
    const target = (e.target as HTMLElement).closest(
      '[data-slot], [data-craft-recipe]',
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

    const slotIndex = target.getAttribute('data-slot')
    if (slotIndex !== null) this.clickSlot(Number(slotIndex))
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
    this.renderCraftGrid()

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
