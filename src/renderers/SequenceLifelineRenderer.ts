import type { SequenceLifeline, SequenceMessage } from '../entities/SequenceLifeline.ts'
import { svgEl, estimateTextWidth } from './svgUtils.ts'

export const HEADER_H  = 40
export const MSG_ROW_H = 40
const MIN_W        = 140
const SPINE_X_FRAC = 0.5
const BAR_W        = 12   // activation bar width
const BAR_HALF     = BAR_W / 2
const PORT_R       = 5    // radius of the port circle at bar bottom

/** Filled arrowhead polygon for sync (right-pointing) */
function rightArrowPts(x: number, y: number): string {
  return `${x - 8},${y - 5} ${x},${y} ${x - 8},${y + 5}`
}
/** Open arrowhead for async/create (right-pointing) */
function rightOpenPath(x: number, y: number): string {
  return `M${x - 8},${y - 5} L${x},${y} L${x - 8},${y + 5}`
}
/** Open arrowhead for return / left-pointing */
function leftOpenPath(x: number, y: number): string {
  return `M${x + 8},${y - 5} L${x},${y} L${x + 8},${y + 5}`
}

export interface InsertSlot {
  slotIdx: number
  localY: number
}

export interface ActiveSpan {
  /** Local Y (from lifeline top) where the bar starts */
  yStart: number
  /** Local Y where the bar ends */
  yEnd: number
  /** Whether to show the drag-port at the bottom of this bar */
  showPort: boolean
}

export class SequenceLifelineRenderer {
  readonly el: SVGGElement
  private headerBg:    SVGRectElement
  private headerText:  SVGTextElement
  private spine:       SVGLineElement
  private activeGroup: SVGGElement   // activation bars + ports
  private msgGroup:    SVGGElement
  private insertGroup: SVGGElement   // mid-slot insert ticks
  private dropHitRect: SVGRectElement  // large invisible hit area for drop targeting
  private dropSlot:    SVGLineElement  // tick shown while dragging toward this lifeline

  computedW = MIN_W
  computedH = HEADER_H + MSG_ROW_H
  private spineBottom = HEADER_H + MSG_ROW_H

