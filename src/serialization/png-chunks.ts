// ─── PNG iTXt chunk utilities ────────────────────────────────────────────────
// Pure stateless helpers for reading/writing iTXt chunks in PNG binary data.
// No DOM, no store, no side-effects.

/**
 * Inject an iTXt chunk carrying `text` into raw PNG bytes under `keyword`.
 * iTXt structure (after chunk length + type):
 *   keyword\0  compression-flag(0)  compression-method(0)  language-tag\0  translated-keyword\0  text
 */
export function injectPngiTxt(pngBytes: Uint8Array, keyword: string, text: string): Uint8Array {
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
export function extractPngiTxt(pngBytes: Uint8Array, keyword: string): string | null {
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
export function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of data) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}
