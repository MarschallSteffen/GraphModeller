import { createDiagram } from '../entities/Diagram.ts'
import type { Diagram } from '../entities/Diagram.ts'
import type { UmlClass } from '../entities/UmlClass.ts'
import type { UmlPackage } from '../entities/Package.ts'
import type { Connection } from '../entities/Connection.ts'
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
import type { ElementKind } from '../types.ts'
import type { Point, Size } from '../entities/common.ts'

const KIND_TO_COLLECTION: Partial<Record<ElementKind, keyof Diagram>> = {
  'class':        'classes',
  'package':      'packages',
  'storage':      'storages',
  'actor':        'actors',
  'queue':        'queues',
  'use-case':     'useCases',
  'uc-system':    'ucSystems',
  'state':        'states',
  'start-state':  'startStates',
  'end-state':    'endStates',
  'seq-diagram':  'sequenceDiagrams',
  'seq-fragment': 'combinedFragments',
  'comment':      'comments',
}

export type StoreEventType =
  | 'class:add' | 'class:update' | 'class:remove'
  | 'package:add' | 'package:update' | 'package:remove'
  | 'storage:add' | 'storage:update' | 'storage:remove'
  | 'actor:add' | 'actor:update' | 'actor:remove'
  | 'queue:add' | 'queue:update' | 'queue:remove'
  | 'use-case:add' | 'use-case:update' | 'use-case:remove'
  | 'uc-system:add' | 'uc-system:update' | 'uc-system:remove'
  | 'state:add' | 'state:update' | 'state:remove'
  | 'start-state:add' | 'start-state:update' | 'start-state:remove'
  | 'end-state:add' | 'end-state:update' | 'end-state:remove'
  | 'seq-diagram:add' | 'seq-diagram:update' | 'seq-diagram:remove'
  | 'seq-fragment:add' | 'seq-fragment:update' | 'seq-fragment:remove'
  | 'comment:add' | 'comment:update' | 'comment:remove'
  | 'connection:add' | 'connection:update' | 'connection:remove'
  | 'viewport:update' | 'diagram:load' | 'history:change'

export interface StoreEvent {
  type: StoreEventType
  payload?: unknown
}

type Listener = (event: StoreEvent) => void

const MAX_UNDO = 100

export class DiagramStore {
  private diagram: Diagram
  private listeners: Listener[] = []
  private undoStack: Diagram[] = []
  private redoStack: Diagram[] = []
  private _undoGroupActive = false

  constructor(diagram?: Diagram) {
    this.diagram = diagram ?? createDiagram()
    this.ensureNewFields()
  }

  // ── Undo / Redo ──────────────────────────────────────────────────────────

  /** Call before a continuous gesture (drag/resize) to coalesce into one undo step. */
  beginUndoGroup() {
    if (!this._undoGroupActive) {
      this.pushUndoSnapshot()
      this._undoGroupActive = true
    }
  }

  /** Call when the gesture ends to allow next mutation to start a fresh step. */
  endUndoGroup() {
    this._undoGroupActive = false
  }

  /** Temporarily re-open the undo group so the next mutation shares the last snapshot. */
  extendUndoGroup() {
    this._undoGroupActive = true
  }

  get isUndoGroupActive() { return this._undoGroupActive }

  private pushUndoSnapshot() {
    this.undoStack.push(JSON.parse(JSON.stringify(this.diagram)) as Diagram)
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift()
    this.redoStack = []
    this.emit('history:change')
  }

  undo() {
    const snapshot = this.undoStack.pop()
    if (!snapshot) return
    this.redoStack.push(JSON.parse(JSON.stringify(this.diagram)) as Diagram)
    this.diagram = snapshot
    this.ensureNewFields()
    this.emit('diagram:load', this.diagram)
    this.emit('history:change')
  }

