import type { SelectionManager } from './SelectionManager.ts'
import type { ElementKind } from '../types.ts'

export interface ElementRect {
  kind: ElementKind
  id: string
  x: number
  y: number
  w: number
  h: number
}

export class RubberBandSelector {
  /** The rubber-band SVG rect element — append to viewGroup before use. */
  readonly el: SVGRectElement

  private active = false
  private startPt = { x: 0, y: 0 }

  constructor(private readonly deps: {
    selection: SelectionManager
    getAllElementRects: () => ElementRect[]
  }) {
    this.el = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    this.el.classList.add('rubber-band')
    this.el.style.display = 'none'
  }

  /** Whether a rubber-band drag is currently in progress. */
  get isActive(): boolean { return this.active }

  /**
   * Call from the SVG mousedown handler when clicking on empty canvas in select
   * mode.  Initialises the rect and marks the selector as active.
   * @param svgPoint  Canvas-space point from getSvgPoint(e)
   */
  start(svgPoint: DOMPoint): void {
    this.active = true
    this.startPt = { x: svgPoint.x, y: svgPoint.y }
    this.el.setAttribute('x', String(svgPoint.x))
    this.el.setAttribute('y', String(svgPoint.y))
    this.el.setAttribute('width', '0')
    this.el.setAttribute('height', '0')
    this.el.style.display = ''
  }

  /**
   * Call from the window mousemove handler while a rubber-band is active.
   * @param svgPoint  Canvas-space point from getSvgPoint(e)
   */
  onMouseMove(svgPoint: DOMPoint): void {
    if (!this.active) return
    const rx = Math.min(svgPoint.x, this.startPt.x)
    const ry = Math.min(svgPoint.y, this.startPt.y)
    const rw = Math.abs(svgPoint.x - this.startPt.x)
    const rh = Math.abs(svgPoint.y - this.startPt.y)
    this.el.setAttribute('x', String(rx))
    this.el.setAttribute('y', String(ry))
    this.el.setAttribute('width', String(rw))
    this.el.setAttribute('height', String(rh))
  }

  /**
   * Call from the window mouseup handler.  Hides the rect, commits the
   * selection for any elements overlapping the band, then marks inactive.
   */
  onMouseUp(): void {
    if (!this.active) return
    this.active = false
    this.el.style.display = 'none'

    const rx = parseFloat(this.el.getAttribute('x') ?? '0')
    const ry = parseFloat(this.el.getAttribute('y') ?? '0')
    const rw = parseFloat(this.el.getAttribute('width') ?? '0')
    const rh = parseFloat(this.el.getAttribute('height') ?? '0')

    // Only commit if the rect is large enough to be intentional (not a stray click)
    if (rw > 4 || rh > 4) {
      const allEls = this.deps.getAllElementRects()
      for (const el of allEls) {
        // Select elements whose bounds overlap the rubber-band rect
        if (el.x + el.w > rx && el.x < rx + rw && el.y + el.h > ry && el.y < ry + rh) {
          this.deps.selection.select({ kind: el.kind, id: el.id }, true)
        }
      }
    }
  }
}
