import type { ThemeFlavour } from '../themes/catppuccin.ts'
import { applyTheme } from '../themes/catppuccin.ts'

export type Tool = 'select' | 'pan' | 'class' | 'package' | 'storage' | 'agent' | 'human-agent' | 'queue'

type ToolChangeListener = (tool: Tool) => void

const FLAVOURS: Array<{ id: ThemeFlavour; label: string; dot: string }> = [
  { id: 'latte',     label: 'Latte',     dot: '#eff1f5' },
  { id: 'frappe',    label: 'Frappé',    dot: '#303446' },
  { id: 'macchiato', label: 'Macchiato', dot: '#24273a' },
  { id: 'mocha',     label: 'Mocha',     dot: '#1e1e2e' },
]

// SVG icon paths (Material-style, 24x24 viewBox)
const ICONS: Record<Tool, string> = {
  select:        `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5.5 3.21V20.8l4.51-4.52 2.49 5.43 1.84-.84-2.49-5.43H17.5z"/></svg>`,
  pan:           `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V8a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v3"/><path d="M14 10V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v4"/><path d="M10 10.5V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v9.5"/><path d="M6 14s0 6 6 6 6-4 6-4V11"/></svg>`,
  class:         `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="2" x="3" y="3" width="18" height="18" rx="2"/><line stroke="currentColor" stroke-width="1.5" x1="3" y1="9" x2="21" y2="9"/><line stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" x1="3" y1="15" x2="21" y2="15"/></svg>`,
  package:       `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="2" x="3" y="7" width="18" height="14" rx="2"/><rect fill="currentColor" x="3" y="3" width="7" height="5" rx="1"/></svg>`,
  storage:       `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="2" x="2" y="7" width="20" height="10" rx="5"/><ellipse fill="none" stroke="currentColor" stroke-width="1.2" cx="7" cy="12" rx="2" ry="3.5"/><ellipse fill="none" stroke="currentColor" stroke-width="1.2" cx="17" cy="12" rx="2" ry="3.5"/></svg>`,
  agent:         `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="2" x="3" y="6" width="18" height="12" rx="2"/></svg>`,
  'human-agent': `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="1.8" x="2" y="2" width="20" height="20" rx="2"/><circle fill="none" stroke="currentColor" stroke-width="1.5" cx="12" cy="8" r="3"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M12 11 L12 17 M8 13.5 L16 13.5 M9 21 L12 17 L15 21"/></svg>`,
  queue:         `<svg viewBox="0 0 24 24"><rect fill="none" stroke="currentColor" stroke-width="2" x="2" y="7" width="20" height="10" rx="5"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M10 12 L14 12 M14 12 L12 10 M14 12 L12 14"/></svg>`,
}

const TOOL_LABELS: Record<Tool, string> = {
  select:        'Select (V)',
  pan:           'Pan (H)',
  class:         'Add Class (C)',
  package:       'Add Package (P)',
  storage:       'Add Storage (S)',
  agent:         'Add Agent (A)',
  'human-agent': 'Add Human Agent (U)',
  queue:         'Add Queue (Q)',
}

interface ToolGroup {
  label: string
  shortLabel: string  // 2-3 char abbreviation shown on collapsed header
  tools: Tool[]
  defaultOpen: boolean
}

const TOOL_GROUPS: ToolGroup[] = [
  {
    label: 'Navigation',
    shortLabel: 'Nav',
    tools: ['select', 'pan'],
    defaultOpen: true,
  },
  {
    label: 'UML Class Diagram',
    shortLabel: 'UML',
    tools: ['class', 'package'],
    defaultOpen: false,
  },
  {
    label: 'TAM Block Diagram',
    shortLabel: 'TAM',
    tools: ['agent', 'human-agent', 'storage', 'queue'],
    defaultOpen: false,
  },
]

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
        btn.innerHTML = ICONS[tool]
        btn.title = TOOL_LABELS[tool]
        if (tool === this.current) btn.classList.add('active')
        btn.addEventListener('click', () => this.setTool(tool))
        body.appendChild(btn)
        this.buttons.set(tool, btn)
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
      dot.title = f.id
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

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'v' || e.key === 'V') this.setTool('select')
      if (e.key === 'h' || e.key === 'H') this.setTool('pan')
      if (e.key === 'c' || e.key === 'C') this.setTool('class')
      if (e.key === 'p' || e.key === 'P') this.setTool('package')
      if (e.key === 's' || e.key === 'S') this.setTool('storage')
      if (e.key === 'a' || e.key === 'A') this.setTool('agent')
      if (e.key === 'u' || e.key === 'U') this.setTool('human-agent')
      if (e.key === 'q' || e.key === 'Q') this.setTool('queue')
    })
  }
}
