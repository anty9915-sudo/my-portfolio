/** ApiError를 상태 화면 문구로 바꾼다 (10 · SYSTEM STATES) */
export function describeError(error, t) {
  if (!error) return null
  if (error.code === 'NETWORK_ERROR') return { icon: 'wifi-off', title: t('state.networkTitle'), body: t('state.networkBody') }
  if (error.status === 429) return { icon: 'clock', title: t('state.rateTitle'), body: t('state.rateBody') }
  if (error.status === 401 || error.status === 403) {
    return { icon: 'shield-x', tone: 'lilac', title: t('state.forbiddenTitle'), body: t('state.forbiddenBody') }
  }
  if (error.status === 404) return { icon: 'compass', tone: 'sakura', title: t('state.notFoundTitle'), body: t('state.notFoundBody') }
  return { icon: 'server-crash', title: t('state.serverTitle'), body: t('state.serverBody') }
}

/** 폼 하단에 표시할 한 줄 오류 문구 */
export function errorMessage(error, t) {
  if (!error) return ''
  if (error.code === 'NETWORK_ERROR') return t('errors.network')
  if (error.status === 429) {
    return error.retryAfter ? t('errors.rateLimitedAfter', { seconds: error.retryAfter }) : t('errors.rateLimited')
  }
  if (error.status === 403) return t('errors.forbidden')
  if (error.status >= 500) return t('errors.server')
  return error.message || t('errors.validation')
}
