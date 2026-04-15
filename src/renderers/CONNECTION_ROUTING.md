# Connection Routing — Requirements & Development Plan

This document captures the routing requirements and outstanding development work.
Implementation: `routing.ts` · Renderer: `ConnectionRenderer.ts`

---

## Goals

Every connection path must satisfy four non-negotiable goals:

1. **No overlap with source or target** — no path segment may pass through or touch either element's bounding rect.
2. **Shortest valid path** — among all paths that satisfy goal 1, the shortest (fewest turns, then fewest pixels) wins. No back-tracking: no segment may immediately undo a previous segment's direction. No degenerate segments shorter than `STUB + CORNER_R` (the minimum renderable turn).
3. **Reliable, controllable port selection** — auto-routing always picks the facing port pair that produces the best path. Per-element side restrictions (e.g. queues: east/west only) are always respected. Users can hard-set the target port entry side via elbow mode (`min`/`max`), with a predictable and stable effect.
4. **Simplest shape preferred** — 0-turn (I) beats 1-turn (L) beats 2-turn (Z/U) beats 3-turn (detour shapes). Within the same turn count, less total path length wins.

---

## Shape Catalogue

All shapes are strictly orthogonal (no diagonal segments). Corners are rounded via quadratic Bézier arcs (`CORNER_R = 8px`), capped to half the shorter adjacent segment. Stubs (`STUB = 20px`) exit perpendicular to the element side before any turn and arrive perpendicular at the target — arrowheads are always axis-aligned.

| # | Name | Turns | Condition | Score formula |
|---|---|---|---|---|
| 1 | **I-shape** | 0 | Opposing ports, stubs co-linear | 0 + pathLen |
| 2 | **L-shape** | 1 | Orthogonal exits, corner forward, no segment clips either rect | 2000 + pathLen |
| 3 | **Z-shape** | 2 | Same-direction exits — outer rail past the farther element | 4000 + pathLen |
| 4 | **L-shape (cramped)** | 1+penalty | One leg < `STUB + CORNER_R` | 4500 + pathLen |
| 5 | **U-shape** | 2 | Opposing, in-front, stubs offset — crossbar at midpoint between facing edges | 6000 + pathLen |
| 6 | **Backward-L / detour** | 2 | Orthogonal exits, corner behind or any segment clips — outer rail + approach around target | 8000 + pathLen |
| 7 | **S-shape** | 2 | Opposing ports, target behind — detour around target via sideY/sideX | 10000 + pathLen |

Score = `turns × 2000 + shapePenalty + pathLen`. Lowest wins.

The cramped-L penalty (4500 > 4000) ensures a clean Z is preferred over an L where the arc would compress into the stub. U and S are always last resorts because they require routing around elements.

---

## Requirements

### R1 — No element overlap (Goal 1)

- **R1.1** Every inner waypoint must be strictly outside both `srcRect` and `tgtRect` (no `pointInRect` hit).
- **R1.2** Every path segment (between consecutive waypoints, including stubs) must not cross either element rect (`segmentCrossesRect` check). This covers all legs including the final approach segment, not just corner points.
- **R1.3** The outer-rail fallback for Backward-L and Z-shapes must use a rail outside the farther element (`Math.max(rect.r, rect.r) + MARGIN` / `Math.min(rect.l, rect.l) - MARGIN`). The final approach segment from the rail to the target stub must also be checked — if it still clips, the path must detour around the near side of the target before the approach.
- **R1.4** S-shape and U-shape crossbars must be placed at a `MARGIN`-cleared distance from the nearest element edge. The crossbar segment itself must not cross either element.

### R2 — Shortest valid path / no degenerate segments (Goal 2)

- **R2.1** Port-pair selection scores the actual computed path length (Manhattan distance through all waypoints), not Euclidean distance between centers.
- **R2.2** A cramped L (either leg `< STUB + CORNER_R`) is penalised above the Z tier so the router switches to the cleaner 2-turn shape rather than producing an un-renderable arc.
- **R2.3** No segment may be zero-length or near-zero (< 0.5px). Consecutive duplicate points are removed by `dedup` before path rendering.
- **R2.4** No back-tracking: the outer-rail X/Y for Z and backward-L shapes must be strictly outside both elements, never between them. For Z-shapes the crossbar exits at the source level and arrives at the target level — the route must not reverse direction along the exit axis.
- **R2.5** *(open)* Degenerate stub: when `STUB` would push the stub endpoint inside or through the target element (source very close to target), the stub length must be clamped to leave the endpoint outside the element rect.

