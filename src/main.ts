import { DiagramStore } from './store/DiagramStore.ts'
import { loadSavedTheme } from './themes/catppuccin.ts'
import { loadDiagram, saveDiagram, openAndSaveToFile, closeActiveFile, getActiveFileName, loadDiagramFromFile, exportDiagramToPng } from './serialization/mermaid.ts'
import { ClassRenderer } from './renderers/ClassRenderer.ts'
import { PackageRenderer } from './renderers/PackageRenderer.ts'
import { StorageRenderer } from './renderers/StorageRenderer.ts'
import { ActorRenderer } from './renderers/ActorRenderer.ts'
import { QueueRenderer } from './renderers/QueueRenderer.ts'
import { UseCaseRenderer } from './renderers/UseCaseRenderer.ts'
import { UCSystemRenderer } from './renderers/UCSystemRenderer.ts'
import { StateRenderer } from './renderers/StateRenderer.ts'
import { StartStateRenderer } from './renderers/StartStateRenderer.ts'
import { EndStateRenderer } from './renderers/EndStateRenderer.ts'
import { ConnectionRenderer, injectMarkerDefs } from './renderers/ConnectionRenderer.ts'
import { DragController } from './interaction/DragController.ts'
import { ResizeController } from './interaction/ResizeController.ts'
import { ConnectionController } from './interaction/ConnectionController.ts'
import { SelectionManager } from './interaction/SelectionManager.ts'
import { InlineEditor } from './interaction/InlineEditor.ts'
import { Toolbar } from './ui/Toolbar.ts'
import { FileMenu } from './ui/FileMenu.ts'
import { showConnectionPopover } from './ui/ConnectionPopover.ts'
import { showElementPropertiesPanel, hideElementPropertiesPanel } from './ui/ElementPropertiesPanel.ts'
import { createUmlClass } from './entities/UmlClass.ts'
import { createUmlPackage } from './entities/Package.ts'
import { createStorage } from './entities/Storage.ts'
import { createActor } from './entities/Actor.ts'
import { createQueue } from './entities/Queue.ts'
import { createUseCase } from './entities/UseCase.ts'
import { createUCSystem } from './entities/UCSystem.ts'
import { createState } from './entities/State.ts'
import { createStartState } from './entities/StartState.ts'
import { createEndState } from './entities/EndState.ts'
import { createDiagram } from './entities/Diagram.ts'
import type { UmlClass } from './entities/UmlClass.ts'
import type { UmlPackage } from './entities/Package.ts'
import type { Storage } from './entities/Storage.ts'
import type { Actor } from './entities/Actor.ts'
import type { Queue } from './entities/Queue.ts'
import type { UseCase } from './entities/UseCase.ts'
import type { UCSystem } from './entities/UCSystem.ts'
import type { State } from './entities/State.ts'
import type { StartState } from './entities/StartState.ts'
import type { EndState } from './entities/EndState.ts'
import type { Connection } from './entities/Connection.ts'
import { absolutePortPosition } from './renderers/ports.ts'
import { getElementConfig } from './config/registry.ts'
import type { ElementKind } from './types.ts'
import { bestPortPair, pathMidpoint } from './renderers/routing.ts'
import type { PortSide } from './renderers/routing.ts'
import type { ElbowMode } from './entities/Connection.ts'

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSavedTheme()

const svg = document.getElementById('canvas') as unknown as SVGSVGElement
injectMarkerDefs(svg)

const diagram = loadDiagram()
const store = new DiagramStore(diagram ?? undefined)
const selection = new SelectionManager()
const toolbar = new Toolbar(document.getElementById('toolbar')!)
const inlineEditor = new InlineEditor()

// ─── File menu ─────────────────────────────────────────────────────────────────

// ─── SVG viewport transform group ─────────────────────────────────────────────

const viewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
viewGroup.id = 'view-group'
svg.appendChild(viewGroup)

// ─── File menu ─────────────────────────────────────────────────────────────────

const fileMenuCallbacks = {
  onNew: () => {
    if (store.state.classes.length || store.state.packages.length ||
        store.state.storages.length || store.state.actors.length ||
        store.state.queues.length || store.state.useCases.length || store.state.ucSystems.length ||
        store.state.states?.length || store.state.startStates?.length || store.state.endStates?.length ||
        store.state.connections.length) {
      if (!confirm('Create a new diagram? Unsaved changes will be lost.')) return
    }
    closeActiveFile()
    const fresh = createDiagram('Untitled')
    store.load(fresh)
    saveDiagram(fresh)
    fileMenu.setTitle(fresh.name)
    fileMenu.setFileIndicator(null)
  },
  onOpen: () => {
    loadDiagramFromFile(d => {
      closeActiveFile()
      store.load(d)
      saveDiagram(d)
      fileMenu.setTitle(d.name ?? 'Untitled')
      fileMenu.setFileIndicator(null)
    })
  },
  onSave: () => {
    const d = store.state
    const name = fileMenu.getTitle() || 'diagram'
    openAndSaveToFile(d, `${name}.json`).then(saved => {
      if (saved) fileMenu.setFileIndicator(getActiveFileName())
    }).catch(console.error)
  },
  onSaveAs: () => {
    const d = store.state
    const name = fileMenu.getTitle() || 'diagram'
    openAndSaveToFile(d, `${name}.json`, /* forceNew */ true).then(saved => {
      if (saved) fileMenu.setFileIndicator(getActiveFileName())
    }).catch(console.error)
  },
  onExportPng: () => {
    exportDiagramToPng(svg, viewGroup, fileMenu.getTitle() || 'diagram').catch(console.error)
  },
  onTitleChange: (title: string) => {
    store.updateDiagramName(title)
    saveDiagram(store.state)
  },
}

const fileMenu = new FileMenu(document.getElementById('titlebar')!, fileMenuCallbacks)

// Initialise title from loaded diagram
fileMenu.setTitle(store.state.name ?? 'Untitled')

const pkgLayer      = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const storageLayer  = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const actorLayer    = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const queueLayer    = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const ucSystemLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const ucLayer       = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const stateLayer    = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const connLayer     = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const clsLayer      = document.createElementNS('http://www.w3.org/2000/svg', 'g')
viewGroup.append(pkgLayer, storageLayer, actorLayer, queueLayer, ucSystemLayer, ucLayer, stateLayer, connLayer, clsLayer)

// Rubber-band selection rect — lives inside viewGroup so coords are in diagram space
const rubberBandRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
rubberBandRect.classList.add('rubber-band')
rubberBandRect.style.display = 'none'
viewGroup.appendChild(rubberBandRect)

// Snap guide lines — rendered on top of everything else in diagram space
const snapGuideGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
snapGuideGroup.classList.add('snap-guides')
viewGroup.appendChild(snapGuideGroup)

function updateSnapGuides(guides: import('./interaction/SnapEngine.ts').GuideLine[]) {
  snapGuideGroup.innerHTML = ''
  for (const g of guides) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    if (g.axis === 'h') {
      line.setAttribute('x1', String(g.from))
      line.setAttribute('x2', String(g.to))
      line.setAttribute('y1', String(g.value))
      line.setAttribute('y2', String(g.value))
    } else {
      line.setAttribute('x1', String(g.value))
      line.setAttribute('x2', String(g.value))
      line.setAttribute('y1', String(g.from))
      line.setAttribute('y2', String(g.to))
    }
    line.classList.add('snap-guide')
    snapGuideGroup.appendChild(line)
  }
}

