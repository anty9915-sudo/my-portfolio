import { useCallback, useEffect, useMemo, useState } from 'react'
import '../styles/admin.css'
import { Icon } from '../common/Icon.jsx'
import { Modal } from '../common/Modal.jsx'
import { LoadingState } from '../common/StateView.jsx'
import { Button } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { I18nContext, translate } from '../i18n/context.js'
import { matchPath, useRouter } from '../lib/routerCore.js'
import { api, setUnauthorizedHandler } from '../services/api.js'
import { AdminContext } from './adminContext.js'
import { AdminLayout } from './AdminLayout.jsx'
import { DashboardPage } from './DashboardPage.jsx'
import { InquiriesPage } from './InquiriesPage.jsx'
import { LoginPage } from './LoginPage.jsx'
import { ProjectEditPage } from './ProjectEditPage.jsx'
import { ProjectsPage } from './ProjectsPage.jsx'
import { SettingsPage } from './SettingsPage.jsx'
import { SkillsPage } from './SkillsPage.jsx'
import { StatsPage } from './StatsPage.jsx'
import { StudyEditPage, StudyPage } from './StudyPages.jsx'
import { AdminNotFound } from './parts.jsx'

// 관리자 화면은 한국어로 고정한다 (공용 상태 화면 문구도 한국어로 표시)
const KO_I18N = { lang: 'ko', setLang: () => {}, t: (key, vars) => translate('ko', key, vars) }

const ROUTES = [
  { path: '/admin', page: () => <DashboardPage />, title: '대시보드', crumb: 'DASHBOARD' },
  { path: '/admin/projects', page: () => <ProjectsPage />, title: '프로젝트 관리', crumb: 'PROJECTS' },
  { path: '/admin/projects/new', page: () => <ProjectEditPage key="new" />, title: '새 프로젝트', crumb: 'PROJECTS / NEW' },
  { path: '/admin/projects/:id', page: ({ id }) => <ProjectEditPage key={id} id={id} />, title: '프로젝트 수정', crumb: 'PROJECTS / EDIT' },
  { path: '/admin/skills', page: () => <SkillsPage />, title: '기술 스택 관리', crumb: 'SKILLS' },
  { path: '/admin/study', page: () => <StudyPage />, title: '학습 기록 관리', crumb: 'STUDY' },
  { path: '/admin/study/new', page: () => <StudyEditPage key="new" />, title: '새 학습 기록', crumb: 'STUDY / NEW' },
  { path: '/admin/study/:id', page: ({ id }) => <StudyEditPage key={id} id={id} />, title: '학습 기록 수정', crumb: 'STUDY / EDIT' },
  { path: '/admin/inquiries', page: () => <InquiriesPage />, title: '문의 관리', crumb: 'INQUIRIES' },
  { path: '/admin/stats', page: () => <StatsPage />, title: '방문 통계', crumb: 'STATS' },
  { path: '/admin/settings', page: () => <SettingsPage />, title: '프로필 · 계정', crumb: 'SETTINGS' },
]

function resolveRoute(pathname) {
  for (const route of ROUTES) {
    const params = matchPath(route.path, pathname)
    if (params) return { route, params }
  }
  return null
}

function SessionExpiredModal({ open, onLogin }) {
  return (
    <Modal open={open} onClose={onLogin} title="로그인이 만료되었습니다" closeDisabled>
      <div className="confirm">
        <span className="confirm__icon confirm__icon--amber">
          <Icon name="lock" size={20} />
        </span>
        <div>
          <p className="confirm__title">로그인이 만료되었습니다</p>
          <p className="confirm__body">보안을 위해 다시 로그인해 주세요. 저장하지 않은 변경사항은 반영되지 않았습니다.</p>
        </div>
      </div>
      <Button variant="amber" block onClick={onLogin}>
        다시 로그인
      </Button>
    </Modal>
  )
}

/** 로그인 확인(GET /auth/me) 후 관리자 화면을 보여 준다. 401이면 로그인 화면으로 보낸다. */
function AuthenticatedAdmin({ pathname }) {
  const { navigate } = useRouter()
  const me = useApi((signal) => api.me({ signal }), [])
  const [expired, setExpired] = useState(false)
  const [inquiryTick, setInquiryTick] = useState(0)
  const inquiryCount = useApi(
    (signal) => api.admin.inquiries({ status: 'new', limit: 1 }, { signal }),
    [inquiryTick],
    { enabled: me.status === 'success' },
  )

  useEffect(() => setUnauthorizedHandler(() => setExpired(true)), [])

  const goToLogin = useCallback(() => {
    const next = encodeURIComponent(window.location.pathname + window.location.search)
    navigate(`/admin/login?next=${next}`, { replace: true })
  }, [navigate])

  // 처음 확인에서 로그인 상태가 아니면 바로 로그인 화면으로 이동한다
  useEffect(() => {
    if (me.status === 'error' && me.error?.status === 401) goToLogin()
  }, [me.status, me.error, goToLogin])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      navigate('/admin/login', { replace: true })
    }
  }, [navigate])

  const refreshInquiryCount = useCallback(() => setInquiryTick((value) => value + 1), [])

  const value = useMemo(
    () => ({
      admin: me.data,
      logout,
      newInquiryCount: inquiryCount.meta?.totalItems ?? null,
      refreshInquiryCount,
    }),
    [me.data, logout, inquiryCount.meta, refreshInquiryCount],
  )

  if (me.status === 'error' && me.error?.status !== 401) {
    return (
      <div className="admin-gate">
        <LoadingState label="관리자 정보를 확인하지 못했습니다." compact />
        <Button variant="secondary" size="sm" onClick={me.reload} iconLeft="refresh">
          다시 시도
        </Button>
      </div>
    )
  }
  if (!me.data) {
    return (
      <div className="admin-gate">
        <LoadingState label="로그인 상태를 확인하는 중…" compact />
      </div>
    )
  }

  const resolved = resolveRoute(pathname)
  return (
    <AdminContext.Provider value={value}>
      <AdminLayout title={resolved?.route.title ?? '페이지 없음'} crumb={resolved?.route.crumb ?? 'NOT FOUND'}>
        <div className="route-view" key={pathname}>
          {resolved ? resolved.route.page(resolved.params) : <AdminNotFound />}
        </div>
      </AdminLayout>
      <SessionExpiredModal open={expired && Boolean(me.data)} onLogin={goToLogin} />
    </AdminContext.Provider>
  )
}

export default function AdminApp() {
  const { location } = useRouter()
  const isLogin = matchPath('/admin/login', location.pathname)

  useEffect(() => {
    document.title = '관리자 · Portfolio'
  }, [location.pathname])

  return (
    <I18nContext.Provider value={KO_I18N}>
      <div className="admin" lang="ko">
        {isLogin ? <LoginPage /> : <AuthenticatedAdmin pathname={location.pathname} />}
      </div>
    </I18nContext.Provider>
  )
}
