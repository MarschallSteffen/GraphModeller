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
import type { SequenceLifeline } from '../entities/SequenceLifeline.ts'
import type { CombinedFragment } from '../entities/CombinedFragment.ts'
import type { Comment } from '../entities/Comment.ts'
import type { ElementKind } from '../types.ts'
import type { Point, Size } from '../entities/common.ts'
import { CollectionManager } from './CollectionManager.ts'

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

  // ── CollectionManagers ────────────────────────────────────────────────────

  private _classes:     CollectionManager<UmlClass>
  private _packages:    CollectionManager<UmlPackage>
  private _storages:    CollectionManager<Storage>
  private _actors:      CollectionManager<Actor>
  private _queues:      CollectionManager<Queue>
  private _useCases:    CollectionManager<UseCase>
  private _ucSystems:   CollectionManager<UCSystem>
  private _states:      CollectionManager<State>
  private _startStates: CollectionManager<StartState>
  private _endStates:   CollectionManager<EndState>
  private _seqDiagrams: CollectionManager<SequenceDiagram>
  private _fragments:   CollectionManager<CombinedFragment>
  private _comments:    CollectionManager<Comment>
  private _connections: CollectionManager<Connection>

  // Ordered list used to rebind all managers after a diagram swap.
  private readonly _allManagers: Array<{ mgr: CollectionManager<any>; field: keyof Diagram }>

  constructor(diagram?: Diagram) {
    this.diagram = diagram ?? createDiagram()
    this.ensureNewFields()

    const snap   = () => this.pushUndoSnapshot()
    const emit   = (type: string, payload: unknown) => this.emit(type as StoreEventType, payload)
    const isGroup = () => this._undoGroupActive
    const mgr = <T extends { id: string }>(items: T[], kind: string) =>
      new CollectionManager<T>(items, emit, snap, kind, isGroup)

    this._classes     = mgr(this.diagram.classes,           'class')
    this._packages    = mgr(this.diagram.packages,          'package')
    this._storages    = mgr(this.diagram.storages,          'storage')
    this._actors      = mgr(this.diagram.actors,            'actor')
    this._queues      = mgr(this.diagram.queues,            'queue')
    this._useCases    = mgr(this.diagram.useCases,          'use-case')
    this._ucSystems   = mgr(this.diagram.ucSystems,         'uc-system')
    this._states      = mgr(this.diagram.states,            'state')
    this._startStates = mgr(this.diagram.startStates,       'start-state')
    this._endStates   = mgr(this.diagram.endStates,         'end-state')
    this._seqDiagrams = mgr(this.diagram.sequenceDiagrams,  'seq-diagram')
    this._fragments   = mgr(this.diagram.combinedFragments, 'seq-fragment')
    this._comments    = mgr(this.diagram.comments,          'comment')
    this._connections = mgr(this.diagram.connections,       'connection')

    this._allManagers = [
      { mgr: this._classes,     field: 'classes' },
      { mgr: this._packages,    field: 'packages' },
      { mgr: this._storages,    field: 'storages' },
      { mgr: this._actors,      field: 'actors' },
      { mgr: this._queues,      field: 'queues' },
      { mgr: this._useCases,    field: 'useCases' },
      { mgr: this._ucSystems,   field: 'ucSystems' },
      { mgr: this._states,      field: 'states' },
      { mgr: this._startStates, field: 'startStates' },
      { mgr: this._endStates,   field: 'endStates' },
      { mgr: this._seqDiagrams, field: 'sequenceDiagrams' },
      { mgr: this._fragments,   field: 'combinedFragments' },
      { mgr: this._comments,    field: 'comments' },
      { mgr: this._connections, field: 'connections' },
    ]
  }

  private rebindManagers() {
    for (const { mgr, field } of this._allManagers) {
      mgr.replaceItems(this.diagram[field] as any[])
    }
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
    const snap = JSON.parse(JSON.stringify(this.diagram)) as Diagram
    this.undoStack.push(snap)
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift()
    this.redoStack = []
    this.emit('history:change')
  }

  undo() {
    const snapshot = this.undoStack.pop()
    if (!snapshot) return
    this.redoStack.push(JSON.parse(JSON.stringify(this.diagram)) as Diagram)
    const currentViewport = this.diagram.viewport
    this.diagram = snapshot
    this.diagram.viewport = currentViewport
    this.ensureNewFields()
    this.rebindManagers()
    this.emit('diagram:load', this.diagram)
    this.emit('history:change')
  }

  redo() {
    const snapshot = this.redoStack.pop()
    if (!snapshot) return
    this.undoStack.push(JSON.parse(JSON.stringify(this.diagram)) as Diagram)
    const currentViewport = this.diagram.viewport
    this.diagram = snapshot
    this.diagram.viewport = currentViewport
    this.ensureNewFields()
    this.rebindManagers()
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
      this.diagram.sequenceDiagrams, this.diagram.combinedFragments,
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

      // If we are moving a comment, update its own pinnedOffset
      if (kind === 'comment') {
        const c = el as unknown as Comment
        if (c.pinnedTo) {
          const target = this.findAnyElement(c.pinnedTo)
          if (target) {
            c.pinnedOffset = { x: patch.position.x - target.position.x, y: patch.position.y - target.position.y }
          }
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
    this._connections.replaceItems(this.diagram.connections)
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
    const COLUMN_GAP  = 80
    const ROW_GAP     = 60
    const START_X     = 100
    const START_Y     = 100
    const COMMENT_GAP = 20  // gap between pinned element right edge and comment

    const allEls = this.getAllElementsFlat()
    const toLayout = allEls.filter(el => (el as any)._needsLayout)
    if (toLayout.length === 0) return

    // Separate comments from regular elements — comments are placed after
    const comments    = toLayout.filter(el => (el as any).elementType === 'comment') as Array<typeof toLayout[number] & { pinnedTo?: string | null }>
    const regularEls  = toLayout.filter(el => (el as any).elementType !== 'comment')

    const idSet = new Set(regularEls.map(el => el.id))

    // Build adjacency: id → ids it points to (within the unlayouted set)
    const outgoing = new Map<string, Set<string>>()
    const inDegree  = new Map<string, number>()
    for (const el of regularEls) { outgoing.set(el.id, new Set()); inDegree.set(el.id, 0) }

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
    const queue = regularEls.filter(el => inDegree.get(el.id) === 0).map(el => el.id)
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
    for (const el of regularEls) {
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
    const maxLevel = Math.max(...Array.from(level.values()), 0)
    const byLevel: string[][] = Array.from({ length: maxLevel + 1 }, () => [])
    for (const id of sorted) byLevel[level.get(id)!].push(id)

    // Place regular elements column by column
    const elById = new Map(regularEls.map(el => [el.id, el]))
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

    // Place comments: to the right of pinned target, or in grid as fallback
    // Build a lookup covering all elements (including already-placed ones)
    const allById = new Map(this.getAllElementsFlat().map(el => [el.id, el]))
    let fallbackX = x, fallbackY = START_Y
    for (const c of comments) {
      const pinnedTo = (c as any).pinnedTo as string | null | undefined
      const target = pinnedTo ? allById.get(pinnedTo) : undefined
      if (target) {
        c.position = {
          x: target.position.x + target.size.w + COMMENT_GAP,
          y: target.position.y,
        }
        // Record offset from target
        ;(c as any).pinnedOffset = { x: c.position.x - target.position.x, y: c.position.y - target.position.y }
      } else {
        c.position = { x: fallbackX, y: fallbackY }
        fallbackY += c.size.h + ROW_GAP
      }
      ;(c as any)._needsLayout = false
    }
  }

  // ── Classes ──────────────────────────────────────────────────────────────

  addClass(cls: UmlClass)                                { this._classes.add(cls) }
  updateClass(id: string, patch: Partial<UmlClass>)      { this._classes.update(id, patch) }
  removeClass(id: string) {
    this._classes.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── Packages ─────────────────────────────────────────────────────────────

  addPackage(pkg: UmlPackage)                            { this._packages.add(pkg) }
  updatePackage(id: string, patch: Partial<UmlPackage>)  { this._packages.update(id, patch) }
  removePackage(id: string) {
    this._packages.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── Storages ─────────────────────────────────────────────────────────────

  addStorage(s: Storage)                                 { this._storages.add(s) }
  updateStorage(id: string, patch: Partial<Storage>)     { this._storages.update(id, patch) }
  removeStorage(id: string) {
    this._storages.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── Actors ───────────────────────────────────────────────────────────────

  addActor(a: Actor)                                     { this._actors.add(a) }
  updateActor(id: string, patch: Partial<Actor>)         { this._actors.update(id, patch) }
  removeActor(id: string) {
    this._actors.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── Queues ───────────────────────────────────────────────────────────────

  addQueue(q: Queue)                                     { this._queues.add(q) }
  updateQueue(id: string, patch: Partial<Queue>)         { this._queues.update(id, patch) }
  removeQueue(id: string) {
    this._queues.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── Connections ──────────────────────────────────────────────────────────

  addConnection(conn: Connection)                        { this._connections.add(conn) }
  updateConnection(id: string, patch: Partial<Connection>) { this._connections.update(id, patch) }
  removeConnection(id: string) {
    this._connections.remove(id)
  }

  // ── Viewport ─────────────────────────────────────────────────────────────

  updateViewport(patch: Partial<Diagram['viewport']>) {
    Object.assign(this.diagram.viewport, patch); this.emit('viewport:update', this.diagram.viewport)
  }

  // ── Diagram metadata ─────────────────────────────────────────────────────

  updateDiagramName(name: string) { this.diagram.name = name }

  // ── Use Cases ────────────────────────────────────────────────────────────

  addUseCase(uc: UseCase)                                { this._useCases.add(uc) }
  updateUseCase(id: string, patch: Partial<UseCase>)     { this._useCases.update(id, patch) }
  removeUseCase(id: string) {
    this._useCases.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── UC Systems ───────────────────────────────────────────────────────────

  addUCSystem(sys: UCSystem)                             { this._ucSystems.add(sys) }
  updateUCSystem(id: string, patch: Partial<UCSystem>)   { this._ucSystems.update(id, patch) }
  removeUCSystem(id: string) {
    this._ucSystems.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── States ───────────────────────────────────────────────────────────────

  addState(s: State)                                     { this._states.add(s) }
  updateState(id: string, patch: Partial<State>)         { this._states.update(id, patch) }
  removeState(id: string) {
    this._states.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── Start States ─────────────────────────────────────────────────────────

  addStartState(s: StartState)                           { this._startStates.add(s) }
  updateStartState(id: string, patch: Partial<StartState>) { this._startStates.update(id, patch) }
  removeStartState(id: string) {
    this._startStates.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── End States ───────────────────────────────────────────────────────────

  addEndState(s: EndState)                               { this._endStates.add(s) }
  updateEndState(id: string, patch: Partial<EndState>)   { this._endStates.update(id, patch) }
  removeEndState(id: string) {
    this._endStates.remove(id)
    this.cleanupConnectionsForElement(id); this.cleanupPinsForElement(id)
  }

  // ── Sequence Diagrams ────────────────────────────────────────────────────

  addSequenceDiagram(sd: SequenceDiagram)                { this._seqDiagrams.add(sd) }
  updateSequenceDiagram(id: string, patch: Partial<SequenceDiagram>) {
    this._seqDiagrams.update(id, patch, /* respectUndoGroup */ true)
  }
  updateLifeline(sdId: string, llId: string, patch: Partial<SequenceLifeline>) {
    const sd = this.diagram.sequenceDiagrams.find(s => s.id === sdId)
    if (!sd) return
    if (!this._undoGroupActive) this.pushUndoSnapshot()
    sd.lifelines = sd.lifelines.map(l => l.id === llId ? { ...l, ...patch } : l)
    this.emit('seq-diagram:update', sd)
  }
  removeSequenceDiagram(id: string) {
    this._seqDiagrams.remove(id)
    this.cleanupPinsForElement(id)
  }

  // ── Combined Fragments ───────────────────────────────────────────────────

  addCombinedFragment(frag: CombinedFragment)            { this._fragments.add(frag) }
  updateCombinedFragment(id: string, patch: Partial<CombinedFragment>) { this._fragments.update(id, patch) }
  removeCombinedFragment(id: string) {
    this._fragments.remove(id)
    this.cleanupPinsForElement(id)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  addComment(c: Comment)                                 { this._comments.add(c) }
  updateComment(id: string, patch: Partial<Comment>, respectUndoGroup = false): void {
    this._comments.update(id, patch, respectUndoGroup)
  }
  removeComment(id: string) {
    this._comments.remove(id)
  }

  // ── Load ─────────────────────────────────────────────────────────────────

  load(diagram: Diagram) {
    this.diagram = diagram
    this.ensureNewFields()
    this.rebindManagers()
    this.emit('diagram:load', diagram)
  }
}
