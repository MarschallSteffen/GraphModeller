import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from './umlClass.ts'

/**
 * Storage element — rounded rectangle, data store.
 * Only read / write / read-write connections are meaningful here,
 * modelled as three subtypes of 'association':
 *   - 'read'       (arrow FROM storage → caller)
 *   - 'write'      (arrow TO storage ← caller)
 *   - 'read-write' (both directions)
 * We reuse the ConnectionType union — see Connection.ts for the added types.
 */
export const storageConfig: ElementConfig = {
  type: 'storage',
  defaultSize: { w: 160, h: 60 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['read', 'read-write'],
    asTarget: ['write', 'read-write'],
  },
  supportsMultiplicity: false,
}
