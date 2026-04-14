import type { ElementConfig } from '../ElementConfig.ts'

/** Standard 4-port layout shared by most element types */
export const CARDINAL_PORTS = [
  { id: 'n', xFrac: 0.5, yFrac: 0 },
  { id: 'e', xFrac: 1,   yFrac: 0.5 },
  { id: 's', xFrac: 0.5, yFrac: 1 },
  { id: 'w', xFrac: 0,   yFrac: 0.5 },
]

export const umlClassConfig: ElementConfig = {
  type: 'uml-class',
  defaultSize: { w: 180, h: 120 },
  ports: CARDINAL_PORTS,
  connectionRule: null,
  supportsMultiplicity: true,
}

export const umlPackageConfig: ElementConfig = {
  type: 'uml-package',
  defaultSize: { w: 320, h: 240 },
  ports: CARDINAL_PORTS,
  connectionRule: null,
  supportsMultiplicity: true,
}
