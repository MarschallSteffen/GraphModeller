import type { Point, Size } from './common.ts'

export interface Queue {
  id: string
  elementType: 'queue'
  name: string
  position: Point
  size: Size
  multiInstance: boolean
  flowReversed?: boolean
  accentColor?: string
}

export function createQueue(partial: Partial<Queue> & { name: string }): Queue {
  return {
    id: crypto.randomUUID(),
    elementType: 'queue',
    position: { x: 100, y: 100 },
    size: { w: 160, h: 60 },
    multiInstance: false,
    ...partial,
  }
}
