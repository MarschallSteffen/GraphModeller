import type { Point, Size } from './common.ts'

export interface State {
  id: string
  elementType: 'state'
  name: string
  position: Point
  size: Size
}

export function createState(partial: Partial<State> & { name: string }): State {
  return {
    id: crypto.randomUUID(),
    elementType: 'state',
    position: { x: 100, y: 100 },
    size: { w: 120, h: 44 },
    ...partial,
  }
}
