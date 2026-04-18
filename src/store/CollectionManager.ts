/**
 * Generic CRUD manager for a homogeneous array of diagram entities.
 *
 * Encapsulates the repetitive add/update/remove/findById pattern used by every
 * element type in DiagramStore, including undo-snapshot coordination and event
 * emission.
 */
export class CollectionManager<T extends { id: string }> {
  constructor(
    private items: T[],
    private emitFn: (event: string, payload: unknown) => void,
    private pushUndoSnapshot: () => void,
    private kind: string,
    private undoGroupActive: () => boolean,
  ) {}

  // ── Public API ────────────────────────────────────────────────────────────

  add(item: T): void {
    this.pushUndoSnapshot()
    this.items.push(item)
    this.emitFn(`${this.kind}:add`, item)
  }

  /**
   * Merge `patch` into the item with the given id and emit an update event.
   * Pass `respectUndoGroup = true` to skip the snapshot when an undo group is
   * already active, coalescing continuous gestures into a single undo step.
   */
  update(id: string, patch: Partial<T>, respectUndoGroup = false): void {
    const el = this.items.find(item => item.id === id)
    if (!el) return
    if (respectUndoGroup) {
      if (!this.undoGroupActive()) this.pushUndoSnapshot()
    } else {
      this.pushUndoSnapshot()
    }
    Object.assign(el, patch)
    this.emitFn(`${this.kind}:update`, el)
  }

  remove(id: string): void {
    const idx = this.items.findIndex(item => item.id === id)
    if (idx === -1) return
    this.pushUndoSnapshot()
    this.items.splice(idx, 1)
    this.emitFn(`${this.kind}:remove`, id)
  }

  findById(id: string): T | undefined {
    return this.items.find(item => item.id === id)
  }

  getAll(): T[] {
    return this.items
  }

  /**
   * Replace the backing array reference.  Called whenever DiagramStore swaps
   * out the whole diagram (load / undo / redo) so the manager always points at
   * the live array.
   */
  replaceItems(items: T[]): void {
    this.items = items
  }
}
