/**
 * Connection routing utilities.
 *
 * Port selection
 * ──────────────
 * • Source: the single port closest to the target center (Manhattan distance
 *   from port position to target center), intersected with allowed sides.
 * • Target: the two ports facing toward the source (primary + secondary axis),
 *   intersected with allowed sides. Elbow mode picks between them.
 *
 * Path geometry
 * ─────────────
 * • Routes are strictly orthogonal (axis-aligned segments only).
 * • Stubs: STUB px perpendicular exit from each port before any turn.
 * • Corner placement: evenly spaced along the path.
 *   1 corner  → at the midpoint of the inner path
 *   2 corners → at 1/3 and 2/3 of the inner path
 * • Turn count preference: fewer turns wins, but only if the path is not
 *   MORE than SIMPLICITY_THRESHOLD px longer than the next-turn option.
 *   This prevents a barely-shorter 2-turn path from beating a 1-turn path.
 * • No overlap: paths that clip either element rect receive a large penalty,
 *   ensuring any clean path (of any turn count) beats any clipping path.
 */

import { absolutePortPosition, PORT_SIDES } from './ports.ts'
import type { ElbowMode } from '../entities/Connection.ts'

export type PortSide = 'n' | 'e' | 's' | 'w'

const CORNER_R  = 8    // px — rounded elbow radius
const STUB      = 20   // px — perpendicular exit from port before first turn
const MARGIN    = 24   // px — clearance outside an element for detour rails

// Fewer turns wins over more turns unless the fewer-turn path is longer by
// more than this threshold. Keeps simple shapes preferred without being rigid.
const SIMPLICITY_THRESHOLD = 40  // px

// Penalty for any path segment that clips an element rect.
// Must exceed any realistic path length so clean always beats clipping.
const CLIP_PENALTY = 100_000

interface Rect { x: number; y: number; w: number; h: number }
type Pt = [number, number]

const DIR: Record<PortSide, Pt> = {
  n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0],
}
const OPP: Record<PortSide, PortSide> = { n: 's', s: 'n', e: 'w', w: 'e' }

// ─── Geometry primitives ──────────────────────────────────────────────────────

function segmentCrossesRect(x1: number, y1: number, x2: number, y2: number, r: Rect): boolean {
  if (Math.abs(y1 - y2) < 0.5) {
    const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
    return y1 > r.y && y1 < r.y + r.h && maxX > r.x && minX < r.x + r.w
  } else {
    const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
    return x1 > r.x && x1 < r.x + r.w && maxY > r.y && minY < r.y + r.h
  }
}

function chainClips(chain: Pt[], a: Rect, b: Rect): boolean {
  for (let i = 1; i < chain.length; i++) {
    const [x1, y1] = chain[i - 1], [x2, y2] = chain[i]
    if (segmentCrossesRect(x1, y1, x2, y2, a)) return true
    if (segmentCrossesRect(x1, y1, x2, y2, b)) return true
  }
  return false
}

function segLen(a: Pt, b: Pt): number {
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])
}

function chainLen(chain: Pt[]): number {
  let len = 0
  for (let i = 1; i < chain.length; i++) len += segLen(chain[i - 1], chain[i])
  return len
}

function snap(n: number): number { return Math.round(n * 2) / 2 }
function fmt(n: number): string  { return n.toFixed(1) }

// ─── Port positions ───────────────────────────────────────────────────────────

function portPt(rect: Rect, side: PortSide, frac = 0.5): Pt {
  const p = absolutePortPosition(rect.x, rect.y, rect.w, rect.h, side, frac)
  return [p.x, p.y]
}

function stubFrom(px: number, py: number, side: PortSide): Pt {
  const [dx, dy] = DIR[side]
  return [snap(px + dx * STUB), snap(py + dy * STUB)]
}

function stubPt(rect: Rect, side: PortSide, frac = 0.5): Pt {
  const [px, py] = portPt(rect, side, frac)
  return stubFrom(px, py, side)
}

// ─── Port selection ───────────────────────────────────────────────────────────

/**
 * The single source port closest to the target center.
 * "Closest" = Manhattan distance from the port position to the target center.
 */
