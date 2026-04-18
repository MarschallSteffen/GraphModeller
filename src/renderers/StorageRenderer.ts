import type { Storage } from '../entities/Storage.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, renderShadow, estimateTextWidth } from './svgUtils.ts'

const MIN_H = 40

export class StorageRenderer {
  readonly el: SVGGElement
  private shadowGroup: SVGGElement
  private bg: SVGRectElement
  private nameText: SVGTextElement
  private portsGroup: SVGGElement
  private computedW = 80
  private computedH = MIN_H
  private readonly _unsub: () => void

  constructor(
    private storage: Storage,
    store: DiagramStore,
    private onPortMousedown: (storage: Storage, port: string, e: MouseEvent) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('uml-storage')
    this.el.dataset.id = storage.id
    this.el.dataset.elementType = 'storage'

    this.shadowGroup = svgEl('g')
    this.shadowGroup.classList.add('storage-shadow')

    this.bg = svgEl('rect')
    this.bg.classList.add('storage-bg')
    this.nameText = svgEl('text')
    this.nameText.classList.add('storage-name')
    this.portsGroup = svgEl('g')

    this.el.append(this.shadowGroup, this.bg, this.nameText, this.portsGroup)

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.storage, side, e))
    this.update(storage)

    this._unsub = store.on(ev => {
      if (ev.type === 'storage:update' && (ev.payload as Storage).id === storage.id) {
        this.storage = ev.payload as Storage
        this.update(this.storage)
      }
    })
  }

  update(storage: Storage) {
    const { position: { x, y }, size: { w, h }, multiInstance } = storage
    this.computedH = Math.max(h, MIN_H)
    const rx = this.computedH / 2
    const minW = Math.max(80, estimateTextWidth(storage.name) + rx * 2)
    this.computedW = Math.max(w, minW)

    this.el.setAttribute('transform', `translate(${x},${y})`)

    renderShadow(this.shadowGroup, multiInstance, 'storage-shadow-shape', this.computedW, this.computedH, rx)

    this.bg.setAttribute('width', String(this.computedW))
    this.bg.setAttribute('height', String(this.computedH))
    this.bg.setAttribute('rx', String(rx))
    this.bg.setAttribute('ry', String(rx))
    this.bg.style.fill = storage.accentColor ? `var(${storage.accentColor})` : ''
    this.el.classList.toggle('has-accent', !!storage.accentColor)

    this.nameText.textContent = storage.name
    this.nameText.setAttribute('x', String(this.computedW / 2))
    this.nameText.setAttribute('y', String(this.computedH / 2))

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    const rx = MIN_H / 2
    const minW = Math.max(80, estimateTextWidth(this.storage.name) + rx * 2)
    return { w: minW, h: MIN_H }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
  destroy() { this._unsub(); this.el.remove() }
}
