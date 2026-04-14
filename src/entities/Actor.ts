import type { Point, Size } from './UmlClass.ts'

export interface Actor {
  id: string
  elementType: 'agent' | 'human-agent'
  name: string
  position: Point
  size: Size
  multiInstance: boolean
}

export function createActor(
  partial: Partial<Actor> & { elementType: 'agent' | 'human-agent'; name: string },
): Actor {
  return {
    id: crypto.randomUUID(),
    position: { x: 100, y: 100 },
    size: partial.elementType === 'human-agent' ? { w: 80, h: 100 } : { w: 120, h: 60 },
    multiInstance: false,
    ...partial,
  }
}
