import type { Comment } from '../entities/Comment.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { svgEl } from './svgUtils.ts'
import { elementShape, borderPointRect, borderPointForShape } from '../geometry/shapeGeometry.ts'

const DOG_EAR = 14
const FONT_SIZE = 12
const LINE_HEIGHT = FONT_SIZE * 1.4
const PAD_X = 8
const PAD_Y = 6
const MIN_HEIGHT = 80  // matches commentConfig defaultSize.h

// Shared canvas context for text measurement
let _measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) {
    _measureCtx = document.createElement('canvas').getContext('2d')!
    _measureCtx.font = `${FONT_SIZE}px ui-sans-serif, system-ui, sans-serif`
  }
  return _measureCtx
}

function wrapWords(text: string, maxWidth: number): string[] {
  const ctx = getMeasureCtx()
  const words = text.split(' ')
  const result: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      result.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) result.push(line)
  return result
}

/** Compute the height needed to display text in a box of given width. */
export function measureCommentHeight(text: string, boxWidth: number): number {
  if (!text.trim()) return MIN_HEIGHT
  const maxTextWidth = boxWidth - PAD_X * 2
  const paragraphs = text.split('\n')
  let totalLines = 0
  for (const para of paragraphs) {
    totalLines += wrapWords(para || ' ', maxTextWidth).length
  }
  const textHeight = PAD_Y + totalLines * LINE_HEIGHT + PAD_Y
  return Math.max(MIN_HEIGHT, Math.ceil(textHeight))
}


export class CommentRenderer {
  readonly el: SVGGElement
  private bg: SVGRectElement
  private dogear: SVGPolygonElement
  private dogearFold: SVGLineElement
  private dogearClipRect: SVGRectElement
  private fo: SVGForeignObjectElement
  private textDiv: HTMLDivElement
  private pinLine: SVGLineElement
  private _isDragging = false
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

    // clipPath to constrain dog-ear to the rounded rect bounds
    const clipId = `comment-clip-${comment.id}`
    const clipPath = svgEl('clipPath') as unknown as SVGClipPathElement
    clipPath.setAttribute('id', clipId)
    this.dogearClipRect = svgEl('rect') as SVGRectElement
    this.dogearClipRect.setAttribute('rx', '6')
    this.dogearClipRect.setAttribute('ry', '6')
    clipPath.appendChild(this.dogearClipRect)

    this.dogear = svgEl('polygon')
    this.dogear.classList.add('comment-dogear')
    this.dogear.setAttribute('clip-path', `url(#${clipId})`)

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
    // clipPath must be in a <defs> inside the element's group
    const defs = svgEl('defs')
    defs.appendChild(clipPath)
    this.el.append(defs, this.pinLine, this.bg, this.dogear, this.dogearFold, this.fo)

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
    const { position: { x, y }, size: { w } } = comment
    // Auto-size height to fit text, never smaller than MIN_HEIGHT
    const neededH = measureCommentHeight(comment.text, w)
    const h = neededH
    if (neededH !== comment.size.h) {
      // Defer to avoid mutating store during a store event callback
      requestAnimationFrame(() => {
        this.store.updateComment(comment.id, { size: { w, h: neededH } })
      })
    }
    const d = DOG_EAR

    this.el.setAttribute('transform', `translate(${x},${y})`)

    this.bg.setAttribute('x', '0')
    this.bg.setAttribute('y', '0')
    this.bg.setAttribute('width', String(w))
    this.bg.setAttribute('height', String(h))
    this.bg.setAttribute('rx', '6')
    this.bg.setAttribute('ry', '6')

    // keep clipPath rect in sync with bg rect
    this.dogearClipRect.setAttribute('x', '0')
    this.dogearClipRect.setAttribute('y', '0')
    this.dogearClipRect.setAttribute('width', String(w))
    this.dogearClipRect.setAttribute('height', String(h))

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

    // During drag, the live-preview logic in main.ts controls the pinLine.
    // We suppress the "official" store-driven pin line to avoid visual fighting.
    if (this._isDragging) {
      this.pinLine.style.display = 'none'
      return
    }

    // pin line — drawn in group-local coords (group is translated to comment position)
    if (comment.pinnedTo) {
      const target = this.store.findAnyElement(comment.pinnedTo)
      if (target) {
        const et = target.elementType ?? ''
        const shape = elementShape(et as any)
        const renderedSize = this.getRenderedSizeById?.(target.id) ?? target.size
        this.setPinLine(x, y, w, h, { x: target.position.x, y: target.position.y, w: renderedSize.w, h: renderedSize.h, shape })
      } else {
        this.pinLine.style.display = 'none'
      }
    } else {
      this.pinLine.style.display = 'none'
    }
  }

  private setPinLine(cx: number, cy: number, cw: number, ch: number, target: { x: number; y: number; w: number; h: number; shape?: string }) {
    const commentCX = cx + cw / 2, commentCY = cy + ch / 2
    const targetCX  = target.x + target.w / 2, targetCY = target.y + target.h / 2
    // comment border is always a rect
    const p1 = borderPointRect(cx, cy, cw, ch, targetCX, targetCY)
    const p2 = borderPointForShape(target.shape ?? 'rect', target.x, target.y, target.w, target.h, commentCX, commentCY)
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

  setDragging(isDragging: boolean) {
    this._isDragging = isDragging
    // Force a re-render to either show or hide the official pin line
    this.update(this.comment)
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
