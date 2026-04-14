/**
 * Floating properties panel shown when a single element is selected.
 * Currently exposes only the "Multiple instances" toggle.
 */

let currentPanel: HTMLElement | null = null

export function showElementPropertiesPanel(
  screenX: number,
  screenY: number,
  multiInstance: boolean,
  onChange: (multiInstance: boolean) => void,
) {
  hideElementPropertiesPanel()

  const layer = document.getElementById('popover-layer')!

  const panel = document.createElement('div')
  panel.id = 'elem-props-panel'
  panel.classList.add('popover', 'elem-props-panel')
  panel.style.left = `${screenX}px`
  panel.style.top  = `${screenY}px`

  panel.innerHTML = `
    <div class="popover-row">
      <label class="props-label">
        <input type="checkbox" id="ep-multi" ${multiInstance ? 'checked' : ''}/>
        Multiple instances
      </label>
    </div>
  `

  layer.appendChild(panel)
  currentPanel = panel

  panel.querySelector<HTMLInputElement>('#ep-multi')!.addEventListener('change', e => {
    onChange((e.target as HTMLInputElement).checked)
  })
}

export function hideElementPropertiesPanel() {
  currentPanel?.remove()
  currentPanel = null
}
