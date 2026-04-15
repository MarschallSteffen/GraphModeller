import type { Point, Size } from './UmlClass.ts'

export interface UseCase {
  id: string
  elementType: 'use-case'
  name: string
  position: Point
  size: Size
}

export function createUseCase(partial: Partial<UseCase> & { name: string }): UseCase {
  return {
    id: crypto.randomUUID(),
    elementType: 'use-case',
    position: { x: 100, y: 100 },
    size: { w: 140, h: 60 },
    ...partial,
  }
}
