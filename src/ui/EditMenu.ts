export interface EditMenuCallbacks {
  onUndo:      () => void
  onRedo:      () => void
  onSelectAll: () => void
  onDelete:    () => void
}

export class EditMenu {
  private dropdown: HTMLElement
  private menuBtn: HTMLButtonElement
  private undoItem: HTMLButtonElement
  private redoItem: HTMLButtonElement

  constructor(container: HTMLElement, callbacks: EditMenuCallbacks) {
    const menuWrap = document.createElement('div')
    menuWrap.classList.add('titlebar-menu', 'titlebar-menu--edit')

    this.menuBtn = document.createElement('button')
    this.menuBtn.classList.add('titlebar-menu-btn')
    this.menuBtn.textContent = 'Edit'
    this.menuBtn.addEventListener('click', e => {
      e.stopPropagation()
      this.toggleDropdown()
    })

    this.dropdown = document.createElement('div')
    this.dropdown.classList.add('titlebar-dropdown')

    this.undoItem = this.makeItem('Undo', '⌘Z', () => { this.closeDropdown(); callbacks.onUndo() })
    this.redoItem = this.makeItem('Redo', '⌘Y', () => { this.closeDropdown(); callbacks.onRedo() })

    const sep = document.createElement('div')
    sep.classList.add('titlebar-menu-separator')

    const selectAll = this.makeItem('Select All', '⌘A', () => { this.closeDropdown(); callbacks.onSelectAll() })
    const del       = this.makeItem('Delete',     '⌫',  () => { this.closeDropdown(); callbacks.onDelete() })

    this.dropdown.append(this.undoItem, this.redoItem, sep, selectAll, del)
    menuWrap.append(this.menuBtn, this.dropdown)
    container.appendChild(menuWrap)

    document.addEventListener('click', () => this.closeDropdown())
  }

  /** Reflect current undo/redo availability in the menu items. */
  setHistoryState(canUndo: boolean, canRedo: boolean) {
    this.undoItem.disabled = !canUndo
    this.redoItem.disabled = !canRedo
  }

  private makeItem(label: string, shortcut: string, action: () => void): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.classList.add('titlebar-menu-item')
    btn.innerHTML = `<span>${label}</span><span class="menu-shortcut">${shortcut}</span>`
    btn.addEventListener('click', action)
    return btn
  }

  private toggleDropdown() {
    if (this.dropdown.classList.contains('open')) {
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
