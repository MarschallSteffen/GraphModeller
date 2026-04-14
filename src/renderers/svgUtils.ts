/**
 * Shared SVG renderer utilities.
 *
 * Centralising these removes ~60 lines of copy-pasted code across all five
 * element renderers (Class, Package, Storage, Actor, Queue).
 */

export const SVG_NS = 'http://www.w3.org/2000/svg'
export const PORT_R = 5
export const SHADOW_OFFSET = 6

/**
 * Estimate the pixel width of a text string at the given font size.
 * Uses an average character-width ratio (0.62) rather than DOM measurement.
 * Accurate to ±15% for typical Latin text at 12–14px.
 */
export function estimateTextWidth(text: string, fontSize = 13): number {
  return Math.ceil(text.length * fontSize * 0.62) + 24
}

/** Create an SVG element in the SVG namespace */
export function svgEl<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag)
}

/**
 * Populate a `<g class="ports-group">` with one port circle per side.
 * Each circle gets `dataset.port = side` and fires the given callback on mousedown.
 */
export function renderPortsInto(
  group: SVGGElement,
  sides: readonly string[],
  onPortMousedown: (side: string, e: MouseEvent) => void,
): void {
  sides.forEach(side => {
    const circle = svgEl('circle')
    circle.classList.add('port')
    circle.setAttribute('r', String(PORT_R))
    circle.dataset.port = side
    circle.addEventListener('mousedown', e => {
      e.stopPropagation()
      onPortMousedown(side, e)
    })
    group.appendChild(circle)
  })
}

/**
 * Reposition all port circles within a group to match the element's
 * current width/height, using the `portPosition` function.
 */
export function updatePortPositions(
  group: SVGGElement,
  w: number,
  h: number,
  portPositionFn: (side: string, w: number, h: number) => { x: number; y: number },
): void {
  group.querySelectorAll<SVGCircleElement>('.port').forEach(circle => {
    const side = circle.dataset.port!
    const { x, y } = portPositionFn(side, w, h)
    circle.setAttribute('cx', String(x))
    circle.setAttribute('cy', String(y))
  })
}

/**
 * Re-render the multi-instance shadow rect into the given group.
 * Clears the group, then appends a shadow rect if `visible` is true.
 *
 * @param group        The `<g class="*-shadow">` group to populate
 * @param visible      Whether multiInstance is active
 * @param shadowClass  CSS class applied to the shadow rect (e.g. `'storage-shadow-shape'`)
 * @param w            Width of the shape
 * @param h            Height of the shape
 * @param rx           Border-radius x (default 0)
 */
export function renderShadow(
  group: SVGGElement,
  visible: boolean,
  shadowClass: string,
  w: number,
  h: number,
  rx = 0,
): void {
  group.innerHTML = ''
  if (!visible) return
  const shadow = svgEl('rect')
  shadow.classList.add(shadowClass)
  shadow.setAttribute('width', String(w))
  shadow.setAttribute('height', String(h))
  shadow.setAttribute('rx', String(rx))
  shadow.setAttribute('transform', `translate(${SHADOW_OFFSET},${SHADOW_OFFSET})`)
  group.appendChild(shadow)
}
