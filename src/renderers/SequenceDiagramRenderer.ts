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
    public onEditMessage: (sdId: string, ll: SequenceLifeline, msgIdx: number) => void,
    public onDragFromPort: (sdId: string, ll: SequenceLifeline, fromY: number) => void,
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
        this.syncLifelineRenderers()
        this.update(this.sd)
      }
    })

    this.syncLifelineRenderers()
    this.update(sd)
  }

  private syncLifelineRenderers() {
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
          (life, msgIdx) => this.onEditMessage(sd.id, life, msgIdx),
          (life, fromY) => this.onDragFromPort(sd.id, life, fromY),
        )
        this.llRenderers.set(ll.id, r)
      } else {
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
}