// ─── Renderer maps ────────────────────────────────────────────────────────────

const classRenderers    = new Map<string, ClassRenderer>()
const pkgRenderers      = new Map<string, PackageRenderer>()
const storageRenderers  = new Map<string, StorageRenderer>()
const actorRenderers    = new Map<string, ActorRenderer>()
const queueRenderers    = new Map<string, QueueRenderer>()
const ucRenderers       = new Map<string, UseCaseRenderer>()
const ucSystemRenderers = new Map<string, UCSystemRenderer>()
const stateRenderers      = new Map<string, StateRenderer>()
const startStateRenderers = new Map<string, StartStateRenderer>()
const endStateRenderers   = new Map<string, EndStateRenderer>()
const connRenderers     = new Map<string, ConnectionRenderer>()

// ─── SVG helper ───────────────────────────────────────────────────────────────

function getSvgPoint(e: MouseEvent): DOMPoint {
  const pt = svg.createSVGPoint()
  pt.x = e.clientX; pt.y = e.clientY
  return pt.matrixTransform(viewGroup.getScreenCTM()!.inverse())
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * Returns all non-package element ids whose center lies strictly within the
 * given container package's current rendered rect. Used by DragController.
 */
function getContainedElements(pkgId: string): Array<{ kind: ElementKind; id: string }> {
  const d = store.state
  const pkg = d.packages.find(p => p.id === pkgId)
  if (!pkg) return []
  const pkgR = pkgRenderers.get(pkgId)
  const { w, h } = pkgR?.getRenderedSize() ?? pkg.size
  const { x, y } = pkg.position
  const result: Array<{ kind: ElementKind; id: string }> = []
  const inside = (el: { position: { x: number; y: number }; size: { w: number; h: number } }) => {
    const cx = el.position.x + el.size.w / 2
    const cy = el.position.y + el.size.h / 2
    return cx > x && cx < x + w && cy > y && cy < y + h
  }
  d.classes.forEach(e  => { if (inside(e)) result.push({ kind: 'class',     id: e.id }) })
  d.storages.forEach(e => { if (inside(e)) result.push({ kind: 'storage',   id: e.id }) })
  d.actors.forEach(e   => { if (inside(e)) result.push({ kind: 'actor',     id: e.id }) })
  d.queues.forEach(e   => { if (inside(e)) result.push({ kind: 'queue',     id: e.id }) })
  d.useCases.forEach(e => { if (inside(e)) result.push({ kind: 'use-case',  id: e.id }) })
  d.ucSystems.forEach(e=> { if (inside(e)) result.push({ kind: 'uc-system', id: e.id }) })
  d.states?.forEach(e    => { if (inside(e)) result.push({ kind: 'state',       id: e.id }) })
  d.startStates?.forEach(e => { if (inside(e)) result.push({ kind: 'start-state', id: e.id }) })
  d.endStates?.forEach(e   => { if (inside(e)) result.push({ kind: 'end-state',   id: e.id }) })
  return result
}

const drag    = new DragController(store, getSvgPoint, getContainedElements, updateSnapGuides)
const resize  = new ResizeController(store, getSvgPoint, getMinSize, () => store.state.viewport.zoom)
const connect = new ConnectionController(store, svg, viewGroup, getSvgPoint, showConnectionPopover)

// ─── Add renderers ────────────────────────────────────────────────────────────

function addClassRenderer(cls: UmlClass) {
  const r = new ClassRenderer(
    cls,
    store,
    (el, port, e) => { connect.startConnection({ ...el, elementType: 'uml-class' }, port, e); e.preventDefault() },
    (el) => {
      const current = store.state.classes.find(c => c.id === el.id)!
      const newAttr = { id: crypto.randomUUID(), visibility: '+' as const, name: 'attribute', type: 'String' }
      store.updateClass(el.id, { attributes: [...current.attributes, newAttr] })
    },
    (el) => {
      const current = store.state.classes.find(c => c.id === el.id)!
      const newMethod = { id: crypto.randomUUID(), visibility: '+' as const, name: 'method', params: [], returnType: 'void' }
      store.updateClass(el.id, { methods: [...current.methods, newMethod] })
    },
  )
  clsLayer.appendChild(r.el)
  classRenderers.set(cls.id, r)
  wireClassInteraction(r, cls)
}

function addPackageRenderer(pkg: UmlPackage) {
  const r = new PackageRenderer(pkg, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'uml-package' }, port, e)
    e.preventDefault()
  })
  pkgLayer.appendChild(r.el)
  pkgRenderers.set(pkg.id, r)
  wirePackageInteraction(r, pkg)
}

function addStorageRenderer(storage: Storage) {
  const r = new StorageRenderer(storage, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'storage' }, port, e)
    e.preventDefault()
  })
  storageLayer.appendChild(r.el)
  storageRenderers.set(storage.id, r)
  wireStorageInteraction(r, storage)
}

function addActorRenderer(actor: Actor) {
  const r = new ActorRenderer(actor, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: el.elementType }, port, e)
    e.preventDefault()
  })
  actorLayer.appendChild(r.el)
  actorRenderers.set(actor.id, r)
  wireActorInteraction(r, actor)
}

function addQueueRenderer(queue: Queue) {
  const r = new QueueRenderer(queue, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'queue' }, port, e)
    e.preventDefault()
  })
  queueLayer.appendChild(r.el)
  queueRenderers.set(queue.id, r)
  wireQueueInteraction(r, queue)
}

function addUseCaseRenderer(uc: UseCase) {
  const r = new UseCaseRenderer(uc, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'use-case' }, port, e)
    e.preventDefault()
  })
  ucLayer.appendChild(r.el)
  ucRenderers.set(uc.id, r)
  wireUseCaseInteraction(r, uc)
}

function addUCSystemRenderer(sys: UCSystem) {
  const r = new UCSystemRenderer(sys, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'uc-system' }, port, e)
    e.preventDefault()
  })
  ucSystemLayer.appendChild(r.el)
  ucSystemRenderers.set(sys.id, r)
  wireUCSystemInteraction(r, sys)
}

function addStateRenderer(state: State) {
  const r = new StateRenderer(state, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'state' }, port, e)
    e.preventDefault()
  })
  stateLayer.appendChild(r.el)
  stateRenderers.set(state.id, r)
  wireStateInteraction(r, state)
}

function addStartStateRenderer(state: StartState) {
  const r = new StartStateRenderer(state, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'start-state' }, port, e)
    e.preventDefault()
  })
  stateLayer.appendChild(r.el)
  startStateRenderers.set(state.id, r)
  wireStartStateInteraction(r, state)
}

function addEndStateRenderer(state: EndState) {
  const r = new EndStateRenderer(state, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'end-state' }, port, e)
    e.preventDefault()
  })
  stateLayer.appendChild(r.el)
  endStateRenderers.set(state.id, r)
  wireEndStateInteraction(r, state)
}

