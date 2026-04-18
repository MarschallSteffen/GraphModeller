import type { UseCase } from '../entities/UseCase.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, estimateTextWidth } from './svgUtils.ts'

const MIN_W = 140
const MIN_H = 60

export class UseCaseRenderer {
  readonly el: SVGGElement
  private bg: SVGEllipseElement
  private nameText: SVGTextElement
  private portsGroup: SVGGElement
  private computedW = MIN_W
  private computedH = MIN_H
  private readonly _unsub: () => void

  constructor(
    private useCase: UseCase,
    store: DiagramStore,
    private onPortMousedown: (useCase: UseCase, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('uml-usecase')
    this.el.dataset.id = useCase.id
    this.el.dataset.elementType = 'use-case'

    this.bg = svgEl('ellipse')
    this.bg.classList.add('usecase-bg')

    this.nameText = svgEl('text')
    this.nameText.classList.add('usecase-name')
    this.nameText.setAttribute('text-anchor', 'middle')
    this.nameText.setAttribute('dominant-baseline', 'central')

    this.portsGroup = svgEl('g')

    this.el.append(this.bg, this.nameText, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.useCase, side, e))
    this.update(useCase)

    this._unsub = store.on(ev => {
      if (ev.type === 'use-case:update' && (ev.payload as UseCase).id === useCase.id) {
        this.useCase = ev.payload as UseCase
        this.update(this.useCase)
      }
    })
  }

  update(useCase: UseCase) {
    const { position: { x, y }, size: { w, h } } = useCase
    const minW = Math.max(MIN_W, estimateTextWidth(useCase.name) + 32)
    this.computedW = Math.max(w, minW)
    this.computedH = Math.max(h, MIN_H)

    this.el.setAttribute('transform', `translate(${x},${y})`)

    const rx = this.computedW / 2
    const ry = this.computedH / 2
    this.bg.setAttribute('cx', String(rx))
    this.bg.setAttribute('cy', String(ry))
    this.bg.setAttribute('rx', String(rx))
    this.bg.setAttribute('ry', String(ry))
    this.bg.style.fill = useCase.accentColor ? `var(${useCase.accentColor})` : ''
    this.el.classList.toggle('has-accent', !!useCase.accentColor)

    this.nameText.textContent = useCase.name
    this.nameText.setAttribute('x', String(rx))
    this.nameText.setAttribute('y', String(ry))

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    const minW = Math.max(MIN_W, estimateTextWidth(this.useCase.name) + 32)
    return { w: minW, h: MIN_H }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
  destroy() { this._unsub(); this.el.remove() }
}
