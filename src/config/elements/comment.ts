import type { ElementConfig } from '../ElementConfig.ts'

export const commentConfig: ElementConfig = {
  type: 'comment',
  defaultSize: { w: 200, h: 80 },
  ports: [],
  connectionRule: { asSource: [], asTarget: [] },
  supportsMultiplicity: false,
}
