import type { Comment } from '../entities/Comment.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { svgEl } from './svgUtils.ts'

const DOG_EAR = 14

// Element types grouped by border shape for pin-line calculations
const PILL_ELEMENT_TYPES  = new Set(['state', 'storage', 'queue'])
const ELLIPSE_ELEMENT_TYPES = new Set(['use-case'])
const CIRCLE_ELEMENT_TYPES  = new Set(['start-state', 'end-state'])

export class CommentRenderer {
  readonly el: SVGGElement
  private bg: SVGRectElement
  private dogear: SVGPolygonElement
  private dogearFold: SVGLineElement
  private fo: SVGForeignObjectElement
  private textDiv: HTMLDivElement
  private pinLine: SVGLineElement
  private readonly _unsub: () => void

  constructor(
    private comment: Comment,
    private store: DiagramStore,
    private getRenderedSizeById?: (id: string) => { w: number; h: number } | undefined,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('comment')
    this.el.dataset.id = comment.id
    this.el.dataset.elementType = 'comment'

    this.bg = svgEl('rect')
    this.bg.classList.add('comment-bg')

    this.dogear = svgEl('polygon')
    this.dogear.classList.add('comment-dogear')

    this.dogearFold = svgEl('line')
    this.dogearFold.classList.add('comment-dogear-fold')

    this.pinLine = svgEl('line')
    this.pinLine.classList.add('comment-pin-line')

    this.fo = svgEl('foreignObject')
    this.fo.classList.add('comment-fo')

    this.textDiv = document.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement
    this.textDiv.classList.add('comment-text')
    this.fo.appendChild(this.textDiv)

    // pin line goes first so it renders below the note body
    this.el.append(this.pinLine, this.bg, this.dogear, this.dogearFold, this.fo)

    this.update(comment)

    this._unsub = store.on(ev => {
      if (ev.type === 'comment:update' && (ev.payload as Comment).id === comment.id) {
        this.comment = ev.payload as Comment
        this.update(this.comment)
        return
      }
      // Refresh pin line if the pinned target was updated (position or size may have changed)
      if (ev.type.endsWith(':update') && this.comment.pinnedTo && (ev.payload as { id?: string })?.id === this.comment.pinnedTo) {
        this.update(this.comment)
        return
      }
      // If the pinned target is deleted, pin line is already cleared in store;
      // hide it visually until the comment:update event arrives
      if (ev.type.endsWith(':remove') && this.comment.pinnedTo === (ev.payload as string)) {
        this.pinLine.style.display = 'none'
      }
    })
  }

  update(comment: Comment) {
    const { position: { x, y }, size: { w, h } } = comment
    const d = DOG_EAR

    this.el.setAttribute('transform', `translate(${x},${y})`)

    this.bg.setAttribute('x', '0')
    this.bg.setAttribute('y', '0')
    this.bg.setAttribute('width', String(w))
    this.bg.setAttribute('height', String(h))
    this.bg.setAttribute('rx', '6')
    this.bg.setAttribute('ry', '6')

    // dog-ear triangle at top-right corner
    this.dogear.setAttribute('points', `${w - d},0 ${w},0 ${w},${d}`)

    // fold line from (w-d, 0) to (w, d)
    this.dogearFold.setAttribute('x1', String(w - d))
    this.dogearFold.setAttribute('y1', '0')
    this.dogearFold.setAttribute('x2', String(w))
    this.dogearFold.setAttribute('y2', String(d))

    this.fo.setAttribute('x', '0')
    this.fo.setAttribute('y', '0')
    this.fo.setAttribute('width', String(w))
    this.fo.setAttribute('height', String(h))
    this.textDiv.textContent = comment.text

    // pin line — drawn in group-local coords (group is translated to comment position)
    if (comment.pinnedTo) {
      const target = this.store.findAnyElement(comment.pinnedTo)
      if (target) {
        const et = target.elementType ?? ''
        const shape = ELLIPSE_ELEMENT_TYPES.has(et) ? 'ellipse'
                    : CIRCLE_ELEMENT_TYPES.has(et)  ? 'circle'
                    : PILL_ELEMENT_TYPES.has(et)    ? 'pill'
                    : 'rect'
        const renderedSize = this.getRenderedSizeById?.(target.id) ?? target.size
        this.setPinLine(x, y, w, h, { x: target.position.x, y: target.position.y, w: renderedSize.w, h: renderedSize.h, shape })
      } else {
        this.pinLine.style.display = 'none'
      }
    } else {
      this.pinLine.style.display = 'none'
    }
  }

