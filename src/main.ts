import { DiagramStore } from './store/DiagramStore.ts'
import { loadSavedTheme } from './themes/catppuccin.ts'
import { loadDiagram, saveDiagram, openAndSaveToFile, closeActiveFile, setActiveFileHandle, setActiveThumbnailId, getThumbnailDataUrl, getActiveFileName, loadDiagramFromFile, serializeDiagramV2, deserializeV2 } from './serialization/persistence.ts'
import { ClassRenderer } from './renderers/ClassRenderer.ts'
import { PackageRenderer } from './renderers/PackageRenderer.ts'
import { StorageRenderer } from './renderers/StorageRenderer.ts'
import { ActorRenderer } from './renderers/ActorRenderer.ts'
import { QueueRenderer } from './renderers/QueueRenderer.ts'
import { UseCaseRenderer } from './renderers/UseCaseRenderer.ts'
import { StateRenderer } from './renderers/StateRenderer.ts'
import { StartStateRenderer } from './renderers/StartStateRenderer.ts'
import { EndStateRenderer } from './renderers/EndStateRenderer.ts'
import { SEQ_HEADER_H, SEQ_MSG_ROW_H } from './renderers/SequenceLifelineRenderer.ts'
import type { ActiveSpan, InsertSlot } from './renderers/SequenceLifelineRenderer.ts'
import { SequenceDiagramRenderer } from './renderers/SequenceDiagramRenderer.ts'
import { CombinedFragmentRenderer } from './renderers/CombinedFragmentRenderer.ts'
import { CommentRenderer } from './renderers/CommentRenderer.ts'
import { ConnectionRenderer, injectMarkerDefs, getConnStereotype } from './renderers/ConnectionRenderer.ts'
import { DragController } from './interaction/DragController.ts'
import { ResizeController } from './interaction/ResizeController.ts'
import { ConnectionController } from './interaction/ConnectionController.ts'
import { SelectionManager } from './interaction/SelectionManager.ts'
import { InlineEditor } from './interaction/InlineEditor.ts'
import { Toolbar, type Tool as ToolKind } from './ui/Toolbar.ts'
import { FileMenu } from './ui/FileMenu.ts'
import { EditMenu } from './ui/EditMenu.ts'
import { ViewMenu } from './ui/ViewMenu.ts'
import { AiPromptButton } from './ui/AiPromptButton.ts'
import { saveHandle, loadHandle } from './serialization/fileHandleStore.ts'
import { Dashboard, addRecentFile, getRecentFiles, injectPersistence, injectHandleStore, injectThumbnailCache } from './ui/Dashboard.ts'
import { showConnectionPopover } from './ui/ConnectionPopover.ts'
import { showMsgPopover } from './ui/MessagePopover.ts'
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
import { createSequenceDiagram } from './entities/SequenceDiagram.ts'
import type { SequenceDiagram } from './entities/SequenceDiagram.ts'
import { createSequenceLifeline } from './entities/SequenceLifeline.ts'
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
import type { SequenceLifeline, SequenceMessage } from './entities/SequenceLifeline.ts'
import type { CombinedFragment } from './entities/CombinedFragment.ts'
import type { Connection } from './entities/Connection.ts'
import { absolutePortPosition } from './renderers/ports.ts'
import { getElementConfig } from './config/registry.ts'
import type { ElementKind } from './types.ts'
import { bestPortPair } from './renderers/routing.ts'
import type { PortSide } from './renderers/routing.ts'
import type { ElbowMode } from './entities/Connection.ts'
import { deconflict, type LabelBox } from './renderers/LabelDeconflictLayer.ts'
import { estimateTextWidth } from './renderers/svgUtils.ts'

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSavedTheme()
injectPersistence({ deserializeV2 })
injectHandleStore({ loadHandle })
injectThumbnailCache(getThumbnailDataUrl)

const svg = document.getElementById('canvas') as unknown as SVGSVGElement
injectMarkerDefs(svg)

const diagram = loadDiagram()
const store = new DiagramStore(diagram ?? undefined)
const selection = new SelectionManager()
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
    openAndSaveToFile(d, `${name}.arch.png`).then(saved => {
      if (saved) { setActiveThumbnailId(d.id); fileMenu.setFileIndicator(getActiveFileName()) }
    }).catch(console.error)
  },
  onSaveAs: () => {
    const d = store.state
    const name = fileMenu.getTitle() || 'diagram'
    openAndSaveToFile(d, `${name}.arch.png`, /* forceNew */ true).then(saved => {
      if (saved) { setActiveThumbnailId(d.id); fileMenu.setFileIndicator(getActiveFileName()) }
    }).catch(console.error)
  },
  onTitleChange: (title: string) => {
    store.updateDiagramName(title)
    saveDiagram(store.state)
  },
}

const fileMenu = new FileMenu(document.getElementById('titlebar')!, fileMenuCallbacks)

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
  editMenu.setClipboardState(selection.items.length > 0, clipboard.length > 0)
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
}, showComments)

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

/** Get all elements as {kind, id, x, y, w, h} for rubber-band / hit-testing */
function elementShape(kind: ElementKind): string {
  return getElementConfig(kind)?.shape ?? 'rect'
}

// ─── Shape-aware border point helpers (mirrors CommentRenderer) ───────────────

function borderPointRect(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const cx = rx + rw / 2, cy = ry + rh / 2
  const dx = px - cx, dy = py - cy
  if (dx === 0 && dy === 0) return { x: cx, y: ry }
  const scaleX = rw / 2 / Math.abs(dx || 1e-9)
  const scaleY = rh / 2 / Math.abs(dy || 1e-9)
  return { x: cx + dx * Math.min(scaleX, scaleY), y: cy + dy * Math.min(scaleX, scaleY) }
}

function borderPointPill(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const r = rh / 2
  const cy = ry + r
  const capCX = Math.max(rx + r, Math.min(px, rx + rw - r))
  const dx = px - capCX, dy = py - cy
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: capCX, y: ry }
  return { x: capCX + (dx / len) * r, y: cy + (dy / len) * r }
}

function borderPointEllipse(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const cx = rx + rw / 2, cy = ry + rh / 2
  const dx = px - cx, dy = py - cy
  if (dx === 0 && dy === 0) return { x: cx, y: ry }
  const len = Math.hypot(dx / (rw / 2), dy / (rh / 2))
  return { x: cx + dx / len, y: cy + dy / len }
}

function borderPointCircle(rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  const cx = rx + rw / 2, cy = ry + rh / 2
  const r = Math.min(rw, rh) / 2
  const dx = px - cx, dy = py - cy
  const len = Math.hypot(dx, dy)
  if (len === 0) return { x: cx, y: cy - r }
  return { x: cx + (dx / len) * r, y: cy + (dy / len) * r }
}

function borderPointForShape(shape: string, rx: number, ry: number, rw: number, rh: number, px: number, py: number): { x: number; y: number } {
  if (shape === 'pill')    return borderPointPill(rx, ry, rw, rh, px, py)
  if (shape === 'ellipse') return borderPointEllipse(rx, ry, rw, rh, px, py)
  if (shape === 'circle')  return borderPointCircle(rx, ry, rw, rh, px, py)
  return borderPointRect(rx, ry, rw, rh, px, py)
}

/**
 * True border-to-border distance between annotation rect and a shaped element.
 * Finds nearest point on each shape's border toward the other's center, then
 * measures distance between those two surface points (negative = overlapping).
 */
function shapedBorderDist(
  annX: number, annY: number, annW: number, annH: number,
  elX: number,  elY: number,  elW: number,  elH: number, shape: string,
): number {
  const annCX = annX + annW / 2, annCY = annY + annH / 2
  const elCX  = elX  + elW  / 2, elCY  = elY  + elH  / 2
  // Nearest point on annotation rect border toward element center
  const p1 = borderPointRect(annX, annY, annW, annH, elCX, elCY)
  // Nearest point on element's shaped border toward annotation center
  const p2 = borderPointForShape(shape, elX, elY, elW, elH, annCX, annCY)
  // Signed distance: negative means the two borders overlap / annotation is inside
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const dist = Math.hypot(dx, dy)
  // Determine sign: positive if borders have a gap, negative if annotation center
  // is inside the element (i.e. p1 and p2 are on opposite sides of each other)
  const dot = dx * (elCX - annCX) + dy * (elCY - annCY)
  return dot >= 0 ? dist : -dist
}

