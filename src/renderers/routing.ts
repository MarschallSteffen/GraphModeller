/**
 * Connection routing utilities.
 *
 * Design goals
 * ────────────
 * 1. Prefer L-shapes (one turn) over U-shapes (two turns).
 * 2. Never route a segment that goes forward then doubles back over itself.
 * 3. When a U-shape is unavoidable (same-direction exits or backward L), push
 *    the crossbar far enough outside both elements so the path never passes
 *    through them.
 * 4. Arrowheads always enter/exit elements perpendicular to the element side —
 *    the stub segments guarantee this; the offset only shifts interior waypoints.
 * 5. Port-pair selection scores *actual route quality*, not raw Euclidean dist.
 */

import { absolutePortPosition } from './ports.ts'

export type PortSide = 'n' | 'e' | 's' | 'w'

const CORNER_R = 8    // px — rounded elbow radius
const STUB     = 20   // px — perpendicular exit from port before first turn
const MARGIN   = 24   // px — clearance outside an element for U-shape crossbars
const PORT_SIDES: PortSide[] = ['n', 'e', 's', 'w']

interface Rect { x: number; y: number; w: number; h: number }
type Pt = [number, number]

// Unit exit vector for each port side
const DIR: Record<PortSide, Pt> = {
  n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0],
}

// Opposite side of each port
const OPP: Record<PortSide, PortSide> = { n: 's', s: 'n', e: 'w', w: 'e' }

// ─── Port positions ───────────────────────────────────────────────────────────

function portPt(rect: Rect, side: PortSide, frac = 0.5): Pt {
  const p = absolutePortPosition(rect.x, rect.y, rect.w, rect.h, side, frac)
  return [p.x, p.y]
}

// ─── Route-point computation ──────────────────────────────────────────────────

/**
 * Stub endpoint for a port: port position + STUB pixels in the exit direction.
 */
function stub(rect: Rect, side: PortSide, frac = 0.5): Pt {
  const [px, py] = portPt(rect, side, frac)
  const [dx, dy] = DIR[side]
  return [snap(px + dx * STUB), snap(py + dy * STUB)]
}

/**
 * Compute the waypoints for a route given two stub endpoints and their
 * exit directions. Returns waypoints BETWEEN the stubs (the stubs themselves
 * are prepended/appended by the caller).
 *
 * All returned paths are strictly orthogonal — no diagonal segments.
 * Arrowheads always arrive perpendicular to the element side because the
 * final stub-to-port segment is always axis-aligned.
 *
 * Cases:
 *   Orthogonal (e→n, n→w, …):
 *     L-shape if the corner is "in front" of both elements (no backtracking).
 *     Falls back to a 3-segment U-shape if the corner would be behind either element.
 *   Opposing (e→w, n→s, …):
 *     L-shape (2 turns via midpoint crossbar) when target is in front.
 *     Outer U-shape when target is behind source.
 *   Same direction (e→e, n→n, …):
 *     S/Z-shape (2 turns), crossbar cleared past the farther element.
 */
