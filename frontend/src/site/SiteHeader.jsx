import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { useI18n } from '../i18n/context.js'
import { Link } from '../lib/router.jsx'
import { useRouter } from '../lib/routerCore.js'
import { MobileMenu } from './MobileMenu.jsx'
import { brandName, useProfile } from './profileContext.js'
import { NAV_ITEMS } from './navItems.js'

export function LanguageSwitch({ className = 'lang-switch' }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div className={className} role="group" aria-label={t('nav.languageSwitch')}>
      {['ko', 'en'].map((code, index) => (
        <span key={code} className="lang-switch__item">
          {index > 0 ? <span className="lang-switch__sep" aria-hidden="true">/</span> : null}
          <button
            type="button"
            lang={code}
            className={lang === code ? 'lang-switch__btn is-active' : 'lang-switch__btn'}
            aria-pressed={lang === code}
            onClick={() => setLang(code)}
          >
            {t(`lang.${code}`)}
          </button>
        </span>
      ))}
    </div>
  )
}

export function BrandMark({ to = '/', sub = 'PORTFOLIO 2026' }) {
  const { profile } = useProfile()
  return (
    <Link to={to} className="brand">
      <Icon name="diamond" size={22} strokeWidth={1.5} className="brand__mark" />
      <span className="brand__text">
        <span className="brand__name">{brandName(profile)}</span>
        {sub ? <span className="brand__sub">{sub}</span> : null}
      </span>
    </Link>
  )
}

/** 홈에서는 화면에 보이는 섹션을, 다른 페이지에서는 경로를 기준으로 현재 메뉴를 정한다 */
function useActiveSection(pathname) {
  const [homeSection, setHomeSection] = useState('home')

  useEffect(() => {
    if (pathname !== '/') return undefined
    const sections = NAV_ITEMS.map((item) => document.getElementById(item.id)).filter(Boolean)
    const visible = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.intersectionRatio)
        const current = NAV_ITEMS.map((item) => item.id).reduce(
          (best, id) => ((visible.get(id) ?? 0) > (visible.get(best) ?? 0) ? id : best),
          'home',
        )
        setHomeSection(current)
      },
      { threshold: [0, 0.2, 0.4, 0.6], rootMargin: '-30% 0px -40% 0px' },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [pathname])

  if (pathname === '/') return homeSection
  if (pathname.startsWith('/projects')) return 'projects'
  if (pathname.startsWith('/study')) return 'study'
  return null
}

export function SiteHeader() {
  const { t } = useI18n()
  const { location } = useRouter()
  const active = useActiveSection(location.pathname)
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const progressRef = useRef(null)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0
      progressRef.current?.style.setProperty('--progress', String(ratio))
      setScrolled(window.scrollY > 8)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [location.pathname])

  return (
    <>
      <header className={scrolled ? 'site-header is-scrolled' : 'site-header'}>
        <span ref={progressRef} className="site-header__progress" aria-hidden="true" />
        <div className="site-header__inner">
          <BrandMark />
          <nav className="site-nav" aria-label={t('nav.main')}>
            <ol className="site-nav__list">
              {NAV_ITEMS.map((item, index) => (
                <li key={item.id}>
                  <Link
                    to={item.href}
                    className={active === item.id ? 'site-nav__link is-active' : 'site-nav__link'}
                    aria-current={active === item.id ? 'true' : undefined}
                  >
                    <span className="site-nav__num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="site-nav__label">{item.label}</span>
                    <span className="sr-only"> — {t(`nav.${item.id}`)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
          <div className="site-header__tools">
            <LanguageSwitch />
            <span className="site-header__divider" aria-hidden="true" />
            <Link to="/#contact" className="btn btn--accent btn--sm site-header__contact">
              <Icon name="mail" size={15} />
              <span>CONTACT</span>
            </Link>
            <button
              type="button"
              className="site-header__menu-btn"
              aria-label={t('nav.openMenu')}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" size={22} />
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={menuOpen} onClose={closeMenu} active={active} />
    </>
  )
}
