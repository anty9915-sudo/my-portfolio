import { createContext, useContext, useMemo } from 'react'

/*
 * History API 기반의 작은 라우터 (컨텍스트·훅·경로 비교).
 * 화면 수가 적고 중첩 라우팅이 필요 없어 별도 라이브러리 없이 구현한다.
 */

export const RouterContext = createContext(null)

export function readLocation() {
  const { pathname, search, hash } = window.location
  return { pathname, search, hash }
}

export function useRouter() {
  const context = useContext(RouterContext)
  if (!context) throw new Error('useRouter must be used inside RouterProvider')
  return context
}

export function useSearchParams() {
  const { location } = useRouter()
  return useMemo(() => new URLSearchParams(location.search), [location.search])
}

/** '/projects/:slug' 형태의 패턴과 경로를 비교해 파라미터를 돌려준다. 일치하지 않으면 null. */
export function matchPath(pattern, pathname) {
  const normalize = (value) => (value.length > 1 ? value.replace(/\/+$/, '') : value)
  const patternParts = normalize(pattern).split('/')
  const pathParts = normalize(pathname).split('/')
  if (patternParts.length !== pathParts.length) return null
  const params = {}
  for (let index = 0; index < patternParts.length; index += 1) {
    const part = patternParts[index]
    if (part.startsWith(':')) {
      try {
        params[part.slice(1)] = decodeURIComponent(pathParts[index])
      } catch {
        return null
      }
    } else if (part !== pathParts[index]) {
      return null
    }
  }
  return params
}
