export type Visibility = '+' | '-' | '#' | '~'

export interface Attribute {
  id: string
  visibility: Visibility
  name: string
  type: string
  defaultValue?: string
  /** Raw line as typed — used when parse fails */
  raw?: string
}

/** Parse a UML attribute line: `+ name: Type = default` */
export function parseAttribute(raw: string): Attribute {
  const id = crypto.randomUUID()
  const trimmed = raw.trim()
  const visibilityMap: Record<string, Visibility> = { '+': '+', '-': '-', '#': '#', '~': '~' }
  let visibility: Visibility = '+'
  let rest = trimmed

  if (trimmed.length > 0 && trimmed[0] in visibilityMap) {
    visibility = visibilityMap[trimmed[0]]
    rest = trimmed.slice(1).trim()
  }

  const defaultSplit = rest.split('=')
  const defaultValue = defaultSplit.length > 1 ? defaultSplit.slice(1).join('=').trim() : undefined
  const nameType = defaultSplit[0].trim()

  const colonIdx = nameType.indexOf(':')
  if (colonIdx === -1) {
    return { id, visibility, name: nameType, type: '', defaultValue, raw }
  }

  const name = nameType.slice(0, colonIdx).trim()
  const type = nameType.slice(colonIdx + 1).trim()
  return { id, visibility, name, type, defaultValue }
}

export function serializeAttribute(a: Attribute): string {
  if (a.raw) return a.raw
  let s = `${a.visibility}${a.name}: ${a.type}`
  if (a.defaultValue !== undefined) s += ` = ${a.defaultValue}`
  return s
}
