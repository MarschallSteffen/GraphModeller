import type { DiagramStore } from '../store/DiagramStore.ts'
import type { ConnectionType, Connection, ElbowMode } from '../entities/Connection.ts'
import { createConnection } from '../entities/Connection.ts'
import type { PortSide } from '../entities/Connection.ts'
import { absolutePortPosition } from '../renderers/ports.ts'
import { bestPortPair } from '../renderers/routing.ts'
import type { PortSide as RoutePortSide } from '../renderers/routing.ts'
import type { ElementConfig } from '../config/ElementConfig.ts'
import { getElementConfig } from '../config/registry.ts'
import { defaultConnectionType } from '../ui/ConnectionPopover.ts'
import { svgEl } from '../renderers/svgUtils.ts'

interface PortRef {
  elementId: string
  elementType: string
  port: PortSide
  x: number
  y: number
}

interface AnyElement {
  id: string
  position: { x: number; y: number }
  size: { w: number; h: number }
  elementType?: string
}

export class ConnectionController {
  private ghostLine: SVGLineElement | null = null
  private sourcePort: PortRef | null = null

  constructor(
    private store: DiagramStore,
    private svg: SVGSVGElement,
    private ghostContainer: SVGElement,
    private getSvgPoint: (e: MouseEvent) => DOMPoint,
    private showConnectionPopover: (
      x: number,
      y: number,
      onConfirm: (type: ConnectionType, srcMult: string, tgtMult: string) => void,
      onCancel: () => void,
      srcConfig?: ElementConfig,
      tgtConfig?: ElementConfig,
      onFlip?: () => void,
      current?: { type: ConnectionType; srcMult: string; tgtMult: string },
      onElbowChange?: (mode: ElbowMode) => void,
    ) => void,
  ) {}

  startConnection(element: AnyElement, port: string, _e: MouseEvent): void {
    const abs = absolutePortPosition(element.position.x, element.position.y, element.size.w, element.size.h, port)
    this.sourcePort = {
      elementId: element.id,
      elementType: element.elementType ?? 'uml-class',
      port: port as PortSide,
      x: abs.x,
      y: abs.y,
    }

    const line = svgEl('line')
    line.classList.add('ghost-line')
    line.setAttribute('x1', String(abs.x))
    line.setAttribute('y1', String(abs.y))
    line.setAttribute('x2', String(abs.x))
    line.setAttribute('y2', String(abs.y))
    this.ghostContainer.appendChild(line)
    this.ghostLine = line
  }

  onMouseMove(e: MouseEvent) {
    if (!this.ghostLine || !this.sourcePort) return
    const pt = this.getSvgPoint(e)
    this.ghostLine.setAttribute('x2', String(pt.x))
    this.ghostLine.setAttribute('y2', String(pt.y))
  }

  onMouseUp(_e: MouseEvent, targetElementId: string | null, targetPort: string | null, targetElementType?: string) {
    this.cleanupGhost()
    if (!this.sourcePort) return

    const src = this.sourcePort
    this.sourcePort = null

    if (!targetElementId || targetElementId === src.elementId) return

    const diagram = this.store.state
    const tgtEl = this.store.findAnyElement(targetElementId)
    if (!tgtEl) return

    const tgtType = targetElementType ?? tgtEl.elementType ?? 'uml-class'

    // Find source element to get its rect for bestPortPair
    const srcEl = this.store.findAnyElement(src.elementId)

    // If dropped on element body (no specific port), pick best port pair
    let resolvedSrcPort = src.port as string
    let resolvedTgtPort = targetPort

    if (!resolvedTgtPort && srcEl) {
      const srcCfg = getElementConfig(src.elementType)
      const tgtCfg = getElementConfig(tgtType)
      const srcSides = srcCfg?.ports.map(p => p.id as RoutePortSide)
      const tgtSides = tgtCfg?.ports.map(p => p.id as RoutePortSide)
      const best = bestPortPair(
        { x: srcEl.position.x, y: srcEl.position.y, w: srcEl.size.w, h: srcEl.size.h },
        { x: tgtEl.position.x, y: tgtEl.position.y, w: tgtEl.size.w, h: tgtEl.size.h },
        srcSides,
        tgtSides,
      )
      resolvedSrcPort = best.src
      resolvedTgtPort = best.tgt
    }

    if (!resolvedTgtPort) return

    const srcConfig = getElementConfig(src.elementType)
    const tgtConfig = getElementConfig(tgtType)

    // Block connection if either element disallows all connection types
    const defaultType = defaultConnectionType(srcConfig, tgtConfig)
    if (!defaultType) return

    // Compute midpoint for popover position
    const srcAbsEl = srcEl ?? tgtEl
    const tgtAbs = absolutePortPosition(tgtEl.position.x, tgtEl.position.y, tgtEl.size.w, tgtEl.size.h, resolvedTgtPort)
    const srcAbs = absolutePortPosition(srcAbsEl.position.x, srcAbsEl.position.y, srcAbsEl.size.w, srcAbsEl.size.h, resolvedSrcPort)
    const midX = (srcAbs.x + tgtAbs.x) / 2
    const midY = (srcAbs.y + tgtAbs.y) / 2

    const svgRect = this.svg.getBoundingClientRect()
    const vp = diagram.viewport
    const screenX = svgRect.left + (midX * vp.zoom + vp.x)
    const screenY = svgRect.top  + (midY * vp.zoom + vp.y)

    // Create connection immediately with defaults
    const conn = createConnection(
      { elementId: src.elementId, port: resolvedSrcPort as PortSide },
      { elementId: targetElementId, port: resolvedTgtPort as PortSide },
      defaultType,
    )
    this.store.addConnection(conn)

    // Show optional popover to modify connection settings
    this.showConnectionPopover(
      screenX,
      screenY,
      (type, srcMult, tgtMult) => {
        this.store.updateConnection(conn.id, {
          type,
          sourceMultiplicity: srcMult as Connection['sourceMultiplicity'],
          targetMultiplicity: tgtMult as Connection['targetMultiplicity'],
        })
      },
      () => {},
      srcConfig,
      tgtConfig,
      () => {
        this.store.updateConnection(conn.id, { source: { ...conn.target }, target: { ...conn.source } })
      },
      { type: defaultType, srcMult: '', tgtMult: '' },
      (mode: ElbowMode) => {
        this.store.updateConnection(conn.id, { elbowMode: mode })
      },
    )
  }

  cancel() {
    this.cleanupGhost()
    this.sourcePort = null
  }

  get isConnecting() { return this.sourcePort !== null }

  private cleanupGhost() {
    this.ghostLine?.remove()
    this.ghostLine = null
  }
}
