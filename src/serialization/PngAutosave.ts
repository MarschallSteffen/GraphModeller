// Rapid mutations coalesce into one write. A write already in flight is never
// interrupted — the latest diagram snapshot is queued and flushed afterwards.
//
// Circular-dependency avoidance: the actual write logic (buildArchPngBytes +
// file handle access) lives in persistence.ts. This module accepts a `doWrite`
// callback so it never needs to import from persistence.ts.

import type { Diagram } from '../entities/Diagram.ts'

const PNG_DEBOUNCE_MS  = 1500
const PNG_RETRY_DELAY  = 3000  // wait 3 s before first retry after a failure
const PNG_MAX_FAILURES = 2     // surface error to UI after this many consecutive fails

let _pngDebounceTimer: ReturnType<typeof setTimeout> | null = null
let _pngWriting = false
let _pngPending: Diagram | null = null
let _pngFailCount = 0          // consecutive write failures (reset on success)

// Callbacks wired from main.ts so this module stays UI-free.
let _onSaveError:     ((msg: string) => void) | null = null
let _onSaveRecovered: (() => void)            | null = null

export function onPngSaveError    (fn: (msg: string) => void) { _onSaveError     = fn }
export function onPngSaveRecovered(fn: () => void)            { _onSaveRecovered = fn }

/**
 * Queue a PNG write for `diagram`, debounced.
 * `doWrite` performs the actual I/O for the given snapshot.
 */
export function schedulePngWrite(diagram: Diagram, doWrite: (snapshot: Diagram) => Promise<void>) {
  _pngPending = diagram  // always keep the freshest snapshot
  if (_pngWriting) return // a write is in flight — it will flush _pngPending when done
  if (_pngDebounceTimer !== null) clearTimeout(_pngDebounceTimer)
  _pngDebounceTimer = setTimeout(() => _flushPngWrite(doWrite), PNG_DEBOUNCE_MS)
}

async function _flushPngWrite(doWrite: (snapshot: Diagram) => Promise<void>): Promise<void> {
  _pngDebounceTimer = null
  if (!_pngPending) return
  _pngWriting = true
  const snapshot = _pngPending
  _pngPending = null
  let writeError: unknown = null
  try {
    await doWrite(snapshot)
    // Success — reset failure counter and clear any error banner.
    if (_pngFailCount > 0) {
      _pngFailCount = 0
      _onSaveRecovered?.()
    }
  } catch (err) {
    writeError = err
    _pngFailCount++
    if (_pngFailCount >= PNG_MAX_FAILURES) {
      const msg = err instanceof Error ? err.message : String(err)
      _onSaveError?.(msg)
    }
    // Queue a retry — put the failed snapshot back if nothing newer arrived.
    if (!_pngPending) _pngPending = snapshot
  } finally {
    _pngWriting = false
    if (_pngPending) {
      // Use the normal debounce for new mutations; use the retry delay for
      // repeated failures so we don't hammer the FS on a persistent error.
      const delay = writeError ? PNG_RETRY_DELAY : PNG_DEBOUNCE_MS
      _pngDebounceTimer = setTimeout(() => _flushPngWrite(doWrite), delay)
    }
  }
}

/** Reset all autosave state (e.g. when closing the active file). */
export function resetPngAutosave() {
  _pngFailCount = 0
  if (_pngDebounceTimer !== null) { clearTimeout(_pngDebounceTimer); _pngDebounceTimer = null }
  _pngPending = null
}
