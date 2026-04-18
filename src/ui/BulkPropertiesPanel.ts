/**
 * Floating panels shown when 2+ elements or 2+ connections are selected.
 *
 * - showBulkElementPanel: shown when 2+ non-connection elements are selected
 * - showBulkConnectionPanel: shown when 2+ connections are selected
 */

import type { ConnectionType, Multiplicity } from '../entities/Connection.ts'
import { allowedConnectionTypes, ALL_TYPE_ICONS, MULTIPLICITIES } from './ConnectionPopover.ts'
import type { ElementConfig } from '../config/ElementConfig.ts'
import { createPopover } from './popover.ts'

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

// ── Bulk Element Panel ────────────────────────────────────────────────────────

let currentElementDismiss: (() => void) | null = null

export interface BulkElementItem {
  id: string
  multiInstance: boolean
  supportsProperties: boolean
  accentColor?: string
}

export function showBulkElementPanel(
  screenX: number,
  screenY: number,
  items: BulkElementItem[],
  onMultiInstanceChange: (val: boolean) => void,
  onAccentColorChange: (color: string | undefined) => void,
) {
  hideBulkElementPanel()

  // multiInstance row: only if ALL items support properties
  const allSupportProps = items.every(it => it.supportsProperties)
  const allTrue = items.every(it => it.multiInstance)
  const isIndeterminate = !allTrue && items.some(it => it.multiInstance)

  const multiRow = allSupportProps ? `
    <div class="popover-row">
      <label class="props-label">
        <input type="checkbox" id="bulk-ep-multi" ${allTrue ? 'checked' : ''}/>
        Multiple instances
      </label>
    </div>
  ` : ''

  // Accent color: active when all share the same color, otherwise no pre-selection
  const firstColor = items[0].accentColor
  const sharedColor = items.every(it => it.accentColor === firstColor) ? firstColor : undefined

  const { el: panel, dismiss } = createPopover('bulk-elem-panel', ['bulk-elem-panel'], screenX, screenY)
  currentElementDismiss = dismiss

  panel.innerHTML = `
    <div class="popover-section-label">Multiple selection (${items.length})</div>
    ${multiRow}
    <div class="popover-row accent-row">
      <span class="accent-label">Accent color</span>
      <div class="accent-swatches" id="bulk-ep-accent-swatches"></div>
    </div>
  `

  if (allSupportProps) {
    const checkbox = panel.querySelector<HTMLInputElement>('#bulk-ep-multi')!
    checkbox.indeterminate = isIndeterminate
    checkbox.addEventListener('change', e => {
      onMultiInstanceChange((e.target as HTMLInputElement).checked)
    })
  }

  // Build accent color swatches
  const swatchContainer = panel.querySelector<HTMLElement>('#bulk-ep-accent-swatches')!

  ACCENT_COLORS.forEach(color => {
    const btn = document.createElement('button')
    btn.classList.add('accent-swatch')
    if (sharedColor === color) btn.classList.add('accent-swatch--active')
    btn.style.background = `var(${color})`
    btn.title = color.replace('--ctp-', '')
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const isActive = btn.classList.contains('accent-swatch--active')
      swatchContainer.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('accent-swatch--active'))
      if (isActive) {
        clearBtn.classList.add('accent-swatch--active')
        onAccentColorChange(undefined)
      } else {
        btn.classList.add('accent-swatch--active')
        onAccentColorChange(color)
      }
    })
    swatchContainer.appendChild(btn)
  })

  const clearBtn = document.createElement('button')
  clearBtn.classList.add('accent-swatch', 'accent-swatch--clear')
  if (!sharedColor) clearBtn.classList.add('accent-swatch--active')
  clearBtn.title = 'None'
  clearBtn.textContent = '×'
  clearBtn.addEventListener('click', e => {
    e.stopPropagation()
    swatchContainer.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('accent-swatch--active'))
    clearBtn.classList.add('accent-swatch--active')
    onAccentColorChange(undefined)
  })
  swatchContainer.appendChild(clearBtn)
}

export function hideBulkElementPanel() {
  currentElementDismiss?.()
  currentElementDismiss = null
}

// ── Bulk Connection Panel ─────────────────────────────────────────────────────

let currentConnDismiss: (() => void) | null = null

