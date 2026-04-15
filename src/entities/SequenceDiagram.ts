import { createSequenceLifeline } from './SequenceLifeline.ts'
import type { SequenceLifeline } from './SequenceLifeline.ts'
import type { Point, Size } from './common.ts'

export interface SequenceDiagram {
  id: string
  elementType: 'seq-diagram'
  position: Point
  size: Size
  lifelines: SequenceLifeline[]
}

export function createSequenceDiagram(x: number, y: number): SequenceDiagram {
  const ll1 = createSequenceLifeline(0, 0)
  const ll2 = createSequenceLifeline(160, 0)
  return {
    id: crypto.randomUUID(),
    elementType: 'seq-diagram',
    position: { x, y },
    size: { w: 300, h: 200 },
    lifelines: [ll1, ll2],
  }
}
