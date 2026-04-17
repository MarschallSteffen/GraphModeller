/**
 * Snap engine for element dragging.
 *
 * Three snap behaviours:
 * 1. Edge alignment — snap the dragged element's left/right/top/bottom edge to
 *    any other element's matching or opposing edge within SNAP_THRESHOLD px.
 * 2. Center alignment — snap the dragged element's center X or Y to any other
 *    element's center X or Y within SNAP_THRESHOLD px.
 * 3. Gap snapping — snap so the gap between the dragged element and an adjacent
 *    element is exactly a SNAP_GAP value (40 or 80 px).
 *    Proximity check: elements must overlap (or be close) on the perpendicular axis.
 *
 * All behaviours are evaluated independently on each axis. The best snap
 * (smallest error) wins, considering all close neighbours simultaneously.
 *
 * Returns adjusted (x, y) for the dragged element's top-left, plus guide lines.
 */

export const SNAP_THRESHOLD = 8   // px — proximity to trigger snap
export const SNAP_GAPS      = [40, 80]  // px — preferred gaps between adjacent elements
export const SNAP_RANGE     = 500 // px — max distance between element edges to consider as snap candidate

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

  for (const o of others) {
    // Skip candidates whose nearest bounding-box edge is beyond SNAP_RANGE.
    // nearX/nearY are the closest edge-to-edge distances on each axis (0 if overlapping).
    const nearX = Math.max(0, Math.max(o.x - (dragged.x + dragged.w), dragged.x - (o.x + o.w)))
    const nearY = Math.max(0, Math.max(o.y - (dragged.y + dragged.h), dragged.y - (o.y + o.h)))
    if (Math.sqrt(nearX * nearX + nearY * nearY) > SNAP_RANGE) continue

    const ocx = o.x + o.w / 2
    const ocy = o.y + o.h / 2

    // ── 1a. Edge alignment — horizontal (X axis) ───────────────────────────
    // left-to-left, right-to-right, left-to-right, right-to-left
    const xCandidates: number[] = [
      o.x               - dragged.x,          // align left edges
      o.x + o.w         - (dragged.x + dragged.w),  // align right edges
      o.x + o.w         - dragged.x,          // dragged.left snaps to o.right
      o.x               - (dragged.x + dragged.w),  // dragged.right snaps to o.left
    ]
    for (const delta of xCandidates) {
      const dist = Math.abs(delta)
      if (dist < SNAP_THRESHOLD && dist < bestDx) { bestDx = dist; snapDx = delta }
    }

    // ── 1b. Edge alignment — vertical (Y axis) ────────────────────────────
    const yCandidates: number[] = [
      o.y               - dragged.y,
      o.y + o.h         - (dragged.y + dragged.h),
      o.y + o.h         - dragged.y,
      o.y               - (dragged.y + dragged.h),
    ]
    for (const delta of yCandidates) {
      const dist = Math.abs(delta)
      if (dist < SNAP_THRESHOLD && dist < bestDy) { bestDy = dist; snapDy = delta }
    }

    // ── 2. Center-to-center alignment ──────────────────────────────────────
    const distCx = Math.abs(cx - ocx)
    const distCy = Math.abs(cy - ocy)
    if (distCx < SNAP_THRESHOLD && distCx < bestDx) { bestDx = distCx; snapDx = ocx - cx }
    if (distCy < SNAP_THRESHOLD && distCy < bestDy) { bestDy = distCy; snapDy = ocy - cy }
  }

  // ── 3. Gap snapping — vertical axis ────────────────────────────────────────
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

  // ── 4. Gap snapping — horizontal axis ──────────────────────────────────────
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

  // ── 5. Build guide lines ───────────────────────────────────────────────────
  const guides: GuideLine[] = []

  for (const o of others) {
    const nearX = Math.max(0, Math.max(o.x - (snappedX + dragged.w), snappedX - (o.x + o.w)))
    const nearY = Math.max(0, Math.max(o.y - (snappedY + dragged.h), snappedY - (o.y + o.h)))
    if (Math.sqrt(nearX * nearX + nearY * nearY) > SNAP_RANGE) continue

    const ocx = o.x + o.w / 2
    const ocy = o.y + o.h / 2

    // Vertical guides: shared edge X or center X
    const vAlignValues: Array<[number, number]> = [
      [snappedX,               o.x],               // left-left
      [snappedX + dragged.w,   o.x + o.w],          // right-right
      [snappedX,               o.x + o.w],          // left-right
      [snappedX + dragged.w,   o.x],                // right-left
      [snappedCx,              ocx],                // center-center
    ]
    for (const [a, b] of vAlignValues) {
      if (Math.abs(a - b) < 0.5) {
        const minY = Math.min(snappedY, o.y)
        const maxY = Math.max(snappedY + dragged.h, o.y + o.h)
        guides.push({ axis: 'v', value: a, from: minY - 20, to: maxY + 20 })
      }
    }

    // Horizontal guides: shared edge Y or center Y
    const hAlignValues: Array<[number, number]> = [
      [snappedY,               o.y],               // top-top
      [snappedY + dragged.h,   o.y + o.h],          // bottom-bottom
      [snappedY,               o.y + o.h],          // top-bottom
      [snappedY + dragged.h,   o.y],                // bottom-top
      [snappedCy,              ocy],                // center-center
    ]
    for (const [a, b] of hAlignValues) {
      if (Math.abs(a - b) < 0.5) {
        const minX = Math.min(snappedX, o.x)
        const maxX = Math.max(snappedX + dragged.w, o.x + o.w)
        guides.push({ axis: 'h', value: a, from: minX - 20, to: maxX + 20 })
      }
    }

    // Midpoint guides for gap snaps
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

