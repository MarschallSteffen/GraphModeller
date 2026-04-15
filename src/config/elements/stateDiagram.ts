import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from './umlClass.ts'

export const stateConfig: ElementConfig = {
  type: 'state',
  defaultSize: { w: 120, h: 44 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['transition'],
    asTarget: ['transition'],
  },
  preferredConnectionType: 'transition',
  supportsMultiplicity: false,
}

export const startStateConfig: ElementConfig = {
  type: 'start-state',
  defaultSize: { w: 32, h: 32 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['transition'],
    asTarget: [],
  },
  preferredConnectionType: 'transition',
  supportsMultiplicity: false,
}

export const endStateConfig: ElementConfig = {
  type: 'end-state',
  defaultSize: { w: 36, h: 36 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: [],
    asTarget: ['transition'],
  },
  supportsMultiplicity: false,
}