function closestSrcPort(src: Rect, tgt: Rect, allowed: readonly PortSide[]): PortSide {
  const tcx = tgt.x + tgt.w / 2
  const tcy = tgt.y + tgt.h / 2
  let best: PortSide = allowed[0]
  let bestDist = Infinity
  for (const side of allowed) {
    const [px, py] = portPt(src, side)
    const d = Math.abs(px - tcx) + Math.abs(py - tcy)
    if (d < bestDist) { bestDist = d; best = side }
  }
  return best
}

/**
 * The two target ports facing toward the source port position (primary + secondary).
 * Primary = port whose outward direction most directly faces the source port.
 */
function facingTgtPorts(tgt: Rect, srcPx: number, srcPy: number, allowed: readonly PortSide[]): [PortSide, PortSide | null] {
  const dx = srcPx - (tgt.x + tgt.w / 2)
  const dy = srcPy - (tgt.y + tgt.h / 2)

  const hSide: PortSide = dx >= 0 ? 'e' : 'w'
  const vSide: PortSide = dy >= 0 ? 's' : 'n'

  const ordered: PortSide[] = Math.abs(dx) >= Math.abs(dy)
    ? [hSide, vSide]
    : [vSide, hSide]

  const filtered = ordered.filter(s => allowed.includes(s))
  if (filtered.length === 0) {
    // Fall back: just use the two ports whose direction has any component toward source
    const fallback = allowed.filter(s => {
      const [ddx, ddy] = DIR[s]
      return ddx * dx + ddy * dy > 0
    })
    const pool = fallback.length > 0 ? fallback : allowed
    return [pool[0], pool[1] ?? null]
  }
  return [filtered[0], filtered[1] ?? null]
}

// ─── Path candidates ──────────────────────────────────────────────────────────

/**
 * Build all candidate inner-waypoint chains for a given (sp, tp) pair.
 * Returns arrays of Pt[] — inner points between the two stub endpoints.
 * Ordered from fewest to most corners.
 *
 * Corner placement rule: corners are spaced evenly along the inner path.
 *   1 corner → at the midpoint between the two stub endpoints
 *   2 corners → at 1/3 and 2/3 of the bounding span
 */
