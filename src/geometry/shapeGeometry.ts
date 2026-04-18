import { getElementConfig } from '../config/registry.ts'
import type { ElementKind } from '../types.ts'

export function elementShape(kind: ElementKind): string {
  return getElementConfig(kind)?.shape ?? 'rect'
}

// ─── Shape-aware border point helpers (mirrors CommentRenderer) ───────────────

export function borderPointRect(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const cx = rx + rw / 2, cy = ry + rh / 2
  const dx = px - cx, dy = py - cy
  if (dx === 0 && dy === 0) return { x: cx, y: ry }
  const scaleX = rw / 2 / Math.abs(dx || 1e-9)
  const scaleY = rh / 2 / Math.abs(dy || 1e-9)
  return { x: cx + dx * Math.min(scaleX, scaleY), y: cy + dy * Math.min(scaleX, scaleY) }
}

export function borderPointPill(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const r = rh / 2
  const cy = ry + r
  const capCX = Math.max(rx + r, Math.min(px, rx + rw - r))
  const dx = px - capCX, dy = py - cy
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: capCX, y: ry }
  return { x: capCX + (dx / len) * r, y: cy + (dy / len) * r }
}

export function borderPointEllipse(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const cx = rx + rw / 2, cy = ry + rh / 2
  const dx = px - cx, dy = py - cy
  if (dx === 0 && dy === 0) return { x: cx, y: ry }
  const len = Math.hypot(dx / (rw / 2), dy / (rh / 2))
  return { x: cx + dx / len, y: cy + dy / len }
}

export function borderPointCircle(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const cx = rx + rw / 2, cy = ry + rh / 2
  const r = Math.min(rw, rh) / 2
  const dx = px - cx, dy = py - cy
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: cx, y: cy - r }
  return { x: cx + (dx / len) * r, y: cy + (dy / len) * r }
}

export function borderPointForShape(shape: string, rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  if (shape === 'pill')    return borderPointPill(rx, ry, rw, rh, px, py)
  if (shape === 'ellipse') return borderPointEllipse(rx, ry, rw, rh, px, py)
  if (shape === 'circle')  return borderPointCircle(rx, ry, rw, rh, px, py)
  return borderPointRect(rx, ry, rw, rh, px, py)
}

/**
 * True border-to-border distance between annotation rect and a shaped element.
 * Finds nearest point on each shape's border toward the other's center, then
 * measures distance between those two surface points (negative = overlapping).
 */
export function shapedBorderDist(
  annX: number, annY: number, annW: number, annH: number,
  elX: number,  elY: number,  elW: number,  elH: number, shape: string,
): number {
  const annCX = annX + annW / 2, annCY = annY + annH / 2
  const elCX  = elX  + elW  / 2, elCY  = elY  + elH  / 2
  // Nearest point on annotation rect border toward element center
  const p1 = borderPointRect(annX, annY, annW, annH, elCX, elCY)
  // Nearest point on element's shaped border toward annotation center
  const p2 = borderPointForShape(shape, elX, elY, elW, elH, annCX, annCY)
  // Signed distance: negative means the two borders overlap / annotation is inside
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy)
  // Determine sign: positive if borders have a gap, negative if annotation center
  // is inside the element (i.e. p1 and p2 are on opposite sides of each other)
  const dot = dx * (elCX - annCX) + dy * (elCY - annCY)
  return dot >= 0 ? dist : -dist
}
