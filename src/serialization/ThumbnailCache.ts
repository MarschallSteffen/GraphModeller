// Keyed by recent-file ID (== diagram.id). Updated every time a PNG is built.
// Max ~10 entries (matches MAX_RECENT in Dashboard.ts). No size cap needed since
// each entry is one dashboard-thumbnail JPEG/PNG — a few hundred KB at most.

const _thumbCache = new Map<string, string>()
let   _activeThumbnailId: string | null = null

/** Register the recent-file ID that maps to the currently open file handle. */
export function setActiveThumbnailId(id: string | null) {
  _activeThumbnailId = id
}

/** Return the currently active thumbnail ID. */
export function getActiveThumbnailId(): string | null {
  return _activeThumbnailId
}

/** Return the cached data-URL thumbnail for the given recent-file ID, or null. */
export function getThumbnailDataUrl(id: string): string | null {
  return _thumbCache.get(id) ?? null
}

/** Cache a PNG thumbnail (as a blob URL) for the given recent-file ID. */
export function cacheThumbnail(id: string | null | undefined, bytes: Uint8Array) {
  if (!id) return
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' })
  const old = _thumbCache.get(id)
  if (old) URL.revokeObjectURL(old)
  _thumbCache.set(id, URL.createObjectURL(blob))
}
