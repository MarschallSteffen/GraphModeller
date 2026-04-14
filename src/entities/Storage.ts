import type { Point, Size } from './UmlClass.ts'

export interface Storage {
  id: string
  elementType: 'storage'
  name: string
  position: Point
  size: Size
  multiInstance: boolean
}

export function createStorage(partial: Partial<Storage> & { name: string }): Storage {
  return {
    id: crypto.randomUUID(),
    elementType: 'storage',
    position: { x: 100, y: 100 },
    size: { w: 160, h: 60 },
    multiInstance: false,
    ...partial,
  }
}
