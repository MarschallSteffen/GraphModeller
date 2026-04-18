import { DiagramStore } from './store/DiagramStore.ts'
import { loadSavedTheme } from './themes/catppuccin.ts'
import { loadDiagram, saveDiagram, openAndSaveToFile, closeActiveFile, setActiveFileHandle, setActiveThumbnailId, getThumbnailDataUrl, getActiveFileName, loadDiagramFromFile, serializeDiagramV2, deserializeV2, onPngSaveError, onPngSaveRecovered, acquireWriteHandle, readDiagramJsonFromHandle, exportDiagramToPng } from './serialization/persistence.ts'
import { ClassRenderer } from './renderers/ClassRenderer.ts'
import { PackageRenderer } from './renderers/PackageRenderer.ts'
import { StorageRenderer } from './renderers/StorageRenderer.ts'
import { ActorRenderer } from './renderers/ActorRenderer.ts'
import { QueueRenderer } from './renderers/QueueRenderer.ts'
import { UseCaseRenderer } from './renderers/UseCaseRenderer.ts'
import { StateRenderer } from './renderers/StateRenderer.ts'
import { StartStateRenderer } from './renderers/StartStateRenderer.ts'
import { EndStateRenderer } from './renderers/EndStateRenderer.ts'
import { SequenceDiagramRenderer } from './renderers/SequenceDiagramRenderer.ts'
import { CombinedFragmentRenderer } from './renderers/CombinedFragmentRenderer.ts'
import { CommentRenderer } from './renderers/CommentRenderer.ts'
import { ConnectionRenderer, injectMarkerDefs } from './renderers/ConnectionRenderer.ts'
import { DragController } from './interaction/DragController.ts'
import { ResizeController } from './interaction/ResizeController.ts'
import { ConnectionController } from './interaction/ConnectionController.ts'
import { SelectionManager } from './interaction/SelectionManager.ts'
import { InlineEditor } from './interaction/InlineEditor.ts'
import { ViewportController } from './interaction/ViewportController.ts'
import { Toolbar, type Tool as ToolKind } from './ui/Toolbar.ts'
import { SequenceDiagramController } from './ui/SequenceDiagramController.ts'
import { FileMenu } from './ui/FileMenu.ts'
import { EditMenu } from './ui/EditMenu.ts'
import { ViewMenu } from './ui/ViewMenu.ts'
import { Minimap } from './ui/Minimap.ts'
import { AiPromptButton } from './ui/AiPromptButton.ts'
import { saveHandle, loadHandle } from './serialization/fileHandleStore.ts'
import { Dashboard, addRecentFile, getRecentFiles, injectPersistence, injectHandleStore, injectThumbnailCache, injectReadDiagramJson, injectAcquireWriteHandle } from './ui/Dashboard.ts'
import { showConnectionPopover } from './ui/ConnectionPopover.ts'
import { hideMsgPopover } from './ui/MessagePopover.ts'
import { hideElementPropertiesPanel } from './ui/ElementPropertiesPanel.ts'
import { PropertiesOrchestrator, type PatchFn } from './ui/PropertiesOrchestrator.ts'
import { AlignmentToolbar } from './ui/AlignmentToolbar.ts'
import { createSearchPanel } from './ui/SearchPanel.ts'
import { toggleHelpModal } from './ui/HelpModal.ts'
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
import { createSequenceDiagram } from './entities/SequenceDiagram.ts'
import type { SequenceDiagram } from './entities/SequenceDiagram.ts'
import { createCombinedFragment } from './entities/CombinedFragment.ts'
import { createComment } from './entities/Comment.ts'
import type { Comment } from './entities/Comment.ts'
import { createDiagram } from './entities/Diagram.ts'
import type { Diagram } from './entities/Diagram.ts'
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
import type { CombinedFragment } from './entities/CombinedFragment.ts'
import type { Connection } from './entities/Connection.ts'
import { getElementConfig } from './config/registry.ts'
import type { ElementKind } from './types.ts'
import type { ElbowMode } from './entities/Connection.ts'
import { elementShape, shapedBorderDist } from './geometry/shapeGeometry.ts'
import { getAllElementRects as _getAllElementRects, getContainedElements as _getContainedElements, type LayoutElementDesc } from './geometry/elementLayout.ts'
import { Clipboard } from './interaction/Clipboard.ts'
import { RubberBandSelector } from './interaction/RubberBandSelector.ts'
import { ConnectionRefresher } from './renderers/ConnectionRefresher.ts'

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSavedTheme()
injectPersistence({ deserializeV2 })
injectHandleStore({ loadHandle })
injectThumbnailCache(getThumbnailDataUrl)
injectReadDiagramJson(readDiagramJsonFromHandle)
injectAcquireWriteHandle(acquireWriteHandle)

const svg = document.getElementById('canvas') as unknown as SVGSVGElement
injectMarkerDefs(svg)

const diagram = loadDiagram()
const store = new DiagramStore(diagram ?? undefined)
const selection = new SelectionManager()
let clipboardManager = null as unknown as Clipboard
const toolbar = new Toolbar(document.getElementById('toolbar')!)
const inlineEditor = new InlineEditor()

// ─── SVG viewport transform group ─────────────────────────────────────────────

const viewGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
viewGroup.id = 'view-group'
svg.appendChild(viewGroup)

// ─── File menu ─────────────────────────────────────────────────────────────────