  redo() {
    const snapshot = this.redoStack.pop()
    if (!snapshot) return
    this.undoStack.push(JSON.parse(JSON.stringify(this.diagram)) as Diagram)
    this.diagram = snapshot
    this.ensureNewFields()
    this.emit('diagram:load', this.diagram)
    this.emit('history:change')
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

  get state(): Readonly<Diagram> {
    return this.diagram
  }

  on(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter(l => l !== listener) }
  }

  findElementById(kind: ElementKind, id: string): { position: Point; size: Size } | undefined {
    const col = KIND_TO_COLLECTION[kind]
    if (!col) return undefined
    return (this.diagram[col] as Array<{ id: string; position: Point; size: Size }>)?.find(e => e.id === id)
  }

  /** Search all collections for an element by id (kind-agnostic). */
  findAnyElement(id: string): { id: string; position: Point; size: Size; elementType?: string } | undefined {
    const collections: Array<{ id: string; position: Point; size: Size; elementType?: string }[]> = [
      this.diagram.classes, this.diagram.packages, this.diagram.storages,
      this.diagram.actors, this.diagram.queues, this.diagram.useCases,
      this.diagram.ucSystems, this.diagram.states, this.diagram.startStates,
      this.diagram.endStates, this.diagram.comments,
    ]
    for (const col of collections) {
      const el = col?.find(e => e.id === id)
      if (el) return el
    }
    return undefined
  }

  updateElementPosition(kind: ElementKind, id: string, patch: { position: Point; size?: Size }): void {
    const col = KIND_TO_COLLECTION[kind]
    if (!col) return
    const el = (this.diagram[col] as Array<{ id: string; position: Point; size: Size }>)?.find(e => e.id === id)
    if (!el) return
    if (!this._undoGroupActive) this.pushUndoSnapshot()
    Object.assign(el, patch)
    this.emit(`${kind}:update` as StoreEventType, el)

    // Move any comments pinned to this element
    if (patch.position) {
      for (const c of this.diagram.comments) {
        if (c.pinnedTo === id && c.pinnedOffset) {
          c.position = { x: patch.position.x + c.pinnedOffset.x, y: patch.position.y + c.pinnedOffset.y }
          this.emit('comment:update', c)
        }
      }
    }
  }

  private emit(type: StoreEventType, payload?: unknown) {
    const event: StoreEvent = { type, payload }
    this.listeners.forEach(l => l(event))
  }

  /** Remove connections that reference the given element id, emitting per-connection remove events. */
  private cleanupConnectionsForElement(id: string) {
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
  }

  /** Clear pinnedTo on any comment pinned to the given element id, emitting comment:update for each. */
  private cleanupPinsForElement(id: string) {
    for (const c of this.diagram.comments) {
      if (c.pinnedTo === id) {
        c.pinnedTo = null
        c.pinnedOffset = null
        this.emit('comment:update', c)
      }
    }
  }

  /** Ensure arrays exist and run auto-layout for elements without explicit positions. */
  private ensureNewFields() {
    if (!this.diagram.actors)    this.diagram.actors    = []
    if (!this.diagram.queues)    this.diagram.queues    = []
    if (!this.diagram.useCases)  this.diagram.useCases  = []
    if (!this.diagram.ucSystems) this.diagram.ucSystems = []
    if (!this.diagram.states)      this.diagram.states      = []
    if (!this.diagram.startStates) this.diagram.startStates = []
    if (!this.diagram.endStates)   this.diagram.endStates   = []
    if (!this.diagram.sequenceDiagrams) this.diagram.sequenceDiagrams = []
    if (!this.diagram.combinedFragments) this.diagram.combinedFragments = []
    if (!this.diagram.comments) this.diagram.comments = []

    if (this.getAllElementsFlat().some(el => (el as any)._needsLayout)) {
      this.applyAutoLayout()
    }
  }

