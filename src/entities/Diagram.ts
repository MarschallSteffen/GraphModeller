import type { UmlClass } from './UmlClass.ts'
import type { UmlPackage } from './Package.ts'
import type { Connection } from './Connection.ts'
import type { Storage } from './Storage.ts'
import type { Actor } from './Actor.ts'
import type { Queue } from './Queue.ts'
import type { UseCase } from './UseCase.ts'
import type { UCSystem } from './UCSystem.ts'
import type { State } from './State.ts'
import type { StartState } from './StartState.ts'
import type { EndState } from './EndState.ts'
import type { CombinedFragment } from './CombinedFragment.ts'
import type { SequenceDiagram } from './SequenceDiagram.ts'
import type { Comment } from './Comment.ts'

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
  useCases: UseCase[]
  ucSystems: UCSystem[]
  states: State[]
  startStates: StartState[]
  endStates: EndState[]
  sequenceDiagrams: SequenceDiagram[]
  combinedFragments: CombinedFragment[]
  comments: Comment[]
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
    useCases: [],
    ucSystems: [],
    states: [],
    startStates: [],
    endStates: [],
    sequenceDiagrams: [],
    combinedFragments: [],
    comments: [],
    connections: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}