function getAllElementRects() {
  const d = store.state
  return ELEMENTS.flatMap(desc => {
    const items = (d[desc.collection] as Array<{ id: string; position: { x: number; y: number }; size: { w: number; h: number } }>) ?? []
    return items.map(el => {
      const rs = desc.renderers.get(el.id)?.getRenderedSize() ?? el.size
      const isPill = elementShape(desc.kind as ElementKind) === 'pill'
      return {
        kind: desc.kind as ElementKind, id: el.id,
        x: el.position.x, y: el.position.y, w: rs.w, h: rs.h,
        ...(isPill ? { ewZone: rs.h / 2 } : {}),
      }
    })
  })
}

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
  const d = store.state
  // Find the container in any of the container collections
  type Container = { id: string; position: { x: number; y: number }; size: { w: number; h: number } }
  let container: Container | undefined
  let renderedSize: { w: number; h: number } | undefined

  container = d.packages.find(p => p.id === containerId)
  if (container) renderedSize = pkgRenderers.get(containerId)?.getRenderedSize()

  if (!container) {
    container = d.ucSystems.find(u => u.id === containerId)
    if (container) renderedSize = ucSystemRenderers.get(containerId)?.getRenderedSize()
  }
  if (!container) {
    container = d.combinedFragments?.find(f => f.id === containerId)
    if (container) renderedSize = seqFragmentRenderers.get(containerId)?.getRenderedSize()
  }

  if (!container) return []
  const { w, h } = renderedSize ?? container.size
  const { x, y } = container.position
  const result: Array<{ kind: ElementKind; id: string }> = []
  const inside = (el: { position: { x: number; y: number }; size: { w: number; h: number } }) => {
    const cx = el.position.x + el.size.w / 2
    const cy = el.position.y + el.size.h / 2
    return cx > x && cx < x + w && cy > y && cy < y + h
  }
  for (const desc of ELEMENTS) {
    const items = (d[desc.collection] as Array<{ id: string; position: { x: number; y: number }; size: { w: number; h: number } }>) ?? []
    items.forEach(el => { if (inside(el)) result.push({ kind: desc.kind, id: el.id }) })
  }
  return result
}

const drag    = new DragController(store, getSvgPoint, getContainedElements, updateSnapGuides,
  (excludeIds) => getAllElementRects().filter(r => !excludeIds.has(r.id)))
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

// + Add-lifeline buttons (ephemeral, positioned in screen space)
let lifelineAddCleanup: (() => void) | null = null
let lifelineAddSdId: string | null = null

function hideLifelineAddButtons() {
  lifelineAddCleanup?.()
  lifelineAddCleanup = null
  lifelineAddSdId = null
}

function showLifelineAddButtons(sd: SequenceDiagram) {
  hideLifelineAddButtons()
  lifelineAddSdId = sd.id
  const svgRect = svg.getBoundingClientRect()
  const vp = store.state.viewport

  const toScreen = (diagX: number, diagY: number) => ({
    x: svgRect.left + (diagX) * vp.zoom + vp.x,
    y: svgRect.top  + (diagY) * vp.zoom + vp.y,
  })

  const r = seqDiagramRenderers.get(sd.id)
  const { w: sdW } = r?.getRenderedSize() ?? sd.size
  const midY = sd.position.y + SEQ_HEADER_H / 2
  const BTN_SIZE = 22
  const GAP = 6

  // Convert container edges to screen coords, then offset by screen-pixel gap
  const leftEdge  = toScreen(sd.position.x, midY)
  const rightEdge = toScreen(sd.position.x + sdW, midY)
  const leftPos  = { x: leftEdge.x - BTN_SIZE - GAP, y: leftEdge.y - BTN_SIZE / 2 }
  const rightPos = { x: rightEdge.x + GAP, y: rightEdge.y - BTN_SIZE / 2 }

  function makeBtn(side: 'left' | 'right', pos: { x: number; y: number }) {
    const btn = document.createElement('button')
    btn.className = 'lifeline-add-btn'
    btn.textContent = '+'
    btn.title = side === 'left' ? 'Add lifeline to the left' : 'Add lifeline to the right'
    btn.style.left = `${pos.x}px`
    btn.style.top  = `${pos.y}px`
    btn.addEventListener('mousedown', e => e.stopPropagation())
    btn.addEventListener('click', e => {
      e.stopPropagation()
      addLifelineToSeqDiagram(sd.id, side)
    })
    document.body.appendChild(btn)
    return btn
  }

  const btnLeft  = makeBtn('left',  leftPos)
  const btnRight = makeBtn('right', rightPos)

  lifelineAddCleanup = () => {
    btnLeft.remove()
    btnRight.remove()
  }
}

function refreshLifelineAddButtons() {
  if (!lifelineAddSdId) return
  const sd = store.state.sequenceDiagrams.find(s => s.id === lifelineAddSdId)
  if (sd) showLifelineAddButtons(sd)
  else hideLifelineAddButtons()
}

function addLifelineToSeqDiagram(sdId: string, side: 'left' | 'right') {
  const sd = store.state.sequenceDiagrams.find(s => s.id === sdId)
  if (!sd) return
  const GAP = 20
  const LL_W = 140
  if (side === 'right') {
    const lastX = sd.lifelines.length > 0
      ? Math.max(...sd.lifelines.map(ll => ll.position.x + LL_W))
      : 0
    const newLL = createSequenceLifeline(lastX + GAP, 0)
    store.updateSequenceDiagram(sdId, { lifelines: [...sd.lifelines, newLL] })
  } else {
    const newLL = createSequenceLifeline(0, 0)
    const shifted = sd.lifelines.map(ll => ({ ...ll, position: { x: ll.position.x + LL_W + GAP, y: ll.position.y } }))
    store.updateSequenceDiagram(sdId, { lifelines: [newLL, ...shifted] })
  }
}

function addSeqDiagramRenderer(sd: SequenceDiagram) {
  const r = new SequenceDiagramRenderer(
    sd,
    store,
    seqLayer,
    (sdId, lifeline, slot) => startSeqSlotDrag(sdId, lifeline.id, slot),
    (sdId, lifeline, msgIdx, labelEl) => {
      const currentSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
      const currentLL = currentSd?.lifelines.find(l => l.id === lifeline.id)
      if (!currentSd || !currentLL) return
      inlineEditor.edit(labelEl, currentLL.messages[msgIdx].label, (val) => {
        const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
        if (!latestSd) return
        const latestLL = latestSd.lifelines.find(l => l.id === lifeline.id)
        if (!latestLL) return
        const msgs = [...latestLL.messages]
        msgs[msgIdx] = { ...msgs[msgIdx], label: val || 'message' }
        store.updateSequenceDiagram(sdId, {
          lifelines: latestSd.lifelines.map(l => l.id === lifeline.id ? { ...l, messages: msgs } : l)
        })
      })
    },
    (sdId, lifeline, fromLocalY) => startSeqPortDrag(sdId, lifeline.id, fromLocalY),
    (sdId, lifeline, msgIdx, e) => {
      // Self-call click: open message popover (same as seqConnLayer arrow click)
      const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
      const latestLL = latestSd?.lifelines.find(l => l.id === lifeline.id)
      if (!latestSd || !latestLL) return
      const latestMsg = latestLL.messages[msgIdx]
      if (!latestMsg) return
      const otherLifelines = latestSd.lifelines
        .filter(l => l.id !== lifeline.id)
        .map(l => ({ id: l.id, name: l.name }))
      setSelectedSeqArrow({ srcId: lifeline.id, msgIdx })
      showMsgPopover(
        e.clientX, e.clientY,
        latestMsg,
        otherLifelines,
        (patch) => {
          const sd2 = store.state.sequenceDiagrams.find(s => s.id === sdId)
          const ll2 = sd2?.lifelines.find(l => l.id === lifeline.id)
          if (!sd2 || !ll2) return
          const msgs2 = [...ll2.messages]
          msgs2[msgIdx] = { ...msgs2[msgIdx], ...patch }
          store.updateSequenceDiagram(sdId, {
            lifelines: sd2.lifelines.map(l => l.id === lifeline.id ? { ...l, messages: msgs2 } : l)
          })
        },
        () => {
          removeSeqMessage(sdId, lifeline.id, msgIdx)
          setSelectedSeqArrow(null)
        },
        () => setSelectedSeqArrow(null),
      )
    },
  )
  seqDiagramRenderers.set(sd.id, r)
  wireSeqDiagramInteraction(r, sd)
}

