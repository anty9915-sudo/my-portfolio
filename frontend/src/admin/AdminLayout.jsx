import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Link } from '../lib/router.jsx'
import { useRouter } from '../lib/routerCore.js'
import { useAdmin } from './adminContext.js'

const MENU = [
  { to: '/admin', label: '대시보드', icon: 'grid', exact: true },
  { to: '/admin/projects', label: '프로젝트', icon: 'folder' },
  { to: '/admin/skills', label: '기술 스택', icon: 'layers' },
  { to: '/admin/study', label: '학습 기록', icon: 'book' },
  { to: '/admin/inquiries', label: '문의', icon: 'mail', badge: true },
  { to: '/admin/stats', label: '통계', icon: 'chart' },
  { to: '/admin/settings', label: '프로필 · 계정', icon: 'settings' },
]

function isActive(item, pathname) {
  return item.exact ? pathname === item.to || pathname === `${item.to}/` : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function AdminLayout({ title, crumb, children }) {
  const { location } = useRouter()
  const { admin, logout, newInquiryCount } = useAdmin()
  const [menuOpen, setMenuOpen] = useState(false)
  const initial = admin?.email?.[0]?.toUpperCase() ?? 'A'

  return (
    <div className={menuOpen ? 'admin-shell is-menu-open' : 'admin-shell'}>
      <aside className="admin-sidebar" aria-label="관리자 메뉴">
        <div className="admin-sidebar__brand">
          <Icon name="diamond" size={22} strokeWidth={1.5} className="brand__mark" />
          <span>
            <span className="brand__name">PORTFOLIO</span>
            <span className="brand__sub">ADMIN CONSOLE</span>
          </span>
          <button type="button" className="admin-sidebar__close" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">
            <Icon name="x" size={20} />
          </button>
        </div>
        <p className="admin-sidebar__label">MENU</p>
        <nav>
          <ul className="admin-menu">
            {MENU.map((item) => {
              const active = isActive(item, location.pathname)
              return (
                <li key={item.to}>
                  <Link to={item.to} className={active ? 'admin-menu__link is-active' : 'admin-menu__link'} aria-current={active ? 'page' : undefined} onClick={() => setMenuOpen(false)}>
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                    {item.badge && newInquiryCount ? (
                      <span className="admin-menu__badge" aria-label={`새 문의 ${newInquiryCount}건`}>
                        {newInquiryCount > 99 ? '99+' : newInquiryCount}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="admin-sidebar__foot">
          <a className="admin-sidebar__site" href="/" target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={16} />
            사이트 보기
          </a>
          <div className="admin-user">
            <span className="admin-user__avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="admin-user__text">
              <span className="admin-user__name">관리자</span>
              <span className="admin-user__email">{admin?.email}</span>
            </span>
            <button type="button" className="admin-user__logout" onClick={logout} aria-label="로그아웃" title="로그아웃">
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <button type="button" className="admin-scrim" aria-label="메뉴 닫기" onClick={() => setMenuOpen(false)} tabIndex={-1} />

      <div className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="admin-topbar__menu" onClick={() => setMenuOpen(true)} aria-label="메뉴 열기">
            <Icon name="menu" size={20} />
          </button>
          <div className="admin-topbar__title">
            <p className="eyebrow">ADMIN / {crumb}</p>
            <p className="admin-topbar__page">{title}</p>
          </div>
          <div className="admin-topbar__user">
            <span className="admin-user__avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="admin-topbar__name">관리자</span>
          </div>
        </header>
        <main className="admin-content" id="main">
          {children}
        </main>
      </div>
    </div>
  )
}
