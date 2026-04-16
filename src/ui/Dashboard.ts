export interface RecentFile {
  id: string
  name: string
  filename: string | null  // local filesystem filename, if known
  timestamp: number
  data: string             // serialized v2 JSON (fallback)
}

export interface DashboardCallbacks {
  onNew:    () => void
  onOpen:   () => void
  onResume: (file: RecentFile, diagram: import('../entities/Diagram.ts').Diagram, handle: FileSystemFileHandle | null) => void
}

export class Dashboard {
  readonly el: HTMLElement
  private listEl: HTMLElement
  private callbacks: DashboardCallbacks

  constructor(callbacks: DashboardCallbacks) {
    this.callbacks = callbacks
    this.el = document.createElement('div')
    this.el.className = 'dashboard'

    // ── Logo / wordmark ────────────────────────────────────────────────
    const header = document.createElement('div')
    header.className = 'dashboard-header'
    header.innerHTML = `
      <svg class="dashboard-logo" width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="2" width="14" height="14" rx="3" fill="var(--ctp-lavender)" opacity="0.9"/>
        <rect x="20" y="2" width="14" height="14" rx="3" fill="var(--ctp-mauve)" opacity="0.7"/>
        <rect x="2" y="20" width="14" height="14" rx="3" fill="var(--ctp-blue)" opacity="0.7"/>
        <rect x="20" y="20" width="14" height="14" rx="3" fill="var(--ctp-sapphire)" opacity="0.5"/>
      </svg>
      <h1 class="dashboard-title">Archetype</h1>
    `

    // ── Action row ─────────────────────────────────────────────────────
    const actions = document.createElement('div')
    actions.className = 'dashboard-actions'

    const newBtn = this.makeActionCard(
      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
      'New diagram',
      'Start from scratch',
      callbacks.onNew,
    )

    const openBtn = this.makeActionCard(
      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
      'Open file…',
      'Load a .json diagram file',
      callbacks.onOpen,
    )

    const sampleBtn = this.makeActionCard(
      `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
      'App Architecture',
      'Sample — all diagram types',
      () => this.loadSample(callbacks.onResume),
    )

    actions.append(newBtn, openBtn, sampleBtn)

    // ── Recent files ───────────────────────────────────────────────────
    const recentSection = document.createElement('div')
    recentSection.className = 'dashboard-section'

    const recentLabel = document.createElement('h2')
    recentLabel.className = 'dashboard-section-label'
    recentLabel.textContent = 'Recent'

    this.listEl = document.createElement('div')
    this.listEl.className = 'dashboard-recent-list'

    recentSection.append(recentLabel, this.listEl)

    this.el.append(header, actions, recentSection)
  }

  /** Re-render the recent files list from localStorage. */
  refresh() {
    const files = getRecentFiles()
    this.listEl.innerHTML = ''

    if (files.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'dashboard-empty'
      empty.textContent = 'No recently opened files yet.'
      this.listEl.appendChild(empty)
      return
    }

    for (const file of files) {
      const row = document.createElement('button')
      row.className = 'dashboard-recent-item'
      const ago = formatRelativeTime(file.timestamp)
      const sub = file.filename ? `<span class="dashboard-recent-filename">${escHtml(file.filename)}</span>` : ''
      row.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M2 14V2h8l4 4v8H2z"/><path d="M10 2v4h4"/><path d="M5 10h6M5 12h4"/>
        </svg>
        <span class="dashboard-recent-info">
          <span class="dashboard-recent-name">${escHtml(file.name)}</span>
          ${sub}
        </span>
        <span class="dashboard-recent-time">${ago}</span>
        <button class="dashboard-recent-remove" title="Remove from recent" data-id="${escHtml(file.id)}">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
          </svg>
        </button>
      `
      row.querySelector('.dashboard-recent-remove')!.addEventListener('click', e => {
        e.stopPropagation()
        removeRecentFile(file.id)
        this.refresh()
      })
      row.addEventListener('click', () => this.resumeFile(file))
      this.listEl.appendChild(row)
    }
  }