// Active connection popover dismiss — call to close any open connection popover
let dismissConnPopover: (() => void) | null = null

function addConnectionRenderer(conn: Connection) {
  const r = new ConnectionRenderer(conn, store, (c, e) => {
    e.stopPropagation()
    selection.select({ kind: 'connection', id: c.id })

    const d = store.state
    const srcEl = findElement(d, c.source.elementId)
    const tgtEl = findElement(d, c.target.elementId)
    if (!srcEl || !tgtEl) return

    const srcSize = getRenderedSizeFor(c.source.elementId, srcEl)
    const tgtSize = getRenderedSizeFor(c.target.elementId, tgtEl)
    const s = absolutePortPosition(srcEl.el.position.x, srcEl.el.position.y, srcSize.w, srcSize.h, c.source.port)
    const t = absolutePortPosition(tgtEl.el.position.x, tgtEl.el.position.y, tgtSize.w, tgtSize.h, c.target.port)
    const srcRect = { x: srcEl.el.position.x, y: srcEl.el.position.y, w: srcSize.w, h: srcSize.h }
    const tgtRect = { x: tgtEl.el.position.x, y: tgtEl.el.position.y, w: tgtSize.w, h: tgtSize.h }
    const mid = pathMidpoint(s.x, s.y, c.source.port, t.x, t.y, c.target.port, srcRect, tgtRect)

    const svgRect = svg.getBoundingClientRect()
    const vp = d.viewport
    dismissConnPopover = showConnectionPopover(
      svgRect.left + mid.x * vp.zoom + vp.x,
      svgRect.top  + mid.y * vp.zoom + vp.y,
      (type, srcMult, tgtMult) => {
        store.updateConnection(c.id, {
          type,
          sourceMultiplicity: srcMult as Connection['sourceMultiplicity'],
          targetMultiplicity: tgtMult as Connection['targetMultiplicity'],
        })
      },
      () => { dismissConnPopover = null; selection.clear() },
      getElementConfig(srcEl.type),
      getElementConfig(tgtEl.type),
      () => {
        // Flip: swap source and target
        store.updateConnection(c.id, { source: { ...c.target }, target: { ...c.source } })
      },
      { type: c.type, srcMult: c.sourceMultiplicity ?? '', tgtMult: c.targetMultiplicity ?? '', elbowMode: c.elbowMode },
      (mode: ElbowMode) => {
        store.updateConnection(c.id, { elbowMode: mode })
      },
    )
  })
  connLayer.appendChild(r.el)
  connRenderers.set(conn.id, r)
}

// ─── Nearest port helper ──────────────────────────────────────────────────────

function nearestPort(e: MouseEvent, hostEl: Element): string {
  const rect = hostEl.getBoundingClientRect()
  const cx = rect.left + rect.width  / 2
  const cy = rect.top  + rect.height / 2
  const dx = e.clientX - cx
  const dy = e.clientY - cy
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'e' : 'w'
  return dy > 0 ? 's' : 'n'
}

// ─── Element lookup helper ────────────────────────────────────────────────────

type AnyElement = { position: { x: number; y: number }; size: { w: number; h: number } }

function findElement(
  d: Readonly<ReturnType<typeof store.state.valueOf>>,
  id: string,
): { el: AnyElement; type: string } | undefined {
  const cls = (d as typeof store.state).classes.find((c: { id: string }) => c.id === id)
  if (cls) return { el: cls as AnyElement, type: 'uml-class' }
  const pkg = (d as typeof store.state).packages.find((p: { id: string }) => p.id === id)
  if (pkg) return { el: pkg as AnyElement, type: 'uml-package' }
  const st = (d as typeof store.state).storages.find((s: { id: string }) => s.id === id)
  if (st) return { el: st as AnyElement, type: 'storage' }
  const ac = (d as typeof store.state).actors.find((a: { id: string }) => a.id === id)
  if (ac) return { el: ac as AnyElement, type: (ac as Actor).elementType }
  const q = (d as typeof store.state).queues.find((q: { id: string }) => q.id === id)
  if (q) return { el: q as AnyElement, type: 'queue' }
  const uc = (d as typeof store.state).useCases.find((u: { id: string }) => u.id === id)
  if (uc) return { el: uc as AnyElement, type: 'use-case' }
  const ucs = (d as typeof store.state).ucSystems.find((u: { id: string }) => u.id === id)
  if (ucs) return { el: ucs as AnyElement, type: 'uc-system' }
  const stEl = (d as typeof store.state).states?.find((s: { id: string }) => s.id === id)
  if (stEl) return { el: stEl as AnyElement, type: 'state' }
  const ss = (d as typeof store.state).startStates?.find((s: { id: string }) => s.id === id)
  if (ss) return { el: ss as AnyElement, type: 'start-state' }
  const es = (d as typeof store.state).endStates?.find((s: { id: string }) => s.id === id)
  if (es) return { el: es as AnyElement, type: 'end-state' }
  return undefined
}

/** Get the rendered (possibly expanded) size for an element — for use in connection routing */
function getRenderedSizeFor(id: string, found: { el: AnyElement; type: string }): { w: number; h: number } {
  return classRenderers.get(id)?.getRenderedSize()
    ?? pkgRenderers.get(id)?.getRenderedSize()
    ?? storageRenderers.get(id)?.getRenderedSize()
    ?? actorRenderers.get(id)?.getRenderedSize()
    ?? queueRenderers.get(id)?.getRenderedSize()
    ?? ucRenderers.get(id)?.getRenderedSize()
    ?? ucSystemRenderers.get(id)?.getRenderedSize()
    ?? stateRenderers.get(id)?.getRenderedSize()
    ?? startStateRenderers.get(id)?.getRenderedSize()
    ?? endStateRenderers.get(id)?.getRenderedSize()
    ?? found.el.size
}

// ─── Properties panel helper ──────────────────────────────────────────────────

function showPropertiesForSelection() {
  const items = selection.items
  if (items.length !== 1) { hideElementPropertiesPanel(); return }

  const item = items[0]
  const d = store.state

  // Package: no properties panel
  if (item.kind === 'package') {
    hideElementPropertiesPanel(); return
  }

  let el: AnyElement & { multiInstance?: boolean } | undefined
  let updateFn: (patch: { multiInstance?: boolean; flowReversed?: boolean }) => void = () => {}
  let isQueue = false

  if (item.kind === 'class') {
    const c = d.classes.find(c => c.id === item.id)
    if (c) { el = c as AnyElement; updateFn = p => store.updateClass(item.id, p) }
  } else if (item.kind === 'storage') {
    const s = d.storages.find(s => s.id === item.id)
    if (s) { el = s; updateFn = p => store.updateStorage(item.id, p) }
  } else if (item.kind === 'actor') {
    const a = d.actors.find(a => a.id === item.id)
    if (a) { el = a; updateFn = p => store.updateActor(item.id, p) }
  } else if (item.kind === 'queue') {
    const q = d.queues.find(q => q.id === item.id)
    if (q) { el = q; updateFn = p => store.updateQueue(item.id, p); isQueue = true }
  }

  if (!el) { hideElementPropertiesPanel(); return }

  const svgRect = svg.getBoundingClientRect()
  const vp = d.viewport
  const screenX = svgRect.left + (el.position.x + el.size.w) * vp.zoom + vp.x + 12
  const screenY = svgRect.top  + el.position.y * vp.zoom + vp.y

  const queue = isQueue ? (el as AnyElement & { flowReversed?: boolean }) : undefined
  showElementPropertiesPanel(
    screenX,
    screenY,
    el.multiInstance ?? false,
    (multiInstance) => updateFn({ multiInstance }),
    queue ? (queue.flowReversed ?? false) : undefined,
    queue ? (reversed) => updateFn({ flowReversed: reversed }) : undefined,
  )
}

