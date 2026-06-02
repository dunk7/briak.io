export type InventoryItem = 'wood' | 'dirt' | 'stone'

export const INVENTORY_SLOT_COUNT = 9

type Slot = { item: InventoryItem; count: number }

const LABELS: Record<InventoryItem, string> = {
  wood: 'Wood',
  dirt: 'Dirt',
  stone: 'Stone',
}

/** Items that can be placed as build blocks. */
const BUILDABLE: Record<InventoryItem, boolean> = {
  wood: true,
  dirt: true,
  stone: true,
}

export class Inventory {
  private readonly slots: (Slot | null)[] = Array.from({ length: INVENTORY_SLOT_COUNT }, () => null)
  private selectedIndex = 0
  private readonly root: HTMLElement

  constructor(rootId = 'inventory-hud') {
    const el = document.getElementById(rootId)
    if (!el) throw new Error(`Missing #${rootId}`)
    this.root = el
    this.render()
  }

  add(item: InventoryItem, amount = 1) {
    if (amount <= 0) return
    let remaining = amount

    for (const slot of this.slots) {
      if (slot?.item === item) {
        slot.count += remaining
        remaining = 0
        break
      }
    }

    while (remaining > 0) {
      const empty = this.slots.findIndex((s) => s === null)
      if (empty < 0) break
      this.slots[empty] = { item, count: remaining }
      remaining = 0
    }

    this.render()
  }

  /** Spend `amount` from the selected slot; returns false when empty or short. */
  consumeSelected(amount = 1): boolean {
    if (amount <= 0) return true
    const slot = this.slots[this.selectedIndex]
    if (!slot || slot.count < amount) return false
    slot.count -= amount
    if (slot.count <= 0) this.slots[this.selectedIndex] = null
    this.render()
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

  selectIndex(index: number) {
    if (index < 0 || index >= INVENTORY_SLOT_COUNT) return
    if (this.selectedIndex === index) return
    this.selectedIndex = index
    this.render()
  }

  /** Step the selection by `dir` slots, wrapping around. */
  cycle(dir: number) {
    const next =
      (this.selectedIndex + dir + INVENTORY_SLOT_COUNT) % INVENTORY_SLOT_COUNT
    this.selectIndex(next)
  }

  private iconMarkup(item: InventoryItem): string {
    if (item === 'dirt') {
      return `<span class="inventory-icon inventory-icon--dirt" aria-hidden="true"></span>`
    }
    if (item === 'wood') {
      return `<span class="inventory-icon inventory-icon--wood" aria-hidden="true"></span>`
    }
    return `<span class="inventory-icon inventory-icon--stone" aria-hidden="true"></span>`
  }

  private render() {
    const items = this.slots.map((slot, i) => {
      const selected = i === this.selectedIndex ? ' selected' : ''
      if (!slot) {
        return `<div class="inventory-slot empty${selected}" data-slot="${i}">
        <span class="inventory-key" aria-hidden="true">${i + 1}</span>
      </div>`
      }
      return `<div class="inventory-slot${selected}" data-slot="${i}" data-item="${slot.item}" title="${LABELS[slot.item]}">
        <span class="inventory-key" aria-hidden="true">${i + 1}</span>
        ${this.iconMarkup(slot.item)}
        <span class="inventory-count">${slot.count}</span>
      </div>`
    })
    this.root.innerHTML = items.join('')
  }
}
