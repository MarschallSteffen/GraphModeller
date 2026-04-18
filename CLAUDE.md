# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Critical Rules

- **Never push to remote.** Local commits are fine, but never run `git push` or create PRs without explicit instruction.

- **Never duplicate renderer logic across element types.** All renderers must use `svgEl`, `renderPortsInto`, `updatePortPositions`, and `renderShadow` from `renderers/svgUtils.ts`. Port sides come from `PORT_SIDES` (imported from `ports.ts`). Store subscriptions follow the pattern `store.on(ev => { if ev.type === '<kind>:update' && payload.id === ... })`. Do not copy these patterns — call the shared utilities.
- **All renderers must implement `destroy()`** — at minimum `this.el.remove()`. The `AnyRenderer` interface in `main.ts` requires it.
- **Connections are always auto-routed** via `bestPortPair` in `routing.ts` — stored ports are updated on every `refreshConnections` call. Never hardcode port sides in connection logic.
- **`refreshConnections` always passes the fresh `conn` object** from `store.state` directly to `r.updatePoints(...)` as the last argument. Never rely on `this.conn` inside the renderer being up-to-date at call time.
- **Persistence is JSON** — `saveDiagram` writes the full `Diagram` object as `JSON.stringify`. All persistence lives in `src/serialization/persistence.ts`. **Whenever the save file format changes (new fields, renamed fields, new element types, new connection types):**
  1. Update `serializeDiagramV2` to include the new fields
  2. Update `deserializeV2` (and `parseLifelines` for lifeline fields) to restore them
  3. Update the AI system prompt in `src/ui/AiPromptButton.ts` so AI-assisted diagram generation stays in sync with the actual schema
  4. Update `public/examples/app-architecture.json` to showcase new capabilities
- **Storage connection direction** — source/target order is canonical. `read` and `write` both use `marker-end` only; direction is determined by which element is source vs target. Use the flip button to reverse.
- **Element kind types are defined once** in `src/types.ts` (`ElementKind`, `SelectableKind`). Import from there — never re-declare locally.
- **`Point` and `Size` are defined in `src/entities/common.ts`** — import from there, not from `UmlClass.ts`. UmlClass re-exports them for backwards compatibility.
- **Store event types use hyphenated names matching `ElementKind`** — e.g. `'use-case:add'`, `'seq-diagram:update'`, `'start-state:remove'`. Never use the old concatenated forms (`usecase`, `seqdiagram`, etc.).
- **`ELEMENTS` dispatch table in `main.ts`** drives generic loops for selection, copy/paste, delete, rubber-band, and renderer lifecycle. Add new element types there instead of writing per-type if/else chains.
- **Element CRUD follows a uniform pattern** in `DiagramStore`. Use `store.findElementById(kind, id)`, `store.findAnyElement(id)`, and `store.updateElementPosition(kind, id, patch)` in controllers.
- **Wire functions in main.ts** use the generic `wireElementInteraction()` helper. Only class has special behaviour (no vertical resize, member editing). Sequence diagrams have their own `wireSeqDiagramInteraction`.
- **Sequence diagrams are self-contained containers** — each `SequenceDiagram` owns its `lifelines[]`. Lifeline `position.x` is relative to the container. Connections between lifelines are rendered in `seqConnLayer` using absolute canvas coords. The `refreshSeqDiagram` function (and its extracted helpers `assignEphemeralSlots`, `collectMsgEvents`, `computeActiveBars`) handle all per-container rendering.
- **Always verify visual and UI changes with Chrome DevTools MCP.** After any change affecting rendered output, styling, or layout: start the dev server (`npm run dev`), navigate to `http://localhost:5173` using the `chrome-devtools` MCP tools, take a screenshot, and check the console for errors. Do not mark a UI task complete without this verification step.

## Project Overview

