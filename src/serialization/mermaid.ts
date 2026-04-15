import type { Diagram } from '../entities/Diagram.ts'
import { createDiagram } from '../entities/Diagram.ts'
import type { UmlClass } from '../entities/UmlClass.ts'
import { serializeAttribute } from '../entities/Attribute.ts'
import { serializeMethod } from '../entities/Method.ts'
import { parseAttribute } from '../entities/Attribute.ts'
import { parseMethod } from '../entities/Method.ts'
import { createUmlClass } from '../entities/UmlClass.ts'
import { createUmlPackage } from '../entities/Package.ts'
import { createStorage } from '../entities/Storage.ts'
import { createActor } from '../entities/Actor.ts'
import { createQueue } from '../entities/Queue.ts'
import { createConnection } from '../entities/Connection.ts'
import type { ConnectionType, Multiplicity, PortSide } from '../entities/Connection.ts'
import { LATTE } from '../themes/catppuccin.ts'

const CONNECTION_TYPE_MAP: Record<string, ConnectionType> = {
  '--':    'association',
  '*--':   'composition',
  'o--':   'aggregation',
  '<|--':  'inheritance',
  '<|..':  'realization',
  '..>':   'dependency',
  '-->':   'association',  // fallback
  '<--':   'read',
  '--->':  'write',
  '<--->': 'read-write',
  '~~>':   'request',
}

// ─── Serialise ───────────────────────────────────────────────────────────────

export function toMermaid(diagram: Diagram): string {
  const lines: string[] = ['classDiagram']

  diagram.packages.forEach(pkg => {
    lines.push(`  namespace ${pkg.name} {`)
    diagram.classes
      .filter(c => c.packageId === pkg.id)
      .forEach(cls => lines.push(...classLines(cls, 4)))
    lines.push('  }')
  })

  diagram.classes
    .filter(c => c.packageId === null)
    .forEach(cls => lines.push(...classLines(cls, 2)))

  // Storage elements serialized as a comment block (Mermaid has no native storage)
  diagram.storages.forEach(st => {
    lines.push(`  %% storage: ${st.name}`)
  })

  // Actor elements
  diagram.actors?.forEach(ac => {
    lines.push(`  %% actor:${ac.elementType}: ${ac.name}`)
  })

  // Queue elements
  diagram.queues?.forEach(q => {
    lines.push(`  %% queue: ${q.name}`)
  })

  diagram.connections.forEach(conn => {
    const srcName = elementName(diagram, conn.source.elementId)
    const tgtName = elementName(diagram, conn.target.elementId)
    const arrow = connArrow(conn.type)
    const srcMult = conn.sourceMultiplicity ? ` "${conn.sourceMultiplicity}"` : ''
    const tgtMult = conn.targetMultiplicity ? ` "${conn.targetMultiplicity}"` : ''
    const lbl = conn.label ? ` : ${conn.label}` : ''
    lines.push(`  ${srcName}${srcMult} ${arrow}${tgtMult} ${tgtName}${lbl}`)
  })

  return lines.join('\n')
}

export function toLayoutJson(diagram: Diagram): string {
  const layout: Record<string, Record<string, unknown>> = { classes: {}, packages: {}, storages: {}, actors: {}, queues: {} }

  diagram.classes.forEach(c => {
    layout.classes[c.name] = { x: c.position.x, y: c.position.y, w: c.size.w, h: c.size.h }
  })
  diagram.packages.forEach(p => {
    layout.packages[p.name] = { x: p.position.x, y: p.position.y, w: p.size.w, h: p.size.h }
  })
  diagram.storages.forEach(s => {
    layout.storages[s.name] = { x: s.position.x, y: s.position.y, w: s.size.w, h: s.size.h }
  })
  diagram.actors?.forEach(a => {
    layout.actors[a.name] = { x: a.position.x, y: a.position.y, w: a.size.w, h: a.size.h, elementType: a.elementType }
  })
  diagram.queues?.forEach(q => {
    layout.queues[q.name] = { x: q.position.x, y: q.position.y, w: q.size.w, h: q.size.h }
  })

  return JSON.stringify(layout, null, 2)
}

