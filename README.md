# diagrams-tool

A browser-only multi-diagram modeller built with Vite and vanilla TypeScript. No backend, no framework — everything runs in the browser and persists to localStorage or a local file.

**[Try it live on GitHub Pages](https://marschallsteffen.github.io/GraphModeller/)**

## Diagram Types

- **UML Class Diagrams** — classes with attributes/methods, packages
- **TAM Block Diagrams** — agents, human agents, storage, queues
- **TAM Use Case Diagrams** — use cases, actors, system boundaries
- **TAM State Diagrams** — states, start states, end states
- **TAM Sequence Diagrams** — self-contained lifeline containers, combined fragments, activation bars

## Features

- Drag, resize, and connect elements on an infinite canvas
- Pan (H) and zoom (scroll/pinch)
- Auto-routed orthogonal connections with configurable type and multiplicity
- Inline text editing (double-click any element or connection label)
- Copy / paste / delete with keyboard shortcuts
- Rubber-band selection and multi-element drag
- Snap-to-grid guides
- Auto-save to localStorage on every change
- Save / Save As / Open via the File System Access API (where supported)
- PNG export
- Catppuccin themes: Latte, Frappé, Macchiato, Mocha

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install and run

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

### Build

```bash
npm run build     # production build → dist/
npm run preview   # preview the production build
```

### Test and lint

```bash
npm test          # run tests (Vitest)
npm run test:watch
npm run lint
```

## Usage

| Action | How |
|---|---|
| Add element | Click a toolbar button or press its keyboard shortcut |
| Select | Click an element; Shift-click to add to selection |
| Multi-select | Drag a rubber-band rectangle over elements |
| Move | Drag selected elements |
| Resize | Drag a corner or edge handle |
| Connect | Hover an element → drag a port dot to another element |
| Edit label | Double-click an element or connection label |
| Delete | Select then press Delete or Backspace |
| Copy / Paste | Ctrl/Cmd + C / V |
| Pan | Hold H or middle-click drag |
| Zoom | Scroll wheel or pinch |
| Open / Save | File menu (top-right) |

### Keyboard shortcuts

| Key | Tool |
|---|---|
| V | Select |
| H | Pan |
| C | UML Class |
| P | Package |
| A | Agent |
| U | Human Agent |
| S | Storage |
| Q | Queue |
| E | Use Case |
| T | State |
| L | Sequence Diagram |

## Architecture

Vite + vanilla TypeScript + SVG. No runtime dependencies.

```
src/
  types.ts              # ElementKind, SelectableKind
  entities/             # Plain data objects (no DOM)
  renderers/            # SVG renderers, one per entity type
  interaction/          # Drag, resize, connect, select, inline-edit
  store/                # DiagramStore — state + event bus
  serialization/        # JSON save/load, PNG export
  config/               # Element descriptors (ports, connection rules, sizes)
  themes/               # Catppuccin theme tokens
  ui/                   # Toolbar, popovers, file menu
  main.ts               # Entry point — ELEMENTS dispatch table, wiring
```

See [CLAUDE.md](CLAUDE.md) for detailed architecture notes.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