A multi-diagram modeller — browser-only, no backend. Supports:
- **UML Class Diagrams** — classes, packages
- **TAM Block Diagrams** — agents, human agents, storage, queues
- **TAM Use Case Diagrams** — use cases, actors, system boundaries
- **TAM State Diagrams** — states, start states, end states
- **TAM Sequence Diagrams** — self-contained lifeline containers, combined fragments

Designed to be extended via config files and the `ELEMENTS` dispatch table.

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
- **Vite** + vanilla TypeScript (no framework)
- **SVG** for rendering all diagram elements
- **Vitest** for unit tests

### Persistence
- **localStorage** auto-save on every mutation — key `archetype:diagram`
- Format: plain `JSON.stringify(diagram)` of the full `Diagram` object
- File System Access API for Save/Save As with autosave to open file handle
- PNG export renders SVG to canvas with Latte (light) theme
- `DiagramStore.ensureNewFields()` handles migration of old JSON (backfills `elementType` on classes/packages, migrates flat `sequenceLifelines` to `sequenceDiagrams` containers)

### Theming
- **Catppuccin** flavours: Latte, Frappé, Macchiato, Mocha
- Theme token file at `src/themes/catppuccin.ts` — CSS custom properties applied to `:root`
- All colors reference CSS vars (`--ctp-*`), never hardcoded

---

### Source Layout

```
src/
  types.ts           # Shared types: ElementKind, SelectableKind
  entities/
    common.ts        # Point, Size interfaces (canonical source)
    Diagram.ts       # Root diagram: all collections + viewport
    UmlClass.ts      # elementType: 'uml-class'
    Package.ts       # elementType: 'uml-package'
    Storage.ts       # elementType: 'storage'
    Actor.ts         # elementType: 'agent' | 'human-agent' | 'uc-actor'
    Queue.ts         # elementType: 'queue'
    UseCase.ts       # elementType: 'use-case'
    UCSystem.ts      # elementType: 'uc-system'
    State.ts         # elementType: 'state'
    StartState.ts    # elementType: 'start-state'
    EndState.ts      # elementType: 'end-state'
    SequenceDiagram.ts  # elementType: 'seq-diagram', owns lifelines[]
    SequenceLifeline.ts # elementType: 'seq-lifeline' (nested in SequenceDiagram)
    CombinedFragment.ts # elementType: 'seq-fragment'
    Connection.ts    # source/target endpoints, type, multiplicities
  geometry/
    shapeGeometry.ts # Pure shape border math: elementShape, borderPointForShape, shapedBorderDist
  renderers/         # SVG renderers — one per entity type + routing.ts + svgUtils.ts
    ConnectionRefresher.ts  # 4-pass connection routing engine; refresh() called via main.ts wrapper
  interaction/       # Drag, resize, connect, select, snap, inline-edit controllers
    Clipboard.ts     # Copy/paste with ID remapping; doCopy/doPaste wrappers in main.ts
    RubberBandSelector.ts  # Rubber-band selection state machine; start/onMouseMove/onMouseUp
  store/
    DiagramStore.ts  # Single state + mutation API + event bus; CRUD delegated to CollectionManagers
    CollectionManager.ts  # Generic CollectionManager<T> — add/update/remove/findById/getAll
  serialization/
    persistence.ts   # JSON save/load, file handle management, PNG export orchestration
    png-chunks.ts    # Pure utilities: crc32, injectPngiTxt, extractPngiTxt (no DOM/store)
    svg-export.ts    # SVG export preprocessing: getExportBounds, prepareSvgForExport, collectStyles
    ThumbnailCache.ts  # In-memory blob-URL thumbnail cache keyed by diagram ID
    PngAutosave.ts   # Debounced PNG autosave scheduler; accepts doWrite callback (avoids circular deps)
  config/            # Element type descriptors (ports, connectionRules, defaultSize)
  themes/            # Catppuccin theme tokens
  ui/
    popover.ts       # createPopover() — shared dismiss-on-outside-click + Escape helper used by all popovers
    SequenceDiagramController.ts  # All seq-diagram wiring + rendering logic extracted from main.ts
    PropertiesOrchestrator.ts  # Single + bulk properties panel logic; show() called via main.ts wrapper
    # also: Toolbar, ConnectionPopover, MessagePopover, ElementPropertiesPanel, BulkPropertiesPanel, FileMenu
  interaction/
    ViewportController.ts  # Pan/zoom state + applyViewport(); applyViewport wrapper in main.ts
  main.ts            # Entry point — ELEMENTS dispatch table, wiring, rendering
```

