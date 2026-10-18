import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 조회 API 상태 관리: loading → success | error.
 * deps(직렬화 가능한 값)가 바뀌면 이전 요청을 취소하고 다시 부른다. reload()로 다시 시도한다.
 * 마지막으로 끝난 요청의 키와 현재 키가 다르면 로딩 중으로 본다.
 *
 * @param {(signal: AbortSignal) => Promise<{ data: unknown, meta: unknown }>} fetcher
 * @param {unknown[]} deps
 * @param {{ enabled?: boolean }} [options]
 */
export function useApi(fetcher, deps, { enabled = true } = {}) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: null, status: 'idle', data: null, meta: null, error: null })
  const fetcherRef = useRef(fetcher)
  const key = JSON.stringify([...deps, attempt])

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    fetcherRef
      .current(controller.signal)
      .then(({ data, meta }) => {
        if (!controller.signal.aborted) setState({ key, status: 'success', data, meta, error: null })
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return
        // 이전 데이터는 남겨 두고 오류만 표시한다
        setState((previous) => ({ ...previous, key, status: 'error', error }))
      })
    return () => controller.abort()
  }, [key, enabled])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])
  const setData = useCallback((updater) => {
    setState((previous) => ({
      ...previous,
      data: typeof updater === 'function' ? updater(previous.data) : updater,
    }))
  }, [])

  const isLoading = enabled && state.key !== key
  const status = !enabled ? 'idle' : isLoading ? 'loading' : state.status
  return {
    status,
    data: state.data,
    meta: state.meta,
    error: isLoading ? null : state.error,
    isLoading,
    hasLoaded: state.key !== null,
    reload,
    setData,
  }
}
