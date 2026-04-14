import type { ElementConfig } from '../ElementConfig.ts'

export const queueConfig: ElementConfig = {
  type: 'queue',
  defaultSize: { w: 160, h: 60 },
  ports: [
    { id: 'e', xFrac: 1,   yFrac: 0.5 },
    { id: 'w', xFrac: 0,   yFrac: 0.5 },
  ],
  connectionRule: {
    asSource: ['request'],
    asTarget: ['request'],
  },
  supportsMultiplicity: false,
}
