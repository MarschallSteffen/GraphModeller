import type { ConnectionType, Multiplicity, ElbowMode } from '../entities/Connection.ts'
import type { ElementConfig } from '../config/ElementConfig.ts'
import { svgIcon as S } from './svgIcon.ts'

const MULTIPLICITIES: Multiplicity[] = ['', '1', '0..1', '*', '1..*', '0..*']

// All connection type icons in display order
const ALL_TYPE_ICONS: Array<{ type: ConnectionType; icon: string; label: string }> = [
  { type: 'plain',             icon: S('<line x1="1" y1="8" x2="15" y2="8"/>'),                                                        label: 'Plain line' },
  { type: 'association',       icon: S('<line x1="1" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/>'),                                label: 'Association' },
  { type: 'dependency',        icon: S('<line x1="1" y1="8" x2="13" y2="8" stroke-dasharray="2 2"/><path d="M10 5l3 3-3 3"/>'),         label: 'Dependency' },
  { type: 'inheritance',       icon: S('<line x1="1" y1="8" x2="10" y2="8"/><polygon points="10,5 15,8 10,11" fill="none"/>'),           label: 'Inheritance' },
  { type: 'realization',       icon: S('<line x1="1" y1="8" x2="10" y2="8" stroke-dasharray="2 2"/><polygon points="10,5 15,8 10,11" fill="none"/>'), label: 'Realization' },
  { type: 'composition',       icon: S('<line x1="6" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/><polygon points="1,8 3.5,5.5 6,8 3.5,10.5" fill="currentColor"/>'), label: 'Composition' },
  { type: 'aggregation',       icon: S('<line x1="6" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/><polygon points="1,8 3.5,5.5 6,8 3.5,10.5" fill="none"/>'), label: 'Aggregation' },
  { type: 'request',           icon: S('<line x1="1" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/><circle cx="4" cy="8" r="2.5"/>'), label: 'Request' },
  { type: 'write',             icon: S('<line x1="1" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/>'),                                label: 'Single direction (flip to reverse)' },
  { type: 'read-write',        icon: S('<line x1="4" y1="8" x2="12" y2="8"/><path d="M10 5l3 3-3 3"/><path d="M6 5l-3 3 3 3"/>'),      label: 'Bidirectional' },
  { type: 'uc-association',    icon: S('<line x1="1" y1="8" x2="15" y2="8"/>'),                                                        label: 'Association' },
  { type: 'uc-extend',         icon: S('<line x1="1" y1="8" x2="13" y2="8" stroke-dasharray="2 2"/><path d="M10 5l3 3-3 3"/>'),         label: 'Extend' },
  { type: 'uc-include',        icon: S('<line x1="1" y1="8" x2="13" y2="8" stroke-dasharray="2 2"/><path d="M10 5l3 3-3 3"/>'),         label: 'Include' },
  { type: 'uc-specialization', icon: S('<line x1="1" y1="8" x2="10" y2="8"/><polygon points="10,5 15,8 10,11" fill="none"/>'),           label: 'Specialization' },
  { type: 'transition',        icon: S('<line x1="1" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/>'),                                label: 'Transition' },
]

/**
 * Compute the allowed connection types for a pair of elements.
 */
export function allowedConnectionTypes(
  srcConfig: ElementConfig | undefined,
  tgtConfig: ElementConfig | undefined,
): ConnectionType[] {
  const ALL_TYPES: ConnectionType[] = [
    'plain', 'association', 'composition', 'aggregation', 'inheritance', 'realization', 'dependency',
    'request', 'write', 'read-write',
    'uc-association', 'uc-extend', 'uc-include', 'uc-specialization',
    'transition',
  ]
  const srcAllowed = srcConfig?.connectionRule?.asSource ?? null
  const tgtAllowed = tgtConfig?.connectionRule?.asTarget ?? null

  // Union semantics: each side contributes the types it supports.
  // null = no restriction (all types). Explicit list = only those types.
  // Result = union of both sides' contributions, keeping ALL_TYPES order.
  if (srcAllowed === null && tgtAllowed === null) return ALL_TYPES
  if (srcAllowed === null) return ALL_TYPES.filter(t => tgtAllowed!.includes(t))
  if (tgtAllowed === null) return ALL_TYPES.filter(t => srcAllowed.includes(t))
  const union = new Set([...srcAllowed, ...tgtAllowed])
  return ALL_TYPES.filter(t => union.has(t))
}

/**
 * Pick the default connection type for a new connection between two elements.
 * Returns null if no connection types are allowed for this pair.
 * Source's preference wins over target's; both must be within the allowed set.
 */
export function defaultConnectionType(
  srcConfig: ElementConfig | undefined,
  tgtConfig: ElementConfig | undefined,
): ConnectionType | null {
  const allowed = allowedConnectionTypes(srcConfig, tgtConfig)
  if (allowed.length === 0) return null
  const preferred = srcConfig?.preferredConnectionType ?? tgtConfig?.preferredConnectionType
  if (preferred && allowed.includes(preferred)) return preferred
  return allowed[0]
}

/**
 * Show the connection popover with icon-button type pickers.
 *
 * @param onConfirm  Called immediately on every change
 * @param onDismiss  Called when popover closes
 * @param onFlip     Called when user clicks the flip/reverse button (swap source ↔ target)
 * @param current    Current connection values for pre-selection
 */
