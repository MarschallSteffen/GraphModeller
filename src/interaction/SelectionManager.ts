export type { SelectableKind } from '../types.ts'
import type { SelectableKind } from '../types.ts'

export interface Selectable {
  kind: SelectableKind
  id: string
}

type ChangeListener = (selected: Selectable[]) => void

export class SelectionManager {
  private selected: Selectable[] = []
  private listeners: ChangeListener[] = []

  select(item: Selectable, additive = false) {
    if (!additive) {
      this.selected = [item]
    } else {
      const exists = this.selected.some(s => s.id === item.id)
      if (exists) {
        this.selected = this.selected.filter(s => s.id !== item.id)
      } else {
        this.selected = [...this.selected, item]
      }
    }
    this.notify()
  }

  clear() {
    if (this.selected.length === 0) return
    this.selected = []
    this.notify()
  }

  isSelected(id: string) {
    return this.selected.some(s => s.id === id)
  }

  get items() { return this.selected }

  get single(): Selectable | null {
    return this.selected.length === 1 ? this.selected[0] : null
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter(l => l !== listener) }
  }

  private notify() {
    this.listeners.forEach(l => l(this.selected))
  }
}
