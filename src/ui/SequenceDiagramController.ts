import type { DiagramStore } from '../store/DiagramStore.ts'
import type { SequenceDiagram } from '../entities/SequenceDiagram.ts'
import type { SequenceLifeline, SequenceMessage } from '../entities/SequenceLifeline.ts'
import { createSequenceLifeline } from '../entities/SequenceLifeline.ts'
import { SequenceDiagramRenderer } from '../renderers/SequenceDiagramRenderer.ts'
import type { InsertSlot, ActiveSpan } from '../renderers/SequenceLifelineRenderer.ts'
import { SEQ_HEADER_H, SEQ_MSG_ROW_H } from '../renderers/SequenceLifelineRenderer.ts'
import type { DragController } from '../interaction/DragController.ts'
import type { ConnectionController } from '../interaction/ConnectionController.ts'
import type { SelectionManager } from '../interaction/SelectionManager.ts'
import type { InlineEditor } from '../interaction/InlineEditor.ts'
import { showMsgPopover } from './MessagePopover.ts'
import { showElementPropertiesPanel, hideElementPropertiesPanel } from './ElementPropertiesPanel.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

interface MsgEvent {
  slotTopY: number
  absY: number
  srcId: string
  tgtId: string | null
  kind: SequenceMessage['kind']
  msgIdx: number
  msg: SequenceMessage
  globalSlot: number
}

export interface SequenceDiagramControllerDeps {
  store: DiagramStore
  seqLayer: SVGGElement
  seqConnLayer: SVGGElement
  svg: SVGSVGElement
  viewGroup: SVGGElement
  drag: DragController
  connect: ConnectionController
  selection: SelectionManager
  inlineEditor: InlineEditor
  getActiveTool: () => string
  seqDiagramRenderers: Map<string, SequenceDiagramRenderer>
}

export class SequenceDiagramController {
  private store: DiagramStore
  private seqLayer: SVGGElement
  private seqConnLayer: SVGGElement
  private svg: SVGSVGElement
  private viewGroup: SVGGElement
  private drag: DragController
  private connect: ConnectionController
  private selection: SelectionManager
  private inlineEditor: InlineEditor
  private getActiveTool: () => string
  private seqDiagramRenderers: Map<string, SequenceDiagramRenderer>

  // Lifeline add-button state
  private lifelineAddCleanup: (() => void) | null = null
  private lifelineAddSdId: string | null = null

  // Selected inter-lifeline arrow
  private selectedSeqArrow: { srcId: string; msgIdx: number } | null = null

  constructor(deps: SequenceDiagramControllerDeps) {
    this.store = deps.store
    this.seqLayer = deps.seqLayer
    this.seqConnLayer = deps.seqConnLayer
    this.svg = deps.svg
    this.viewGroup = deps.viewGroup
    this.drag = deps.drag
    this.connect = deps.connect
    this.selection = deps.selection
    this.inlineEditor = deps.inlineEditor
    this.getActiveTool = deps.getActiveTool
    this.seqDiagramRenderers = deps.seqDiagramRenderers
  }

  // ─── SVG coordinate helper ──────────────────────────────────────────────────

  private getSvgPoint(e: MouseEvent): DOMPoint {
    const pt = this.svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    return pt.matrixTransform(this.viewGroup.getScreenCTM()!.inverse())
  }

  // ─── Lifeline add buttons ───────────────────────────────────────────────────

  hideLifelineAddButtons() {
    this.lifelineAddCleanup?.()
    this.lifelineAddCleanup = null
    this.lifelineAddSdId = null
  }

  showLifelineAddButtons(sd: SequenceDiagram) {
    this.hideLifelineAddButtons()
    this.lifelineAddSdId = sd.id
    const svgRect = this.svg.getBoundingClientRect()
    const vp = this.store.state.viewport

    const toScreen = (diagX: number, diagY: number) => ({
      x: svgRect.left + diagX * vp.zoom + vp.x,
      y: svgRect.top  + diagY * vp.zoom + vp.y,
    })

    const r = this.seqDiagramRenderers.get(sd.id)
    const { w: sdW } = r?.getRenderedSize() ?? sd.size
    const midY = sd.position.y + SEQ_HEADER_H / 2
    const BTN_SIZE = 22
    const GAP = 6

    const leftEdge  = toScreen(sd.position.x, midY)
    const rightEdge = toScreen(sd.position.x + sdW, midY)
    const leftPos  = { x: leftEdge.x - BTN_SIZE - GAP, y: leftEdge.y - BTN_SIZE / 2 }
    const rightPos = { x: rightEdge.x + GAP, y: rightEdge.y - BTN_SIZE / 2 }

    const makeBtn = (side: 'left' | 'right', pos: { x: number; y: number }) => {
      const btn = document.createElement('button')
      btn.className = 'lifeline-add-btn'
      btn.textContent = '+'
      btn.title = side === 'left' ? 'Add lifeline to the left' : 'Add lifeline to the right'
      btn.style.left = `${pos.x}px`
      btn.style.top  = `${pos.y}px`
      btn.addEventListener('mousedown', e => e.stopPropagation())
      btn.addEventListener('click', e => {
        e.stopPropagation()
        this.addLifelineToSeqDiagram(sd.id, side)
      })
      document.body.appendChild(btn)
      return btn
    }

    const btnLeft  = makeBtn('left',  leftPos)
    const btnRight = makeBtn('right', rightPos)

    this.lifelineAddCleanup = () => {
      btnLeft.remove()
      btnRight.remove()
    }
  }

  refreshLifelineAddButtons() {
    if (!this.lifelineAddSdId) return
    const sd = this.store.state.sequenceDiagrams.find(s => s.id === this.lifelineAddSdId)
    if (sd) this.showLifelineAddButtons(sd)
    else this.hideLifelineAddButtons()
  }

