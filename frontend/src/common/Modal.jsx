import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

/** 대화 상자: Esc·배경 클릭으로 닫고, 열릴 때 첫 입력 요소로 포커스를 옮기며 닫히면 원래 위치로 돌려준다 */
export function Modal({ open, onClose, title, children, labelledBy, className, closeDisabled = false }) {
  const panelRef = useRef(null)
  const autoId = useId()
  const titleId = labelledBy ?? `${autoId}-title`

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    const panel = panelRef.current
    const focusable = panel?.querySelector('input, textarea, select, button:not([disabled]), [href]')
    focusable?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !closeDisabled) onClose()
      if (event.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll('input, textarea, select, button:not([disabled]), [href]')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('has-modal')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('has-modal')
      previous?.focus?.()
    }
  }, [open, onClose, closeDisabled])

  if (!open) return null
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <div ref={panelRef} className={className ? `modal ${className}` : 'modal'} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {title ? (
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  )
}
