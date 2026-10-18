import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * "더 보기" 방식 목록: 1페이지부터 차례로 불러와 이어 붙인다.
 * deps(검색·필터)가 바뀌면 1페이지부터 다시 시작한다.
 *
 * @param {(page: number, signal: AbortSignal) => Promise<{ data: unknown[], meta: object }>} fetchPage
 * @param {unknown[]} deps 직렬화 가능한 값
 */
export function usePagedList(fetchPage, deps) {
  const key = JSON.stringify(deps)
  const fetchRef = useRef(fetchPage)
  const [pageRequest, setPageRequest] = useState({ key, page: 1 })
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState({ key: null, pages: {}, meta: null, error: null, errorPage: null })
  const page = pageRequest.key === key ? pageRequest.page : 1

  useEffect(() => {
    fetchRef.current = fetchPage
  })

  useEffect(() => {
    const controller = new AbortController()
    fetchRef
      .current(page, controller.signal)
      .then(({ data, meta }) => {
        if (controller.signal.aborted) return
        setResult((previous) => ({
          key,
          pages: { ...(previous.key === key ? previous.pages : {}), [page]: data },
          meta,
          error: null,
          errorPage: null,
        }))
      })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return
        setResult((previous) => ({
          key,
          pages: previous.key === key ? previous.pages : {},
          meta: previous.key === key ? previous.meta : null,
          error,
          errorPage: page,
        }))
      })
    return () => controller.abort()
  }, [key, page, attempt])

  const current = result.key === key ? result : { pages: {}, meta: null, error: null, errorPage: null }
  const items = Object.keys(current.pages)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((number) => current.pages[number])
  const failed = current.error && current.errorPage === page
  const isLoading = current.pages[page] === undefined && !failed

  const loadMore = useCallback(() => setPageRequest({ key, page: page + 1 }), [key, page])
  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  return {
    items,
    meta: current.meta,
    error: failed ? current.error : null,
    isLoading,
    isInitialLoading: isLoading && page === 1,
    hasLoaded: current.pages[1] !== undefined,
    hasNext: Boolean(current.meta?.hasNext) && !isLoading,
    loadMore,
    reload,
  }
}
