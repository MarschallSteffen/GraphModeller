import type { State } from '../entities/State.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, estimateTextWidth } from './svgUtils.ts'

const MIN_W = 80
const MIN_H = 36
const RX    = MIN_H / 2   // pill corners

export class StateRenderer {
  readonly el: SVGGElement
  private bg: SVGRectElement
  private nameText: SVGTextElement
  private portsGroup: SVGGElement
  private computedW = MIN_W
  private computedH = MIN_H
  private readonly _unsub: () => void

  constructor(
    private state: State,
    store: DiagramStore,
    private onPortMousedown: (state: State, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('sd-state')
    this.el.dataset.id = state.id
    this.el.dataset.elementType = 'state'

    this.bg = svgEl('rect')
    this.bg.classList.add('sd-state-bg')

    this.nameText = svgEl('text')
    this.nameText.classList.add('sd-state-name')
    this.nameText.setAttribute('text-anchor', 'middle')
    this.nameText.setAttribute('dominant-baseline', 'central')

    this.portsGroup = svgEl('g')

    this.el.append(this.bg, this.nameText, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.state, side, e))
    this.update(state)

    this._unsub = store.on(ev => {
      if (ev.type === 'state:update' && (ev.payload as State).id === state.id) {
        this.state = ev.payload as State
        this.update(this.state)
      }
    })
  }

  update(state: State) {
    const { position: { x, y }, size: { w, h } } = state
    const minW = Math.max(MIN_W, estimateTextWidth(state.name) + RX * 2 + 8)
    this.computedW = Math.max(w, minW)
    this.computedH = Math.max(h, MIN_H)
    const rx = this.computedH / 2

    this.el.setAttribute('transform', `translate(${x},${y})`)

    this.bg.setAttribute('width',  String(this.computedW))
    this.bg.setAttribute('height', String(this.computedH))
    this.bg.setAttribute('rx', String(rx))
    this.bg.setAttribute('ry', String(rx))
    this.bg.style.fill = state.accentColor ? `var(${state.accentColor})` : ''
    this.el.classList.toggle('has-accent', !!state.accentColor)

    this.nameText.textContent = state.name
    this.nameText.setAttribute('x', String(this.computedW / 2))
    this.nameText.setAttribute('y', String(this.computedH / 2))

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    const minW = Math.max(MIN_W, estimateTextWidth(this.state.name) + RX * 2 + 8)
    return { w: minW, h: MIN_H }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
  destroy() { this._unsub(); this.el.remove() }
}