function startLifelineHDrag(sdId: string, llId: string, e: MouseEvent) {
  const sd = store.state.sequenceDiagrams.find(s => s.id === sdId)
  if (!sd) return
  const ll = sd.lifelines.find(l => l.id === llId)
  if (!ll) return
  const startPt = getSvgPoint(e)
  const startX = ll.position.x

  store.beginUndoGroup()

  function onMove(ev: MouseEvent) {
    const pt = getSvgPoint(ev)
    const dx = pt.x - startPt.x
    const newX = Math.max(0, startX + dx)
    const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
    if (!latestSd) return
    store.updateSequenceDiagram(sdId, {
      lifelines: latestSd.lifelines.map(l =>
        l.id === llId ? { ...l, position: { x: newX, y: 0 } } : l
      ),
    })
  }
  function onUp() {
    store.endUndoGroup()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function wireSeqDiagramInteraction(r: SequenceDiagramRenderer, sd: SequenceDiagram) {
  r.el.addEventListener('mousedown', e => {
    if (connect.isConnecting) return
    if (toolbar.activeTool === 'pan') return
    // Message-row interactions already stopped propagation, so this only fires for container drag
    const row = (e.target as Element).closest<SVGElement>('.seq-msg-row')
    if (row) return

    // Lifeline header drag → horizontal reorder within container
    const header = (e.target as Element).closest<SVGElement>('.seq-header-bg')
    if (header) {
      const llGroup = header.closest<SVGElement>('.seq-lifeline')
      if (llGroup?.dataset.id) {
        selection.select({ kind: 'seq-diagram', id: sd.id }, e.shiftKey)
        startLifelineHDrag(sd.id, llGroup.dataset.id, e)
        e.stopPropagation()
        return
      }
    }

    if (!e.shiftKey && selection.isSelected(sd.id) && selection.items.length > 1) {
      drag.startDrag({ kind: 'seq-diagram', id: sd.id }, e, selection.items)
    } else {
      selection.select({ kind: 'seq-diagram', id: sd.id }, e.shiftKey)
      drag.startDrag({ kind: 'seq-diagram', id: sd.id }, e, selection.items)
    }
    e.stopPropagation()
  })

  // Delegate message-row clicks to show popover (scoped to container's lifelines)
  r.el.addEventListener('click', e => {
    const row = (e.target as Element).closest<SVGElement>('.seq-msg-row')
    if (!row || row.dataset.msgIdx === undefined) return
    e.stopPropagation()

    // Find which lifeline this row belongs to by walking up to the lifeline group
    const llGroup = (e.target as Element).closest<SVGElement>('.seq-lifeline')
    if (!llGroup) return
    const llId = llGroup.dataset.id
    if (!llId) return

    const msgIdx = Number(row.dataset.msgIdx)
    const currentSd = store.state.sequenceDiagrams.find(s => s.id === sd.id)
    const currentLL = currentSd?.lifelines.find(l => l.id === llId)
    if (!currentSd || !currentLL) return
    const msg = currentLL.messages[msgIdx]
    if (!msg) return

    const otherLifelines = currentSd.lifelines
      .filter(l => l.id !== llId)
      .map(l => ({ id: l.id, name: l.name }))

    showMsgPopover(
      e.clientX, e.clientY,
      msg,
      otherLifelines,
      (patch) => {
        const latestSd = store.state.sequenceDiagrams.find(s => s.id === sd.id)
        if (!latestSd) return
        const latestLL = latestSd.lifelines.find(l => l.id === llId)
        if (!latestLL) return
        const msgs = [...latestLL.messages]
        msgs[msgIdx] = { ...msgs[msgIdx], ...patch }
        store.updateSequenceDiagram(sd.id, {
          lifelines: latestSd.lifelines.map(l => l.id === llId ? { ...l, messages: msgs } : l)
        })
      },
      () => {
        removeSeqMessage(sd.id, llId, msgIdx)
      },
      () => {},
    )
  })

  // Lifeline header dblclick → rename lifeline
  r.el.addEventListener('dblclick', e => {
    const target = e.target as Element
    if (!target.classList.contains('seq-header-bg') && !target.closest('.seq-header-bg')) return
    const llGroup = target.closest<SVGElement>('.seq-lifeline')
    if (!llGroup) return
    const llId = llGroup.dataset.id
    if (!llId) return
    e.stopPropagation()

    const currentSd = store.state.sequenceDiagrams.find(s => s.id === sd.id)
    const currentLL = currentSd?.lifelines.find(l => l.id === llId)
    if (!currentSd || !currentLL) return

    const llR = r.getLifelineRenderer(llId)
    const nameEl = llR?.el.querySelector<SVGTextElement>('.seq-header-name')
    if (!nameEl) return
    inlineEditor.edit(nameEl, currentLL.name, (val) => {
      const latestSd = store.state.sequenceDiagrams.find(s => s.id === sd.id)
      if (!latestSd) return
      store.updateSequenceDiagram(sd.id, {
        lifelines: latestSd.lifelines.map(l => l.id === llId ? { ...l, name: val || 'Lifeline' } : l)
      })
    })
  })

  // Message-row drag to connect to another lifeline (within this container)
  r.el.addEventListener('mousedown', (e) => {
    const row = (e.target as Element).closest<SVGElement>('.seq-msg-row')
    if (!row || row.dataset.msgIdx === undefined) return
    if (e.button !== 0) return

    e.stopImmediatePropagation()
    e.stopPropagation()
    e.preventDefault()

    const llGroup = (e.target as Element).closest<SVGElement>('.seq-lifeline')
    if (!llGroup) return
    const llId = llGroup.dataset.id
    if (!llId) return

    const msgIdx = Number(row.dataset.msgIdx)
    const currentSd = store.state.sequenceDiagrams.find(s => s.id === sd.id)
    const currentLL = currentSd?.lifelines.find(l => l.id === llId)
    if (!currentSd || !currentLL) return

    const llR = r.getLifelineRenderer(llId)
    if (!llR) return

    const spineAbsX = sd.position.x + currentLL.position.x + llR.getSpineX()
    const baselineY = sd.position.y + SEQ_HEADER_H
    const ephemeral = (currentLL.messages[msgIdx] as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot
    const globalSlot = currentLL.messages[msgIdx].slotIndex ?? ephemeral ?? msgIdx
    const msgY = baselineY + globalSlot * SEQ_MSG_ROW_H + SEQ_MSG_ROW_H / 2

    const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    ghost.classList.add('ghost-line')
    ghost.setAttribute('x1', String(spineAbsX))
    ghost.setAttribute('y1', String(msgY))
    ghost.setAttribute('x2', String(spineAbsX))
    ghost.setAttribute('y2', String(msgY))
    ghost.setAttribute('pointer-events', 'none')
    seqConnLayer.appendChild(ghost)

    r.getLifelineRenderers().forEach((lr, id) => { if (id !== llId) lr.setDropTarget(true) })

    let dragStarted = false
    const startX = e.clientX
    const startY = e.clientY
    let lastHoveredId: string | null = null

    function onMove(ev: MouseEvent) {
      if (!dragStarted) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
        dragStarted = true
      }
      const svgPt = getSvgPoint(ev)
      ghost.setAttribute('x2', String(svgPt.x))
      ghost.setAttribute('y2', String(svgPt.y))

      let hovId: string | null = null
      const latestSd2 = store.state.sequenceDiagrams.find(s => s.id === sd.id)
      if (latestSd2) {
        for (const [id, lr] of r.getLifelineRenderers()) {
          if (id === llId) continue
          const tgtLL = latestSd2.lifelines.find(l => l.id === id)
          if (!tgtLL) continue
          const { w, h } = lr.getRenderedSize()
          const absX = sd.position.x + tgtLL.position.x
          const absY2 = sd.position.y
          if (svgPt.x >= absX && svgPt.x <= absX + w &&
              svgPt.y >= absY2 && svgPt.y <= absY2 + h) {
            hovId = id; break
          }
        }
      }
      if (hovId !== lastHoveredId) {
        if (lastHoveredId) r.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
        lastHoveredId = hovId
      }
      if (hovId) {
        const latestSd3 = store.state.sequenceDiagrams.find(s => s.id === sd.id)
        const tgtLL = latestSd3?.lifelines.find(l => l.id === hovId)
        if (tgtLL) r.getLifelineRenderer(hovId)?.setDropSlot(msgY - (sd.position.y + tgtLL.position.y))
      }
    }

    function onUp(_ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      ghost.remove()
      const droppedOnId = lastHoveredId
      if (lastHoveredId) r.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
      r.getLifelineRenderers().forEach(lr => lr.setDropTarget(false))

      if (!dragStarted || !droppedOnId) return

      const latestSd4 = store.state.sequenceDiagrams.find(s => s.id === sd.id)
      const latestLL = latestSd4?.lifelines.find(l => l.id === llId)
      if (!latestSd4 || !latestLL) return
      const msgs = [...latestLL.messages]
      msgs[msgIdx] = { ...msgs[msgIdx], targetLifelineId: droppedOnId }
      store.updateSequenceDiagram(sd.id, {
        lifelines: latestSd4.lifelines.map(l => l.id === llId ? { ...l, messages: msgs } : l)
      })
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  })
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

function showPropertiesForSelection() {
  const items = selection.items
  if (items.length !== 1) { hideElementPropertiesPanel(); return }

  const item = items[0]

  type PatchFn = (patch: { multiInstance?: boolean; flowReversed?: boolean }) => void

  const found = store.findAnyElement(item.id) as (ReturnType<typeof store.findAnyElement> & { multiInstance?: boolean; flowReversed?: boolean }) | undefined
  if (!found) { hideElementPropertiesPanel(); return }

  // Use elementType (e.g. 'agent', 'human-agent') not kind (e.g. 'actor') because
  // multiple elementTypes share one ELEMENTS kind entry ('actor').
  if (!getElementConfig(found.elementType ?? item.kind)?.supportsProperties) {
    hideElementPropertiesPanel(); return
  }

  const elPosition = found.position
  const elSize = found.size
  const multiInstance = found.multiInstance ?? false
  const flowReversed = found.flowReversed

  const UPDATE_FNS: Partial<Record<ElementKind, PatchFn>> = {
    'class':       p => store.updateClass(item.id, p),
    'storage':     p => store.updateStorage(item.id, p),
    'actor':       p => store.updateActor(item.id, p),
    'queue':       p => store.updateQueue(item.id, p),
  }
  const updateFn = UPDATE_FNS[item.kind as ElementKind]
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
    (val) => updateFn!({ multiInstance: val }),
    isQueue ? (flowReversed ?? false) : undefined,
    isQueue ? (reversed) => updateFn!({ flowReversed: reversed }) : undefined,
  )
}

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

/**
 * Drag a new message connection starting from an insert slot on srcLLId within sdId.
 */
function startSeqSlotDrag(sdId: string, srcLLId: string, slot: InsertSlot) {
  const sd = store.state.sequenceDiagrams.find(s => s.id === sdId)
  const sdR_ = seqDiagramRenderers.get(sdId)
  if (!sd || !sdR_) return
  const sdR = sdR_
  const srcLL = sd.lifelines.find(l => l.id === srcLLId)
  const srcR  = sdR.getLifelineRenderer(srcLLId)
  if (!srcLL || !srcR) return

  const absX = sd.position.x + srcLL.position.x + srcR.getSpineX()
  const absY = sd.position.y + slot.localY

  const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  ghost.classList.add('ghost-line')
  ghost.setAttribute('x1', String(absX))
  ghost.setAttribute('y1', String(absY))
  ghost.setAttribute('x2', String(absX))
  ghost.setAttribute('y2', String(absY))
  ghost.setAttribute('pointer-events', 'none')
  seqConnLayer.appendChild(ghost)

  sdR.getLifelineRenderers().forEach((_r) => { _r.setDropTarget(true) })

  let lastHoveredId: string | null = null
  const HIT_PAD = 20

  function onMove(ev: MouseEvent) {
    const svgPt = getSvgPoint(ev)
    ghost.setAttribute('x2', String(svgPt.x))
    ghost.setAttribute('y2', String(svgPt.y))

    const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
    let hovId: string | null = null
    if (latestSd) {
      for (const [id, lr] of sdR.getLifelineRenderers()) {
        const tgtLL = latestSd.lifelines.find(l => l.id === id)
        if (!tgtLL) continue
        const { w, h } = lr.getRenderedSize()
        const tgtAbsX = latestSd.position.x + tgtLL.position.x
        const tgtAbsY = latestSd.position.y
        if (svgPt.x >= tgtAbsX - HIT_PAD && svgPt.x <= tgtAbsX + w + HIT_PAD &&
            svgPt.y >= tgtAbsY - HIT_PAD && svgPt.y <= tgtAbsY + h + HIT_PAD) {
          hovId = id; break
        }
      }
    }

    if (hovId !== lastHoveredId) {
      if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
      lastHoveredId = hovId
    }
    if (hovId) {
      const latestSd2 = store.state.sequenceDiagrams.find(s => s.id === sdId)
      const tgtLL = latestSd2?.lifelines.find(l => l.id === hovId)
      if (tgtLL) sdR.getLifelineRenderer(hovId)?.setDropSlot(absY - (latestSd2!.position.y + tgtLL.position.y))
    }
  }

  function onUp(_ev: MouseEvent) {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    ghost.remove()
    const droppedOnId = lastHoveredId
    if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
    sdR.getLifelineRenderers().forEach(r => r.setDropTarget(false))

    if (!droppedOnId) return

    const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
    if (!latestSd) return
    const baselineY = latestSd.position.y + SEQ_HEADER_H
    const SLOT_H = SEQ_MSG_ROW_H
    const newGlobalSlot = Math.max(0, Math.floor((absY - baselineY) / SLOT_H))

    // Bump all messages with slotIndex >= newGlobalSlot across ALL lifelines in this container
    const bumpedLifelines = latestSd.lifelines.map(ll => ({
      ...ll,
      messages: ll.messages.map(m =>
        m.slotIndex !== undefined && m.slotIndex >= newGlobalSlot
          ? { ...m, slotIndex: m.slotIndex + 1 }
          : m
      )
    }))

    const srcLLBumped = bumpedLifelines.find(l => l.id === srcLLId)
    if (!srcLLBumped) return

    const isSelfCall = droppedOnId === srcLLId
    const msg: SequenceMessage = {
      id: crypto.randomUUID(),
      label: 'message',
      targetLifelineId: isSelfCall ? null : droppedOnId,
      kind: isSelfCall ? 'self' : 'sync',
      slotIndex: newGlobalSlot,
    }
    const msgs = [...srcLLBumped.messages]
    msgs.splice(slot.slotIdx, 0, msg)

    store.updateSequenceDiagram(sdId, {
      lifelines: bumpedLifelines.map(l => l.id === srcLLId ? { ...l, messages: msgs } : l)
    })

    // Immediately open the message popover for the new message
    const freshSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
    const freshLL = freshSd?.lifelines.find(l => l.id === srcLLId)
    if (!freshSd || !freshLL) return
    const newMsgIdx = freshLL.messages.findIndex(m => m.id === msg.id)
    if (newMsgIdx === -1) return
    const otherLifelines = freshSd.lifelines
      .filter(l => l.id !== srcLLId)
      .map(l => ({ id: l.id, name: l.name }))
    setSelectedSeqArrow({ srcId: srcLLId, msgIdx: newMsgIdx })
    showMsgPopover(
      _ev.clientX, _ev.clientY,
      freshLL.messages[newMsgIdx],
      otherLifelines,
      (patch) => {
        const sd2 = store.state.sequenceDiagrams.find(s => s.id === sdId)
        const ll2 = sd2?.lifelines.find(l => l.id === srcLLId)
        if (!sd2 || !ll2) return
        const msgs2 = [...ll2.messages]
        msgs2[newMsgIdx] = { ...msgs2[newMsgIdx], ...patch }
        store.updateSequenceDiagram(sdId, {
          lifelines: sd2.lifelines.map(l => l.id === srcLLId ? { ...l, messages: msgs2 } : l)
        })
      },
      () => {
        removeSeqMessage(sdId, srcLLId, newMsgIdx)
        setSelectedSeqArrow(null)
      },
      () => setSelectedSeqArrow(null),
    )
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function startSeqPortDrag(sdId: string, srcLLId: string, fromLocalY: number) {
  const sd = store.state.sequenceDiagrams.find(s => s.id === sdId)
  const sdR_ = seqDiagramRenderers.get(sdId)
  if (!sd || !sdR_) return
  const sdR = sdR_
  const srcLL = sd.lifelines.find(l => l.id === srcLLId)
  const srcR  = sdR.getLifelineRenderer(srcLLId)
  if (!srcLL || !srcR) return

  const absX = sd.position.x + srcLL.position.x + srcR.getSpineX()
  const absY = sd.position.y + fromLocalY

  const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  ghost.classList.add('ghost-line')
  ghost.setAttribute('x1', String(absX))
  ghost.setAttribute('y1', String(absY))
  ghost.setAttribute('x2', String(absX))
  ghost.setAttribute('y2', String(absY))
  ghost.setAttribute('pointer-events', 'none')
  seqConnLayer.appendChild(ghost)

  sdR.getLifelineRenderers().forEach((_r) => { _r.setDropTarget(true) })

  let lastHoveredId: string | null = null
  const HIT_PAD = 20

  function onMove(ev: MouseEvent) {
    const svgPt = getSvgPoint(ev)
    ghost.setAttribute('x2', String(svgPt.x))
    ghost.setAttribute('y2', String(svgPt.y))

    const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
    let hovId: string | null = null
    if (latestSd) {
      for (const [id, lr] of sdR.getLifelineRenderers()) {
        const tgtLL = latestSd.lifelines.find(l => l.id === id)
        if (!tgtLL) continue
        const { w, h } = lr.getRenderedSize()
        const tgtAbsX = latestSd.position.x + tgtLL.position.x
        const tgtAbsY = latestSd.position.y
        if (svgPt.x >= tgtAbsX - HIT_PAD && svgPt.x <= tgtAbsX + w + HIT_PAD &&
            svgPt.y >= tgtAbsY - HIT_PAD && svgPt.y <= tgtAbsY + h + HIT_PAD) {
          hovId = id; break
        }
      }
    }

    if (hovId !== lastHoveredId) {
      if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
      lastHoveredId = hovId
    }
    if (hovId) {
      const latestSd2 = store.state.sequenceDiagrams.find(s => s.id === sdId)
      const tgtLL = latestSd2?.lifelines.find(l => l.id === hovId)
      if (tgtLL) sdR.getLifelineRenderer(hovId)?.setDropSlot(absY - (latestSd2!.position.y + tgtLL.position.y))
    }
  }

  function onUp(_ev: MouseEvent) {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    ghost.remove()
    const droppedOnId = lastHoveredId
    if (lastHoveredId) sdR.getLifelineRenderer(lastHoveredId)?.setDropSlot(null)
    sdR.getLifelineRenderers().forEach(r => r.setDropTarget(false))

    if (!droppedOnId) return

    const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
    const latestSrc = latestSd?.lifelines.find(l => l.id === srcLLId)
    if (!latestSd || !latestSrc) return

    const baselineY = latestSd.position.y + SEQ_HEADER_H
    const newGlobalSlot = Math.ceil((absY - baselineY) / SEQ_MSG_ROW_H)

    const isSelfCall = droppedOnId === srcLLId
    const msg: SequenceMessage = {
      id: crypto.randomUUID(),
      label: 'message',
      targetLifelineId: isSelfCall ? null : droppedOnId,
      kind: isSelfCall ? 'self' : 'sync',
      slotIndex: Math.max(0, newGlobalSlot),
    }
    store.updateSequenceDiagram(sdId, {
      lifelines: latestSd.lifelines.map(l => l.id === srcLLId
        ? { ...l, messages: [...l.messages, msg] }
        : l)
    })
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
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
  if (ev.type === 'seq-diagram:update') { refreshSequenceConnections(); refreshLifelineAddButtons() }
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
      conn.srcElbowMode ?? 'auto',
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

  // ── Pass 4: label deconfliction ───────────────────────────────────────────
  const LABEL_FONT_SIZE = 12
  const LABEL_H = LABEL_FONT_SIZE + 4
  const connLabelBoxes: LabelBox[] = []

  for (const conn of store.state.connections) {
    const r = connRenderers.get(conn.id)
    if (!r) continue
    const mid = r.getLabelMidpoint()
    if (!mid) continue
    const text = conn.label || getConnStereotype(conn.type)
    if (!text) continue
    connLabelBoxes.push({ id: conn.id, x: mid.x, y: mid.y, w: estimateTextWidth(text, LABEL_FONT_SIZE) + 4, h: LABEL_H })
  }

  if (connLabelBoxes.length > 1) {
    const results = deconflict([{ name: 'conn-labels', boxes: connLabelBoxes }])
    for (const [id, pos] of results) {
      connRenderers.get(id)?.setLabelPosition(pos.x, pos.y)
    }
  }
}

// ─── Sequence connections overlay ────────────────────────────────────────────

const SVG_NS_MAIN = 'http://www.w3.org/2000/svg'

function renderSeqArrow(
  container: SVGElement,
  x1: number, y1: number,
  x2: number, y2: number,
  kind: SequenceMessage['kind'],
) {
  const goingRight = x2 >= x1

  const shaft = document.createElementNS(SVG_NS_MAIN, 'line')
  shaft.classList.add('seq-conn-arrow')
  shaft.setAttribute('x1', String(x1))
  shaft.setAttribute('y1', String(y1))
  shaft.setAttribute('x2', String(x2))
  shaft.setAttribute('y2', String(y2))
  if (kind === 'async' || kind === 'create' || kind === 'return') {
    shaft.setAttribute('stroke-dasharray', '4 3')
  }
  container.appendChild(shaft)

  // Arrowhead at target end (x2,y2)
  const ax = x2
  const ay = y2
  const dir = goingRight ? 1 : -1

  // return is always open arrowhead
  if (kind === 'sync') {
    const poly = document.createElementNS(SVG_NS_MAIN, 'polygon')
    poly.classList.add('seq-conn-arrow-head')
    poly.setAttribute('points', `${ax - dir * 8},${ay - 5} ${ax},${ay} ${ax - dir * 8},${ay + 5}`)
    container.appendChild(poly)
  } else {
    const path = document.createElementNS(SVG_NS_MAIN, 'path')
    path.classList.add('seq-conn-arrow-head', 'open')
    path.setAttribute('d', `M${ax - dir * 8},${ay - 5} L${ax},${ay} L${ax - dir * 8},${ay + 5}`)
    container.appendChild(path)
  }
}

// Tracks the currently selected inter-lifeline arrow { srcId, msgIdx }
let selectedSeqArrow: { srcId: string; msgIdx: number } | null = null

function setSelectedSeqArrow(key: { srcId: string; msgIdx: number } | null) {
  selectedSeqArrow = key
  // Reflect selection in seqConnLayer visuals
  seqConnLayer.querySelectorAll<SVGGElement>('[data-src-id]').forEach(g => {
    const match = key && g.dataset.srcId === key.srcId && Number(g.dataset.msgIdx) === key.msgIdx
    g.classList.toggle('seq-conn-selected', !!match)
  })
}

function refreshSequenceConnections() {
  while (seqConnLayer.firstChild) seqConnLayer.removeChild(seqConnLayer.firstChild)
  for (const sd of store.state.sequenceDiagrams ?? []) {
    const sdR = seqDiagramRenderers.get(sd.id)
    if (sdR) refreshSeqDiagram(sd, sdR)
  }
}

// ─── Sequence diagram helpers ────────────────────────────────────────────────

/** Remove a message from a lifeline and re-compact slotIndex values so there are no gaps. */
function removeSeqMessage(sdId: string, llId: string, msgIdx: number) {
  const latestSd = store.state.sequenceDiagrams.find(s => s.id === sdId)
  if (!latestSd) return
  // Remove the message
  const updated = latestSd.lifelines.map(l =>
    l.id === llId ? { ...l, messages: l.messages.filter((_, i) => i !== msgIdx) } : l
  )
  // Collect all used slotIndex values, sorted, and build a re-mapping
  const usedSlots = new Set<number>()
  for (const ll of updated) {
    for (const m of ll.messages) {
      if (m.slotIndex !== undefined) usedSlots.add(m.slotIndex)
    }
  }
  const sorted = [...usedSlots].sort((a, b) => a - b)
  const remap = new Map(sorted.map((old, i) => [old, i]))
  // Re-assign compacted slotIndex
  const compacted = updated.map(ll => ({
    ...ll,
    messages: ll.messages.map(m =>
      m.slotIndex !== undefined && remap.has(m.slotIndex)
        ? { ...m, slotIndex: remap.get(m.slotIndex)! }
        : m
    ),
  }))
  store.updateSequenceDiagram(sdId, { lifelines: compacted })
}

interface MsgEvent {
  slotTopY: number
  absY: number
  srcId: string
  tgtId: string | null
  kind: SequenceMessage['kind']
  msgIdx: number
  msg: SequenceMessage
  globalSlot: number
}

/** Assign ephemeral slots to messages that lack explicit slotIndex. */
function assignEphemeralSlots(lifelines: SequenceLifeline[]) {
  const allHaveSlotIndex = lifelines.every(ll => ll.messages.every(m => m.slotIndex !== undefined))
  if (allHaveSlotIndex) return
  const sorted = [...lifelines].sort((a, b) => a.position.x - b.position.x)
  const maxMsgs = Math.max(...lifelines.map(ll => ll.messages.length), 0)
  let slot = 0
  for (let round = 0; round < maxMsgs; round++) {
    for (const ll of sorted) {
      const msg = ll.messages[round]
      if (!msg) continue
      if (msg.slotIndex === undefined) {
        ;(msg as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot = slot++
      } else {
        slot = Math.max(slot, msg.slotIndex + 1)
      }
    }
  }
}

/** Collect all messages as absolute-Y events, sorted by slot position. */
function collectMsgEvents(lifelines: SequenceLifeline[], baselineY: number, slotH: number): MsgEvent[] {
  const lifelineMap = new Map(lifelines.map(ll => [ll.id, ll]))
  const events: MsgEvent[] = []
  for (const srcLL of lifelines) {
    srcLL.messages.forEach((msg, idx) => {
      const ephemeral = (msg as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot
      const globalSlot = msg.slotIndex ?? ephemeral ?? idx
      const slotTopY = baselineY + globalSlot * slotH
      events.push({
        slotTopY,
        absY: slotTopY + slotH / 2,
        srcId: srcLL.id,
        tgtId: msg.targetLifelineId,
        kind: msg.kind,
        msgIdx: idx,
        msg,
        globalSlot,
      })
    })
  }
  events.sort((a, b) => a.slotTopY - b.slotTopY || (lifelineMap.get(a.srcId)?.position.x ?? 0) - (lifelineMap.get(b.srcId)?.position.x ?? 0))
  return events
}

/** Compute activation bar spans (absolute Y) per lifeline from sorted events. */
function computeActiveBars(events: MsgEvent[], lifelines: SequenceLifeline[], slotH: number) {
  interface BarState {
    openY: number | null
    spans: { yStart: number; yEnd: number }[]
    lastTouchedSlotTop: number | null
  }
  const barState = new Map<string, BarState>(
    lifelines.map(ll => [ll.id, { openY: null, spans: [], lastTouchedSlotTop: null }])
  )
  function openBar(llId: string, slotTopY: number) {
    const s = barState.get(llId)
    if (!s) return
    if (s.openY === null) s.openY = slotTopY
    if (s.lastTouchedSlotTop === null || slotTopY > s.lastTouchedSlotTop) s.lastTouchedSlotTop = slotTopY
  }
  function closeBar(llId: string, closeAbsY: number, slotTopY: number) {
    const s = barState.get(llId)
    if (!s) return
    if (s.openY !== null) {
      s.spans.push({ yStart: s.openY, yEnd: closeAbsY })
      s.openY = null
    }
    if (s.lastTouchedSlotTop === null || slotTopY > s.lastTouchedSlotTop) s.lastTouchedSlotTop = slotTopY
  }
  const lifelineMap = new Map(lifelines.map(ll => [ll.id, ll]))
  for (const ev of events) {
    const tgtLL = ev.tgtId ? lifelineMap.get(ev.tgtId) : null
    if (ev.kind === 'self') { openBar(ev.srcId, ev.absY); continue }
    if (ev.kind === 'return') {
      if (tgtLL) {
        closeBar(ev.srcId, ev.absY, ev.slotTopY)
        const ts = barState.get(ev.tgtId!)
        if (ts && (ts.lastTouchedSlotTop === null || ev.slotTopY > ts.lastTouchedSlotTop)) ts.lastTouchedSlotTop = ev.slotTopY
      }
      continue
    }
    if (!tgtLL) continue
    openBar(ev.srcId, ev.absY)
    openBar(ev.tgtId!, ev.absY)
  }
  // Close any still-open bars
  for (const ll of lifelines) {
    const s = barState.get(ll.id)!
    if (s.openY !== null) {
      const lastY = s.lastTouchedSlotTop ?? s.openY
      s.spans.push({ yStart: s.openY, yEnd: lastY + slotH })
      s.openY = null
    }
  }
  return barState
}

function refreshSeqDiagram(sd: SequenceDiagram, sdR: SequenceDiagramRenderer) {
  const lifelines = sd.lifelines
  if (!lifelines.length) return

  const lifelineMap = new Map(lifelines.map(ll => [ll.id, ll]))
  const SLOT_H = SEQ_MSG_ROW_H
  const baselineY = sd.position.y + SEQ_HEADER_H

  assignEphemeralSlots(lifelines)
  const events = collectMsgEvents(lifelines, baselineY, SLOT_H)
  const barState = computeActiveBars(events, lifelines, SLOT_H)

  // Convert abs spans to local (relative to container top, not lifeline), merge, push to renderers
  for (const ll of lifelines) {
    const { spans } = barState.get(ll.id)!
    spans.sort((a, b) => a.yStart - b.yStart)
    const merged: ActiveSpan[] = []
    for (const s of spans) {
      // bars are in absolute Y; ll renderer coords are local to container top (sd.position.y)
      const localStart = s.yStart - sd.position.y
      const localEnd   = s.yEnd   - sd.position.y
      const last = merged[merged.length - 1]
      if (last && localStart <= last.yEnd + 2) {
        last.yEnd = Math.max(last.yEnd, localEnd)
      } else {
        merged.push({ yStart: localStart, yEnd: localEnd, showPort: false })
      }
    }
    if (merged.length > 0) merged[merged.length - 1].showPort = false
    sdR.getLifelineRenderer(ll.id)?.updateActiveBars(merged)
  }

  // Push insert slot Ys to renderers.
  // Slots are placed at every global time-axis boundary (between every used slot across
  // all lifelines), so each lifeline can accept a message at any point in time — not just
  // where it already has messages.
  const allGlobalSlots = [...new Set(events.map(ev => ev.globalSlot))].sort((a, b) => a - b)

  // Build the complete set of absolute-Y mid-points for every used global slot
  const globalSlotAbsYs = allGlobalSlots.map(slot => baselineY + slot * SLOT_H + SLOT_H / 2)

  for (const ll of lifelines) {
    const msgs = ll.messages
    const msgSlotLocalYs = msgs.map((msg, idx) => {
      const ephemeral = (msg as SequenceMessage & { _ephemeralSlot?: number })._ephemeralSlot
      const globalSlot = msg.slotIndex ?? ephemeral ?? idx
      const absY = baselineY + globalSlot * SLOT_H + SLOT_H / 2
      return absY - sd.position.y
    })

    sdR.getLifelineRenderer(ll.id)?.setMsgLocalYs(msgSlotLocalYs)
    // Re-run update so computedH reflects the new msgLocalYs (e.g. after message deletion)
    sdR.getLifelineRenderer(ll.id)?.update(ll)

    // Insert slots at every inter-slot gap on the global time axis.
    // One slot before the first used global slot, one between each pair, one after the last.
    const slotYs: number[] = []
    if (globalSlotAbsYs.length === 0) {
      // Empty diagram — single slot in the middle of the first row
      slotYs.push(SEQ_HEADER_H + SLOT_H / 2)
    } else {
      const firstAbsY = globalSlotAbsYs[0]
      const lastAbsY  = globalSlotAbsYs[globalSlotAbsYs.length - 1]
      // Before first message
      slotYs.push((SEQ_HEADER_H + sd.position.y + firstAbsY) / 2 - sd.position.y)
      // Between each pair of consecutive used slots
      for (let i = 1; i < globalSlotAbsYs.length; i++) {
        slotYs.push((globalSlotAbsYs[i - 1] + globalSlotAbsYs[i]) / 2 - sd.position.y)
      }
      // After last message
      slotYs.push(lastAbsY + SLOT_H / 2 - sd.position.y)
    }

    sdR.getLifelineRenderer(ll.id)?.updateInsertSlots(slotYs)
  }

  // Compute bounding box and update sd.size
  {
    let maxW = 0
    let maxH = 0
    for (const ll of lifelines) {
      const llR = sdR.getLifelineRenderer(ll.id)
      const { w, h } = llR?.getRenderedSize() ?? { w: 140, h: 80 }
      maxW = Math.max(maxW, ll.position.x + w)
      maxH = Math.max(maxH, h)
    }
    // Also extend to cover the lowest arrow (incoming arrows may go past a lifeline's own messages)
    if (events.length > 0) {
      const maxAbsY = Math.max(...events.map(ev => ev.absY))
      const maxEventLocalH = maxAbsY - sd.position.y + SLOT_H
      maxH = Math.max(maxH, maxEventLocalH)
    }
    // Store updated size on the container so drag/resize hitboxes are correct
    if (maxW !== sd.size.w || maxH !== sd.size.h) {
      // Silent update — don't re-emit seqdiagram:update (would recurse)
      ;(sd as SequenceDiagram).size = { w: maxW, h: maxH }
    }
    // Always sync the renderer (position may have changed from a drag)
    sdR.update(sd)
    // Extend all lifeline spines to the diagram-wide max height
    for (const ll of lifelines) {
      sdR.getLifelineRenderer(ll.id)?.setSpineBottom(maxH)
    }
  }

  // Draw inter-lifeline arrows (absolute canvas coords)
  for (const ev of events) {
    if (ev.kind === 'self' || !ev.tgtId) continue
    const srcLL = lifelineMap.get(ev.srcId)
    const tgtLL = lifelineMap.get(ev.tgtId)
    if (!srcLL || !tgtLL) continue
    const srcR = sdR.getLifelineRenderer(srcLL.id)
    const tgtR = sdR.getLifelineRenderer(tgtLL.id)
    if (!srcR || !tgtR) continue

    const absY = ev.absY
    const srcSpineX = srcR.getSpineX()
    const tgtSpineX = tgtR.getSpineX()
    const barHalf   = srcR.getBarHalfW()

    // Local Y within lifeline renderer = absY - sd.position.y (since ll.position.y = 0)
    const srcLocalY = absY - sd.position.y
    const tgtLocalY = absY - sd.position.y
    const isActive = (llId: string, localY: number) =>
      (barState.get(llId)?.spans ?? []).some(s => localY >= s.yStart - 1 && localY <= s.yEnd + 1)

    const srcActive = isActive(srcLL.id, srcLocalY)
    const tgtActive = isActive(tgtLL.id, tgtLocalY)

    let finalX1: number, finalX2: number
    if (ev.kind === 'return') {
      finalX1 = sd.position.x + srcLL.position.x + srcSpineX - (srcActive ? barHalf : 0)
      finalX2 = sd.position.x + tgtLL.position.x + tgtSpineX + (tgtActive ? barHalf : 0)
    } else {
      finalX1 = sd.position.x + srcLL.position.x + srcSpineX + (srcActive ? barHalf : 0)
      finalX2 = sd.position.x + tgtLL.position.x + tgtSpineX - (tgtActive ? barHalf : 0)
    }

    const g = document.createElementNS(SVG_NS_MAIN, 'g')
    g.classList.add('seq-conn-group')
    g.dataset.srcId  = srcLL.id
    g.dataset.sdId   = sd.id
    g.dataset.msgIdx = String(ev.msgIdx)
    if (selectedSeqArrow?.srcId === srcLL.id && selectedSeqArrow.msgIdx === ev.msgIdx) {
      g.classList.add('seq-conn-selected')
    }

    const hit = document.createElementNS(SVG_NS_MAIN, 'line')
    hit.setAttribute('x1', String(finalX1)); hit.setAttribute('y1', String(absY))
    hit.setAttribute('x2', String(finalX2)); hit.setAttribute('y2', String(absY))
    hit.setAttribute('stroke', 'transparent')
    hit.setAttribute('stroke-width', '12')
    hit.style.cursor = 'pointer'
    g.appendChild(hit)

    renderSeqArrow(g, finalX1, absY, finalX2, absY, ev.kind)

    const labelEl = document.createElementNS(SVG_NS_MAIN, 'text')
    labelEl.classList.add('seq-conn-label')
    labelEl.textContent = ev.msg.label || 'message'
    labelEl.setAttribute('x', String((finalX1 + finalX2) / 2))
    labelEl.setAttribute('y', String(absY - 4))
    labelEl.setAttribute('text-anchor', 'middle')
    g.appendChild(labelEl)

    seqConnLayer.appendChild(g)

    g.addEventListener('click', (e) => {
      e.stopPropagation()
      setSelectedSeqArrow({ srcId: srcLL.id, msgIdx: ev.msgIdx })

      const latestSd = store.state.sequenceDiagrams.find(s => s.id === sd.id)
      const latestSrc = latestSd?.lifelines.find(l => l.id === srcLL.id)
      if (!latestSd || !latestSrc) return
      const latestMsg = latestSrc.messages[ev.msgIdx]
      if (!latestMsg) return
      const otherLifelines = latestSd.lifelines
        .filter(l => l.id !== srcLL.id)
        .map(l => ({ id: l.id, name: l.name }))

      showMsgPopover(
        e.clientX, e.clientY,
        latestMsg,
        otherLifelines,
        (patch) => {
          const latestSd2 = store.state.sequenceDiagrams.find(s => s.id === sd.id)
          const latestLL = latestSd2?.lifelines.find(l => l.id === srcLL.id)
          if (!latestSd2 || !latestLL) return
          const msgs2 = [...latestLL.messages]
          msgs2[ev.msgIdx] = { ...msgs2[ev.msgIdx], ...patch }
          store.updateSequenceDiagram(sd.id, {
            lifelines: latestSd2.lifelines.map(l => l.id === srcLL.id ? { ...l, messages: msgs2 } : l)
          })
        },
        () => {
          removeSeqMessage(sd.id, srcLL.id, ev.msgIdx)
          setSelectedSeqArrow(null)
        },
        () => setSelectedSeqArrow(null),
      )
    })

    // Double-click on arrow → inline rename (dismiss popover first)
    g.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      document.getElementById('msg-popover')?.remove()
      const labelEl = g.querySelector<SVGTextElement>('.seq-conn-label')
      if (!labelEl) return
      const latestSd = store.state.sequenceDiagrams.find(s => s.id === sd.id)
      const latestSrc = latestSd?.lifelines.find(l => l.id === srcLL.id)
      if (!latestSd || !latestSrc) return
      inlineEditor.edit(labelEl, latestSrc.messages[ev.msgIdx]?.label ?? '', (val) => {
        const sd2 = store.state.sequenceDiagrams.find(s => s.id === sd.id)
        const ll2 = sd2?.lifelines.find(l => l.id === srcLL.id)
        if (!sd2 || !ll2) return
        const msgs = [...ll2.messages]
        msgs[ev.msgIdx] = { ...msgs[ev.msgIdx], label: val || 'message' }
        store.updateSequenceDiagram(sd.id, {
          lifelines: sd2.lifelines.map(l => l.id === srcLL.id ? { ...l, messages: msgs } : l)
        })
      })
    })
  }
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
    if (sd) showLifelineAddButtons(sd)
    else hideLifelineAddButtons()
  } else {
    hideLifelineAddButtons()
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
  setSelectedSeqArrow(null)

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
  if (toolbarDragTool) {
    dragGhost.style.left = e.clientX + 12 + 'px'
    dragGhost.style.top  = e.clientY + 12 + 'px'
    return
  }
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
  if (rubberBanding) {
    rubberBanding = false
    rubberBandRect.style.display = 'none'
    const rx = parseFloat(rubberBandRect.getAttribute('x') ?? '0')
    const ry = parseFloat(rubberBandRect.getAttribute('y') ?? '0')
    const rw = parseFloat(rubberBandRect.getAttribute('width') ?? '0')
    const rh = parseFloat(rubberBandRect.getAttribute('height') ?? '0')
    // Only commit if the rect is large enough to be intentional (not a stray click)
    if (rw > 4 || rh > 4) {
      const allEls = getAllElementRects()
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
  if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
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
  | { kind: 'seq-diagram';  data: SequenceDiagram }
  | { kind: 'seq-fragment'; data: CombinedFragment }
  | { kind: 'comment';      data: Comment }

// Simple clipboard — array of deep-cloned entity snapshots + connections between them
let clipboard: ClipboardEntry[] = []
let clipboardConnections: Connection[] = []

const PASTE_OFFSET = 20

function doCopy() {
  const d = store.state
  clipboard = []
  clipboardConnections = []
  const selectedIds = new Set(selection.items.map(i => i.id))
  for (const item of selection.items) {
    const desc = ELEMENTS.find(d => d.kind === item.kind)
    if (!desc) continue
    const items = (d[desc.collection] as Array<{ id: string }>) ?? []
    const el = items.find(e => e.id === item.id)
    if (el) clipboard.push({ kind: desc.kind, data: JSON.parse(JSON.stringify(el)) } as ClipboardEntry)
  }
  // Include connections where both endpoints are selected
  for (const conn of d.connections) {
    if (selectedIds.has(conn.source.elementId) && selectedIds.has(conn.target.elementId)) {
      clipboardConnections.push(JSON.parse(JSON.stringify(conn)))
    }
  }
  updateEditMenu()
}

function doPaste() {
  if (clipboard.length === 0) return
  selection.clear()
  // Map old id → new id for remapping connections
  const idMap = new Map<string, string>()
  for (const entry of clipboard) {
    const newId = crypto.randomUUID()
    idMap.set(entry.data.id, newId)
    const pos = {
      x: entry.data.position.x + PASTE_OFFSET,
      y: entry.data.position.y + PASTE_OFFSET,
    }
    const desc = ELEMENTS.find(d => d.kind === entry.kind)
    if (desc) {
      // Remap pinnedTo if the pinned target was also copied
      const pinnedTo = (entry.data as { pinnedTo?: string }).pinnedTo
      const remappedPinnedTo = pinnedTo ? (idMap.get(pinnedTo) ?? null) : null
      const pinnedOffset = remappedPinnedTo ? (entry.data as { pinnedOffset?: unknown }).pinnedOffset : null
      const copy = { ...entry.data, id: newId, position: pos, ...(entry.kind === 'comment' ? { pinnedTo: remappedPinnedTo, pinnedOffset } : {}) }
      desc.add(copy)
      selection.select({ kind: desc.kind, id: newId }, true)
    }
  }
  // Paste connections with remapped endpoints
  for (const conn of clipboardConnections) {
    const newSrc = idMap.get(conn.source.elementId)
    const newTgt = idMap.get(conn.target.elementId)
    if (newSrc && newTgt) {
      store.addConnection({
        ...conn,
        id: crypto.randomUUID(),
        source: { ...conn.source, elementId: newSrc },
        target: { ...conn.target, elementId: newTgt },
      })
    }
  }
  // Shift clipboard so repeated pastes cascade rather than stack
  clipboard = clipboard.map(entry => ({
    ...entry,
    data: { ...entry.data, position: { x: entry.data.position.x + PASTE_OFFSET, y: entry.data.position.y + PASTE_OFFSET } },
  })) as typeof clipboard
}

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

let panActive = false
let panStart = { x: 0, y: 0 }
let vpStart  = { x: 0, y: 0 }

svg.addEventListener('mousedown', e => {
  if (toolbar.activeTool !== 'pan') return
  panActive = true
  panStart = { x: e.clientX, y: e.clientY }
  vpStart  = { x: store.state.viewport.x, y: store.state.viewport.y }
  canvasContainer.classList.add('pan-grabbing')
})

window.addEventListener('mousemove', e => {
  if (!panActive) return
  store.updateViewport({ x: vpStart.x + e.clientX - panStart.x, y: vpStart.y + e.clientY - panStart.y })
  applyViewport()
})

window.addEventListener('mouseup', () => {
  panActive = false
  canvasContainer.classList.remove('pan-grabbing')
})

svg.addEventListener('wheel', e => {
  e.preventDefault()
  const vp = store.state.viewport
  const newZoom = Math.min(4, Math.max(0.2, vp.zoom * (e.deltaY < 0 ? 1.1 : 0.9)))

  // Keep the canvas point under the cursor fixed during zoom.
  // cursor in SVG element space → canvas point before zoom → recompute offset
  const svgRect = svg.getBoundingClientRect()
  const cursorX = e.clientX - svgRect.left
  const cursorY = e.clientY - svgRect.top
  // canvasPoint = (cursor - offset) / oldZoom  →  newOffset = cursor - canvasPoint * newZoom
  const newX = cursorX - ((cursorX - vp.x) / vp.zoom) * newZoom
  const newY = cursorY - ((cursorY - vp.y) / vp.zoom) * newZoom

  store.updateViewport({ zoom: newZoom, x: newX, y: newY })
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

// Pan mode cursor — keep grab cursor visible whenever pan tool is active
toolbar.onToolChange(tool => {
  canvasContainer.classList.toggle('pan-mode', tool === 'pan')
  if (tool !== 'pan') canvasContainer.classList.remove('pan-grabbing')
  if (tool === 'comment') ensureCommentsVisible()
})
if (toolbar.activeTool === 'pan') canvasContainer.classList.add('pan-mode')

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
  // Shift dot-grid background by pan offset so it appears fixed in screen space
  const DOT_GRID_SIZE = 50 * zoom
  const bgX = ((x % DOT_GRID_SIZE) + DOT_GRID_SIZE) % DOT_GRID_SIZE
  const bgY = ((y % DOT_GRID_SIZE) + DOT_GRID_SIZE) % DOT_GRID_SIZE
  ;(svg.parentElement as HTMLElement).style.backgroundSize = `${DOT_GRID_SIZE}px ${DOT_GRID_SIZE}px`
  ;(svg.parentElement as HTMLElement).style.backgroundPosition = `${bgX}px ${bgY}px`
  updateZoomLabel()
  refreshLifelineAddButtons()
  // Dismiss open popovers — they're screen-pinned and would drift from their element
  dismissConnPopover?.()
  dismissConnPopover = null
  document.getElementById('conn-popover')?.remove()
  document.getElementById('msg-popover')?.remove()
  hideElementPropertiesPanel()
}

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

rebuildAll()