const fileMenuCallbacks = {
  onNew: () => {
    showDashboard()
  },
  onOpen: () => {
    loadDiagramFromFile((d, handle, rawJson) => {
      store.load(d)
      setActiveThumbnailId(d.id)
      saveDiagram(d)
      fileMenu.setTitle(d.name ?? 'Untitled')
      fileMenu.setFileIndicator(getActiveFileName())
      const entry = {
        id: d.id,
        name: d.name || 'Untitled',
        filename: handle?.name ?? null,
        timestamp: Date.now(),
        data: rawJson,
      }
      addRecentFile(entry)
      if (handle) saveHandle(d.id, handle).catch(() => {})
      hideDashboard()
    })
  },
  onSave: () => {
    const d = store.state
    const name = fileMenu.getTitle() || 'diagram'
    openAndSaveToFile(d, `${name}.arch.svg`).then(result => {
      if (!result) return  // cancelled
      setActiveThumbnailId(d.id)
      fileMenu.setFileIndicator(getActiveFileName())
      if (result !== true) {
        // New handle was picked — persist it and update recent file entry
        saveHandle(d.id, result).catch(() => {})
        addRecentFile({ id: d.id, name: d.name || 'Untitled', filename: result.name, timestamp: Date.now(), data: JSON.stringify(serializeDiagramV2(d)) })
      }
    }).catch(console.error)
  },
  onSaveAs: () => {
    const d = store.state
    const name = fileMenu.getTitle() || 'diagram'
    openAndSaveToFile(d, `${name}.arch.png`, /* forceNew */ true).then(result => {
      if (!result) return  // cancelled
      setActiveThumbnailId(d.id)
      fileMenu.setFileIndicator(getActiveFileName())
      if (result !== true) {
        // New handle was picked — persist it and update recent file entry
        saveHandle(d.id, result).catch(() => {})
        addRecentFile({ id: d.id, name: d.name || 'Untitled', filename: result.name, timestamp: Date.now(), data: JSON.stringify(serializeDiagramV2(d)) })
      }
    }).catch(console.error)
  },
  onExportPng: () => {
    exportDiagramToPng(fileMenu.getTitle() || 'diagram')
  },
  onTitleChange: (title: string) => {
    store.updateDiagramName(title)
    saveDiagram(store.state)
  },
}

const fileMenu = new FileMenu(document.getElementById('titlebar')!, fileMenuCallbacks)

onPngSaveError    (msg => fileMenu.notifySaveError(msg))
onPngSaveRecovered(()  => fileMenu.notifySaveRecovered())

// Insert Edit menu between File button and title input
const editMenuAnchor = document.createElement('div')
editMenuAnchor.style.display = 'contents'
const titlebar = document.getElementById('titlebar')!
titlebar.insertBefore(editMenuAnchor, titlebar.children[1])

// Insert View menu after Edit menu anchor
const viewMenuAnchor = document.createElement('div')
viewMenuAnchor.style.display = 'contents'
titlebar.insertBefore(viewMenuAnchor, titlebar.children[2])

function deleteSelection() {
  selection.items.forEach(item => {
    if (item.kind === 'connection') { store.removeConnection(item.id); return }
    const desc = ELEMENTS.find(d => d.kind === item.kind)
    if (desc) desc.remove(item.id)
  })
  selection.clear()
}

function selectAll() {
  const items: import('./interaction/SelectionManager.ts').Selectable[] = []
  for (const desc of ELEMENTS) {
    const col = (store.state as any)[desc.collection] as Array<{ id: string }>
    if (!col) continue
    for (const el of col) items.push({ kind: desc.kind, id: el.id })
  }
  for (const conn of store.state.connections) items.push({ kind: 'connection', id: conn.id })
  selection.setAll(items)
}

const editMenu = new EditMenu(editMenuAnchor, {
  onUndo:      () => { store.undo(); updateEditMenu() },
  onRedo:      () => { store.redo(); updateEditMenu() },
  onCopy:      () => doCopy(),
  onPaste:     () => doPaste(),
  onSelectAll: () => selectAll(),
  onDelete:    () => deleteSelection(),
})

function updateEditMenu() {
  editMenu.setHistoryState(store.canUndo, store.canRedo)
  editMenu.setClipboardState(selection.items.length > 0, clipboardManager.hasContent)
}

store.on(ev => { if (ev.type === 'history:change') updateEditMenu() })
selection.onChange(() => updateEditMenu())

// ─── View menu + show-comments toggle ─────────────────────────────────────────

let showComments = JSON.parse(localStorage.getItem('archetype:show-comments') ?? 'true') as boolean

const viewMenu = new ViewMenu(viewMenuAnchor, {
  onToggleComments: (show: boolean) => {
    showComments = show
    localStorage.setItem('archetype:show-comments', JSON.stringify(show))
    commentLayer.style.display = show ? '' : 'none'
  },
  onToggleMinimap: (show: boolean) => {
    minimap.setVisible(show)
  },
}, showComments, JSON.parse(localStorage.getItem('archetype:show-minimap') ?? 'true') as boolean)

function ensureCommentsVisible() {
  if (!showComments) {
    showComments = true
    localStorage.setItem('archetype:show-comments', JSON.stringify(true))
    commentLayer.style.display = ''
    viewMenu.setCommentsVisible(true)
  }
}

// AI prompt button — pushed to the right end of the titlebar
const aiBtnAnchor = document.createElement('div')
aiBtnAnchor.classList.add('titlebar-right')
titlebar.appendChild(aiBtnAnchor)
new AiPromptButton(aiBtnAnchor)

// ─── Home button + Dashboard ──────────────────────────────────────────────────

const homeBtn = document.createElement('button')
homeBtn.className = 'titlebar-home-btn'
homeBtn.title = 'Home'
homeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="14" height="14" rx="3" fill="currentColor" opacity="0.9"/>
  <rect x="20" y="2" width="14" height="14" rx="3" fill="currentColor" opacity="0.65"/>
  <rect x="2" y="20" width="14" height="14" rx="3" fill="currentColor" opacity="0.65"/>
  <rect x="20" y="20" width="14" height="14" rx="3" fill="currentColor" opacity="0.45"/>
