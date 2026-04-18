import type { DiagramStore } from '../store/DiagramStore.ts'
import type { SelectionManager } from '../interaction/SelectionManager.ts'
import type { ElementKind } from '../types.ts'

export interface AlignmentToolbarCallbacks {
  refreshConnections: () => void
}

type ElementInfo = { kind: ElementKind; id: string; x: number; y: number; w: number; h: number }

export class AlignmentToolbar {
  private el: HTMLElement
  private distributeHBtn: HTMLButtonElement
  private distributeVBtn: HTMLButtonElement

  constructor(
    private store: DiagramStore,
    private selection: SelectionManager,
    private callbacks: AlignmentToolbarCallbacks,
  ) {
    this.el = document.createElement('div')
    this.el.id = 'alignment-toolbar'
    this.el.className = 'alignment-toolbar'
    this.el.style.display = 'none'

    this.el.appendChild(this.buildGroup([
      this.btn('align-left',   'Align left edges',        this.alignLeft.bind(this),    alignLeftSvg()),
      this.btn('align-cx',     'Center horizontally',     this.alignCenterH.bind(this), alignCxSvg()),
      this.btn('align-right',  'Align right edges',       this.alignRight.bind(this),   alignRightSvg()),
    ]))

    this.el.appendChild(this.buildSep())

    this.el.appendChild(this.buildGroup([
      this.btn('align-top',    'Align top edges',         this.alignTop.bind(this),     alignTopSvg()),
      this.btn('align-cy',     'Center vertically',       this.alignCenterV.bind(this), alignCySvg()),
      this.btn('align-bottom', 'Align bottom edges',      this.alignBottom.bind(this),  alignBottomSvg()),
    ]))

    this.el.appendChild(this.buildSep())

    this.distributeHBtn = this.btn('dist-h', 'Distribute horizontally (3+ elements)', this.distributeH.bind(this), distHSvg())
    this.distributeVBtn = this.btn('dist-v', 'Distribute vertically (3+ elements)',   this.distributeV.bind(this), distVSvg())
    this.el.appendChild(this.buildGroup([this.distributeHBtn, this.distributeVBtn]))

    const popoverLayer = document.getElementById('popover-layer')
    ;(popoverLayer ?? document.body).appendChild(this.el)
  }

  private btn(id: string, title: string, onClick: () => void, svgContent: string): HTMLButtonElement {
    const b = document.createElement('button')
    b.className = 'align-btn'
    b.id = `align-btn-${id}`
    b.title = title
    b.innerHTML = svgContent
    b.addEventListener('click', onClick)
    return b
  }

  private buildGroup(btns: HTMLButtonElement[]): HTMLElement {
    const g = document.createElement('div')
    g.className = 'align-btn-group'
    btns.forEach(b => g.appendChild(b))
    return g
  }

  private buildSep(): HTMLElement {
    const s = document.createElement('div')
    s.className = 'align-sep'
    return s
  }

  update(items: Array<{ kind: string; id: string }>) {
    const els = this.getElementInfos(items)
    if (els.length < 2) {
      this.el.style.display = 'none'
      return
    }
    this.el.style.display = 'flex'

    const canDist = els.length >= 3
    this.distributeHBtn.disabled = !canDist
    this.distributeVBtn.disabled = !canDist
    this.distributeHBtn.classList.toggle('align-btn--disabled', !canDist)
    this.distributeVBtn.classList.toggle('align-btn--disabled', !canDist)
  }

  private getElementInfos(items: Array<{ kind: string; id: string }>): ElementInfo[] {
    const result: ElementInfo[] = []
    for (const item of items) {
      if (item.kind === 'connection') continue
      const el = this.store.findElementById(item.kind as ElementKind, item.id)
      if (!el) continue
      result.push({ kind: item.kind as ElementKind, id: item.id, x: el.position.x, y: el.position.y, w: el.size.w, h: el.size.h })
    }
    return result
  }

  private apply(fn: (els: ElementInfo[]) => Array<{ kind: ElementKind; id: string; x: number; y: number }>) {
    const els = this.getElementInfos(this.selection.items as Array<{ kind: string; id: string }>)
    if (els.length < 2) return

    const updates = fn(els)
    this.store.beginUndoGroup()
    for (const u of updates) {
      const info = els.find(e => e.id === u.id)
      if (!info) continue
      this.store.updateElementPosition(u.kind, u.id, { position: { x: u.x, y: u.y }, size: { w: info.w, h: info.h } })
    }
    this.store.endUndoGroup()
    this.callbacks.refreshConnections()
  }

  private alignLeft() {
    this.apply(els => {
      const minX = els.reduce((m, e) => Math.min(m, e.x), Infinity)
      return els.map(e => ({ kind: e.kind, id: e.id, x: minX, y: e.y }))
    })
  }

