import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, estimateTextWidth } from './svgUtils.ts'

const TAB_H   = 20
const TAB_PAD = 8
const MIN_W   = 120
const MIN_H   = 60

/** Common "named box with tab" renderer used for packages, UC system boundaries, and combined fragments. */
export interface PackageLikeEntity {
  id: string
  name: string
  position: { x: number; y: number }
  size: { w: number; h: number }
  accentColor?: string
}

export class PackageRenderer {
  readonly el: SVGGElement
  private tab: SVGRectElement
  private bg: SVGRectElement
  private nameText: SVGTextElement
  private portsGroup: SVGGElement
  private computedW = MIN_W
  private computedH = MIN_H
  private entity: PackageLikeEntity
  private readonly _unsub: () => void

  constructor(
    entity: PackageLikeEntity,
    store: DiagramStore,
    private onPortMousedown: (entity: PackageLikeEntity, port: string, e: MouseEvent) => void,
    /** Store event type to listen for (e.g. 'package:update', 'uc-system:update') */
    eventType: string,
    /** SVG data-elementType attribute */
    elementType: string = 'uml-package',
    /** Optional extra CSS class on the background rect (e.g. for dashed borders) */
    bgExtraClass?: string,
  ) {
    this.entity = entity
    this.el = svgEl('g')
    this.el.classList.add('uml-package')
    this.el.dataset.id = entity.id
    this.el.dataset.elementType = elementType

    this.tab = svgEl('rect')
    this.tab.classList.add('pkg-tab')
    this.bg = svgEl('rect')
    this.bg.classList.add('pkg-bg')
    if (bgExtraClass) this.bg.classList.add(bgExtraClass)
    this.nameText = svgEl('text')
    this.nameText.classList.add('pkg-name')
    this.portsGroup = svgEl('g')

    this.el.append(this.tab, this.bg, this.nameText, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.entity, side, e))
    this.update(entity)

    requestAnimationFrame(() => this.update(this.entity))

    this._unsub = store.on(ev => {
      if (ev.type === eventType && (ev.payload as { id: string }).id === entity.id) {
        this.entity = ev.payload as PackageLikeEntity
        this.update(this.entity)
      }
    })
  }

  update(entity: PackageLikeEntity) {
    this.entity = entity
    const { position: { x, y }, size: { w, h } } = entity
    this.computedW = Math.max(w, MIN_W)
    this.computedH = Math.max(h, MIN_H)

    this.el.setAttribute('transform', `translate(${x},${y})`)

    this.nameText.textContent = entity.name
    this.nameText.setAttribute('x', String(TAB_PAD))
    this.nameText.setAttribute('y', String(-TAB_H / 2))

    const measured = this.nameText.getComputedTextLength()
    const tabW = Math.ceil(measured > 0 ? measured : estimateTextWidth(entity.name)) + TAB_PAD * 2

    this.tab.setAttribute('x', '0')
    this.tab.setAttribute('y', String(-TAB_H))
    this.tab.setAttribute('width', String(tabW))
    this.tab.setAttribute('height', String(TAB_H))
    this.tab.setAttribute('rx', '4')

    this.bg.setAttribute('width', String(this.computedW))
    this.bg.setAttribute('height', String(this.computedH))
    this.bg.setAttribute('rx', '4')
    const accentFill = entity.accentColor ? `var(${entity.accentColor})` : ''
    this.tab.style.fill = accentFill
    this.bg.style.fill  = accentFill
    this.el.classList.toggle('has-accent', !!entity.accentColor)

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }
  getContentMinSize() { return { w: MIN_W, h: MIN_H } }
  setSelected(selected: boolean) { this.el.classList.toggle('selected', selected) }
  destroy() { this._unsub(); this.el.remove() }
}