  constructor(
    private ll: SequenceLifeline,
    container: SVGElement,
    /** Called on mousedown on an insert-slot circle; slotIdx = position to insert at */
    public onDragFromSlot: (ll: SequenceLifeline, slot: InsertSlot) => void,
    /** Called on dblclick on a locally-rendered message row; labelEl is the text element to edit in-place */
    private onEditMessage: (ll: SequenceLifeline, msgIdx: number, labelEl: SVGTextElement) => void,
    /** Called when user drags from an active-bar port */
    public onDragFromPort: (ll: SequenceLifeline, fromY: number) => void,
    /** Called on single click on a message row (e.g. self-call) to open the message popover */
    private onClickMessage?: (ll: SequenceLifeline, msgIdx: number, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('seq-lifeline')
    this.el.dataset.id = ll.id
    this.el.dataset.elementType = 'seq-lifeline'

    this.headerBg    = svgEl('rect'); this.headerBg.classList.add('seq-header-bg')
    this.headerText  = svgEl('text'); this.headerText.classList.add('seq-header-name')
    this.spine       = svgEl('line'); this.spine.classList.add('seq-spine')
    this.activeGroup = svgEl('g');    this.activeGroup.classList.add('seq-active-bars')
    this.msgGroup    = svgEl('g')
    this.insertGroup = svgEl('g');    this.insertGroup.classList.add('seq-insert-group')
    // Wide invisible rect spanning the full lifeline — used as drop target during drag
    this.dropHitRect = svgEl('rect'); this.dropHitRect.classList.add('seq-drop-hit')
    this.dropHitRect.setAttribute('fill', 'transparent')
    this.dropHitRect.setAttribute('pointer-events', 'none') // enabled only during drag
    this.dropSlot = svgEl('line'); this.dropSlot.classList.add('seq-drop-slot')
    this.dropSlot.setAttribute('visibility', 'hidden')

    this.el.append(
      this.dropHitRect,
      this.headerBg, this.headerText,
      this.spine,
      this.activeGroup,
      this.msgGroup,
      this.insertGroup,
      this.dropSlot,
    )
    container.appendChild(this.el)

    this.update(ll)
  }

  /** Per-message local Y midpoints, set by refreshSequenceConnections when baselineY is known. */
  private msgLocalYs: number[] = []

  /** Called by refreshSequenceConnections to set per-message rendered Y before update(). */
  setMsgLocalYs(ys: number[]) { this.msgLocalYs = ys }

  update(ll: SequenceLifeline) {
    const msgs = ll.messages
    this.computedW = Math.max(ll.size.w, MIN_W, estimateTextWidth(ll.name))
    // Height covers the highest rendered message Y + 1 extra slot for the last insert point.
    // Use msgLocalYs (set by refreshSequenceConnections) when available, else fall back to slotIndex/idx.
    let maxLocalY: number
    if (this.msgLocalYs.length === msgs.length && msgs.length > 0) {
      maxLocalY = Math.max(...this.msgLocalYs)
    } else if (msgs.length > 0) {
      const maxSlot = msgs.reduce((m, msg, idx) => Math.max(m, msg.slotIndex ?? idx), -1)
      maxLocalY = HEADER_H + maxSlot * MSG_ROW_H + MSG_ROW_H / 2
    } else {
      maxLocalY = HEADER_H + MSG_ROW_H / 2
    }
    this.computedH = Math.ceil(maxLocalY + MSG_ROW_H / 2 + MSG_ROW_H)

    this.el.setAttribute('transform', `translate(${ll.position.x},${ll.position.y})`)

    // Header
    this.headerBg.setAttribute('width',  String(this.computedW))
    this.headerBg.setAttribute('height', String(HEADER_H))
    this.headerBg.setAttribute('rx', '4')

    this.headerText.textContent = ll.name
    this.headerText.setAttribute('x', String(this.computedW / 2))
    this.headerText.setAttribute('y', String(HEADER_H * 0.63))

    const spineX = this.getSpineX()

    // Spine — always extends through the full body including the extra slot
    this.spine.setAttribute('x1', String(spineX))
    this.spine.setAttribute('y1', String(HEADER_H))
    this.spine.setAttribute('x2', String(spineX))
    this.spine.setAttribute('y2', String(this.computedH))

    // Full-height drop hit rect (enabled during drag)
    this.dropHitRect.setAttribute('x',      String(spineX - 30))
    this.dropHitRect.setAttribute('y',      String(HEADER_H))
    this.dropHitRect.setAttribute('width',  '60')
    this.dropHitRect.setAttribute('height', String(this.computedH - HEADER_H))

    // Drop-slot tick
    this.dropSlot.setAttribute('x1', String(spineX - 8))
    this.dropSlot.setAttribute('x2', String(spineX + 8))

    // Message rows — pass baseline delta so stubs render at the right Y
    this.msgGroup.innerHTML = ''
    msgs.forEach((msg, i) => this.renderMsgRow(msg, i, spineX))

    // Note: activeGroup and insertGroup are NOT cleared here.
    // refreshSequenceConnections owns both and always runs after update()
    // via the main.ts store listener (registered before renderers).
  }

  /** Extend the spine and drop-hit rect to a diagram-wide uniform height. */
  setSpineBottom(y: number) {
    this.spineBottom = y
    this.spine.setAttribute('y2', String(y))
    this.dropHitRect.setAttribute('height', String(y - HEADER_H))
  }

  /**
   * Render activation bars. Called by refreshSequenceConnections with cross-lifeline data.
   * Spans are in local coordinates. Also renders the drag-port at bar bottom.
   */
  updateActiveBars(spans: ActiveSpan[]) {
    this.activeGroup.innerHTML = ''
    const spineX = this.getSpineX()

    for (const span of spans) {
      const barH = Math.max(BAR_W, span.yEnd - span.yStart)

      const bar = svgEl('rect')
      bar.classList.add('seq-active-area')
      bar.setAttribute('x',      String(spineX - BAR_HALF))
      bar.setAttribute('y',      String(span.yStart))
      bar.setAttribute('width',  String(BAR_W))
      bar.setAttribute('height', String(barH))
      this.activeGroup.appendChild(bar)

      // Port circle at bottom of bar — drag from here to create next message
      if (span.showPort) {
        const portY = span.yStart + barH
        const port = svgEl('circle')
        port.classList.add('seq-bar-port')
        port.setAttribute('cx', String(spineX))
        port.setAttribute('cy', String(portY))
        port.setAttribute('r',  String(PORT_R))
        port.style.cursor = 'crosshair'
        port.addEventListener('mousedown', (e) => {
          e.stopImmediatePropagation()
          e.stopPropagation()
          e.preventDefault()
          this.onDragFromPort(this.ll, portY)
        })
        this.activeGroup.appendChild(port)
      }
    }
  }

  /**
   * Render mid-slot insert ticks. Called by refreshSequenceConnections.
   * slotYs contains local Y positions (N+1 values for N messages: before first, between each, after last).
   */
  updateInsertSlots(slotYs: number[]) {
    this.insertGroup.innerHTML = ''
    const spineX = this.getSpineX()
    const isEmpty = this.ll.messages.length === 0

    slotYs.forEach((localY, slotIdx) => {
      const circle = svgEl('circle')
      circle.classList.add('seq-insert-slot')
      if (isEmpty) circle.classList.add('seq-insert-slot-empty')
      circle.setAttribute('cx', String(spineX))
      circle.setAttribute('cy', String(localY))
      circle.setAttribute('r',  '5')
      circle.style.cursor = 'crosshair'
      circle.addEventListener('mousedown', (e) => {
        e.stopImmediatePropagation()
        e.stopPropagation()
        e.preventDefault()
        this.onDragFromSlot(this.ll, { slotIdx, localY })
      })
      this.insertGroup.appendChild(circle)
    })
  }

  /** Show/hide the drop-slot tick at a local Y while drag is active */
  setDropSlot(y: number | null) {
    if (y === null) {
      this.dropSlot.setAttribute('visibility', 'hidden')
    } else {
      this.dropSlot.setAttribute('y1', String(y))
      this.dropSlot.setAttribute('y2', String(y))
      this.dropSlot.setAttribute('visibility', 'visible')
    }
  }

  /** Enable/disable the large drop hit rect (during connection drag) */
  setDropTarget(active: boolean) {
    this.dropHitRect.setAttribute('pointer-events', active ? 'all' : 'none')
  }

  private renderMsgRow(msg: SequenceMessage, idx: number, spineX: number) {
    // Use per-message local Y if set (from refreshSequenceConnections), else fall back to array-index position
    const midY = this.msgLocalYs[idx] ?? (HEADER_H + idx * MSG_ROW_H + MSG_ROW_H / 2)
    const rowY = midY - MSG_ROW_H / 2

    const g = svgEl('g')
    g.classList.add('seq-msg-row')
    g.dataset.msgIdx = String(idx)

    let labelEl: SVGTextElement | null = null

    if (msg.kind === 'self') {
      // Self-call: loopback arrow rendered entirely on this lifeline
      const lx = spineX + 28
      const path = svgEl('path')
      path.classList.add('seq-msg-arrow')
      path.setAttribute('d', `M${spineX},${midY - 4} L${lx},${midY - 4} L${lx},${midY + 8} L${spineX},${midY + 8}`)
      path.setAttribute('fill', 'none')
      const arrow = svgEl('path')
      arrow.classList.add('seq-msg-arrow-head')
      arrow.setAttribute('d', leftOpenPath(spineX, midY + 8))
      arrow.setAttribute('fill', 'none')

      labelEl = svgEl('text')
      labelEl.classList.add('seq-msg-label')
      labelEl.dataset.msgIdx = String(idx)
      labelEl.textContent = msg.label
      labelEl.setAttribute('x', String(lx + 4))
      labelEl.setAttribute('y', String(midY - 6))
      g.append(path, arrow, labelEl)

    } else if (msg.kind === 'return' && !msg.targetLifelineId) {
      // Unconnected return: stub pointing left with slot indicator
      const stub = svgEl('line')
      stub.classList.add('seq-msg-arrow')
      stub.setAttribute('stroke-dasharray', '4 3')
      stub.setAttribute('x1', String(spineX))
      stub.setAttribute('y1', String(midY))
      stub.setAttribute('x2', String(BAR_HALF + 4))
      stub.setAttribute('y2', String(midY))
      const head = svgEl('path')
      head.classList.add('seq-msg-arrow-head')
      head.setAttribute('d', leftOpenPath(BAR_HALF + 4, midY))
      head.setAttribute('fill', 'none')
      const slot = svgEl('line')
      slot.classList.add('seq-slot-indicator')
      slot.setAttribute('x1', String(BAR_HALF))
      slot.setAttribute('y1', String(midY - 6))
      slot.setAttribute('x2', String(BAR_HALF))
      slot.setAttribute('y2', String(midY + 6))

      labelEl = svgEl('text')
      labelEl.classList.add('seq-msg-label')
      labelEl.dataset.msgIdx = String(idx)
      labelEl.textContent = msg.label
      labelEl.setAttribute('x', String(spineX + 4))
      labelEl.setAttribute('y', String(rowY + MSG_ROW_H * 0.38))
      g.append(stub, head, slot, labelEl)

    } else if (msg.kind === 'return' && msg.targetLifelineId) {
      // Connected return: arrow drawn in seqConnLayer — render nothing here

    } else if (!msg.targetLifelineId) {
      // Unconnected sync/async/create: stub pointing right with slot indicator
      const arrowX = this.computedW - 10

      const shaft = svgEl('line')
      shaft.classList.add('seq-msg-arrow')
      shaft.setAttribute('x1', String(spineX))
      shaft.setAttribute('y1', String(midY))
      shaft.setAttribute('x2', String(arrowX))
      shaft.setAttribute('y2', String(midY))
      if (msg.kind === 'async' || msg.kind === 'create') {
        shaft.setAttribute('stroke-dasharray', '4 3')
      }

      if (msg.kind === 'sync') {
        const poly = svgEl('polygon')
        poly.classList.add('seq-msg-arrow-head')
        poly.setAttribute('points', rightArrowPts(arrowX, midY))
        g.append(shaft, poly)
      } else {
        const head = svgEl('path')
        head.classList.add('seq-msg-arrow-head')
        head.setAttribute('d', rightOpenPath(arrowX, midY))
        head.setAttribute('fill', 'none')
        g.append(shaft, head)
      }

      const slot = svgEl('line')
      slot.classList.add('seq-slot-indicator')
      slot.setAttribute('x1', String(arrowX))
      slot.setAttribute('y1', String(midY - 6))
      slot.setAttribute('x2', String(arrowX))
      slot.setAttribute('y2', String(midY + 6))

      labelEl = svgEl('text')
      labelEl.classList.add('seq-msg-label')
      labelEl.dataset.msgIdx = String(idx)
      labelEl.textContent = msg.label
      labelEl.setAttribute('x', String(spineX + 4))
      labelEl.setAttribute('y', String(rowY + MSG_ROW_H * 0.38))
      g.append(slot, labelEl)
    }
    // Connected sync/async/create: arrow and interaction handled entirely in seqConnLayer

    // Uniform click/dblclick for locally-rendered rows (self + unconnected stubs).
    // Mirrors the inter-lifeline baseline: click → popover, dblclick → inline rename.
    if (labelEl) {
      g.style.cursor = 'pointer'
      let clickTimer: ReturnType<typeof setTimeout> | null = null

      g.addEventListener('click', e => {
        e.stopPropagation()
        if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; return }
        clickTimer = setTimeout(() => {
          clickTimer = null
          this.onClickMessage?.(this.ll, idx, e)
        }, 220)
      })

      g.addEventListener('dblclick', e => {
        e.stopPropagation()
        if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null }
        // Dismiss any open popover then edit the label in-place (same as seqConnLayer baseline)
        document.getElementById('msg-popover')?.remove()
        const lbl = g.querySelector<SVGTextElement>('.seq-msg-label')
        if (!lbl) return
        this.onEditMessage(this.ll, idx, lbl)
      })
    }

    this.msgGroup.appendChild(g)
  }

  getMsgTextEl(idx: number): SVGTextElement | null {
    return this.msgGroup.querySelector<SVGTextElement>(`[data-msgidx="${idx}"].seq-msg-label`)
  }

  getSpineX(): number { return this.computedW * SPINE_X_FRAC }
  getBarHalfW(): number { return BAR_HALF }

  getContainer(): SVGGElement { return this.el }
  getRenderedSize(): { w: number; h: number } { return { w: this.computedW, h: Math.max(this.computedH, this.spineBottom) } }
  getContentMinSize(): { w: number; h: number } {
    return { w: Math.max(MIN_W, estimateTextWidth(this.ll.name)), h: HEADER_H + MSG_ROW_H }
  }

  setSelected(s: boolean) { this.el.classList.toggle('selected', s) }
  destroy()               { this.el.remove() }
}

// Re-export as named constants for main.ts consumers
export { HEADER_H as SEQ_HEADER_H, MSG_ROW_H as SEQ_MSG_ROW_H }
