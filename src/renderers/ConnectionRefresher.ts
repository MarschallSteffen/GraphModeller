import type { DiagramStore } from '../store/DiagramStore.ts'
import type { ConnectionRenderer } from './ConnectionRenderer.ts'
import type { Connection } from '../entities/Connection.ts'
import type { Diagram } from '../entities/Diagram.ts'
import { absolutePortPosition } from './ports.ts'
import { bestPortPair } from './routing.ts'
import type { PortSide } from './routing.ts'
import { deconflict, type LabelBox } from './LabelDeconflictLayer.ts'
import { estimateTextWidth } from './svgUtils.ts'
import { getConnStereotype } from './ConnectionRenderer.ts'
import { getElementConfig } from '../config/registry.ts'

type AnyElement = { position: { x: number; y: number }; size: { w: number; h: number } }

export interface ConnectionRefresherDeps {
  store: DiagramStore
  connRenderers: Map<string, ConnectionRenderer>
  findElement: (d: Readonly<Diagram>, id: string) => { el: AnyElement; type: string } | undefined
  getRenderedSizeFor: (id: string, found: { el: AnyElement; type: string }) => { w: number; h: number }
}

export class ConnectionRefresher {
  constructor(private deps: ConnectionRefresherDeps) {}

  refresh(): void {
    const { store, connRenderers, findElement, getRenderedSizeFor } = this.deps
    const d = store.state

    // ── Pass 1: determine best port pair for every connection ─────────────────
    type RouteInfo = {
      conn: Connection
      s1Id: string; s1Type: string; s1Pos: { x: number; y: number }; s1Size: { w: number; h: number }
      s2Id: string; s2Type: string; s2Pos: { x: number; y: number }; s2Size: { w: number; h: number }
      srcPort: string; tgtPort: string
    }
    const routes: RouteInfo[] = []

    for (const conn of d.connections) {
      if (!connRenderers.get(conn.id)) continue
      const srcEl = findElement(d, conn.source.elementId)
      const tgtEl = findElement(d, conn.target.elementId)
      if (!srcEl || !tgtEl) continue

      const srcSize = getRenderedSizeFor(conn.source.elementId, srcEl)
      const tgtSize = getRenderedSizeFor(conn.target.elementId, tgtEl)

      const s1Id = conn.source.elementId, s2Id = conn.target.elementId
      const s1Pos = srcEl.el.position, s2Pos = tgtEl.el.position
      const s1Size = srcSize, s2Size = tgtSize
      const s1Type = srcEl.type, s2Type = tgtEl.type

      const srcCfg = getElementConfig(s1Type)
      const tgtCfg = getElementConfig(s2Type)
      const srcSides = srcCfg?.ports.map(p => p.id as PortSide)
      const tgtSides = tgtCfg?.ports.map(p => p.id as PortSide)

      const best = bestPortPair(
        { x: s1Pos.x, y: s1Pos.y, w: s1Size.w, h: s1Size.h },
        { x: s2Pos.x, y: s2Pos.y, w: s2Size.w, h: s2Size.h },
        srcSides,
        tgtSides,
        conn.elbowMode ?? 'auto',
        conn.srcElbowMode ?? 'auto',
      )
      conn.source.port = best.src
      conn.target.port = best.tgt

      routes.push({ conn, s1Id, s1Type, s1Pos, s1Size, s2Id, s2Type, s2Pos, s2Size, srcPort: best.src, tgtPort: best.tgt })
    }

    // ── Pass 2: count connections per element-side to distribute fracs ────────
    // Key = elementId + '|' + side → array of route indices using that side on that element
    const sideMap = new Map<string, number[]>()
    for (let i = 0; i < routes.length; i++) {
      const { s1Id, srcPort, s2Id, tgtPort } = routes[i]
      const k1 = `${s1Id}|${srcPort}`
      const k2 = `${s2Id}|${tgtPort}`
      if (!sideMap.has(k1)) sideMap.set(k1, [])
      if (!sideMap.has(k2)) sideMap.set(k2, [])
      sideMap.get(k1)!.push(i)
      sideMap.get(k2)!.push(i)
    }

    // Assign fractional positions per side, sorted by the peer element's position
    // so slots are spatially ordered:
    //   e/w ports (horizontal exits) → sort peers top-to-bottom (by Y center)
    //   n/s ports (vertical exits)   → sort peers left-to-right (by X center)
    const srcFracs = new Float32Array(routes.length).fill(0.5)
    const tgtFracs = new Float32Array(routes.length).fill(0.5)
    for (const [key, indices] of sideMap) {
      const n = indices.length
      if (n <= 1) continue
      const [elId, side] = key.split('|')
      const horizontal = side === 'e' || side === 'w'

      // Sort indices by the *peer* element's center coordinate
      const sorted = [...indices].sort((a, b) => {
        const ra = routes[a], rb = routes[b]
        const peerA = ra.s1Id === elId ? ra.s2Pos : ra.s1Pos
        const sizeA = ra.s1Id === elId ? ra.s2Size : ra.s1Size
        const peerB = rb.s1Id === elId ? rb.s2Pos : rb.s1Pos
        const sizeB = rb.s1Id === elId ? rb.s2Size : rb.s1Size
        const centerA = horizontal ? peerA.y + sizeA.h / 2 : peerA.x + sizeA.w / 2
        const centerB = horizontal ? peerB.y + sizeB.h / 2 : peerB.x + sizeB.w / 2
        return centerA - centerB
      })

      for (let j = 0; j < n; j++) {
        const frac = (j + 1) / (n + 1)
        const routeIdx = sorted[j]
        if (routes[routeIdx].s1Id === elId) srcFracs[routeIdx] = frac
        else tgtFracs[routeIdx] = frac
      }
    }

    // ── Pass 3: render ────────────────────────────────────────────────────────
    for (let i = 0; i < routes.length; i++) {
      const { conn, s1Pos, s1Size, srcPort, s2Pos, s2Size, tgtPort } = routes[i]
      const r = connRenderers.get(conn.id)!

      const s = absolutePortPosition(s1Pos.x, s1Pos.y, s1Size.w, s1Size.h, srcPort, srcFracs[i])
      const t = absolutePortPosition(s2Pos.x, s2Pos.y, s2Size.w, s2Size.h, tgtPort, tgtFracs[i])
      const srcRect = { x: s1Pos.x, y: s1Pos.y, w: s1Size.w, h: s1Size.h }
      const tgtRect = { x: s2Pos.x, y: s2Pos.y, w: s2Size.w, h: s2Size.h }
      r.updatePoints(s.x, s.y, t.x, t.y, srcPort, tgtPort, conn, 0, srcRect, tgtRect)
    }

    // ── Pass 4: label deconfliction ───────────────────────────────────────────
    const LABEL_FONT_SIZE = 12
    const LABEL_H = LABEL_FONT_SIZE + 4
    const connLabelBoxes: LabelBox[] = []

    for (const conn of store.state.connections) {
      const r = connRenderers.get(conn.id)
      if (!r) continue
      const mid = r.getLabelMidpoint()
      if (!mid) continue
      const text = conn.label || getConnStereotype(conn.type)
      if (!text) continue
      connLabelBoxes.push({ id: conn.id, x: mid.x, y: mid.y, w: estimateTextWidth(text, LABEL_FONT_SIZE) + 4, h: LABEL_H })
    }

    if (connLabelBoxes.length > 1) {
      const results = deconflict([{ name: 'conn-labels', boxes: connLabelBoxes }])
      for (const [id, pos] of results) {
        connRenderers.get(id)?.setLabelPosition(pos.x, pos.y)
      }
    }
  }
}
