import type { Diagram } from '../entities/Diagram.ts'
import { createDiagram } from '../entities/Diagram.ts'
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
import type { SequenceLifeline, SequenceMessage } from '../entities/SequenceLifeline.ts'
import type { CombinedFragment } from '../entities/CombinedFragment.ts'
import type { Comment } from '../entities/Comment.ts'
import type { Connection, ConnectionType, ElbowMode, Multiplicity } from '../entities/Connection.ts'
import { parseAttribute, serializeAttribute } from '../entities/Attribute.ts'
import { parseMethod, serializeMethod } from '../entities/Method.ts'
import { getElementConfig } from '../config/registry.ts'
import { extractPngiTxt } from './png-chunks.ts'
import { getExportBounds, prepareSvgForExport, collectStyles } from './svg-export.ts'
export { getExportBounds, prepareSvgForExport, collectStyles } from './svg-export.ts'
import {
  setActiveThumbnailId as _setActiveThumbnailId,
} from './ThumbnailCache.ts'
import {
  schedulePngWrite as _schedulePngWrite,
  resetPngAutosave,
} from './PngAutosave.ts'

// Re-export thumbnail cache API (imported by main.ts via persistence.ts)
export { setActiveThumbnailId, getThumbnailDataUrl } from './ThumbnailCache.ts'
// Re-export PNG autosave callbacks (imported by main.ts via persistence.ts)
export { onPngSaveError, onPngSaveRecovered } from './PngAutosave.ts'

// ─── JSON persistence (localStorage only) ────────────────────────────────────

const LS_JSON = 'archetype:diagram'

/** Active file handle for continuous autosave as .arch.svg. Null = no file open. */
let activeFileHandle: FileSystemFileHandle | null = null

export function getActiveFileName(): string | null {
  return activeFileHandle?.name ?? null
}

/** Save to localStorage (and autosave to active .arch.svg handle if open). */
export function saveDiagram(diagram: Diagram) {
  localStorage.setItem(LS_JSON, JSON.stringify(serializeDiagramV2(diagram), null, 2))
  if (activeFileHandle) _schedulePngWrite(diagram, _doSvgWrite)
}

async function _doSvgWrite(snapshot: Diagram): Promise<void> {
  const svgStr = buildArchSvgString(snapshot)
  if (activeFileHandle) {
    const w = await activeFileHandle.createWritable()
    await w.write(svgStr)
    await w.close()
  }
}

/** Close the active file handle (e.g. on New diagram). */
export function closeActiveFile() {
  activeFileHandle = null
  _setActiveThumbnailId(null)
  resetPngAutosave()
}

/** Set a file handle as the active autosave target (e.g. resumed from dashboard). */
export function setActiveFileHandle(handle: FileSystemFileHandle | null) {
  activeFileHandle = handle
  resetPngAutosave()
}

/**
 * Open the native Save File picker for a .arch.svg, store the handle, and write immediately.
 * Subsequent calls to `saveDiagram` will autosave to this file.
 * Pass `forceNew = true` to always show the picker (Save As behaviour).
 *
 * Returns the newly-picked FileSystemFileHandle when the picker was shown and
 * the user confirmed, `null` when cancelled, or `true` when an existing handle
 * was reused (no new handle to persist).
 */
