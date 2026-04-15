import type { UCSystem } from '../entities/UCSystem.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, estimateTextWidth } from './svgUtils.ts'

const LABEL_H = 22   // height of the name bar at the top
const MIN_W   = 160
const MIN_H   = 120

export class UCSystemRenderer {
  readonly el: SVGGElement
  private bg: SVGRectElement
  private nameText: SVGTextElement
  private portsGroup: SVGGElement
  private computedW = MIN_W
  private computedH = MIN_H

  constructor(
    private system: UCSystem,
    store: DiagramStore,
    private onPortMousedown: (system: UCSystem, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('uml-ucsystem')
    this.el.dataset.id = system.id
    this.el.dataset.elementType = 'uc-system'

    this.bg = svgEl('rect')
    this.bg.classList.add('ucsystem-bg')

    this.nameText = svgEl('text')
    this.nameText.classList.add('ucsystem-name')
    this.nameText.setAttribute('text-anchor', 'middle')

    this.portsGroup = svgEl('g')

    this.el.append(this.bg, this.nameText, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.system, side, e))
    this.update(system)

    store.on(ev => {
      if (ev.type === 'ucsystem:update' && (ev.payload as UCSystem).id === system.id) {
        this.system = ev.payload as UCSystem
        this.update(this.system)
      }
    })
  }

  update(system: UCSystem) {
    const { position: { x, y }, size: { w, h } } = system
    const minW = Math.max(MIN_W, estimateTextWidth(system.name) + 32)
    this.computedW = Math.max(w, minW)
    this.computedH = Math.max(h, MIN_H)

    this.el.setAttribute('transform', `translate(${x},${y})`)

    this.bg.setAttribute('width', String(this.computedW))
    this.bg.setAttribute('height', String(this.computedH))

    this.nameText.textContent = system.name
    this.nameText.setAttribute('x', String(this.computedW / 2))
    this.nameText.setAttribute('y', String(LABEL_H - 6))

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    const minW = Math.max(MIN_W, estimateTextWidth(this.system.name) + 32)
    return { w: minW, h: MIN_H }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
}