</svg>`
titlebar.insertBefore(homeBtn, titlebar.firstChild)

const appEl = document.getElementById('app')!

const dashboard = new Dashboard({
  onNew: () => {
    closeActiveFile()
    const fresh = createDiagram('Untitled')
    store.load(fresh)
    saveDiagram(fresh)
    fileMenu.setTitle(fresh.name)
    fileMenu.setFileIndicator(null)
    hideDashboard()
  },
  onOpen: () => {
    loadDiagramFromFile((d, handle, rawJson) => {
      store.load(d)
      setActiveThumbnailId(d.id)
      saveDiagram(d)
      fileMenu.setTitle(d.name ?? 'Untitled')
      fileMenu.setFileIndicator(getActiveFileName())
      const entry = {
        id: d.id,
        name: d.name || 'Untitled',
        filename: handle?.name ?? null,
        timestamp: Date.now(),
        data: rawJson,
      }
      addRecentFile(entry)
      if (handle) saveHandle(d.id, handle).catch(() => {})
      hideDashboard()
    })
  },
  onResume: (_file, d, handle) => {
    closeActiveFile()
    if (handle) setActiveFileHandle(handle)
    setActiveThumbnailId(d.id)
    store.load(d)
    saveDiagram(d)
    fileMenu.setTitle(d.name ?? 'Untitled')
    fileMenu.setFileIndicator(handle?.name ?? null)
    hideDashboard()
  },
})
appEl.appendChild(dashboard.el)

function showDashboard() {
  dashboard.refresh()
  dashboard.el.style.display = 'flex'
  homeBtn.classList.add('active')
  titlebar.classList.add('dashboard-open')
}

function hideDashboard() {
  dashboard.el.style.display = 'none'
  homeBtn.classList.remove('active')
  titlebar.classList.remove('dashboard-open')
}

homeBtn.addEventListener('click', () => {
  if (dashboard.el.style.display === 'none') {
    showDashboard()
  } else {
    hideDashboard()
  }
})

// Show dashboard on start if there are recent files, otherwise go straight to editor
if (getRecentFiles().length > 0) {
  showDashboard()
} else {
  hideDashboard()
}

// Initialise title from loaded diagram
fileMenu.setTitle(store.state.name ?? 'Untitled')

const pkgLayer      = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const storageLayer  = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const actorLayer    = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const queueLayer    = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const ucLayer       = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const stateLayer    = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const seqLayer      = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const seqConnLayer  = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const connLayer     = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const clsLayer      = document.createElementNS('http://www.w3.org/2000/svg', 'g')
const commentLayer  = document.createElementNS('http://www.w3.org/2000/svg', 'g')
viewGroup.append(pkgLayer, storageLayer, actorLayer, queueLayer, ucLayer, stateLayer, seqLayer, seqConnLayer, connLayer, clsLayer, commentLayer)

// Apply initial show-comments state (set before layers were declared)
commentLayer.style.display = showComments ? '' : 'none'

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
const ucSystemRenderers = new Map<string, PackageRenderer>()
const stateRenderers      = new Map<string, StateRenderer>()
const startStateRenderers = new Map<string, StartStateRenderer>()
const endStateRenderers   = new Map<string, EndStateRenderer>()
const seqDiagramRenderers    = new Map<string, SequenceDiagramRenderer>()
const seqFragmentRenderers  = new Map<string, CombinedFragmentRenderer>()
const commentRenderers      = new Map<string, CommentRenderer>()
const connRenderers     = new Map<string, ConnectionRenderer>()

// ─── Unified element descriptor table ────────────────────────────────────────
// Enables generic loops for selection, copy/paste, delete, rubber-band, etc.

interface AnyRenderer {
  readonly el: SVGGElement
  setSelected(s: boolean): void
  getRenderedSize(): { w: number; h: number }
  getContentMinSize(): { w: number; h: number }
  destroy(): void
}

interface ElementDesc {
  kind: ElementKind
  collection: keyof Diagram
  renderers: Map<string, AnyRenderer>
  remove: (id: string) => void
  add: (el: any) => void
  addRenderer: (el: any) => void
}

// Filled after store is available (below). Order matters for z-order in rebuildAll.
let ELEMENTS: ElementDesc[] = []

function initElementDescriptors() {
  ELEMENTS = [
    { kind: 'package',     collection: 'packages',          renderers: pkgRenderers as Map<string, AnyRenderer>,           remove: id => store.removePackage(id),           add: el => store.addPackage(el),           addRenderer: addPackageRenderer },
    { kind: 'storage',     collection: 'storages',          renderers: storageRenderers as Map<string, AnyRenderer>,       remove: id => store.removeStorage(id),           add: el => store.addStorage(el),           addRenderer: addStorageRenderer },
    { kind: 'actor',       collection: 'actors',            renderers: actorRenderers as Map<string, AnyRenderer>,         remove: id => store.removeActor(id),             add: el => store.addActor(el),             addRenderer: addActorRenderer },
    { kind: 'queue',       collection: 'queues',            renderers: queueRenderers as Map<string, AnyRenderer>,         remove: id => store.removeQueue(id),             add: el => store.addQueue(el),             addRenderer: addQueueRenderer },
    { kind: 'use-case',    collection: 'useCases',          renderers: ucRenderers as Map<string, AnyRenderer>,            remove: id => store.removeUseCase(id),           add: el => store.addUseCase(el),           addRenderer: addUseCaseRenderer },
    { kind: 'uc-system',   collection: 'ucSystems',         renderers: ucSystemRenderers as Map<string, AnyRenderer>,      remove: id => store.removeUCSystem(id),          add: el => store.addUCSystem(el),          addRenderer: addUCSystemRenderer },
    { kind: 'state',       collection: 'states',            renderers: stateRenderers as Map<string, AnyRenderer>,         remove: id => store.removeState(id),             add: el => store.addState(el),             addRenderer: addStateRenderer },
    { kind: 'start-state', collection: 'startStates',       renderers: startStateRenderers as Map<string, AnyRenderer>,    remove: id => store.removeStartState(id),        add: el => store.addStartState(el),        addRenderer: addStartStateRenderer },
    { kind: 'end-state',   collection: 'endStates',         renderers: endStateRenderers as Map<string, AnyRenderer>,      remove: id => store.removeEndState(id),          add: el => store.addEndState(el),          addRenderer: addEndStateRenderer },
    { kind: 'seq-diagram', collection: 'sequenceDiagrams',  renderers: seqDiagramRenderers as Map<string, AnyRenderer>,    remove: id => store.removeSequenceDiagram(id),   add: el => store.addSequenceDiagram(el),   addRenderer: addSeqDiagramRenderer },
    { kind: 'seq-fragment',collection: 'combinedFragments', renderers: seqFragmentRenderers as Map<string, AnyRenderer>,   remove: id => store.removeCombinedFragment(id),  add: el => store.addCombinedFragment(el),  addRenderer: addSeqFragmentRenderer },
    { kind: 'class',       collection: 'classes',           renderers: classRenderers as Map<string, AnyRenderer>,         remove: id => store.removeClass(id),             add: el => store.addClass(el),             addRenderer: addClassRenderer },
    { kind: 'comment',     collection: 'comments',          renderers: commentRenderers as Map<string, AnyRenderer>,       remove: id => store.removeComment(id),           add: el => store.addComment(el),           addRenderer: addCommentRenderer },
  ]
}
initElementDescriptors()

clipboardManager = new Clipboard({
  store, selection,
  elements: ELEMENTS,
  onAfterCopy: updateEditMenu,
})
function doCopy() { clipboardManager.copy() }
function doPaste() { clipboardManager.paste() }

const searchPanel = createSearchPanel(store, selection, () => svg, applyViewport, ELEMENTS)

/** Get all elements as {kind, id, x, y, w, h} for rubber-band / hit-testing */
function getAllElementRects() {
  return _getAllElementRects(store.state, ELEMENTS as LayoutElementDesc[])
}

// ─── Rubber-band selector ─────────────────────────────────────────────────────

const rubberBand = new RubberBandSelector({ selection, getAllElementRects })
// Insert before snap guide lines so it renders below the guides
viewGroup.insertBefore(rubberBand.el, snapGuideGroup)

// ─── SVG helper ───────────────────────────────────────────────────────────────

function getSvgPoint(e: MouseEvent): DOMPoint {
  const pt = svg.createSVGPoint()
  pt.x = e.clientX; pt.y = e.clientY
  return pt.matrixTransform(viewGroup.getScreenCTM()!.inverse())
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * Returns all element ids whose center lies strictly within the given
 * container's current rendered rect. Works for packages, UC systems,
 * and combined fragments — all container-type elements.
 */
function getContainedElements(containerId: string): Array<{ kind: ElementKind; id: string }> {
  return _getContainedElements(containerId, store.state, ELEMENTS as LayoutElementDesc[], pkgRenderers, ucSystemRenderers, seqFragmentRenderers)
}

const drag    = new DragController(store, getSvgPoint, getContainedElements, updateSnapGuides,
  (excludeIds) => getAllElementRects().filter(r => !excludeIds.has(r.id)))
const resize  = new ResizeController(store, getSvgPoint, getMinSize, () => store.state.viewport.zoom)
const connect = new ConnectionController(store, svg, viewGroup, getSvgPoint, showConnectionPopover)

// ─── Sequence diagram controller ──────────────────────────────────────────────

const seqCtrl = new SequenceDiagramController({
  store,
  seqLayer,
  seqConnLayer,
  svg,
  viewGroup,
  drag,
  connect,
  selection,
  inlineEditor,
  getActiveTool: () => toolbar.activeTool,
  seqDiagramRenderers,
})

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
  }, 'package:update', 'uml-package')
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
  const r = new PackageRenderer(sys, store, (el, port, e) => {
    connect.startConnection({ ...el, elementType: 'uc-system' }, port, e)
    e.preventDefault()
  }, 'uc-system:update', 'uc-system')
  pkgLayer.appendChild(r.el)
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

// Sequence diagram controller — instantiated after drag/connect are available (below)

function addSeqDiagramRenderer(sd: SequenceDiagram) {
  seqCtrl.addSeqDiagramRenderer(sd)
}

function addSeqFragmentRenderer(frag: CombinedFragment) {
  const r = new CombinedFragmentRenderer(frag, store, pkgLayer)
  seqFragmentRenderers.set(frag.id, r)
  wireSeqFragmentInteraction(r, frag)
}

function getRenderedSizeById(id: string): { w: number; h: number } | undefined {
  for (const desc of ELEMENTS) {
    const r = desc.renderers.get(id)
    if (r) return r.getRenderedSize()
  }
  return undefined
}

function addCommentRenderer(comment: Comment) {
  const r = new CommentRenderer(comment, store, getRenderedSizeById)
  commentLayer.appendChild(r.el)
  commentRenderers.set(comment.id, r)
  wireCommentInteraction(r, comment)
}

function wireCommentInteraction(r: CommentRenderer, comment: Comment) {
  wireElementInteraction(
    r.el, 'comment', comment.id,
    () => { const c = store.state.comments.find(c => c.id === comment.id) ?? comment; return { x: c.position.x, y: c.position.y, w: c.size.w, h: c.size.h } },
    '', () => '', () => {},
  )

  // Dblclick → textarea for multiline editing
  r.el.addEventListener('dblclick', e => {
    e.stopPropagation()
    const current = store.state.comments.find(c => c.id === comment.id) ?? comment
    const fo = r.el.querySelector<SVGForeignObjectElement>('.comment-fo')
    if (!fo) return
    const textDiv = fo.querySelector<HTMLElement>('.comment-text')
    if (!textDiv) return

    const ta = document.createElementNS('http://www.w3.org/1999/xhtml', 'textarea') as HTMLTextAreaElement
    ta.classList.add('comment-textarea')
    ta.value = current.text
    fo.replaceChild(ta, textDiv)
    ta.focus()
    ta.select()

    const commit = () => {
      const val = ta.value
      store.updateComment(comment.id, { text: val })
      // Restore div
      const newDiv = document.createElementNS('http://www.w3.org/1999/xhtml', 'div') as HTMLDivElement
      newDiv.classList.add('comment-text')
      newDiv.textContent = val
      fo.replaceChild(newDiv, ta)
    }

    ta.addEventListener('blur', () => commit())
    ta.addEventListener('keydown', e2 => {
      if (e2.key === 'Escape') { ta.value = current.text; ta.blur() }
      if (e2.key === 'Enter' && (e2.ctrlKey || e2.metaKey)) { e2.preventDefault(); ta.blur() }
    })
  })

  // Pin-on-drop: live preview during drag + commit on mouseup
  // PIN_RADIUS is in screen pixels — converted to canvas units per call so it scales with zoom
  const PIN_RADIUS_PX = 50

  // Container kinds render below leaf elements; prefer leaf elements when pinning
  const PIN_CONTAINER_KINDS = new Set<ElementKind>(['package', 'uc-system', 'seq-diagram', 'seq-fragment'])

  function findClosestPinTarget(c: Comment): { id: string; kind: ElementKind; el: { position: { x: number; y: number }; size: { w: number; h: number } } } | null {
    const PIN_RADIUS = PIN_RADIUS_PX / store.state.viewport.zoom
    let foundId: string | null = null
    let foundKind: ElementKind | null = null
    let foundEl: { position: { x: number; y: number }; size: { w: number; h: number } } | null = null
    let bestDist = Infinity
    let bestIsContainer = true  // a non-container always beats a container at any distance
    for (const desc of ELEMENTS) {
      if (desc.kind === 'comment') continue
      const isContainer = PIN_CONTAINER_KINDS.has(desc.kind as ElementKind)
      const items = (store.state as any)[desc.collection] as Array<{ id: string; position: { x: number; y: number }; size: { w: number; h: number } }> ?? []
      for (const el of items) {
        const renderedSize = getRenderedSizeById(el.id) ?? el.size
        const shape = elementShape(desc.kind as ElementKind)
        const dist = shapedBorderDist(c.position.x, c.position.y, c.size.w, c.size.h, el.position.x, el.position.y, renderedSize.w, renderedSize.h, shape)
        if (dist >= PIN_RADIUS) continue
        // Prefer non-containers over containers; within same tier prefer closest
        const beats = bestIsContainer && !isContainer || dist < bestDist && isContainer === bestIsContainer
        if (beats) {
          bestDist = dist
          bestIsContainer = isContainer
          foundId = el.id
          foundKind = desc.kind as ElementKind
          // Use rendered size so pin line and offset use the actual visual bounds
          foundEl = { position: el.position, size: renderedSize }
        }
      }
    }
    return foundId && foundKind && foundEl ? { id: foundId, kind: foundKind, el: foundEl } : null
  }

  r.el.addEventListener('mousedown', () => {
    const onMove = () => {
      const c = store.state.comments.find(c => c.id === comment.id)
      if (!c) return
      const hit = findClosestPinTarget(c)
      r.setDragPinPreview(hit ? { x: hit.el.position.x, y: hit.el.position.y, w: hit.el.size.w, h: hit.el.size.h, shape: elementShape(hit.kind) } : null)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      const c = store.state.comments.find(c => c.id === comment.id)
      if (!c) return
      const hit = findClosestPinTarget(c)
      if (hit) {
        // Extend drag's undo group so pin commit shares the same undo step
        store.extendUndoGroup()
        store.updateComment(comment.id, {
          pinnedTo: hit.id,
          pinnedOffset: { x: c.position.x - hit.el.position.x, y: c.position.y - hit.el.position.y },
        })
        store.endUndoGroup()
      } else if (c.pinnedTo) {
        store.extendUndoGroup()
        store.updateComment(comment.id, { pinnedTo: null, pinnedOffset: null })
        store.endUndoGroup()
      }
      // Renderer will re-render via store event; no need to clear preview manually
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  })
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

    dismissConnPopover = showConnectionPopover(
      e.clientX,
      e.clientY,
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
      { type: c.type, srcMult: c.sourceMultiplicity ?? '', tgtMult: c.targetMultiplicity ?? '', elbowMode: c.elbowMode, srcElbowMode: c.srcElbowMode },
      (tgtMode: ElbowMode) => {
        store.updateConnection(c.id, { elbowMode: tgtMode })
      },
      (srcMode: ElbowMode) => {
        store.updateConnection(c.id, { srcElbowMode: srcMode })
      },
    )
  }, (c, labelEl) => {
    // Dismiss popover before inline edit
    dismissConnPopover?.()
    dismissConnPopover = null
    const current = store.state.connections.find(cn => cn.id === c.id)
    if (!current) return
    inlineEditor.edit(labelEl, current.label || '', (val) => {
      store.updateConnection(c.id, { label: val })
    })
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
  for (const desc of ELEMENTS) {
    const items = (d as typeof store.state)[desc.collection] as Array<{ id: string }> | undefined
    const el = items?.find(e => e.id === id)
    if (el) {
      // Actors have sub-types; use entity's elementType when available
      const type = (el as { elementType?: string }).elementType ?? desc.kind
      return { el: el as unknown as AnyElement, type }
    }
  }
  return undefined
}

/** Get the rendered (possibly expanded) size for an element — for use in connection routing */
function getRenderedSizeFor(id: string, found: { el: AnyElement; type: string }): { w: number; h: number } {
  for (const desc of ELEMENTS) {
    const r = desc.renderers.get(id)
    if (r) return r.getRenderedSize()
  }
  return found.el.size
}

// ─── Properties panel helper ──────────────────────────────────────────────────

const propsOrch = new PropertiesOrchestrator({
  store, selection, svg,
  updateFns: {
    'class':        id => p => store.updateClass(id, p),
    'storage':      id => p => store.updateStorage(id, p),
    'actor':        id => p => store.updateActor(id, p),
    'queue':        id => p => store.updateQueue(id, p),
    'package':      id => p => store.updatePackage(id, p),
    'use-case':     id => p => store.updateUseCase(id, p),
    'uc-system':    id => p => store.updateUCSystem(id, p),
    'state':        id => p => store.updateState(id, p),
    'seq-fragment': id => p => store.updateCombinedFragment(id, p),
  } satisfies Partial<Record<ElementKind, (id: string) => PatchFn>>,
})

function showPropertiesForSelection() { propsOrch.show() }

// ─── Element interaction wiring ───────────────────────────────────────────────

/**
 * Returns the content-minimum size for any element kind, by querying its renderer.
 * Used by ResizeController to clamp resize at content boundaries.
 */
function getMinSize(kind: ElementKind, id: string): { w: number; h: number } {
  for (const desc of ELEMENTS) {
    if (desc.kind === kind) {
      return desc.renderers.get(id)?.getContentMinSize() ?? { w: 40, h: 40 }
    }
  }
  return { w: 40, h: 40 }
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
      const elData = { kind, id, x, y, w, h, ...(elementShape(kind) === 'pill' ? { ewZone: h / 2 } : {}) }
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
    if (!nameSelector) return
    const nameEl = el.querySelector<SVGTextElement>(`.${nameSelector}`)
    if (!nameEl) return
    inlineEditor.edit(nameEl, getName(), val => { if (val) updateName(val) })
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
        if (!val) return
        attrs[idx] = { ...attrs[idx], raw: val }
        store.updateClass(cls.id, { attributes: attrs })
      })
    } else {
      const methods = [...currentCls.methods]
      inlineEditor.edit(target, target.textContent ?? '', val => {
        if (!val) return
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

function wireUCSystemInteraction(r: PackageRenderer, sys: UCSystem) {
  wireElementInteraction(
    r.el, 'uc-system', sys.id,
    () => { const s = r.getRenderedSize(); const c = store.state.ucSystems.find(u => u.id === sys.id) ?? sys; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'pkg-name',
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
  wireElementInteraction(
    r.el, 'start-state', state.id,
    () => { const s = r.getRenderedSize(); const c = store.state.startStates.find(s => s.id === state.id) ?? state; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    '', () => '', () => {},
  )
}

function wireEndStateInteraction(r: EndStateRenderer, state: EndState) {
  wireElementInteraction(
    r.el, 'end-state', state.id,
    () => { const s = r.getRenderedSize(); const c = store.state.endStates.find(s => s.id === state.id) ?? state; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    '', () => '', () => {},
  )
}

function wireSeqFragmentInteraction(r: CombinedFragmentRenderer, frag: CombinedFragment) {
  wireElementInteraction(
    r.el, 'seq-fragment', frag.id,
    () => { const s = r.getRenderedSize(); const c = store.state.combinedFragments.find(f => f.id === frag.id) ?? frag; return { x: c.position.x, y: c.position.y, w: s.w, h: s.h } },
    'seq-fragment-op',
    () => (store.state.combinedFragments.find(f => f.id === frag.id) ?? frag).condition,
    val => store.updateCombinedFragment(frag.id, { condition: val }),
  )
}

// ─── Store → renderer sync ────────────────────────────────────────────────────

store.on(ev => {
  // Generic :add / :remove handling for all element types
  for (const desc of ELEMENTS) {
    if (ev.type === `${desc.kind}:add`)    { desc.addRenderer(ev.payload); break }
    if (ev.type === `${desc.kind}:remove`) { desc.renderers.get(ev.payload as string)?.destroy(); desc.renderers.delete(ev.payload as string); break }
  }

  // Special side-effects for specific events
  if (ev.type === 'comment:add') ensureCommentsVisible()
  if (ev.type === 'seq-diagram:add')    refreshSequenceConnections()
  if (ev.type === 'seq-diagram:update') { refreshSequenceConnections(); seqCtrl.refreshLifelineAddButtons() }
  if (ev.type === 'seq-diagram:remove') refreshSequenceConnections()
  if (ev.type === 'connection:add')   { addConnectionRenderer(ev.payload as Connection); refreshConnections() }
  if (ev.type === 'connection:remove') {
    connRenderers.get(ev.payload as string)?.destroy()
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

  if (ev.type.endsWith(':update') && !ev.type.startsWith('seq-') && !ev.type.startsWith('viewport') && ev.type !== 'connection:update') {
    refreshConnections()
    showPropertiesForSelection()
  }
  if (ev.type === 'connection:update') {
    refreshConnections()
    showPropertiesForSelection()
  }
  if (ev.type === 'seq-fragment:update') {
    refreshSequenceConnections()
  }

  saveDiagram(store.state)
  fileMenu.notifySaved()
  // Keep recent files entry in sync with latest diagram state
  const d = store.state
  if (d.id) {
    const snapshot = JSON.stringify(serializeDiagramV2(d), null, 2)
    addRecentFile({
      id: d.id,
      name: d.name || 'Untitled',
      filename: getActiveFileName(),
      timestamp: Date.now(),
      data: snapshot,
    })
  }
})

// ─── Connection line refresh ──────────────────────────────────────────────────

const connRefresher = new ConnectionRefresher({
  store,
  connRenderers,
  findElement: (d, id) => findElement(d, id),
  getRenderedSizeFor: (id, found) => getRenderedSizeFor(id, found),
})

function refreshConnections() { connRefresher.refresh() }

// ─── Sequence connections overlay ────────────────────────────────────────────
// Delegates to seqCtrl (SequenceDiagramController)

function setSelectedSeqArrow(key: { srcId: string; msgIdx: number } | null) {
  seqCtrl.setSelectedSeqArrow(key)
}

function refreshSequenceConnections() {
  seqCtrl.refreshSequenceConnections()
}

// ─── Selection → renderer highlight ──────────────────────────────────────────


selection.onChange(items => {
  const ids = new Set(items.map(i => i.id))
  ELEMENTS.forEach(d => d.renderers.forEach((r, id) => r.setSelected(ids.has(id))))
  connRenderers.forEach((r, id) => r.setSelected(ids.has(id)))

  // Show + buttons when exactly one seq-diagram is selected
  const seqItem = items.length === 1 && items[0].kind === 'seq-diagram' ? items[0] : null
  if (seqItem) {
    const sd = store.state.sequenceDiagrams.find(s => s.id === seqItem.id)
    if (sd) seqCtrl.showLifelineAddButtons(sd)
    else seqCtrl.hideLifelineAddButtons()
  } else {
    seqCtrl.hideLifelineAddButtons()
  }

  showPropertiesForSelection()
})

// ─── Canvas mouse events ──────────────────────────────────────────────────────

/** Maps each creation tool to a factory that places the element centred on the cursor. */
const TOOL_CREATORS: Partial<Record<ToolKind, (pt: DOMPoint) => void>> = {
  'class':        pt => store.addClass(createUmlClass({ name: 'NewClass',      position: { x: pt.x - 90,  y: pt.y - 60  } })),
  'package':      pt => store.addPackage(createUmlPackage({ name: 'com.example', position: { x: pt.x - 160, y: pt.y - 120 } })),
  'storage':      pt => store.addStorage(createStorage({ name: 'DataStore',    position: { x: pt.x - 80,  y: pt.y - 30  } })),
  'agent':        pt => store.addActor(createActor({ elementType: 'agent',       name: 'Agent', position: { x: pt.x - 60,  y: pt.y - 30  } })),
  'human-agent':  pt => store.addActor(createActor({ elementType: 'human-agent', name: 'User',  position: { x: pt.x - 40,  y: pt.y - 50  } })),
  'queue':        pt => store.addQueue(createQueue({ name: 'Queue',             position: { x: pt.x - 80,  y: pt.y - 30  } })),
  'use-case':     pt => store.addUseCase(createUseCase({ name: 'Use Case',      position: { x: pt.x - 70,  y: pt.y - 30  } })),
  'uc-actor':     pt => store.addActor(createActor({ elementType: 'uc-actor',    name: 'Actor', position: { x: pt.x - 40,  y: pt.y - 50  } })),
  'uc-system':    pt => store.addUCSystem(createUCSystem({ name: 'System',       position: { x: pt.x - 130, y: pt.y - 100 } })),
  'state':        pt => store.addState(createState({ name: 'State',             position: { x: pt.x - 60,  y: pt.y - 22  } })),
  'start-state':  pt => store.addStartState(createStartState({ position: { x: pt.x - 14, y: pt.y - 14 } })),
  'end-state':    pt => store.addEndState(createEndState({ position: { x: pt.x - 18, y: pt.y - 18 } })),
  'seq-diagram':  pt => store.addSequenceDiagram(createSequenceDiagram(pt.x - 150, pt.y - 20)),
  'seq-fragment': pt => store.addCombinedFragment(createCombinedFragment(pt.x - 100, pt.y - 60)),
  'comment':      pt => store.addComment(createComment({ position: { x: pt.x - 100, y: pt.y - 40 } })),
}

// ─── Drag-from-toolbar ────────────────────────────────────────────────────────

const dragGhost = document.createElement('div')
dragGhost.id = 'toolbar-drag-ghost'
dragGhost.style.cssText = 'position:fixed;pointer-events:none;display:none;padding:3px 8px;border-radius:4px;font-size:12px;white-space:nowrap;z-index:9999;background:var(--ctp-surface0);border:1px solid var(--ctp-overlay0);color:var(--ctp-text);'
document.body.appendChild(dragGhost)

let toolbarDragTool: ToolKind | null = null

document.getElementById('toolbar')!.addEventListener('mousedown', e => {
  const btn = (e.target as Element).closest<HTMLElement>('[data-tool]')
  if (!btn) return
  const tool = btn.dataset.tool as ToolKind
  if (!TOOL_CREATORS[tool]) return
  e.preventDefault()
  toolbarDragTool = tool
  dragGhost.textContent = btn.title.replace(/ \([A-Za-z]\)$/, '')
  dragGhost.style.display = 'block'
  dragGhost.style.left = e.clientX + 12 + 'px'
  dragGhost.style.top  = e.clientY + 12 + 'px'
})


svg.addEventListener('dblclick', e => {
  if (e.button !== 0) return
  const tool = toolbar.activeTool
  const pt = getSvgPoint(e)
  // Don't create if double-clicking on an existing element
  const target = e.target as Element
  if (target.closest('[data-id]')) return

  const creator = TOOL_CREATORS[tool as ToolKind]
  if (creator) creator(pt)
})

// ─── Rubber-band selection ────────────────────────────────────────────────────

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
  setSelectedSeqArrow(null)

  // Only start rubber-band in select mode
  if (toolbar.activeTool !== 'select') return
  const pt = getSvgPoint(e)
  rubberBand.start(pt)
  e.preventDefault()
})

window.addEventListener('mousemove', e => {
  if (toolbarDragTool) {
    dragGhost.style.left = e.clientX + 12 + 'px'
    dragGhost.style.top  = e.clientY + 12 + 'px'
    return
  }
  if (drag.isDragging)      drag.onMouseMove(e)
  if (resize.isResizing)    resize.onMouseMove(e)
  if (connect.isConnecting) connect.onMouseMove(e)
  if (rubberBand.isActive)  rubberBand.onMouseMove(getSvgPoint(e))
})

// Update resize cursor based on hover position
svg.addEventListener('mousemove', e => {
  if (drag.isDragging || resize.isResizing || connect.isConnecting || rubberBand.isActive) return

  // Collect all element renderers so we can set cursor directly on each <g>
  // (CSS cursor:move on the element classes overrides svg.style.cursor)
  const allRendererEls = new Map<string, SVGGElement>()
  ELEMENTS.forEach(d => d.renderers.forEach((r, id) => allRendererEls.set(id, r.el)))

  // No resize cursor when multiple elements are selected
  if (selection.items.length > 1) {
    allRendererEls.forEach(el => { el.style.cursor = '' })
    return
  }

  const allElements = getAllElementRects()

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
  if (toolbarDragTool) {
    dragGhost.style.display = 'none'
    const tool = toolbarDragTool
    toolbarDragTool = null
    const svgRect = svg.getBoundingClientRect()
    if (e.clientX >= svgRect.left && e.clientX <= svgRect.right &&
        e.clientY >= svgRect.top  && e.clientY <= svgRect.bottom) {
      TOOL_CREATORS[tool]!(getSvgPoint(e))
    }
    return
  }
  if (drag.isDragging)   { drag.onMouseUp(); return }
  if (resize.isResizing) { resize.onMouseUp(); return }
  if (rubberBand.isActive) { rubberBand.onMouseUp(); return }
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
  // Ctrl+F / Cmd+F — intercept before the input-focus guard so it works everywhere
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    searchPanel.show()
    return
  }
  if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
  if (e.key === '?') { e.preventDefault(); toggleHelpModal(); return }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); store.undo(); updateEditMenu(); return
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); store.redo(); updateEditMenu(); return
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault(); selectAll(); return
  }
  if (e.key !== 'Delete' && e.key !== 'Backspace') {
    // Arrow key nudge
    const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    const dy = e.key === 'ArrowUp'   ? -1 : e.key === 'ArrowDown'  ? 1 : 0
    if ((dx !== 0 || dy !== 0) && selection.items.length > 0) {
      e.preventDefault()
      store.beginUndoGroup()

      // Build the full set of element ids to move, mirroring DragController container logic
      const CONTAINER_KINDS = new Set<string>(['package', 'uc-system', 'seq-fragment'])
      const elementItems = selection.items.filter(i => i.kind !== 'connection') as Array<{ kind: ElementKind; id: string }>
      const toMove = new Map<string, { kind: ElementKind; id: string }>()
      for (const item of elementItems) toMove.set(item.id, item)

      // If a single container is selected alone, also move its children
      if (elementItems.length === 1 && CONTAINER_KINDS.has(elementItems[0].kind)) {
        for (const child of getContainedElements(elementItems[0].id)) {
          if (!toMove.has(child.id)) toMove.set(child.id, child)
        }
      }

      for (const item of toMove.values()) {
        const el = store.findElementById(item.kind, item.id)
        if (!el) continue
        let x = el.position.x + dx
        let y = el.position.y + dy
        if (e.shiftKey) {
          x = dx !== 0
            ? (dx > 0 ? Math.ceil((el.position.x + 1) / 10) * 10 : Math.floor((el.position.x - 1) / 10) * 10)
            : el.position.x
          y = dy !== 0
            ? (dy > 0 ? Math.ceil((el.position.y + 1) / 10) * 10 : Math.floor((el.position.y - 1) / 10) * 10)
            : el.position.y
        }
        store.updateElementPosition(item.kind, item.id, { position: { x, y }, size: el.size })
      }
      store.endUndoGroup()
      saveDiagram(store.state)
      refreshConnections()
    }
    return
  }
  deleteSelection()
})

// ─── Copy / Paste ─────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  // Skip when typing in an input / textarea
  if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
  const mod = e.ctrlKey || e.metaKey

  if (mod && e.key === 'c') doCopy()
  if (mod && e.key === 'v') { e.preventDefault(); doPaste() }
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
})

// ─── Pan & zoom ───────────────────────────────────────────────────────────────

const canvasContainer = document.getElementById('canvas-container')!

const viewport = new ViewportController(store, svg, viewGroup, canvasContainer, toolbar, {
  dismissPopovers: () => {
    dismissConnPopover?.()
    dismissConnPopover = null
    document.getElementById('conn-popover')?.remove()
    hideMsgPopover()
    hideElementPropertiesPanel()
  },
  onViewportChanged: () => seqCtrl.refreshLifelineAddButtons(),
})
viewport.register()
// Ensure comment visibility is toggled when the comment tool is activated
toolbar.onToolChange(tool => { if (tool === 'comment') ensureCommentsVisible() })
function applyViewport() { viewport.applyViewport() }

// ─── Build initial diagram ────────────────────────────────────────────────────

function rebuildAll() {
  clsLayer.innerHTML = ''
  pkgLayer.innerHTML = ''
  storageLayer.innerHTML = ''
  actorLayer.innerHTML = ''
  queueLayer.innerHTML = ''
  ucLayer.innerHTML = ''
  stateLayer.innerHTML = ''
  seqLayer.innerHTML = ''
  seqConnLayer.innerHTML = ''
  connLayer.innerHTML = ''
  commentLayer.innerHTML = ''
  ELEMENTS.forEach(d => d.renderers.clear())
  connRenderers.clear()

  const d = store.state
  for (const desc of ELEMENTS) {
    const col = (d[desc.collection] as Array<any>) ?? []
    col.forEach(desc.addRenderer)
  }
  d.connections.forEach(addConnectionRenderer)
  refreshConnections()
  refreshSequenceConnections()
  applyViewport()
}

// ─── Minimap ──────────────────────────────────────────────────────────────────

const minimap = new Minimap(store, () => svg, applyViewport)

rebuildAll()

// ─── Alignment toolbar ────────────────────────────────────────────────────────

const alignmentToolbar = new AlignmentToolbar(store, selection, { refreshConnections })
selection.onChange(items => {
  alignmentToolbar.update(items.filter(i => i.kind !== 'connection'))
})
