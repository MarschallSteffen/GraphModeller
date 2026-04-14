import type { Actor } from '../entities/Actor.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, renderShadow, estimateTextWidth } from './svgUtils.ts'

export class ActorRenderer {
  readonly el: SVGGElement
  private shadowGroup: SVGGElement
  private mainGroup: SVGGElement
  private nameText: SVGTextElement
  private portsGroup: SVGGElement
  private computedW = 80
  private computedH = 60

  constructor(
    private actor: Actor,
    store: DiagramStore,
    private onPortMousedown: (actor: Actor, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('uml-actor')
    this.el.dataset.id = actor.id
    this.el.dataset.elementType = actor.elementType

    this.shadowGroup = svgEl('g')
    this.shadowGroup.classList.add('actor-shadow')

    this.mainGroup = svgEl('g')

    this.nameText = svgEl('text')
    this.nameText.classList.add('actor-name')

    this.portsGroup = svgEl('g')

    this.el.append(this.shadowGroup, this.mainGroup, this.nameText, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.actor, side, e))
    this.update(actor)

    store.on(ev => {
      if (ev.type === 'actor:update' && (ev.payload as Actor).id === actor.id) {
        this.actor = ev.payload as Actor
        this.update(this.actor)
      }
    })
  }

  update(actor: Actor) {
    const { position: { x, y }, size: { w, h }, elementType, multiInstance } = actor
    const minW = Math.max(80, estimateTextWidth(actor.name) + 16)
    const minH = elementType === 'human-agent' ? 80 : 40
    this.computedW = Math.max(w, minW)
    this.computedH = Math.max(h, minH)

    this.el.setAttribute('transform', `translate(${x},${y})`)

    // Shadow: actor shape has no rx for human-agent, rx=4 for agent
    const shadowRx = elementType === 'agent' ? 4 : 0
    renderShadow(this.shadowGroup, multiInstance, 'actor-shadow-shape', this.computedW, this.computedH, shadowRx)

    this.mainGroup.innerHTML = ''
    const shape = this.buildShape(elementType, this.computedW, this.computedH)
    this.mainGroup.appendChild(shape)

    if (elementType === 'human-agent') {
      const figure = this.buildStickFigure(this.computedW, this.computedH)
      this.mainGroup.appendChild(figure)
      this.nameText.setAttribute('x', String(this.computedW / 2))
      this.nameText.setAttribute('y', String(this.computedH - 6))
    } else {
      this.nameText.setAttribute('x', String(this.computedW / 2))
      this.nameText.setAttribute('y', String(this.computedH / 2 + 5))
    }

    this.nameText.textContent = actor.name
    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  private buildShape(elementType: string, w: number, h: number): SVGElement {
    const rect = svgEl('rect')
    rect.classList.add('actor-bg')
    rect.setAttribute('width', String(w))
    rect.setAttribute('height', String(h))
    if (elementType === 'agent') {
      rect.setAttribute('rx', '4')
      rect.setAttribute('ry', '4')
    }
    return rect
  }

  private buildStickFigure(w: number, h: number): SVGGElement {
    const g = svgEl('g')
    // Figure occupies top 70% of the box, leaving room for name at bottom
    const figureH = h * 0.70
    const cx = w / 2
    const headR = Math.min(figureH * 0.18, 12)
    const headCy = headR + 4
    const shoulderY = headCy + headR + 2
    const hipY = shoulderY + figureH * 0.25
    const footY = hipY + figureH * 0.30
    const armSpan = w * 0.28

    const head = svgEl('circle')
    head.classList.add('actor-figure')
    head.setAttribute('cx', String(cx))
    head.setAttribute('cy', String(headCy))
    head.setAttribute('r', String(headR))
    g.appendChild(head)

    const body = svgEl('line')
    body.classList.add('actor-figure')
    body.setAttribute('x1', String(cx)); body.setAttribute('y1', String(shoulderY))
    body.setAttribute('x2', String(cx)); body.setAttribute('y2', String(hipY))
    g.appendChild(body)

    const arms = svgEl('line')
    arms.classList.add('actor-figure')
    arms.setAttribute('x1', String(cx - armSpan)); arms.setAttribute('y1', String(shoulderY + 4))
    arms.setAttribute('x2', String(cx + armSpan)); arms.setAttribute('y2', String(shoulderY + 4))
    g.appendChild(arms)

    const legL = svgEl('line')
    legL.classList.add('actor-figure')
    legL.setAttribute('x1', String(cx)); legL.setAttribute('y1', String(hipY))
    legL.setAttribute('x2', String(cx - armSpan * 0.7)); legL.setAttribute('y2', String(footY))
    g.appendChild(legL)

    const legR = svgEl('line')
    legR.classList.add('actor-figure')
    legR.setAttribute('x1', String(cx)); legR.setAttribute('y1', String(hipY))
    legR.setAttribute('x2', String(cx + armSpan * 0.7)); legR.setAttribute('y2', String(footY))
    g.appendChild(legR)

    return g
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    const minW = Math.max(80, estimateTextWidth(this.actor.name) + 16)
    const minH = this.actor.elementType === 'human-agent' ? 80 : 40
    return { w: minW, h: minH }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
}
