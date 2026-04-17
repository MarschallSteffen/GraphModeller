# Connection Routing

Implementation: `src/renderers/routing.ts` · Renderer: `src/renderers/ConnectionRenderer.ts`

---

## Goals

Every connection path must satisfy four non-negotiable goals:

1. **No overlap with source or target** — no path segment may pass through either element's bounding rect.
2. **Shortest valid path** — fewest turns, then fewest pixels. No back-tracking.
3. **Reliable, controllable port selection** — auto picks the facing port pair that produces the best path. Per-element side restrictions are always respected. Users can pin source and/or target port axis via elbow mode.
4. **Simplest shape preferred** — I beats L beats Z/U.

---

## Shape Catalogue

All shapes are strictly orthogonal. Corners are rounded via quadratic Bézier arcs (`CORNER_R = 8 px`). Stubs (`STUB = 20 px`) exit perpendicular to the element side before any turn and arrive perpendicular at the target.

| Shape | Turns | Condition |
|---|---|---|
| **I-shape** | 0 | Opposing ports, stubs co-linear |
| **L-shape** | 1 | Orthogonal exits, corner forward, no segment clips either rect |
| **Z-shape** | 2 | Same-direction exits — outer rail past the farther element |
| **U-shape** | 2 | Opposing, in-front — crossbar at midpoint between facing edges |
| **Detour** | 2–3 | Orthogonal exits, corner behind or any segment clips — outer rail + approach |

---

## Scoring

```
score = turns × TURN_WEIGHT + pathLen + clipPenalty
```

- `TURN_WEIGHT = SIMPLICITY_THRESHOLD + 1 = 41`
- `SIMPLICITY_THRESHOLD = 40 px` — a fewer-turn path wins over a more-turn path unless it is more than 40 px longer.
- `CLIP_PENALTY = 100 000` — applied when any segment crosses a source or target rect; ensures any clean path beats any clipping path.
- Lowest score wins.

---

## Requirements

### R1 — No element overlap

- **R1.1** Every segment (including stubs) must not cross either element rect (`segmentCrossesRect` check).
- **R1.2** The outer-rail fallback for Z/detour shapes uses a rail strictly outside the farther element (`max(rect.r, rect.r) + MARGIN` or `min − MARGIN`).

### R2 — Shortest valid path

- **R2.1** Port-pair selection scores actual computed path length (Manhattan through all waypoints).
- **R2.2** Consecutive duplicate points are removed by `dedup` before rendering.
- **R2.3** *(open)* Stub clamp at close range: when source and target are closer than `STUB`, the stub endpoint can land inside the opposing element. A clamp to `element_edge − 1 px` is not yet implemented.

### R3 — Controllable port selection

- **R3.1** `closestSrcPort` picks the source port whose position is closest (Manhattan) to the target center, intersected with the allowed sides from the element config.
- **R3.2** `facingTgtPorts` returns the one or two target sides whose outward direction faces the source port (primary = dominant axis, secondary = perpendicular). These are intersected with the element's allowed sides.
- **R3.3** Ports are re-evaluated on every `refreshConnections` call. Stored port values in the connection record are overwritten — they are not a source of truth for routing.
- **R3.4** Slot assignment: when multiple connections share the same side, slots are evenly spaced and sorted by peer-element center (e/w → sort by Y; n/s → sort by X). Fractional positions are passed as `frac` to `absolutePortPosition`.
- **R3.5** Elbow mode applies to **both source and target** independently (see below).

### R4 — Simplest shape preferred

- **R4.1** Fewer turns always wins unless the path is more than `SIMPLICITY_THRESHOLD` (40 px) longer.
- **R4.2** Within the same turn count, shortest path length wins.
- **R4.3** *(open)* Third-element obstructions are not checked — paths may route through unrelated elements. Only source and target rects are passed to the router.

---

## Elbow Mode

Each connection has two independent elbow mode fields:

| Field | Stored as | Controls |
|---|---|---|
| `srcElbowMode` | `Connection.srcElbowMode` | which port axis the source exits from |
| `elbowMode` | `Connection.elbowMode` | which port axis the target enters from |

Both use the same `ElbowMode` type and the same `restrictSides()` helper in `routing.ts`.

### Values

| Value | Effect |
|---|---|
| `'auto'` (default) | Pick whichever facing port scores best |
| `'horizontal'` | Restrict to `e`/`w` ports — exits/enters from the side |
| `'vertical'` | Restrict to `n`/`s` ports — exits/enters from top/bottom |
| `'left'` | Force `w` port — for queue-type elements (only `e`/`w` available) |
| `'right'` | Force `e` port — for queue-type elements |

**Stability**: axis-based restriction never changes as elements move, so ports cannot flip when one element crosses the 45° diagonal relative to the other.

**Fallback**: if the element has no ports on the restricted axis (e.g. a queue with `'vertical'`), the restriction is silently dropped and auto applies.

### Popover UI

The Routing section in the connection popover shows two independent rows — **Source** and **Target** — each with the same button set. The button set adapts per endpoint:
- Normal elements (4 ports): auto / horizontal / vertical
- Horizontal-only elements (queues, 2 ports): auto / left / right

### Persistence

Both `srcElbowMode` and `elbowMode` are serialized to JSON. `'auto'` is omitted (defaults on load). Legacy values `'min'` and `'max'` (from older saves) are migrated to `'horizontal'` and `'vertical'` on load.

---

## Constants

| Name | Value | Purpose |
|---|---|---|
| `STUB` | 20 px | Perpendicular exit from port before first turn |
| `CORNER_R` | 8 px | Bézier arc radius at each corner |
| `MARGIN` | 24 px | Clearance outside an element for outer-rail / detour paths |
| `SIMPLICITY_THRESHOLD` | 40 px | Max extra length allowed before switching to a lower-turn shape |
| `TURN_WEIGHT` | 41 | Score weight per turn (`SIMPLICITY_THRESHOLD + 1`) |
| `CLIP_PENALTY` | 100 000 | Score penalty for any segment crossing a source/target rect |

---

## Open Issues

### OI-1 — Final-approach segment clips target (partial fix landed)

**Symptom**: Certain port combinations produce a vertical segment at `x=tx` that descends through the target's body. A `segmentCrossesRect` check was added; a detour via `sideX` outside the target is inserted when the check fires.

**Remaining risk**: The detour itself has not been tested across the full geometry matrix. Needs visual regression.

### OI-2 — Stub penetration at close range

**Symptom**: When source and target gap < `STUB`, the stub endpoint lands inside the opposing element. No clamp is currently applied.

**Fix**: In `stub()`, detect if `stubPt` lands inside the opposing element and shorten to `element_edge − 1 px`.

### OI-3 — Third-element obstruction not checked

**Symptom**: Paths may route through a third unrelated element. Only source and target rects are passed to the router.

**Fix**: Add `obstacles?: Rect[]` to `bestPortPair` / `bestInnerForPair`. In `refreshConnections`, collect all element rects excluding source and target and pass as obstacles. Adjust outer-rail computations to clear all obstacle rects.
