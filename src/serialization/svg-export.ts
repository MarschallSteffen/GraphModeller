import { svgEl as svgElement } from '../renderers/svgUtils.ts'
import { LATTE, PRINT } from '../themes/catppuccin.ts'

/** Compute export dimensions from the live view-group bounding box. Returns null on empty diagram. */
export function getExportBounds(PADDING = 48): { svgEl: SVGSVGElement; viewGroup: SVGGElement; contentW: number; contentH: number; offsetX: number; offsetY: number } | null {
  const svgEl     = document.querySelector<SVGSVGElement>('#canvas')
  const viewGroup = document.querySelector<SVGGElement>('#view-group')
  if (!svgEl || !viewGroup) return null
  const savedTransform = viewGroup.getAttribute('transform') ?? ''
  viewGroup.setAttribute('transform', '')
  const bbox = viewGroup.getBBox()
  viewGroup.setAttribute('transform', savedTransform)
  if (bbox.width === 0 || bbox.height === 0) return null
  return {
    svgEl,
    viewGroup,
    contentW: Math.ceil(bbox.width  + PADDING * 2),
    contentH: Math.ceil(bbox.height + PADDING * 2),
    offsetX:  bbox.x - PADDING,
    offsetY:  bbox.y - PADDING,
  }
}

/** Clone and prepare the live SVG for export — inlines styles, converts foreignObjects, adds watermark. */
export function prepareSvgForExport(
  svgEl: SVGSVGElement,
  contentW: number,
  contentH: number,
  offsetX: number,
  offsetY: number,
): SVGSVGElement {
  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('width',   String(contentW))
  clonedSvg.setAttribute('height',  String(contentH))
  clonedSvg.setAttribute('viewBox', `${offsetX} ${offsetY} ${contentW} ${contentH}`)
  clonedSvg.querySelectorAll('.rubber-band, .snap-guides').forEach(el => el.remove())

  const FONT_SIZE = 12
  const FONT_FAMILY = 'ui-sans-serif, system-ui, sans-serif'
  const LINE_HEIGHT = FONT_SIZE * 1.4
  const PAD_X = 8
  const PAD_Y = 6

  const measureCtx = document.createElement('canvas').getContext('2d')!
  measureCtx.font = `${FONT_SIZE}px ${FONT_FAMILY}`
  function wrapWords(text: string, maxWidth: number): string[] {
    const words = text.split(' ')
    const result: string[] = []
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (measureCtx.measureText(candidate).width > maxWidth && line) { result.push(line); line = word }
      else line = candidate
    }
    if (line) result.push(line)
    return result
  }

  clonedSvg.querySelectorAll('foreignObject').forEach(fo => {
    const x = parseFloat(fo.getAttribute('x') ?? '0')
    const y = parseFloat(fo.getAttribute('y') ?? '0')
    const foWidth = parseFloat(fo.getAttribute('width') ?? '200')
    const rawText = (fo.textContent ?? '').trim()
    if (!rawText) { fo.remove(); return }
    const maxTextWidth = foWidth - PAD_X * 2

    const paragraphs = rawText.split('\n')
    const allLines: string[] = []
    for (const para of paragraphs) {
      allLines.push(...wrapWords(para || ' ', maxTextWidth))
    }

    const g = svgElement('g')
    const textEl = svgElement('text')
    textEl.setAttribute('font-size', String(FONT_SIZE))
    textEl.setAttribute('font-family', FONT_FAMILY)
    textEl.setAttribute('fill', 'currentColor')
    allLines.forEach((line, i) => {
      const tspan = svgElement('tspan')
      tspan.setAttribute('x', String(x + PAD_X))
      tspan.setAttribute('y', String(y + PAD_Y + FONT_SIZE + i * LINE_HEIGHT))
      tspan.textContent = line
      textEl.appendChild(tspan)
    })
    g.appendChild(textEl)
    fo.replaceWith(g)
  })

  const clonedViewGroup = clonedSvg.querySelector('#view-group') as SVGGElement | null
  if (clonedViewGroup) clonedViewGroup.removeAttribute('transform')

  // Attribution watermark — bottom-right corner, in viewBox coordinate space
  const attrText = svgElement('text')
  attrText.setAttribute('x', String(offsetX + contentW - 8))
  attrText.setAttribute('y', String(offsetY + contentH - 8))
  attrText.setAttribute('text-anchor', 'end')
  attrText.setAttribute('font-size', '10')
  attrText.setAttribute('font-family', FONT_FAMILY)
  attrText.setAttribute('fill', '#4c4f69')
  attrText.setAttribute('opacity', '0.45')
  attrText.textContent = 'marschallsteffen.github.io/Archetype'
  clonedSvg.appendChild(attrText)

  const styleEl = svgElement('style')
  styleEl.textContent = collectStyles()
  clonedSvg.prepend(styleEl)

  return clonedSvg
}

/** Collect all CSS rules and inject theme variables for consistent PNG output.
 *  Uses the Print palette when the Print theme is active, otherwise Latte. */
export function collectStyles(): string {
  const parts: string[] = []

  const activeFlavour = document.documentElement.getAttribute('data-theme')
  const exportPalette = activeFlavour === 'print' ? PRINT : LATTE
  const themeVars = Object.entries(exportPalette)
    .map(([key, value]) => `  --ctp-${key}: ${value};`)
    .join('\n')
  parts.push(`:root {\n${themeVars}\n}`)

  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        parts.push(rule.cssText)
      }
    } catch { /* Cross-origin stylesheets — skip */ }
  }

  return parts.join('\n')
}
