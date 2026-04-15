/**
 * Snap engine for element dragging.
 *
 * Two snap behaviours:
 * 1. Center alignment — snap the dragged element's center X or Y to any other
 *    element's center X or Y within SNAP_THRESHOLD px.
 * 2. Gap snapping — snap so the gap between the dragged element and an adjacent
 *    element is exactly SNAP_GAP px (80 px), in both vertical and horizontal axes.
 *    Proximity check: elements must overlap (or be close) on the perpendicular axis.
 *
 * Both axes are evaluated independently. The best snap (smallest error) wins on
 * each axis, considering all close neighbours simultaneously.
 *
 * Returns adjusted (x, y) for the dragged element's top-left, plus guide lines.
 */

export const SNAP_THRESHOLD = 8   // px — proximity to trigger snap
export const SNAP_GAPS      = [40, 80]  // px — preferred gaps between adjacent elements

export interface SnapRect { x: number; y: number; w: number; h: number }

export interface GuideLine {
  /** 'h' = horizontal line (constant y), 'v' = vertical line (constant x) */
  axis: 'h' | 'v'
  value: number
  from: number
  to: number
}

export interface SnapResult {
  x: number
  y: number
  guides: GuideLine[]
}

export function applySnap(
  dragged: SnapRect,
  others: SnapRect[],
): SnapResult {
  const cx = dragged.x + dragged.w / 2
  const cy = dragged.y + dragged.h / 2

  let snapDx = 0
  let snapDy = 0
  let bestDx = SNAP_THRESHOLD + 1
  let bestDy = SNAP_THRESHOLD + 1

  // ── 1. Center-to-center alignment ──────────────────────────────────────────
  for (const o of others) {
    const ocx = o.x + o.w / 2
    const ocy = o.y + o.h / 2

    const distX = Math.abs(cx - ocx)
    const distY = Math.abs(cy - ocy)

    if (distX < SNAP_THRESHOLD && distX < bestDx) { bestDx = distX; snapDx = ocx - cx }
    if (distY < SNAP_THRESHOLD && distY < bestDy) { bestDy = distY; snapDy = ocy - cy }
  }

  // ── 2. Gap snapping — vertical axis ────────────────────────────────────────
  // Proximity: elements overlap or are close on the horizontal axis
  for (const o of others) {
    const hOverlap = dragged.x < o.x + o.w + SNAP_THRESHOLD &&
                     o.x < dragged.x + dragged.w + SNAP_THRESHOLD
    if (!hOverlap) continue

    for (const gap of SNAP_GAPS) {
      const targetBelow = o.y + o.h + gap
      const dBelow = Math.abs(dragged.y - targetBelow)
      if (dBelow < SNAP_THRESHOLD && dBelow < bestDy) { bestDy = dBelow; snapDy = targetBelow - dragged.y }

      const targetAbove = o.y - dragged.h - gap
      const dAbove = Math.abs(dragged.y - targetAbove)
      if (dAbove < SNAP_THRESHOLD && dAbove < bestDy) { bestDy = dAbove; snapDy = targetAbove - dragged.y }
    }
  }

  // ── 3. Gap snapping — horizontal axis ──────────────────────────────────────
  // Proximity: elements overlap or are close on the vertical axis
  for (const o of others) {
    const vOverlap = dragged.y < o.y + o.h + SNAP_THRESHOLD &&
                     o.y < dragged.y + dragged.h + SNAP_THRESHOLD
    if (!vOverlap) continue

    for (const gap of SNAP_GAPS) {
      const targetRight = o.x + o.w + gap
      const dRight = Math.abs(dragged.x - targetRight)
      if (dRight < SNAP_THRESHOLD && dRight < bestDx) { bestDx = dRight; snapDx = targetRight - dragged.x }

      const targetLeft = o.x - dragged.w - gap
      const dLeft = Math.abs(dragged.x - targetLeft)
      if (dLeft < SNAP_THRESHOLD && dLeft < bestDx) { bestDx = dLeft; snapDx = targetLeft - dragged.x }
    }
  }

  const snappedX = dragged.x + snapDx
  const snappedY = dragged.y + snapDy
  const snappedCx = snappedX + dragged.w / 2
  const snappedCy = snappedY + dragged.h / 2

  // ── 4. Build guide lines ───────────────────────────────────────────────────
  const guides: GuideLine[] = []

  for (const o of others) {
    const ocx = o.x + o.w / 2
    const ocy = o.y + o.h / 2

    // Vertical guide: shared center X
    if (Math.abs(snappedCx - ocx) < 0.5) {
      const minY = Math.min(snappedY, o.y)
      const maxY = Math.max(snappedY + dragged.h, o.y + o.h)
      guides.push({ axis: 'v', value: ocx, from: minY - 20, to: maxY + 20 })
    }

    // Horizontal guide: shared center Y
    if (Math.abs(snappedCy - ocy) < 0.5) {
      const minX = Math.min(snappedX, o.x)
      const maxX = Math.max(snappedX + dragged.w, o.x + o.w)
      guides.push({ axis: 'h', value: ocy, from: minX - 20, to: maxX + 20 })
    }

    // Horizontal guide: vertical gap snap (dragged below or above)
    for (const gap of SNAP_GAPS) {
      const gapBelow = Math.abs(snappedY - (o.y + o.h + gap))
      const gapAbove = Math.abs(snappedY + dragged.h + gap - o.y)
      if (gapBelow < 0.5) {
        const minX = Math.min(snappedX, o.x)
        const maxX = Math.max(snappedX + dragged.w, o.x + o.w)
        guides.push({ axis: 'h', value: o.y + o.h + gap / 2, from: minX - 20, to: maxX + 20 })
      }
      if (gapAbove < 0.5) {
        const minX = Math.min(snappedX, o.x)
        const maxX = Math.max(snappedX + dragged.w, o.x + o.w)
        guides.push({ axis: 'h', value: snappedY + dragged.h + gap / 2, from: minX - 20, to: maxX + 20 })
      }
    }

    // Vertical guide: horizontal gap snap (dragged right or left)
    for (const gap of SNAP_GAPS) {
      const gapRight = Math.abs(snappedX - (o.x + o.w + gap))
      const gapLeft  = Math.abs(snappedX + dragged.w + gap - o.x)
      if (gapRight < 0.5) {
        const minY = Math.min(snappedY, o.y)
        const maxY = Math.max(snappedY + dragged.h, o.y + o.h)
        guides.push({ axis: 'v', value: o.x + o.w + gap / 2, from: minY - 20, to: maxY + 20 })
      }
      if (gapLeft < 0.5) {
        const minY = Math.min(snappedY, o.y)
        const maxY = Math.max(snappedY + dragged.h, o.y + o.h)
        guides.push({ axis: 'v', value: snappedX + dragged.w + gap / 2, from: minY - 20, to: maxY + 20 })
      }
    }
  }

  return { x: snappedX, y: snappedY, guides }
}
