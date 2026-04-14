# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules

- **Never duplicate renderer logic across element types.** All renderers must use `svgEl`, `renderPortsInto`, `updatePortPositions`, and `renderShadow` from `renderers/svgUtils.ts`. Port sides come from `PORT_SIDES` (or a per-type subset like `QUEUE_PORT_SIDES`). Store subscriptions follow the pattern `store.on(ev => { if ev.type === '<type>:update' && payload.id === ... })`. Do not copy these patterns — call the shared utilities.
- **Connections are always auto-routed** via `bestPortPair` in `routing.ts` — stored ports are updated on every `refreshConnections` call. Never hardcode port sides in connection logic.
- **`refreshConnections` always passes the fresh `conn` object** from `store.state` directly to `r.updatePoints(...)` as the last argument. Never rely on `this.conn` inside the renderer being up-to-date at call time — there is a race between renderer store subscriptions and the main store listener.
- **Persistence is JSON** — `saveDiagram` writes the full `Diagram` object as `JSON.stringify`. Do not add Mermaid as a persistence path; it is export-only.
- **Storage connection normalization** — `refreshConnections` always passes class end as `x1/y1` and storage end as `x2/y2`. Arrow semantics in `ConnectionRenderer` depend on this: `read` → `marker-start` at x1 (arrow points at class); `write` → `marker-start` at x1; `read-write` → two curved opposing arrows via `curvedArrowPath`.
- **Element kind types are defined once** in `src/types.ts` (`ElementKind`, `SelectableKind`). Import from there — never re-declare locally.
- **Element CRUD follows a uniform pattern** in `DiagramStore`. Use `store.findElementById(kind, id)` and `store.updateElementPosition(kind, id, patch)` in controllers instead of parallel if-else chains over entity collections.
- **Wire functions in main.ts** use the generic `wireElementInteraction()` helper. Only class has special behaviour (no vertical resize, member editing). All other element types delegate entirely to the helper.
- **No Chrome DevTools MCP** — do not use chrome-devtools tools in this project.

## Project Overview

A TAM Block Diagram + UML class diagram modeller — browser-only, no backend. Supports UML classes, packages, storage, agent, human-agent, and queue elements. Designed to be extended via config files.

## Commands

```bash
npm install          # install dependencies
npm run dev          # start dev server (Vite, http://localhost:5173)
npm run build        # production build → dist/
npm run preview      # preview production build
npm test             # run tests (Vitest)
npm run test:watch   # watch mode
npm run lint         # ESLint
```

## Architecture

### Tech Stack
- **Vite** + vanilla TypeScript (no framework — keeps it lightweight)
- **SVG** for rendering all diagram elements (not Canvas — SVG is inspectable and easier to manipulate)
- **Vitest** for unit tests

### Persistence
- **localStorage** auto-save on every mutation — key `diagrams-tool:diagram`
- Format: plain `JSON.stringify(diagram)` of the full `Diagram` object
- Mermaid (`toMermaid` / `fromMermaid`) is available for **export/import only**, not persistence
- Old mmd+layout format is auto-migrated to JSON on first load

### Theming
- **Catppuccin** flavours: Latte, Frappé, Macchiato, Mocha
- Theme token file at `src/themes/catppuccin.ts` — CSS custom properties applied to `:root`
- All colors in renderers reference CSS vars (`--ctp-*`), never hardcoded

---

### Source Layout

```
src/
  types.ts           # Shared types: ElementKind, SelectableKind
  entities/          # Plain data types — one file per diagram element
  renderers/         # SVG renderers — one per entity type + routing.ts + svgUtils.ts
  interaction/       # Drag, resize, connect, select controllers
  store/             # Single in-memory Diagram state + mutation API
  serialization/     # mermaid.ts: Mermaid export/import + JSON persistence
  config/            # Element type descriptors (extensibility point)
  themes/            # Catppuccin theme tokens
  ui/                # Toolbar, popovers, overlays (plain DOM, no framework)
  main.ts            # Entry point — wires everything together
```

---

### Entities (`src/entities/`)

Plain data objects — no DOM, no side effects.

- `Diagram.ts` — root: holds packages, classes, storages, actors, queues, connections, viewport
- `Package.ts` — namespace/grouping container with position and size
- `UmlClass.ts` — name, stereotype, attributes[], methods[], position, size; also exports `Point` and `Size`
- `Storage.ts` — name, position, size (database/storage symbol); `multiInstance: boolean`
- `Actor.ts` — `elementType: 'agent' | 'human-agent'`, name, position, size, `multiInstance: boolean`
- `Queue.ts` — pill-shaped queue element, name, position, size, `multiInstance: boolean`
- `Connection.ts` — source element+port, target element+port, type, multiplicities