  private async resumeFile(file: RecentFile) {
    // Try to reuse the stored FileSystemFileHandle (no full open dialog).
    if ('showOpenFilePicker' in window && _handleStore) {
      try {
        const handle = await _handleStore.loadHandle(file.id)
        if (handle) {
          // Check / request permission — may show a small browser prompt, not a picker.
          let perm = await (handle as any).queryPermission({ mode: 'readwrite' })
          if (perm === 'prompt') {
            perm = await (handle as any).requestPermission({ mode: 'readwrite' })
          }
          if (perm === 'granted') {
            const text = await handle.getFile().then((f: File) => f.text())
            const parsed = JSON.parse(text)
            const { deserializeV2 } = _persistence!
            const diagram = deserializeV2(parsed)
            const updated: RecentFile = {
              ...file,
              name: diagram.name || file.name,
              filename: handle.name,
              timestamp: Date.now(),
              data: text,
            }
            addRecentFile(updated)
            this.callbacks.onResume(updated, diagram, handle)
            return
          }
        }
      } catch { /* fall through to JSON restore */ }
    }
    // Fallback: restore from stored JSON snapshot.
    try {
      const parsed = JSON.parse(file.data)
      const { deserializeV2 } = _persistence!
      const diagram = deserializeV2(parsed)
      const updated: RecentFile = { ...file, name: diagram.name || file.name, timestamp: Date.now() }
      addRecentFile(updated)
      this.callbacks.onResume(updated, diagram, null)
    } catch { /* corrupt entry — ignore */ }
  }

  private makeActionCard(icon: string, label: string, sub: string, action: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'dashboard-action-card'
    btn.innerHTML = `
      <div class="dashboard-action-icon">${icon}</div>
      <div class="dashboard-action-text">
        <span class="dashboard-action-label">${label}</span>
        <span class="dashboard-action-sub">${sub}</span>
      </div>
    `
    btn.addEventListener('click', action)
    return btn
  }

  private async loadSample(onResume: DashboardCallbacks['onResume']) {
    try {
      const resp = await fetch('./examples/app-architecture.json')
      const data = await resp.text()
      const parsed = JSON.parse(data)
      const { deserializeV2 } = _persistence!
      const diagram = deserializeV2(parsed)
      const file: RecentFile = {
        id: 'sample-app-architecture',
        name: diagram.name || 'Archetype — App Architecture',
        filename: null,
        timestamp: Date.now(),
        data,
      }
      onResume(file, diagram, null)
    } catch (e) {
      console.error('Failed to load sample', e)
    }
  }
}

// ─── Persistence helpers ─────────────────────────────────────────────────────

// Lazy import reference injected from main.ts to avoid circular deps
let _persistence: { deserializeV2: (raw: Record<string, unknown>) => import('../entities/Diagram.ts').Diagram } | null = null
export function injectPersistence(p: typeof _persistence) { _persistence = p }

let _handleStore: { loadHandle: (id: string) => Promise<FileSystemFileHandle | null> } | null = null
export function injectHandleStore(s: typeof _handleStore) { _handleStore = s }

const LS_RECENT = 'archetype:recent-files'
const MAX_RECENT = 10

export function getRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(LS_RECENT)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr as RecentFile[]
  } catch { return [] }
}

export function addRecentFile(file: RecentFile) {
  const existing = getRecentFiles().filter(f => f.id !== file.id)
  const updated = [file, ...existing].slice(0, MAX_RECENT)
  localStorage.setItem(LS_RECENT, JSON.stringify(updated))
}

export function removeRecentFile(id: string) {
  const updated = getRecentFiles().filter(f => f.id !== id)
  localStorage.setItem(LS_RECENT, JSON.stringify(updated))
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7)  return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}
