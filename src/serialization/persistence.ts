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

// ─── JSON persistence (localStorage only) ────────────────────────────────────

const LS_JSON = 'archetype:diagram'

/** Active file handle for continuous autosave as .arch.png. Null = no file open. */
let activeFileHandle: FileSystemFileHandle | null = null

export function getActiveFileName(): string | null {
  return activeFileHandle?.name ?? null
}

// ─── In-memory PNG thumbnail cache ───────────────────────────────────────────
// Keyed by recent-file ID (== diagram.id). Updated every time a PNG is built.
// Max ~10 entries (matches MAX_RECENT in Dashboard.ts). No size cap needed since
// each entry is one dashboard-thumbnail JPEG/PNG — a few hundred KB at most.

const _thumbCache = new Map<string, string>()
let   _activeThumbnailId: string | null = null

/** Register the recent-file ID that maps to the currently open file handle. */
export function setActiveThumbnailId(id: string | null) {
  _activeThumbnailId = id
}

/** Return the cached data-URL thumbnail for the given recent-file ID, or null. */
export function getThumbnailDataUrl(id: string): string | null {
  return _thumbCache.get(id) ?? null
}

function _cacheThumbnail(id: string | null | undefined, bytes: Uint8Array) {
  if (!id) return
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' })
  const old = _thumbCache.get(id)
  if (old) URL.revokeObjectURL(old)
  _thumbCache.set(id, URL.createObjectURL(blob))
}

/** Save to localStorage (and autosave to active .arch.png handle if open). */
export function saveDiagram(diagram: Diagram) {
  localStorage.setItem(LS_JSON, JSON.stringify(serializeDiagramV2(diagram), null, 2))
  if (activeFileHandle) schedulePngWrite(diagram)
}

// ─── PNG autosave — debounced, single writer ──────────────────────────────────
// Rapid mutations coalesce into one write. A write already in flight is never
// interrupted — the latest diagram snapshot is queued and flushed afterwards.

let _pngDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _pngWriting = false
let _pngPending: Diagram | null = null
let _pngFailCount = 0          // consecutive write failures (reset on success)
const PNG_DEBOUNCE_MS  = 1500
const PNG_RETRY_DELAY  = 3000  // wait 3 s before first retry after a failure
const PNG_MAX_FAILURES = 2     // surface error to UI after this many consecutive fails

// Callbacks wired from main.ts so persistence.ts stays UI-free.
let _onSaveError:     ((msg: string) => void) | null = null
let _onSaveRecovered: (() => void)            | null = null

export function onPngSaveError    (fn: (msg: string) => void) { _onSaveError     = fn }
export function onPngSaveRecovered(fn: () => void)            { _onSaveRecovered = fn }

function schedulePngWrite(diagram: Diagram) {
  _pngPending = diagram  // always keep the freshest snapshot
  if (_pngWriting) return // a write is in flight — it will flush _pngPending when done
  if (_pngDebounceTimer !== null) clearTimeout(_pngDebounceTimer)
  _pngDebounceTimer = setTimeout(flushPngWrite, PNG_DEBOUNCE_MS)
}

async function flushPngWrite() {
  _pngDebounceTimer = null
  if (!activeFileHandle || !_pngPending) return
  _pngWriting = true
  const snapshot = _pngPending
  _pngPending = null
  let writeError: unknown = null
  try {
    const bytes = await buildArchPngBytes(snapshot)
    // Cache thumbnail regardless of whether the file write succeeds.
    _cacheThumbnail(_activeThumbnailId, bytes)
    if (activeFileHandle) {
      const w = await activeFileHandle.createWritable()
      await w.write(bytes.buffer as ArrayBuffer)
      await w.close()
    }
    // Success — reset failure counter and clear any error banner.
    if (_pngFailCount > 0) {
      _pngFailCount = 0
      _onSaveRecovered?.()
    }
  } catch (err) {
    writeError = err
    _pngFailCount++
    if (_pngFailCount >= PNG_MAX_FAILURES) {
      // Surface the problem to the user.
      const msg = err instanceof Error ? err.message : String(err)
      _onSaveError?.(msg)
    }
    // Queue a retry — put the failed snapshot back if nothing newer arrived.
    if (!_pngPending) _pngPending = snapshot
  } finally {
    _pngWriting = false
    if (_pngPending && activeFileHandle) {
      // Use the normal debounce for new mutations; use the retry delay for
      // repeated failures so we don't hammer the FS on a persistent error.
      const delay = writeError ? PNG_RETRY_DELAY : PNG_DEBOUNCE_MS
      _pngDebounceTimer = setTimeout(flushPngWrite, delay)
    }
  }
}

