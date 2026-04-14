export type ConnectionType =
  | 'association'
  | 'composition'
  | 'aggregation'
  | 'inheritance'
  | 'realization'
  | 'dependency'
  // Storage-specific data-flow types
  | 'read'
  | 'write'
  | 'read-write'
  // Actor/channel request
  | 'request'

export type PortSide = string  // 'n' | 'e' | 's' | 'w' or custom port ids

export type Multiplicity = '1' | '0..1' | '*' | '1..*' | '0..*' | ''

export interface ConnectionEnd {
  elementId: string
  port: PortSide
}

export interface Connection {
  id: string
  source: ConnectionEnd
  target: ConnectionEnd
  type: ConnectionType
  sourceMultiplicity: Multiplicity
  targetMultiplicity: Multiplicity
  label: string
}

export function createConnection(
  source: ConnectionEnd,
  target: ConnectionEnd,
  type: ConnectionType = 'association',
): Connection {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    type,
    sourceMultiplicity: '',
    targetMultiplicity: '',
    label: '',
  }
}
