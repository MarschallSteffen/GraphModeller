import type { ElementConfig } from '../ElementConfig.ts'
import { CARDINAL_PORTS } from './umlClass.ts'

export const useCaseConfig: ElementConfig = {
  type: 'use-case',
  defaultSize: { w: 140, h: 60 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['uc-association', 'uc-extend', 'uc-include', 'uc-specialization'],
    asTarget: ['uc-association', 'uc-extend', 'uc-include', 'uc-specialization'],
  },
  preferredConnectionType: 'uc-association',
  supportsMultiplicity: false,
}

export const ucSystemConfig: ElementConfig = {
  type: 'uc-system',
  defaultSize: { w: 260, h: 200 },
  ports: CARDINAL_PORTS,
  connectionRule: { asSource: [], asTarget: [] },
  supportsMultiplicity: false,
}

export const ucActorConfig: ElementConfig = {
  type: 'uc-actor',
  defaultSize: { w: 80, h: 100 },
  ports: CARDINAL_PORTS,
  connectionRule: {
    asSource: ['uc-association', 'uc-extend', 'uc-include', 'uc-specialization'],
    asTarget: ['uc-association', 'uc-extend', 'uc-include', 'uc-specialization'],
  },
  preferredConnectionType: 'uc-association',
  supportsMultiplicity: false,
}
