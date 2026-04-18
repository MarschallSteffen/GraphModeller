import type { UmlClass } from '../entities/UmlClass.ts'
import type { DiagramStore } from '../store/DiagramStore.ts'
import { serializeAttribute } from '../entities/Attribute.ts'
import { serializeMethod } from '../entities/Method.ts'
import { PORT_SIDES, portPosition } from './ports.ts'
import { svgEl, renderPortsInto, updatePortPositions, renderShadow, estimateTextWidth } from './svgUtils.ts'

const HEADER_H = 36
const SECTION_LABEL_H = 18
const ROW_H = 20
const PADDING_X = 10
const MIN_W = 180

export class ClassRenderer {
  readonly el: SVGGElement
  private shadowGroup: SVGGElement
  private header: SVGRectElement
  private body: SVGRectElement
  private border: SVGRectElement
  private stereotypeText: SVGTextElement
  private titleText: SVGTextElement
  private attrDivider: SVGLineElement
  private methodDivider: SVGLineElement
  private attrLabel: SVGTextElement
  private methodLabel: SVGTextElement
  private attrGroup: SVGGElement
  private methodGroup: SVGGElement
  private addAttrBtn: SVGTextElement
  private addMethodBtn: SVGTextElement
  private portsGroup: SVGGElement
  private readonly _unsub: () => void

  private computedW = MIN_W
  private computedH = HEADER_H + SECTION_LABEL_H + 8

  constructor(
    private cls: UmlClass,
    _store: DiagramStore,
    private onPortMousedown: (cls: UmlClass, port: string, e: MouseEvent) => void,
    private onAddAttribute: (cls: UmlClass) => void,
    private onAddMethod: (cls: UmlClass) => void,
  ) {
    this.el = svgEl('g')
    this.el.classList.add('uml-class')
    this.el.dataset.id = cls.id
    this.el.dataset.elementType = 'uml-class'

    this.shadowGroup = svgEl('g')
    this.shadowGroup.classList.add('class-shadow')

    this.header = svgEl('rect'); this.header.classList.add('class-header')
    this.body   = svgEl('rect'); this.body.classList.add('class-body')
    this.border = svgEl('rect'); this.border.classList.add('class-border')

    this.stereotypeText = svgEl('text'); this.stereotypeText.classList.add('class-stereotype')
    this.titleText      = svgEl('text'); this.titleText.classList.add('class-title')

    this.attrDivider   = svgEl('line'); this.attrDivider.classList.add('divider')
    this.methodDivider = svgEl('line'); this.methodDivider.classList.add('divider')

    this.attrLabel   = svgEl('text'); this.attrLabel.classList.add('section-label'); this.attrLabel.textContent = 'attributes'
    this.methodLabel = svgEl('text'); this.methodLabel.classList.add('section-label'); this.methodLabel.textContent = 'methods'

    this.attrGroup   = svgEl('g')
    this.methodGroup = svgEl('g')

    this.addAttrBtn   = svgEl('text'); this.addAttrBtn.classList.add('add-member-btn'); this.addAttrBtn.textContent = '+ attribute'
    this.addMethodBtn = svgEl('text'); this.addMethodBtn.classList.add('add-member-btn'); this.addMethodBtn.textContent = '+ method'

    this.portsGroup = svgEl('g')

    this.el.append(
      this.shadowGroup,
      this.body, this.header, this.border,
      this.stereotypeText, this.titleText,
      this.attrDivider, this.attrLabel, this.attrGroup, this.addAttrBtn,
      this.methodDivider, this.methodLabel, this.methodGroup, this.addMethodBtn,
      this.portsGroup,
    )

    this.addAttrBtn.addEventListener('click', e => { e.stopPropagation(); this.onAddAttribute(this.cls) })
    this.addMethodBtn.addEventListener('click', e => { e.stopPropagation(); this.onAddMethod(this.cls) })

    renderPortsInto(this.portsGroup, PORT_SIDES, (side, e) => this.onPortMousedown(this.cls, side, e))
    this.update(cls)

    this._unsub = _store.on(ev => {
      if (ev.type === 'class:update' && (ev.payload as UmlClass).id === cls.id) {
        this.cls = ev.payload as UmlClass
        this.update(this.cls)
      }
    })
  }

