import type { DiagramStore } from '../store/DiagramStore.ts'
import type { ElementKind } from '../types.ts'

const HANDLE_SCREEN_PX = 8   // handle zone size in screen pixels (constant feel regardless of zoom)

type Edge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

type ResizeTarget =
  | { kind: ElementKind; id: string; edge: Edge
      startX: number; startY: number; startW: number; startH: number }

export class ResizeController {
  private active: ResizeTarget | null = null
  private startMouseX = 0
  private startMouseY = 0

  constructor(
    private store: DiagramStore,
    private getSvgPoint: (e: MouseEvent) => DOMPoint,
    private getMinSize: (kind: ElementKind, id: string) => { w: number; h: number },
    private getZoom: () => number,
  ) {}

  hitTest(
    e: MouseEvent,
    elements: Array<{ kind: ElementKind; id: string; x: number; y: number; w: number; h: number }>,
  ): { kind: ElementKind; id: string; edge: Edge } | null {
    const pt = this.getSvgPoint(e)
    // Scale handle size to diagram space so it stays 8px on screen at any zoom
    const h = HANDLE_SCREEN_PX / this.getZoom()
    for (const el of elements) {
      const edge = this._edgeHit(pt.x, pt.y, el.x, el.y, el.w, el.h, h)
      if (edge) return { kind: el.kind, id: el.id, edge }
    }
    return null
  }

  private _edgeHit(px: number, py: number, ex: number, ey: number, ew: number, eh: number, h: number): Edge | null {
    const onL = Math.abs(px - ex) < h
    const onR = Math.abs(px - (ex + ew)) < h
    const onT = Math.abs(py - ey) < h
    const onB = Math.abs(py - (ey + eh)) < h
    // strict interior check for edges; corners extend h px outside the corner
    const inX = px >= ex - h && px <= ex + ew + h
    const inY = py >= ey - h && py <= ey + eh + h

    if (onT && onL && inX && inY) return 'nw'
    if (onT && onR && inX && inY) return 'ne'
    if (onB && onL && inX && inY) return 'sw'
    if (onB && onR && inX && inY) return 'se'
    if (onT && px >= ex && px <= ex + ew) return 'n'
    if (onB && px >= ex && px <= ex + ew) return 's'
    if (onL && py >= ey && py <= ey + eh) return 'w'
    if (onR && py >= ey && py <= ey + eh) return 'e'
    return null
  }

  edgeCursor(edge: Edge): string {
    const map: Record<Edge, string> = {
      n: 'n-resize', s: 's-resize', e: 'e-resize', w: 'w-resize',
      nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize',
    }
    return map[edge]
  }

  startResize(target: { kind: ElementKind; id: string; edge: Edge }, e: MouseEvent) {
    const pt = this.getSvgPoint(e)
    const el = this.store.findElementById(target.kind, target.id)
    if (!el) return

    this.active = {
      kind: target.kind, id: target.id, edge: target.edge,
      startX: el.position.x, startY: el.position.y,
      startW: el.size.w,     startH: el.size.h,
    }
    this.startMouseX = pt.x
    this.startMouseY = pt.y
  }

  onMouseMove(e: MouseEvent) {
    if (!this.active) return
    const pt = this.getSvgPoint(e)
    const dx = pt.x - this.startMouseX
    const dy = pt.y - this.startMouseY
    const { kind, id, edge, startX, startY, startW, startH } = this.active

    const min = this.getMinSize(kind, id)

    let x = startX, y = startY, w = startW, h = startH

    if (edge.includes('e')) w = Math.max(min.w, startW + dx)
    if (edge.includes('s')) h = Math.max(min.h, startH + dy)
    if (edge.includes('w')) { w = Math.max(min.w, startW - dx); x = startX + startW - w }
    if (edge.includes('n')) { h = Math.max(min.h, startH - dy); y = startY + startH - h }

    this.store.updateElementPosition(this.active.kind, this.active.id, {
      position: { x, y },
      size: { w, h },
    })
  }

  onMouseUp() { this.active = null }

  get isResizing() { return this.active !== null }
}
