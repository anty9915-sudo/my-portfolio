/*
 * API 호출 계층 — docs/API.md v0.2 계약을 그대로 따른다.
 * 응답: { success, data, meta? } / 오류: { success: false, error: { code, message, details?, requestId } }
 * 화면은 실제 서버 응답만 표시한다. 응답이 없거나 실패하면 ApiError를 던진다.
 */

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '')

export class ApiError extends Error {
  constructor({ status, code, message, details = null, requestId = null, retryAfter = null }) {
    super(message || code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
    this.retryAfter = retryAfter
  }

  /** 검증 오류를 { field: reason } 형태로 바꾼다 */
  fieldErrors() {
    if (!Array.isArray(this.details)) return {}
    return Object.fromEntries(this.details.map(({ field, reason }) => [field, reason]))
  }
}

/*
 * 관리자 세션 만료 알림: 관리자 API가 401 UNAUTHENTICATED를 돌려주면 등록된 함수를 부른다.
 * (로그인·비밀번호 확인 실패의 401 INVALID_CREDENTIALS는 세션 만료가 아니므로 제외)
 */
let unauthorizedHandler = null

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
  return () => {
    if (unauthorizedHandler === handler) unauthorizedHandler = null
  }
}

function isAdminPath(path) {
  return path.startsWith('/admin') || path === '/auth/me' || path === '/auth/password'
}

function toQueryString(query) {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export async function request(path, { method = 'GET', query, body, signal, keepalive = false } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response
  try {
    response = await fetch(`${API_BASE}${path}${toQueryString(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
      keepalive,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    throw new ApiError({ status: 0, code: 'NETWORK_ERROR' })
  }

  if (response.status === 204) return { data: null, meta: null, status: 204 }

  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success !== true) {
    const error = payload?.error ?? {}
    if (response.status === 401 && error.code === 'UNAUTHENTICATED' && isAdminPath(path)) unauthorizedHandler?.()
    throw new ApiError({
      status: response.status,
      code: error.code ?? (response.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN_ERROR'),
      message: error.message,
      details: error.details ?? null,
      requestId: error.requestId ?? null,
      retryAfter: Number(response.headers.get('Retry-After')) || null,
    })
  }

  return { data: payload.data, meta: payload.meta ?? null, status: response.status }
}

const get = (path, query, options) => request(path, { ...options, query })
const send = (method) => (path, body, options) => request(path, { ...options, method, body })
const post = send('POST')
const put = send('PUT')
const patch = send('PATCH')
const del = (path, options) => request(path, { ...options, method: 'DELETE' })
const enc = encodeURIComponent

export const api = {
  health: (options) => get('/health', undefined, options),

  // 공개 API (API.md 8장)
  profile: (options) => get('/profile', undefined, options),
  projects: (query, options) => get('/projects', query, options),
  project: (slug, options) => get(`/projects/${enc(slug)}`, undefined, options),
  skills: (query, options) => get('/skills', query, options),
  studyRecords: (query, options) => get('/study-records', query, options),
  studyRecord: (slug, options) => get(`/study-records/${enc(slug)}`, undefined, options),
  formToken: (options) => get('/inquiries/form-token', undefined, options),
  sendInquiry: (body) => post('/inquiries', body),
  recordVisit: (body) => post('/visits', body, { keepalive: true }),

  // 인증 (API.md 9장)
  login: (body) => post('/auth/login', body),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: (options) => get('/auth/me', undefined, options),
  changePassword: (body) => patch('/auth/password', body),

  // 관리자 (API.md 10~12장)
  admin: {
    saveProfile: (body) => put('/admin/profile', body),

    projects: (query, options) => get('/admin/projects', query, options),
    project: (id, options) => get(`/admin/projects/${enc(id)}`, undefined, options),
    createProject: (body) => post('/admin/projects', body),
    updateProject: (id, body) => patch(`/admin/projects/${enc(id)}`, body),
    deleteProject: (id) => del(`/admin/projects/${enc(id)}`),

    skills: (query, options) => get('/admin/skills', query, options),
    skill: (id, options) => get(`/admin/skills/${enc(id)}`, undefined, options),
    createSkill: (body) => post('/admin/skills', body),
    updateSkill: (id, body) => patch(`/admin/skills/${enc(id)}`, body),
    deleteSkill: (id) => del(`/admin/skills/${enc(id)}`),

    studyRecords: (query, options) => get('/admin/study-records', query, options),
    studyRecord: (id, options) => get(`/admin/study-records/${enc(id)}`, undefined, options),
    createStudyRecord: (body) => post('/admin/study-records', body),
    updateStudyRecord: (id, body) => patch(`/admin/study-records/${enc(id)}`, body),
    deleteStudyRecord: (id) => del(`/admin/study-records/${enc(id)}`),

    inquiries: (query, options) => get('/admin/inquiries', query, options),
    inquiry: (id, options) => get(`/admin/inquiries/${enc(id)}`, undefined, options),
    updateInquiry: (id, body) => patch(`/admin/inquiries/${enc(id)}`, body),
    deleteInquiry: (id) => del(`/admin/inquiries/${enc(id)}`),

    visitStats: (query, options) => get('/admin/stats/visits', query, options),
  },
}