// ─── Element interaction wiring ───────────────────────────────────────────────

/**
 * Returns the content-minimum size for any element kind, by querying its renderer.
 * Used by ResizeController to clamp resize at content boundaries.
 */
function getMinSize(kind: ElementKind, id: string): { w: number; h: number } {
  switch (kind) {
    case 'class':     return classRenderers.get(id)?.getContentMinSize()     ?? { w: 180, h: 40 }
    case 'package':   return pkgRenderers.get(id)?.getContentMinSize()       ?? { w: 120, h: 60 }
    case 'storage':   return storageRenderers.get(id)?.getContentMinSize()   ?? { w: 80,  h: 40 }
    case 'actor':     return actorRenderers.get(id)?.getContentMinSize()     ?? { w: 80,  h: 40 }
    case 'queue':     return queueRenderers.get(id)?.getContentMinSize()     ?? { w: 100, h: 48 }
    case 'use-case':    return ucRenderers.get(id)?.getContentMinSize()        ?? { w: 140, h: 60 }
    case 'uc-system':   return ucSystemRenderers.get(id)?.getContentMinSize()  ?? { w: 160, h: 120 }
    case 'state':       return stateRenderers.get(id)?.getContentMinSize()     ?? { w: 80,  h: 36 }
    case 'start-state': return startStateRenderers.get(id)?.getContentMinSize() ?? { w: 28, h: 28 }
    case 'end-state':   return endStateRenderers.get(id)?.getContentMinSize()   ?? { w: 36, h: 36 }
  }
}

/**
 * Wire drag, resize, and name-edit interactions for any simple element type.
 * "Simple" means: the element's rendered size equals its stored `size` field,
 * and dblclick on a single text node renames the element.
 *
 * @param el            The root SVG element of the renderer
 * @param kind          Element kind key used by selection/drag/resize
 * @param id            Stable element id
 * @param getElData     Returns current {x,y,w,h} for resize hit-testing
 * @param nameSelector  CSS class of the text node that triggers rename on dblclick
 * @param getName       Returns current name from store state
 * @param updateName    Persists a new name to the store
 * @param noVerticalResize  If true, n/s resize edges are suppressed (class behaviour)
 */
function wireElementInteraction(
  el: SVGGElement,
  kind: ElementKind,
  id: string,
  getElData: () => { x: number; y: number; w: number; h: number },
  nameSelector: string,
  getName: () => string,
  updateName: (val: string) => void,
  noVerticalResize = false,
) {
  el.addEventListener('mousedown', e => {
    if (connect.isConnecting) return
    if (toolbar.activeTool === 'pan') return
    // Suppress resize when multiple elements are selected — only drag-move is allowed
    const multiSelected = selection.items.length > 1 && selection.isSelected(id)
    if (!multiSelected) {
      const { x, y, w, h } = getElData()
      const elData = { kind, id, x, y, w, h }
      const resizeHit = resize.hitTest(e, [elData])
      if (resizeHit) {
        if (noVerticalResize && (resizeHit.edge === 'n' || resizeHit.edge === 's')) {
          // Fall through to drag
        } else {
          e.stopPropagation()
          resize.startResize(resizeHit, e)
          return
        }
      }
    }
    e.stopPropagation()
    // If the element is already part of a multi-selection and shift is not held,
    // don't re-select (which would collapse to single) — just start the drag.
    if (!e.shiftKey && selection.isSelected(id) && selection.items.length > 1) {
      drag.startDrag({ kind, id }, e, selection.items)
    } else {
      selection.select({ kind, id }, e.shiftKey)
      drag.startDrag({ kind, id }, e, selection.items)
    }
  })

  el.addEventListener('dblclick', e => {
    const target = e.target as Element
    // Ignore clicks on ports, member text (handled separately for class), and foreign objects
    if (target.classList.contains('port') || target.classList.contains('port-hit')) return
    if (target.classList.contains('member-text')) return
    if (target.tagName === 'foreignObject' || (target as Element).closest?.('foreignObject')) return
    e.stopPropagation()
    // Find the name text node to anchor the inline editor
    const nameEl = el.querySelector<SVGTextElement>(`.${nameSelector}`)
    if (!nameEl) return
    inlineEditor.edit(nameEl, getName(), updateName)
  })
}