// ─── Parse ────────────────────────────────────────────────────────────────────

export function fromMermaid(mmd: string, layoutJson?: string): Diagram {
  const diagram = createDiagram()
  const layout = layoutJson ? JSON.parse(layoutJson) : { classes: {}, packages: {}, storages: {}, actors: {}, queues: {} }

  const lines = mmd.split('\n').map(l => l.trim()).filter(Boolean)
  let currentPackageId: string | null = null

  for (const line of lines) {
    if (line === 'classDiagram') continue

    // Storage comment line
    if (line.startsWith('%% storage:')) {
      const name = line.replace('%% storage:', '').trim()
      const l = layout.storages?.[name] ?? {}
      const st = createStorage({ name, position: { x: l.x ?? 100, y: l.y ?? 100 }, size: { w: l.w ?? 160, h: l.h ?? 60 } })
      diagram.storages.push(st)
      continue
    }

    // Actor comment line
    const actorMatch = line.match(/^%% actor:(agent|human-agent):\s*(.+)$/)
    if (actorMatch) {
      const elementType = actorMatch[1] as 'agent' | 'human-agent'
      const name = actorMatch[2].trim()
      const l = layout.actors?.[name] ?? {}
      const ac = createActor({ elementType, name, position: { x: l.x ?? 100, y: l.y ?? 100 }, size: { w: l.w ?? undefined, h: l.h ?? undefined } })
      diagram.actors.push(ac)
      continue
    }

    // Queue comment line
    if (line.startsWith('%% queue:')) {
      const name = line.replace('%% queue:', '').trim()
      const l = layout.queues?.[name] ?? {}
      const q = createQueue({ name, position: { x: l.x ?? 100, y: l.y ?? 100 }, size: { w: l.w ?? 160, h: l.h ?? 60 } })
      diagram.queues.push(q)
      continue
    }

    if (line.startsWith('namespace ')) {
      const name = line.replace('namespace ', '').replace('{', '').trim()
      const l = layout.packages?.[name] ?? {}
      const pkg = createUmlPackage({ name, position: { x: l.x ?? 60, y: l.y ?? 60 }, size: { w: l.w ?? 320, h: l.h ?? 240 } })
      diagram.packages.push(pkg)
      currentPackageId = pkg.id
      continue
    }

    if (line === '}') { currentPackageId = null; continue }

    // class declaration
    const classMatch = line.match(/^class\s+(\w+)\s*\{?$/)
    if (classMatch) {
      const name = classMatch[1]
      const l = layout.classes?.[name] ?? {}
      const cls = createUmlClass({ name, packageId: currentPackageId, position: { x: l.x ?? 100, y: l.y ?? 100 }, size: { w: l.w ?? 180, h: l.h ?? 120 } })
      diagram.classes.push(cls)
      continue
    }

    // member inside class — look for last class
    const memberMatch = line.match(/^[+\-#~]/)
    if (memberMatch) {
      const lastClass = diagram.classes.at(-1)
      if (lastClass) {
        if (line.includes('(')) {
          lastClass.methods.push(parseMethod(line))
        } else {
          lastClass.attributes.push(parseAttribute(line))
        }
      }
      continue
    }

    // connection
    const connMatch = line.match(/^(\w+)(?:\s+"([^"]+)")?\s+([<|*o.>\w~-]+)\s+(?:"([^"]+)")?\s*(\w+)(?:\s*:\s*(.+))?$/)
    if (connMatch) {
      const [, srcName, srcMult, arrowRaw, tgtMult, tgtName, label] = connMatch
      const srcEl = findNamedElement(diagram, srcName)
      const tgtEl = findNamedElement(diagram, tgtName)
      if (srcEl && tgtEl) {
        const type: ConnectionType = CONNECTION_TYPE_MAP[arrowRaw] ?? 'association'
        const conn = createConnection({ elementId: srcEl.id, port: 'e' as PortSide }, { elementId: tgtEl.id, port: 'w' as PortSide }, type)
        conn.sourceMultiplicity = (srcMult ?? '') as Multiplicity
        conn.targetMultiplicity = (tgtMult ?? '') as Multiplicity
        conn.label = label?.trim() ?? ''
        diagram.connections.push(conn)
      }
    }
  }

  return diagram
}

// ─── JSON persistence (primary) ───────────────────────────────────────────────

const LS_JSON = 'diagrams-tool:diagram'

/** Active file handle for continuous autosave. Null = no file open. */
let activeFileHandle: FileSystemFileHandle | null = null

export function getActiveFileName(): string | null {
  return activeFileHandle?.name ?? null
}

export function saveDiagram(diagram: Diagram) {
  localStorage.setItem(LS_JSON, JSON.stringify(diagram))
  // Write to open file handle in background — fire and forget
  if (activeFileHandle) {
    writeToHandle(activeFileHandle, diagram).catch(() => {
      // If the handle becomes invalid (file deleted etc.), silently drop it
      activeFileHandle = null
    })
  }
}

async function writeToHandle(handle: FileSystemFileHandle, diagram: Diagram): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(JSON.stringify(diagram, null, 2))
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
    // Fallback for browsers without File System Access API
    saveDiagramToFile(diagram, suggestedName)
    return true
  }
  if (activeFileHandle && !forceNew) {
    // Already have a handle — just write
    await writeToHandle(activeFileHandle, diagram)
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
    await writeToHandle(handle, diagram)
    return true
  } catch (err: unknown) {
    // User cancelled the picker
    if (err instanceof DOMException && err.name === 'AbortError') return false
    throw err
  }
}

/** Close the active file handle (e.g. on New diagram). */
export function closeActiveFile() {
  activeFileHandle = null
}

/** Trigger a browser download of the diagram as a .json file (no handle). */
export function saveDiagramToFile(diagram: Diagram, filename = 'diagram.json') {
  const json = JSON.stringify(diagram, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  triggerDownload(blob, filename)
}

/**
 * Render the current SVG diagram to a PNG and trigger a download.
 *
 * @param svgEl      The live <svg> element
 * @param viewGroup  The <g id="view-group"> that holds all diagram content
 * @param filename   Download filename (without extension)
 */
export async function exportDiagramToPng(
  svgEl: SVGSVGElement,
  viewGroup: SVGGElement,
  filename = 'diagram',
): Promise<void> {
  const PADDING = 48  // spacious padding around the content

  // ── 1. Compute bounding box of all diagram content ────────────────────
  // Temporarily reset the transform to identity so getBBox gives diagram-space coords
  const savedTransform = viewGroup.getAttribute('transform') ?? ''
  viewGroup.setAttribute('transform', '')

  const bbox = viewGroup.getBBox()

  viewGroup.setAttribute('transform', savedTransform)

  if (bbox.width === 0 || bbox.height === 0) {
    // Nothing to export
    return
  }

  const contentW = Math.ceil(bbox.width  + PADDING * 2)
  const contentH = Math.ceil(bbox.height + PADDING * 2)
  const offsetX  = bbox.x - PADDING
  const offsetY  = bbox.y - PADDING

  // ── 2. Build a standalone SVG string ─────────────────────────────────
  // Clone the entire SVG and patch its viewBox / size to the content area
  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('width',   String(contentW))
  clonedSvg.setAttribute('height',  String(contentH))
  clonedSvg.setAttribute('viewBox', `${offsetX} ${offsetY} ${contentW} ${contentH}`)

  // Remove the rubber-band rect and snap guides from the clone
  clonedSvg.querySelectorAll('.rubber-band, .snap-guides').forEach(el => el.remove())

  // Reset the view-group transform (we want it at 1:1 scale, no pan offset)
  const clonedViewGroup = clonedSvg.querySelector('#view-group') as SVGGElement | null
  if (clonedViewGroup) clonedViewGroup.removeAttribute('transform')

  // Inline all computed CSS styles from the live document into the clone
  // so the PNG looks the same regardless of external stylesheet availability.
  const styleText = collectStyles(svgEl)
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = styleText
  clonedSvg.prepend(styleEl)

  const svgString = new XMLSerializer().serializeToString(clonedSvg)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl  = URL.createObjectURL(svgBlob)

  // ── 3. Render to canvas ───────────────────────────────────────────────
  const DPR = Math.max(window.devicePixelRatio ?? 1, 2)  // min 2× for crisp output
  const canvas  = document.createElement('canvas')
  canvas.width  = contentW * DPR
  canvas.height = contentH * DPR

  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)
  // Transparent background — do not fill

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload  = () => { ctx.drawImage(img, 0, 0); resolve() }
    img.onerror = reject
    img.src = svgUrl
  })

  URL.revokeObjectURL(svgUrl)

  // ── 4. Download ───────────────────────────────────────────────────────
  canvas.toBlob(blob => {
    if (blob) triggerDownload(blob, `${filename}.png`)
  }, 'image/png')
}