  private getAllElementsFlat(): Array<{ id: string; position: Point; size: Size }> {
    return [
      ...this.diagram.classes,
      ...this.diagram.packages,
      ...this.diagram.storages,
      ...this.diagram.actors,
      ...this.diagram.queues,
      ...this.diagram.useCases,
      ...this.diagram.ucSystems,
      ...this.diagram.states,
      ...this.diagram.startStates,
      ...this.diagram.endStates,
      ...this.diagram.sequenceDiagrams,
      ...this.diagram.combinedFragments,
      ...this.diagram.comments,
    ]
  }

  private applyAutoLayout() {
    const COLUMN_GAP = 80
    const ROW_GAP    = 60
    const START_X    = 100
    const START_Y    = 100

    const allEls = this.getAllElementsFlat()
    const toLayout = allEls.filter(el => (el as any)._needsLayout)
    if (toLayout.length === 0) return

    const idSet = new Set(toLayout.map(el => el.id))

    // Build adjacency: id → ids it points to (within the unlayouted set)
    const outgoing = new Map<string, Set<string>>()
    const inDegree  = new Map<string, number>()
    for (const el of toLayout) { outgoing.set(el.id, new Set()); inDegree.set(el.id, 0) }

    for (const conn of this.diagram.connections) {
      const src = conn.source.elementId
      const tgt = conn.target.elementId
      if (idSet.has(src) && idSet.has(tgt) && src !== tgt) {
        outgoing.get(src)!.add(tgt)
        inDegree.set(tgt, (inDegree.get(tgt) ?? 0) + 1)
      }
    }

    // Kahn's topological sort
    const sorted: string[] = []
    const queue = toLayout.filter(el => inDegree.get(el.id) === 0).map(el => el.id)
    while (queue.length) {
      const id = queue.shift()!
      sorted.push(id)
      for (const next of outgoing.get(id) ?? []) {
        const d = (inDegree.get(next) ?? 0) - 1
        inDegree.set(next, d)
        if (d === 0) queue.push(next)
      }
    }
    // Cycle fallback: append any remaining nodes in insertion order
    for (const el of toLayout) {
      if (!sorted.includes(el.id)) sorted.push(el.id)
    }

    // Assign levels via BFS
    const level = new Map<string, number>()
    for (const id of sorted) {
      let maxPredLevel = -1
      for (const [predId, targets] of outgoing) {
        if (targets.has(id)) {
          maxPredLevel = Math.max(maxPredLevel, level.get(predId) ?? 0)
        }
      }
      level.set(id, maxPredLevel + 1)
    }

    // Group by level
    const maxLevel = Math.max(...Array.from(level.values()))
    const byLevel: string[][] = Array.from({ length: maxLevel + 1 }, () => [])
    for (const id of sorted) byLevel[level.get(id)!].push(id)

    // Place elements column by column
    const elById = new Map(toLayout.map(el => [el.id, el]))
    let x = START_X
    for (const col of byLevel) {
      let maxW = 0
      let y = START_Y
      for (const id of col) {
        const el = elById.get(id)!
        el.position = { x, y }
        ;(el as any)._needsLayout = false
        y += el.size.h + ROW_GAP
        maxW = Math.max(maxW, el.size.w)
      }
      x += maxW + COLUMN_GAP
    }
  }

  // ── Classes ──────────────────────────────────────────────────────────────