  private alignCenterH() {
    this.apply(els => {
      const avgCx = els.reduce((s, e) => s + e.x + e.w / 2, 0) / els.length
      return els.map(e => ({ kind: e.kind, id: e.id, x: avgCx - e.w / 2, y: e.y }))
    })
  }

  private alignRight() {
    this.apply(els => {
      const maxRight = els.reduce((m, e) => Math.max(m, e.x + e.w), -Infinity)
      return els.map(e => ({ kind: e.kind, id: e.id, x: maxRight - e.w, y: e.y }))
    })
  }

  private alignTop() {
    this.apply(els => {
      const minY = els.reduce((m, e) => Math.min(m, e.y), Infinity)
      return els.map(e => ({ kind: e.kind, id: e.id, x: e.x, y: minY }))
    })
  }

  private alignCenterV() {
    this.apply(els => {
      const avgCy = els.reduce((s, e) => s + e.y + e.h / 2, 0) / els.length
      return els.map(e => ({ kind: e.kind, id: e.id, x: e.x, y: avgCy - e.h / 2 }))
    })
  }

  private alignBottom() {
    this.apply(els => {
      const maxBottom = els.reduce((m, e) => Math.max(m, e.y + e.h), -Infinity)
      return els.map(e => ({ kind: e.kind, id: e.id, x: e.x, y: maxBottom - e.h }))
    })
  }

  private distributeH() {
    this.apply(els => {
      if (els.length < 3) return []
      const sorted = [...els].sort((a, b) => a.x - b.x)
      const last = sorted[sorted.length - 1]
      const totalSpan = last.x + last.w - sorted[0].x
      const totalW = sorted.reduce((s, e) => s + e.w, 0)
      const gap = (totalSpan - totalW) / (sorted.length - 1)
      const result: Array<{ kind: ElementKind; id: string; x: number; y: number }> = []
      let cursor = sorted[0].x
      for (const e of sorted) {
        result.push({ kind: e.kind, id: e.id, x: cursor, y: e.y })
        cursor += e.w + gap
      }
      return result
    })
  }

  private distributeV() {
    this.apply(els => {
      if (els.length < 3) return []
      const sorted = [...els].sort((a, b) => a.y - b.y)
      const last = sorted[sorted.length - 1]
      const totalSpan = last.y + last.h - sorted[0].y
      const totalH = sorted.reduce((s, e) => s + e.h, 0)
      const gap = (totalSpan - totalH) / (sorted.length - 1)
      const result: Array<{ kind: ElementKind; id: string; x: number; y: number }> = []
      let cursor = sorted[0].y
      for (const e of sorted) {
        result.push({ kind: e.kind, id: e.id, x: e.x, y: cursor })
        cursor += e.h + gap
      }
      return result
    })
  }
}

// ── SVG icons (16×16) ─────────────────────────────────────────────────────────

function alignLeftSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="2" y1="1" x2="2" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="3" y="3" width="8" height="3" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="3" y="10" width="11" height="3" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>`
}

function alignCxSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="3" y="3" width="10" height="3" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="2" y="10" width="12" height="3" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>`
}

function alignRightSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="14" y1="1" x2="14" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="5" y="3" width="8" height="3" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="2" y="10" width="11" height="3" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>`
}

function alignTopSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="1" y1="2" x2="15" y2="2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="3" y="3" width="3" height="8" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="10" y="3" width="3" height="11" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>`
}

function alignCySvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="3" y="3" width="3" height="10" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="10" y="2" width="3" height="12" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>`
}

function alignBottomSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="1" y1="14" x2="15" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="3" y="5" width="3" height="8" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="10" y="2" width="3" height="11" rx="1" fill="currentColor" opacity="0.6"/>
  </svg>`
}

function distHSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="1" y1="1" x2="1" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="15" y1="1" x2="15" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="2.5" y="4" width="3" height="8" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="6.5" y="4" width="3" height="8" rx="1" fill="currentColor" opacity="0.6"/>
    <rect x="10.5" y="4" width="3" height="8" rx="1" fill="currentColor" opacity="0.9"/>
  </svg>`
}

function distVSvg() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="1" y1="1" x2="15" y2="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="1" y1="15" x2="15" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <rect x="4" y="2.5" width="8" height="3" rx="1" fill="currentColor" opacity="0.9"/>
    <rect x="4" y="6.5" width="8" height="3" rx="1" fill="currentColor" opacity="0.6"/>
    <rect x="4" y="10.5" width="8" height="3" rx="1" fill="currentColor" opacity="0.9"/>
  </svg>`
}
