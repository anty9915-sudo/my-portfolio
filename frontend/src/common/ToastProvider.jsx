import { useCallback, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon.jsx'
import { ToastContext } from './toastContext.js'

const TOAST_DURATION_MS = 4500

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const toast = useCallback(
    ({ tone = 'success', title, body }) => {
      nextId.current += 1
      const id = nextId.current
      setToasts((list) => [...list.slice(-2), { id, tone, title, body }])
      setTimeout(() => dismiss(id), TOAST_DURATION_MS)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast--${item.tone}`}>
            <Icon name={item.tone === 'error' ? 'alert' : 'check'} size={18} className="toast__icon" />
            <div className="toast__text">
              <p className="toast__title">{item.title}</p>
              {item.body ? <p className="toast__body">{item.body}</p> : null}
            </div>
            <button type="button" className="toast__close" onClick={() => dismiss(item.id)} aria-label="알림 닫기">
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