/** Collect all CSS rules and force Latte (light) theme variables for consistent PNG output. */
function collectStyles(_scopeEl: Element): string {
  const parts: string[] = []

  // Force Latte palette — PNG always exports in light theme regardless of active theme
  const latteVars = Object.entries(LATTE)
    .map(([key, value]) => `  --ctp-${key}: ${value};`)
    .join('\n')
  parts.push(`:root {\n${latteVars}\n}`)

  // Inline all stylesheet rules so the SVG is self-contained
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        parts.push(rule.cssText)
      }
    } catch {
      // Cross-origin stylesheets — skip
    }
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

/**
 * Open a file picker and load a diagram from a .json file.
 * Calls `onLoad` with the parsed Diagram on success.
 */
export function loadDiagramFromFile(onLoad: (diagram: Diagram) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result as string) as Diagram
        if (!d.actors) d.actors = []
        if (!d.queues) d.queues = []
        onLoad(d)
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
      const d = JSON.parse(raw) as Diagram
      // Ensure new arrays exist for diagrams saved before actors/queues were added
      if (!d.actors) d.actors = []
      if (!d.queues) d.queues = []
      return d
    } catch { /* fall through */ }
  }
  // Migrate from old mmd+layout format if present
  const mmd = localStorage.getItem('diagrams-tool:mmd')
  if (mmd) {
    const layout = localStorage.getItem('diagrams-tool:layout') ?? undefined
    const d = fromMermaid(mmd, layout)
    saveDiagram(d)  // re-save as JSON
    return d
  }
  return null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findNamedElement(diagram: Diagram, name: string): { id: string } | undefined {
  return diagram.classes.find(c => c.name === name)
    ?? diagram.packages.find(p => p.name === name)
    ?? diagram.storages.find(s => s.name === name)
    ?? diagram.actors?.find(a => a.name === name)
    ?? diagram.queues?.find(q => q.name === name)
}

