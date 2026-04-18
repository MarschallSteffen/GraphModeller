/**
 * Floating properties panel shown when a single element is selected.
 * Exposes the "Multiple instances" toggle and, for queues, a flow-direction toggle.
 * Also exposes an "Accent color" picker row with 8 Catppuccin color swatches.
 * Positioned and dismissed consistently with Connection/Message popovers.
 */

const ACCENT_COLORS = [
  '--ctp-red',
  '--ctp-peach',
  '--ctp-yellow',
  '--ctp-green',
  '--ctp-teal',
  '--ctp-blue',
  '--ctp-lavender',
  '--ctp-mauve',
] as const

let currentPanel: HTMLElement | null = null
let currentOutsideHandler: ((e: MouseEvent) => void) | null = null
let pendingTimerId: ReturnType<typeof setTimeout> | null = null

export function showElementPropertiesPanel(
  screenX: number,
  screenY: number,
  multiInstance: boolean | undefined,
  onChange: (multiInstance: boolean) => void,
  flowReversed?: boolean,
  onFlowReversed?: (reversed: boolean) => void,
  accentColor?: string,
  onAccentColor?: (color: string | undefined) => void,
) {
  hideElementPropertiesPanel()

  const layer = document.getElementById('popover-layer')!

  const panel = document.createElement('div')
  panel.id = 'elem-props-panel'
  panel.classList.add('popover', 'elem-props-panel')
  panel.style.left = `${screenX}px`
  panel.style.top  = `${screenY}px`

  const multiRow = multiInstance !== undefined ? `
    <div class="popover-row">
      <label class="props-label">
        <input type="checkbox" id="ep-multi" ${multiInstance ? 'checked' : ''}/>
        Multiple instances
      </label>
    </div>
  ` : ''

  const flowRow = onFlowReversed != null ? `
    <div class="popover-row">
      <label class="props-label">
        <input type="checkbox" id="ep-flow-rev" ${flowReversed ? 'checked' : ''}/>
        Reverse flow arrow
      </label>
    </div>
  ` : ''

  panel.innerHTML = `
    ${multiRow}
    ${flowRow}
    <div class="popover-row accent-row">
      <span class="accent-label">Accent color</span>
      <div class="accent-swatches" id="ep-accent-swatches"></div>
    </div>
  `

  layer.appendChild(panel)
  currentPanel = panel

  if (multiInstance !== undefined) {
    panel.querySelector<HTMLInputElement>('#ep-multi')!.addEventListener('change', e => {
      onChange((e.target as HTMLInputElement).checked)
    })
  }

  if (onFlowReversed) {
    panel.querySelector<HTMLInputElement>('#ep-flow-rev')!.addEventListener('change', e => {
      onFlowReversed((e.target as HTMLInputElement).checked)
    })
  }

  // Build color swatches
  if (onAccentColor) {
    const swatchContainer = panel.querySelector<HTMLElement>('#ep-accent-swatches')!

    ACCENT_COLORS.forEach(color => {
      const btn = document.createElement('button')
      btn.classList.add('accent-swatch')
      if (accentColor === color) btn.classList.add('accent-swatch--active')
      btn.style.background = `var(${color})`
      btn.title = color.replace('--ctp-', '')
      btn.addEventListener('click', e => {
        e.stopPropagation()
        const isActive = btn.classList.contains('accent-swatch--active')
        swatchContainer.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('accent-swatch--active'))
        if (isActive) {
          onAccentColor(undefined)
        } else {
          btn.classList.add('accent-swatch--active')
          onAccentColor(color)
        }
      })
      swatchContainer.appendChild(btn)
    })

    // Clear button
    const clearBtn = document.createElement('button')
    clearBtn.classList.add('accent-swatch', 'accent-swatch--clear')
    if (!accentColor) clearBtn.classList.add('accent-swatch--active')
    clearBtn.title = 'None'
    clearBtn.textContent = '×'
    clearBtn.addEventListener('click', e => {
      e.stopPropagation()
      swatchContainer.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('accent-swatch--active'))
      clearBtn.classList.add('accent-swatch--active')
      onAccentColor(undefined)
    })
    swatchContainer.appendChild(clearBtn)
  }

  // Outside-click dismissal (same pattern as ConnectionPopover)
  const onOutside = (e: MouseEvent) => {
    if (!panel.contains(e.target as Node)) hideElementPropertiesPanel()
  }
  pendingTimerId = setTimeout(() => {
    pendingTimerId = null
    currentOutsideHandler = onOutside
    document.addEventListener('mousedown', onOutside)
  }, 150)
}

export function hideElementPropertiesPanel() {
  if (pendingTimerId !== null) {
    clearTimeout(pendingTimerId)
    pendingTimerId = null
  }
  if (currentOutsideHandler) {
    document.removeEventListener('mousedown', currentOutsideHandler)
    currentOutsideHandler = null
  }
  currentPanel?.remove()
  currentPanel = null
}
