import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from './umlClass.ts'

export const seqLifelineConfig: ElementConfig = {
  type: 'seq-lifeline',
  defaultSize: { w: 140, h: 40 },
  ports: CARDINAL_PORTS,
  connectionRule: { asSource: [], asTarget: [] },
  supportsMultiplicity: false,
}

export const seqFragmentConfig: ElementConfig = {
  type: 'seq-fragment',
  defaultSize: { w: 200, h: 120 },
  ports: [],
  connectionRule: { asSource: [], asTarget: [] },
  supportsMultiplicity: false,
}
