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
import type { ElementKind } from '../types.ts'
import type { Point, Size } from '../entities/common.ts'

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
  | 'connection:add' | 'connection:update' | 'connection:remove'
  | 'viewport:update' | 'diagram:load'

export interface StoreEvent {
  type: StoreEventType
  payload?: unknown
}

type Listener = (event: StoreEvent) => void

export class DiagramStore {
  private diagram: Diagram
  private listeners: Listener[] = []

  constructor(diagram?: Diagram) {
    this.diagram = diagram ?? createDiagram()
    this.ensureNewFields()
  }

  get state(): Readonly<Diagram> {
    return this.diagram
  }

  on(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter(l => l !== listener) }
  }

  findElementById(kind: ElementKind, id: string): { position: Point; size: Size } | undefined {
    switch (kind) {
      case 'class':       return this.diagram.classes.find(c => c.id === id)
      case 'package':     return this.diagram.packages.find(p => p.id === id)
      case 'storage':     return this.diagram.storages.find(s => s.id === id)
      case 'actor':       return this.diagram.actors.find(a => a.id === id)
      case 'queue':       return this.diagram.queues.find(q => q.id === id)
      case 'use-case':    return this.diagram.useCases.find(u => u.id === id)
      case 'uc-system':   return this.diagram.ucSystems.find(u => u.id === id)
      case 'state':       return this.diagram.states.find(s => s.id === id)
      case 'start-state': return this.diagram.startStates.find(s => s.id === id)
      case 'end-state':   return this.diagram.endStates.find(s => s.id === id)
      case 'seq-diagram': return this.diagram.sequenceDiagrams.find(sd => sd.id === id)
      case 'seq-fragment': return this.diagram.combinedFragments.find(f => f.id === id)
    }
  }

  updateElementPosition(kind: ElementKind, id: string, patch: { position: Point; size?: Size }): void {
    switch (kind) {
      case 'class':       this.updateClass(id, patch); break
      case 'package':     this.updatePackage(id, patch); break
      case 'storage':     this.updateStorage(id, patch); break
      case 'actor':       this.updateActor(id, patch); break
      case 'queue':       this.updateQueue(id, patch); break
      case 'use-case':    this.updateUseCase(id, patch); break
      case 'uc-system':   this.updateUCSystem(id, patch); break
      case 'state':       this.updateState(id, patch); break
      case 'start-state': this.updateStartState(id, patch); break
      case 'end-state':   this.updateEndState(id, patch); break
      case 'seq-diagram': this.updateSequenceDiagram(id, patch); break
      case 'seq-fragment': this.updateCombinedFragment(id, patch); break
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

  /** Ensure arrays exist for diagrams loaded from old JSON, and run migrations. */
  private ensureNewFields() {
    if (!this.diagram.actors)    this.diagram.actors    = []
    if (!this.diagram.queues)    this.diagram.queues    = []
    if (!this.diagram.useCases)  this.diagram.useCases  = []
    if (!this.diagram.ucSystems) this.diagram.ucSystems = []
    if (!this.diagram.states)      this.diagram.states      = []
    if (!this.diagram.startStates) this.diagram.startStates = []
    if (!this.diagram.endStates)   this.diagram.endStates   = []
    if (!this.diagram.sequenceDiagrams) {
      this.diagram.sequenceDiagrams = []
      const old = (this.diagram as any).sequenceLifelines as import('../entities/SequenceLifeline.ts').SequenceLifeline[] | undefined
      if (old?.length) {
        const minX = Math.min(...old.map(l => l.position.x))
        const minY = Math.min(...old.map(l => l.position.y))
        this.diagram.sequenceDiagrams.push({
          id: crypto.randomUUID(),
          elementType: 'seq-diagram',
          position: { x: minX, y: minY },
          size: { w: 0, h: 0 },
          lifelines: old.map(ll => ({ ...ll, position: { x: ll.position.x - minX, y: 0 } })),
        })
      }
      delete (this.diagram as any).sequenceLifelines
    }
    if (!this.diagram.combinedFragments) this.diagram.combinedFragments = []
  }

  // ── Classes ──────────────────────────────────────────────────────────────

  addClass(cls: UmlClass)                      { this.diagram.classes.push(cls); this.emit('class:add', cls) }
  updateClass(id: string, patch: Partial<UmlClass>) {
    const el = this.diagram.classes.find(c => c.id === id); if (!el) return
    Object.assign(el, patch); this.emit('class:update', el)
  }
  removeClass(id: string) {
    this.diagram.classes = this.diagram.classes.filter(c => c.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('class:remove', id)
  }

  // ── Packages ─────────────────────────────────────────────────────────────

  addPackage(pkg: UmlPackage)                  { this.diagram.packages.push(pkg); this.emit('package:add', pkg) }
  updatePackage(id: string, patch: Partial<UmlPackage>) {
    const el = this.diagram.packages.find(p => p.id === id); if (!el) return
    Object.assign(el, patch); this.emit('package:update', el)
  }
  removePackage(id: string) {
    this.diagram.packages = this.diagram.packages.filter(p => p.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('package:remove', id)
  }

  // ── Storages ─────────────────────────────────────────────────────────────

  addStorage(s: Storage)                       { this.diagram.storages.push(s); this.emit('storage:add', s) }
  updateStorage(id: string, patch: Partial<Storage>) {
    const el = this.diagram.storages.find(s => s.id === id); if (!el) return
    Object.assign(el, patch); this.emit('storage:update', el)
  }
  removeStorage(id: string) {
    this.diagram.storages = this.diagram.storages.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('storage:remove', id)
  }

  // ── Actors ───────────────────────────────────────────────────────────────

  addActor(a: Actor)                           { this.diagram.actors.push(a); this.emit('actor:add', a) }
  updateActor(id: string, patch: Partial<Actor>) {
    const el = this.diagram.actors.find(a => a.id === id); if (!el) return
    Object.assign(el, patch); this.emit('actor:update', el)
  }
  removeActor(id: string) {
    this.diagram.actors = this.diagram.actors.filter(a => a.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('actor:remove', id)
  }

  // ── Queues ───────────────────────────────────────────────────────────────

  addQueue(q: Queue)                           { this.diagram.queues.push(q); this.emit('queue:add', q) }
  updateQueue(id: string, patch: Partial<Queue>) {
    const el = this.diagram.queues.find(q => q.id === id); if (!el) return
    Object.assign(el, patch); this.emit('queue:update', el)
  }
  removeQueue(id: string) {
    this.diagram.queues = this.diagram.queues.filter(q => q.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('queue:remove', id)
  }

  // ── Connections ──────────────────────────────────────────────────────────

  addConnection(conn: Connection)              { this.diagram.connections.push(conn); this.emit('connection:add', conn) }
  updateConnection(id: string, patch: Partial<Connection>) {
    const el = this.diagram.connections.find(c => c.id === id); if (!el) return
    Object.assign(el, patch); this.emit('connection:update', el)
  }
  removeConnection(id: string) {
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

  addUseCase(uc: UseCase)                      { this.diagram.useCases.push(uc); this.emit('use-case:add', uc) }
  updateUseCase(id: string, patch: Partial<UseCase>) {
    const el = this.diagram.useCases.find(u => u.id === id); if (!el) return
    Object.assign(el, patch); this.emit('use-case:update', el)
  }
  removeUseCase(id: string) {
    this.diagram.useCases = this.diagram.useCases.filter(u => u.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('use-case:remove', id)
  }

  // ── UC Systems ───────────────────────────────────────────────────────────

  addUCSystem(sys: UCSystem)                   { this.diagram.ucSystems.push(sys); this.emit('uc-system:add', sys) }
  updateUCSystem(id: string, patch: Partial<UCSystem>) {
    const el = this.diagram.ucSystems.find(u => u.id === id); if (!el) return
    Object.assign(el, patch); this.emit('uc-system:update', el)
  }
  removeUCSystem(id: string) {
    this.diagram.ucSystems = this.diagram.ucSystems.filter(u => u.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('uc-system:remove', id)
  }

  // ── States ───────────────────────────────────────────────────────────────

  addState(s: State)                           { this.diagram.states.push(s); this.emit('state:add', s) }
  updateState(id: string, patch: Partial<State>) {
    const el = this.diagram.states.find(s => s.id === id); if (!el) return
    Object.assign(el, patch); this.emit('state:update', el)
  }
  removeState(id: string) {
    this.diagram.states = this.diagram.states.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('state:remove', id)
  }

  // ── Start States ─────────────────────────────────────────────────────────

  addStartState(s: StartState)                 { this.diagram.startStates.push(s); this.emit('start-state:add', s) }
  updateStartState(id: string, patch: Partial<StartState>) {
    const el = this.diagram.startStates.find(s => s.id === id); if (!el) return
    Object.assign(el, patch); this.emit('start-state:update', el)
  }
  removeStartState(id: string) {
    this.diagram.startStates = this.diagram.startStates.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('start-state:remove', id)
  }

  // ── End States ───────────────────────────────────────────────────────────

  addEndState(s: EndState)                     { this.diagram.endStates.push(s); this.emit('end-state:add', s) }
  updateEndState(id: string, patch: Partial<EndState>) {
    const el = this.diagram.endStates.find(s => s.id === id); if (!el) return
    Object.assign(el, patch); this.emit('end-state:update', el)
  }
  removeEndState(id: string) {
    this.diagram.endStates = this.diagram.endStates.filter(s => s.id !== id)
    this.cleanupConnectionsForElement(id); this.emit('end-state:remove', id)
  }

  // ── Sequence Diagrams ────────────────────────────────────────────────────

  addSequenceDiagram(sd: SequenceDiagram)      { this.diagram.sequenceDiagrams.push(sd); this.emit('seq-diagram:add', sd) }
  updateSequenceDiagram(id: string, patch: Partial<SequenceDiagram>) {
    const el = this.diagram.sequenceDiagrams.find(s => s.id === id); if (!el) return
    Object.assign(el, patch); this.emit('seq-diagram:update', el)
  }
  removeSequenceDiagram(id: string) {
    this.diagram.sequenceDiagrams = this.diagram.sequenceDiagrams.filter(s => s.id !== id)
    this.emit('seq-diagram:remove', id)
  }

  // ── Combined Fragments ───────────────────────────────────────────────────

  addCombinedFragment(frag: CombinedFragment)  { this.diagram.combinedFragments.push(frag); this.emit('seq-fragment:add', frag) }
  updateCombinedFragment(id: string, patch: Partial<CombinedFragment>) {
    const el = this.diagram.combinedFragments.find(f => f.id === id); if (!el) return
    Object.assign(el, patch); this.emit('seq-fragment:update', el)
  }
  removeCombinedFragment(id: string) {
    this.diagram.combinedFragments = this.diagram.combinedFragments.filter(f => f.id !== id)
    this.emit('seq-fragment:remove', id)
  }

  // ── Load ─────────────────────────────────────────────────────────────────

  load(diagram: Diagram) {
    this.diagram = diagram
    this.ensureNewFields()
    this.emit('diagram:load', diagram)
  }
}