function elementName(diagram: Diagram, id: string): string {
  return diagram.classes.find(c => c.id === id)?.name
    ?? diagram.packages.find(p => p.id === id)?.name
    ?? diagram.storages.find(s => s.id === id)?.name
    ?? diagram.actors?.find(a => a.id === id)?.name
    ?? diagram.queues?.find(q => q.id === id)?.name
    ?? id
}

function classLines(cls: UmlClass, indent: number): string[] {
  const pad = ' '.repeat(indent)
  const inner = indent + 2
  const pi = ' '.repeat(inner)
  const lines = [`${pad}class ${cls.name} {`]
  cls.attributes.forEach(a => lines.push(`${pi}${serializeAttribute(a)}`))
  cls.methods.forEach(m => lines.push(`${pi}${serializeMethod(m)}`))
  lines.push(`${pad}}`)
  if (cls.stereotype !== 'class') {
    lines.push(`${pad}<<${cls.stereotype}>> ${cls.name}`)
  }
  return lines
}

function connArrow(type: ConnectionType): string {
  const map: Record<ConnectionType, string> = {
    plain:             '--',
    association:       '-->',
    composition:       '*-->',
    aggregation:       'o-->',
    inheritance:       '<|--',
    realization:       '<|..',
    dependency:        '..>',
    read:              '<--',
    write:             '--->',
    'read-write':      '<--->',
    request:           '~~>',
    'uc-association':  '--',
    'uc-extend':       '..>',
    'uc-include':      '..>',
    'uc-specialization': '<|--',
    'transition':        '-->',
  }
  return map[type] ?? '-->'
}
