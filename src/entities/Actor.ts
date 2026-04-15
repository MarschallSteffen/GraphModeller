import type { Point, Size } from './UmlClass.ts'

export interface Actor {
  id: string
  elementType: 'agent' | 'human-agent' | 'uc-actor'
  name: string
  position: Point
  size: Size
  multiInstance: boolean
}

export function createActor(
  partial: Partial<Actor> & { elementType: 'agent' | 'human-agent' | 'uc-actor'; name: string },
): Actor {
  return {
    id: crypto.randomUUID(),
    position: { x: 100, y: 100 },
    size: partial.elementType === 'agent' ? { w: 120, h: 60 } : { w: 80, h: 100 },
    multiInstance: false,
    ...partial,
  }
}
