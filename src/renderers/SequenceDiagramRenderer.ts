import type { SequenceDiagram } from '../entities/SequenceDiagram.ts'
import type { SequenceLifeline } from '../entities/SequenceLifeline.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import {
  SequenceLifelineRenderer,
  type InsertSlot,
} from './SequenceLifelineRenderer.ts'
import { svgEl } from './svgUtils.ts'

export class SequenceDiagramRenderer {
  readonly el: SVGGElement
  private bg: SVGRectElement
  private inner: SVGGElement
  private llRenderers = new Map<string, SequenceLifelineRenderer>()

  constructor(
    private sd: SequenceDiagram,
    store: DiagramStore,
    container: SVGElement,
    public onDragFromSlot: (sdId: string, ll: SequenceLifeline, slot: InsertSlot) => void,
    public onEditMessage: (sdId: string, ll: SequenceLifeline, msgIdx: number, labelEl: SVGTextElement) => void,
    public onDragFromPort: (sdId: string, ll: SequenceLifeline, fromY: number) => void,
    public onClickMessage?: (sdId: string, ll: SequenceLifeline, msgIdx: number, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('seq-diagram')
    this.el.dataset.id = sd.id
    this.el.dataset.elementType = 'seq-diagram'

    this.bg = svgEl('rect')
    this.bg.classList.add('seq-diagram-bg')

    this.inner = svgEl('g')
    this.inner.classList.add('seq-diagram-inner')

    this.el.append(this.bg, this.inner)
    container.appendChild(this.el)

    store.on(ev => {
      if (ev.type === 'seq-diagram:update' && (ev.payload as SequenceDiagram).id === sd.id) {
        this.sd = ev.payload as SequenceDiagram
        // Only sync lifeline renderer set (add/remove renderers for structural changes).
        // update() and setSpineBottom() are driven by refreshSeqDiagram in main.ts,
        // which runs in the earlier-registered main listener — calling them here again
        // would reset spine.y2 back to computedH after setSpineBottom already fixed it.
        this.syncLifelineRenderers(/* updateExisting= */ false)
      }
    })

    this.syncLifelineRenderers()
    this.update(sd)
  }

  private syncLifelineRenderers(updateExisting = true) {
    const sd = this.sd
    const incoming = new Set(sd.lifelines.map(ll => ll.id))

    // Remove renderers for lifelines no longer in the diagram
    for (const [id, r] of this.llRenderers) {
      if (!incoming.has(id)) {
        r.destroy()
        this.llRenderers.delete(id)
      }
    }

    // Add renderers for new lifelines (preserve existing), update all with latest data
    for (const ll of sd.lifelines) {
      if (!this.llRenderers.has(ll.id)) {
        const r = new SequenceLifelineRenderer(
          ll,
          this.inner,
          (life, slot) => this.onDragFromSlot(sd.id, life, slot),
          (life, msgIdx, lbl) => this.onEditMessage(sd.id, life, msgIdx, lbl),
          (life, fromY) => this.onDragFromPort(sd.id, life, fromY),
          (life, msgIdx, e) => this.onClickMessage?.(sd.id, life, msgIdx, e),
        )
        this.llRenderers.set(ll.id, r)
      } else if (updateExisting) {
        this.llRenderers.get(ll.id)!.update(ll)
      }
    }
  }

  update(sd: SequenceDiagram) {
    this.el.setAttribute('transform', `translate(${sd.position.x},${sd.position.y})`)
    this.bg.setAttribute('x', '0')
    this.bg.setAttribute('y', '0')
    this.bg.setAttribute('width',  String(sd.size.w))
    this.bg.setAttribute('height', String(sd.size.h))
  }

  getLifelineRenderer(llId: string): SequenceLifelineRenderer | undefined {
    return this.llRenderers.get(llId)
  }

  getLifelineRenderers(): Map<string, SequenceLifelineRenderer> {
    return this.llRenderers
  }

  setSelected(s: boolean) { this.el.classList.toggle('selected', s) }

  destroy() {
    for (const r of this.llRenderers.values()) r.destroy()
    this.llRenderers.clear()
    this.el.remove()
  }

  getRenderedSize(): { w: number; h: number } {
    return { w: this.sd.size.w, h: this.sd.size.h }
  }

  getContentMinSize(): { w: number; h: number } {
    return this.getRenderedSize()
  }
}
