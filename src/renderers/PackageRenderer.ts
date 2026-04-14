import type { UmlPackage } from '../entities/Package.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, estimateTextWidth } from './svgUtils.ts'

const TAB_H = 20
const TAB_W = 80
const MIN_W = 120
const MIN_H = 60

export class PackageRenderer {
  readonly el: SVGGElement
  private tab: SVGRectElement
  private bg: SVGRectElement
  private nameText: SVGTextElement
  private portsGroup: SVGGElement
  private computedW = MIN_W
  private computedH = MIN_H

  constructor(
    private pkg: UmlPackage,
    _store: DiagramStore,
    private onPortMousedown: (pkg: UmlPackage, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('uml-package')
    this.el.dataset.id = pkg.id
    this.el.dataset.elementType = 'uml-package'

    this.tab = svgEl('rect')
    this.tab.classList.add('pkg-tab')
    this.bg = svgEl('rect')
    this.bg.classList.add('pkg-bg')
    this.nameText = svgEl('text')
    this.nameText.classList.add('pkg-name')
    this.portsGroup = svgEl('g')

    this.el.append(this.tab, this.bg, this.nameText, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.pkg, side, e))
    this.update(pkg)

    _store.on(ev => {
      if (ev.type === 'package:update' && (ev.payload as UmlPackage).id === pkg.id) {
        this.pkg = ev.payload as UmlPackage
        this.update(this.pkg)
      }
    })
  }

  update(pkg: UmlPackage) {
    const { position: { x, y }, size: { w, h } } = pkg
    const minW = Math.max(MIN_W, estimateTextWidth(pkg.name) + TAB_W)
    this.computedW = Math.max(w, minW)
    this.computedH = Math.max(h, MIN_H)

    this.el.setAttribute('transform', `translate(${x},${y})`)

    this.tab.setAttribute('x', '0')
    this.tab.setAttribute('y', String(-TAB_H))
    this.tab.setAttribute('width', String(TAB_W))
    this.tab.setAttribute('height', String(TAB_H))
    this.tab.setAttribute('rx', '4')

    this.bg.setAttribute('width', String(this.computedW))
    this.bg.setAttribute('height', String(this.computedH))
    this.bg.setAttribute('rx', '4')

    this.nameText.textContent = pkg.name
    this.nameText.setAttribute('x', '8')
    this.nameText.setAttribute('y', String(-TAB_H / 2))

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    return { w: Math.max(MIN_W, estimateTextWidth(this.pkg.name) + TAB_W), h: MIN_H }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
}