  addClass(cls: UmlClass)                      { this.pushUndoSnapshot(); this.diagram.classes.push(cls); this.emit('class:add', cls) }
  updateClass(id: string, patch: Partial<UmlClass>) {
    const el = this.diagram.classes.find(c => c.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('class:update', el)
  }
  removeClass(id: string) {
    this.pushUndoSnapshot()
    this.diagram.classes = this.diagram.classes.filter(c => c.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('class:remove', id)
  }

  // ── Packages ─────────────────────────────────────────────────────────────

  addPackage(pkg: UmlPackage)                  { this.pushUndoSnapshot(); this.diagram.packages.push(pkg); this.emit('package:add', pkg) }
  updatePackage(id: string, patch: Partial<UmlPackage>) {
    const el = this.diagram.packages.find(p => p.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('package:update', el)
  }
  removePackage(id: string) {
    this.pushUndoSnapshot()
    this.diagram.packages = this.diagram.packages.filter(p => p.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('package:remove', id)
  }

  // ── Storages ─────────────────────────────────────────────────────────────

  addStorage(s: Storage)                       { this.pushUndoSnapshot(); this.diagram.storages.push(s); this.emit('storage:add', s) }
  updateStorage(id: string, patch: Partial<Storage>) {
    const el = this.diagram.storages.find(s => s.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('storage:update', el)
  }
  removeStorage(id: string) {
    this.pushUndoSnapshot()
    this.diagram.storages = this.diagram.storages.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('storage:remove', id)
  }

  // ── Actors ───────────────────────────────────────────────────────────────

  addActor(a: Actor)                           { this.pushUndoSnapshot(); this.diagram.actors.push(a); this.emit('actor:add', a) }
  updateActor(id: string, patch: Partial<Actor>) {
    const el = this.diagram.actors.find(a => a.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('actor:update', el)
  }
  removeActor(id: string) {
    this.pushUndoSnapshot()
    this.diagram.actors = this.diagram.actors.filter(a => a.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('actor:remove', id)
  }

  // ── Queues ───────────────────────────────────────────────────────────────

  addQueue(q: Queue)                           { this.pushUndoSnapshot(); this.diagram.queues.push(q); this.emit('queue:add', q) }
  updateQueue(id: string, patch: Partial<Queue>) {
    const el = this.diagram.queues.find(q => q.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('queue:update', el)
  }
  removeQueue(id: string) {
    this.pushUndoSnapshot()
    this.diagram.queues = this.diagram.queues.filter(q => q.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('queue:remove', id)
  }

  // ── Connections ──────────────────────────────────────────────────────────

  addConnection(conn: Connection)              { this.pushUndoSnapshot(); this.diagram.connections.push(conn); this.emit('connection:add', conn) }
  updateConnection(id: string, patch: Partial<Connection>) {
    const el = this.diagram.connections.find(c => c.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('connection:update', el)
  }
  removeConnection(id: string) {
    this.pushUndoSnapshot()
    this.diagram.connections = this.diagram.connections.filter(c => c.id !== id)
    this.emit('connection:remove', id)
  }

  // ── Viewport ─────────────────────────────────────────────────────────────

  updateViewport(patch: Partial<Diagram['viewport']>) {
    Object.assign(this.diagram.viewport, patch); this.emit('viewport:update', this.diagram.viewport)
  }

  // ── Diagram metadata ─────────────────────────────────────────────────────

  updateDiagramName(name: string) { this.diagram.name = name }

  // ── Use Cases ────────────────────────────────────────────────────────────

  addUseCase(uc: UseCase)                      { this.pushUndoSnapshot(); this.diagram.useCases.push(uc); this.emit('use-case:add', uc) }
  updateUseCase(id: string, patch: Partial<UseCase>) {
    const el = this.diagram.useCases.find(u => u.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('use-case:update', el)
  }
  removeUseCase(id: string) {
    this.pushUndoSnapshot()
    this.diagram.useCases = this.diagram.useCases.filter(u => u.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('use-case:remove', id)
  }

  // ── UC Systems ───────────────────────────────────────────────────────────

  addUCSystem(sys: UCSystem)                   { this.pushUndoSnapshot(); this.diagram.ucSystems.push(sys); this.emit('uc-system:add', sys) }
  updateUCSystem(id: string, patch: Partial<UCSystem>) {
    const el = this.diagram.ucSystems.find(u => u.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('uc-system:update', el)
  }
  removeUCSystem(id: string) {
    this.pushUndoSnapshot()
    this.diagram.ucSystems = this.diagram.ucSystems.filter(u => u.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('uc-system:remove', id)
  }

  // ── States ───────────────────────────────────────────────────────────────

  addState(s: State)                           { this.pushUndoSnapshot(); this.diagram.states.push(s); this.emit('state:add', s) }
  updateState(id: string, patch: Partial<State>) {
    const el = this.diagram.states.find(s => s.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('state:update', el)
  }
  removeState(id: string) {
    this.pushUndoSnapshot()
    this.diagram.states = this.diagram.states.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('state:remove', id)
  }

  // ── Start States ─────────────────────────────────────────────────────────

  addStartState(s: StartState)                 { this.pushUndoSnapshot(); this.diagram.startStates.push(s); this.emit('start-state:add', s) }
  updateStartState(id: string, patch: Partial<StartState>) {
    const el = this.diagram.startStates.find(s => s.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('start-state:update', el)
  }
  removeStartState(id: string) {
    this.pushUndoSnapshot()
    this.diagram.startStates = this.diagram.startStates.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('start-state:remove', id)
  }

  // ── End States ───────────────────────────────────────────────────────────

  addEndState(s: EndState)                     { this.pushUndoSnapshot(); this.diagram.endStates.push(s); this.emit('end-state:add', s) }
  updateEndState(id: string, patch: Partial<EndState>) {
    const el = this.diagram.endStates.find(s => s.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('end-state:update', el)
  }
  removeEndState(id: string) {
    this.pushUndoSnapshot()
    this.diagram.endStates = this.diagram.endStates.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id); this.emit('end-state:remove', id)
  }

  // ── Sequence Diagrams ────────────────────────────────────────────────────

  addSequenceDiagram(sd: SequenceDiagram)      { this.pushUndoSnapshot(); this.diagram.sequenceDiagrams.push(sd); this.emit('seq-diagram:add', sd) }
  updateSequenceDiagram(id: string, patch: Partial<SequenceDiagram>) {
    const el = this.diagram.sequenceDiagrams.find(s => s.id === id); if (!el) return
    if (!this._undoGroupActive) this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('seq-diagram:update', el)
  }
  removeSequenceDiagram(id: string) {
    this.pushUndoSnapshot()
    this.diagram.sequenceDiagrams = this.diagram.sequenceDiagrams.filter(s => s.id !== id)
    this.cleanupPinsForElement(id); this.emit('seq-diagram:remove', id)
  }

  // ── Combined Fragments ───────────────────────────────────────────────────

  addCombinedFragment(frag: CombinedFragment)  { this.pushUndoSnapshot(); this.diagram.combinedFragments.push(frag); this.emit('seq-fragment:add', frag) }
  updateCombinedFragment(id: string, patch: Partial<CombinedFragment>) {
    const el = this.diagram.combinedFragments.find(f => f.id === id); if (!el) return
    this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('seq-fragment:update', el)
  }
  removeCombinedFragment(id: string) {
    this.pushUndoSnapshot()
    this.diagram.combinedFragments = this.diagram.combinedFragments.filter(f => f.id !== id)
    this.cleanupPinsForElement(id); this.emit('seq-fragment:remove', id)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  addComment(c: Comment)                       { this.pushUndoSnapshot(); this.diagram.comments.push(c); this.emit('comment:add', c) }
  updateComment(id: string, patch: Partial<Comment>) {
    const el = this.diagram.comments.find(c => c.id === id); if (!el) return
    if (!this._undoGroupActive) this.pushUndoSnapshot(); Object.assign(el, patch); this.emit('comment:update', el)
  }
  removeComment(id: string) {
    this.pushUndoSnapshot()
    this.diagram.comments = this.diagram.comments.filter(c => c.id !== id)
    this.emit('comment:remove', id)
  }

  // ── Load ─────────────────────────────────────────────────────────────────

  load(diagram: Diagram) {
    this.diagram = diagram
    this.ensureNewFields()
    this.emit('diagram:load', diagram)
  }
}
