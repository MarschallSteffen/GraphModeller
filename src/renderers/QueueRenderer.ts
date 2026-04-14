import type { Queue } from '../entities/Queue.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, renderShadow, estimateTextWidth } from './svgUtils.ts'

// Queue only exposes east and west ports
const QUEUE_PORT_SIDES = ['e', 'w'] as const
const MIN_H = 48

export class QueueRenderer {
  readonly el: SVGGElement
  private shadowGroup: SVGGElement
  private bg: SVGRectElement
  private nameText: SVGTextElement
  private flowArrow: SVGPathElement
  private portsGroup: SVGGElement
  private computedW = 100
  private computedH = MIN_H

  constructor(
    private queue: Queue,
    store: DiagramStore,
    private onPortMousedown: (queue: Queue, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('uml-queue')
    this.el.dataset.id = queue.id
    this.el.dataset.elementType = 'queue'

    this.shadowGroup = svgEl('g')
    this.shadowGroup.classList.add('queue-shadow')

    this.bg = svgEl('rect')
    this.bg.classList.add('queue-bg')

    this.nameText = svgEl('text')
    this.nameText.classList.add('queue-name')

    this.flowArrow = svgEl('path')
    this.flowArrow.classList.add('queue-flow-arrow')

    this.portsGroup = svgEl('g')

    this.el.append(this.shadowGroup, this.bg, this.nameText, this.flowArrow, this.portsGroup)

    renderPortsInto(this.portsGroup, QUEUE_PORT_SIDES, (side, e) => this.onPortMousedown(this.queue, side, e))
    this.update(queue)

    store.on(ev => {
      if (ev.type === 'queue:update' && (ev.payload as Queue).id === queue.id) {
        this.queue = ev.payload as Queue
        this.update(this.queue)
      }
    })
  }

  update(queue: Queue) {
    const { position: { x, y }, size: { w, h }, multiInstance } = queue
    // pill ends consume h/2 on each side, so name needs extra room
    const minW = Math.max(100, estimateTextWidth(queue.name) + Math.max(h, MIN_H))
    this.computedW = Math.max(w, minW)
    this.computedH = Math.max(h, MIN_H)

    this.el.setAttribute('transform', `translate(${x},${y})`)

    // Stadium/pill shape uses rx = h/2 to get fully rounded ends
    const rx = this.computedH / 2

    renderShadow(this.shadowGroup, multiInstance, 'queue-shadow-shape', this.computedW, this.computedH, rx)

    this.bg.setAttribute('width', String(this.computedW))
    this.bg.setAttribute('height', String(this.computedH))
    this.bg.setAttribute('rx', String(rx))
    this.bg.setAttribute('ry', String(rx))

    this.nameText.textContent = queue.name
    this.nameText.setAttribute('x', String(this.computedW / 2))
    this.nameText.setAttribute('y', String(this.computedH / 2 - 2))

    // Flow arrow: centered, 40% of inner width, placed below name text
    const arrowW = Math.max(20, (this.computedW - this.computedH) * 0.45)
    const arrowX = this.computedW / 2
    const arrowY = this.computedH / 2 + 10
    const half = arrowW / 2
    this.flowArrow.setAttribute('d',
      `M${(arrowX - half).toFixed(1)},${arrowY} L${(arrowX + half - 4).toFixed(1)},${arrowY} ` +
      `M${(arrowX + half - 7).toFixed(1)},${arrowY - 3} L${(arrowX + half).toFixed(1)},${arrowY} ` +
      `L${(arrowX + half - 7).toFixed(1)},${arrowY + 3}`
    )

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    const minW = Math.max(100, estimateTextWidth(this.queue.name) + Math.max(this.queue.size.h, MIN_H))
    return { w: minW, h: MIN_H }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
}
