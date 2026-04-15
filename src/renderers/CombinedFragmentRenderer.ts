import type { CombinedFragment } from '../entities/CombinedFragment.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { svgEl } from './svgUtils.ts'

const TAB_W = 36
const TAB_H = 20

export class CombinedFragmentRenderer {
  readonly el: SVGGElement
  private bg: SVGRectElement
  private tab: SVGRectElement
  private opText: SVGTextElement
  private condText: SVGTextElement

  constructor(
    private frag: CombinedFragment,
    _store: DiagramStore,
    container: SVGElement,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('seq-fragment')
    this.el.dataset.id = frag.id
    this.el.dataset.elementType = 'seq-fragment'

    this.bg       = svgEl('rect'); this.bg.classList.add('seq-fragment-bg')
    this.tab      = svgEl('rect'); this.tab.classList.add('seq-fragment-tab')
    this.opText   = svgEl('text'); this.opText.classList.add('seq-fragment-op')
    this.condText = svgEl('text'); this.condText.classList.add('seq-fragment-cond')

    this.el.append(this.bg, this.tab, this.opText, this.condText)
    container.appendChild(this.el)

    _store.on(ev => {
      if (ev.type === 'seqfragment:update' && (ev.payload as CombinedFragment).id === frag.id) {
        this.frag = ev.payload as CombinedFragment
        this.update(this.frag)
      }
    })

    this.update(frag)
  }

  update(frag: CombinedFragment) {
    const { x, y } = frag.position
    const { w, h } = frag.size

    this.el.setAttribute('transform', `translate(${x},${y})`)

    // Outer dashed rect
    this.bg.setAttribute('width', String(w))
    this.bg.setAttribute('height', String(h))

    // Operator tab (top-left corner box)
    this.tab.setAttribute('width', String(TAB_W))
    this.tab.setAttribute('height', String(TAB_H))

    // Operator text inside tab
    this.opText.textContent = frag.operator
    this.opText.setAttribute('x', String(TAB_W / 2))
    this.opText.setAttribute('y', String(TAB_H * 0.72))
    this.opText.setAttribute('text-anchor', 'middle')

    // Condition text next to tab
    this.condText.textContent = frag.condition ? `[${frag.condition}]` : ''
    this.condText.setAttribute('x', String(TAB_W + 6))
    this.condText.setAttribute('y', String(TAB_H * 0.72))
  }

  getRenderedSize(): { w: number; h: number } {
    return { w: this.frag.size.w, h: this.frag.size.h }
  }

  getContentMinSize(): { w: number; h: number } {
    return { w: 80, h: 60 }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }

  destroy() {
    this.el.remove()
  }
}
