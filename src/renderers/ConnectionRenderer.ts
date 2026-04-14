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
  const markers: Array<{ id: string; path: string; fill: string }> = [
    { id: 'arrow-association',  path: 'M0,0 L9,4.5 L0,9',           fill: 'none' },
    { id: 'arrow-dependency',   path: 'M0,0 L9,4.5 L0,9',           fill: 'none' },
    { id: 'arrow-inheritance',  path: 'M0,0 L9,4.5 L0,9 Z',         fill: 'var(--ctp-base)' },
    { id: 'arrow-realization',  path: 'M0,0 L9,4.5 L0,9 Z',         fill: 'var(--ctp-base)' },
    { id: 'arrow-composition',  path: 'M0,4.5 L4.5,0 L9,4.5 L4.5,9 Z', fill: 'var(--ctp-overlay1)' },
    { id: 'arrow-aggregation',  path: 'M0,4.5 L4.5,0 L9,4.5 L4.5,9 Z', fill: 'var(--ctp-base)' },
    // Storage data-flow — teal arrowhead
    { id: 'arrow-storage',       path: 'M0,0 L9,4.5 L0,9', fill: 'none' },
    // Same marker but refX=0 for use as marker-start (tip at path start)
    { id: 'arrow-storage-start', path: 'M0,0 L9,4.5 L0,9', fill: 'none' },
    // Request/channel connection — same open arrowhead, accent color
    { id: 'arrow-request', path: 'M0,0 L9,4.5 L0,9', fill: 'none' },
  ]

  markers.forEach(({ id, path, fill }) => {
    const marker = svgEl('marker')
    marker.setAttribute('id', id)
    marker.setAttribute('markerWidth', '10')
    marker.setAttribute('markerHeight', '10')
    marker.setAttribute('refX', id === 'arrow-storage-start' ? '0' : '9')
    marker.setAttribute('refY', '4.5')
    marker.setAttribute('orient', 'auto')
    marker.setAttribute('viewBox', '0 0 9 9')

    const p = svgEl('path')
    p.setAttribute('d', path)
    p.setAttribute('fill', fill)
    const isStorage = id.startsWith('arrow-storage')
    const isRequest = id === 'arrow-request'
    if (isStorage) {
      p.setAttribute('stroke', 'var(--ctp-teal)')
    } else if (isRequest) {
      p.setAttribute('stroke', 'var(--ctp-mauve)')
    } else {
      p.setAttribute('stroke', 'var(--ctp-overlay1)')
    }
    p.setAttribute('stroke-width', '1.2')
    marker.appendChild(p)
    defs.appendChild(marker)
  })

  svg.insertBefore(defs, svg.firstChild)
}

const DASH_TYPES: ConnectionType[] = ['dependency', 'realization']
// Curvature bulge for vert.mod read-write curved arrows
const CURVE_BULGE = 36

/**
 * Build a curved arc path between two points.
 * bulge > 0 curves one way, bulge < 0 the other.
 */
function curvedArrowPath(x1: number, y1: number, x2: number, y2: number, bulge: number): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  // Perpendicular direction
  const px = (-dy / len) * bulge
  const py = (dx / len) * bulge
  const cx = mx + px
  const cy = my + py
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

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
   * For storage types the arrow direction encodes the data-flow semantic:
   *   read       — storage → class  (arrow points at class  = marker-start on the forward path)
   *   write      — class → storage  (arrow points at storage = marker-start on the forward path)
   *   read-write — two curved arrows (vert.mod style), one each direction
   *
   * x1/y1 are the SOURCE port coords, x2/y2 are the TARGET port coords.
   * The caller (refreshConnections) always passes source → target in the
   * connection's stored order, so we use that ordering as canonical.
   *
   * `offset` shifts the path laterally so parallel connections between the same
   * pair of elements are visually separated.
   */
  updatePoints(x1: number, y1: number, x2: number, y2: number, srcPort = 'e', tgtPort = 'w', conn = this.conn, offset = 0, srcRect?: Rect, tgtRect?: Rect) {
    const isDash = DASH_TYPES.includes(conn.type)
    this.path.setAttribute('stroke-dasharray', isDash ? '6 3' : 'none')

    this.channelSymbol.style.display = 'none'

    if (conn.type === 'read-write') {
      // vert.mod style: two curved opposing arrows, base bulge offset by parallel index
      const dFwd = curvedArrowPath(x1, y1, x2, y2,  CURVE_BULGE + offset)
      const dBwd = curvedArrowPath(x2, y2, x1, y1,  CURVE_BULGE + offset)

      this.path.setAttribute('d', dFwd)
      this.path.setAttribute('marker-end', 'url(#arrow-storage)')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-teal)'

      this.pathB.setAttribute('d', dBwd)
      this.pathB.setAttribute('marker-end', 'url(#arrow-storage)')
      this.pathB.removeAttribute('marker-start')
      this.pathB.style.stroke = 'var(--ctp-teal)'
      this.pathB.style.display = ''

      this.hitPath.setAttribute('d', dFwd)

    } else if (conn.type === 'read') {
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-end', 'url(#arrow-storage)')
      this.path.removeAttribute('marker-start')
      this.path.style.stroke = 'var(--ctp-teal)'
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else if (conn.type === 'write') {
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-start', 'url(#arrow-storage-start)')
      this.path.removeAttribute('marker-end')
      this.path.style.stroke = 'var(--ctp-teal)'
      this.pathB.style.display = 'none'
      this.hitPath.setAttribute('d', d)

    } else if (conn.type === 'request') {
      const d = orthogonalPath(x1, y1, srcPort, x2, y2, tgtPort, offset, srcRect, tgtRect)
      this.path.setAttribute('d', d)
      this.path.setAttribute('marker-end', 'url(#arrow-request)')
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

    // Label at midpoint
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    this.label.textContent = conn.label ?? ''
    this.label.setAttribute('x', String(mx))
    this.label.setAttribute('y', String(my - 8))

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
