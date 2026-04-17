import type { Connection, ConnectionType } from '../entities/Connection.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { orthogonalPath, pathMidpoint } from './routing.ts'
import type { Rect } from './routing.ts'
import { svgEl } from './svgUtils.ts'

/** Arrow marker defs — injected once into the SVG <defs> */
export function injectMarkerDefs(svg: SVGSVGElement) {
  const defs = svgEl('defs')

  // Each marker is drawn pointing right (→). SVG flips it automatically via orient="auto".
  // refX=9 so the arrowhead tip sits exactly on the line endpoint.
  const markers: Array<{ id: string; path: string; fill: string; color?: string; refX?: string; markerUnits?: string }> = [
    { id: 'arrow-association',      path: 'M0,0 L9,4.5 L0,9',               fill: 'none' },
    { id: 'arrow-dependency',       path: 'M0,0 L9,4.5 L0,9',               fill: 'none' },
    { id: 'arrow-inheritance',      path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-base)' },
    { id: 'arrow-realization',      path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-base)' },
    { id: 'arrow-composition',      path: 'M0,4.5 L4.5,0 L9,4.5 L4.5,9 Z', fill: 'var(--ctp-overlay1)' },
    { id: 'arrow-aggregation',      path: 'M0,4.5 L4.5,0 L9,4.5 L4.5,9 Z', fill: 'var(--ctp-base)' },
    // Storage data-flow — teal arrowhead, fixed size regardless of stroke-width
    { id: 'arrow-storage',          path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-teal)', markerUnits: 'userSpaceOnUse' },
    { id: 'arrow-storage-start',    path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-teal)', refX: '0', markerUnits: 'userSpaceOnUse' },
    // Use Case diagram types — open arrowhead in overlay2 color
    { id: 'arrow-uc-extend',        path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-overlay2)' },
    { id: 'arrow-uc-include',       path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-overlay2)' },
    // Specialization = hollow triangle (same shape as inheritance)
    { id: 'arrow-uc-specialization',path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-base)', color: 'var(--ctp-overlay2)' },
    // State diagram transition — filled arrowhead
    { id: 'arrow-transition',       path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-text)', color: 'var(--ctp-text)' },
  ]

  markers.forEach(({ id, path, fill, color, refX, markerUnits }) => {
    const marker = svgEl('marker')
    marker.setAttribute('id', id)
    marker.setAttribute('markerWidth', '10')
    marker.setAttribute('markerHeight', '10')
    marker.setAttribute('refX', refX ?? '9')
    marker.setAttribute('refY', '4.5')
    marker.setAttribute('orient', 'auto')
    marker.setAttribute('viewBox', '0 0 9 9')
    if (markerUnits) marker.setAttribute('markerUnits', markerUnits)

    const p = svgEl('path')
    p.setAttribute('d', path)
    p.setAttribute('fill', fill)
    p.setAttribute('stroke', color ?? 'var(--ctp-overlay1)')
    p.setAttribute('stroke-width', '1.2')
    marker.appendChild(p)
    defs.appendChild(marker)
  })

  svg.insertBefore(defs, svg.firstChild)

  // ── Label backdrop filter ─────────────────────────────────────────────────
  // Soft glow behind connection/sequence labels so they read over crossing lines.
  // feMorphology dilate expands the text alpha → feGaussianBlur softens it →
  // feFlood+feComposite fills it with the base colour → feMerge composites
  // the blurred backdrop beneath the original text.
  const filter = svgEl('filter') as SVGFilterElement
  filter.id = 'label-backdrop'
  filter.setAttribute('x', '-20%')
  filter.setAttribute('y', '-40%')
  filter.setAttribute('width', '140%')
  filter.setAttribute('height', '180%')
  filter.setAttribute('color-interpolation-filters', 'sRGB')

  // 1. Dilate: thicken the glyph alpha so the halo extends beyond letter edges
  const dilate = svgEl('feMorphology') as SVGFEMorphologyElement
  dilate.setAttribute('operator', 'dilate')
  dilate.setAttribute('radius', '3')
  dilate.setAttribute('in', 'SourceAlpha')
  dilate.setAttribute('result', 'expanded')

  // 2. Blur the expanded alpha for soft, rounded edges
  const blur = svgEl('feGaussianBlur') as SVGFEGaussianBlurElement
  blur.setAttribute('stdDeviation', '2')
  blur.setAttribute('in', 'expanded')
  blur.setAttribute('result', 'blurred')

  // 3. Flood with background colour (CSS var resolved at render time via currentColor trick:
  //    we use a feFlood with flood-color driven by a CSS variable on the filter element)
  const flood = svgEl('feFlood') as SVGFEFloodElement
  flood.setAttribute('flood-color', 'var(--ctp-base)')
  flood.setAttribute('flood-opacity', '0.82')
  flood.setAttribute('result', 'colour')

  // 4. Clip flood to the blurred alpha shape
  const composite = svgEl('feComposite') as SVGFECompositeElement
  composite.setAttribute('in', 'colour')
  composite.setAttribute('in2', 'blurred')
  composite.setAttribute('operator', 'in')
  composite.setAttribute('result', 'backdrop')

  // 5. Merge: backdrop below, original text on top
  const merge = svgEl('feMerge') as SVGFEMergeElement
  const n1 = svgEl('feMergeNode') as SVGFEMergeNodeElement; n1.setAttribute('in', 'backdrop')
  const n2 = svgEl('feMergeNode') as SVGFEMergeNodeElement; n2.setAttribute('in', 'SourceGraphic')
  merge.append(n1, n2)

  filter.append(dilate, blur, flood, composite, merge)
  defs.appendChild(filter)
}