function innerWaypoints(
  sx: number, sy: number, sp: PortSide,   // src stub endpoint + exit dir
  tx: number, ty: number, tp: PortSide,   // tgt stub endpoint + exit dir
  srcRect: Rect, tgtRect: Rect,
): Pt[] {
  const [sdx, sdy] = DIR[sp]
  const [tdx, tdy] = DIR[tp]

  // ── Orthogonal exits (one horizontal, one vertical) ───────────────────────
  if (sdy === 0 && tdx === 0) {
    // src exits horizontally, tgt exits vertically
    // Ideal L-corner: (tx, sy) — src travels horizontally to tx, then tgt travels vertically to sy
    // "Forward" check: tx must be in src's exit direction from sx
    const cornerOk = sdx > 0 ? tx >= sx : tx <= sx
    if (cornerOk) {
      return [[snap(tx), snap(sy)]]
    } else {
      // Corner is behind — use a 3-segment U: go out in exit dir, cross to tgt column, then approach tgt
      const outerX = sdx > 0
        ? snap(Math.max(srcRect.x + srcRect.w, tgtRect.x + tgtRect.w) + MARGIN)
        : snap(Math.min(srcRect.x, tgtRect.x) - MARGIN)
      return [[outerX, snap(sy)], [outerX, snap(ty)], [snap(tx), snap(ty)]]
    }
  }
  if (sdx === 0 && tdy === 0) {
    // src exits vertically, tgt exits horizontally
    // Ideal L-corner: (sx, ty)
    const cornerOk = sdy > 0 ? ty >= sy : ty <= sy
    if (cornerOk) {
      return [[snap(sx), snap(ty)]]
    } else {
      // Corner is behind — 3-segment U
      const outerY = sdy > 0
        ? snap(Math.max(srcRect.y + srcRect.h, tgtRect.y + tgtRect.h) + MARGIN)
        : snap(Math.min(srcRect.y, tgtRect.y) - MARGIN)
      return [[snap(sx), outerY], [snap(tx), outerY], [snap(tx), snap(ty)]]
    }
  }

  // ── Opposing exits (e→w or w→e, n→s or s→n) ─────────────────────────────
  if (OPP[sp] === tp) {
    if (sdy === 0) {
      // Horizontal opposing: e→w or w→e
      const inFront = sdx > 0 ? tx >= sx : tx <= sx
      if (inFront) {
        // I-shape: stubs on the same Y → straight horizontal line, no waypoints needed
        if (Math.abs(sy - ty) < 2) return []
        // U-shape: route via midpoint crossbar
        const my = snap((sy + ty) / 2)
        return [[snap(sx), my], [snap(tx), my]]
      } else {
        // Target is behind — go around the outside of both elements
        const outerX = sdx > 0
          ? snap(Math.max(srcRect.x + srcRect.w, tgtRect.x + tgtRect.w) + MARGIN)
          : snap(Math.min(srcRect.x, tgtRect.x) - MARGIN)
        return [[outerX, snap(sy)], [outerX, snap(ty)]]
      }
    } else {
      // Vertical opposing: n→s or s→n
      const inFront = sdy > 0 ? ty >= sy : ty <= sy
      if (inFront) {
        // I-shape: stubs on the same X → straight vertical line, no waypoints needed
        if (Math.abs(sx - tx) < 2) return []
        // U-shape: route via midpoint crossbar
        const mx = snap((sx + tx) / 2)
        return [[mx, snap(sy)], [mx, snap(ty)]]
      } else {
        const outerY = sdy > 0
          ? snap(Math.max(srcRect.y + srcRect.h, tgtRect.y + tgtRect.h) + MARGIN)
          : snap(Math.min(srcRect.y, tgtRect.y) - MARGIN)
        return [[snap(sx), outerY], [snap(tx), outerY]]
      }
    }
  }

  // ── Same-direction exits (e→e, w→w, n→n, s→s) ───────────────────────────
  // S/Z-shape: route around the farther element, two turns.
  if (sp === tp) {
    if (sdy === 0) {
      // Both horizontal
      const outerX = sdx > 0
        ? snap(Math.max(srcRect.x + srcRect.w, tgtRect.x + tgtRect.w) + MARGIN)
        : snap(Math.min(srcRect.x, tgtRect.x) - MARGIN)
      const my = snap((sy + ty) / 2)
      return [[outerX, snap(sy)], [outerX, my], [snap(tx), my]]
    } else {
      // Both vertical
      const outerY = sdy > 0
        ? snap(Math.max(srcRect.y + srcRect.h, tgtRect.y + tgtRect.h) + MARGIN)
        : snap(Math.min(srcRect.y, tgtRect.y) - MARGIN)
      const mx = snap((sx + tx) / 2)
      return [[snap(sx), outerY], [mx, outerY], [mx, snap(ty)]]
    }
  }

  // Fallback (should not be reached with cardinal ports only)
  return [[snap(sx), snap(ty)]]
}

// ─── Port-pair scoring ────────────────────────────────────────────────────────

/**
 * Score a port-pair route. Lower = better.
 *
 * Visual quality tiers (turn cost):
 *   0 — I-shape: perfectly straight, no turns
 *   1 — L-shape OR S-shape (opposing, target in front): one visual bend
 *   2 — S/Z same-direction: two turns around the farther element
 *   + large penalties for backward paths that require going behind elements
 *
 * Opposing-forward (S-shape) scores the same as L (both = 1 visual bend).
 * Path length breaks ties so the shorter route wins — a short S beats a long L.
 */
