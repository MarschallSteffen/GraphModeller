import type { ThemeFlavour } from '../themes/catppuccin.ts'
import { applyTheme, LATTE, FRAPPE, MACCHIATO, MOCHA } from '../themes/catppuccin.ts'

export type Tool = 'select' | 'pan' | 'class' | 'package' | 'storage' | 'agent' | 'human-agent' | 'queue' | 'use-case' | 'uc-actor' | 'uc-system' | 'state' | 'start-state' | 'end-state' | 'seq-diagram' | 'seq-fragment' | 'comment'

type ToolChangeListener = (tool: Tool) => void

const FLAVOURS: Array<{ id: ThemeFlavour; label: string; dot: string }> = [
  { id: 'latte',     label: 'Latte',     dot: LATTE.base },
  { id: 'frappe',    label: 'Frappé',    dot: FRAPPE.base },
  { id: 'macchiato', label: 'Macchiato', dot: MACCHIATO.base },
  { id: 'mocha',     label: 'Mocha',     dot: MOCHA.base },
]

// SVG icon paths (Material-style, 24x24 viewBox)
const ICONS: Record<Tool, string> = {
  select:        `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5.5 3.21V20.8l4.51-4.52 2.49 5.43 1.84-.84-2.49-5.43H17.5z"/></svg>`,
  pan:           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V5a2 2 0 1 1 4 0v4"/><path d="M12 9V3a2 2 0 1 1 4 0v7"/><path d="M16 10V5.5a2 2 0 1 1 4 0V14c0 4-3 7-7 7H12c-4 0-7-3-7-6l-1.5-4a1.5 1.5 0 0 1 2.6-1.5L8 14"/></svg>`,
  class:         `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="2" x="3" y="3" width="18" height="18" rx="2"/><line stroke="currentColor" stroke-width="1.5" x1="3" y1="9" x2="21" y2="9"/><line stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" x1="3" y1="15" x2="21" y2="15"/></svg>`,
  // Package: dashed-outline container with tab (UML package notation)
  package:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="18" height="14" rx="1.5" stroke-dasharray="4 2"/><path d="M3 7 L3 4 Q3 2.5 4.5 2.5 L9 2.5 Q10.5 2.5 10.5 4 L10.5 7"/></svg>`,
  storage:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="7" rx="9" ry="3"/><path d="M3 7v10c0 1.66 4.03 3 9 3s9-1.34 9-3V7"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" stroke-width="1.2"/></svg>`,
  // Agent: box with gear/CPU indicator (processing unit)
  agent:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="5" x2="12" y2="9" stroke-width="1.2"/><line x1="12" y1="15" x2="12" y2="19" stroke-width="1.2"/><line x1="3" y1="12" x2="7" y2="12" stroke-width="1.2"/><line x1="17" y1="12" x2="21" y2="12" stroke-width="1.2"/></svg>`,
  'human-agent': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M7 18c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke-linecap="round"/></svg>`,
  // Queue: pill (stadium) shape with stacked lines showing data flow
  queue:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="7" width="20" height="10" rx="5"/><line x1="8" y1="10" x2="16" y2="10" stroke-width="1.2" stroke-linecap="round"/><line x1="8" y1="12" x2="16" y2="12" stroke-width="1.2" stroke-linecap="round"/><line x1="8" y1="14" x2="16" y2="14" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  'use-case':    `<svg viewBox="0 0 24 24"><ellipse fill="none" stroke="currentColor" stroke-width="2" cx="12" cy="12" rx="9" ry="6"/></svg>`,
  'uc-actor':    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="7" y1="11" x2="17" y2="11"/><line x1="12" y1="16" x2="9" y2="21"/><line x1="12" y1="16" x2="15" y2="21"/></svg>`,
  // UC System: solid-border box with label area at top (system boundary notation)
  'uc-system':   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="1.5"/><line x1="3" y1="8" x2="21" y2="8"/><text x="12" y="6.5" font-size="5" text-anchor="middle" fill="currentColor" stroke="none">System</text></svg>`,
  'state':       `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="2" x="3" y="8" width="18" height="8" rx="4"/></svg>`,
  'start-state': `<svg viewBox="0 0 24 24"><circle fill="currentColor" cx="12" cy="12" r="6"/></svg>`,
  'end-state':   `<svg viewBox="0 0 24 24"><circle fill="none" stroke="currentColor" stroke-width="2" cx="12" cy="12" r="8"/><circle fill="currentColor" cx="12" cy="12" r="5"/></svg>`,
  'seq-diagram': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="8" height="6" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><line x1="7" y1="9" x2="7" y2="21" stroke-dasharray="3 2"/><line x1="17" y1="9" x2="17" y2="21" stroke-dasharray="3 2"/><line x1="7" y1="14" x2="17" y2="14" stroke-dasharray="0"/><path d="M15 12 L17 14 L15 16" stroke-width="1.5"/></svg>`,
  // Combined Fragment: dashed-border box with pentagon label in top-left corner
  'seq-fragment':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="4 2"/><polyline points="3,3 10,3 10,7.5 8,9 3,9 3,3" stroke-width="1.5"/></svg>`,
  // Comment: sticky-note with dog-ear
  'comment':     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="3,3 17,3 21,7 21,21 3,21" stroke-linejoin="round"/><polyline points="17,3 17,7 21,7" stroke-width="1.2"/></svg>`,
}

interface ToolDef {
  kind: Tool
  label: string
  key?: string  // keyboard shortcut (single lowercase letter)
}

interface ToolGroup {
  label: string
  shortLabel: string  // 2-3 char abbreviation shown on collapsed header
  tools: ToolDef[]
  defaultOpen: boolean
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'Navigation',
    shortLabel: 'Nav',
    tools: [
      { kind: 'select',        label: 'Select',               key: 'v' },
      { kind: 'pan',           label: 'Pan',                  key: 'h' },
    ],
    defaultOpen: true,
  },
  {
    label: 'UML Class Diagram',
    shortLabel: 'UML',
    tools: [
      { kind: 'class',         label: 'Add Class',            key: 'c' },
      { kind: 'package',       label: 'Add Package',          key: 'p' },
    ],
    defaultOpen: false,
  },
  {
    label: 'TAM Block Diagram',
    shortLabel: 'TAM',
    tools: [
      { kind: 'agent',         label: 'Add Agent',            key: 'a' },
      { kind: 'human-agent',   label: 'Add Human Agent',      key: 'u' },
      { kind: 'storage',       label: 'Add Storage',          key: 's' },
      { kind: 'queue',         label: 'Add Queue',            key: 'q' },
    ],
    defaultOpen: false,
  },
  {
    label: 'TAM Use Case Diagram',
    shortLabel: 'UC',
    tools: [
      { kind: 'use-case',      label: 'Add Use Case',         key: 'e' },
      { kind: 'uc-actor',      label: 'Add Actor'                       },
      { kind: 'uc-system',     label: 'Add System Boundary'             },
    ],
    defaultOpen: false,
  },
  {
    label: 'TAM State Diagram',
    shortLabel: 'SD',
    tools: [
      { kind: 'state',         label: 'Add State',            key: 't' },
      { kind: 'start-state',   label: 'Add Start State'                 },
      { kind: 'end-state',     label: 'Add End State'                   },
    ],
    defaultOpen: false,
  },
  {
    label: 'TAM Sequence Diagram',
    shortLabel: 'SQ',
    tools: [
      { kind: 'seq-diagram',   label: 'Add Sequence Diagram', key: 'l' },
      { kind: 'seq-fragment',  label: 'Add Combined Fragment'           },
    ],
    defaultOpen: false,
  },
  {
    label: 'Annotations',
    shortLabel: 'ANN',
    tools: [
      { kind: 'comment', label: 'Add Comment', key: 'x' },
    ],
    defaultOpen: false,
  },
]

/** Map from lowercase key letter → tool kind, derived from TOOL_GROUPS */
const keyMap: Record<string, Tool> = {}
for (const group of TOOL_GROUPS) {
  for (const tool of group.tools) {
    if (tool.key) keyMap[tool.key] = tool.kind
  }
}

/** Tooltip label including keyboard hint when a shortcut exists */
function toolTitle(tool: ToolDef): string {
  return tool.key ? `${tool.label} (${tool.key.toUpperCase()})` : tool.label
}

export class Toolbar {
  private current: Tool = 'select'
  private listeners: ToolChangeListener[] = []
  private buttons: Map<Tool, HTMLButtonElement> = new Map()
  private groupStates: Map<string, boolean> = new Map()

  constructor(private container: HTMLElement) {
    // Initialize group states from localStorage
    TOOL_GROUPS.forEach(g => {
      const saved = localStorage.getItem(`toolbar-group:${g.label}`)
      this.groupStates.set(g.label, saved !== null ? saved === 'true' : g.defaultOpen)
    })
    this.render()
  }

  get activeTool(): Tool { return this.current }

  setTool(tool: Tool) {
    this.current = tool
    this.buttons.forEach((btn, t) => btn.classList.toggle('active', t === tool))
    this.listeners.forEach(l => l(tool))
  }

  onToolChange(listener: ToolChangeListener): () => void {
    this.listeners.push(listener)
    return () => { this.listeners = this.listeners.filter(l => l !== listener) }
  }

  private render() {
    this.container.innerHTML = ''
    this.buttons.clear()

    TOOL_GROUPS.forEach(group => {
      const isOpen = this.groupStates.get(group.label) ?? group.defaultOpen

      // Group wrapper
      const groupEl = document.createElement('div')
      groupEl.classList.add('tool-group')
      groupEl.classList.toggle('open', isOpen)

      // Group header (clickable to toggle)
      const header = document.createElement('button')
      header.classList.add('tool-group-header')
      header.title = group.label
      header.setAttribute('aria-label', group.label)
      header.innerHTML = `
        <span class="tool-group-label">${group.shortLabel}</span>
        <svg class="tool-group-chevron" viewBox="0 0 10 6" width="8" height="8">
          <path d="M1,1 L5,5 L9,1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `
      header.addEventListener('click', () => {
        const nowOpen = !this.groupStates.get(group.label)
        this.groupStates.set(group.label, nowOpen)
        localStorage.setItem(`toolbar-group:${group.label}`, String(nowOpen))
        groupEl.classList.toggle('open', nowOpen)
      })

      // Group body with buttons
      const body = document.createElement('div')
      body.classList.add('tool-group-body')

      group.tools.forEach(tool => {
        const btn = document.createElement('button')
        btn.classList.add('tool-btn')
        btn.dataset.tool = tool.kind
        btn.innerHTML = ICONS[tool.kind]
        const title = toolTitle(tool)
        btn.title = title
        btn.setAttribute('aria-label', title)
        if (tool.kind === this.current) btn.classList.add('active')
        btn.addEventListener('click', () => this.setTool(tool.kind))
        body.appendChild(btn)
        this.buttons.set(tool.kind, btn)
      })

      groupEl.append(header, body)
      this.container.appendChild(groupEl)
    })

    // Divider before theme picker
    const divider = document.createElement('div')
    divider.classList.add('toolbar-divider')
    this.container.appendChild(divider)

    // Theme picker
    const picker = document.createElement('div')
    picker.classList.add('theme-picker')
    FLAVOURS.forEach(f => {
      const dot = document.createElement('button')
      dot.classList.add('theme-dot', 'tool-btn')
      dot.style.background = f.dot
      dot.title = f.label
      dot.setAttribute('aria-label', f.label)
      dot.dataset.theme = f.id
      dot.dataset.active = String(
        document.documentElement.getAttribute('data-theme') === f.id,
      )
      dot.addEventListener('click', () => {
        applyTheme(f.id)
        picker.querySelectorAll<HTMLElement>('.theme-dot').forEach(d => {
          d.dataset.active = String(d.dataset.theme === f.id)
        })
      })
      picker.appendChild(dot)
    })
    this.container.appendChild(picker)

    document.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const tool = keyMap[e.key.toLowerCase()]
      if (tool) this.setTool(tool)
    })
  }
}
