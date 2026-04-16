/** Wraps SVG path/shape markup in a 16×16 icon `<svg>` element string. */
export function svgIcon(inner: string): string {
  return `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}