/** Close the active file handle (e.g. on New diagram). */
export function closeActiveFile() {
  activeFileHandle = null
  _activeThumbnailId = null
  _pngFailCount = 0
  if (_pngDebounceTimer !== null) { clearTimeout(_pngDebounceTimer); _pngDebounceTimer = null }
  _pngPending = null
}

/** Set a file handle as the active autosave target (e.g. resumed from dashboard). */
export function setActiveFileHandle(handle: FileSystemFileHandle | null) {
  activeFileHandle = handle
  _pngFailCount = 0  // fresh handle — clear any prior error state
}

/**
 * Open the native Save File picker for a .arch.png, store the handle, and write immediately.
 * Subsequent calls to `saveDiagram` will autosave to this file.
 * Pass `forceNew = true` to always show the picker (Save As behaviour).
 *
 * Returns the newly-picked FileSystemFileHandle when the picker was shown and
 * the user confirmed, `null` when cancelled, or `true` when an existing handle
 * was reused (no new handle to persist).
 */
export async function openAndSaveToFile(
  diagram: Diagram,
  suggestedName = 'diagram.arch.png',
  forceNew = false,
): Promise<FileSystemFileHandle | null | true> {
  const bytes = await buildArchPngBytes(diagram)
  if (!('showSaveFilePicker' in window)) {
    triggerDownload(new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }), suggestedName)
    _cacheThumbnail(diagram.id, bytes)
    return true
  }
  if (activeFileHandle && !forceNew) {
    const w = await activeFileHandle.createWritable()
    await w.write(bytes.buffer as ArrayBuffer)
    await w.close()
    _cacheThumbnail(diagram.id, bytes)
    return true
  }
  try {
    const handle = await (window as typeof window & {
      showSaveFilePicker: (opts?: unknown) => Promise<FileSystemFileHandle>
    }).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'Archetype diagram', accept: { 'image/png': ['.png'] } }],
    })
    activeFileHandle = handle
    _pngFailCount = 0
    const w = await handle.createWritable()
    await w.write(bytes.buffer as ArrayBuffer)
    await w.close()
    _cacheThumbnail(diagram.id, bytes)
    return handle  // caller should persist this handle
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    throw err
  }
}

// ─── .arch.png — PNG with embedded diagram JSON ──────────────────────────────

const ARCH_KEYWORD = 'archetype-diagram'

/**
 * Read diagram JSON from a FileSystemFileHandle.
 * Handles both .arch.png (extracts embedded iTXt) and .json files.
 * Returns the raw JSON string, or null if the file is not a valid diagram.
 */
export async function readDiagramJsonFromHandle(
  handle: FileSystemFileHandle,
): Promise<string | null> {
  const file = await handle.getFile()
  if (file.name.endsWith('.arch.png') || file.name.endsWith('.png')) {
    const buf  = await file.arrayBuffer()
    return extractPngiTxt(new Uint8Array(buf), ARCH_KEYWORD)
  }
  return file.text()
}

/**
 * Inject an iTXt chunk carrying the diagram JSON into raw PNG bytes.
 * iTXt structure (after chunk length + type):
 *   keyword\0  compression-flag(0)  compression-method(0)  language-tag\0  translated-keyword\0  text
 */
