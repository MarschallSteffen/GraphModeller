/**
 * Shared popover creation helper.
 *
 * Creates a positioned `<div>` element, appends it to the `#popover-layer`,
 * and wires up the standard outside-click and Escape-key dismiss behaviour.
 *
 * @param id          HTML id for the element (used for deduplication / removal)
 * @param cssClasses  CSS class names to apply (in addition to `popover`)
 * @param x           Left position in screen pixels
 * @param y           Top position in screen pixels
 * @param onDismiss   Optional callback invoked when the popover dismisses
 * @param extraKeys   Additional keys (besides `'Escape'`) that trigger dismiss.
 *                    `guard` returning true skips dismissal; `callback` fires before dismiss.
 *
 * @returns `{ el, dismiss }` — the created element and a `dismiss()` function.
 */

export interface ExtraKeyDef {
  key: string
  /** Return true to *skip* dismissal (e.g. when focus is inside an <input>) */
  guard?: (e: KeyboardEvent) => boolean
  /** Called (before dismiss) when the key fires and guard passes */
  callback?: (e: KeyboardEvent) => void
}

export function createPopover(
  id: string,
  cssClasses: string[],
  x: number,
  y: number,
  onDismiss?: () => void,
  extraKeys?: ExtraKeyDef[],
): { el: HTMLElement; dismiss: () => void } {
  const layer = document.getElementById('popover-layer')!

  const el = document.createElement('div')
  el.id = id
  el.classList.add('popover', ...cssClasses)
  el.style.left = `${x}px`
  el.style.top  = `${y}px`

  layer.appendChild(el)

  const dismiss = () => {
    el.remove()
    onDismiss?.()
    document.removeEventListener('mousedown', onOutside)
    document.removeEventListener('keydown', onKey)
  }

  const onOutside = (e: MouseEvent) => {
    if (!el.contains(e.target as Node)) dismiss()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dismiss()
      return
    }
    if (extraKeys) {
      for (const def of extraKeys) {
        if (e.key !== def.key) continue
        if (def.guard?.(e)) continue
        def.callback?.(e)
        dismiss()
        return
      }
    }
  }

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKey)
  }, 150)

  return { el, dismiss }
}
