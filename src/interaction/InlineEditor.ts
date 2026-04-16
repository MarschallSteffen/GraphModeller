import { svgEl } from '../renderers/svgUtils.ts'

export class InlineEditor {
  private active: {
    foreignObject: SVGForeignObjectElement
    input: HTMLInputElement
    onCommit: (value: string) => void
    outsideListener: (e: MouseEvent) => void
  } | null = null

  /**
   * Replace `textEl` with an editable input. Commits on Enter/blur/click-outside, cancels on Escape.
   */
  edit(
    textEl: SVGTextElement,
    initialValue: string,
    onCommit: (value: string) => void,
  ) {
    this.cancel()

    // If text is empty, temporarily set placeholder so getBBox returns a valid position
    const wasEmpty = !textEl.textContent?.trim()
    if (wasEmpty) textEl.textContent = '\u200B'  // zero-width space
    const bbox = textEl.getBBox()
    if (wasEmpty) textEl.textContent = ''

    const fo = svgEl('foreignObject')
    fo.setAttribute('x', String(bbox.x - 4))
    fo.setAttribute('y', String(bbox.y - 2))
    fo.setAttribute('width', String(Math.max(bbox.width + 16, 120)))
    fo.setAttribute('height', String(Math.max(bbox.height + 8, 24)))

    const input = document.createElement('input')
    input.type = 'text'
    input.value = initialValue
    input.classList.add('inline-input')

    fo.appendChild(input)
    textEl.parentElement?.appendChild(fo)
    textEl.style.display = 'none'

    const commit = () => {
      if (!this.active) return
      const val = input.value.trim()
      this.cleanup(textEl, fo)
      onCommit(val)
    }

    const cancel = () => this.cleanup(textEl, fo)

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit() }
      if (e.key === 'Escape') { e.preventDefault(); cancel() }
    })
    input.addEventListener('blur', commit)

    // Click outside the input → commit (SVG clicks don't always steal focus from the input)
    const outsideListener = (e: MouseEvent) => {
      if (e.target !== input) commit()
    }
    setTimeout(() => document.addEventListener('mousedown', outsideListener), 50)

    this.active = { foreignObject: fo, input, onCommit, outsideListener }

    requestAnimationFrame(() => {
      input.focus()
      input.select()
    })
  }

  cancel() {
    if (!this.active) return
    const { foreignObject } = this.active
    const textEl = foreignObject.parentElement?.querySelector<SVGTextElement>('text[style*="none"]')
    if (textEl) this.cleanup(textEl, foreignObject)
    this.active = null
  }

  private cleanup(textEl: SVGTextElement, fo: SVGForeignObjectElement) {
    if (this.active?.outsideListener) {
      document.removeEventListener('mousedown', this.active.outsideListener)
    }
    textEl.style.display = ''
    fo.remove()
    this.active = null
  }
}