type ConnStyle = {
  markerEnd?: string
  stroke?: string
  dashed?: boolean
  stereotype?: string
}
const CONN_STYLES: Partial<Record<ConnectionType, ConnStyle>> = {
  'association':       { markerEnd: 'url(#arrow-association)' },
  'dependency':        { markerEnd: 'url(#arrow-dependency)', dashed: true },
  'inheritance':       { markerEnd: 'url(#arrow-inheritance)' },
  'realization':       { markerEnd: 'url(#arrow-realization)', dashed: true },
  'composition':       { markerEnd: 'url(#arrow-composition)' },
  'aggregation':       { markerEnd: 'url(#arrow-aggregation)' },
  'plain':             {},
  'read':              { markerEnd: 'url(#arrow-storage)', stroke: 'var(--ctp-teal)' },
  'write':             { markerEnd: 'url(#arrow-storage)', stroke: 'var(--ctp-teal)' },
  'request':           { stroke: 'var(--ctp-mauve)' },
  'uc-association':    { stroke: 'var(--ctp-overlay2)' },
  'uc-extend':         { markerEnd: 'url(#arrow-uc-extend)', stroke: 'var(--ctp-overlay2)', dashed: true, stereotype: '«extend»' },
  'uc-include':        { markerEnd: 'url(#arrow-uc-include)', stroke: 'var(--ctp-overlay2)', dashed: true, stereotype: '«include»' },
  'uc-specialization': { markerEnd: 'url(#arrow-uc-specialization)', stroke: 'var(--ctp-overlay2)' },
  'transition':        { markerEnd: 'url(#arrow-transition)' },
}

export function getConnStereotype(type: ConnectionType): string {
  return CONN_STYLES[type]?.stereotype ?? ''
}

export class ConnectionRenderer {
  readonly el: SVGGElement
  // path = primary line; pathB = gap overlay for read-write double-rail
  private path:    SVGPathElement
  private pathB:   SVGPathElement
  private hitPath: SVGPathElement
  // read-write arrowhead stubs drawn on top of the combined line
  private stubSrc: SVGPathElement
  private stubTgt: SVGPathElement
  private srcMult: SVGTextElement
  private tgtMult: SVGTextElement
  private label: SVGTextElement
  // Request channel symbol (circle + R + arrow)
  private channelSymbol: SVGGElement
  // Cached midpoint and label visibility — used by deconfliction pass
  private _lastMid: { x: number; y: number; angle: number } | null = null
  private _labelVisible = false

