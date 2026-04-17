import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from '../../renderers/ports.ts'
export { CARDINAL_PORTS }

export const umlClassConfig: ElementConfig = {
  type: 'uml-class',
  defaultSize: { w: 180, h: 120 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['plain', 'association', 'composition', 'aggregation', 'inheritance', 'realization', 'dependency'],
    asTarget: ['plain', 'association', 'composition', 'aggregation', 'inheritance', 'realization', 'dependency'],
  },
  supportsMultiplicity: true,
  supportsProperties: true,
}

export const umlPackageConfig: ElementConfig = {
  type: 'uml-package',
  defaultSize: { w: 320, h: 240 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: [],
    asTarget: [],
  },
  supportsMultiplicity: false,
}
