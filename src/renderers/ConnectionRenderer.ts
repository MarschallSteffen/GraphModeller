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
  const markers: Array<{ id: string; path: string; fill: string; color?: string; refX?: string }> = [
    { id: 'arrow-association',      path: 'M0,0 L9,4.5 L0,9',               fill: 'none' },
    { id: 'arrow-dependency',       path: 'M0,0 L9,4.5 L0,9',               fill: 'none' },
    { id: 'arrow-inheritance',      path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-base)' },
    { id: 'arrow-realization',      path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-base)' },
    { id: 'arrow-composition',      path: 'M0,4.5 L4.5,0 L9,4.5 L4.5,9 Z', fill: 'var(--ctp-overlay1)' },
    { id: 'arrow-aggregation',      path: 'M0,4.5 L4.5,0 L9,4.5 L4.5,9 Z', fill: 'var(--ctp-base)' },
    // Storage data-flow — teal arrowhead
    { id: 'arrow-storage',          path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-teal)' },
    { id: 'arrow-storage-start',    path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-teal)', refX: '0' },
    // Use Case diagram types — open arrowhead in overlay2 color
    { id: 'arrow-uc-extend',        path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-overlay2)' },
    { id: 'arrow-uc-include',       path: 'M0,0 L9,4.5 L0,9',               fill: 'none', color: 'var(--ctp-overlay2)' },
    // Specialization = hollow triangle (same shape as inheritance)
    { id: 'arrow-uc-specialization',path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-base)', color: 'var(--ctp-overlay2)' },
    // State diagram transition — filled arrowhead
    { id: 'arrow-transition',       path: 'M0,0 L9,4.5 L0,9 Z',             fill: 'var(--ctp-text)', color: 'var(--ctp-text)' },
  ]

  markers.forEach(({ id, path, fill, color, refX }) => {
    const marker = svgEl('marker')
    marker.setAttribute('id', id)
    marker.setAttribute('markerWidth', '10')
    marker.setAttribute('markerHeight', '10')
    marker.setAttribute('refX', refX ?? '9')
    marker.setAttribute('refY', '4.5')
    marker.setAttribute('orient', 'auto')
    marker.setAttribute('viewBox', '0 0 9 9')

    const p = svgEl('path')
    p.setAttribute('d', path)
    p.setAttribute('fill', fill)
    p.setAttribute('stroke', color ?? 'var(--ctp-overlay1)')
    p.setAttribute('stroke-width', '1.2')
    marker.appendChild(p)
    defs.appendChild(marker)
  })

  svg.insertBefore(defs, svg.firstChild)
}

const DASH_TYPES: ConnectionType[] = ['dependency', 'realization', 'uc-extend', 'uc-include']

export class ConnectionRenderer {
  readonly el: SVGGElement
  // path = primary line; pathB = second line for read-write only
  private path:  SVGPathElement
  private pathB: SVGPathElement
  private hitPath: SVGPathElement
  private srcMult: SVGTextElement
  private tgtMult: SVGTextElement
  private label: SVGTextElement
  // Request channel symbol (circle + R + arrow)
  private channelSymbol: SVGGElement

  constructor(
    private conn: Connection,
    _store: DiagramStore,
    private onClick: (conn: Connection, e: MouseEvent) => void,
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

    this.el.append(this.path, this.pathB, this.hitPath, this.srcMult, this.tgtMult, this.label, this.channelSymbol)
    this.el.addEventListener('click', e => this.onClick(conn, e))

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
    const isDash = DASH_TYPES.includes(conn.type)
    this.path.setAttribute('stroke-dasharray', isDash ? '6 3' : 'none')
    this.pathB.setAttribute('stroke-dasharray', 'none')

    this.channelSymbol.style.display = 'none'

    if (conn.type === 'read-write') {
      // Two parallel lines, each with a single arrowhead pointing at one entity.
      // Offset perpendicular to the primary exit direction so the lines don't overlap.
      // For horizontal exits (e/w) offset vertically; for vertical exits (n/s) offset horizontally.
      const horiz = srcPort === 'e' || srcPort === 'w'
      const GAP = 3.5
      const ox = horiz ? 0 : GAP
      const oy = horiz ? GAP : 0

      // Forward path: source → target (offset +GAP)
      const dFwd = orthogonalPath(x1 + ox, y1 + oy, srcPort, x2 + ox, y2 + oy, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', dFwd)
      this.path.setAttribute('marker-end', 'url(#arrow-storage)')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-teal)'

      // Reverse path: target → source (offset -GAP, swapped direction)
      const dRev = orthogonalPath(x2 - ox, y2 - oy, tgtPort, x1 - ox, y1 - oy, srcPort, offset, tgtRect, srcRect)
      this.pathB.setAttribute('d', dRev)
      this.pathB.setAttribute('marker-end', 'url(#arrow-storage)')
      this.pathB.removeAttribute('marker-start')
      this.pathB.style.stroke = 'var(--ctp-teal)'
      this.pathB.style.display = ''

      this.hitPath.setAttribute('d', dFwd)

    } else if (conn.type === 'read' || conn.type === 'write') {
      // Single arrow pointing at target. Direction = source→target order; use flip to reverse.
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-end', 'url(#arrow-storage)')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-teal)'
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else if (conn.type === 'request') {
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.removeAttribute('marker-end')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-mauve)'
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

      // Position channel symbol at the true arc-length midpoint of the path
      const mid = pathMidpoint(x1, y1, srcPort, x2, y2, tgtPort, srcRect, tgtRect)
      this.channelSymbol.setAttribute('transform', `translate(${mid.x},${mid.y})`)
      this.channelSymbol.style.display = ''

      // Rotate arrow indicator to match the path direction at the midpoint
      const symArrow = this.channelSymbol.querySelector<SVGPathElement>('.channel-arrow')
      if (symArrow) {
        symArrow.setAttribute('transform', `rotate(${mid.angle - 90})`)
      }

    } else if (conn.type === 'plain') {
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.removeAttribute('marker-end')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = ''
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else if (conn.type === 'uc-association') {
      // Plain line, no arrowhead — UC association between actor and use case
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.removeAttribute('marker-end')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-overlay2)'
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else if (conn.type === 'uc-extend' || conn.type === 'uc-include') {
      // Dashed line with open arrowhead; stereotype label injected via the label field
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-end', `url(#arrow-${conn.type})`)
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-overlay2)'
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else if (conn.type === 'uc-specialization') {
      // Solid line with hollow triangle — actor/use-case generalisation
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-end', 'url(#arrow-uc-specialization)')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-overlay2)'
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else if (conn.type === 'transition') {
      // State diagram transition — solid line with filled arrowhead
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-end', 'url(#arrow-transition)')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = ''
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else {
      // Standard UML connection types
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-end', `url(#arrow-${conn.type})`)
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = ''
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)
    }

    // Label at true arc-length midpoint — uc-extend/uc-include show stereotype if no custom label
    const stereotype = conn.type === 'uc-extend' ? '«extend»' : conn.type === 'uc-include' ? '«include»' : null
    const labelText = conn.label || stereotype || ''
    this.label.textContent = labelText
    if (labelText) {
      const mid = pathMidpoint(x1, y1, srcPort, x2, y2, tgtPort, srcRect, tgtRect)
      this.label.setAttribute('x', String(mid.x))
      this.label.setAttribute('y', String(mid.y - 8))
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
}
