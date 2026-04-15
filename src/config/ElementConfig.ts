import type { ConnectionType } from '../entities/Connection.ts'

/**
 * Describes one connection port on an element.
 * `id` is a stable key (e.g. 'n', 'e', 's', 'w', or custom names for specialised elements).
 */
export interface PortDef {
  id: string
  /** Local position as a fraction of element width/height: [0..1, 0..1] */
  xFrac: number
  yFrac: number
}

/**
 * Connection rule for one element type.
 * If defined, only the listed connection types are allowed on that end.
 * `null` means "no restriction".
 */
export interface ConnectionRule {
  /** Allowed types when this element is the SOURCE of a connection */
  asSource: ConnectionType[] | null
  /** Allowed types when this element is the TARGET of a connection */
  asTarget: ConnectionType[] | null
}

/**
 * Descriptor registered for every element type.
 * Add one entry in `src/config/elements/` per new element kind.
 */
export interface ElementConfig {
  /** Unique type identifier — matches the discriminant used in entity objects */
  type: string
  /** Default element size */
  defaultSize: { w: number; h: number }
  /** Port definitions (used by renderers and connection controller) */
  ports: PortDef[]
  /** Connection rules. Null = unrestricted. */
  connectionRule: ConnectionRule | null
  /**
   * Preferred connection type to use as the default when creating a new connection
   * involving this element. Must be within the allowed types. If both endpoints
   * declare a preferred type and they differ, source preference wins.
   */
  preferredConnectionType?: ConnectionType
  /**
   * Whether connections to/from this element type should show
   * multiplicity/ordinality fields in the connection popover.
   */
  supportsMultiplicity: boolean
}
