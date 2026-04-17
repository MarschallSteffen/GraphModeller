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
import { LATTE, PRINT } from '../themes/catppuccin.ts'

// ─── JSON persistence ────────────────────────────────────────────────────────

const LS_JSON = 'archetype:diagram'

/** Active file handle for continuous autosave. Null = no file open. */
let activeFileHandle: FileSystemFileHandle | null = null

export function getActiveFileName(): string | null {
  return activeFileHandle?.name ?? null
}

export function saveDiagram(diagram: Diagram) {
  const v2 = serializeDiagramV2(diagram)
  localStorage.setItem(LS_JSON, JSON.stringify(v2, null, 2))
  if (activeFileHandle) {
    writeToHandle(activeFileHandle, v2).catch(() => {
      activeFileHandle = null
    })
  }
}

async function writeToHandle(handle: FileSystemFileHandle, data: unknown): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(data, null, 2))
  await writable.close()
}

/**
 * Open the native Save File picker, store the handle, and write immediately.
 * Subsequent calls to `saveDiagram` will autosave to this file.
 * Pass `forceNew = true` to always show the picker (Save As behaviour).
 */
export async function openAndSaveToFile(
  diagram: Diagram,
  suggestedName = 'diagram.json',
  forceNew = false,
): Promise<boolean> {
  if (!('showSaveFilePicker' in window)) {
    saveDiagramToFile(diagram, suggestedName)
    return true
  }
  if (activeFileHandle && !forceNew) {
    await writeToHandle(activeFileHandle, serializeDiagramV2(diagram))
    return true
  }
  try {
    const handle = await (window as typeof window & {
      showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Diagram JSON', accept: { 'application/json': ['.json'] } }],
    })
    activeFileHandle = handle
    await writeToHandle(handle, serializeDiagramV2(diagram))
    return true
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return false
    throw err
  }
}

/** Close the active file handle (e.g. on New diagram). */
export function closeActiveFile() {
  activeFileHandle = null
}

/** Set a file handle as the active autosave target (e.g. resumed from dashboard). */
export function setActiveFileHandle(handle: FileSystemFileHandle | null) {
  activeFileHandle = handle
}