  /** Nearest point on a rect border (toward external point px,py). */
  private nearestBorderPoint(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
    const cx = rx + rw / 2, cy = ry + rh / 2
    const dx = px - cx, dy = py - cy
    if (dx === 0 && dy === 0) return { x: cx, y: ry }
    const scaleX = rw / 2 / Math.abs(dx || 1e-9)
    const scaleY = rh / 2 / Math.abs(dy || 1e-9)
    return { x: cx + dx * Math.min(scaleX, scaleY), y: cy + dy * Math.min(scaleX, scaleY) }
  }

  /** Nearest point on an ellipse border (toward external point px,py). */
  private nearestBorderPointEllipse(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
    const cx = rx + rw / 2, cy = ry + rh / 2
    const dx = px - cx, dy = py - cy
    if (dx === 0 && dy === 0) return { x: cx, y: ry }
    const len = Math.hypot(dx / (rw / 2), dy / (rh / 2))
    return { x: cx + dx / len, y: cy + dy / len }
  }

  /** Nearest point on a pill (stadium) border: two semicircles + straight top/bottom band. */
  private nearestBorderPointPill(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
    const r = rh / 2
    const cy = ry + r
    const capLX = rx + r, capRX = rx + rw - r
    // The nearest cap center is determined by clamping px into the straight band
    const capCX = Math.max(capLX, Math.min(px, capRX))
    const dx = px - capCX, dy = py - cy
    const len = Math.hypot(dx, dy)
    if (len === 0) return { x: capCX, y: ry }
    return { x: capCX + (dx / len) * r, y: cy + (dy / len) * r }
  }

  /** Nearest point on a circle border. */
  private nearestBorderPointCircle(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
    const cx = rx + rw / 2, cy = ry + rh / 2
    const r = Math.min(rw, rh) / 2
    const dx = px - cx, dy = py - cy
    const len = Math.hypot(dx, dy)
    if (len === 0) return { x: cx, y: cy - r }
    return { x: cx + (dx / len) * r, y: cy + (dy / len) * r }
  }

  private borderPoint(ex: number, ey: number, ew: number, eh: number, shape: string, px: number, py: number): { x: number; y: number } {
    if (shape === 'ellipse') return this.nearestBorderPointEllipse(ex, ey, ew, eh, px, py)
    if (shape === 'pill')    return this.nearestBorderPointPill(ex, ey, ew, eh, px, py)
    if (shape === 'circle')  return this.nearestBorderPointCircle(ex, ey, ew, eh, px, py)
    return this.nearestBorderPoint(ex, ey, ew, eh, px, py)
  }

  private setPinLine(cx: number, cy: number, cw: number, ch: number, target: { x: number; y: number; w: number; h: number; shape?: string }) {
    const commentCX = cx + cw / 2, commentCY = cy + ch / 2
    const targetCX  = target.x + target.w / 2, targetCY = target.y + target.h / 2
    // comment border is always a rect
    const p1 = this.nearestBorderPoint(cx, cy, cw, ch, targetCX, targetCY)
    const p2 = this.borderPoint(target.x, target.y, target.w, target.h, target.shape ?? 'rect', commentCX, commentCY)
    this.pinLine.setAttribute('x1', String(p1.x - cx))
    this.pinLine.setAttribute('y1', String(p1.y - cy))
    this.pinLine.setAttribute('x2', String(p2.x - cx))
    this.pinLine.setAttribute('y2', String(p2.y - cy))
    this.pinLine.style.display = ''
  }

  /** Show/hide a live pin-line preview during drag (target coords in canvas space, or null to hide) */
  setDragPinPreview(targetPos: { x: number; y: number; w: number; h: number; shape?: string } | null) {
    if (!targetPos) {
      this.pinLine.style.display = 'none'
      return
    }
    const { w, h } = this.comment.size
    const { x, y } = this.comment.position
    this.setPinLine(x, y, w, h, targetPos)
  }

  getRenderedSize() {
    return { w: this.comment.size.w, h: this.comment.size.h }
  }

  getContentMinSize() {
    return { w: 80, h: 40 }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }

  destroy() {
    this._unsub()
    this.el.remove()
  }
}