function injectPngiTxt(pngBytes: Uint8Array, keyword: string, text: string): Uint8Array {
  const enc = new TextEncoder()
  const kw  = enc.encode(keyword)
  const txt = enc.encode(text)
  // chunk data: keyword + \0 + 0 + 0 + \0 + \0 + text
  const data = new Uint8Array(kw.length + 3 + 1 + 1 + txt.length)
  data.set(kw, 0)
  // \0 compression-flag=0 compression-method=0 \0(lang) \0(translated-kw)
  data[kw.length]     = 0
  data[kw.length + 1] = 0
  data[kw.length + 2] = 0
  data[kw.length + 3] = 0
  data[kw.length + 4] = 0
  data.set(txt, kw.length + 5)

  const type = enc.encode('iTXt')
  const len  = data.length
  const chunk = new Uint8Array(12 + len)
  const view  = new DataView(chunk.buffer)
  view.setUint32(0, len)
  chunk.set(type, 4)
  chunk.set(data, 8)
  view.setUint32(8 + len, crc32(chunk.subarray(4, 8 + len)))

  // Insert before IEND chunk (last 12 bytes of a valid PNG)
  const out = new Uint8Array(pngBytes.length + chunk.length)
  out.set(pngBytes.subarray(0, pngBytes.length - 12))
  out.set(chunk, pngBytes.length - 12)
  out.set(pngBytes.subarray(pngBytes.length - 12), pngBytes.length - 12 + chunk.length)
  return out
}

/** Extract the text value of the first iTXt chunk matching `keyword`, or null. */
function extractPngiTxt(pngBytes: Uint8Array, keyword: string): string | null {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  const kw  = enc.encode(keyword)
  let i = 8 // skip PNG signature
  while (i + 12 <= pngBytes.length) {
    const view  = new DataView(pngBytes.buffer, pngBytes.byteOffset)
    const len   = view.getUint32(i)
    const type  = dec.decode(pngBytes.subarray(i + 4, i + 8))
    if (type === 'IEND') break
    if (type === 'iTXt') {
      const data = pngBytes.subarray(i + 8, i + 8 + len)
      // check keyword match
      let match = true
      for (let k = 0; k < kw.length; k++) {
        if (data[k] !== kw[k]) { match = false; break }
      }
      if (match && data[kw.length] === 0) {
        // skip: null + compression-flag + compression-method + lang-null + translated-null
        const textStart = kw.length + 5
        return dec.decode(data.subarray(textStart))
      }
    }
    i += 12 + len
  }
  return null
}

/** CRC-32 for PNG chunk integrity. */
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/**
 * Render the diagram SVG to a PNG and inject the diagram JSON as an iTXt chunk.
 * Returns the raw bytes — used by both save-to-file and download flows.
 */
