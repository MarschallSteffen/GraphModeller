import type { Diagram } from '../entities/Diagram.ts'
import { LATTE } from '../themes/catppuccin.ts'

// ─── JSON persistence ────────────────────────────────────────────────────────

const LS_JSON = 'diagrams-tool:diagram'

/** Active file handle for continuous autosave. Null = no file open. */
let activeFileHandle: FileSystemFileHandle | null = null

export function getActiveFileName(): string | null {
  return activeFileHandle?.name ?? null
}

export function saveDiagram(diagram: Diagram) {
  localStorage.setItem(LS_JSON, JSON.stringify(diagram))
  if (activeFileHandle) {
    writeToHandle(activeFileHandle, diagram).catch(() => {
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
    saveDiagramToFile(diagram, suggestedName)
    return true
  }
  if (activeFileHandle && !forceNew) {
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

/** Collect all CSS rules and force Latte (light) theme variables for consistent PNG output. */
function collectStyles(): string {
  const parts: string[] = []

  const latteVars = Object.entries(LATTE)
    .map(([key, value]) => `  --ctp-${key}: ${value};`)
    .join('\n')
  parts.push(`:root {\n${latteVars}\n}`)

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
 * Open a file picker and load a diagram from a .json file.
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
      return JSON.parse(raw) as Diagram
    } catch { /* fall through */ }
  }
  return null
}
