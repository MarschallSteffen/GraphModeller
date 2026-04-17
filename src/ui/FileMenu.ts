/**
 * FileMenu — title bar with a diagram title field and a File dropdown menu.
 *
 * Actions exposed:
 *   New        — resets the diagram (prompts for unsaved changes)
 *   Open       — loads a .json file via file picker
 *   Save       — opens a file handle (once) and writes; autosaves on every mutation
 *   Save As    — always opens the picker for a new file
 *   Export PNG — rasterises the SVG to a transparent-background PNG
 */

import { registerMenu, closeAllMenus } from './menuRegistry.ts'

export interface FileMenuCallbacks {
  onNew:            () => void
  onOpen:           () => void
  onSave:           () => void
  onSaveAs:         () => void
  onTitleChange:    (title: string) => void
}

export class FileMenu {
  private titleInput: HTMLInputElement
  private dropdown: HTMLElement
  private menuBtn: HTMLButtonElement
  private fileIndicator: HTMLSpanElement
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(container: HTMLElement, callbacks: FileMenuCallbacks) {
    container.innerHTML = ''

    // ── File menu ──────────────────────────────────────────────────────
    const menuWrap = document.createElement('div')
    menuWrap.classList.add('titlebar-menu')

    this.menuBtn = document.createElement('button')
    this.menuBtn.classList.add('titlebar-menu-btn')
    this.menuBtn.textContent = 'File'
    this.menuBtn.addEventListener('click', e => {
      e.stopPropagation()
      closeAllMenus()
      this.toggleDropdown()
    })

    this.dropdown = document.createElement('div')
    this.dropdown.classList.add('titlebar-dropdown')

    const items: Array<{ label: string; shortcut?: string; action: () => void } | 'separator'> = [
      { label: 'New diagram',   shortcut: '⌘N',   action: callbacks.onNew },
      { label: 'Open…',         shortcut: '⌘⇧O',  action: callbacks.onOpen },
      'separator',
      { label: 'Save',          shortcut: '⌘⇧S',  action: callbacks.onSave },
      { label: 'Save As…',      shortcut: '⌘⇧⌥S', action: callbacks.onSaveAs },
    ]

    for (const item of items) {
      if (item === 'separator') {
        const sep = document.createElement('div')
        sep.classList.add('titlebar-menu-separator')
        this.dropdown.appendChild(sep)
        continue
      }
      const btn = document.createElement('button')
      btn.classList.add('titlebar-menu-item')
      btn.innerHTML = `
        <span>${item.label}</span>
        ${item.shortcut ? `<span class="menu-shortcut">${item.shortcut}</span>` : ''}
      `
      btn.addEventListener('click', () => {
        this.closeDropdown()
        item.action()
      })
      this.dropdown.appendChild(btn)
    }

    menuWrap.append(this.menuBtn, this.dropdown)

    // ── Title ──────────────────────────────────────────────────────────
    const titleWrap = document.createElement('div')
    titleWrap.classList.add('titlebar-title')

    this.titleInput = document.createElement('input')
    this.titleInput.type = 'text'
    this.titleInput.classList.add('titlebar-title-input')
    this.titleInput.placeholder = 'Untitled diagram'
    this.titleInput.spellcheck = false
    this.titleInput.addEventListener('change', () => {
      callbacks.onTitleChange(this.titleInput.value.trim())
    })
    this.titleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === 'Escape') this.titleInput.blur()
    })

    // File indicator — shows the active filename when a file is open
    this.fileIndicator = document.createElement('span')
    this.fileIndicator.classList.add('titlebar-file-indicator')

    titleWrap.append(this.titleInput, this.fileIndicator)
    container.append(menuWrap, titleWrap)

    // Close dropdown on outside click
    document.addEventListener('click', () => this.closeDropdown())
    registerMenu(() => this.closeDropdown())
  }

  setTitle(title: string) {
    this.titleInput.value = title
  }

  getTitle(): string {
    return this.titleInput.value.trim() || 'diagram'
  }

  private _filename: string | null = null

  private get fileIconSvg(): string {
    return `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 14V2h8l4 4v8H2z"/><path d="M10 2v4h4"/><path d="M5 10h6M5 12h4"/></svg>`
  }
  private get spinnerSvg(): string {
    return `<svg class="save-spin" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 8A6 6 0 1 1 8 2"/><polyline points="8 1 11 4 8 7" fill="currentColor" stroke="none"/></svg>`
  }
  private get checkSvg(): string {
    return `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 9 6 13 14 4"/></svg>`
  }

  /** Show or hide the active file name indicator next to the title. */
  setFileIndicator(filename: string | null) {
    this._filename = filename
    if (filename) {
      this.fileIndicator.innerHTML = `${this.fileIconSvg} ${filename}`
      this.fileIndicator.style.display = ''
      this.fileIndicator.classList.remove('file-indicator--saving', 'file-indicator--saved', 'file-indicator--fadeout')
    } else {
      this.fileIndicator.innerHTML = ''
      this.fileIndicator.style.display = 'none'
    }
  }

  /** Cycle the file indicator icon: spinner → checkmark → file icon. */
  notifySaved() {
    if (!this._filename) return
    if (this.saveTimer) clearTimeout(this.saveTimer)

    // Phase 1: spinner
    this.fileIndicator.innerHTML = `${this.spinnerSvg} ${this._filename}`
    this.fileIndicator.classList.remove('file-indicator--saved', 'file-indicator--fadeout')
    this.fileIndicator.classList.add('file-indicator--saving')

    // Phase 2: checkmark
    this.saveTimer = setTimeout(() => {
      this.fileIndicator.innerHTML = `${this.checkSvg} ${this._filename}`
      this.fileIndicator.classList.remove('file-indicator--saving', 'file-indicator--fadeout')
      this.fileIndicator.classList.add('file-indicator--saved')

      // Phase 3: snap back to file icon
      this.saveTimer = setTimeout(() => {
        this.fileIndicator.innerHTML = `${this.fileIconSvg} ${this._filename}`
        this.fileIndicator.classList.remove('file-indicator--saving', 'file-indicator--saved')
      }, 1500)
    }, 400)
  }

  private get warnSvg(): string {
    return `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1.5 13h13L8 2z"/><line x1="8" y1="6" x2="8" y2="9"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/></svg>`
  }

  /** Show a persistent error state on the file indicator (autosave failed). */
  notifySaveError(detail: string) {
    if (!this._filename) return
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null }
    this.fileIndicator.innerHTML = `${this.warnSvg} ${this._filename}`
    this.fileIndicator.classList.remove('file-indicator--saving', 'file-indicator--saved', 'file-indicator--fadeout')
    this.fileIndicator.classList.add('file-indicator--error')
    this.fileIndicator.title = `Autosave failed — ${detail}\nChanges are still saved in-browser. Use File › Save to retry.`
  }

  /** Clear the error state after a successful write. */
  notifySaveRecovered() {
    if (!this._filename) return
    this.fileIndicator.classList.remove('file-indicator--error')
    this.fileIndicator.title = ''
    this.notifySaved()
  }

  private toggleDropdown() {
    const isOpen = this.dropdown.classList.contains('open')
    if (isOpen) {
      this.closeDropdown()
    } else {
      this.dropdown.classList.add('open')
      this.menuBtn.classList.add('open')
    }
  }

  private closeDropdown() {
    this.dropdown.classList.remove('open')
    this.menuBtn.classList.remove('open')
  }
}
