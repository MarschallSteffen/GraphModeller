import type { Attribute } from './Attribute.ts'
import type { Method } from './Method.ts'
export type { Point, Size } from './common.ts'
import type { Point, Size } from './common.ts'

export type Stereotype = 'class' | 'abstract' | 'interface' | 'enum'

export interface UmlClass {
  id: string
  elementType: 'uml-class'
  name: string
  stereotype: Stereotype
  packageId: string | null
  attributes: Attribute[]
  methods: Method[]
  position: Point
  size: Size
  multiInstance: boolean
}

export function createUmlClass(partial: Partial<UmlClass> & { name: string }): UmlClass {
  return {
    id: crypto.randomUUID(),
    elementType: 'uml-class',
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
