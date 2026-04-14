import type { UmlClass } from './UmlClass.ts'
import type { UmlPackage } from './Package.ts'
import type { Connection } from './Connection.ts'
import type { Storage } from './Storage.ts'
import type { Actor } from './Actor.ts'
import type { Queue } from './Queue.ts'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface Diagram {
  id: string
  name: string
  classes: UmlClass[]
  packages: UmlPackage[]
  storages: Storage[]
  actors: Actor[]
  queues: Queue[]
  connections: Connection[]
  viewport: Viewport
}

export function createDiagram(name = 'Untitled'): Diagram {
  return {
    id: crypto.randomUUID(),
    name,
    classes: [],
    packages: [],
    storages: [],
    actors: [],
    queues: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}
