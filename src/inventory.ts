export type InventoryItem = 'wood' | 'stone'

const LABELS: Record<InventoryItem, string> = {
  wood: 'Wood',
  stone: 'Stone',
}

const ICONS: Record<InventoryItem, string> = {
  wood: '🪵',
  stone: '🪨',
}

export class Inventory {
  private counts: Record<InventoryItem, number> = { wood: 0, stone: 0 }
  private readonly root: HTMLElement

  constructor(rootId = 'inventory-hud') {
    const el = document.getElementById(rootId)
    if (!el) throw new Error(`Missing #${rootId}`)
    this.root = el
    this.render()
  }

  add(item: InventoryItem, amount = 1) {
    if (amount <= 0) return
    this.counts[item] += amount
    this.render()
  }

  get(item: InventoryItem) {
    return this.counts[item]
  }

  private render() {
    const items = (Object.keys(this.counts) as InventoryItem[]).map((key) => {
      const count = this.counts[key]
      return `<div class="inventory-slot" data-item="${key}">
        <span class="inventory-icon" aria-hidden="true">${ICONS[key]}</span>
        <span class="inventory-label">${LABELS[key]}</span>
        <span class="inventory-count">${count}</span>
      </div>`
    })
    this.root.innerHTML = items.join('')
  }
}
