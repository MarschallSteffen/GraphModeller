import { svgEl } from '../renderers/svgUtils.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import type { Diagram } from '../entities/Diagram.ts'

const MINIMAP_W = 220
const MINIMAP_H = 140
const PADDING = 20

/** Collections iterated for bounds, element rects, and connection lookup. */
const COLLECTIONS = [
  'classes', 'packages', 'storages', 'actors', 'queues',
  'useCases', 'ucSystems', 'states', 'startStates', 'endStates',
  'sequenceDiagrams', 'combinedFragments', 'comments',
] as const

/** Fill color per collection — CSS vars from the Catppuccin palette. */
const COLLECTION_COLORS: Record<string, string> = {
  classes:           'var(--ctp-green)',
  packages:          'var(--ctp-teal)',
  storages:          'var(--ctp-sapphire)',
  actors:            'var(--ctp-blue)',
  queues:            'var(--ctp-sky)',
  useCases:          'var(--ctp-mauve)',
  ucSystems:         'var(--ctp-overlay1)',
  states:            'var(--ctp-yellow)',
  startStates:       'var(--ctp-green)',
  endStates:         'var(--ctp-red)',
  sequenceDiagrams:  'var(--ctp-peach)',
  combinedFragments: 'var(--ctp-flamingo)',
  comments:          'var(--ctp-yellow)',
}

interface ElementLike {
  id: string
  position: { x: number; y: number }
  size: { w: number; h: number }
}

export class Minimap {
  private container: HTMLDivElement
  private miniSvg: SVGSVGElement
  private elementsGroup: SVGGElement
  private connectionsGroup: SVGGElement
  private viewportRect: SVGRectElement
  private store: DiagramStore
  private getSvgEl: () => SVGSVGElement
  private applyViewportFn: () => void
  private rafId: number | null = null
  private unsub: (() => void) | null = null
  private visible: boolean

  // Cached layout values from the last render, reused for click→canvas conversion.
  private _boundsMinX = 0
  private _boundsMinY = 0
  private _scale = 1
  private _offsetX = 0
  private _offsetY = 0

  constructor(
    store: DiagramStore,
    getSvg: () => SVGSVGElement,
    applyViewport: () => void,
  ) {
    this.store = store
    this.getSvgEl = getSvg
    this.applyViewportFn = applyViewport

    this.visible = JSON.parse(localStorage.getItem('archetype:show-minimap') ?? 'true') as boolean

    this.container = document.createElement('div')
    this.container.id = 'minimap-container'
    this.container.classList.add('minimap-container')

    this.miniSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
    this.miniSvg.id = 'minimap-svg'
    this.miniSvg.classList.add('minimap-svg')
    this.miniSvg.setAttribute('width', String(MINIMAP_W))
    this.miniSvg.setAttribute('height', String(MINIMAP_H))

    const bg = svgEl('rect')
    bg.classList.add('minimap-bg')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', String(MINIMAP_W))
    bg.setAttribute('height', String(MINIMAP_H))

    this.elementsGroup = svgEl('g')
    this.elementsGroup.classList.add('minimap-elements')

    this.connectionsGroup = svgEl('g')
    this.connectionsGroup.classList.add('minimap-connections')

    this.viewportRect = svgEl('rect')
    this.viewportRect.classList.add('minimap-viewport')

    this.miniSvg.appendChild(bg)
    this.miniSvg.appendChild(this.elementsGroup)
    this.miniSvg.appendChild(this.connectionsGroup)
    this.miniSvg.appendChild(this.viewportRect)
    this.container.appendChild(this.miniSvg)
    document.body.appendChild(this.container)

    this.container.style.display = this.visible ? '' : 'none'

    this.miniSvg.addEventListener('mousedown', this.onMouseDown)
    this.unsub = this.store.on(() => this.scheduleRender())
    this.scheduleRender()
  }

  setVisible(show: boolean) {
    this.visible = show
    this.container.style.display = show ? '' : 'none'
    localStorage.setItem('archetype:show-minimap', JSON.stringify(show))
    if (show) this.scheduleRender()
  }

  destroy() {
    this.unsub?.()
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.miniSvg.removeEventListener('mousedown', this.onMouseDown)
    this.container.remove()
  }

