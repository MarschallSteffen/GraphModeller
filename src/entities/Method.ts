import type { Visibility } from './Attribute.ts'

export interface Param {
  name: string
  type: string
}

export interface Method {
  id: string
  visibility: Visibility
  name: string
  params: Param[]
  returnType: string
  raw?: string
}

/** Parse a UML method line: `+ methodName(param: Type, ...) ReturnType` */
export function parseMethod(raw: string): Method {
  const id = crypto.randomUUID()
  const trimmed = raw.trim()
  const visibilityMap: Record<string, Visibility> = { '+': '+', '-': '-', '#': '#', '~': '~' }
  let visibility: Visibility = '+'
  let rest = trimmed

  if (trimmed.length > 0 && trimmed[0] in visibilityMap) {
    visibility = visibilityMap[trimmed[0]]
    rest = trimmed.slice(1).trim()
  }

  const parenOpen = rest.indexOf('(')
  const parenClose = rest.lastIndexOf(')')
  if (parenOpen === -1) {
    return { id, visibility, name: rest, params: [], returnType: '', raw }
  }

  const name = rest.slice(0, parenOpen).trim()
  const paramStr = rest.slice(parenOpen + 1, parenClose === -1 ? undefined : parenClose)
  const afterParen = parenClose !== -1 ? rest.slice(parenClose + 1).trim() : ''
  const returnType = afterParen.startsWith(':') ? afterParen.slice(1).trim() : afterParen.trim()

  const params: Param[] = paramStr
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => {
      const ci = p.indexOf(':')
      return ci === -1 ? { name: p, type: '' } : { name: p.slice(0, ci).trim(), type: p.slice(ci + 1).trim() }
    })

  return { id, visibility, name, params, returnType }
}

export function serializeMethod(m: Method): string {
  if (m.raw) return m.raw
  const params = m.params.map(p => (p.type ? `${p.name}: ${p.type}` : p.name)).join(', ')
  const ret = m.returnType ? ` ${m.returnType}` : ''
  return `${m.visibility}${m.name}(${params})${ret}`
}
