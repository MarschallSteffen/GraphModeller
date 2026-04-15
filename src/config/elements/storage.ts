import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from './umlClass.ts'

/**
 * Storage element — rounded rectangle, data store.
 * Only write / read-write connections are meaningful here.
 * Direction (which entity reads vs writes) is determined by source→target order;
 * use the flip button to reverse. 'read-write' renders as two parallel arrows.
 */
export const storageConfig: ElementConfig = {
  type: 'storage',
  defaultSize: { w: 160, h: 60 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['plain', 'write', 'read-write'],
    asTarget: ['plain', 'write', 'read-write'],
  },
  supportsMultiplicity: false,
}
