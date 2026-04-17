import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from '../../renderers/ports.ts'

export const agentConfig: ElementConfig = {
  type: 'agent',
  defaultSize: { w: 120, h: 60 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['request'],
    asTarget: ['request'],
  },
  preferredConnectionType: 'request',
  supportsMultiplicity: false,
  supportsProperties: true,
}

export const humanAgentConfig: ElementConfig = {
  type: 'human-agent',
  defaultSize: { w: 80, h: 100 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['request'],
    asTarget: ['request'],
  },
  preferredConnectionType: 'request',
  supportsMultiplicity: false,
  supportsProperties: true,
}