---

### Entities (`src/entities/`)

Plain data objects — no DOM, no side effects. All use `Point`/`Size` from `common.ts`. All have `elementType` discriminant field.

Connection types: `plain | association | composition | aggregation | inheritance | realization | dependency | request | write | read-write | uc-association | uc-extend | uc-include | uc-specialization | transition`

---

### Renderers (`src/renderers/`)

Each renderer owns an SVG `<g>`. All implement: `update()`, `setSelected()`, `destroy()`, `getRenderedSize()`, `getContentMinSize()`.

- `svgUtils.ts` — `svgEl`, `renderPortsInto`, `updatePortPositions`, `renderShadow`, `estimateTextWidth`
- `routing.ts` — `bestPortPair`, `orthogonalPath`, `pathMidpoint`; imports `PORT_SIDES` from `ports.ts`
- `SequenceDiagramRenderer.ts` — outer container renderer owning child `SequenceLifelineRenderer` instances. Subscribes to `seq-diagram:update`, calls `syncLifelineRenderers()` which adds/removes/updates child renderers.
- `SequenceLifelineRenderer.ts` — uses `svgEl()` from svgUtils (no local SVG_NS). Has `setMsgLocalYs()`, `updateActiveBars()`, `updateInsertSlots()`, `setSpineBottom()` for cross-lifeline rendering driven by `refreshSeqDiagram`.

---

### Interaction (`src/interaction/`)

- `SelectionManager.ts` — tracks selected elements; additive (shift-click) selection
- `DragController.ts` — single/multi drag with snap guides. Collects rects from ALL element types for snapping.
- `ResizeController.ts` — 8 edges/corners. Classes suppress N/S resize.
- `ConnectionController.ts` — port drag → ghost line → drop; uses `store.findAnyElement(id)` for element lookup (no per-type chains)
- `InlineEditor.ts` — double-click → `<foreignObject>` input
- `SnapEngine.ts` — center/edge/gap snapping with guide lines

---

### Store (`src/store/`)

`DiagramStore.ts` — single store wrapping a `Diagram`. Emits typed events (`'<kind>:add|update|remove'`). CRUD for each element type is delegated to a `CollectionManager<T>` instance; DiagramStore exposes thin delegator methods on top.

`CollectionManager.ts` — generic `CollectionManager<T extends { id: string }>` with `add`, `update`, `remove`, `findById`, `getAll`. Handles undo snapshot + event emission. Instantiate one per element type collection.

Key DiagramStore methods:
- `findElementById(kind, id)` — returns `{position, size}` for a known kind
- `findAnyElement(id)` — searches all collections by id (kind-agnostic)
- `updateElementPosition(kind, id, patch)` — routes position/size patch
- `cleanupConnectionsForElement(id)` — removes connections referencing an element (called by all `remove*` methods)
- `ensureNewFields()` — migration: backfills `elementType`, creates missing arrays, migrates legacy `sequenceLifelines`

---

### Config (`src/config/`)

- Registry maps config `type` strings to `ElementConfig` objects: `'uml-class'`, `'uml-package'`, `'storage'`, `'agent'`, `'human-agent'`, `'queue'`, `'use-case'`, `'uc-system'`, `'uc-actor'`, `'state'`, `'start-state'`, `'end-state'`, `'seq-lifeline'`, `'seq-fragment'`
- Each config defines: `ports`, `connectionRule` (asSource/asTarget arrays), `defaultSize`, optional `preferredConnectionType`, `supportsMultiplicity`

