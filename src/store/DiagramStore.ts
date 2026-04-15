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
import type { ElementKind } from '../types.ts'
import type { Point, Size } from '../entities/UmlClass.ts'

export type StoreEventType =
  | 'class:add' | 'class:update' | 'class:remove'
  | 'package:add' | 'package:update' | 'package:remove'
  | 'storage:add' | 'storage:update' | 'storage:remove'
  | 'actor:add' | 'actor:update' | 'actor:remove'
  | 'queue:add' | 'queue:update' | 'queue:remove'
  | 'usecase:add' | 'usecase:update' | 'usecase:remove'
  | 'ucsystem:add' | 'ucsystem:update' | 'ucsystem:remove'
  | 'state:add' | 'state:update' | 'state:remove'
  | 'startstate:add' | 'startstate:update' | 'startstate:remove'
  | 'endstate:add' | 'endstate:update' | 'endstate:remove'
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
    // Ensure new arrays exist for diagrams loaded from old JSON
    if (!this.diagram.actors)    this.diagram.actors    = []
    if (!this.diagram.queues)    this.diagram.queues    = []
    if (!this.diagram.useCases)  this.diagram.useCases  = []
    if (!this.diagram.ucSystems) this.diagram.ucSystems = []
    if (!this.diagram.states)      this.diagram.states      = []
    if (!this.diagram.startStates) this.diagram.startStates = []
    if (!this.diagram.endStates)   this.diagram.endStates   = []
  }

  get state(): Readonly<Diagram> {
    return this.diagram
  }

  on(listener: Listener): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter(l => l !== listener) }
  }

  /**
   * Find any positionable element by kind and id.
   * Returns an object with `position` and `size` or undefined if not found.
   * Used by DragController and ResizeController to avoid parallel if-else chains.
   */
  findElementById(kind: ElementKind, id: string): { position: Point; size: Size } | undefined {
    switch (kind) {
      case 'class':     return this.diagram.classes.find(c => c.id === id)
      case 'package':   return this.diagram.packages.find(p => p.id === id)
      case 'storage':   return this.diagram.storages.find(s => s.id === id)
      case 'actor':     return this.diagram.actors.find(a => a.id === id)
      case 'queue':     return this.diagram.queues.find(q => q.id === id)
      case 'use-case':    return this.diagram.useCases.find(u => u.id === id)
      case 'uc-system':   return this.diagram.ucSystems.find(u => u.id === id)
      case 'state':       return this.diagram.states.find(s => s.id === id)
      case 'start-state': return this.diagram.startStates.find(s => s.id === id)
      case 'end-state':   return this.diagram.endStates.find(s => s.id === id)
    }
  }

  /**
   * Update position (and optionally size) of any positionable element.
   * Used by DragController and ResizeController.
   */
  updateElementPosition(kind: ElementKind, id: string, patch: { position: Point; size?: Size }): void {
    switch (kind) {
      case 'class':     this.updateClass(id, patch); break
      case 'package':   this.updatePackage(id, patch); break
      case 'storage':   this.updateStorage(id, patch); break
      case 'actor':     this.updateActor(id, patch); break
      case 'queue':     this.updateQueue(id, patch); break
      case 'use-case':    this.updateUseCase(id, patch); break
      case 'uc-system':   this.updateUCSystem(id, patch); break
      case 'state':       this.updateState(id, patch); break
      case 'start-state': this.updateStartState(id, patch); break
      case 'end-state':   this.updateEndState(id, patch); break
    }
  }

  private emit(type: StoreEventType, payload?: unknown) {
    const event: StoreEvent = { type, payload }
    this.listeners.forEach(l => l(event))
  }

  // ── Classes ──────────────────────────────────────────────────────────────

  addClass(cls: UmlClass) {
    this.diagram.classes.push(cls)
    this.emit('class:add', cls)
  }

  updateClass(id: string, patch: Partial<UmlClass>) {
    const cls = this.diagram.classes.find(c => c.id === id)
    if (!cls) return
    Object.assign(cls, patch)
    this.emit('class:update', cls)
  }

  removeClass(id: string) {
    this.diagram.classes = this.diagram.classes.filter(c => c.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('class:remove', id)
  }

  // ── Packages ─────────────────────────────────────────────────────────────

  addPackage(pkg: UmlPackage) {
    this.diagram.packages.push(pkg)
    this.emit('package:add', pkg)
  }

  updatePackage(id: string, patch: Partial<UmlPackage>) {
    const pkg = this.diagram.packages.find(p => p.id === id)
    if (!pkg) return
    Object.assign(pkg, patch)
    this.emit('package:update', pkg)
  }

  removePackage(id: string) {
    this.diagram.packages = this.diagram.packages.filter(p => p.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('package:remove', id)
  }

  // ── Storages ──────────────────────────────────────────────────────────────

  addStorage(storage: Storage) {
    this.diagram.storages.push(storage)
    this.emit('storage:add', storage)
  }

  updateStorage(id: string, patch: Partial<Storage>) {
    const s = this.diagram.storages.find(s => s.id === id)
    if (!s) return
    Object.assign(s, patch)
    this.emit('storage:update', s)
  }

  removeStorage(id: string) {
    this.diagram.storages = this.diagram.storages.filter(s => s.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('storage:remove', id)
  }

  // ── Actors ────────────────────────────────────────────────────────────────

  addActor(actor: Actor) {
    this.diagram.actors.push(actor)
    this.emit('actor:add', actor)
  }

  updateActor(id: string, patch: Partial<Actor>) {
    const a = this.diagram.actors.find(a => a.id === id)
    if (!a) return
    Object.assign(a, patch)
    this.emit('actor:update', a)
  }

  removeActor(id: string) {
    this.diagram.actors = this.diagram.actors.filter(a => a.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('actor:remove', id)
  }

  // ── Queues ────────────────────────────────────────────────────────────────

  addQueue(queue: Queue) {
    this.diagram.queues.push(queue)
    this.emit('queue:add', queue)
  }

  updateQueue(id: string, patch: Partial<Queue>) {
    const q = this.diagram.queues.find(q => q.id === id)
    if (!q) return
    Object.assign(q, patch)
    this.emit('queue:update', q)
  }

  removeQueue(id: string) {
    this.diagram.queues = this.diagram.queues.filter(q => q.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('queue:remove', id)
  }

  // ── Connections ───────────────────────────────────────────────────────────

  addConnection(conn: Connection) {
    this.diagram.connections.push(conn)
    this.emit('connection:add', conn)
  }

  updateConnection(id: string, patch: Partial<Connection>) {
    const conn = this.diagram.connections.find(c => c.id === id)
    if (!conn) return
    Object.assign(conn, patch)
    this.emit('connection:update', conn)
  }

  removeConnection(id: string) {
    this.diagram.connections = this.diagram.connections.filter(c => c.id !== id)
    this.emit('connection:remove', id)
  }

  // ── Viewport ──────────────────────────────────────────────────────────────

  updateViewport(patch: Partial<Diagram['viewport']>) {
    Object.assign(this.diagram.viewport, patch)
    this.emit('viewport:update', this.diagram.viewport)
  }

  // ── Diagram metadata ──────────────────────────────────────────────────────

  updateDiagramName(name: string) {
    this.diagram.name = name
  }

  // ── Use Cases ─────────────────────────────────────────────────────────────

  addUseCase(uc: UseCase) {
    this.diagram.useCases.push(uc)
    this.emit('usecase:add', uc)
  }

  updateUseCase(id: string, patch: Partial<UseCase>) {
    const uc = this.diagram.useCases.find(u => u.id === id)
    if (!uc) return
    Object.assign(uc, patch)
    this.emit('usecase:update', uc)
  }

  removeUseCase(id: string) {
    this.diagram.useCases = this.diagram.useCases.filter(u => u.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('usecase:remove', id)
  }

  // ── UC Systems ────────────────────────────────────────────────────────────

  addUCSystem(sys: UCSystem) {
    this.diagram.ucSystems.push(sys)
    this.emit('ucsystem:add', sys)
  }

  updateUCSystem(id: string, patch: Partial<UCSystem>) {
    const sys = this.diagram.ucSystems.find(u => u.id === id)
    if (!sys) return
    Object.assign(sys, patch)
    this.emit('ucsystem:update', sys)
  }

  removeUCSystem(id: string) {
    this.diagram.ucSystems = this.diagram.ucSystems.filter(u => u.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('ucsystem:remove', id)
  }

  // ── States ────────────────────────────────────────────────────────────────

  addState(state: State) {
    this.diagram.states.push(state)
    this.emit('state:add', state)
  }

  updateState(id: string, patch: Partial<State>) {
    const s = this.diagram.states.find(s => s.id === id)
    if (!s) return
    Object.assign(s, patch)
    this.emit('state:update', s)
  }

  removeState(id: string) {
    this.diagram.states = this.diagram.states.filter(s => s.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('state:remove', id)
  }

  // ── Start States ──────────────────────────────────────────────────────────

  addStartState(state: StartState) {
    this.diagram.startStates.push(state)
    this.emit('startstate:add', state)
  }

  updateStartState(id: string, patch: Partial<StartState>) {
    const s = this.diagram.startStates.find(s => s.id === id)
    if (!s) return
    Object.assign(s, patch)
    this.emit('startstate:update', s)
  }

  removeStartState(id: string) {
    this.diagram.startStates = this.diagram.startStates.filter(s => s.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('startstate:remove', id)
  }

  // ── End States ────────────────────────────────────────────────────────────

  addEndState(state: EndState) {
    this.diagram.endStates.push(state)
    this.emit('endstate:add', state)
  }

  updateEndState(id: string, patch: Partial<EndState>) {
    const s = this.diagram.endStates.find(s => s.id === id)
    if (!s) return
    Object.assign(s, patch)
    this.emit('endstate:update', s)
  }

  removeEndState(id: string) {
    this.diagram.endStates = this.diagram.endStates.filter(s => s.id !== id)
    this.diagram.connections
      .filter(cn => cn.source.elementId === id || cn.target.elementId === id)
      .forEach(cn => this.emit('connection:remove', cn.id))
    this.diagram.connections = this.diagram.connections.filter(
      cn => cn.source.elementId !== id && cn.target.elementId !== id,
    )
    this.emit('endstate:remove', id)
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  load(diagram: Diagram) {
    this.diagram = diagram
    if (!this.diagram.actors)    this.diagram.actors    = []
    if (!this.diagram.queues)    this.diagram.queues    = []
    if (!this.diagram.useCases)  this.diagram.useCases  = []
    if (!this.diagram.ucSystems) this.diagram.ucSystems = []
    if (!this.diagram.states)      this.diagram.states      = []
    if (!this.diagram.startStates) this.diagram.startStates = []
    if (!this.diagram.endStates)   this.diagram.endStates   = []
    this.emit('diagram:load', diagram)
  }
}