/** Trigger a browser download of the diagram as a .json file (no handle). */
export function saveDiagramToFile(diagram: Diagram, filename = 'diagram.json') {
  const json = JSON.stringify(serializeDiagramV2(diagram), null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  triggerDownload(blob, filename)
}

// ─── PNG export ──────────────────────────────────────────────────────────────

/**
 * Render the current SVG diagram to a PNG and trigger a download.
 */
export async function exportDiagramToPng(
  svgEl: SVGSVGElement,
  viewGroup: SVGGElement,
  filename = 'diagram',
): Promise<void> {
  const PADDING = 48

  const savedTransform = viewGroup.getAttribute('transform') ?? ''
  viewGroup.setAttribute('transform', '')
  const bbox = viewGroup.getBBox()
  viewGroup.setAttribute('transform', savedTransform)

  if (bbox.width === 0 || bbox.height === 0) return

  const contentW = Math.ceil(bbox.width  + PADDING * 2)
  const contentH = Math.ceil(bbox.height + PADDING * 2)
  const offsetX  = bbox.x - PADDING
  const offsetY  = bbox.y - PADDING

  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('width',   String(contentW))
  clonedSvg.setAttribute('height',  String(contentH))
  clonedSvg.setAttribute('viewBox', `${offsetX} ${offsetY} ${contentW} ${contentH}`)

  clonedSvg.querySelectorAll('.rubber-band, .snap-guides').forEach(el => el.remove())

  // Replace <foreignObject> elements with SVG <text> to avoid canvas taint
  const NS = 'http://www.w3.org/2000/svg'
  clonedSvg.querySelectorAll('foreignObject').forEach(fo => {
    const x = parseFloat(fo.getAttribute('x') ?? '0')
    const y = parseFloat(fo.getAttribute('y') ?? '0')
    const rawText = (fo.textContent ?? '').trim()
    if (!rawText) { fo.remove(); return }
    const FONT_SIZE = 12
    const LINE_HEIGHT = FONT_SIZE * 1.4
    const PADDING = 6
    const lines = rawText.split('\n')
    const g = document.createElementNS(NS, 'g')
    lines.forEach((line, i) => {
      const t = document.createElementNS(NS, 'text')
      t.setAttribute('x', String(x + PADDING))
      t.setAttribute('y', String(y + PADDING + FONT_SIZE + i * LINE_HEIGHT))
      t.setAttribute('font-size', String(FONT_SIZE))
      t.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif')
      t.setAttribute('fill', 'currentColor')
      t.textContent = line || ''
      g.appendChild(t)
    })
    fo.replaceWith(g)
  })

  const clonedViewGroup = clonedSvg.querySelector('#view-group') as SVGGElement | null
  if (clonedViewGroup) clonedViewGroup.removeAttribute('transform')

  const styleText = collectStyles()
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = styleText
  clonedSvg.prepend(styleEl)

  const svgString = new XMLSerializer().serializeToString(clonedSvg)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl  = URL.createObjectURL(svgBlob)

  const DPR = Math.max(window.devicePixelRatio ?? 1, 2)
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

  canvas.toBlob(blob => {
    if (blob) triggerDownload(blob, `${filename}.png`)
  }, 'image/png')
}

/** Collect all CSS rules and inject theme variables for consistent PNG output.
 *  Uses the Print palette when the Print theme is active, otherwise Latte. */
function collectStyles(): string {
  const parts: string[] = []

  const activeFlavour = document.documentElement.getAttribute('data-theme')
  const exportPalette = activeFlavour === 'print' ? PRINT : LATTE
  const themeVars = Object.entries(exportPalette)
    .map(([key, value]) => `  --ctp-${key}: ${value};`)
    .join('\n')
  parts.push(`:root {\n${themeVars}\n}`)

  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        parts.push(rule.cssText)
      }
    } catch { /* Cross-origin stylesheets — skip */ }
  }

  return parts.join('\n')
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
        types: [{ description: 'Diagram JSON', accept: { 'application/json': ['.json'] } }],
        multiple: false,
      })
      const file = await handle.getFile()
      const text = await file.text()
      const raw = JSON.parse(text)
      activeFileHandle = handle
      onLoad(deserializeV2(raw), handle, text)
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
  input.accept = '.json,application/json'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
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
    if (c.attributes.length) el.attributes = c.attributes.map(serializeAttribute)
    if (c.methods.length) el.methods = c.methods.map(serializeMethod)
    elements.push(el)
  }

  for (const p of diagram.packages) {
    elements.push({ type: 'uml-package', id: p.id, name: p.name, position: p.position, size: p.size })
  }

  for (const s of diagram.storages) {
    const el: Record<string, unknown> = { type: 'storage', id: s.id, name: s.name, position: s.position, size: s.size }
    if (s.multiInstance) el.multiInstance = s.multiInstance
    elements.push(el)
  }

  for (const a of diagram.actors) {
    const el: Record<string, unknown> = { type: a.elementType, id: a.id, name: a.name, position: a.position, size: a.size }
    if (a.multiInstance) el.multiInstance = a.multiInstance
    elements.push(el)
  }

  for (const q of diagram.queues) {
    const el: Record<string, unknown> = { type: 'queue', id: q.id, name: q.name, position: q.position, size: q.size }
    if (q.multiInstance) el.multiInstance = q.multiInstance
    if (q.flowReversed) el.flowReversed = q.flowReversed
    elements.push(el)
  }

  for (const u of diagram.useCases) {
    elements.push({ type: 'use-case', id: u.id, name: u.name, position: u.position, size: u.size })
  }

  for (const s of diagram.ucSystems) {
    elements.push({ type: 'uc-system', id: s.id, name: s.name, position: s.position, size: s.size })
  }

  for (const s of diagram.states) {
    elements.push({ type: 'state', id: s.id, name: s.name, position: s.position, size: s.size })
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
    elements.push({ type: 'seq-fragment', id: f.id, operator: f.operator, condition: f.condition, position: f.position, size: f.size })
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
        }
        if (needsLayout) cls._needsLayout = true
        diagram.classes.push(cls)
        break
      }
      case 'uml-package': {
        const pkg: UmlPackage & { _needsLayout?: boolean } = {
          id, elementType: 'uml-package', name, position, size,
        }
        if (needsLayout) pkg._needsLayout = true
        diagram.packages.push(pkg)
        break
      }
      case 'storage': {
        const s: Storage & { _needsLayout?: boolean } = {
          id, elementType: 'storage', name, position, size, multiInstance: el.multiInstance === true,
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
        }
        if (needsLayout) q._needsLayout = true
        diagram.queues.push(q)
        break
      }
      case 'use-case': {
        const u: UseCase & { _needsLayout?: boolean } = { id, elementType: 'use-case', name, position, size }
        if (needsLayout) u._needsLayout = true
        diagram.useCases.push(u)
        break
      }
      case 'uc-system': {
        const u: UCSystem & { _needsLayout?: boolean } = { id, elementType: 'uc-system', name, position, size }
        if (needsLayout) u._needsLayout = true
        diagram.ucSystems.push(u)
        break
      }
      case 'state': {
        const s: State & { _needsLayout?: boolean } = { id, elementType: 'state', name, position, size }
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
  if (raw === 'min' || raw === 'max') return raw
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