  private addLifelineToSeqDiagram(sdId: string, side: 'left' | 'right') {
    const sd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
    if (!sd) return
    const GAP = 20
    const LL_W = 140
    if (side === 'right') {
      const lastX = sd.lifelines.length > 0
        ? Math.max(...sd.lifelines.map(ll => ll.position.x + LL_W))
        : 0
      const newLL = createSequenceLifeline(lastX + GAP, 0)
      this.store.updateSequenceDiagram(sdId, { lifelines: [...sd.lifelines, newLL] })
    } else {
      const newLL = createSequenceLifeline(0, 0)
      const shifted = sd.lifelines.map(ll => ({ ...ll, position: { x: ll.position.x + LL_W + GAP, y: ll.position.y } }))
      this.store.updateSequenceDiagram(sdId, { lifelines: [newLL, ...shifted] })
    }
  }

  // ─── Renderer creation ──────────────────────────────────────────────────────

  addSeqDiagramRenderer(sd: SequenceDiagram) {
    const r = new SequenceDiagramRenderer(
      sd,
      this.store,
      this.seqLayer,
      (sdId, lifeline, slot) => this.startSeqSlotDrag(sdId, lifeline.id, slot),
      (sdId, lifeline, msgIdx, labelEl) => {
        const currentSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
        const currentLL = currentSd?.lifelines.find(l => l.id === lifeline.id)
        if (!currentSd || !currentLL) return
        this.inlineEditor.edit(labelEl, currentLL.messages[msgIdx].label, (val) => {
          const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
          if (!latestSd) return
          const latestLL = latestSd.lifelines.find(l => l.id === lifeline.id)
          if (!latestLL) return
          const msgs = [...latestLL.messages]
          msgs[msgIdx] = { ...msgs[msgIdx], label: val || 'message' }
          this.store.updateSequenceDiagram(sdId, {
            lifelines: latestSd.lifelines.map(l => l.id === lifeline.id ? { ...l, messages: msgs } : l)
          })
        })
      },
      (sdId, lifeline, fromLocalY) => this.startSeqPortDrag(sdId, lifeline.id, fromLocalY),
      (sdId, lifeline, msgIdx, e) => {
        // Self-call click: open message popover (same as seqConnLayer arrow click)
        const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
        const latestLL = latestSd?.lifelines.find(l => l.id === lifeline.id)
        if (!latestSd || !latestLL) return
        const latestMsg = latestLL.messages[msgIdx]
        if (!latestMsg) return
        const otherLifelines = latestSd.lifelines
          .filter(l => l.id !== lifeline.id)
          .map(l => ({ id: l.id, name: l.name }))
        this.setSelectedSeqArrow({ srcId: lifeline.id, msgIdx })
        showMsgPopover(
          e.clientX, e.clientY,
          latestMsg,
          otherLifelines,
          (patch) => {
            const sd2 = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
            const ll2 = sd2?.lifelines.find(l => l.id === lifeline.id)
            if (!sd2 || !ll2) return
            const msgs2 = [...ll2.messages]
            msgs2[msgIdx] = { ...msgs2[msgIdx], ...patch }
            this.store.updateSequenceDiagram(sdId, {
              lifelines: sd2.lifelines.map(l => l.id === lifeline.id ? { ...l, messages: msgs2 } : l)
            })
          },
          () => {
            this.removeSeqMessage(sdId, lifeline.id, msgIdx)
            this.setSelectedSeqArrow(null)
          },
          () => this.setSelectedSeqArrow(null),
        )
      },
    )
    this.seqDiagramRenderers.set(sd.id, r)
    this.wireSeqDiagramInteraction(r, sd)
  }

  // ─── Lifeline horizontal drag ───────────────────────────────────────────────

