/**
 * Shared element kind types used across interaction controllers,
 * selection manager, drag/resize controllers, and main.ts.
 *
 * Centralised here so adding a new element kind requires only one edit.
 */
export type ElementKind = 'class' | 'package' | 'storage' | 'actor' | 'queue'
export type SelectableKind = ElementKind | 'connection'
