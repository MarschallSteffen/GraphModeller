import type { StartState } from '../entities/StartState.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions } from './svgUtils.ts'

const SIZE = 28

export class StartStateRenderer {
  readonly el: SVGGElement
  private circle: SVGCircleElement
  private portsGroup: SVGGElement
  private computedW = SIZE
  private computedH = SIZE

  constructor(
    private startState: StartState,
    store: DiagramStore,
    private onPortMousedown: (s: StartState, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('sd-start-state')
    this.el.dataset.id = startState.id
    this.el.dataset.elementType = 'start-state'

    this.circle = svgEl('circle')
    this.circle.classList.add('sd-start-circle')

    this.portsGroup = svgEl('g')

    this.el.append(this.circle, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.startState, side, e))
    this.update(startState)

    store.on(ev => {
      if (ev.type === 'startstate:update' && (ev.payload as StartState).id === startState.id) {
        this.startState = ev.payload as StartState
        this.update(this.startState)
      }
    })
  }

  update(s: StartState) {
    const { position: { x, y }, size: { w, h } } = s
    this.computedW = Math.max(w, SIZE)
    this.computedH = Math.max(h, SIZE)
    const r = Math.min(this.computedW, this.computedH) / 2

    this.el.setAttribute('transform', `translate(${x},${y})`)
    this.circle.setAttribute('cx', String(this.computedW / 2))
    this.circle.setAttribute('cy', String(this.computedH / 2))
    this.circle.setAttribute('r',  String(r))

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }
  getContentMinSize() { return { w: SIZE, h: SIZE } }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
}