  startLifelineHDrag(sdId: string, llId: string, e: MouseEvent) {
    hideElementPropertiesPanel()
    const sd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
    if (!sd) return
    const ll = sd.lifelines.find(l => l.id === llId)
    if (!ll) return
    const startPt = this.getSvgPoint(e)
    const startX = ll.position.x

    this.store.beginUndoGroup()

    const onMove = (ev: MouseEvent) => {
      const pt = this.getSvgPoint(ev)
      const dx = pt.x - startPt.x
      const newX = Math.max(0, startX + dx)
      const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
      if (!latestSd) return
      this.store.updateSequenceDiagram(sdId, {
        lifelines: latestSd.lifelines.map(l =>
          l.id === llId ? { ...l, position: { x: newX, y: 0 } } : l
        ),
      })
    }
    const onUp = () => {
      this.store.endUndoGroup()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Interaction wiring ─────────────────────────────────────────────────────

  wireSeqDiagramInteraction(r: SequenceDiagramRenderer, sd: SequenceDiagram) {
    r.el.addEventListener('mousedown', e => {
      if (this.connect.isConnecting) return
      if (this.getActiveTool() === 'pan') return
      // Close any open message or lifeline property popovers when clicking inside the seq-diagram
      hideElementPropertiesPanel()
      // Message-row interactions already stopped propagation, so this only fires for container drag
      const row = (e.target as Element).closest<SVGElement>('.seq-msg-row')
      if (row) return

      // Lifeline header drag → horizontal reorder within container
      const header = (e.target as Element).closest<SVGElement>('.seq-header-bg')
      if (header) {
        const llGroup = header.closest<SVGElement>('.seq-lifeline')
        if (llGroup?.dataset.id) {
          this.selection.select({ kind: 'seq-diagram', id: sd.id }, e.shiftKey)
          this.startLifelineHDrag(sd.id, llGroup.dataset.id, e)
          e.stopPropagation()
          return
        }
      }

      if (!e.shiftKey && this.selection.isSelected(sd.id) && this.selection.items.length > 1) {
        this.drag.startDrag({ kind: 'seq-diagram', id: sd.id }, e, this.selection.items)
      } else {
        this.selection.select({ kind: 'seq-diagram', id: sd.id }, e.shiftKey)
        this.drag.startDrag({ kind: 'seq-diagram', id: sd.id }, e, this.selection.items)
      }
      e.stopPropagation()
    })

    // Delegate message-row clicks to show popover (scoped to container's lifelines)
    r.el.addEventListener('click', e => {
      const row = (e.target as Element).closest<SVGElement>('.seq-msg-row')
      if (!row || row.dataset.msgIdx === undefined) return
      e.stopPropagation()

      // Find which lifeline this row belongs to by walking up to the lifeline group
      const llGroup = (e.target as Element).closest<SVGElement>('.seq-lifeline')
      if (!llGroup) return
      const llId = llGroup.dataset.id
      if (!llId) return

      const msgIdx = Number(row.dataset.msgIdx)
      const currentSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
      const currentLL = currentSd?.lifelines.find(l => l.id === llId)
      if (!currentSd || !currentLL) return
      const msg = currentLL.messages[msgIdx]
      if (!msg) return

      const otherLifelines = currentSd.lifelines
        .filter(l => l.id !== llId)
        .map(l => ({ id: l.id, name: l.name }))

      showMsgPopover(
        e.clientX, e.clientY,
        msg,
        otherLifelines,
        (patch) => {
          const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
          if (!latestSd) return
          const latestLL = latestSd.lifelines.find(l => l.id === llId)
          if (!latestLL) return
          const msgs = [...latestLL.messages]
          msgs[msgIdx] = { ...msgs[msgIdx], ...patch }
          this.store.updateSequenceDiagram(sd.id, {
            lifelines: latestSd.lifelines.map(l => l.id === llId ? { ...l, messages: msgs } : l)
          })
        },
        () => {
          this.removeSeqMessage(sd.id, llId, msgIdx)
        },
        () => {},
      )
    })

    // Lifeline header click → show accent-color properties panel
    r.el.addEventListener('click', e => {
      const header = (e.target as Element).closest<SVGElement>('.seq-header-bg')
      if (!header) return
      const llGroup = header.closest<SVGElement>('.seq-lifeline')
      if (!llGroup?.dataset.id) return
      const llId = llGroup.dataset.id
      e.stopPropagation()

      const currentSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
      const ll = currentSd?.lifelines.find(l => l.id === llId)
      if (!currentSd || !ll) return

      const svgRect = this.svg.getBoundingClientRect()
      const vp = this.store.state.viewport
      const HEADER_H = 40
      const absX = sd.position.x + ll.position.x
      const screenX = svgRect.left + (absX + ll.size.w) * vp.zoom + vp.x + 8
      const screenY = svgRect.top  + (sd.position.y + ll.position.y + HEADER_H / 2) * vp.zoom + vp.y

      showElementPropertiesPanel(
        screenX,
        screenY,
        undefined,
        () => {},
        undefined,
        undefined,
        ll.accentColor,
        (color) => this.store.updateLifeline(sd.id, llId, { accentColor: color }),
      )
    })

    // Lifeline header dblclick → rename lifeline
    r.el.addEventListener('dblclick', e => {
      const target = e.target as Element
      if (!target.classList.contains('seq-header-bg') && !target.closest('.seq-header-bg')) return
      const llGroup = target.closest<SVGElement>('.seq-lifeline')
      if (!llGroup) return
      const llId = llGroup.dataset.id
      if (!llId) return
      e.stopPropagation()

      const currentSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
      const currentLL = currentSd?.lifelines.find(l => l.id === llId)
      if (!currentSd || !currentLL) return

      const llR = r.getLifelineRenderer(llId)
      const nameEl = llR?.el.querySelector<SVGTextElement>('.seq-header-name')
      if (!nameEl) return
      this.inlineEditor.edit(nameEl, currentLL.name, (val) => {
        const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
        if (!latestSd) return
        this.store.updateSequenceDiagram(sd.id, {
          lifelines: latestSd.lifelines.map(l => l.id === llId ? { ...l, name: val || 'Lifeline' } : l)
        })
      })
    })

    // Message-row drag to connect to another lifeline (within this container)
    r.el.addEventListener('mousedown', (e) => {
      const row = (e.target as Element).closest<SVGElement>('.seq-msg-row')
      if (!row || row.dataset.msgIdx === undefined) return
      if (e.button !== 0) return

      e.stopImmediatePropagation()
      e.stopPropagation()
      e.preventDefault()

      const llGroup = (e.target as Element).closest<SVGElement>('.seq-lifeline')
      if (!llGroup) return
      const llId = llGroup.dataset.id
      if (!llId) return

      const msgIdx = Number(row.dataset.msgIdx)
      const currentSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
      const currentLL = currentSd?.lifelines.find(l => l.id === llId)
      if (!currentSd || !currentLL) return

      const llR = r.getLifelineRenderer(llId)
      if (!llR) return

      const spineAbsX = sd.position.x + currentLL.position.x + llR.getSpineX()
      const baselineY = sd.position.y + SEQ_HEADER_H
      const ephemeral = (currentLL.messages[msgIdx] as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot
      const globalSlot = currentLL.messages[msgIdx].slotIndex ?? ephemeral ?? msgIdx
      const msgY = baselineY + globalSlot * SEQ_MSG_ROW_H + SEQ_MSG_ROW_H / 2

      const ghost = document.createElementNS(SVG_NS, 'line')
      ghost.classList.add('ghost-line')
      ghost.setAttribute('x1', String(spineAbsX))
      ghost.setAttribute('y1', String(msgY))
      ghost.setAttribute('x2', String(spineAbsX))
      ghost.setAttribute('y2', String(msgY))
      ghost.setAttribute('pointer-events', 'none')
      this.seqConnLayer.appendChild(ghost)

      r.getLifelineRenderers().forEach((lr, id) => { if (id !== llId) lr.setDropTarget(true) })

      let dragStarted = false
      const startX = e.clientX
      const startY = e.clientY
      let lastHoveredId: string | null = null

      const onMove = (ev: MouseEvent) => {
        if (!dragStarted) {
          if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
          dragStarted = true
        }
        const svgPt = this.getSvgPoint(ev)
        ghost.setAttribute('x2', String(svgPt.x))
        ghost.setAttribute('y2', String(svgPt.y))

        let hovId: string | null = null
        const latestSd2 = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
        if (latestSd2) {
          for (const [id, lr] of r.getLifelineRenderers()) {
            if (id === llId) continue
            const tgtLL = latestSd2.lifelines.find(l => l.id === id)
            if (!tgtLL) continue
            const { w, h } = lr.getRenderedSize()
            const absX = sd.position.x + tgtLL.position.x
            const absY2 = sd.position.y
            if (svgPt.x >= absX && svgPt.x <= absX + w &&
                svgPt.y >= absY2 && svgPt.y <= absY2 + h) {
              hovId = id; break
            }
          }
        }
        if (hovId !== lastHoveredId) {
          if (lastHoveredId) r.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
          lastHoveredId = hovId
        }
        if (hovId) {
          const latestSd3 = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
          const tgtLL = latestSd3?.lifelines.find(l => l.id === hovId)
          if (tgtLL) r.getLifelineRenderer(hovId)?.setDropSlot(msgY - (sd.position.y + tgtLL.position.y))
        }
      }

      const onUp = (_ev: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        ghost.remove()
        const droppedOnId = lastHoveredId
        if (lastHoveredId) r.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
        r.getLifelineRenderers().forEach(lr => lr.setDropTarget(false))

        if (!dragStarted || !droppedOnId) return

        const latestSd4 = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
        const latestLL = latestSd4?.lifelines.find(l => l.id === llId)
        if (!latestSd4 || !latestLL) return
        const msgs = [...latestLL.messages]
        msgs[msgIdx] = { ...msgs[msgIdx], targetLifelineId: droppedOnId }
        this.store.updateSequenceDiagram(sd.id, {
          lifelines: latestSd4.lifelines.map(l => l.id === llId ? { ...l, messages: msgs } : l)
        })
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    })
  }

  // ─── Seq slot drag ──────────────────────────────────────────────────────────

  startSeqSlotDrag(sdId: string, srcLLId: string, slot: InsertSlot) {
    const sd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
    const sdR_ = this.seqDiagramRenderers.get(sdId)
    if (!sd || !sdR_) return
    const sdR = sdR_
    const srcLL = sd.lifelines.find(l => l.id === srcLLId)
    const srcR  = sdR.getLifelineRenderer(srcLLId)
    if (!srcLL || !srcR) return

    const absX = sd.position.x + srcLL.position.x + srcR.getSpineX()
    const absY = sd.position.y + slot.localY

    const ghost = document.createElementNS(SVG_NS, 'line')
    ghost.classList.add('ghost-line')
    ghost.setAttribute('x1', String(absX))
    ghost.setAttribute('y1', String(absY))
    ghost.setAttribute('x2', String(absX))
    ghost.setAttribute('y2', String(absY))
    ghost.setAttribute('pointer-events', 'none')
    this.seqConnLayer.appendChild(ghost)

    sdR.getLifelineRenderers().forEach((_r) => { _r.setDropTarget(true) })

    let lastHoveredId: string | null = null
    const HIT_PAD = 20

    const onMove = (ev: MouseEvent) => {
      const svgPt = this.getSvgPoint(ev)
      ghost.setAttribute('x2', String(svgPt.x))
      ghost.setAttribute('y2', String(svgPt.y))

      const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
      let hovId: string | null = null
      if (latestSd) {
        for (const [id, lr] of sdR.getLifelineRenderers()) {
          const tgtLL = latestSd.lifelines.find(l => l.id === id)
          if (!tgtLL) continue
          const { w, h } = lr.getRenderedSize()
          const tgtAbsX = latestSd.position.x + tgtLL.position.x
          const tgtAbsY = latestSd.position.y
          if (svgPt.x >= tgtAbsX - HIT_PAD && svgPt.x <= tgtAbsX + w + HIT_PAD &&
              svgPt.y >= tgtAbsY - HIT_PAD && svgPt.y <= tgtAbsY + h + HIT_PAD) {
            hovId = id; break
          }
        }
      }

      if (hovId !== lastHoveredId) {
        if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
        lastHoveredId = hovId
      }
      if (hovId) {
        const latestSd2 = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
        const tgtLL = latestSd2?.lifelines.find(l => l.id === hovId)
        if (tgtLL) sdR.getLifelineRenderer(hovId)?.setDropSlot(absY - (latestSd2!.position.y + tgtLL.position.y))
      }
    }

    const onUp = (_ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      ghost.remove()
      const droppedOnId = lastHoveredId
      if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
      sdR.getLifelineRenderers().forEach(r => r.setDropTarget(false))

      if (!droppedOnId) return

      const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
      if (!latestSd) return
      const baselineY = latestSd.position.y + SEQ_HEADER_H
      const SLOT_H = SEQ_MSG_ROW_H
      const newGlobalSlot = Math.max(0, Math.floor((absY - baselineY) / SLOT_H))

      // Bump all messages with slotIndex >= newGlobalSlot across ALL lifelines in this container
      const bumpedLifelines = latestSd.lifelines.map(ll => ({
        ...ll,
        messages: ll.messages.map(m =>
          m.slotIndex !== undefined && m.slotIndex >= newGlobalSlot
            ? { ...m, slotIndex: m.slotIndex + 1 }
            : m
        )
      }))

      const srcLLBumped = bumpedLifelines.find(l => l.id === srcLLId)
      if (!srcLLBumped) return

      const isSelfCall = droppedOnId === srcLLId
      const msg: SequenceMessage = {
        id: crypto.randomUUID(),
        label: 'message',
        targetLifelineId: isSelfCall ? null : droppedOnId,
        kind: isSelfCall ? 'self' : 'sync',
        slotIndex: newGlobalSlot,
      }
      const msgs = [...srcLLBumped.messages]
      msgs.splice(slot.slotIdx, 0, msg)

      this.store.updateSequenceDiagram(sdId, {
        lifelines: bumpedLifelines.map(l => l.id === srcLLId ? { ...l, messages: msgs } : l)
      })

      // Immediately open the message popover for the new message
      const freshSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
      const freshLL = freshSd?.lifelines.find(l => l.id === srcLLId)
      if (!freshSd || !freshLL) return
      const newMsgIdx = freshLL.messages.findIndex(m => m.id === msg.id)
      if (newMsgIdx === -1) return
      const otherLifelines = freshSd.lifelines
        .filter(l => l.id !== srcLLId)
        .map(l => ({ id: l.id, name: l.name }))
      this.setSelectedSeqArrow({ srcId: srcLLId, msgIdx: newMsgIdx })
      showMsgPopover(
        _ev.clientX, _ev.clientY,
        freshLL.messages[newMsgIdx],
        otherLifelines,
        (patch) => {
          const sd2 = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
          const ll2 = sd2?.lifelines.find(l => l.id === srcLLId)
          if (!sd2 || !ll2) return
          const msgs2 = [...ll2.messages]
          msgs2[newMsgIdx] = { ...msgs2[newMsgIdx], ...patch }
          this.store.updateSequenceDiagram(sdId, {
            lifelines: sd2.lifelines.map(l => l.id === srcLLId ? { ...l, messages: msgs2 } : l)
          })
        },
        () => {
          this.removeSeqMessage(sdId, srcLLId, newMsgIdx)
          this.setSelectedSeqArrow(null)
        },
        () => this.setSelectedSeqArrow(null),
      )
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Seq port drag ──────────────────────────────────────────────────────────

  startSeqPortDrag(sdId: string, srcLLId: string, fromLocalY: number) {
    const sd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
    const sdR_ = this.seqDiagramRenderers.get(sdId)
    if (!sd || !sdR_) return
    const sdR = sdR_
    const srcLL = sd.lifelines.find(l => l.id === srcLLId)
    const srcR  = sdR.getLifelineRenderer(srcLLId)
    if (!srcLL || !srcR) return

    const absX = sd.position.x + srcLL.position.x + srcR.getSpineX()
    const absY = sd.position.y + fromLocalY

    const ghost = document.createElementNS(SVG_NS, 'line')
    ghost.classList.add('ghost-line')
    ghost.setAttribute('x1', String(absX))
    ghost.setAttribute('y1', String(absY))
    ghost.setAttribute('x2', String(absX))
    ghost.setAttribute('y2', String(absY))
    ghost.setAttribute('pointer-events', 'none')
    this.seqConnLayer.appendChild(ghost)

    sdR.getLifelineRenderers().forEach((_r) => { _r.setDropTarget(true) })

    let lastHoveredId: string | null = null
    const HIT_PAD = 20

    const onMove = (ev: MouseEvent) => {
      const svgPt = this.getSvgPoint(ev)
      ghost.setAttribute('x2', String(svgPt.x))
      ghost.setAttribute('y2', String(svgPt.y))

      const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
      let hovId: string | null = null
      if (latestSd) {
        for (const [id, lr] of sdR.getLifelineRenderers()) {
          const tgtLL = latestSd.lifelines.find(l => l.id === id)
          if (!tgtLL) continue
          const { w, h } = lr.getRenderedSize()
          const tgtAbsX = latestSd.position.x + tgtLL.position.x
          const tgtAbsY = latestSd.position.y
          if (svgPt.x >= tgtAbsX - HIT_PAD && svgPt.x <= tgtAbsX + w + HIT_PAD &&
              svgPt.y >= tgtAbsY - HIT_PAD && svgPt.y <= tgtAbsY + h + HIT_PAD) {
            hovId = id; break
          }
        }
      }

      if (hovId !== lastHoveredId) {
        if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
        lastHoveredId = hovId
      }
      if (hovId) {
        const latestSd2 = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
        const tgtLL = latestSd2?.lifelines.find(l => l.id === hovId)
        if (tgtLL) sdR.getLifelineRenderer(hovId)?.setDropSlot(absY - (latestSd2!.position.y + tgtLL.position.y))
      }
    }

    const onUp = (_ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      ghost.remove()
      const droppedOnId = lastHoveredId
      if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
      sdR.getLifelineRenderers().forEach(r => r.setDropTarget(false))

      if (!droppedOnId) return

      const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
      const latestSrc = latestSd?.lifelines.find(l => l.id === srcLLId)
      if (!latestSd || !latestSrc) return

      const baselineY = latestSd.position.y + SEQ_HEADER_H
      const newGlobalSlot = Math.ceil((absY - baselineY) / SEQ_MSG_ROW_H)

      const isSelfCall = droppedOnId === srcLLId
      const msg: SequenceMessage = {
        id: crypto.randomUUID(),
        label: 'message',
        targetLifelineId: isSelfCall ? null : droppedOnId,
        kind: isSelfCall ? 'self' : 'sync',
        slotIndex: Math.max(0, newGlobalSlot),
      }
      this.store.updateSequenceDiagram(sdId, {
        lifelines: latestSd.lifelines.map(l => l.id === srcLLId
          ? { ...l, messages: [...l.messages, msg] }
          : l)
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ─── Arrow rendering ────────────────────────────────────────────────────────

  private renderSeqArrow(
    container: SVGElement,
    x1: number, y1: number,
    x2: number, y2: number,
    kind: SequenceMessage['kind'],
  ) {
    const goingRight = x2 >= x1

    const shaft = document.createElementNS(SVG_NS, 'line')
    shaft.classList.add('seq-conn-arrow')
    shaft.setAttribute('x1', String(x1))
    shaft.setAttribute('y1', String(y1))
    shaft.setAttribute('x2', String(x2))
    shaft.setAttribute('y2', String(y2))
    if (kind === 'async' || kind === 'create' || kind === 'return') {
      shaft.setAttribute('stroke-dasharray', '4 3')
    }
    container.appendChild(shaft)

    const ax = x2
    const ay = y2
    const dir = goingRight ? 1 : -1

    if (kind === 'sync') {
      const poly = document.createElementNS(SVG_NS, 'polygon')
      poly.classList.add('seq-conn-arrow-head')
      poly.setAttribute('points', `${ax - dir * 8},${ay - 5} ${ax},${ay} ${ax - dir * 8},${ay + 5}`)
      container.appendChild(poly)
    } else {
      const path = document.createElementNS(SVG_NS, 'path')
      path.classList.add('seq-conn-arrow-head', 'open')
      path.setAttribute('d', `M${ax - dir * 8},${ay - 5} L${ax},${ay} L${ax - dir * 8},${ay + 5}`)
      container.appendChild(path)
    }
  }

  // ─── Selected arrow tracking ────────────────────────────────────────────────

  setSelectedSeqArrow(key: { srcId: string; msgIdx: number } | null) {
    this.selectedSeqArrow = key
    this.seqConnLayer.querySelectorAll<SVGGElement>('[data-src-id]').forEach(g => {
      const match = key && g.dataset.srcId === key.srcId && Number(g.dataset.msgIdx) === key.msgIdx
      g.classList.toggle('seq-conn-selected', !!match)
    })
  }

  // ─── Message removal ────────────────────────────────────────────────────────

  removeSeqMessage(sdId: string, llId: string, msgIdx: number) {
    const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sdId)
    if (!latestSd) return
    const updated = latestSd.lifelines.map(l =>
      l.id === llId ? { ...l, messages: l.messages.filter((_, i) => i !== msgIdx) } : l
    )
    const usedSlots = new Set<number>()
    for (const ll of updated) {
      for (const m of ll.messages) {
        if (m.slotIndex !== undefined) usedSlots.add(m.slotIndex)
      }
    }
    const sorted = [...usedSlots].sort((a, b) => a - b)
    const remap = new Map(sorted.map((old, i) => [old, i]))
    const compacted = updated.map(ll => ({
      ...ll,
      messages: ll.messages.map(m =>
        m.slotIndex !== undefined && remap.has(m.slotIndex)
          ? { ...m, slotIndex: remap.get(m.slotIndex)! }
          : m
      ),
    }))
    this.store.updateSequenceDiagram(sdId, { lifelines: compacted })
  }

  // ─── Pure helpers ───────────────────────────────────────────────────────────

  /** Assign ephemeral slots to messages that lack explicit slotIndex. */
  assignEphemeralSlots(lifelines: SequenceLifeline[]) {
    const allHaveSlotIndex = lifelines.every(ll => ll.messages.every(m => m.slotIndex !== undefined))
    if (allHaveSlotIndex) return
    const sorted = [...lifelines].sort((a, b) => a.position.x - b.position.x)
    const maxMsgs = Math.max(...lifelines.map(ll => ll.messages.length), 0)
    let slot = 0
    for (let round = 0; round < maxMsgs; round++) {
      for (const ll of sorted) {
        const msg = ll.messages[round]
        if (!msg) continue
        if (msg.slotIndex === undefined) {
          ;(msg as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot = slot++
        } else {
          slot = Math.max(slot, msg.slotIndex + 1)
        }
      }
    }
  }

  /** Collect all messages as absolute-Y events, sorted by slot position. */
  collectMsgEvents(lifelines: SequenceLifeline[], baselineY: number, slotH: number): MsgEvent[] {
    const lifelineMap = new Map(lifelines.map(ll => [ll.id, ll]))
    const events: MsgEvent[] = []
    for (const srcLL of lifelines) {
      srcLL.messages.forEach((msg, idx) => {
        const ephemeral = (msg as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot
        const globalSlot = msg.slotIndex ?? ephemeral ?? idx
        const slotTopY = baselineY + globalSlot * slotH
        events.push({
          slotTopY,
          absY: slotTopY + slotH / 2,
          srcId: srcLL.id,
          tgtId: msg.targetLifelineId,
          kind: msg.kind,
          msgIdx: idx,
          msg,
          globalSlot,
        })
      })
    }
    events.sort((a, b) => a.slotTopY - b.slotTopY || (lifelineMap.get(a.srcId)?.position.x ?? 0) - (lifelineMap.get(b.srcId)?.position.x ?? 0))
    return events
  }

  /** Compute activation bar spans (absolute Y) per lifeline from sorted events. */
  computeActiveBars(events: MsgEvent[], lifelines: SequenceLifeline[], slotH: number) {
    interface BarState {
      openY: number | null
      spans: { yStart: number; yEnd: number }[]
      lastTouchedSlotTop: number | null
    }
    const barState = new Map<string, BarState>(
      lifelines.map(ll => [ll.id, { openY: null, spans: [], lastTouchedSlotTop: null }])
    )
    const openBar = (llId: string, slotTopY: number) => {
      const s = barState.get(llId)
      if (!s) return
      if (s.openY === null) s.openY = slotTopY
      if (s.lastTouchedSlotTop === null || slotTopY > s.lastTouchedSlotTop) s.lastTouchedSlotTop = slotTopY
    }
    const closeBar = (llId: string, closeAbsY: number, slotTopY: number) => {
      const s = barState.get(llId)
      if (!s) return
      if (s.openY !== null) {
        s.spans.push({ yStart: s.openY, yEnd: closeAbsY })
        s.openY = null
      }
      if (s.lastTouchedSlotTop === null || slotTopY > s.lastTouchedSlotTop) s.lastTouchedSlotTop = slotTopY
    }
    const lifelineMap = new Map(lifelines.map(ll => [ll.id, ll]))
    for (const ev of events) {
      const tgtLL = ev.tgtId ? lifelineMap.get(ev.tgtId) : null
      if (ev.kind === 'self') { openBar(ev.srcId, ev.absY); continue }
      if (ev.kind === 'return') {
        if (tgtLL) {
          closeBar(ev.srcId, ev.absY, ev.slotTopY)
          const ts = barState.get(ev.tgtId!)
          if (ts && (ts.lastTouchedSlotTop === null || ev.slotTopY > ts.lastTouchedSlotTop)) ts.lastTouchedSlotTop = ev.slotTopY
        }
        continue
      }
      if (!tgtLL) continue
      openBar(ev.srcId, ev.absY)
      openBar(ev.tgtId!, ev.absY)
    }
    // Close any still-open bars
    for (const ll of lifelines) {
      const s = barState.get(ll.id)!
      if (s.openY !== null) {
        const lastY = s.lastTouchedSlotTop ?? s.openY
        s.spans.push({ yStart: s.openY, yEnd: lastY + slotH })
        s.openY = null
      }
    }
    return barState
  }

  // ─── Main refresh ───────────────────────────────────────────────────────────

  refreshSeqDiagram(sd: SequenceDiagram, sdR: SequenceDiagramRenderer) {
    const lifelines = sd.lifelines
    if (!lifelines.length) return

    const lifelineMap = new Map(lifelines.map(ll => [ll.id, ll]))
    const SLOT_H = SEQ_MSG_ROW_H
    const baselineY = sd.position.y + SEQ_HEADER_H

    this.assignEphemeralSlots(lifelines)
    const events = this.collectMsgEvents(lifelines, baselineY, SLOT_H)
    const barState = this.computeActiveBars(events, lifelines, SLOT_H)

    // Convert abs spans to local (relative to container top), merge, push to renderers
    for (const ll of lifelines) {
      const { spans } = barState.get(ll.id)!
      spans.sort((a, b) => a.yStart - b.yStart)
      const merged: ActiveSpan[] = []
      for (const s of spans) {
        const localStart = s.yStart - sd.position.y
        const localEnd   = s.yEnd   - sd.position.y
        const last = merged[merged.length - 1]
        if (last && localStart <= last.yEnd + 2) {
          last.yEnd = Math.max(last.yEnd, localEnd)
        } else {
          merged.push({ yStart: localStart, yEnd: localEnd, showPort: false })
        }
      }
      if (merged.length > 0) merged[merged.length - 1].showPort = false
      sdR.getLifelineRenderer(ll.id)?.updateActiveBars(merged)
    }

    // Push insert slot Ys to renderers
    const allGlobalSlots = [...new Set(events.map(ev => ev.globalSlot))].sort((a, b) => a - b)
    const globalSlotAbsYs = allGlobalSlots.map(slot => baselineY + slot * SLOT_H + SLOT_H / 2)

    for (const ll of lifelines) {
      const msgs = ll.messages
      const msgSlotLocalYs = msgs.map((msg, idx) => {
        const ephemeral = (msg as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot
        const globalSlot = msg.slotIndex ?? ephemeral ?? idx
        const absY = baselineY + globalSlot * SLOT_H + SLOT_H / 2
        return absY - sd.position.y
      })

      sdR.getLifelineRenderer(ll.id)?.setMsgLocalYs(msgSlotLocalYs)
      sdR.getLifelineRenderer(ll.id)?.update(ll)

      const slotYs: number[] = []
      if (globalSlotAbsYs.length === 0) {
        slotYs.push(SEQ_HEADER_H + SLOT_H / 2)
      } else {
        const firstAbsY = globalSlotAbsYs[0]
        const lastAbsY  = globalSlotAbsYs[globalSlotAbsYs.length - 1]
        slotYs.push((SEQ_HEADER_H + sd.position.y + firstAbsY) / 2 - sd.position.y)
        for (let i = 1; i < globalSlotAbsYs.length; i++) {
          slotYs.push((globalSlotAbsYs[i - 1] + globalSlotAbsYs[i]) / 2 - sd.position.y)
        }
        slotYs.push(lastAbsY + SLOT_H / 2 - sd.position.y)
      }

      sdR.getLifelineRenderer(ll.id)?.updateInsertSlots(slotYs)
    }

    // Compute bounding box and update sd.size
    {
      let maxW = 0
      let maxH = 0
      for (const ll of lifelines) {
        const llR = sdR.getLifelineRenderer(ll.id)
        const { w, h } = llR?.getRenderedSize() ?? { w: 140, h: 80 }
        maxW = Math.max(maxW, ll.position.x + w)
        maxH = Math.max(maxH, h)
      }
      if (events.length > 0) {
        const maxAbsY = Math.max(...events.map(ev => ev.absY))
        const maxEventLocalH = maxAbsY - sd.position.y + SLOT_H
        maxH = Math.max(maxH, maxEventLocalH)
      }
      if (maxW !== sd.size.w || maxH !== sd.size.h) {
        ;(sd as SequenceDiagram).size = { w: maxW, h: maxH }
      }
      sdR.update(sd)
      for (const ll of lifelines) {
        sdR.getLifelineRenderer(ll.id)?.setSpineBottom(maxH)
      }
    }

    // Draw inter-lifeline arrows (absolute canvas coords)
    for (const ev of events) {
      if (ev.kind === 'self' || !ev.tgtId) continue
      const srcLL = lifelineMap.get(ev.srcId)
      const tgtLL = lifelineMap.get(ev.tgtId)
      if (!srcLL || !tgtLL) continue
      const srcR = sdR.getLifelineRenderer(srcLL.id)
      const tgtR = sdR.getLifelineRenderer(tgtLL.id)
      if (!srcR || !tgtR) continue

      const absY = ev.absY
      const srcSpineX = srcR.getSpineX()
      const tgtSpineX = tgtR.getSpineX()
      const barHalf   = srcR.getBarHalfW()

      const srcLocalY = absY - sd.position.y
      const tgtLocalY = absY - sd.position.y
      const isActive = (llId: string, localY: number) =>
        (barState.get(llId)?.spans ?? []).some(s => localY >= s.yStart - 1 && localY <= s.yEnd + 1)

      const srcActive = isActive(srcLL.id, srcLocalY)
      const tgtActive = isActive(tgtLL.id, tgtLocalY)

      let finalX1: number, finalX2: number
      if (ev.kind === 'return') {
        finalX1 = sd.position.x + srcLL.position.x + srcSpineX - (srcActive ? barHalf : 0)
        finalX2 = sd.position.x + tgtLL.position.x + tgtSpineX + (tgtActive ? barHalf : 0)
      } else {
        finalX1 = sd.position.x + srcLL.position.x + srcSpineX + (srcActive ? barHalf : 0)
        finalX2 = sd.position.x + tgtLL.position.x + tgtSpineX - (tgtActive ? barHalf : 0)
      }

      const g = document.createElementNS(SVG_NS, 'g')
      g.classList.add('seq-conn-group')
      g.dataset.srcId  = srcLL.id
      g.dataset.sdId   = sd.id
      g.dataset.msgIdx = String(ev.msgIdx)
      if (this.selectedSeqArrow?.srcId === srcLL.id && this.selectedSeqArrow.msgIdx === ev.msgIdx) {
        g.classList.add('seq-conn-selected')
      }

      const hit = document.createElementNS(SVG_NS, 'line')
      hit.setAttribute('x1', String(finalX1)); hit.setAttribute('y1', String(absY))
      hit.setAttribute('x2', String(finalX2)); hit.setAttribute('y2', String(absY))
      hit.setAttribute('stroke', 'transparent')
      hit.setAttribute('stroke-width', '12')
      hit.style.cursor = 'pointer'
      g.appendChild(hit)

      this.renderSeqArrow(g, finalX1, absY, finalX2, absY, ev.kind)

      const labelEl = document.createElementNS(SVG_NS, 'text')
      labelEl.classList.add('seq-conn-label')
      labelEl.textContent = ev.msg.label || 'message'
      labelEl.setAttribute('x', String((finalX1 + finalX2) / 2))
      labelEl.setAttribute('y', String(absY - 4))
      labelEl.setAttribute('text-anchor', 'middle')
      g.appendChild(labelEl)

      this.seqConnLayer.appendChild(g)

      g.addEventListener('click', (e) => {
        e.stopPropagation()
        this.setSelectedSeqArrow({ srcId: srcLL.id, msgIdx: ev.msgIdx })

        const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
        const latestSrc = latestSd?.lifelines.find(l => l.id === srcLL.id)
        if (!latestSd || !latestSrc) return
        const latestMsg = latestSrc.messages[ev.msgIdx]
        if (!latestMsg) return
        const otherLifelines = latestSd.lifelines
          .filter(l => l.id !== srcLL.id)
          .map(l => ({ id: l.id, name: l.name }))

        showMsgPopover(
          e.clientX, e.clientY,
          latestMsg,
          otherLifelines,
          (patch) => {
            const latestSd2 = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
            const latestLL = latestSd2?.lifelines.find(l => l.id === srcLL.id)
            if (!latestSd2 || !latestLL) return
            const msgs2 = [...latestLL.messages]
            msgs2[ev.msgIdx] = { ...msgs2[ev.msgIdx], ...patch }
            this.store.updateSequenceDiagram(sd.id, {
              lifelines: latestSd2.lifelines.map(l => l.id === srcLL.id ? { ...l, messages: msgs2 } : l)
            })
          },
          () => {
            this.removeSeqMessage(sd.id, srcLL.id, ev.msgIdx)
            this.setSelectedSeqArrow(null)
          },
          () => this.setSelectedSeqArrow(null),
        )
      })

      g.addEventListener('dblclick', (e) => {
        e.stopPropagation()
        document.getElementById('msg-popover')?.remove()
        const lbl = g.querySelector<SVGTextElement>('.seq-conn-label')
        if (!lbl) return
        const latestSd = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
        const latestSrc = latestSd?.lifelines.find(l => l.id === srcLL.id)
        if (!latestSd || !latestSrc) return
        this.inlineEditor.edit(lbl, latestSrc.messages[ev.msgIdx]?.label ?? '', (val) => {
          const sd2 = this.store.state.sequenceDiagrams.find(s => s.id === sd.id)
          const ll2 = sd2?.lifelines.find(l => l.id === srcLL.id)
          if (!sd2 || !ll2) return
          const msgs = [...ll2.messages]
          msgs[ev.msgIdx] = { ...msgs[ev.msgIdx], label: val || 'message' }
          this.store.updateSequenceDiagram(sd.id, {
            lifelines: sd2.lifelines.map(l => l.id === srcLL.id ? { ...l, messages: msgs } : l)
          })
        })
      })
    }
  }

  // ─── Refresh all sequence connections ──────────────────────────────────────

  refreshSequenceConnections() {
    while (this.seqConnLayer.firstChild) this.seqConnLayer.removeChild(this.seqConnLayer.firstChild)
    for (const sd of this.store.state.sequenceDiagrams ?? []) {
      const sdR = this.seqDiagramRenderers.get(sd.id)
      if (sdR) this.refreshSeqDiagram(sd, sdR)
    }
  }
}