function routeScore(src: Rect, sp: PortSide, tgt: Rect, tp: PortSide): number {
  const [sdx, sdy] = DIR[sp]

  const [sx, sy] = stub(src, sp)
  const [tx, ty] = stub(tgt, tp)

  let turns = 0
  let backwardPenalty = 0

  if (OPP[sp] === tp) {
    // Opposing ports (e→w, w→e, n→s, s→n)
    const inFront = sdy === 0
      ? (sdx > 0 ? tx >= sx : tx <= sx)
      : (sdy > 0 ? ty >= sy : ty <= sy)

    if (inFront) {
      // I-shape (0 turns) when stubs share the same perpendicular axis
      const aligned = sdy === 0
        ? Math.abs(sy - ty) < 2
        : Math.abs(sx - tx) < 2
      // S-shape and L-shape are equal quality (both 1 visual bend).
      // Path length alone decides which wins — shorter route is always preferred.
      turns = aligned ? 0 : 1
    } else {
      // Target is behind — U wraps outside both elements, costly
      turns = 2
      backwardPenalty = 4000
    }
  } else if (sp === tp) {
    // Same-direction (e→e, n→n …) — S/Z around the farther element
    turns = 2
    backwardPenalty = 500
  } else {
    // Orthogonal exits — L-shape (1 turn) if corner is forward, else backward-U
    let cornerOk = true
    if (sdy === 0) {
      cornerOk = sdx > 0 ? tx >= sx : tx <= sx
    } else {
      cornerOk = sdy > 0 ? ty >= sy : ty <= sy
    }
    turns = cornerOk ? 1 : 2
    if (!cornerOk) backwardPenalty = 3000
  }

  // Actual path length through computed waypoints
  const inner = innerWaypoints(sx, sy, sp, tx, ty, tp, src, tgt)
  const chain: Pt[] = [[sx, sy], ...inner, [tx, ty]]
  let pathLen = 0
  for (let i = 1; i < chain.length; i++) {
    pathLen += Math.abs(chain[i][0] - chain[i-1][0]) + Math.abs(chain[i][1] - chain[i-1][1])
  }

  return turns * 2000 + backwardPenalty + pathLen
}

/**
 * Pick the best (srcPort, tgtPort) pair.
 * Scores all 16 combinations and returns the lowest-cost one.
 */
export function bestPortPair(src: Rect, tgt: Rect): { src: PortSide; tgt: PortSide } {
  let best = { src: 'e' as PortSide, tgt: 'w' as PortSide }
  let bestScore = Infinity
  for (const sp of PORT_SIDES) {
    for (const tp of PORT_SIDES) {
      const score = routeScore(src, sp, tgt, tp)
      if (score < bestScore) { bestScore = score; best = { src: sp, tgt: tp } }
    }
  }
  return best
}

// ─── Path building ────────────────────────────────────────────────────────────

/**
 * Compute stub endpoint: move STUB pixels in exit direction from the actual
 * port position (x, y). Used by orthogonalPath — the port position is already
 * frac-adjusted by the caller so we just extend outward from it.
 */
function stubFrom(px: number, py: number, side: PortSide): Pt {
  const [dx, dy] = DIR[side]
  return [snap(px + dx * STUB), snap(py + dy * STUB)]
}

/**
 * Build an orthogonal SVG `d` string between two port positions.
 * Includes the STUB exit segments at both ends.
 *
 * The `_offset` parameter is accepted for API compatibility but ignored —
 * parallel connections are separated via frac-adjusted port positions instead.
 */
export function orthogonalPath(
  x1: number, y1: number, sp: string,
  x2: number, y2: number, tp: string,
  _offset = 0,
  srcRect?: Rect,
  tgtRect?: Rect,
): string {
  const srcPort = (sp in DIR ? sp : 'e') as PortSide
  const tgtPort = (tp in DIR ? tp : 'w') as PortSide

  const sr: Rect = srcRect ?? { x: x1 - 1, y: y1 - 1, w: 2, h: 2 }
  const tr: Rect = tgtRect ?? { x: x2 - 1, y: y2 - 1, w: 2, h: 2 }

  const [sx, sy] = stubFrom(x1, y1, srcPort)
  const [tx, ty] = stubFrom(x2, y2, tgtPort)

  const inner = innerWaypoints(sx, sy, srcPort, tx, ty, tgtPort, sr, tr)
  const all: Pt[] = [[x1, y1], [sx, sy], ...inner, [tx, ty], [x2, y2]]

  return buildSmoothPath(all)
}