### R3 — Controllable, reliable port selection (Goal 3)

- **R3.1** Auto-routing uses `facingPorts`: the two port sides on each element whose outward direction faces the other element's center (primary = dominant axis, secondary = perpendicular axis). Far-side ports are never considered unless the element config leaves no facing candidates.
- **R3.2** Element configs restrict available sides. `bestPortPair` intersects `facingPorts` with the allowed set — the result always contains at least one side (falls back to full allowed set if intersection is empty).
- **R3.3** Ports are re-evaluated on every `refreshConnections` call. Stored port values in the connection record are overwritten — they are not a source of truth for routing.
- **R3.4** Slot assignment: when multiple connections share the same side on an element, slots are evenly spaced and sorted by the peer element's center (e/w: sort by Y; n/s: sort by X). Slot positions are fractional (0–1 along the side edge), passed as `frac` to `absolutePortPosition`.
- **R3.5** Elbow mode (`'auto' | 'min' | 'max'`) overrides the **target** port selection only. `'min'` forces `tgtCandidates[0]` (primary facing port). `'max'` forces `tgtCandidates[1]` (secondary). Source is always chosen freely by best score. When the element allows only one facing port, both modes are identical.
- **R3.6** *(open)* Per-connection source-port hard lock — a future `sourceMode` property could pin the source port side, symmetric with elbow mode.

### R4 — Simplest shape preferred (Goal 4)

- **R4.1** Shape priority strictly follows: I → L → Z → U/S. A higher-turn path is only used when all lower-turn paths are impossible (goal 1 violated or degenerate).
- **R4.2** Within the same turn count, shortest path length wins.
- **R4.3** An L is preferred over a Z even when both are valid, unless the L is cramped (R2.2 penalty). A clean L at 2000+len always beats a Z at 4000+len.
- **R4.4** *(open)* When both port-pair candidates produce the same shape tier, prefer the pair that produces a path that goes through open space (no third-element obstructions). Currently only source and target rects are checked; third-party elements are ignored.

---

## Known Open Issues

### OI-1 — Final-approach segment clips target (q-shape) [partially fixed]

**Symptom**: When source is below-and-slightly-left of target and the target uses a west port, the outer-U fallback in the `sdx===0 && tdy===0` branch produces a vertical segment at `x=tx` (the stub position left of the target) that descends from `outerY` through the target's body.

**Current fix** (in this branch): After computing the outer-U, `segmentCrossesRect` checks the final approach segment. If it clips, the path detours via `sideX` outside the target before descending to `ty`. Same logic applied symmetrically to the `sdy===0 && tdx===0` branch.

**Remaining risk**: The detour itself (`[outerX, outerY]→[sideX, outerY]→[sideX, ty]`) has not been tested for all geometries. In particular, the `[sideX, outerY]→[sideX, ty]` vertical segment could theoretically clip the target if `sideX` is mis-computed. Needs visual regression across the full geometry matrix.

### OI-2 — Stub penetration at close range [open]

**Symptom**: When source and target are very close together (gap < `STUB` pixels), the stub endpoint of one element lands inside the other element, violating R1.1. No clamp is currently applied.

**Required fix**: In `stub()` (or before calling `innerWaypoints`), detect if `stubPt` lands inside the opposing element's rect and shorten the stub to stop at the element edge minus a small epsilon. Also requires updating `STUB` used in the cramped-L penalty check (R2.2) to use the effective stub length.

### OI-3 — Third-element obstruction not checked [open]

**Symptom**: Paths between two elements may route through a third unrelated element on the canvas. Only source and target rects are passed to the router.

**Required fix**: Pass all element rects to `bestPortPair` / `innerWaypoints` and check every segment against every rect. This is architecturally non-trivial (routing currently has no knowledge of the full diagram) and will require passing a `obstacles: Rect[]` array through the call stack. Defer until the other issues are resolved.

### OI-4 — Z-shape crossbar may clip an intermediate element [open]

**Symptom**: The Z-shape outer rail is computed as the max/min of only the two connected elements. If a third element protrudes beyond both, the outer rail may pass through it.

**Required fix**: Part of OI-3 — once obstacles are threaded through, the outer rail position must clear all obstacle rects, not just the two endpoints.

### OI-5 — U-shape crossbar position (midpoint between facing edges) [open]