  constructor(
    private conn: Connection,
    _store: DiagramStore,
    private onClick: (conn: Connection, e: MouseEvent) => void,
    private onDblClick?: (conn: Connection, labelEl: SVGTextElement) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('connection')
    this.el.dataset.id = conn.id

    this.path  = svgEl('path'); this.path.classList.add('conn-line')
    this.pathB = svgEl('path'); this.pathB.classList.add('conn-line', 'conn-line-b')
    this.pathB.style.display = 'none'

    this.hitPath = svgEl('path')
    this.hitPath.setAttribute('fill', 'none')
    this.hitPath.setAttribute('stroke', 'transparent')
    this.hitPath.setAttribute('stroke-width', '12')
    this.hitPath.classList.add('conn-hit')

    // Arrowhead stubs for read-write: short lines drawn over the rail ends
    this.stubSrc = svgEl('path')
    this.stubSrc.setAttribute('fill', 'none')
    this.stubSrc.setAttribute('stroke', 'var(--ctp-teal)')
    this.stubSrc.setAttribute('stroke-width', '1.5')
    this.stubSrc.style.display = 'none'

    this.stubTgt = svgEl('path')
    this.stubTgt.setAttribute('fill', 'none')
    this.stubTgt.setAttribute('stroke', 'var(--ctp-teal)')
    this.stubTgt.setAttribute('stroke-width', '1.5')
    this.stubTgt.style.display = 'none'

    this.srcMult = svgEl('text'); this.srcMult.classList.add('multiplicity')
    this.tgtMult = svgEl('text'); this.tgtMult.classList.add('multiplicity')
    this.label   = svgEl('text'); this.label.classList.add('conn-label')

    // Channel symbol for 'request' connections
    this.channelSymbol = svgEl('g')
    this.channelSymbol.classList.add('conn-channel-symbol')
    this.channelSymbol.style.display = 'none'

    const symCircle = svgEl('circle')
    symCircle.setAttribute('r', '9')
    symCircle.classList.add('channel-circle')

    const symText = svgEl('text')
    symText.textContent = 'R'
    symText.classList.add('channel-r')
    symText.setAttribute('text-anchor', 'middle')
    symText.setAttribute('dominant-baseline', 'central')

    const symArrow = svgEl('path')
    symArrow.classList.add('channel-arrow')
    symArrow.setAttribute('d', 'M0,10 L0,18 M-4,14 L0,18 L4,14')

    this.channelSymbol.append(symCircle, symText, symArrow)

    this.el.append(this.path, this.pathB, this.hitPath, this.stubSrc, this.stubTgt, this.srcMult, this.tgtMult, this.label, this.channelSymbol)
    this.el.addEventListener('click', e => this.onClick(conn, e))
    this.el.addEventListener('dblclick', e => {
      e.stopPropagation()
      this.onDblClick?.(this.conn, this.label)
    })

    _store.on(ev => {
      if (ev.type === 'connection:update' && (ev.payload as Connection).id === conn.id) {
        this.conn = ev.payload as Connection
      }
    })
  }

