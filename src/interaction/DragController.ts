import type { DiagramStore } from '../store/DiagramStore.ts'
import type { Selectable } from './SelectionManager.ts'
import type { ElementKind } from '../types.ts'
import { applySnap, type SnapRect } from './SnapEngine.ts'

interface DragTarget {
  kind: ElementKind
  id: string
  startX: number
  startY: number
}

export class DragController {
  private active: DragTarget[] = []
  private startMouseX = 0
  private startMouseY = 0

  constructor(
    private store: DiagramStore,
    private getSvgPoint: (e: MouseEvent) => DOMPoint,
    private getContainedElements: (pkgId: string) => Array<{ kind: ElementKind; id: string }> = () => [],
    private onGuides: (guides: import('./SnapEngine.ts').GuideLine[]) => void = () => {},
  ) {}

  /**
   * Start dragging. If `selection` is provided and the dragged element is
   * part of the selection, ALL selected (non-connection) items are dragged.
   * Otherwise only the single element is dragged.
   */
  startDrag(
    target: { kind: ElementKind; id: string },
    e: MouseEvent,
    selection: Selectable[] = [],
  ) {
    const pt = this.getSvgPoint(e)

    const inSelection = selection.some(s => s.id === target.id && s.kind === target.kind)
    const items: Array<{ kind: ElementKind; id: string }> = inSelection
      ? (selection.filter(s => s.kind !== 'connection') as Array<{ kind: ElementKind; id: string }>)
      : [target]

    const draggingPackageAlone = target.kind === 'package' &&
      (!inSelection || (inSelection && selection.filter(s => s.kind !== 'connection').length === 1))
    if (draggingPackageAlone) {
      const contained = this.getContainedElements(target.id)
      for (const c of contained) {
        if (!items.some(i => i.id === c.id && i.kind === c.kind)) {
          items.push(c)
        }
      }
    }

    this.active = []
    for (const item of items) {
      const el = this.store.findElementById(item.kind, item.id)
      if (el) {
        this.active.push({ kind: item.kind, id: item.id, startX: el.position.x, startY: el.position.y })
      }
    }

    this.startMouseX = pt.x
    this.startMouseY = pt.y
  }

  onMouseMove(e: MouseEvent) {
    if (this.active.length === 0) return
    const pt = this.getSvgPoint(e)
    const dx = pt.x - this.startMouseX
    const dy = pt.y - this.startMouseY

    // Collect dragged-element IDs for exclusion from snap candidates
    const draggedIds = new Set(this.active.map(t => t.id))

    // Only snap single-element drags (multi-drag moves as a unit; snapping one
    // while not moving the others would break their relative positions)
    if (this.active.length === 1) {
      const t = this.active[0]
      const el = this.store.findElementById(t.kind, t.id)
      if (el) {
        const proposed: SnapRect = {
          x: t.startX + dx,
          y: t.startY + dy,
          w: el.size.w,
          h: el.size.h,
        }

        // Gather all other element rects as snap candidates
        const candidates = this.getAllRects(draggedIds)
        const { x, y, guides } = applySnap(proposed, candidates)

        this.store.updateElementPosition(t.kind, t.id, { position: { x, y } })
        this.onGuides(guides)
        return
      }
    }

    // Multi-element drag — no snapping, clear guides
    for (const t of this.active) {
      this.store.updateElementPosition(t.kind, t.id, {
        position: { x: t.startX + dx, y: t.startY + dy },
      })
    }
    this.onGuides([])
  }

  onMouseUp() {
    this.active = []
    this.onGuides([])
  }

  get isDragging() { return this.active.length > 0 }

  /** Collect rects for all elements except those being dragged. */
  private getAllRects(excludeIds: Set<string>): SnapRect[] {
    const s = this.store.state
    const rects: SnapRect[] = []
    const push = (id: string, pos: { x: number; y: number }, size: { w: number; h: number }) => {
      if (!excludeIds.has(id)) rects.push({ x: pos.x, y: pos.y, w: size.w, h: size.h })
    }
    for (const c of s.classes)   push(c.id, c.position, c.size)
    for (const p of s.packages)  push(p.id, p.position, p.size)
    for (const st of s.storages) push(st.id, st.position, st.size)
    for (const a of s.actors)    push(a.id, a.position, a.size)
    for (const q of s.queues)    push(q.id, q.position, q.size)
    // seq-diagrams snap by their bounding box
    for (const sd of (s.sequenceDiagrams ?? [])) {
      if (!excludeIds.has(sd.id)) rects.push({ x: sd.position.x, y: sd.position.y, w: sd.size.w, h: sd.size.h })
    }
    return rects
  }
}