function candidatePaths(
  sx: number, sy: number, sp: PortSide,
  tx: number, ty: number, tp: PortSide,
  srcRect: Rect, tgtRect: Rect,
): Pt[][] {
  const [sdx, sdy] = DIR[sp]
  const [tdx, tdy] = DIR[tp]

  const results: Pt[][] = []

  // ── 0 corners: I-shape (only if both exits are co-axial and opposing) ──────
  if (OPP[sp] === tp) {
    const aligned = sdy === 0
      ? Math.abs(sy - ty) < 1
      : Math.abs(sx - tx) < 1
    if (aligned) results.push([])
  }

  // ── 1 corner: L-shape ──────────────────────────────────────────────────────
  // Two possible L-corners depending on which axis we turn on first.
  // For orthogonal exits (sdy===0 && tdy!==0 or sdx===0 && tdx!==0):
  //   exactly one natural L-corner exists.
  // For opposing or same-direction exits: no natural 1-corner path exists.
  if (sdy === 0 && tdx === 0) {
    // src horizontal, tgt vertical → corner at (tx, sy)
    // Place corner at midpoint of horizontal span: x = (sx + tx) / 2, then vertical to ty
    // But the natural corner is at (tx, sy) — use midpoint placement:
    const cx = snap((sx + tx) / 2)
    results.push([[cx, snap(sy)], [cx, snap(ty)]])
    // Also try the natural corner (tx, sy) for cases where it's clean
    results.push([[snap(tx), snap(sy)]])
  } else if (sdx === 0 && tdy === 0) {
    // src vertical, tgt horizontal → corner at (sx, ty)
    const cy = snap((sy + ty) / 2)
    results.push([[snap(sx), cy], [snap(tx), cy]])
    results.push([[snap(sx), snap(ty)]])
  } else if (sdy === 0 && tdy === 0 && sdx === tdx) {
    // Same horizontal direction (e→e or w→w): can't do 1-corner, skip
  } else if (sdx === 0 && tdx === 0 && sdy === tdy) {
    // Same vertical direction (n→n or s→s): can't do 1-corner, skip
  } else if (OPP[sp] === tp) {
    // Opposing but not aligned — U-shape: 2 corners, handled below
  } else if (sp === tp) {
    // Same direction — Z-shape: 2 corners, handled below
  }

  // ── 2 corners ──────────────────────────────────────────────────────────────
  // Place corners at 1/3 and 2/3 of the path span.

  if (sdy === 0 && tdx === 0) {
    // HV: already added 1-corner variants. 2-corner via intermediate horizontal rail.
    const railY = snap(sy + (ty - sy) / 3)
    const railY2 = snap(sy + 2 * (ty - sy) / 3)
    results.push([[snap(sx), railY], [snap(tx), railY]])       // rail at 1/3
    results.push([[snap(sx), railY2], [snap(tx), railY2]])     // rail at 2/3
  } else if (sdx === 0 && tdy === 0) {
    // VH: 2-corner via intermediate vertical rail
    const railX = snap(sx + (tx - sx) / 3)
    const railX2 = snap(sx + 2 * (tx - sx) / 3)
    results.push([[railX, snap(sy)], [railX, snap(ty)]])
    results.push([[railX2, snap(sy)], [railX2, snap(ty)]])
  } else if (OPP[sp] === tp) {
    if (sdy === 0) {
      // Horizontal opposing: e→w or w→e
      // U-shape: vertical crossbar at midpoint between facing edges
      const facingSrc = sdx > 0 ? srcRect.x + srcRect.w : srcRect.x
      const facingTgt = sdx > 0 ? tgtRect.x             : tgtRect.x + tgtRect.w
      const midX = snap((facingSrc + facingTgt) / 2)
      results.push([[midX, snap(sy)], [midX, snap(ty)]])
      // Also try outer rail for behind case
      const outerX = sdx > 0
        ? snap(Math.max(srcRect.x + srcRect.w, tgtRect.x + tgtRect.w) + MARGIN)
        : snap(Math.min(srcRect.x, tgtRect.x) - MARGIN)
      const sideY = sy < tgtRect.y + tgtRect.h / 2
        ? snap(tgtRect.y - MARGIN) : snap(tgtRect.y + tgtRect.h + MARGIN)
      results.push([[outerX, snap(sy)], [outerX, sideY], [snap(tx), sideY]])
    } else {
      // Vertical opposing: n→s or s→n
      const facingSrc = sdy > 0 ? srcRect.y + srcRect.h : srcRect.y
      const facingTgt = sdy > 0 ? tgtRect.y             : tgtRect.y + tgtRect.h
      const midY = snap((facingSrc + facingTgt) / 2)
      results.push([[snap(sx), midY], [snap(tx), midY]])
      const outerY = sdy > 0
        ? snap(Math.max(srcRect.y + srcRect.h, tgtRect.y + tgtRect.h) + MARGIN)
        : snap(Math.min(srcRect.y, tgtRect.y) - MARGIN)
      const sideX = sx < tgtRect.x + tgtRect.w / 2
        ? snap(tgtRect.x - MARGIN) : snap(tgtRect.x + tgtRect.w + MARGIN)
      results.push([[snap(sx), outerY], [sideX, outerY], [sideX, snap(ty)]])
    }
  } else if (sp === tp) {
    if (sdy === 0) {
      // Same horizontal (e→e or w→w): Z-shape
      const outerX = sdx > 0
        ? snap(Math.max(srcRect.x + srcRect.w, tgtRect.x + tgtRect.w) + MARGIN)
        : snap(Math.min(srcRect.x, tgtRect.x) - MARGIN)
      results.push([[outerX, snap(sy)], [outerX, snap(ty)], [snap(tx), snap(ty)]])
    } else {
      // Same vertical (n→n or s→s): Z-shape
      const outerY = sdy > 0
        ? snap(Math.max(srcRect.y + srcRect.h, tgtRect.y + tgtRect.h) + MARGIN)
        : snap(Math.min(srcRect.y, tgtRect.y) - MARGIN)
      results.push([[snap(sx), outerY], [snap(tx), outerY], [snap(tx), snap(ty)]])
    }
  } else {
    // Remaining diagonal-exit combos (e→s, w→n, etc.): 2-corner via outer rail
    // Exit on src axis, cross to tgt level, enter on tgt axis
    if (sdy === 0) {
      const outerX = sdx > 0
        ? snap(Math.max(srcRect.x + srcRect.w, tgtRect.x + tgtRect.w) + MARGIN)
        : snap(Math.min(srcRect.x, tgtRect.x) - MARGIN)
      results.push([[outerX, snap(sy)], [outerX, snap(ty)], [snap(tx), snap(ty)]])
    } else {
      const outerY = sdy > 0
        ? snap(Math.max(srcRect.y + srcRect.h, tgtRect.y + tgtRect.h) + MARGIN)
        : snap(Math.min(srcRect.y, tgtRect.y) - MARGIN)
      results.push([[snap(sx), outerY], [snap(tx), outerY], [snap(tx), snap(ty)]])
    }
  }

  // Deduplicate by string representation (avoid scoring identical paths twice)
  const seen = new Set<string>()
  return results.filter(pts => {
    const key = pts.map(p => `${p[0]},${p[1]}`).join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Path scoring and selection ───────────────────────────────────────────────

/**
 * Count the number of turns (direction changes) in a chain.
 * The chain includes the two stub endpoints; turns are counted between them.
 */
function countTurns(chain: Pt[]): number {
  let turns = 0
  for (let i = 2; i < chain.length; i++) {
    const dx1 = chain[i-1][0] - chain[i-2][0]
    const dy1 = chain[i-1][1] - chain[i-2][1]
    const dx2 = chain[i][0]   - chain[i-1][0]
    const dy2 = chain[i][1]   - chain[i-1][1]
    if (dx1 * dx2 === 0 && dy1 * dy2 === 0 && (dx1 !== dx2 || dy1 !== dy2)) turns++
  }
  return turns
}

/**
 * Score a single candidate inner-waypoint path.
 * Returns { turns, len, score } where score is used for final comparison.
 *
 * Score = turns * TURN_WEIGHT + len + clipPenalty
 * TURN_WEIGHT is large enough that fewer turns wins unless the path is
 * more than SIMPLICITY_THRESHOLD longer.
 */
const TURN_WEIGHT = SIMPLICITY_THRESHOLD + 1

function scoreCandidate(
  inner: Pt[],
  sx: number, sy: number,
  tx: number, ty: number,
  srcRect: Rect, tgtRect: Rect,
): { turns: number; len: number; score: number } {
  const chain: Pt[] = [[sx, sy], ...inner, [tx, ty]]
  const len = chainLen(chain)
  const turns = countTurns(chain)
  const clip = chainClips(chain, srcRect, tgtRect) ? CLIP_PENALTY : 0
  return { turns, len, score: turns * TURN_WEIGHT + len + clip }
}

// ─── Best path for a fixed (sp, tp) pair ─────────────────────────────────────

function bestInnerForPair(
  sx: number, sy: number, sp: PortSide,
  tx: number, ty: number, tp: PortSide,
  srcRect: Rect, tgtRect: Rect,
): { inner: Pt[]; turns: number; len: number; score: number } {
  const candidates = candidatePaths(sx, sy, sp, tx, ty, tp, srcRect, tgtRect)
  if (candidates.length === 0) {
    // Fallback: diagonal stub-to-stub
    const chain: Pt[] = [[sx, sy], [tx, ty]]
    const len = chainLen(chain)
    const clip = chainClips(chain, srcRect, tgtRect) ? CLIP_PENALTY : 0
    return { inner: [], turns: 0, len, score: len + clip }
  }

  let best = candidates[0]
  let bestResult = scoreCandidate(best, sx, sy, tx, ty, srcRect, tgtRect)

  for (let i = 1; i < candidates.length; i++) {
    const r = scoreCandidate(candidates[i], sx, sy, tx, ty, srcRect, tgtRect)
    if (r.score < bestResult.score) { best = candidates[i]; bestResult = r }
  }

  return { inner: best, ...bestResult }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pick the best (srcPort, tgtPort) pair.
 *
 * Source: single port closest to the target center.
 * Target: two facing ports — elbow mode selects between them:
 *   'auto' — pick whichever of the two facing ports scores better
 *   'min'  — force primary facing port (index 0)
 *   'max'  — force secondary facing port (index 1, or 0 if only one exists)
 */
export function bestPortPair(
  src: Rect, tgt: Rect,
  srcSides: readonly PortSide[] = PORT_SIDES,
  tgtSides: readonly PortSide[] = PORT_SIDES,
  elbowMode: ElbowMode = 'auto',
): { src: PortSide; tgt: PortSide } {
  const sp = closestSrcPort(src, tgt, srcSides)
  const [spx, spy] = portPt(src, sp)
  const [tgtPrimary, tgtSecondary] = facingTgtPorts(tgt, spx, spy, tgtSides)

  if (elbowMode === 'min' || tgtSecondary === null) {
    return { src: sp, tgt: tgtPrimary }
  }
  if (elbowMode === 'max') {
    return { src: sp, tgt: tgtSecondary }
  }

  // auto: score both and pick the better one
  const [sx, sy] = stubPt(src, sp)
  const [tx1, ty1] = stubPt(tgt, tgtPrimary)
  const [tx2, ty2] = stubPt(tgt, tgtSecondary)

  const r1 = bestInnerForPair(sx, sy, sp, tx1, ty1, tgtPrimary,   src, tgt)
  const r2 = bestInnerForPair(sx, sy, sp, tx2, ty2, tgtSecondary, src, tgt)

  return { src: sp, tgt: r1.score <= r2.score ? tgtPrimary : tgtSecondary }
}

/**
 * Build an orthogonal SVG `d` string between two frac-adjusted port positions.
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

  const { inner } = bestInnerForPair(sx, sy, srcPort, tx, ty, tgtPort, sr, tr)
  const all: Pt[] = [[x1, y1], [sx, sy], ...inner, [tx, ty], [x2, y2]]

  return buildSmoothPath(all)
}

// ─── SVG path builder ─────────────────────────────────────────────────────────

function buildSmoothPath(all: Pt[]): string {
  const pts = dedup(all)
  if (pts.length < 2) return ''

  const last = pts.length - 1
  let d = `M${fmt(pts[0][0])},${fmt(pts[0][1])}`

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const cur  = pts[i]
    const next = pts[i + 1]

    if (!next) { d += ` L${fmt(cur[0])},${fmt(cur[1])}`; continue }

    // Stub junctions sharp — preserves perpendicular exit/entry
    if (i === 1 || i === last - 1) { d += ` L${fmt(cur[0])},${fmt(cur[1])}`; continue }

    // Collinear — no real turn
    const sameAxis =
      (prev[0] === cur[0] && cur[0] === next[0]) ||
      (prev[1] === cur[1] && cur[1] === next[1])
    if (sameAxis) { d += ` L${fmt(cur[0])},${fmt(cur[1])}`; continue }

    const r = Math.min(CORNER_R, segLen(prev, cur) / 2, segLen(cur, next) / 2)
    if (r < 0.5) { d += ` L${fmt(cur[0])},${fmt(cur[1])}`; continue }

    const bx = cur[0] - r * Math.sign(cur[0] - prev[0])
    const by = cur[1] - r * Math.sign(cur[1] - prev[1])
    const ax = cur[0] + r * Math.sign(next[0] - cur[0])
    const ay = cur[1] + r * Math.sign(next[1] - cur[1])

    d += ` L${fmt(bx)},${fmt(by)}`
    d += ` Q${fmt(cur[0])},${fmt(cur[1])} ${fmt(ax)},${fmt(ay)}`
  }

  return d
}

function dedup(pts: Pt[]): Pt[] {
  if (pts.length === 0) return pts
  const last = pts.length - 1
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]
    const keep = i === 1 || i === last - 1 || i === last
    if (keep || Math.abs(pts[i][0] - prev[0]) > 0.5 || Math.abs(pts[i][1] - prev[1]) > 0.5) {
      out.push(pts[i])
    }
  }
  return out
}

// ─── Path midpoint ────────────────────────────────────────────────────────────

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
  const { inner } = bestInnerForPair(sx, sy, srcPort, tx, ty, tgtPort, sr, tr)

  const pts: Pt[] = [[x1, y1], [sx, sy], ...inner, [tx, ty], [x2, y2]]

  let total = 0
  for (let i = 1; i < pts.length; i++) total += segLen(pts[i - 1], pts[i])

  const half = total / 2
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const sLen = segLen(pts[i - 1], pts[i])
    if (walked + sLen >= half) {
      const t = (half - walked) / sLen
      const x = pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0])
      const y = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])
      const angle = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]) * 180 / Math.PI
      return { x, y, angle }
    }
    walked += sLen
  }
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2, angle: 0 }
}

export { absolutePortPosition }
export type { Rect }