Connection types: `association | composition | aggregation | inheritance | realization | dependency | read | write | read-write | request`

All positionable entities use `Point` (`{x,y}`) and `Size` (`{w,h}`) from `UmlClass.ts`.

---

### Renderers (`src/renderers/`)

Each renderer owns the SVG `<g>` for one entity instance. Creates on mount, patches on update (no full re-render). Subscribes to store events for self-updates.

- `svgUtils.ts` — **shared utilities**: `svgEl`, `renderPortsInto`, `updatePortPositions`, `renderShadow`. All renderers import from here.
- `routing.ts` — `bestPortPair(srcRect, tgtRect)` + `orthogonalPath(x1,y1,sp, x2,y2,tp)` — strictly axis-aligned elbow routing with rounded Q-bezier corners.
- `ports.ts` — `PORT_SIDES`, `portPosition(side,w,h)`, `absolutePortPosition(...)`
- `ConnectionRenderer.ts` — renders connection lines; `updatePoints` takes a fresh `conn` as 7th argument (passed from `refreshConnections`)

Connection ports are rendered as small circles (via `renderPortsInto`), visible on element hover.

---

### Interaction (`src/interaction/`)

- `SelectionManager.ts` — tracks selected elements; supports additive (shift-click) selection; re-exports `SelectableKind` from `types.ts`
- `DragController.ts` — move drag; on `startDrag` if the target element is in a multi-selection, all selected elements move together. Uses `store.findElementById` / `store.updateElementPosition`.
- `ResizeController.ts` — all 8 edges/corners (N/S/E/W/NW/NE/SW/SE); updates both position and size. Classes suppress N/S resize (height is content-driven). Uses `store.findElementById` / `store.updateElementPosition`.
- `ConnectionController.ts` — port mousedown → ghost line → drop on any element body (auto-snaps to closest port via `bestPortPair`) or specific port; creates connection immediately with defaults, then shows optional popover
- `InlineEditor.ts` — double-click text node → `<foreignObject>` input; commits on blur/Enter, cancels on Escape

---

### Store (`src/store/DiagramStore.ts`)

Single store wrapping a `Diagram`. All mutations go through it (enables undo/redo later). Emits typed events (`class:add`, `class:update`, `storage:update`, `connection:add`, etc.) that renderers and `main.ts` subscribe to.

Key helpers (used by controllers to avoid if-else chains over entity kind):
- `findElementById(kind, id)` — returns `{position, size}` for any element kind
- `updateElementPosition(kind, id, patch)` — routes a position/size patch to the correct typed update method

---

### Config (`src/config/`)

- `CARDINAL_PORTS` is exported from `config/elements/umlClass.ts` and shared by storage and actor configs — do not redefine it.
- Each element type has a config in `config/elements/` implementing `ElementConfig` (ports, connectionRule, defaultSize).
- Registry in `config/registry.ts` maps type strings to configs.

---

### Connection Popover (`src/ui/ConnectionPopover.ts`)

Non-modal floating panel. Appears after connection drag or on click of existing arrow. Changes apply live on every `change` event — no confirm button. Dismisses on outside click or Escape.

- For storage connections: only shows `read | write | read-write`
- For actor/queue connections: only shows `request`
- For class/package connections: shows UML types filtered by `ElementConfig.connectionRule`

---

### Toolbar Groups

Collapsible groups with localStorage-persisted state (`toolbar-group:<label>`):
- **Nav** — Select (V), Pan (H)
- **UML** — Class (C), Package (P)
- **TAM** — Agent (A), Human Agent (U), Storage (S), Queue (Q)

---

### Extensibility

Adding a new element type requires:
1. Entity file in `src/entities/` — use `Point` and `Size` from `UmlClass.ts`
2. Renderer in `src/renderers/` — use `svgEl`, `renderPortsInto`, `updatePortPositions`, `renderShadow` from `svgUtils.ts`
3. Config descriptor in `src/config/elements/` — reuse `CARDINAL_PORTS` if applicable
4. Register in `src/config/registry.ts`
5. Add kind to `ElementKind` in `src/types.ts`
6. Add CRUD to `DiagramStore` + guard in constructor and `load()`
7. Add `add*Renderer` factory, store event handler, `rebuildAll` iteration, and delete handler in `main.ts`
8. Wire interaction via `wireElementInteraction()` in `main.ts`
9. Add toolbar button, CSS styles, and keyboard shortcut