  /**
   * Update the rendered path.
   *
   * Storage connections:
   *   write      — single arrow pointing at target (marker-end); flip to reverse direction.
   *   read-write — two parallel lines offset ±PARALLEL_GAP px perpendicular to the path,
   *                each with marker-end pointing at its respective target entity.
   *
   * x1/y1 are the SOURCE port coords, x2/y2 are the TARGET port coords.
   */
  updatePoints(x1: number, y1: number, x2: number, y2: number, srcPort = 'e', tgtPort = 'w', conn = this.conn, offset = 0, srcRect?: Rect, tgtRect?: Rect) {
    const style = CONN_STYLES[conn.type] ?? {}
    this.path.setAttribute('stroke-dasharray', style.dashed ? '6 3' : 'none')
    this.pathB.setAttribute('stroke-dasharray', 'none')
    // Reset double-rail overrides (set only for read-write)
    this.path.style.strokeWidth = ''
    this.pathB.style.strokeWidth = ''
    // Reset double-rail arrow overrides
    this.stubSrc.style.display = 'none'
    this.stubTgt.style.display = 'none'

    this.channelSymbol.style.display = 'none'

    if (conn.type === 'read-write') {
      // Two parallel rails: wide teal outer + narrow background gap overlay on same path.
      // Arrowheads drawn as separate stub segments on top so they sit correctly at each end.
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.removeAttribute('marker-end')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke      = 'var(--ctp-teal)'
      this.path.style.strokeWidth = '7'

      // Gap overlay: same path, background color, narrower — creates the two-line illusion
      this.pathB.setAttribute('d', d)
      this.pathB.removeAttribute('marker-end')
      this.pathB.removeAttribute('marker-start')
      this.pathB.style.stroke      = 'var(--ctp-base)'
      this.pathB.style.strokeWidth = '3'
      this.pathB.style.display = ''

      // Arrowhead stubs: minimal line segment (just enough for the marker) at each endpoint,
      // offset onto its own rail. STUB=1 so no visible spine — only the arrowhead shows.
      const STUB = 1
      const RAIL = 2.5
      const DIR: Record<string, [number, number]> = { n:[0,-1], s:[0,1], e:[1,0], w:[-1,0] }
      const [sdx, sdy] = DIR[srcPort] ?? [1, 0]
      const [tdx, tdy] = DIR[tgtPort] ?? [-1, 0]
      // +perp CCW: (dx,dy) → (-dy, dx)
      const [spx, spy] = [-sdy * RAIL,  sdx * RAIL]
      const [tpx, tpy] = [-tdy * RAIL,  tdx * RAIL]

      this.stubSrc.setAttribute('d', `M${x1+sdx*STUB+spx},${y1+sdy*STUB+spy} L${x1+spx},${y1+spy}`)
      this.stubSrc.setAttribute('marker-end', 'url(#arrow-storage)')
      this.stubSrc.style.display = ''

      this.stubTgt.setAttribute('d', `M${x2+tdx*STUB+tpx},${y2+tdy*STUB+tpy} L${x2+tpx},${y2+tpy}`)
      this.stubTgt.setAttribute('marker-end', 'url(#arrow-storage)')
      this.stubTgt.style.display = ''

      this.hitPath.setAttribute('d', d)

    } else {
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      if (style.markerEnd) {
        this.path.setAttribute('marker-end', style.markerEnd)
      } else {
        this.path.removeAttribute('marker-end')
      }
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = style.stroke ?? ''
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)
    }

    // Label and multiplicity — stereotype types show their label if no custom label
    const labelText = conn.label || style.stereotype || ''
    this.label.textContent = labelText
    const mid = pathMidpoint(x1, y1, srcPort, x2, y2, tgtPort, srcRect, tgtRect)
    this.label.setAttribute('x', String(mid.x))
    this.label.setAttribute('y', String(mid.y - 8))
    this._lastMid = mid
    this._labelVisible = !!labelText

    // Position channel symbol (request type only) at midpoint
    if (conn.type === 'request') {
      this.channelSymbol.setAttribute('transform', `translate(${mid.x},${mid.y})`)
      this.channelSymbol.style.display = ''
      const symArrow = this.channelSymbol.querySelector<SVGPathElement>('.channel-arrow')
      if (symArrow) {
        symArrow.setAttribute('transform', `rotate(${mid.angle - 90})`)
      }
    }

    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    this.srcMult.textContent = conn.sourceMultiplicity ?? ''
    this.srcMult.setAttribute('x', String(x1 + (mx - x1) * 0.2))
    this.srcMult.setAttribute('y', String(y1 + (my - y1) * 0.2 - 6))

    this.tgtMult.textContent = conn.targetMultiplicity ?? ''
    this.tgtMult.setAttribute('x', String(x2 + (mx - x2) * 0.2))
    this.tgtMult.setAttribute('y', String(y2 + (my - y2) * 0.2 - 6))
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }

  /** Returns the computed path midpoint if this connection has a visible label, else null. */
  getLabelMidpoint(): { x: number; y: number } | null {
    return (this._labelVisible && this._lastMid) ? this._lastMid : null
  }

  /**
   * Reposition the label (and channel symbol if active) without re-running updatePoints.
   * Called by the deconfliction pass in refreshConnections.
   */
  setLabelPosition(x: number, y: number) {
    this.label.setAttribute('x', String(x))
    this.label.setAttribute('y', String(y - 8))
    if (this._lastMid && this.channelSymbol.style.display !== 'none') {
      this.channelSymbol.setAttribute('transform', `translate(${x},${y})`)
    }
  }

  destroy() { this.el.remove() }
}
