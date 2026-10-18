import { createContext, useContext } from 'react'

/**
 * 공개 프로필(GET /profile). 404면 아직 등록되지 않은 상태(status: 'missing')로 본다.
 * @type {import('react').Context<{ status: 'loading' | 'ready' | 'missing' | 'error', profile: object | null, error: unknown, reload: () => void }>}
 */
export const ProfileContext = createContext(null)

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used inside ProfileProvider')
  return context
}

export function brandName(profile) {
  return profile?.name?.trim() || 'NICKNAME'
}

export function profileLink(profile, type) {
  return profile?.links?.find((link) => link.type === type) ?? null
}

/** 화면 표시용으로 https:// 를 뗀다 */
export function displayUrl(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}
