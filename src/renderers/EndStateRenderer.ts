import type { EndState } from '../entities/EndState.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions } from './svgUtils.ts'

const SIZE = 32

export class EndStateRenderer {
  readonly el: SVGGElement
  private outerCircle: SVGCircleElement
  private innerCircle: SVGCircleElement
  private portsGroup: SVGGElement
  private computedW = SIZE
  private computedH = SIZE

  constructor(
    private endState: EndState,
    store: DiagramStore,
    private onPortMousedown: (s: EndState, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('sd-end-state')
    this.el.dataset.id = endState.id
    this.el.dataset.elementType = 'end-state'

    this.outerCircle = svgEl('circle')
    this.outerCircle.classList.add('sd-end-outer')

    this.innerCircle = svgEl('circle')
    this.innerCircle.classList.add('sd-end-inner')

    this.portsGroup = svgEl('g')

    this.el.append(this.outerCircle, this.innerCircle, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.endState, side, e))
    this.update(endState)

    store.on(ev => {
      if (ev.type === 'endstate:update' && (ev.payload as EndState).id === endState.id) {
        this.endState = ev.payload as EndState
        this.update(this.endState)
      }
    })
  }

  update(s: EndState) {
    const { position: { x, y }, size: { w, h } } = s
    this.computedW = Math.max(w, SIZE)
    this.computedH = Math.max(h, SIZE)
    const outerR = Math.min(this.computedW, this.computedH) / 2
    const innerR = outerR * 0.55
    const cx = this.computedW / 2
    const cy = this.computedH / 2

    this.el.setAttribute('transform', `translate(${x},${y})`)

    this.outerCircle.setAttribute('cx', String(cx))
    this.outerCircle.setAttribute('cy', String(cy))
    this.outerCircle.setAttribute('r',  String(outerR))

    this.innerCircle.setAttribute('cx', String(cx))
    this.innerCircle.setAttribute('cy', String(cy))
    this.innerCircle.setAttribute('r',  String(innerR))

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }
  getContentMinSize() { return { w: SIZE, h: SIZE } }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
}