---

### Popovers (`src/ui/`)

All popovers use `createPopover()` from `src/ui/popover.ts` — a shared helper that creates the element, appends it to `#popover-layer`, and wires dismiss-on-outside-click + Escape key. Returns `{ el, dismiss }`. Pass `extraKeys` for Delete/Backspace (MessagePopover).

**ConnectionPopover** — shown on connection create/click. Sections: "Type" (icon buttons filtered by element config), "Multiplicity" (source/target dropdowns), "Routing" (auto/min/max elbow). Flip button swaps source↔target. Dismisses on Escape or outside click.

**MessagePopover** — shown on sequence message click. Section: "Kind" (sync/async/create/return/self). Delete via Delete/Backspace key. Same visual style as ConnectionPopover.

Both use section headings (`popover-section-label` CSS class).

---

### main.ts — ELEMENTS Dispatch Table

The `ELEMENTS: ElementDesc[]` array (initialized in `initElementDescriptors()`) maps each element kind to its:
- `collection` (Diagram field name)
- `renderers` map
- `addRenderer` function
- `add` / `remove` store methods

This drives generic loops for: selection highlight, delete, copy, paste, rubber-band, cursor management, `getRenderedSizeFor`, `findElement`, `rebuildAll`, and store event handling (`:add`/`:remove`).

---

### Toolbar Groups

Collapsible groups with localStorage-persisted state (`toolbar-group:<label>`):
- **Nav** — Select (V), Pan (H)
- **UML** — Class (C), Package (P)
- **TAM** — Agent (A), Human Agent (U), Storage (S), Queue (Q)
- **UC** — Use Case (E), Actor, System Boundary
- **SD** — State (T), Start State, End State
- **SQ** — Sequence Diagram (L), Combined Fragment

---

### Sequence Diagrams

All seq-diagram wiring and rendering logic lives in `src/ui/SequenceDiagramController.ts`. `main.ts` holds a single `seqCtrl` instance and delegates `addSeqDiagramRenderer`, `refreshSeqDiagram` calls to it.

- Each `SequenceDiagram` is a self-contained container with `lifelines: SequenceLifeline[]`
- Lifeline `position.x` = horizontal offset within container; `position.y` always 0
- Lifelines are horizontally draggable (header mousedown → `startLifelineHDrag`)
- `+` buttons appear when a seq-diagram is selected; float with zoom/pan via `refreshLifelineAddButtons()`
- `refreshSeqDiagram(sd, sdR)` handles: ephemeral slot assignment, event collection, activation bars, insert slots, bounding box, spine extension, inter-lifeline arrows
- Helper functions: `assignEphemeralSlots()`, `collectMsgEvents()`, `computeActiveBars()`
- `removeSeqMessage()` deletes a message and re-compacts slotIndex values across all lifelines
- Self-calls (`kind: 'self'`) keep activation bars open (don't close them)
- Spines extend to the diagram-wide max height via `setSpineBottom()`
- Insert slots appear between ALL arrows touching a lifeline (incoming + outgoing)

---

### Extensibility

Adding a new element type:
1. Entity in `src/entities/` — use `Point`/`Size` from `common.ts`, include `elementType` field
2. Renderer in `src/renderers/` — implement `update()`, `setSelected()`, `destroy()`, `getRenderedSize()`, `getContentMinSize()`
3. Config in `src/config/elements/` — ports, connectionRule, defaultSize
4. Register in `src/config/registry.ts`
5. Add kind to `ElementKind` in `src/types.ts`
6. Add CRUD to `DiagramStore` + add collection to `ensureNewFields()`
7. Add entry to `ELEMENTS` array in `main.ts` (handles store events, delete, copy/paste, selection, rubber-band automatically)
8. Add `add*Renderer` factory + `wireElementInteraction()` call
9. Add toolbar button (tool type, icon, label, keyboard shortcut, group)
10. Add CSS styles
