import { createContext, useContext } from 'react'
import { SKILL_CATEGORY_LABEL } from '../lib/content.js'

/**
 * 관리자 세션 상태.
 * @type {import('react').Context<{
 *   admin: { id: string, email: string, role: string, lastLoginAt: string | null } | null,
 *   logout: () => Promise<void>,
 *   newInquiryCount: number | null,
 *   refreshInquiryCount: () => void,
 * }>}
 */
export const AdminContext = createContext(null)

export function useAdmin() {
  const context = useContext(AdminContext)
  if (!context) throw new Error('useAdmin must be used inside AdminApp')
  return context
}

/** 관리자 화면 오류 문구 (한국어 고정) */
export function adminErrorMessage(error) {
  if (!error) return ''
  if (error.code === 'NETWORK_ERROR') return '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.'
  if (error.code === 'DUPLICATE_KEY') return '이미 사용 중인 값입니다. slug나 이름을 바꿔 주세요.'
  if (error.code === 'RESOURCE_IN_USE') return '다른 항목에서 사용 중이라 삭제할 수 없습니다.'
  if (error.code === 'UNAUTHENTICATED') return '로그인이 만료되었습니다. 다시 로그인해 주세요.'
  if (error.status === 403) return '요청이 거부되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.'
  if (error.status === 404) return '대상을 찾을 수 없습니다. 이미 삭제되었을 수 있습니다.'
  if (error.status === 413) return '내용이 너무 깁니다. 길이를 줄여 주세요.'
  if (error.status === 429) {
    return error.retryAfter ? `요청이 너무 많습니다. ${error.retryAfter}초 후 다시 시도해 주세요.` : '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (error.status >= 500) return '일시적인 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  return error.message || '요청을 처리하지 못했습니다.'
}

/** details의 field("highlights.0" 등)를 폼 필드 이름으로 모은다 */
export function fieldErrorsFrom(error) {
  if (!Array.isArray(error?.details)) return {}
  const result = {}
  for (const { field, reason } of error.details) {
    const key = String(field ?? '').split('.')[0] || '_form'
    if (!result[key]) result[key] = reason
  }
  return result
}

/** ReferencePicker용 기술 선택지 */
export function skillOptions(skills) {
  return (skills ?? []).map((skill) => ({ id: skill.id, label: `${skill.name} · ${SKILL_CATEGORY_LABEL[skill.category] ?? skill.category}` }))
}
