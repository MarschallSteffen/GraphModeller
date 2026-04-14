/** The four cardinal port sides */
export const PORT_SIDES = ['n', 'e', 's', 'w'] as const

/**
 * Return the local (element-relative) SVG coordinates of a port given
 * the element's width and height.
 * `frac` is the position along the edge: 0 = start, 0.5 = center (default), 1 = end.
 * For n/s edges: frac moves along X. For e/w edges: frac moves along Y.
 */
export function portPosition(side: string, w: number, h: number, frac = 0.5): { x: number; y: number } {
  switch (side) {
    case 'n': return { x: w * frac, y: 0 }
    case 'e': return { x: w, y: h * frac }
    case 's': return { x: w * frac, y: h }
    case 'w': return { x: 0, y: h * frac }
    default:  return { x: w / 2, y: h / 2 }
  }
}

/**
 * Return the absolute SVG coordinates of an element's port.
 * `frac` is the fractional position along the edge (default 0.5 = center).
 */
export function absolutePortPosition(
  elX: number, elY: number, w: number, h: number, side: string, frac = 0.5,
): { x: number; y: number } {
  const rel = portPosition(side, w, h, frac)
  return { x: elX + rel.x, y: elY + rel.y }
}
