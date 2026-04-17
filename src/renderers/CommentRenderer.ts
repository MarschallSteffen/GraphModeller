import type { Comment } from '../entities/Comment.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { svgEl } from './svgUtils.ts'

const DOG_EAR = 14

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
        this.setPinLine(x, y, w, h, { x: target.position.x, y: target.position.y, w: target.size.w, h: target.size.h })
      } else {
        this.pinLine.style.display = 'none'
      }
    } else {
      this.pinLine.style.display = 'none'
    }
  }

  /** Nearest point on the border of a rect to an external point (canvas coords) */
  private nearestBorderPoint(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
    const cx = rx + rw / 2, cy = ry + rh / 2
    const dx = px - cx, dy = py - cy
    if (dx === 0 && dy === 0) return { x: cx, y: ry } // degenerate: return top-center
    const scaleX = rw / 2 / Math.abs(dx || 1e-9)
    const scaleY = rh / 2 / Math.abs(dy || 1e-9)
    const scale = Math.min(scaleX, scaleY)
    return { x: cx + dx * scale, y: cy + dy * scale }
  }

  private setPinLine(cx: number, cy: number, cw: number, ch: number, target: { x: number; y: number; w: number; h: number }) {
    // canvas coords of both rects
    const commentCenterX = cx + cw / 2, commentCenterY = cy + ch / 2
    const targetCenterX = target.x + target.w / 2, targetCenterY = target.y + target.h / 2

    // nearest border point on comment (canvas coords), converted to group-local
    const p1 = this.nearestBorderPoint(cx, cy, cw, ch, targetCenterX, targetCenterY)
    // nearest border point on target (canvas coords), converted to group-local
    const p2 = this.nearestBorderPoint(target.x, target.y, target.w, target.h, commentCenterX, commentCenterY)

    this.pinLine.setAttribute('x1', String(p1.x - cx))
    this.pinLine.setAttribute('y1', String(p1.y - cy))
    this.pinLine.setAttribute('x2', String(p2.x - cx))
    this.pinLine.setAttribute('y2', String(p2.y - cy))
    this.pinLine.style.display = ''
  }

  /** Show/hide a live pin-line preview during drag (target coords in canvas space, or null to hide) */
  setDragPinPreview(targetPos: { x: number; y: number; w: number; h: number } | null) {
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
