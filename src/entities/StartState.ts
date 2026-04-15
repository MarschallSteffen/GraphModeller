import type { Point, Size } from './UmlClass.ts'

export interface StartState {
  id: string
  elementType: 'start-state'
  position: Point
  size: Size
}

export function createStartState(partial: Partial<StartState>): StartState {
  return {
    id: crypto.randomUUID(),
    elementType: 'start-state',
    position: { x: 100, y: 100 },
    size: { w: 32, h: 32 },
    ...partial,
  }
}
