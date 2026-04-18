import type { SelectionManager } from '../interaction/SelectionManager.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import type { ElementKind } from '../types.ts'

export interface SearchItem {
  id: string
  kind: ElementKind
  name: string
}

export interface SearchPanelCallbacks {
  getItems: () => SearchItem[]
  onSelect: (item: SearchItem) => void
}

const KIND_LABELS: Partial<Record<ElementKind, string>> = {
  'class':       'Class',
  'package':     'Package',
  'storage':     'Storage',
  'actor':       'Actor',
  'queue':       'Queue',
  'use-case':    'Use Case',
  'uc-system':   'System',
  'state':       'State',
  'start-state': 'Start State',
  'end-state':   'End State',
  'seq-diagram': 'Sequence',
  'seq-fragment':'Fragment',
  'comment':     'Comment',
}

export class SearchPanel {
  private panel: HTMLElement | null = null
  private input: HTMLInputElement | null = null
  private list: HTMLElement | null = null
  private highlightIdx = -1
  private results: SearchItem[] = []
  private callbacks: SearchPanelCallbacks

  private onOutside: (e: MouseEvent) => void
  private onKey: (e: KeyboardEvent) => void

  constructor(callbacks: SearchPanelCallbacks) {
    this.callbacks = callbacks
    this.onOutside = (e: MouseEvent) => {
      if (this.panel && !this.panel.contains(e.target as Node)) {
        this.hide()
      }
    }
    this.onKey = (e: KeyboardEvent) => {
      if (!this.panel) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.hide()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        this.moveHighlight(1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        this.moveHighlight(-1)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        this.confirmHighlighted()
        return
      }
    }
  }

  get isOpen(): boolean {
    return this.panel !== null
  }

  show() {
    if (this.panel) {
      this.input!.focus()
      return
    }

    const layer = document.getElementById('popover-layer')!

    this.panel = document.createElement('div')
    this.panel.id = 'search-panel'
    this.panel.classList.add('search-panel')

    const inputWrap = document.createElement('div')
    inputWrap.classList.add('search-panel-input-wrap')

    this.input = document.createElement('input')
    this.input.type = 'text'
    this.input.placeholder = 'Search elements by name...'
    this.input.classList.add('search-panel-input')
    this.input.setAttribute('autocomplete', 'off')
    this.input.setAttribute('spellcheck', 'false')
    this.input.addEventListener('input', () => this.onInput())

    inputWrap.appendChild(this.input)

    this.list = document.createElement('div')
    this.list.classList.add('search-panel-list')
    this.list.hidden = true

    this.panel.appendChild(inputWrap)
    this.panel.appendChild(this.list)
    layer.appendChild(this.panel)

    this.input.focus()

    setTimeout(() => {
      document.addEventListener('mousedown', this.onOutside)
      document.addEventListener('keydown', this.onKey, true)
    }, 50)
  }

  hide() {
    if (!this.panel) return
    this.panel.remove()
    this.panel = null
    this.input = null
    this.list = null
    this.results = []
    this.highlightIdx = -1
    document.removeEventListener('mousedown', this.onOutside)
    document.removeEventListener('keydown', this.onKey, true)
  }

  private onInput() {
    const query = this.input!.value.trim().toLowerCase()
    if (!query) {
      this.results = []
      this.renderResults()
      return
    }

    this.results = this.callbacks.getItems()
      .filter(item => item.name.toLowerCase().includes(query))
      .slice(0, 20)
    this.highlightIdx = this.results.length > 0 ? 0 : -1
    this.renderResults()
  }

  private renderResults() {
    const list = this.list!
    list.innerHTML = ''

    if (this.results.length === 0) {
      list.hidden = true
      this.panel!.classList.remove('search-panel--has-results')
      return
    }

    list.hidden = false
    this.panel!.classList.add('search-panel--has-results')

    this.results.forEach((item, i) => {
      const row = document.createElement('button')
      row.type = 'button'
      row.classList.add('search-result-row')
      if (i === this.highlightIdx) row.classList.add('highlighted')

      const nameEl = document.createElement('span')
      nameEl.classList.add('search-result-name')
      nameEl.textContent = item.name || '(unnamed)'

      const kindEl = document.createElement('span')
      kindEl.classList.add('search-result-kind')
      kindEl.textContent = KIND_LABELS[item.kind] ?? item.kind

      row.appendChild(nameEl)
      row.appendChild(kindEl)

      row.addEventListener('mousedown', e => {
        e.preventDefault()
        this.callbacks.onSelect(item)
        this.hide()
      })

      list.appendChild(row)
    })
  }

  private moveHighlight(delta: number) {
    if (this.results.length === 0) return
    const list = this.list!
    const rows = list.querySelectorAll<HTMLElement>('.search-result-row')
    rows[this.highlightIdx]?.classList.remove('highlighted')
    this.highlightIdx = (this.highlightIdx + delta + this.results.length) % this.results.length
    const next = rows[this.highlightIdx]
    next?.classList.add('highlighted')
    next?.scrollIntoView({ block: 'nearest' })
  }

  private confirmHighlighted() {
    if (this.highlightIdx < 0 || this.highlightIdx >= this.results.length) return
    this.callbacks.onSelect(this.results[this.highlightIdx])
    this.hide()
  }
}

/**
 * Create and wire a SearchPanel given store, selection, and the SVG canvas element.
 */
export function createSearchPanel(
  store: DiagramStore,
  selection: SelectionManager,
  getSvg: () => SVGSVGElement,
  applyViewport: () => void,
  ELEMENTS: Array<{ kind: ElementKind; collection: string }>,
) {
  return new SearchPanel({
    getItems() {
      return ELEMENTS.flatMap(desc => {
        const col = (store.state[desc.collection as keyof typeof store.state] as any[]) ?? []
        return col.map((el: any) => ({
          id:   el.id as string,
          kind: desc.kind,
          name: (el.name ?? '') as string,
        }))
      })
    },
    onSelect(item) {
      selection.select({ kind: item.kind, id: item.id })

      const el = store.findElementById(item.kind, item.id)
      if (!el) return

      const svg = getSvg()
      const rect = svg.getBoundingClientRect()
      const { zoom } = store.state.viewport
      const cx = el.position.x + el.size.w / 2
      const cy = el.position.y + el.size.h / 2
      store.updateViewport({
        x: rect.width  / 2 - cx * zoom,
        y: rect.height / 2 - cy * zoom,
        zoom,
      })
      applyViewport()
    },
  })
}
