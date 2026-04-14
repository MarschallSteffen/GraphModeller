import type { Point, Size } from './UmlClass.ts'

export interface UmlPackage {
  id: string
  name: string
  position: Point
  size: Size
}

export function createUmlPackage(partial: Partial<UmlPackage> & { name: string }): UmlPackage {
  return {
    id: crypto.randomUUID(),
    position: { x: 60, y: 60 },
    size: { w: 320, h: 240 },
    ...partial,
  }
}
