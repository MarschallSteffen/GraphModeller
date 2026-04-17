import type { Point, Size } from './common.ts'

export interface Comment {
  id: string
  elementType: 'comment'
  text: string
  position: Point
  size: Size
  pinnedTo: string | null
  pinnedOffset: Point | null  // offset from pinned element's position at pin time
}

export function createComment(partial: Partial<Comment>): Comment {
  return {
    id: crypto.randomUUID(),
    elementType: 'comment',
    text: '',
    position: { x: 100, y: 100 },
    size: { w: 200, h: 80 },
    pinnedTo: null,
    pinnedOffset: null,
    ...partial,
  }
}
