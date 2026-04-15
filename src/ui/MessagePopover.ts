import type { SequenceMessage } from '../entities/SequenceLifeline.ts'

export function showMsgPopover(
  screenX: number,
  screenY: number,
  msg: SequenceMessage,
  _lifelines: { id: string; name: string }[],
  onChange: (patch: Partial<SequenceMessage>) => void,
  onDelete: () => void,
  onDismiss: () => void,
) {
  document.getElementById('msg-popover')?.remove()

  const layer = document.getElementById('popover-layer')!

  const KINDS: Array<{ kind: SequenceMessage['kind']; label: string; icon: string }> = [
    { kind: 'sync',   label: 'Synchronous',   icon: '→'  },
    { kind: 'async',  label: 'Asynchronous',  icon: '⇢'  },
    { kind: 'create', label: 'Create',        icon: '⤳'  },
    { kind: 'return', label: 'Return',        icon: '↵'  },
    { kind: 'self',   label: 'Self call',     icon: '↩'  },
  ]

  const kindButtons = KINDS.map(k => `
    <button class="conn-type-btn msg-kind-btn${msg.kind === k.kind ? ' active' : ''}"
            data-kind="${k.kind}" title="${k.label}">${k.icon}</button>
  `).join('')

  const popover = document.createElement('div')
  popover.id = 'msg-popover'
  popover.classList.add('popover', 'conn-popover')
  popover.style.left = `${screenX}px`
  popover.style.top  = `${screenY}px`
  popover.innerHTML = `<div class="popover-section-label">Kind</div><div class="conn-type-row">${kindButtons}</div>`

  layer.appendChild(popover)

  // Kind buttons
  popover.querySelectorAll<HTMLButtonElement>('.msg-kind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      popover.querySelectorAll('.msg-kind-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      onChange({ kind: btn.dataset.kind as SequenceMessage['kind'] })
    })
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
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onDelete()
      dismiss()
    }
  }

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
  }, 150)

  return dismiss
}
