import type { Point, Size } from './common.ts'

export interface UCSystem {
  id: string
  elementType: 'uc-system'
  name: string
  position: Point
  size: Size
  accentColor?: string
}

export function createUCSystem(partial: Partial<UCSystem> & { name: string }): UCSystem {
  return {
    id: crypto.randomUUID(),
    elementType: 'uc-system',
    position: { x: 100, y: 100 },
    size: { w: 260, h: 200 },
    ...partial,
  }
}
