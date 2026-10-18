import { lazy, Suspense, useEffect, useRef } from 'react'
import { LoadingState } from './common/StateView.jsx'
import { ToastProvider } from './common/ToastProvider.jsx'
import { I18nProvider } from './i18n/I18nProvider.jsx'
import { RouterProvider } from './lib/router.jsx'
import { matchPath, useRouter } from './lib/routerCore.js'
import { HomePage } from './pages/HomePage.jsx'
import { NotFoundPage } from './pages/NotFoundPage.jsx'
import { ProjectDetailPage } from './pages/ProjectDetailPage.jsx'
import { StudyDetailPage, StudyListPage } from './pages/StudyPages.jsx'
import { api } from './services/api.js'
import { ProfileProvider } from './site/ProfileProvider.jsx'
import { SiteLayout } from './site/SiteLayout.jsx'

// 관리자 화면은 방문자에게 필요 없으므로 따로 불러온다
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))

const MAX_VISIT_PATH = 200
const MAX_REFERRER = 2048

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 경로가 바뀌면 맨 위로, #해시가 있으면 해당 섹션으로 스크롤한다 */
function useScrollOnNavigate(location) {
  const previousPath = useRef(location.pathname)
  useEffect(() => {
    const pathChanged = previousPath.current !== location.pathname
    previousPath.current = location.pathname
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
      if (target) {
        target.scrollIntoView({ behavior: pathChanged || prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
        return
      }
    }
    if (pathChanged) window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location])
}

/** 공개 페이지 진입 시 POST /visits (응답과 관계없이 화면에는 영향 없음, 관리자 화면 제외) */
function useVisitTracking(pathname) {
  const firstVisit = useRef(true)
  useEffect(() => {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return
    if (pathname.length > MAX_VISIT_PATH) return
    const referrer = firstVisit.current && document.referrer ? document.referrer.slice(0, MAX_REFERRER) : undefined
    firstVisit.current = false
    api.recordVisit({ path: pathname, ...(referrer ? { referrer } : {}) }).catch(() => {})
  }, [pathname])
}

function PublicRoutes({ pathname }) {
  let page = <NotFoundPage />
  let params
  if (pathname === '/') page = <HomePage />
  else if ((params = matchPath('/projects/:slug', pathname))) page = <ProjectDetailPage key={params.slug} slug={params.slug} />
  else if (matchPath('/study', pathname)) page = <StudyListPage />
  else if ((params = matchPath('/study/:slug', pathname))) page = <StudyDetailPage key={params.slug} slug={params.slug} />

  return (
    <ProfileProvider>
      <SiteLayout>
        <div className="route-view" key={pathname}>
          {page}
        </div>
      </SiteLayout>
    </ProfileProvider>
  )
}

function AppRoutes() {
  const { location } = useRouter()
  useScrollOnNavigate(location)
  useVisitTracking(location.pathname)

  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
    return (
      <Suspense fallback={<LoadingState />}>
        <AdminApp />
      </Suspense>
    )
  }
  return <PublicRoutes pathname={location.pathname} />
}

export default function App() {
  return (
    <I18nProvider>
      <RouterProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </RouterProvider>
    </I18nProvider>
  )
}
