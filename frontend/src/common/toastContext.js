import { createContext, useContext } from 'react'

export const ToastContext = createContext(null)

/** toast({ tone: 'success' | 'error', title, body }) — 서버 응답을 확인한 뒤에만 호출한다 */
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