export function showConnectionPopover(
  screenX: number,
  screenY: number,
  onConfirm: (type: ConnectionType, srcMult: string, tgtMult: string) => void,
  onDismiss: () => void,
  srcConfig?: ElementConfig,
  tgtConfig?: ElementConfig,
  onFlip?: () => void,
  current?: { type: ConnectionType; srcMult: string; tgtMult: string; elbowMode?: ElbowMode },
  onElbowChange?: (mode: ElbowMode) => void,
) {
  document.getElementById('conn-popover')?.remove()

  const layer = document.getElementById('popover-layer')!
  const types = allowedConnectionTypes(srcConfig, tgtConfig)
  const showMultiplicity =
    (srcConfig?.supportsMultiplicity ?? true) && (tgtConfig?.supportsMultiplicity ?? true) &&
    types.some(t => ['association', 'composition', 'aggregation', 'inheritance', 'realization', 'dependency'].includes(t))

  const activeType = current?.type ?? types[0] ?? 'association'

  const popover = document.createElement('div')
  popover.id = 'conn-popover'
  popover.classList.add('popover', 'conn-popover')
  popover.style.left = `${screenX}px`
  popover.style.top  = `${screenY}px`

  // Build type icon buttons from the allowed types in display order
  const available = ALL_TYPE_ICONS.filter(x => types.includes(x.type))
  const typeButtonsHtml = available.map(({ type, icon, label }) => `
    <button class="conn-type-btn${activeType === type ? ' active' : ''}" data-type="${type}" title="${label}" aria-label="${label}">${icon}</button>
  `).join('')

  // Flip button: shown only for directed connection types
  const showFlip = onFlip && activeType !== 'read-write' && activeType !== 'plain'
  const flipBtn = showFlip ? `<button class="conn-flip-btn" title="Flip / reverse arrow direction" aria-label="Flip / reverse arrow direction">${S('<path d="M4 5l-3 3 3 3"/><path d="M12 5l3 3-3 3"/><line x1="1" y1="8" x2="15" y2="8"/>')}</button>` : ''

  const multHtml = showMultiplicity ? `
    <div class="popover-section-label">Multiplicity</div>
    <div class="conn-mult-row">
      <select id="cp-src" class="conn-mult-sel" title="Source multiplicity">
        ${MULTIPLICITIES.map(m => `<option value="${m}"${(current?.srcMult ?? '') === m ? ' selected' : ''}>${m || '—'}</option>`).join('')}
      </select>
      <span class="conn-mult-sep">···</span>
      <select id="cp-tgt" class="conn-mult-sel" title="Target multiplicity">
        ${MULTIPLICITIES.map(m => `<option value="${m}"${(current?.tgtMult ?? '') === m ? ' selected' : ''}>${m || '—'}</option>`).join('')}
      </select>
    </div>
  ` : ''

  const activeElbow: ElbowMode = current?.elbowMode ?? 'auto'
  const elbowHtml = onElbowChange ? `
    <div class="popover-section-label">Routing</div>
    <div class="conn-elbow-row">
      <button class="conn-elbow-btn${activeElbow === 'auto' ? ' active' : ''}" data-elbow="auto" title="Auto route" aria-label="Auto route">${S('<circle cx="8" cy="8" r="2"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="8" y1="11" x2="8" y2="14"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="11" y1="8" x2="14" y2="8"/>')}</button>
      <button class="conn-elbow-btn${activeElbow === 'min'  ? ' active' : ''}" data-elbow="min"  title="Force lower-left corner" aria-label="Force lower-left corner">${S('<polyline points="4,2 4,12 14,12"/>')}</button>
      <button class="conn-elbow-btn${activeElbow === 'max'  ? ' active' : ''}" data-elbow="max"  title="Force upper-right corner" aria-label="Force upper-right corner">${S('<polyline points="2,4 12,4 12,14"/>')}</button>
    </div>
  ` : ''

  popover.innerHTML = `
    <div class="popover-section-label">Type</div>
    <div class="conn-type-row">
      ${typeButtonsHtml}
      ${flipBtn}
    </div>
    ${multHtml}
    ${elbowHtml}
  `

  layer.appendChild(popover)

  let currentType = activeType

  const getValues = () => ({
    type: currentType,
    src:  showMultiplicity ? (popover.querySelector<HTMLSelectElement>('#cp-src')?.value ?? '') : '',
    tgt:  showMultiplicity ? (popover.querySelector<HTMLSelectElement>('#cp-tgt')?.value ?? '') : '',
  })

  // Type button clicks
  popover.querySelectorAll<HTMLButtonElement>('.conn-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type as ConnectionType
      popover.querySelectorAll('.conn-type-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      // Show flip only for directed connection types
      const flipEl = popover.querySelector<HTMLButtonElement>('.conn-flip-btn')
      if (flipEl) flipEl.style.display = (currentType === 'read-write' || currentType === 'plain') ? 'none' : ''
      const { type, src, tgt } = getValues()
      onConfirm(type, src, tgt)
    })
  })

  // Flip button — keep popover open after flip
  popover.querySelector('.conn-flip-btn')?.addEventListener('click', () => {
    onFlip?.()
  })

  // Elbow mode buttons
  popover.querySelectorAll<HTMLButtonElement>('.conn-elbow-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.elbow as ElbowMode
      popover.querySelectorAll('.conn-elbow-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      onElbowChange?.(mode)
    })
  })

  // Multiplicity changes
  popover.addEventListener('change', () => {
    const { type, src, tgt } = getValues()
    onConfirm(type, src, tgt)
  })

  const dismiss = () => {
    popover.remove()
    onDismiss()
    document.removeEventListener('mousedown', onOutside)
    document.removeEventListener('keydown', onKey)
  }

  const onOutside = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node)) dismiss()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss()
  }

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
  }, 150)

  return dismiss
}
