import type { Attribute } from './Attribute.ts'
import type { Method } from './Method.ts'

export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

export type Stereotype = 'class' | 'abstract' | 'interface' | 'enum'

export interface UmlClass {
  id: string
  name: string
  stereotype: Stereotype
  packageId: string | null
  attributes: Attribute[]
  methods: Method[]
  position: Point
  size: Size
  multiInstance?: boolean
}

export function createUmlClass(partial: Partial<UmlClass> & { name: string }): UmlClass {
  return {
    id: crypto.randomUUID(),
    stereotype: 'class',
    packageId: null,
    attributes: [],
    methods: [],
    position: { x: 100, y: 100 },
    size: { w: 180, h: 120 },
    multiInstance: false,
    ...partial,
  }
}
