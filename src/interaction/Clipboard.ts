import type { DiagramStore } from '../store/DiagramStore.ts'
import type { SelectionManager } from './SelectionManager.ts'
import type { Connection } from '../entities/Connection.ts'
import type { UmlClass } from '../entities/UmlClass.ts'
import type { UmlPackage } from '../entities/Package.ts'
import type { Storage } from '../entities/Storage.ts'
import type { Actor } from '../entities/Actor.ts'
import type { Queue } from '../entities/Queue.ts'
import type { UseCase } from '../entities/UseCase.ts'
import type { UCSystem } from '../entities/UCSystem.ts'
import type { State } from '../entities/State.ts'
import type { StartState } from '../entities/StartState.ts'
import type { EndState } from '../entities/EndState.ts'
import type { SequenceDiagram } from '../entities/SequenceDiagram.ts'
import type { CombinedFragment } from '../entities/CombinedFragment.ts'
import type { Comment } from '../entities/Comment.ts'
import type { Diagram } from '../entities/Diagram.ts'
import type { ElementKind } from '../types.ts'

export type ClipboardEntry =
  | { kind: 'class';       data: UmlClass }
  | { kind: 'package';     data: UmlPackage }
  | { kind: 'storage';     data: Storage }
  | { kind: 'actor';       data: Actor }
  | { kind: 'queue';       data: Queue }
  | { kind: 'use-case';    data: UseCase }
  | { kind: 'uc-system';   data: UCSystem }
  | { kind: 'state';       data: State }
  | { kind: 'start-state'; data: StartState }
  | { kind: 'end-state';   data: EndState }
  | { kind: 'seq-diagram';  data: SequenceDiagram }
  | { kind: 'seq-fragment'; data: CombinedFragment }
  | { kind: 'comment';      data: Comment }

interface ElementDesc {
  kind: ElementKind
  collection: keyof Diagram
  renderers: Map<string, unknown>
  remove: (id: string) => void
  add: (el: any) => void
  addRenderer: (el: any) => void
}

export class Clipboard {
  private clipboard: ClipboardEntry[] = []
  private clipboardConnections: Connection[] = []
  private static PASTE_OFFSET = 20

  constructor(private deps: {
    store: DiagramStore
    selection: SelectionManager
    elements: ElementDesc[]
    onAfterCopy: () => void
  }) {}

  get hasContent(): boolean { return this.clipboard.length > 0 }

  copy(): void {
    const d = this.deps.store.state
    this.clipboard = []
    this.clipboardConnections = []
    const selectedIds = new Set(this.deps.selection.items.map(i => i.id))
    for (const item of this.deps.selection.items) {
      const desc = this.deps.elements.find(d => d.kind === item.kind)
      if (!desc) continue
      const items = (d[desc.collection] as Array<{ id: string }>) ?? []
      const el = items.find(e => e.id === item.id)
      if (el) this.clipboard.push({ kind: desc.kind, data: JSON.parse(JSON.stringify(el)) } as ClipboardEntry)
    }
    // Include connections where both endpoints are selected
    for (const conn of d.connections) {
      if (selectedIds.has(conn.source.elementId) && selectedIds.has(conn.target.elementId)) {
        this.clipboardConnections.push(JSON.parse(JSON.stringify(conn)))
      }
    }
    this.deps.onAfterCopy()
  }

  paste(): void {
    if (this.clipboard.length === 0) return
    this.deps.selection.clear()
    // Map old id → new id for remapping connections
    const idMap = new Map<string, string>()
    for (const entry of this.clipboard) {
      const newId = crypto.randomUUID()
      idMap.set(entry.data.id, newId)
      const pos = {
        x: entry.data.position.x + Clipboard.PASTE_OFFSET,
        y: entry.data.position.y + Clipboard.PASTE_OFFSET,
      }
      const desc = this.deps.elements.find(d => d.kind === entry.kind)
      if (desc) {
        // Remap pinnedTo if the pinned target was also copied
        const pinnedTo = (entry.data as { pinnedTo?: string }).pinnedTo
        const remappedPinnedTo = pinnedTo ? (idMap.get(pinnedTo) ?? null) : null
        const pinnedOffset = remappedPinnedTo ? (entry.data as { pinnedOffset?: unknown }).pinnedOffset : null
        const copy = { ...entry.data, id: newId, position: pos, ...(entry.kind === 'comment' ? { pinnedTo: remappedPinnedTo, pinnedOffset } : {}) }
        desc.add(copy)
        this.deps.selection.select({ kind: desc.kind, id: newId }, true)
      }
    }
    // Paste connections with remapped endpoints
    for (const conn of this.clipboardConnections) {
      const newSrc = idMap.get(conn.source.elementId)
      const newTgt = idMap.get(conn.target.elementId)
      if (newSrc && newTgt) {
        this.deps.store.addConnection({
          ...conn,
          id: crypto.randomUUID(),
          source: { ...conn.source, elementId: newSrc },
          target: { ...conn.target, elementId: newTgt },
        })
      }
    }
    // Shift clipboard so repeated pastes cascade rather than stack
    this.clipboard = this.clipboard.map(entry => ({
      ...entry,
      data: { ...entry.data, position: { x: entry.data.position.x + Clipboard.PASTE_OFFSET, y: entry.data.position.y + Clipboard.PASTE_OFFSET } },
    })) as typeof this.clipboard
  }
}
