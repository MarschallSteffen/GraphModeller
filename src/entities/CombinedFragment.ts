export interface CombinedFragment {
  id: string
  elementType: 'seq-fragment'
  operator: 'alt' | 'opt' | 'loop' | 'par' | 'ref'
  condition: string
  position: { x: number; y: number }
  size: { w: number; h: number }
}

export function createCombinedFragment(x: number, y: number): CombinedFragment {
  return {
    id: crypto.randomUUID(),
    elementType: 'seq-fragment',
    operator: 'alt',
    condition: '',
    position: { x, y },
    size: { w: 200, h: 120 },
  }
}