export async function openAndSaveToFile(
  diagram: Diagram,
  suggestedName = 'diagram.arch.svg',
  forceNew = false,
): Promise<FileSystemFileHandle | null | true> {
  const svgStr = buildArchSvgString(diagram)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  if (!('showSaveFilePicker' in window)) {
    triggerDownload(blob, suggestedName)
    return true
  }
  if (activeFileHandle && !forceNew) {
    const w = await activeFileHandle.createWritable()
    await w.write(svgStr)
    await w.close()
    return true
  }
  try {
    const handle = await (window as typeof window & {
      showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Archetype diagram', accept: { 'image/svg+xml': ['.svg'] } }],
    })
    activeFileHandle = handle
    resetPngAutosave()
    const w = await handle.createWritable()
    await w.write(svgStr)
    await w.close()
    return handle
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

// ─── .arch.svg — SVG with embedded diagram JSON ──────────────────────────────

const ARCH_KEYWORD = 'archetype-diagram'
const ARCH_META_TAG = 'archetype-diagram'

/**
 * Build a self-contained .arch.svg string: the rendered SVG with diagram JSON
 * embedded inside a <metadata> element.
 */
function buildArchSvgString(diagram: Diagram): string {
  const jsonStr = JSON.stringify(serializeDiagramV2(diagram))
  const bounds = getExportBounds()
  if (!bounds) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><metadata><${ARCH_META_TAG}>${escapeXml(jsonStr)}</${ARCH_META_TAG}></metadata></svg>`
  }
  const { svgEl, contentW, contentH, offsetX, offsetY } = bounds
  const prepared = prepareSvgForExport(svgEl, contentW, contentH, offsetX, offsetY)
  // Inject JSON into a <metadata> child
  const meta = document.createElementNS('http://www.w3.org/2000/svg', 'metadata')
  const inner = document.createElement(ARCH_META_TAG)
  inner.textContent = jsonStr
  meta.appendChild(inner)
  prepared.insertBefore(meta, prepared.firstChild)
  return new XMLSerializer().serializeToString(prepared)
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Read diagram JSON from a FileSystemFileHandle.
 * Handles .arch.svg (extracts embedded metadata), legacy .arch.png, and .json files.
 * Returns the raw JSON string, or null if the file is not a valid diagram.
 */
export async function readDiagramJsonFromHandle(
  handle: FileSystemFileHandle,
): Promise<string | null> {
  const file = await handle.getFile()
  if (file.name.endsWith('.arch.svg') || file.name.endsWith('.svg')) {
    const text = await file.text()
    return extractSvgMetadataJson(text)
  }
  if (file.name.endsWith('.arch.png') || file.name.endsWith('.png')) {
    const buf = await file.arrayBuffer()
    return extractPngiTxt(new Uint8Array(buf), ARCH_KEYWORD)
  }
  return file.text()
}

function extractSvgMetadataJson(svgText: string): string | null {
  const match = svgText.match(new RegExp(`<${ARCH_META_TAG}[^>]*>([\\s\\S]*?)<\\/${ARCH_META_TAG}>`))
  if (!match) return null
  // Unescape XML entities
  return match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

// ─── PNG render (for export only) ────────────────────────────────────────────

/**
 * Render the current diagram SVG to a PNG blob. Used by exportDiagramToPng.
 */
async function buildPngBlob(): Promise<Blob | null> {
  // If there's no SVG context (called from autosave before first render), skip rendering.
  // We only get here via saveDiagram which always has a live SVG, so this is safe.
  if (!document.querySelector('#canvas')) return null

  const bounds = getExportBounds()
  if (!bounds) return null

  const { svgEl, contentW, contentH, offsetX, offsetY } = bounds
  const clonedSvg = prepareSvgForExport(svgEl, contentW, contentH, offsetX, offsetY)

  const svgString = new XMLSerializer().serializeToString(clonedSvg)
  const svgBlob   = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl    = URL.createObjectURL(svgBlob)

  const DPR = 1
  const canvas  = document.createElement('canvas')
  canvas.width  = contentW * DPR
  canvas.height = contentH * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload  = () => { ctx.drawImage(img, 0, 0); resolve() }
    img.onerror = reject
    img.src = svgUrl
  })
  URL.revokeObjectURL(svgUrl)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  })
}

/**
 * Download the current diagram as a plain `.png` file.
 */
export async function exportDiagramToPng(filename = 'diagram'): Promise<void> {
  const blob = await buildPngBlob()
  if (!blob) return
  triggerDownload(blob, `${filename}.png`)
}

/**
 * Render a small thumbnail of the current diagram and return it as a PNG data URL.
 * Returns null if the SVG is not ready or the diagram is empty.
 */
export async function buildThumbnailDataUrl(maxW = 320, maxH = 200): Promise<string | null> {
  const svgEl    = document.querySelector<SVGSVGElement>('#canvas')
  const viewGroup = document.querySelector<SVGGElement>('#view-group')
  if (!svgEl || !viewGroup) return null

  const savedTransform = viewGroup.getAttribute('transform') ?? ''
  viewGroup.setAttribute('transform', '')
  const bbox = viewGroup.getBBox()
  viewGroup.setAttribute('transform', savedTransform)
  if (bbox.width === 0 || bbox.height === 0) return null

  const PADDING = 24
  const contentW = bbox.width  + PADDING * 2
  const contentH = bbox.height + PADDING * 2
  const scale    = Math.min(maxW / contentW, maxH / contentH, 1)
  const thumbW   = Math.round(contentW * scale)
  const thumbH   = Math.round(contentH * scale)

  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('width',   String(thumbW))
  clonedSvg.setAttribute('height',  String(thumbH))
  clonedSvg.setAttribute('viewBox', `${bbox.x - PADDING} ${bbox.y - PADDING} ${contentW} ${contentH}`)
  clonedSvg.querySelectorAll('.rubber-band, .snap-guides').forEach(el => el.remove())
  clonedSvg.querySelectorAll('foreignObject').forEach(fo => fo.remove())
  const clonedViewGroup = clonedSvg.querySelector('#view-group') as SVGGElement | null
  if (clonedViewGroup) clonedViewGroup.removeAttribute('transform')
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = collectStyles()
  clonedSvg.prepend(styleEl)

  const svgUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clonedSvg)], { type: 'image/svg+xml;charset=utf-8' })
  )
  const canvas = document.createElement('canvas')
  canvas.width  = thumbW
  canvas.height = thumbH
  const ctx = canvas.getContext('2d')!
  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload  = () => { ctx.drawImage(img, 0, 0); resolve() }
    img.onerror = reject
    img.src = svgUrl
  })
  URL.revokeObjectURL(svgUrl)
  return canvas.toDataURL('image/png')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── File loading ────────────────────────────────────────────────────────────

/**
 * Request readwrite permission on `handle` and verify it by opening then
 * immediately closing a writable stream. Returns the handle on success, or
 * null if permission was denied or the write test failed.
 *
 * Called right after `showOpenFilePicker` while we are still inside the
 * user-gesture context, which lets the browser grant write permission without
 * a separate prompt on most platforms.
 */
export async function acquireWriteHandle(
  handle: FileSystemFileHandle,
): Promise<FileSystemFileHandle | null> {
  try {
    const h = handle as FileSystemFileHandle & {
      queryPermission:   (desc: { mode: string }) => Promise<string>
      requestPermission: (desc: { mode: string }) => Promise<string>
    }
    let perm = await h.queryPermission({ mode: 'readwrite' })
    if (perm === 'prompt') {
      perm = await h.requestPermission({ mode: 'readwrite' })
    }
    if (perm !== 'granted') return null

    // Smoke-test: open a writable and close it immediately (writes nothing).
    // This will throw if a .crswap lock is already held or the file is read-only.
    const w = await handle.createWritable({ keepExistingData: true })
    await w.close()
    return handle
  } catch {
    return null
  }
}

/**
 * Open a file picker, load the diagram, and set the handle as the active
 * autosave target so subsequent saves write back to the same file.
 */
export async function loadDiagramFromFile(
  onLoad: (diagram: Diagram, handle: FileSystemFileHandle | null, rawJson: string) => void
): Promise<void> {
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as typeof window & {
        showOpenFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle[]>
      }).showOpenFilePicker({
        types: [
          { description: 'Diagram files', accept: { 'application/json': ['.json'], 'image/svg+xml': ['.svg'], 'image/png': ['.png'] } },
        ],
        multiple: false,
      })

      // Request write permission immediately — we are still inside the user-gesture
      // context from the picker, so the browser may grant it without a second prompt.
      // Then open+close a writable right away to confirm the handle actually works.
      // This surfaces permission/lock errors before the first autosave fires.
      const writeHandle = await acquireWriteHandle(handle)

      const file = await handle.getFile()
      if (file.name.endsWith('.arch.svg') || file.name.endsWith('.svg')) {
        const text = await file.text()
        const json = extractSvgMetadataJson(text)
        if (!json) { alert('This SVG does not contain an embedded diagram.'); return }
        const raw = JSON.parse(json)
        activeFileHandle = writeHandle
        onLoad(deserializeV2(raw), handle, json)
      } else if (file.name.endsWith('.arch.png') || file.name.endsWith('.png')) {
        const buf  = await file.arrayBuffer()
        const json = extractPngiTxt(new Uint8Array(buf), ARCH_KEYWORD)
        if (!json) { alert('This PNG does not contain an embedded diagram.'); return }
        const raw = JSON.parse(json)
        // Always store the original handle (for IndexedDB / recent files).
        // activeFileHandle uses the write-verified handle — null if write access denied.
        activeFileHandle = writeHandle
        onLoad(deserializeV2(raw), handle, json)
      } else {
        const text = await file.text()
        const raw  = JSON.parse(text)
        activeFileHandle = writeHandle ?? handle
        onLoad(deserializeV2(raw), handle, text)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof SyntaxError) { alert('Could not read diagram file — invalid JSON.'); return }
      throw err
    }
    return
  }

  // Fallback: <input type="file"> — no writable handle
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json,.arch.svg,.svg,image/svg+xml,.arch.png,.png,image/png'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.name.endsWith('.arch.svg') || file.name.endsWith('.svg')) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = reader.result as string
          const json = extractSvgMetadataJson(text)
          if (!json) { alert('This SVG does not contain an embedded diagram.'); return }
          onLoad(deserializeV2(JSON.parse(json)), null, json)
        } catch {
          alert('Could not read diagram from SVG.')
        }
      }
      reader.readAsText(file)
    } else if (file.name.endsWith('.arch.png') || file.name.endsWith('.png')) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const buf  = reader.result as ArrayBuffer
          const json = extractPngiTxt(new Uint8Array(buf), ARCH_KEYWORD)
          if (!json) { alert('This PNG does not contain an embedded diagram.'); return }
          onLoad(deserializeV2(JSON.parse(json)), null, json)
        } catch {
          alert('Could not read diagram from PNG.')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = reader.result as string
          const raw = JSON.parse(text)
          onLoad(deserializeV2(raw), null, text)
        } catch {
          alert('Could not read diagram file — invalid JSON.')
        }
      }
      reader.readAsText(file)
    }
  })
  input.click()
}

export function loadDiagram(): Diagram | null {
  const raw = localStorage.getItem(LS_JSON)
  if (raw) {
    try {
      return deserializeV2(JSON.parse(raw))
    } catch { /* fall through */ }
  }
  return null
}

// ─── v2 Serialization ────────────────────────────────────────────────────────

/** Convert internal Diagram to the AI-friendly v2 JSON format. */
export function serializeDiagramV2(diagram: Diagram): unknown {
  const elements: unknown[] = []

  for (const c of diagram.classes) {
    const el: Record<string, unknown> = {
      type: 'uml-class',
      id: c.id,
      name: c.name,
      position: c.position,
      size: c.size,
    }
    if (c.stereotype !== 'class') el.stereotype = c.stereotype
    if (c.packageId) el.packageId = c.packageId
    if (c.multiInstance) el.multiInstance = c.multiInstance
    if (c.accentColor) el.accentColor = c.accentColor
    if (c.attributes.length) el.attributes = c.attributes.map(serializeAttribute)
    if (c.methods.length) el.methods = c.methods.map(serializeMethod)
    elements.push(el)
  }

  for (const p of diagram.packages) {
    const el: Record<string, unknown> = { type: 'uml-package', id: p.id, name: p.name, position: p.position, size: p.size }
    if (p.accentColor) el.accentColor = p.accentColor
    elements.push(el)
  }

  for (const s of diagram.storages) {
    const el: Record<string, unknown> = { type: 'storage', id: s.id, name: s.name, position: s.position, size: s.size }
    if (s.multiInstance) el.multiInstance = s.multiInstance
    if (s.accentColor) el.accentColor = s.accentColor
    elements.push(el)
  }

  for (const a of diagram.actors) {
    const el: Record<string, unknown> = { type: a.elementType, id: a.id, name: a.name, position: a.position, size: a.size }
    if (a.multiInstance) el.multiInstance = a.multiInstance
    if (a.accentColor) el.accentColor = a.accentColor
    elements.push(el)
  }

  for (const q of diagram.queues) {
    const el: Record<string, unknown> = { type: 'queue', id: q.id, name: q.name, position: q.position, size: q.size }
    if (q.multiInstance) el.multiInstance = q.multiInstance
    if (q.flowReversed) el.flowReversed = q.flowReversed
    if (q.accentColor) el.accentColor = q.accentColor
    elements.push(el)
  }

  for (const u of diagram.useCases) {
    const el: Record<string, unknown> = { type: 'use-case', id: u.id, name: u.name, position: u.position, size: u.size }
    if (u.accentColor) el.accentColor = u.accentColor
    elements.push(el)
  }

  for (const s of diagram.ucSystems) {
    const el: Record<string, unknown> = { type: 'uc-system', id: s.id, name: s.name, position: s.position, size: s.size }
    if (s.accentColor) el.accentColor = s.accentColor
    elements.push(el)
  }

  for (const s of diagram.states) {
    const el: Record<string, unknown> = { type: 'state', id: s.id, name: s.name, position: s.position, size: s.size }
    if (s.accentColor) el.accentColor = s.accentColor
    elements.push(el)
  }

  for (const s of diagram.startStates) {
    elements.push({ type: 'start-state', id: s.id, position: s.position, size: s.size })
  }

  for (const s of diagram.endStates) {
    elements.push({ type: 'end-state', id: s.id, position: s.position, size: s.size })
  }

  for (const sd of diagram.sequenceDiagrams) {
    elements.push({ type: 'seq-diagram', id: sd.id, position: sd.position, size: sd.size, lifelines: sd.lifelines })
  }

  for (const f of diagram.combinedFragments) {
    const el: Record<string, unknown> = { type: 'seq-fragment', id: f.id, operator: f.operator, condition: f.condition, position: f.position, size: f.size }
    if (f.accentColor) el.accentColor = f.accentColor
    elements.push(el)
  }

  for (const c of diagram.comments) {
    const el: Record<string, unknown> = { type: 'comment', id: c.id, text: c.text, position: c.position, size: c.size }
    if (c.pinnedTo) { el.pinnedTo = c.pinnedTo; el.pinnedOffset = c.pinnedOffset }
    elements.push(el)
  }

  const connections = diagram.connections.map(conn => {
    const c: Record<string, unknown> = {
      id: conn.id,
      source: conn.source.elementId,
      target: conn.target.elementId,
      type: conn.type,
    }
    if (conn.label) c.label = conn.label
    if (conn.sourceMultiplicity) c.sourceMultiplicity = conn.sourceMultiplicity
    if (conn.targetMultiplicity) c.targetMultiplicity = conn.targetMultiplicity
    if (conn.srcElbowMode && conn.srcElbowMode !== 'auto') c.srcElbowMode = conn.srcElbowMode
    if (conn.elbowMode && conn.elbowMode !== 'auto') c.elbowMode = conn.elbowMode
    return c
  })

  return {
    version: 2,
    id: diagram.id,
    name: diagram.name,
    elements,
    connections,
    viewport: diagram.viewport,
  }
}

// ─── v2 Deserialization ───────────────────────────────────────────────────────

/** Parse a v2 JSON object into the internal Diagram format. Never throws — applies defaults. */
export function deserializeV2(raw: Record<string, unknown>): Diagram {
  const diagram = createDiagram(typeof raw.name === 'string' ? raw.name : 'Untitled')
  if (typeof raw.id === 'string' && raw.id) diagram.id = raw.id
  if (raw.viewport && typeof raw.viewport === 'object') {
    const vp = raw.viewport as Record<string, unknown>
    diagram.viewport = {
      x: typeof vp.x === 'number' ? vp.x : 0,
      y: typeof vp.y === 'number' ? vp.y : 0,
      zoom: typeof vp.zoom === 'number' && vp.zoom > 0 ? vp.zoom : 1,
    }
  }

  const elements = Array.isArray(raw.elements) ? (raw.elements as Record<string, unknown>[]) : []
  for (const el of elements) {
    const type = typeof el.type === 'string' ? el.type : ''
    const id = typeof el.id === 'string' && el.id ? el.id : crypto.randomUUID()
    const name = typeof el.name === 'string' ? el.name : ''
    const position = parsePosition(el.position)
    const needsLayout = !hasExplicitPosition(el.position)
    const size = parseSize(el.size) ?? getElementConfig(type)?.defaultSize ?? { w: 120, h: 60 }

    switch (type) {
      case 'uml-class': {
        const cls: UmlClass & { _needsLayout?: boolean } = {
          id,
          elementType: 'uml-class',
          name,
          stereotype: parseStereotype(el.stereotype),
          packageId: typeof el.packageId === 'string' ? el.packageId : null,
          attributes: parseStringArray(el.attributes).map(parseAttribute),
          methods: parseStringArray(el.methods).map(parseMethod),
          position,
          size,
          multiInstance: el.multiInstance === true,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) cls._needsLayout = true
        diagram.classes.push(cls)
        break
      }
      case 'uml-package': {
        const pkg: UmlPackage & { _needsLayout?: boolean } = {
          id, elementType: 'uml-package', name, position, size,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) pkg._needsLayout = true
        diagram.packages.push(pkg)
        break
      }
      case 'storage': {
        const s: Storage & { _needsLayout?: boolean } = {
          id, elementType: 'storage', name, position, size, multiInstance: el.multiInstance === true,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) s._needsLayout = true
        diagram.storages.push(s)
        break
      }
      case 'agent':
      case 'human-agent':
      case 'uc-actor': {
        const a: Actor & { _needsLayout?: boolean } = {
          id, elementType: type as 'agent' | 'human-agent' | 'uc-actor', name, position, size,
          multiInstance: el.multiInstance === true,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) a._needsLayout = true
        diagram.actors.push(a)
        break
      }
      case 'queue': {
        const q: Queue & { _needsLayout?: boolean } = {
          id, elementType: 'queue', name, position, size,
          multiInstance: el.multiInstance === true,
          flowReversed: el.flowReversed === true,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) q._needsLayout = true
        diagram.queues.push(q)
        break
      }
      case 'use-case': {
        const u: UseCase & { _needsLayout?: boolean } = {
          id, elementType: 'use-case', name, position, size,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) u._needsLayout = true
        diagram.useCases.push(u)
        break
      }
      case 'uc-system': {
        const u: UCSystem & { _needsLayout?: boolean } = {
          id, elementType: 'uc-system', name, position, size,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) u._needsLayout = true
        diagram.ucSystems.push(u)
        break
      }
      case 'state': {
        const s: State & { _needsLayout?: boolean } = {
          id, elementType: 'state', name, position, size,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) s._needsLayout = true
        diagram.states.push(s)
        break
      }
      case 'start-state': {
        const s: StartState & { _needsLayout?: boolean } = { id, elementType: 'start-state', position, size }
        if (needsLayout) s._needsLayout = true
        diagram.startStates.push(s)
        break
      }
      case 'end-state': {
        const s: EndState & { _needsLayout?: boolean } = { id, elementType: 'end-state', position, size }
        if (needsLayout) s._needsLayout = true
        diagram.endStates.push(s)
        break
      }
      case 'seq-diagram': {
        const lifelines = parseLifelines(el.lifelines)
        const sd: SequenceDiagram & { _needsLayout?: boolean } = {
          id, elementType: 'seq-diagram', position, size, lifelines,
        }
        if (needsLayout) sd._needsLayout = true
        diagram.sequenceDiagrams.push(sd)
        break
      }
      case 'seq-fragment': {
        const f: CombinedFragment & { _needsLayout?: boolean } = {
          id, elementType: 'seq-fragment',
          operator: parseFragmentOperator(el.operator),
          condition: typeof el.condition === 'string' ? el.condition : '',
          position, size,
          accentColor: parseAccentColor(el.accentColor),
        }
        if (needsLayout) f._needsLayout = true
        diagram.combinedFragments.push(f)
        break
      }
      case 'comment': {
        const c: Comment & { _needsLayout?: boolean } = {
          id,
          elementType: 'comment',
          text: typeof el.text === 'string' ? el.text : '',
          position,
          size,
          pinnedTo: typeof el.pinnedTo === 'string' ? el.pinnedTo : null,
          pinnedOffset: hasExplicitPosition(el.pinnedOffset) ? parsePosition(el.pinnedOffset) : null,
        }
        if (!hasExplicitPosition(el.position)) c._needsLayout = true
        diagram.comments.push(c)
        break
      }
      // Unknown type — skip silently
    }
  }

  const rawConns = Array.isArray(raw.connections) ? (raw.connections as Record<string, unknown>[]) : []
  for (const c of rawConns) {
    const src = typeof c.source === 'string' && c.source ? c.source : ''
    const tgt = typeof c.target === 'string' && c.target ? c.target : ''
    if (!src || !tgt) continue
    const connType = parseConnectionType(c.type)
    const connId = typeof c.id === 'string' && c.id
      ? c.id
      : deterministicId(src, tgt, connType)
    const conn: Connection = {
      id: connId,
      source: { elementId: src, port: 'e' },
      target: { elementId: tgt, port: 'w' },
      type: connType,
      sourceMultiplicity: parseMultiplicity(c.sourceMultiplicity),
      targetMultiplicity: parseMultiplicity(c.targetMultiplicity),
      label: typeof c.label === 'string' ? c.label : '',
      srcElbowMode: parseElbowMode(c.srcElbowMode),
      elbowMode: parseElbowMode(c.elbowMode),
    }
    diagram.connections.push(conn)
  }

  return diagram
}

// ─── Parse helpers ────────────────────────────────────────────────────────────

function hasExplicitPosition(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  return typeof p.x === 'number' && typeof p.y === 'number'
}

function parsePosition(raw: unknown): { x: number; y: number } {
  if (raw && typeof raw === 'object') {
    const p = raw as Record<string, unknown>
    if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y }
  }
  return { x: 0, y: 0 }
}

function parseSize(raw: unknown): { w: number; h: number } | null {
  if (raw && typeof raw === 'object') {
    const s = raw as Record<string, unknown>
    if (typeof s.w === 'number' && typeof s.h === 'number' && s.w > 0 && s.h > 0) {
      return { w: s.w, h: s.h }
    }
  }
  return null
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(x => typeof x === 'string') as string[]
}

function parseStereotype(raw: unknown): 'class' | 'abstract' | 'interface' | 'enum' {
  if (raw === 'abstract' || raw === 'interface' || raw === 'enum') return raw
  return 'class'
}

const VALID_ACCENT_COLORS = new Set([
  '--ctp-red', '--ctp-peach', '--ctp-yellow', '--ctp-green',
  '--ctp-teal', '--ctp-blue', '--ctp-lavender', '--ctp-mauve',
])
function parseAccentColor(raw: unknown): string | undefined {
  return typeof raw === 'string' && VALID_ACCENT_COLORS.has(raw) ? raw : undefined
}

function parseFragmentOperator(raw: unknown): 'alt' | 'opt' | 'loop' | 'par' | 'ref' {
  if (raw === 'opt' || raw === 'loop' || raw === 'par' || raw === 'ref') return raw
  return 'alt'
}

const VALID_CONNECTION_TYPES = new Set<ConnectionType>([
  'association', 'composition', 'aggregation', 'inheritance', 'realization', 'dependency',
  'plain', 'read', 'write', 'read-write', 'request',
  'uc-association', 'uc-extend', 'uc-include', 'uc-specialization', 'transition',
])

function parseConnectionType(raw: unknown): ConnectionType {
  if (typeof raw === 'string' && VALID_CONNECTION_TYPES.has(raw as ConnectionType)) return raw as ConnectionType
  return 'association'
}

function parseMultiplicity(raw: unknown): Multiplicity {
  if (raw === '1' || raw === '0..1' || raw === '*' || raw === '1..*' || raw === '0..*') return raw
  return ''
}

function parseElbowMode(raw: unknown): ElbowMode | undefined {
  if (raw === 'horizontal' || raw === 'vertical' || raw === 'left' || raw === 'right') return raw
  // migrate legacy values
  if (raw === 'min') return 'horizontal'
  if (raw === 'max') return 'vertical'
  if (raw === 'auto') return undefined
  return undefined
}

function parseLifelines(raw: unknown): SequenceLifeline[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(ll => ll && typeof ll === 'object')
    .map((ll: Record<string, unknown>) => ({
      id: typeof ll.id === 'string' && ll.id ? ll.id : crypto.randomUUID(),
      elementType: 'seq-lifeline' as const,
      name: typeof ll.name === 'string' ? ll.name : 'Lifeline',
      messages: parseMessages(ll.messages),
      position: parsePosition(ll.position),
      size: parseSize(ll.size) ?? { w: 140, h: 40 },
      accentColor: parseAccentColor(ll.accentColor),
    }))
}

function parseMessages(raw: unknown): SequenceMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(m => m && typeof m === 'object')
    .map((m: Record<string, unknown>) => {
      const kind = parseMessageKind(m.kind)
      return {
        id: typeof m.id === 'string' && m.id ? m.id : crypto.randomUUID(),
        label: typeof m.label === 'string' ? m.label : '',
        targetLifelineId: typeof m.targetLifelineId === 'string' ? m.targetLifelineId : null,
        kind,
        slotIndex: typeof m.slotIndex === 'number' ? m.slotIndex : undefined,
      }
    })
}

function parseMessageKind(raw: unknown): SequenceMessage['kind'] {
  if (raw === 'async' || raw === 'create' || raw === 'self' || raw === 'return') return raw
  return 'sync'
}

function deterministicId(src: string, tgt: string, type: string): string {
  return btoa(`${src}|${tgt}|${type}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
}