  update(cls: UmlClass) {
    const { position: { x, y }, size: { w } } = cls
    // Width: max of stored user size, MIN_W, and name text estimate
    this.computedW = Math.max(w, MIN_W, estimateTextWidth(cls.name))

    const attrLines   = cls.attributes.map(serializeAttribute)
    const methodLines = cls.methods.map(serializeMethod)

    // Heights
    const attrSectionH   = SECTION_LABEL_H + attrLines.length * ROW_H + ROW_H   // label + rows + add-btn
    const methodSectionH = SECTION_LABEL_H + methodLines.length * ROW_H + ROW_H
    this.computedH = HEADER_H + attrSectionH + methodSectionH

    this.el.setAttribute('transform', `translate(${x},${y})`)

    renderShadow(this.shadowGroup, cls.multiInstance, 'class-shadow-shape', this.computedW, this.computedH, 6)

    // Header
    this.header.setAttribute('width',  String(this.computedW))
    this.header.setAttribute('height', String(HEADER_H))
    this.header.setAttribute('rx', '6')
    this.header.style.fill = cls.accentColor ? `var(${cls.accentColor})` : ''
    this.el.classList.toggle('has-accent', !!cls.accentColor)

    // Body (covers everything below header)
    this.body.setAttribute('y',      String(HEADER_H - 6))
    this.body.setAttribute('width',  String(this.computedW))
    this.body.setAttribute('height', String(this.computedH - HEADER_H + 6))
    this.body.setAttribute('rx', '6')

    // Border
    this.border.setAttribute('width',  String(this.computedW))
    this.border.setAttribute('height', String(this.computedH))
    this.border.setAttribute('rx', '6')

    // Stereotype + title
    const showStereotype = cls.stereotype !== 'class'
    this.stereotypeText.style.display = showStereotype ? '' : 'none'
    if (showStereotype) {
      this.stereotypeText.textContent = `«${cls.stereotype}»`
      this.stereotypeText.setAttribute('x', String(this.computedW / 2))
      this.stereotypeText.setAttribute('y', String(HEADER_H * 0.3))
    }
    this.titleText.textContent = cls.name
    this.titleText.setAttribute('x', String(this.computedW / 2))
    this.titleText.setAttribute('y', String(showStereotype ? HEADER_H * 0.72 : HEADER_H * 0.58))

    // ── Attributes section ──
    const attrY = HEADER_H
    this.renderMemberSection(this.attrDivider, this.attrLabel, this.attrGroup, this.addAttrBtn, attrLines, attrY, 'attribute')

    // ── Methods section ──
    const methodY = HEADER_H + attrSectionH
    this.renderMemberSection(this.methodDivider, this.methodLabel, this.methodGroup, this.addMethodBtn, methodLines, methodY, 'method')

    updatePortPositions(this.portsGroup, this.computedW, this.computedH, portPosition)
  }

  private renderMemberSection(
    divider: SVGLineElement,
    label: SVGTextElement,
    group: SVGGElement,
    addBtn: SVGTextElement,
    lines: string[],
    sectionY: number,
    memberKind: 'attribute' | 'method',
  ) {
    divider.setAttribute('x1', '0'); divider.setAttribute('x2', String(this.computedW))
    divider.setAttribute('y1', String(sectionY)); divider.setAttribute('y2', String(sectionY))

    label.setAttribute('x', String(PADDING_X))
    label.setAttribute('y', String(sectionY + SECTION_LABEL_H * 0.72))

    group.innerHTML = ''
    lines.forEach((line, i) => {
      const t = svgEl('text')
      t.classList.add('member-text')
      t.textContent = line
      t.setAttribute('x', String(PADDING_X))
      t.setAttribute('y', String(sectionY + SECTION_LABEL_H + ROW_H * i + ROW_H * 0.72))
      t.dataset.memberIdx = String(i)
      t.dataset.memberKind = memberKind
      group.appendChild(t)
    })

    addBtn.setAttribute('x', String(PADDING_X))
    addBtn.setAttribute('y', String(sectionY + SECTION_LABEL_H + lines.length * ROW_H + ROW_H * 0.72))
  }

  getRenderedSize() { return { w: this.computedW, h: this.computedH } }

  getContentMinSize() {
    return { w: Math.max(MIN_W, estimateTextWidth(this.cls.name)), h: this.computedH }
  }

  setSelected(selected: boolean) {
    this.el.classList.toggle('selected', selected)
  }
  destroy() { this._unsub(); this.el.remove() }
}
