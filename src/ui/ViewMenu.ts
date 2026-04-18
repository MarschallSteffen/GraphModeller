import { registerMenu, closeAllMenus } from './menuRegistry.ts'

export interface ViewMenuCallbacks {
  onToggleComments: (show: boolean) => void
  onToggleMinimap: (show: boolean) => void
}

export class ViewMenu {
  private dropdown: HTMLElement
  private menuBtn: HTMLButtonElement
  private commentsCheckmark: HTMLSpanElement
  private minimapCheckmark: HTMLSpanElement
  private showComments: boolean
  private showMinimap: boolean

  constructor(container: HTMLElement, callbacks: ViewMenuCallbacks, initialShowComments: boolean, initialShowMinimap: boolean) {
    this.showComments = initialShowComments
    this.showMinimap = initialShowMinimap

    const menuWrap = document.createElement('div')
    menuWrap.classList.add('titlebar-menu')

    this.menuBtn = document.createElement('button')
    this.menuBtn.classList.add('titlebar-menu-btn')
    this.menuBtn.textContent = 'View'
    this.menuBtn.addEventListener('click', e => {
      e.stopPropagation()
      closeAllMenus()
      this.toggleDropdown()
    })

    this.dropdown = document.createElement('div')
    this.dropdown.classList.add('titlebar-dropdown')

    const item = document.createElement('button')
    item.classList.add('titlebar-menu-item')

    this.commentsCheckmark = document.createElement('span')
    this.commentsCheckmark.classList.add('menu-checkmark')
    this.commentsCheckmark.textContent = '✓'
    this.commentsCheckmark.style.visibility = initialShowComments ? 'visible' : 'hidden'

    item.append(this.commentsCheckmark)
    item.append(document.createTextNode(' Show Comments'))
    item.addEventListener('click', () => {
      this.closeDropdown()
      this.showComments = !this.showComments
      this.commentsCheckmark.style.visibility = this.showComments ? 'visible' : 'hidden'
      callbacks.onToggleComments(this.showComments)
    })

    this.dropdown.appendChild(item)

    // ── Minimap toggle ──────────────────────────────────────────────────────
    const minimapItem = document.createElement('button')
    minimapItem.classList.add('titlebar-menu-item')

    this.minimapCheckmark = document.createElement('span')
    this.minimapCheckmark.classList.add('menu-checkmark')
    this.minimapCheckmark.textContent = '✓'
    this.minimapCheckmark.style.visibility = initialShowMinimap ? 'visible' : 'hidden'

    minimapItem.append(this.minimapCheckmark)
    minimapItem.append(document.createTextNode(' Show Minimap'))
    minimapItem.addEventListener('click', () => {
      this.closeDropdown()
      this.showMinimap = !this.showMinimap
      this.minimapCheckmark.style.visibility = this.showMinimap ? 'visible' : 'hidden'
      callbacks.onToggleMinimap(this.showMinimap)
    })

    this.dropdown.appendChild(minimapItem)

    menuWrap.append(this.menuBtn, this.dropdown)
    container.appendChild(menuWrap)

    document.addEventListener('click', () => this.closeDropdown())
    registerMenu(() => this.closeDropdown())
  }

  setCommentsVisible(show: boolean) {
    this.showComments = show
    this.commentsCheckmark.style.visibility = show ? 'visible' : 'hidden'
  }

  setMinimapVisible(show: boolean) {
    this.showMinimap = show
    this.minimapCheckmark.style.visibility = show ? 'visible' : 'hidden'
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