// ─── SVG path renderer ────────────────────────────────────────────────────────

function buildSmoothPath(all: Pt[]): string {
  const pts = dedup(all)
  if (pts.length < 2) return ''

  const last = pts.length - 1

  let d = `M${fmt(pts[0][0])},${fmt(pts[0][1])}`

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const cur  = pts[i]
    const next = pts[i + 1]

    if (!next) {
      d += ` L${fmt(cur[0])},${fmt(cur[1])}`
      continue
    }

    // Never round the stub junctions (i=1 and i=last-1): these connect the
    // port exit segment to the first inner turn and the last inner turn to the
    // port entry segment. Rounding here would make arrowheads arrive at a
    // non-perpendicular angle.
    const isStubJunction = i === 1 || i === last - 1
    if (isStubJunction) {
      d += ` L${fmt(cur[0])},${fmt(cur[1])}`
      continue
    }

    // Skip rounding when segments are collinear (no real turn)
    const sameAxis =
      (prev[0] === cur[0] && cur[0] === next[0]) ||
      (prev[1] === cur[1] && cur[1] === next[1])
    if (sameAxis) {
      d += ` L${fmt(cur[0])},${fmt(cur[1])}`
      continue
    }

    const r = Math.min(CORNER_R, segLen(prev, cur) / 2, segLen(cur, next) / 2)
    if (r < 0.5) {
      d += ` L${fmt(cur[0])},${fmt(cur[1])}`
      continue
    }

    const bx = cur[0] - r * Math.sign(cur[0] - prev[0])
    const by = cur[1] - r * Math.sign(cur[1] - prev[1])
    const ax = cur[0] + r * Math.sign(next[0] - cur[0])
    const ay = cur[1] + r * Math.sign(next[1] - cur[1])

    d += ` L${fmt(bx)},${fmt(by)}`
    d += ` Q${fmt(cur[0])},${fmt(cur[1])} ${fmt(ax)},${fmt(ay)}`
  }

  return d
}

/** Remove consecutive near-duplicate points, but always keep stub endpoints
 *  (index 1 and index len-2) so the port→stub and stub→port segments are preserved. */
function dedup(pts: Pt[]): Pt[] {
  if (pts.length === 0) return pts
  const last = pts.length - 1
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]
    const keep = i === 1 || i === last - 1 || i === last  // always keep stubs + final port
    if (keep || Math.abs(pts[i][0] - prev[0]) > 0.5 || Math.abs(pts[i][1] - prev[1]) > 0.5) {
      out.push(pts[i])
    }
  }
  return out
}

function segLen(a: Pt, b: Pt): number {
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
}

function snap(n: number): number {
  return Math.round(n * 2) / 2
}

function fmt(n: number): string {
  return n.toFixed(1)
}

/**
 * Compute the midpoint along an orthogonal path (by arc length).
 * Returns {x, y, angle} where angle is the direction of the segment at the midpoint.
 */
export function pathMidpoint(
  x1: number, y1: number, sp: string,
  x2: number, y2: number, tp: string,
  srcRect?: Rect, tgtRect?: Rect,
): { x: number; y: number; angle: number } {
  const srcPort = (sp in DIR ? sp : 'e') as PortSide
  const tgtPort = (tp in DIR ? tp : 'w') as PortSide
  const sr: Rect = srcRect ?? { x: x1 - 1, y: y1 - 1, w: 2, h: 2 }
  const tr: Rect = tgtRect ?? { x: x2 - 1, y: y2 - 1, w: 2, h: 2 }

  const [sx, sy] = stubFrom(x1, y1, srcPort)
  const [tx, ty] = stubFrom(x2, y2, tgtPort)
  const inner = innerWaypoints(sx, sy, srcPort, tx, ty, tgtPort, sr, tr)

  const pts: Pt[] = [[x1, y1], [sx, sy], ...inner, [tx, ty], [x2, y2]]

  // Compute total arc length
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += segLen(pts[i - 1], pts[i])
  }

  // Walk to the halfway point
  const half = total / 2
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const segL = segLen(pts[i - 1], pts[i])
    if (walked + segL >= half) {
      const t = (half - walked) / segL
      const x = pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0])
      const y = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])
      const angle = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI
      return { x, y, angle }
    }
    walked += segL
  }
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, angle: 0 }
}

export { absolutePortPosition }
export type { Rect }
