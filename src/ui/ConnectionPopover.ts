import type { ConnectionType, Multiplicity } from '../entities/Connection.ts'
import type { ElementConfig } from '../config/ElementConfig.ts'

const MULTIPLICITIES: Multiplicity[] = ['', '1', '0..1', '*', '1..*', '0..*']

// Icon labels and tooltips for each UML connection type
const UML_TYPE_ICONS: Array<{ type: ConnectionType; icon: string; label: string }> = [
  { type: 'association',  icon: '→',  label: 'Association'  },
  { type: 'dependency',   icon: '⤳',  label: 'Dependency'   },
  { type: 'inheritance',  icon: '▷→', label: 'Inheritance'  },
  { type: 'realization',  icon: '▷⤳', label: 'Realization'  },
  { type: 'composition',  icon: '◆→', label: 'Composition'  },
  { type: 'aggregation',  icon: '◇→', label: 'Aggregation'  },
]

// Storage data-flow icons
const STORAGE_TYPE_ICONS: Array<{ type: ConnectionType; icon: string; label: string }> = [
  { type: 'read',       icon: '←',  label: 'Read (storage → entity)'  },
  { type: 'write',      icon: '→',  label: 'Write (entity → storage)' },
  { type: 'read-write', icon: '↔',  label: 'Read + Write'             },
]

/**
 * Compute the allowed connection types for a pair of elements.
 */
export function allowedConnectionTypes(
  srcConfig: ElementConfig | undefined,
  tgtConfig: ElementConfig | undefined,
): ConnectionType[] {
  const isStorageInvolved = srcConfig?.type === 'storage' || tgtConfig?.type === 'storage'
  if (isStorageInvolved) return ['read', 'write', 'read-write']

  const isActorOrQueue = (cfg: ElementConfig | undefined) =>
    cfg?.type === 'agent' || cfg?.type === 'human-agent' || cfg?.type === 'queue'
  if (isActorOrQueue(srcConfig) || isActorOrQueue(tgtConfig)) return ['request']

  const ALL_TYPES: ConnectionType[] = [
    'association', 'composition', 'aggregation', 'inheritance', 'realization', 'dependency',
  ]
  const srcAllowed = srcConfig?.connectionRule?.asSource ?? null
  const tgtAllowed = tgtConfig?.connectionRule?.asTarget ?? null
  return ALL_TYPES.filter(t => {
    if (srcAllowed && !srcAllowed.includes(t)) return false
    if (tgtAllowed && !tgtAllowed.includes(t)) return false
    return true
  })
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
  current?: { type: ConnectionType; srcMult: string; tgtMult: string },
) {
  document.getElementById('conn-popover')?.remove()

  const layer = document.getElementById('popover-layer')!
  const types = allowedConnectionTypes(srcConfig, tgtConfig)
  const isStorage  = types.includes('read')
  const isRequest  = types.length === 1 && types[0] === 'request'
  const showMultiplicity =
    !isStorage && !isRequest &&
    (srcConfig?.supportsMultiplicity ?? true) && (tgtConfig?.supportsMultiplicity ?? true)

  const activeType = current?.type ?? types[0] ?? 'association'

  const popover = document.createElement('div')
  popover.id = 'conn-popover'
  popover.classList.add('popover', 'conn-popover')
  popover.style.left = `${screenX}px`
  popover.style.top  = `${screenY}px`

  // Build type icon buttons
  let typeButtonsHtml = ''
  if (isStorage) {
    typeButtonsHtml = STORAGE_TYPE_ICONS.map(({ type, icon, label }) => `
      <button class="conn-type-btn${activeType === type ? ' active' : ''}" data-type="${type}" title="${label}">${icon}</button>
    `).join('')
  } else if (isRequest) {
    // No type buttons — request is the only option
  } else {
    const available = UML_TYPE_ICONS.filter(x => types.includes(x.type))
    typeButtonsHtml = available.map(({ type, icon, label }) => `
      <button class="conn-type-btn${activeType === type ? ' active' : ''}" data-type="${type}" title="${label}">${icon}</button>
    `).join('')
  }

  const flipBtn = onFlip ? `<button class="conn-flip-btn" title="Flip / reverse arrow direction">⇄</button>` : ''

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

  popover.innerHTML = `
    <div class="conn-type-row">
      ${typeButtonsHtml}
      ${flipBtn}
    </div>
    ${multHtml}
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
      const { type, src, tgt } = getValues()
      onConfirm(type, src, tgt)
    })
  })

  // Flip button
  popover.querySelector('.conn-flip-btn')?.addEventListener('click', () => {
    onFlip?.()
    dismiss()
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