**Symptom**: The U-shape midpoint crossbar is placed halfway between the facing edges of the two elements. When the source and target are very different heights, the crossbar may be very close to one element's edge, leaving a short stub-to-crossbar segment that compresses the arc.

**Required fix**: Add a cramped-U check (minimum distance from each element's facing edge to the crossbar ≥ `STUB + CORNER_R`); if violated, push the crossbar toward the farther element.

---

## Development Plan

### Phase 1 — Correctness: geometry validation (addresses Goals 1 & 2)

**P1-a: Full segment validation for all fallback paths** *(OI-1, partial fix landed)*
- Audit every fallback return in `innerWaypoints`: for each generated waypoint chain, verify that every segment passes `segmentCrossesRect` against both `srcRect` and `tgtRect`.
- Write unit tests that cover all 8 combinations of `(sp, tp)` where L is invalid and a detour is needed.
- Status: fix for `sdx===0&&tdy===0` and `sdy===0&&tdx===0` branches landed. Needs visual QA.

**P1-b: Stub clamp at close range** *(OI-2)*
- In `stub()`, if the resulting stub point is inside the opposing element, shorten to `element_edge - 1px`.
- Propagate effective stub length to cramped-L check.
- Add unit tests with overlapping / touching rects.

**P1-c: Degenerate segment guard** *(R2.3)*
- In `innerWaypoints`, after computing waypoints, filter out any segment pair where `segLen < 0.5`. Currently handled by `dedup` in the renderer but should be enforced at the waypoint level too.

### Phase 2 — Reliability: scoring consistency (addresses Goals 2 & 3)

**P2-a: Score/geometry alignment**
- `routeScore` currently replicates the `cornerOk` logic from `innerWaypoints`. Any future change to `innerWaypoints` must be mirrored in `routeScore`, or the two must be unified. Refactor: compute waypoints in `routeScore` and derive score from the waypoint count (turns = waypoints length / 2) rather than duplicating the conditional logic. This eliminates the risk of divergence.

**P2-b: Cramped-U penalty** *(OI-5)*
- Add a penalty to U-shape scoring when the crossbar-to-element distance is too short (< `STUB + CORNER_R`). This may cause the scorer to prefer a backward-L detour over a cramped U.

**P2-c: Elbow mode stability**
- When `elbowMode` is `min` or `max` and the forced target port produces a path that violates R1 (clips an element), the router should log a warning but still render the path (user's explicit choice overrides auto). This is the current behaviour; document it explicitly.

### Phase 3 — Completeness: obstacle awareness (addresses Goal 1 fully)

**P3-a: Thread obstacle rects through the router** *(OI-3, OI-4)*
- Add `obstacles?: Rect[]` parameter to `bestPortPair`, `routeScore`, and `innerWaypoints`.
- In `routeScore` and `innerWaypoints`, check all segments against all obstacle rects using the existing `segmentCrossesRect`.
- In `main.ts` `refreshConnections`, collect all element rects excluding source and target, and pass as `obstacles`.
- Adjust outer-rail computations (Z, U, backward-L fallbacks) to clear all obstacle rects, not just the two endpoints: outer rail = `max(all relevant rects' far edges) + MARGIN`.

**P3-b: Obstacle-aware port scoring**
- Once obstacles are available, add an `obstacleClip` penalty to `routeScore` for any port pair whose computed path clips an obstacle (separate tier above S-shape, so auto-routing strongly avoids third-element overlap).

### Phase 4 — User control (addresses Goal 3 fully)

**P4-a: Source-port elbow mode** *(R3.6)*
- Add `sourceMode?: ElbowMode` to `Connection`. Mirror the target-forcing logic for source candidates.
- Add a source-side row to the connection popover (or extend the existing elbow row with src/tgt tabs).

**P4-b: Connection routing preview on drag**
- While dragging a new connection, render the live ghost path using the same `orthogonalPath` logic with the current candidate source/target rects. Currently the ghost is a straight line.

---

## Constants

| Name | Value | Purpose |
|---|---|---|
| `STUB` | 20 px | Perpendicular exit length from port before first turn |
| `CORNER_R` | 8 px | Bézier arc radius at each corner |
| `MARGIN` | 24 px | Clearance outside an element for outer-rail and detour paths |

Minimum valid leg length = `STUB + CORNER_R` = 28 px. Legs shorter than this compress the arc into the stub and produce visual artefacts.
