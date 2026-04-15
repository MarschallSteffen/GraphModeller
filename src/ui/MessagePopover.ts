import type { SequenceMessage } from '../entities/SequenceLifeline.ts'

interface LifelineRef { id: string; name: string }

export function showMsgPopover(
  screenX: number,
  screenY: number,
  msg: SequenceMessage,
  lifelines: LifelineRef[],       // all lifelines except the source
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

  const targetOptions = [
    `<option value=""${!msg.targetLifelineId ? ' selected' : ''}>(none)</option>`,
    ...lifelines.map(ll =>
      `<option value="${ll.id}"${msg.targetLifelineId === ll.id ? ' selected' : ''}>${ll.name}</option>`
    ),
  ].join('')

  const popover = document.createElement('div')
  popover.id = 'msg-popover'
  popover.classList.add('popover', 'conn-popover')
  popover.style.left = `${screenX}px`
  popover.style.top  = `${screenY}px`
  popover.innerHTML = `
    <div class="conn-type-row">${kindButtons}</div>
    <div class="popover-row">
      <label>Target</label>
      <select id="mp-target">${targetOptions}</select>
    </div>
    <div class="popover-row">
      <button class="msg-delete-btn" title="Remove this message" style="width:100%;background:none;border:1px solid var(--ctp-red);color:var(--ctp-red);border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer;">Remove message</button>
    </div>
  `

  layer.appendChild(popover)

  // Kind buttons
  popover.querySelectorAll<HTMLButtonElement>('.msg-kind-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      popover.querySelectorAll('.msg-kind-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      onChange({ kind: btn.dataset.kind as SequenceMessage['kind'] })
    })
  })

  // Target lifeline
  popover.querySelector<HTMLSelectElement>('#mp-target')!.addEventListener('change', (e) => {
    const val = (e.target as HTMLSelectElement).value
    onChange({ targetLifelineId: val || null })
  })

  // Delete
  popover.querySelector('.msg-delete-btn')!.addEventListener('click', () => {
    onDelete()
    dismiss()
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
