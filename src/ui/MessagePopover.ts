import type { SequenceMessage } from '../entities/SequenceLifeline.ts'
import { svgIcon as S } from './svgIcon.ts'
import { createPopover } from './popover.ts'

let currentDismiss: (() => void) | null = null

export function hideMsgPopover() {
  currentDismiss?.()
  currentDismiss = null
}

export function showMsgPopover(
  screenX: number,
  screenY: number,
  msg: SequenceMessage,
  _lifelines: { id: string; name: string }[],
  onChange: (patch: Partial<SequenceMessage>) => void,
  onDelete: () => void,
  onDismiss: () => void,
) {
  hideMsgPopover()

  const KINDS: Array<{ kind: SequenceMessage['kind']; label: string; icon: string }> = [
    { kind: 'sync',   label: 'Synchronous',  icon: S('<line x1="1" y1="8" x2="13" y2="8"/><polygon points="10,5 13,8 10,11" fill="currentColor"/>') },
    { kind: 'async',  label: 'Asynchronous', icon: S('<line x1="1" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/>') },
    { kind: 'create', label: 'Create',       icon: S('<line x1="1" y1="8" x2="13" y2="8" stroke-dasharray="2 2"/><path d="M10 5l3 3-3 3"/>') },
    { kind: 'return', label: 'Return',       icon: S('<line x1="3" y1="8" x2="15" y2="8" stroke-dasharray="2 2"/><path d="M6 5l-3 3 3 3"/>') },
    { kind: 'self',   label: 'Self call',    icon: S('<polyline points="4,5 10,5 10,11 4,11"/><path d="M7 8.5l-3 2.5"/><path d="M7 13.5l-3-2.5"/>') },
  ]

  const kindButtons = KINDS.map(k => `
    <button class="conn-type-btn msg-kind-btn${msg.kind === k.kind ? ' active' : ''}"
            data-kind="${k.kind}" title="${k.label}" aria-label="${k.label}">${k.icon}</button>
  `).join('')

  const { el: popover, dismiss } = createPopover(
    'msg-popover',
    ['conn-popover'],
    screenX,
    screenY,
    onDismiss,
    [
      {
        key: 'Delete',
        guard: e => (e.target as HTMLElement).tagName === 'INPUT',
        callback: e => { e.preventDefault(); onDelete() },
      },
      {
        key: 'Backspace',
        guard: e => (e.target as HTMLElement).tagName === 'INPUT',
        callback: e => { e.preventDefault(); onDelete() },
      },
    ],
  )
  currentDismiss = dismiss

  popover.innerHTML = `<div class="popover-section-label">Kind</div><div class="conn-type-row">${kindButtons}</div>`

  // Kind buttons
  popover.querySelectorAll<HTMLButtonElement>('.msg-kind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      popover.querySelectorAll('.msg-kind-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      onChange({ kind: btn.dataset.kind as SequenceMessage['kind'] })
    })
  })

  return dismiss
}