async function buildArchPngBytes(diagram: Diagram): Promise<Uint8Array> {
  // If there's no SVG context (called from autosave before first render), skip rendering.
  // We only get here via saveDiagram which always has a live SVG, so this is safe.
  const svgEl    = document.querySelector<SVGSVGElement>('#canvas')
  const viewGroup = document.querySelector<SVGGElement>('#view-group')
  if (!svgEl || !viewGroup) throw new Error('SVG not ready')

  const PADDING = 48
  const savedTransform = viewGroup.getAttribute('transform') ?? ''
  viewGroup.setAttribute('transform', '')
  const bbox = viewGroup.getBBox()
  viewGroup.setAttribute('transform', savedTransform)

  if (bbox.width === 0 || bbox.height === 0) {
    // Empty diagram — return a 1×1 transparent PNG with the JSON
    const tiny = new Uint8Array([
      137,80,78,71,13,10,26,10, // PNG signature
      0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,2,0,0,0,144,119,83,222, // IHDR
      0,0,0,12,73,68,65,84,8,215,99,248,207,192,0,0,0,2,0,1,231,21,33,69, // IDAT
      0,0,0,0,73,69,78,68,174,66,96,130, // IEND
    ])
    const jsonStr = JSON.stringify(serializeDiagramV2(diagram))
    return injectPngiTxt(tiny, ARCH_KEYWORD, jsonStr)
  }

  const contentW = Math.ceil(bbox.width  + PADDING * 2)
  const contentH = Math.ceil(bbox.height + PADDING * 2)
  const offsetX  = bbox.x - PADDING
  const offsetY  = bbox.y - PADDING

  const clonedSvg = svgEl.cloneNode(true) as SVGSVGElement
  clonedSvg.setAttribute('width',   String(contentW))
  clonedSvg.setAttribute('height',  String(contentH))
  clonedSvg.setAttribute('viewBox', `${offsetX} ${offsetY} ${contentW} ${contentH}`)
  clonedSvg.querySelectorAll('.rubber-band, .snap-guides').forEach(el => el.remove())

  const NS = 'http://www.w3.org/2000/svg'
  const FONT_SIZE = 12
  const FONT_FAMILY = 'ui-sans-serif, system-ui, sans-serif'
  const LINE_HEIGHT = FONT_SIZE * 1.4
  const PAD_X = 8
  const PAD_Y = 6

  // Reuse the renderer's measure context for word-wrapping
  const measureCtx = document.createElement('canvas').getContext('2d')!
  measureCtx.font = `${FONT_SIZE}px ${FONT_FAMILY}`
  function wrapWords(text: string, maxWidth: number): string[] {
    const words = text.split(' ')
    const result: string[] = []
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (measureCtx.measureText(candidate).width > maxWidth && line) { result.push(line); line = word }
      else line = candidate
    }
    if (line) result.push(line)
    return result
  }

  clonedSvg.querySelectorAll('foreignObject').forEach(fo => {
    const x = parseFloat(fo.getAttribute('x') ?? '0')
    const y = parseFloat(fo.getAttribute('y') ?? '0')
    const foWidth = parseFloat(fo.getAttribute('width') ?? '200')
    const rawText = (fo.textContent ?? '').trim()
    if (!rawText) { fo.remove(); return }
    const maxTextWidth = foWidth - PAD_X * 2

    const paragraphs = rawText.split('\n')
    const allLines: string[] = []
    for (const para of paragraphs) {
      allLines.push(...wrapWords(para || ' ', maxTextWidth))
    }

    const g = document.createElementNS(NS, 'g')
    const textEl = document.createElementNS(NS, 'text')
    textEl.setAttribute('font-size', String(FONT_SIZE))
    textEl.setAttribute('font-family', FONT_FAMILY)
    textEl.setAttribute('fill', 'currentColor')
    allLines.forEach((line, i) => {
      const tspan = document.createElementNS(NS, 'tspan')
      tspan.setAttribute('x', String(x + PAD_X))
      tspan.setAttribute('y', String(y + PAD_Y + FONT_SIZE + i * LINE_HEIGHT))
      tspan.textContent = line
      textEl.appendChild(tspan)
    })
    g.appendChild(textEl)
    fo.replaceWith(g)
  })

  const clonedViewGroup = clonedSvg.querySelector('#view-group') as SVGGElement | null
  if (clonedViewGroup) clonedViewGroup.removeAttribute('transform')

  // Attribution watermark — bottom-right corner, in viewBox coordinate space
  const attrText = document.createElementNS(NS, 'text')
  attrText.setAttribute('x', String(offsetX + contentW - 8))
  attrText.setAttribute('y', String(offsetY + contentH - 8))
  attrText.setAttribute('text-anchor', 'end')
  attrText.setAttribute('font-size', '10')
  attrText.setAttribute('font-family', FONT_FAMILY)
  attrText.setAttribute('fill', '#4c4f69')
  attrText.setAttribute('opacity', '0.45')
  attrText.textContent = 'marschallsteffen.github.io/Archetype'
  clonedSvg.appendChild(attrText)

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = collectStyles()
  clonedSvg.prepend(styleEl)

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

  const pngBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png')
  })

  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer())
  const jsonStr  = JSON.stringify(serializeDiagramV2(diagram))
  return injectPngiTxt(pngBytes, ARCH_KEYWORD, jsonStr)
}

/**
 * Download the diagram as a `.arch.png` (PNG + embedded JSON).
 */
export async function exportDiagramToArchPng(
  _svgEl: SVGSVGElement,
  _viewGroup: SVGGElement,
  diagram: Diagram,
  filename = 'diagram',
): Promise<void> {
  const bytes = await buildArchPngBytes(diagram)
  triggerDownload(new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }), `${filename}.arch.png`)
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
          { description: 'Diagram files', accept: { 'application/json': ['.json'], 'image/png': ['.png'] } },
        ],
        multiple: false,
      })

      // Request write permission immediately — we are still inside the user-gesture
      // context from the picker, so the browser may grant it without a second prompt.
      // Then open+close a writable right away to confirm the handle actually works.
      // This surfaces permission/lock errors before the first autosave fires.
      const writeHandle = await acquireWriteHandle(handle)

      const file = await handle.getFile()
      if (file.name.endsWith('.arch.png') || file.name.endsWith('.png')) {
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
  input.accept = '.json,application/json,.arch.png,.png,image/png'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (!file) return
    if (file.name.endsWith('.arch.png') || file.name.endsWith('.png')) {
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