function wireClassInteraction(r: ClassRenderer, cls: UmlClass) {
  wireElementInteraction(
    r.el,
    'class',
    cls.id,
    () => { const s = r.getRenderedSize(); const c = store.state.classes.find(c => c.id === cls.id) ?? cls; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'class-title',
    () => (store.state.classes.find(c => c.id === cls.id) ?? cls).name,
    val => store.updateClass(cls.id, { name: val }),
    /* noVerticalResize */ true,
  )

  // Additional dblclick handling for member editing (attributes/methods)
  r.el.addEventListener('dblclick', e => {
    const target = e.target as SVGTextElement
    if (!target.classList.contains('member-text')) return
    e.stopPropagation()
    const currentCls = store.state.classes.find(c => c.id === cls.id)!
    const idx  = parseInt(target.dataset.memberIdx  ?? '-1')
    const memberKind = target.dataset.memberKind
    if (idx < 0) return
    if (memberKind === 'attribute') {
      const attrs = [...currentCls.attributes]
      inlineEditor.edit(target, target.textContent ?? '', val => {
        attrs[idx] = { ...attrs[idx], raw: val }
        store.updateClass(cls.id, { attributes: attrs })
      })
    } else {
      const methods = [...currentCls.methods]
      inlineEditor.edit(target, target.textContent ?? '', val => {
        methods[idx] = { ...methods[idx], raw: val }
        store.updateClass(cls.id, { methods })
      })
    }
  })
}

function wirePackageInteraction(r: PackageRenderer, pkg: UmlPackage) {
  wireElementInteraction(
    r.el, 'package', pkg.id,
    () => { const s = r.getRenderedSize(); const c = store.state.packages.find(p => p.id === pkg.id) ?? pkg; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'pkg-name',
    () => (store.state.packages.find(p => p.id === pkg.id) ?? pkg).name,
    val => store.updatePackage(pkg.id, { name: val }),
  )
}

function wireStorageInteraction(r: StorageRenderer, storage: Storage) {
  wireElementInteraction(
    r.el, 'storage', storage.id,
    () => { const s = r.getRenderedSize(); const c = store.state.storages.find(st => st.id === storage.id) ?? storage; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'storage-name',
    () => (store.state.storages.find(s => s.id === storage.id) ?? storage).name,
    val => store.updateStorage(storage.id, { name: val }),
  )
}

function wireActorInteraction(r: ActorRenderer, actor: Actor) {
  wireElementInteraction(
    r.el, 'actor', actor.id,
    () => { const s = r.getRenderedSize(); const c = store.state.actors.find(a => a.id === actor.id) ?? actor; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'actor-name',
    () => (store.state.actors.find(a => a.id === actor.id) ?? actor).name,
    val => store.updateActor(actor.id, { name: val }),
  )
}

function wireQueueInteraction(r: QueueRenderer, queue: Queue) {
  wireElementInteraction(
    r.el, 'queue', queue.id,
    () => { const s = r.getRenderedSize(); const c = store.state.queues.find(q => q.id === queue.id) ?? queue; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'queue-name',
    () => (store.state.queues.find(q => q.id === queue.id) ?? queue).name,
    val => store.updateQueue(queue.id, { name: val }),
  )
}

function wireUseCaseInteraction(r: UseCaseRenderer, uc: UseCase) {
  wireElementInteraction(
    r.el, 'use-case', uc.id,
    () => { const s = r.getRenderedSize(); const c = store.state.useCases.find(u => u.id === uc.id) ?? uc; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'usecase-name',
    () => (store.state.useCases.find(u => u.id === uc.id) ?? uc).name,
    val => store.updateUseCase(uc.id, { name: val }),
  )
}

function wireUCSystemInteraction(r: UCSystemRenderer, sys: UCSystem) {
  wireElementInteraction(
    r.el, 'uc-system', sys.id,
    () => { const s = r.getRenderedSize(); const c = store.state.ucSystems.find(u => u.id === sys.id) ?? sys; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'ucsystem-name',
    () => (store.state.ucSystems.find(u => u.id === sys.id) ?? sys).name,
    val => store.updateUCSystem(sys.id, { name: val }),
  )
}

function wireStateInteraction(r: StateRenderer, state: State) {
  wireElementInteraction(
    r.el, 'state', state.id,
    () => { const s = r.getRenderedSize(); const c = store.state.states.find(s => s.id === state.id) ?? state; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'sd-state-name',
    () => (store.state.states.find(s => s.id === state.id) ?? state).name,
    val => store.updateState(state.id, { name: val }),
  )
}

function wireStartStateInteraction(r: StartStateRenderer, state: StartState) {
  r.el.addEventListener('mousedown', e => {
    if (connect.isConnecting) return
    if (toolbar.activeTool === 'pan') return
    e.stopPropagation()
    selection.select({ kind: 'start-state', id: state.id }, e.shiftKey)
    drag.startDrag({ kind: 'start-state', id: state.id }, e, selection.items)
  })
}

function wireEndStateInteraction(r: EndStateRenderer, state: EndState) {
  r.el.addEventListener('mousedown', e => {
    if (connect.isConnecting) return
    if (toolbar.activeTool === 'pan') return
    e.stopPropagation()
    selection.select({ kind: 'end-state', id: state.id }, e.shiftKey)
    drag.startDrag({ kind: 'end-state', id: state.id }, e, selection.items)
  })
}

// ─── Store → renderer sync ────────────────────────────────────────────────────

store.on(ev => {
  if (ev.type === 'class:add')        addClassRenderer(ev.payload as UmlClass)
  if (ev.type === 'class:remove')     { classRenderers.get(ev.payload as string)?.el.remove(); classRenderers.delete(ev.payload as string) }
  if (ev.type === 'package:add')      addPackageRenderer(ev.payload as UmlPackage)
  if (ev.type === 'package:remove')   { pkgRenderers.get(ev.payload as string)?.el.remove(); pkgRenderers.delete(ev.payload as string) }
  if (ev.type === 'storage:add')      addStorageRenderer(ev.payload as Storage)
  if (ev.type === 'storage:remove')   { storageRenderers.get(ev.payload as string)?.el.remove(); storageRenderers.delete(ev.payload as string) }
  if (ev.type === 'actor:add')        addActorRenderer(ev.payload as Actor)
  if (ev.type === 'actor:remove')     { actorRenderers.get(ev.payload as string)?.el.remove(); actorRenderers.delete(ev.payload as string) }
  if (ev.type === 'queue:add')        addQueueRenderer(ev.payload as Queue)
  if (ev.type === 'queue:remove')     { queueRenderers.get(ev.payload as string)?.el.remove(); queueRenderers.delete(ev.payload as string) }
  if (ev.type === 'usecase:add')      addUseCaseRenderer(ev.payload as UseCase)
  if (ev.type === 'usecase:remove')   { ucRenderers.get(ev.payload as string)?.el.remove(); ucRenderers.delete(ev.payload as string) }
  if (ev.type === 'ucsystem:add')     addUCSystemRenderer(ev.payload as UCSystem)
  if (ev.type === 'ucsystem:remove')  { ucSystemRenderers.get(ev.payload as string)?.el.remove(); ucSystemRenderers.delete(ev.payload as string) }
  if (ev.type === 'state:add')        addStateRenderer(ev.payload as State)
  if (ev.type === 'state:remove')     { stateRenderers.get(ev.payload as string)?.el.remove(); stateRenderers.delete(ev.payload as string) }
  if (ev.type === 'startstate:add')   addStartStateRenderer(ev.payload as StartState)
  if (ev.type === 'startstate:remove') { startStateRenderers.get(ev.payload as string)?.el.remove(); startStateRenderers.delete(ev.payload as string) }
  if (ev.type === 'endstate:add')     addEndStateRenderer(ev.payload as EndState)
  if (ev.type === 'endstate:remove')  { endStateRenderers.get(ev.payload as string)?.el.remove(); endStateRenderers.delete(ev.payload as string) }
  if (ev.type === 'connection:add')   { addConnectionRenderer(ev.payload as Connection); refreshConnections() }
  if (ev.type === 'connection:remove') {
    connRenderers.get(ev.payload as string)?.el.remove()
    connRenderers.delete(ev.payload as string)
    refreshConnections()
  }
  if (ev.type === 'diagram:load')     rebuildAll()

  // Close any open popover and properties panel when anything is removed
  const isRemove = ev.type.endsWith(':remove')
  if (isRemove) {
    dismissConnPopover?.()
    dismissConnPopover = null
    hideElementPropertiesPanel()
    selection.clear()
  }

  if (['class:update', 'package:update', 'storage:update', 'actor:update', 'queue:update', 'connection:update', 'usecase:update', 'ucsystem:update', 'state:update', 'startstate:update', 'endstate:update'].includes(ev.type)) {
    refreshConnections()
    showPropertiesForSelection()
  }

  saveDiagram(store.state)
})

// ─── Connection line refresh ──────────────────────────────────────────────────

function refreshConnections() {
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
}

// ─── Selection → renderer highlight ──────────────────────────────────────────

selection.onChange(items => {
  const ids = new Set(items.map(i => i.id))
  classRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  pkgRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  storageRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  actorRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  queueRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  ucRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  ucSystemRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  stateRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  startStateRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  endStateRenderers.forEach((r, id) => r.setSelected(ids.has(id)))
  connRenderers.forEach((r, id) => r.setSelected(ids.has(id)))

  showPropertiesForSelection()
})

// ─── Canvas mouse events ──────────────────────────────────────────────────────

svg.addEventListener('dblclick', e => {
  if (e.button !== 0) return
  const tool = toolbar.activeTool
  const pt = getSvgPoint(e)
  // Don't create if double-clicking on an existing element
  const target = e.target as Element
  if (target.closest('[data-id]')) return

  if (tool === 'class') {
    store.addClass(createUmlClass({ name: 'NewClass', position: { x: pt.x - 90, y: pt.y - 60 } }))
    return
  }
  if (tool === 'package') {
    store.addPackage(createUmlPackage({ name: 'com.example', position: { x: pt.x - 160, y: pt.y - 120 } }))
    return
  }
  if (tool === 'storage') {
    store.addStorage(createStorage({ name: 'DataStore', position: { x: pt.x - 80, y: pt.y - 30 } }))
    return
  }
  if (tool === 'agent') {
    store.addActor(createActor({ elementType: 'agent', name: 'Agent', position: { x: pt.x - 60, y: pt.y - 30 } }))
    return
  }
  if (tool === 'human-agent') {
    store.addActor(createActor({ elementType: 'human-agent', name: 'User', position: { x: pt.x - 40, y: pt.y - 50 } }))
    return
  }
  if (tool === 'queue') {
    store.addQueue(createQueue({ name: 'Queue', position: { x: pt.x - 80, y: pt.y - 30 } }))
    return
  }
  if (tool === 'use-case') {
    store.addUseCase(createUseCase({ name: 'Use Case', position: { x: pt.x - 70, y: pt.y - 30 } }))
    return
  }
  if (tool === 'uc-actor') {
    store.addActor(createActor({ elementType: 'uc-actor', name: 'Actor', position: { x: pt.x - 40, y: pt.y - 50 } }))
    return
  }
  if (tool === 'uc-system') {
    store.addUCSystem(createUCSystem({ name: 'System', position: { x: pt.x - 130, y: pt.y - 100 } }))
    return
  }
  if (tool === 'state') {
    store.addState(createState({ name: 'State', position: { x: pt.x - 60, y: pt.y - 22 } }))
    return
  }
  if (tool === 'start-state') {
    store.addStartState(createStartState({ position: { x: pt.x - 14, y: pt.y - 14 } }))
    return
  }
  if (tool === 'end-state') {
    store.addEndState(createEndState({ position: { x: pt.x - 18, y: pt.y - 18 } }))
    return
  }
})

// ─── Rubber-band selection ────────────────────────────────────────────────────

let rubberBanding = false
let rubberStart = { x: 0, y: 0 }

svg.addEventListener('mousedown', e => {
  if (connect.isConnecting) return
  if (e.button !== 0) return
  if (toolbar.activeTool === 'pan') return
  // Only start rubber-band if clicking on empty canvas (not on an element)
  const target = e.target as Element
  if (target.closest('[data-id]')) {
    // Clicked on an element — let its own mousedown handler take over
    return
  }
  // Clicked on empty canvas — always clear selection and close dialogs
  dismissConnPopover?.()
  dismissConnPopover = null
  hideElementPropertiesPanel()
  selection.clear()

  // Only start rubber-band in select mode
  if (toolbar.activeTool !== 'select') return
  const pt = getSvgPoint(e)
  rubberBanding = true
  rubberStart = { x: pt.x, y: pt.y }
  rubberBandRect.setAttribute('x', String(pt.x))
  rubberBandRect.setAttribute('y', String(pt.y))
  rubberBandRect.setAttribute('width', '0')
  rubberBandRect.setAttribute('height', '0')
  rubberBandRect.style.display = ''
  e.preventDefault()
})

window.addEventListener('mousemove', e => {
  if (drag.isDragging)      drag.onMouseMove(e)
  if (resize.isResizing)    resize.onMouseMove(e)
  if (connect.isConnecting) connect.onMouseMove(e)
  if (rubberBanding) {
    const pt = getSvgPoint(e)
    const rx = Math.min(pt.x, rubberStart.x)
    const ry = Math.min(pt.y, rubberStart.y)
    const rw = Math.abs(pt.x - rubberStart.x)
    const rh = Math.abs(pt.y - rubberStart.y)
    rubberBandRect.setAttribute('x', String(rx))
    rubberBandRect.setAttribute('y', String(ry))
    rubberBandRect.setAttribute('width', String(rw))
    rubberBandRect.setAttribute('height', String(rh))
  }
})

// Update resize cursor based on hover position
svg.addEventListener('mousemove', e => {
  if (drag.isDragging || resize.isResizing || connect.isConnecting || rubberBanding) return

  // Collect all element renderers so we can set cursor directly on each <g>
  // (CSS cursor:move on the element classes overrides svg.style.cursor)
  const allRendererEls = new Map<string, SVGGElement>()
  classRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  pkgRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  storageRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  actorRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  queueRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  ucRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  ucSystemRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  stateRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  startStateRenderers.forEach((r, id) => allRendererEls.set(id, r.el))
  endStateRenderers.forEach((r, id) => allRendererEls.set(id, r.el))

  // No resize cursor when multiple elements are selected
  if (selection.items.length > 1) {
    allRendererEls.forEach(el => { el.style.cursor = '' })
    return
  }

  const d = store.state
  const allElements = [
    ...d.classes.map(c => { const s = classRenderers.get(c.id)?.getRenderedSize() ?? c.size; return { kind: 'class' as const, id: c.id, x: c.position.x, y: c.position.y, w: s.w, h: s.h } }),
    ...d.packages.map(p => { const s = pkgRenderers.get(p.id)?.getRenderedSize() ?? p.size; return { kind: 'package' as const, id: p.id, x: p.position.x, y: p.position.y, w: s.w, h: s.h } }),
    ...d.storages.map(s => { const rs = storageRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'storage' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
    ...d.actors.map(a => { const s = actorRenderers.get(a.id)?.getRenderedSize() ?? a.size; return { kind: 'actor' as const, id: a.id, x: a.position.x, y: a.position.y, w: s.w, h: s.h } }),
    ...d.queues.map(q => { const s = queueRenderers.get(q.id)?.getRenderedSize() ?? q.size; return { kind: 'queue' as const, id: q.id, x: q.position.x, y: q.position.y, w: s.w, h: s.h } }),
    ...d.useCases.map(u => { const s = ucRenderers.get(u.id)?.getRenderedSize() ?? u.size; return { kind: 'use-case' as const, id: u.id, x: u.position.x, y: u.position.y, w: s.w, h: s.h } }),
    ...d.ucSystems.map(u => { const s = ucSystemRenderers.get(u.id)?.getRenderedSize() ?? u.size; return { kind: 'uc-system' as const, id: u.id, x: u.position.x, y: u.position.y, w: s.w, h: s.h } }),
    ...(d.states ?? []).map(s => { const rs = stateRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'state' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
    ...(d.startStates ?? []).map(s => { const rs = startStateRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'start-state' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
    ...(d.endStates ?? []).map(s => { const rs = endStateRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'end-state' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
  ]

  let hit = resize.hitTest(e, allElements)
  if (hit?.kind === 'class' && (hit.edge === 'n' || hit.edge === 's')) hit = null

  // Apply cursor directly on the element <g> so it beats the CSS cursor:move rule.
  // Clear all first, then set the one that was hit.
  allRendererEls.forEach(el => { el.style.cursor = '' })
  if (hit) {
    const el = allRendererEls.get(hit.id)
    if (el) el.style.cursor = resize.edgeCursor(hit.edge)
  }
})

window.addEventListener('mouseup', e => {
  if (drag.isDragging)   { drag.onMouseUp(); return }
  if (resize.isResizing) { resize.onMouseUp(); return }
  if (rubberBanding) {
    rubberBanding = false
    rubberBandRect.style.display = 'none'
    const rx = parseFloat(rubberBandRect.getAttribute('x') ?? '0')
    const ry = parseFloat(rubberBandRect.getAttribute('y') ?? '0')
    const rw = parseFloat(rubberBandRect.getAttribute('width') ?? '0')
    const rh = parseFloat(rubberBandRect.getAttribute('height') ?? '0')
    // Only commit if the rect is large enough to be intentional (not a stray click)
    if (rw > 4 || rh > 4) {
      const d = store.state
      const allEls = [
        ...d.classes.map(c => { const s = classRenderers.get(c.id)?.getRenderedSize() ?? c.size; return { kind: 'class' as const, id: c.id, x: c.position.x, y: c.position.y, w: s.w, h: s.h } }),
        ...d.packages.map(p => { const s = pkgRenderers.get(p.id)?.getRenderedSize() ?? p.size; return { kind: 'package' as const, id: p.id, x: p.position.x, y: p.position.y, w: s.w, h: s.h } }),
        ...d.storages.map(s => { const rs = storageRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'storage' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
        ...d.actors.map(a => { const s = actorRenderers.get(a.id)?.getRenderedSize() ?? a.size; return { kind: 'actor' as const, id: a.id, x: a.position.x, y: a.position.y, w: s.w, h: s.h } }),
        ...d.queues.map(q => { const s = queueRenderers.get(q.id)?.getRenderedSize() ?? q.size; return { kind: 'queue' as const, id: q.id, x: q.position.x, y: q.position.y, w: s.w, h: s.h } }),
        ...d.useCases.map(u => { const s = ucRenderers.get(u.id)?.getRenderedSize() ?? u.size; return { kind: 'use-case' as const, id: u.id, x: u.position.x, y: u.position.y, w: s.w, h: s.h } }),
        ...d.ucSystems.map(u => { const s = ucSystemRenderers.get(u.id)?.getRenderedSize() ?? u.size; return { kind: 'uc-system' as const, id: u.id, x: u.position.x, y: u.position.y, w: s.w, h: s.h } }),
        ...(d.states ?? []).map(s => { const rs = stateRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'state' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
        ...(d.startStates ?? []).map(s => { const rs = startStateRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'start-state' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
        ...(d.endStates ?? []).map(s => { const rs = endStateRenderers.get(s.id)?.getRenderedSize() ?? s.size; return { kind: 'end-state' as const, id: s.id, x: s.position.x, y: s.position.y, w: rs.w, h: rs.h } }),
      ]
      for (const el of allEls) {
        // Select elements whose bounds overlap the rubber-band rect
        if (el.x + el.w > rx && el.x < rx + rw && el.y + el.h > ry && el.y < ry + rh) {
          selection.select({ kind: el.kind, id: el.id }, true)
        }
      }
    }
    return
  }
  if (connect.isConnecting) {
    const target = e.target as Node
    const el = target instanceof Element ? target : null
    const portEl  = el?.closest?.('.port') as SVGElement | null
    const hostEl  = el?.closest?.('[data-id]') as SVGElement | null
    const targetId   = hostEl?.dataset.id   ?? null
    const targetPort = portEl?.dataset.port ?? (hostEl ? nearestPort(e, hostEl) : null)
    const targetType = hostEl?.dataset.elementType ?? undefined
    connect.onMouseUp(e, targetId, targetPort, targetType)
  }
})

document.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  selection.items.forEach(item => {
    if (item.kind === 'class')      store.removeClass(item.id)
    if (item.kind === 'package')    store.removePackage(item.id)
    if (item.kind === 'storage')    store.removeStorage(item.id)
    if (item.kind === 'actor')      store.removeActor(item.id)
    if (item.kind === 'queue')      store.removeQueue(item.id)
    if (item.kind === 'use-case')    store.removeUseCase(item.id)
    if (item.kind === 'uc-system')   store.removeUCSystem(item.id)
    if (item.kind === 'state')       store.removeState(item.id)
    if (item.kind === 'start-state') store.removeStartState(item.id)
    if (item.kind === 'end-state')   store.removeEndState(item.id)
    if (item.kind === 'connection') store.removeConnection(item.id)
  })
  selection.clear()
})

// ─── Copy / Paste ─────────────────────────────────────────────────────────────

type ClipboardEntry =
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

// Simple clipboard — array of deep-cloned entity snapshots (no connections)
let clipboard: ClipboardEntry[] = []

const PASTE_OFFSET = 20

document.addEventListener('keydown', e => {
  // Skip when typing in an input / textarea
  if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
  const mod = e.ctrlKey || e.metaKey

  if (mod && e.key === 'c') {
    const d = store.state
    clipboard = []
    for (const item of selection.items) {
      if (item.kind === 'class') {
        const el = d.classes.find(c => c.id === item.id)
        if (el) clipboard.push({ kind: 'class', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'package') {
        const el = d.packages.find(p => p.id === item.id)
        if (el) clipboard.push({ kind: 'package', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'storage') {
        const el = d.storages.find(s => s.id === item.id)
        if (el) clipboard.push({ kind: 'storage', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'actor') {
        const el = d.actors.find(a => a.id === item.id)
        if (el) clipboard.push({ kind: 'actor', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'queue') {
        const el = d.queues.find(q => q.id === item.id)
        if (el) clipboard.push({ kind: 'queue', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'use-case') {
        const el = d.useCases.find(u => u.id === item.id)
        if (el) clipboard.push({ kind: 'use-case', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'uc-system') {
        const el = d.ucSystems.find(u => u.id === item.id)
        if (el) clipboard.push({ kind: 'uc-system', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'state') {
        const el = d.states?.find(s => s.id === item.id)
        if (el) clipboard.push({ kind: 'state', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'start-state') {
        const el = d.startStates?.find(s => s.id === item.id)
        if (el) clipboard.push({ kind: 'start-state', data: JSON.parse(JSON.stringify(el)) })
      } else if (item.kind === 'end-state') {
        const el = d.endStates?.find(s => s.id === item.id)
        if (el) clipboard.push({ kind: 'end-state', data: JSON.parse(JSON.stringify(el)) })
      }
      // connections are intentionally excluded
    }
  }

  if (mod && e.key === 'v') {
    if (clipboard.length === 0) return
    e.preventDefault()
    selection.clear()
    for (const entry of clipboard) {
      const newId = crypto.randomUUID()
      const pos = {
        x: entry.data.position.x + PASTE_OFFSET,
        y: entry.data.position.y + PASTE_OFFSET,
      }
      if (entry.kind === 'class') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addClass(copy)
        selection.select({ kind: 'class', id: newId }, true)
      } else if (entry.kind === 'package') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addPackage(copy)
        selection.select({ kind: 'package', id: newId }, true)
      } else if (entry.kind === 'storage') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addStorage(copy)
        selection.select({ kind: 'storage', id: newId }, true)
      } else if (entry.kind === 'actor') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addActor(copy)
        selection.select({ kind: 'actor', id: newId }, true)
      } else if (entry.kind === 'queue') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addQueue(copy)
        selection.select({ kind: 'queue', id: newId }, true)
      } else if (entry.kind === 'use-case') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addUseCase(copy)
        selection.select({ kind: 'use-case', id: newId }, true)
      } else if (entry.kind === 'uc-system') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addUCSystem(copy)
        selection.select({ kind: 'uc-system', id: newId }, true)
      } else if (entry.kind === 'state') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addState(copy)
        selection.select({ kind: 'state', id: newId }, true)
      } else if (entry.kind === 'start-state') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addStartState(copy)
        selection.select({ kind: 'start-state', id: newId }, true)
      } else if (entry.kind === 'end-state') {
        const copy = { ...entry.data, id: newId, position: pos }
        store.addEndState(copy)
        selection.select({ kind: 'end-state', id: newId }, true)
      }
    }
    // Shift clipboard so repeated pastes cascade rather than stack
    clipboard = clipboard.map(entry => ({
      ...entry,
      data: { ...entry.data, position: { x: entry.data.position.x + PASTE_OFFSET, y: entry.data.position.y + PASTE_OFFSET } },
    })) as typeof clipboard
  }
})

// ─── File keyboard shortcuts ──────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  if (!e.shiftKey && !e.altKey && e.key === 'n') {
    e.preventDefault()
    fileMenuCallbacks.onNew()
  }
  if (e.shiftKey && !e.altKey && e.key === 'S') {
    e.preventDefault()
    fileMenuCallbacks.onSave()
  }
  if (e.shiftKey && e.altKey && e.key === 'S') {
    e.preventDefault()
    fileMenuCallbacks.onSaveAs()
  }
  if (e.shiftKey && e.key === 'O') {
    e.preventDefault()
    fileMenuCallbacks.onOpen()
  }
  if (e.shiftKey && e.key === 'E') {
    e.preventDefault()
    fileMenuCallbacks.onExportPng()
  }
})

// ─── Pan & zoom ───────────────────────────────────────────────────────────────

let panActive = false
let panStart = { x: 0, y: 0 }
let vpStart  = { x: 0, y: 0 }

svg.addEventListener('mousedown', e => {
  if (toolbar.activeTool !== 'pan') return
  panActive = true
  panStart = { x: e.clientX, y: e.clientY }
  vpStart  = { x: store.state.viewport.x, y: store.state.viewport.y }
})

window.addEventListener('mousemove', e => {
  if (!panActive) return
  store.updateViewport({ x: vpStart.x + e.clientX - panStart.x, y: vpStart.y + e.clientY - panStart.y })
  applyViewport()
})

window.addEventListener('mouseup', () => { panActive = false })

svg.addEventListener('wheel', e => {
  e.preventDefault()
  const vp = store.state.viewport
  const newZoom = Math.min(4, Math.max(0.2, vp.zoom * (e.deltaY < 0 ? 1.1 : 0.9)))
  store.updateViewport({ zoom: newZoom })
  applyViewport()
}, { passive: false })

// ─── Zoom indicator / controller ─────────────────────────────────────────────

const canvasContainer = document.getElementById('canvas-container')!

const zoomCtrl = document.createElement('div')
zoomCtrl.id = 'zoom-ctrl'
zoomCtrl.innerHTML = `
  <button id="zoom-out" class="zoom-btn" title="Zoom out (scroll down)">−</button>
  <span id="zoom-label" class="zoom-label">100%</span>
  <button id="zoom-in"  class="zoom-btn" title="Zoom in (scroll up)">+</button>
  <button id="zoom-reset" class="zoom-btn zoom-reset" title="Reset zoom">⟳</button>
`
canvasContainer.appendChild(zoomCtrl)

const zoomLabel = document.getElementById('zoom-label')!

function updateZoomLabel() {
  const z = store.state.viewport.zoom
  zoomLabel.textContent = `${Math.round(z * 100)}%`
}

document.getElementById('zoom-out')!.addEventListener('click', () => {
  const vp = store.state.viewport
  const newZoom = Math.min(4, Math.max(0.2, vp.zoom * 0.9))
  store.updateViewport({ zoom: newZoom })
  applyViewport()
  updateZoomLabel()
})

document.getElementById('zoom-in')!.addEventListener('click', () => {
  const vp = store.state.viewport
  const newZoom = Math.min(4, Math.max(0.2, vp.zoom * 1.1))
  store.updateViewport({ zoom: newZoom })
  applyViewport()
  updateZoomLabel()
})

document.getElementById('zoom-reset')!.addEventListener('click', () => {
  store.updateViewport({ zoom: 1, x: 0, y: 0 })
  applyViewport()
  updateZoomLabel()
})

function applyViewport() {
  const { x, y, zoom } = store.state.viewport
  viewGroup.setAttribute('transform', `translate(${x},${y}) scale(${zoom})`)
  updateZoomLabel()
}

// ─── Build initial diagram ────────────────────────────────────────────────────

function rebuildAll() {
  clsLayer.innerHTML = ''
  pkgLayer.innerHTML = ''
  storageLayer.innerHTML = ''
  actorLayer.innerHTML = ''
  queueLayer.innerHTML = ''
  ucLayer.innerHTML = ''
  ucSystemLayer.innerHTML = ''
  stateLayer.innerHTML = ''
  connLayer.innerHTML = ''
  classRenderers.clear()
  pkgRenderers.clear()
  storageRenderers.clear()
  actorRenderers.clear()
  queueRenderers.clear()
  ucRenderers.clear()
  ucSystemRenderers.clear()
  stateRenderers.clear()
  startStateRenderers.clear()
  endStateRenderers.clear()
  connRenderers.clear()

  const d = store.state
  d.packages.forEach(addPackageRenderer)
  d.storages.forEach(addStorageRenderer)
  d.actors.forEach(addActorRenderer)
  d.queues.forEach(addQueueRenderer)
  d.ucSystems.forEach(addUCSystemRenderer)
  d.useCases.forEach(addUseCaseRenderer)
  d.states?.forEach(addStateRenderer)
  d.startStates?.forEach(addStartStateRenderer)
  d.endStates?.forEach(addEndStateRenderer)
  d.classes.forEach(addClassRenderer)
  d.connections.forEach(addConnectionRenderer)
  refreshConnections()
  applyViewport()
}

rebuildAll()
