import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from './umlClass.ts'

export const agentConfig: ElementConfig = {
  type: 'agent',
  defaultSize: { w: 120, h: 60 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['request'],
    asTarget: ['request'],
  },
  supportsMultiplicity: false,
}

export const humanAgentConfig: ElementConfig = {
  type: 'human-agent',
  defaultSize: { w: 80, h: 100 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['request'],
    asTarget: ['request'],
  },
  supportsMultiplicity: false,
}