export interface BulkConnectionItem {
  id: string
  type: ConnectionType
  sourceMultiplicity: Multiplicity
  targetMultiplicity: Multiplicity
  srcConfig: ElementConfig | undefined
  tgtConfig: ElementConfig | undefined
}

export function showBulkConnectionPanel(
  screenX: number,
  screenY: number,
  items: BulkConnectionItem[],
  onTypeChange: (type: ConnectionType) => void,
  onMultiplicityChange: (srcMult: Multiplicity, tgtMult: Multiplicity) => void,
) {
  hideBulkConnectionPanel()

  if (items.length === 0) return

  // Compute intersection of allowed types across all connections
  const intersectionSet = items.reduce<Set<ConnectionType>>((acc, it) => {
    const allowed = new Set(allowedConnectionTypes(it.srcConfig, it.tgtConfig))
    for (const t of acc) { if (!allowed.has(t)) acc.delete(t) }
    return acc
  }, new Set(allowedConnectionTypes(items[0].srcConfig, items[0].tgtConfig)))

  const intersectionTypes = ALL_TYPE_ICONS.filter(x => intersectionSet.has(x.type))

  // Pre-select type only when all connections share the same type
  const firstType = items[0].type
  const activeType: ConnectionType | null = items.every(it => it.type === firstType) ? firstType : null

  // Multiplicity: show only if ALL connections have both endpoints supporting multiplicity
  const allSupportMult = items.every(it =>
    (it.srcConfig?.supportsMultiplicity ?? true) && (it.tgtConfig?.supportsMultiplicity ?? true)
  )

  // Pre-select multiplicity only when all connections share the same value
  const firstSrcMult = items[0].sourceMultiplicity
  const firstTgtMult = items[0].targetMultiplicity
  const preSelSrcMult: Multiplicity = items.every(it => it.sourceMultiplicity === firstSrcMult) ? firstSrcMult : ''
  const preSelTgtMult: Multiplicity = items.every(it => it.targetMultiplicity === firstTgtMult) ? firstTgtMult : ''

  const { el: panel, dismiss } = createPopover(
    'bulk-conn-panel',
    ['conn-popover', 'bulk-conn-panel'],
    screenX,
    screenY,
  )
  currentConnDismiss = dismiss

  const typeButtonsHtml = intersectionTypes.map(({ type, icon, label }) => `
    <button class="conn-type-btn${activeType === type ? ' active' : ''}" data-type="${type}" title="${label}" aria-label="${label}">${icon}</button>
  `).join('')

  const multHtml = allSupportMult ? `
    <hr class="popover-section-separator"/>
    <div class="popover-section-label">Multiplicity</div>
    <div class="conn-mult-row">
      <select id="bulk-cp-src" class="conn-mult-sel" title="Source multiplicity">
        ${MULTIPLICITIES.map(m => `<option value="${m}"${preSelSrcMult === m ? ' selected' : ''}>${m || '—'}</option>`).join('')}
      </select>
      <span class="conn-mult-sep">···</span>
      <select id="bulk-cp-tgt" class="conn-mult-sel" title="Target multiplicity">
        ${MULTIPLICITIES.map(m => `<option value="${m}"${preSelTgtMult === m ? ' selected' : ''}>${m || '—'}</option>`).join('')}
      </select>
    </div>
  ` : ''

  panel.innerHTML = `
    <div class="popover-section-label">Type — ${items.length} connections</div>
    <div class="conn-type-row">
      ${typeButtonsHtml}
    </div>
    ${multHtml}
  `

  panel.querySelectorAll<HTMLButtonElement>('.conn-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type as ConnectionType
      panel.querySelectorAll('.conn-type-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      onTypeChange(type)
    })
  })

  if (allSupportMult) {
    panel.addEventListener('change', () => {
      const src = (panel.querySelector<HTMLSelectElement>('#bulk-cp-src')?.value ?? '') as Multiplicity
      const tgt = (panel.querySelector<HTMLSelectElement>('#bulk-cp-tgt')?.value ?? '') as Multiplicity
      onMultiplicityChange(src, tgt)
    })
  }
}

export function hideBulkConnectionPanel() {
  currentConnDismiss?.()
  currentConnDismiss = null
}

/** Hide all bulk panels. */
export function hideAllBulkPanels() {
  hideBulkElementPanel()
  hideBulkConnectionPanel()
}

