import type { ConnectionType, Multiplicity, ElbowMode } from '../entities/Connection.ts'
import type { ElementConfig } from '../config/ElementConfig.ts'

const MULTIPLICITIES: Multiplicity[] = ['', '1', '0..1', '*', '1..*', '0..*']

// All connection type icons in display order
const ALL_TYPE_ICONS: Array<{ type: ConnectionType; icon: string; label: string }> = [
  { type: 'plain',        icon: '—',  label: 'Plain line'                         },
  { type: 'association',  icon: '→',  label: 'Association'                        },
  { type: 'dependency',   icon: '⤳',  label: 'Dependency'                        },
  { type: 'inheritance',  icon: '▷→', label: 'Inheritance'                        },
  { type: 'realization',  icon: '▷⤳', label: 'Realization'                        },
  { type: 'composition',  icon: '◆→', label: 'Composition'                        },
  { type: 'aggregation',  icon: '◇→', label: 'Aggregation'                        },
  { type: 'request',      icon: 'R',  label: 'Request'                            },
  { type: 'write',        icon: '→',  label: 'Single direction (flip to reverse)' },
  { type: 'read-write',   icon: '⇄',  label: 'Bidirectional'                      },
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
    <button class="conn-type-btn${activeType === type ? ' active' : ''}" data-type="${type}" title="${label}">${icon}</button>
  `).join('')

  // Flip button: shown only for directed connection types
  const showFlip = onFlip && activeType !== 'read-write' && activeType !== 'plain'
  const flipBtn = showFlip ? `<button class="conn-flip-btn" title="Flip / reverse arrow direction">⇄</button>` : ''

  const multHtml = showMultiplicity ? `
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
    <div class="conn-elbow-row">
      <button class="conn-elbow-btn${activeElbow === 'auto' ? ' active' : ''}" data-elbow="auto" title="Auto route">⊹</button>
      <button class="conn-elbow-btn${activeElbow === 'min'  ? ' active' : ''}" data-elbow="min"  title="Force lower-left corner">⌞</button>
      <button class="conn-elbow-btn${activeElbow === 'max'  ? ' active' : ''}" data-elbow="max"  title="Force upper-right corner">⌝</button>
    </div>
  ` : ''

  popover.innerHTML = `
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
