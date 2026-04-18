import type { DiagramStore } from '../store/DiagramStore.ts'
import type { SelectionManager } from '../interaction/SelectionManager.ts'
import { showElementPropertiesPanel, hideElementPropertiesPanel } from './ElementPropertiesPanel.ts'
import {
  showBulkElementPanel, hideBulkElementPanel,
  showBulkConnectionPanel, hideBulkConnectionPanel,
  hideAllBulkPanels,
  type BulkConnectionItem,
} from './BulkPropertiesPanel.ts'
import { getElementConfig } from '../config/registry.ts'
import type { ElementKind } from '../types.ts'

export type PatchFn = (patch: { multiInstance?: boolean; flowReversed?: boolean; accentColor?: string | undefined }) => void

export class PropertiesOrchestrator {
  constructor(private deps: {
    store: DiagramStore
    selection: SelectionManager
    svg: SVGSVGElement
    updateFns: Partial<Record<ElementKind, (id: string) => PatchFn>>
  }) {}

  show(): void {
    const { store, selection, svg, updateFns } = this.deps
    const items = selection.items

    // ── Multi-selection: 2+ items ────────────────────────────────────────────
    if (items.length >= 2) {
      const allConnections = items.every(it => it.kind === 'connection')
      const noConnections  = items.every(it => it.kind !== 'connection')

      if (allConnections) {
        hideElementPropertiesPanel()
        hideBulkElementPanel()

        const connItems: BulkConnectionItem[] = []
        for (const item of items) {
          const conn = store.state.connections.find(c => c.id === item.id)
          if (!conn) continue
          const srcEl = store.findAnyElement(conn.source.elementId)
          const tgtEl = store.findAnyElement(conn.target.elementId)
          const srcConfig = getElementConfig(srcEl?.elementType ?? '')
          const tgtConfig = getElementConfig(tgtEl?.elementType ?? '')
          connItems.push({
            id: conn.id,
            type: conn.type,
            sourceMultiplicity: conn.sourceMultiplicity,
            targetMultiplicity: conn.targetMultiplicity,
            srcConfig,
            tgtConfig,
          })
        }

        if (connItems.length < 2) { hideBulkConnectionPanel(); return }

        const svgRect = svg.getBoundingClientRect()
        const screenX = svgRect.right - 20
        const screenY = svgRect.top + 80

        showBulkConnectionPanel(
          screenX, screenY, connItems,
          (type) => {
            store.beginUndoGroup()
            for (const c of connItems) store.updateConnection(c.id, { type })
            store.endUndoGroup()
          },
          (srcMult, tgtMult) => {
            store.beginUndoGroup()
            for (const c of connItems) store.updateConnection(c.id, { sourceMultiplicity: srcMult, targetMultiplicity: tgtMult })
            store.endUndoGroup()
          },
        )
        return
      }

      if (noConnections) {
        hideElementPropertiesPanel()
        hideBulkConnectionPanel()

        const elemItems: Array<{ id: string; kind: string; multiInstance: boolean; supportsProperties: boolean; accentColor?: string }> = []
        for (const item of items) {
          const found = store.findAnyElement(item.id) as (ReturnType<typeof store.findAnyElement> & { multiInstance?: boolean; accentColor?: string }) | undefined
          if (!found) continue
          const config = getElementConfig(found.elementType ?? item.kind)
          elemItems.push({
            id: item.id,
            kind: item.kind,
            multiInstance: (found as { multiInstance?: boolean }).multiInstance ?? false,
            supportsProperties: config?.supportsProperties ?? false,
            accentColor: found.accentColor,
          })
        }

        if (elemItems.length < 2) { hideBulkElementPanel(); return }

        const svgRect = svg.getBoundingClientRect()
        const screenX = svgRect.right - 20
        const screenY = svgRect.top + 80

        showBulkElementPanel(
          screenX, screenY, elemItems,
          (val) => {
            store.beginUndoGroup()
            for (const it of elemItems) {
              updateFns[it.kind as ElementKind]?.(it.id)?.({ multiInstance: val })
            }
            store.endUndoGroup()
          },
          (color) => {
            store.beginUndoGroup()
            for (const it of elemItems) {
              updateFns[it.kind as ElementKind]?.(it.id)?.({ accentColor: color })
            }
            store.endUndoGroup()
          },
        )
        return
      }

      // Mixed selection (elements + connections): hide all panels
      hideElementPropertiesPanel()
      hideAllBulkPanels()
      return
    }

    // ── Single selection ─────────────────────────────────────────────────────
    hideAllBulkPanels()
    if (items.length !== 1) { hideElementPropertiesPanel(); return }

    const item = items[0]

    const found = store.findAnyElement(item.id) as (ReturnType<typeof store.findAnyElement> & { multiInstance?: boolean; flowReversed?: boolean; accentColor?: string }) | undefined
    if (!found) { hideElementPropertiesPanel(); return }

    if (!getElementConfig(found.elementType ?? item.kind)?.supportsProperties) {
      hideElementPropertiesPanel(); return
    }

    const elPosition = found.position
    const elSize = found.size
    const multiInstance = 'multiInstance' in found ? (found.multiInstance ?? false) : undefined
    const flowReversed = found.flowReversed
    const accentColor = found.accentColor

    const updateFn = updateFns[item.kind as ElementKind]?.(item.id)
    if (!updateFn) { hideElementPropertiesPanel(); return }

    const d = store.state
    const svgRect = svg.getBoundingClientRect()
    const vp = d.viewport
    const screenX = svgRect.left + (elPosition.x + elSize.w) * vp.zoom + vp.x + 8
    const screenY = svgRect.top  + (elPosition.y + elSize.h / 2) * vp.zoom + vp.y

    const isQueue = item.kind === 'queue'
    showElementPropertiesPanel(
      screenX,
      screenY,
      multiInstance,
      (val) => updateFn({ multiInstance: val }),
      isQueue ? (flowReversed ?? false) : undefined,
      isQueue ? (reversed) => updateFn({ flowReversed: reversed }) : undefined,
      accentColor,
      (color) => updateFn({ accentColor: color }),
    )
  }
}
