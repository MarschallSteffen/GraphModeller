import type { Point, Size } from './UmlClass.ts'

export interface EndState {
  id: string
  elementType: 'end-state'
  position: Point
  size: Size
}

export function createEndState(partial: Partial<EndState>): EndState {
  return {
    id: crypto.randomUUID(),
    elementType: 'end-state',
    position: { x: 100, y: 100 },
    size: { w: 36, h: 36 },
    ...partial,
  }
}