  private scheduleRender() {
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      if (this.visible) this.render()
    })
  }

  private render() {
    const state = this.store.state as Diagram

    // Single pass: compute bounds and build element lookup map together.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let hasElements = false
    const allElements = new Map<string, ElementLike>()

    for (const col of COLLECTIONS) {
      const arr = (state as any)[col] as ElementLike[] | undefined
      if (!arr) continue
      for (const el of arr) {
        hasElements = true
        minX = Math.min(minX, el.position.x)
        minY = Math.min(minY, el.position.y)
        maxX = Math.max(maxX, el.position.x + el.size.w)
        maxY = Math.max(maxY, el.position.y + el.size.h)
        allElements.set(el.id, el)
      }
    }

    if (!hasElements) {
      minX = 0; minY = 0; maxX = 400; maxY = 300
    }

    const boundsMinX = minX - PADDING
    const boundsMinY = minY - PADDING
    const boundsW = (maxX - minX) + PADDING * 2
    const boundsH = (maxY - minY) + PADDING * 2

    const scale = Math.min(MINIMAP_W / boundsW, MINIMAP_H / boundsH)
    const offsetX = (MINIMAP_W - boundsW * scale) / 2
    const offsetY = (MINIMAP_H - boundsH * scale) / 2

    const toMiniX = (cx: number) => (cx - boundsMinX) * scale + offsetX
    const toMiniY = (cy: number) => (cy - boundsMinY) * scale + offsetY

    // Element rects
    this.elementsGroup.innerHTML = ''
    for (const col of COLLECTIONS) {
      const arr = (state as any)[col] as ElementLike[] | undefined
      if (!arr) continue
      const color = COLLECTION_COLORS[col] ?? 'var(--ctp-overlay2)'
      for (const el of arr) {
        const r = svgEl('rect')
        r.setAttribute('x', String(toMiniX(el.position.x)))
        r.setAttribute('y', String(toMiniY(el.position.y)))
        r.setAttribute('width', String(Math.max(2, el.size.w * scale)))
        r.setAttribute('height', String(Math.max(2, el.size.h * scale)))
        r.setAttribute('fill', color)
        r.setAttribute('rx', '1')
        r.classList.add('minimap-el-rect')
        this.elementsGroup.appendChild(r)
      }
    }

    // Connection lines between element centers
    this.connectionsGroup.innerHTML = ''
    for (const conn of state.connections) {
      const src = allElements.get(conn.source.elementId)
      const tgt = allElements.get(conn.target.elementId)
      if (!src || !tgt) continue
      const line = svgEl('line')
      line.setAttribute('x1', String(toMiniX(src.position.x + src.size.w / 2)))
      line.setAttribute('y1', String(toMiniY(src.position.y + src.size.h / 2)))
      line.setAttribute('x2', String(toMiniX(tgt.position.x + tgt.size.w / 2)))
      line.setAttribute('y2', String(toMiniY(tgt.position.y + tgt.size.h / 2)))
      line.classList.add('minimap-conn-line')
      this.connectionsGroup.appendChild(line)
    }

    // Viewport indicator
    const { x: vpX, y: vpY, zoom } = state.viewport
    const svgRect = this.getSvgEl().getBoundingClientRect()
    const svgW = svgRect.width || 800
    const svgH = svgRect.height || 600

    this.viewportRect.setAttribute('x', String(toMiniX(-vpX / zoom)))
    this.viewportRect.setAttribute('y', String(toMiniY(-vpY / zoom)))
    this.viewportRect.setAttribute('width', String(Math.max(4, (svgW / zoom) * scale)))
    this.viewportRect.setAttribute('height', String(Math.max(4, (svgH / zoom) * scale)))

    this._boundsMinX = boundsMinX
    this._boundsMinY = boundsMinY
    this._scale = scale
    this._offsetX = offsetX
    this._offsetY = offsetY
  }

  private onMouseDown = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Capture once; reuse across the drag to avoid repeated layout reads.
    const rect = this.miniSvg.getBoundingClientRect()

    this.panTo(e.clientX - rect.left, e.clientY - rect.top)

    const onMove = (ev: MouseEvent) => this.panTo(ev.clientX - rect.left, ev.clientY - rect.top)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  private panTo(mx: number, my: number) {
    const canvasX = (mx - this._offsetX) / this._scale + this._boundsMinX
    const canvasY = (my - this._offsetY) / this._scale + this._boundsMinY

    const svgRect = this.getSvgEl().getBoundingClientRect()
    const svgW = svgRect.width || 800
    const svgH = svgRect.height || 600
    const { zoom } = this.store.state.viewport

    this.store.updateViewport({
      x: -(canvasX * zoom) + svgW / 2,
      y: -(canvasY * zoom) + svgH / 2,
      zoom,
    })
    // applyViewportFn triggers viewport:update → store.on → scheduleRender
    this.applyViewportFn()
  }
}
