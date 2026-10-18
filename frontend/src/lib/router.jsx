import { useCallback, useEffect, useMemo, useState } from 'react'
import { readLocation, RouterContext, useRouter } from './routerCore.js'

export function RouterProvider({ children }) {
  const [location, setLocation] = useState(readLocation)

  useEffect(() => {
    const onPopState = () => setLocation(readLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.href)
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href)
      return
    }
    const next = url.pathname + url.search + url.hash
    const current = window.location.pathname + window.location.search + window.location.hash
    if (next !== current) {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', next)
    }
    // 같은 주소여도 새 객체로 갱신해 해시 스크롤이 다시 동작하게 한다
    setLocation(readLocation())
  }, [])

  const value = useMemo(() => ({ location, navigate }), [location, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

function isModifiedEvent(event) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey || event.button !== 0
}

export function Link({ to, replace = false, onClick, target, children, ...rest }) {
  const { navigate } = useRouter()

  const handleClick = (event) => {
    onClick?.(event)
    if (event.defaultPrevented || isModifiedEvent(event) || (target && target !== '_self')) return
    event.preventDefault()
    navigate(to, { replace })
  }

  return (
    <a href={to} target={target} onClick={handleClick} {...rest}>
      {children}
    </a>
  )
}
