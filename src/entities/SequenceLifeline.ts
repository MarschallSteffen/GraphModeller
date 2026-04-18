import type { Point, Size } from './common.ts'

export interface SequenceMessage {
  id: string
  label: string
  /** null = self-call */
  targetLifelineId: string | null
  kind: 'sync' | 'async' | 'create' | 'self' | 'return'
  /**
   * Global slot index in the shared timeline (0-based). Two messages from
   * different lifelines at the same slotIndex are concurrent (same Y).
   * When undefined, falls back to the message's array index (legacy).
   */
  slotIndex?: number
}

export interface SequenceLifeline {
  id: string
  elementType: 'seq-lifeline'
  name: string
  messages: SequenceMessage[]
  position: Point
  size: Size
  accentColor?: string
}

export function createSequenceLifeline(x: number, y: number): SequenceLifeline {
  return {
    id: crypto.randomUUID(),
    elementType: 'seq-lifeline',
    name: 'Lifeline',
    messages: [],
    position: { x, y },
    size: { w: 140, h: 40 },
  }
}
