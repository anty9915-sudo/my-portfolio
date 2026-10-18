import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../common/Icon.jsx'
import { useI18n } from '../i18n/context.js'
import { Link } from '../lib/router.jsx'
import { NAV_ITEMS } from './navItems.js'
import { brandName, profileLink, useProfile } from './profileContext.js'

/** 13 · 모바일 메뉴 오버레이: 전체 화면 메뉴 + 언어 전환 + 연락처 */
export function MobileMenu({ open, onClose, active }) {
  const { t, lang, setLang } = useI18n()
  const { profile } = useProfile()
  const closeRef = useRef(null)
  const github = profileLink(profile, 'github')

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement
    closeRef.current?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('has-modal')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('has-modal')
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div id="mobile-menu" className="mobile-menu" role="dialog" aria-modal="true" aria-label={t('nav.main')}>
      <div className="mobile-menu__top">
        <span className="brand">
          <Icon name="diamond" size={22} strokeWidth={1.5} className="brand__mark" />
          <span className="brand__name">{brandName(profile)}</span>
        </span>
        <button ref={closeRef} type="button" className="mobile-menu__close" onClick={onClose} aria-label={t('nav.closeMenu')}>
          <Icon name="x" size={22} />
        </button>
      </div>

      <nav aria-label={t('nav.main')}>
        <ol className="mobile-menu__list">
          {NAV_ITEMS.map((item, index) => (
            <li key={item.id} style={{ '--reveal-index': index }}>
              <Link
                to={item.href}
                onClick={onClose}
                className={active === item.id ? 'mobile-menu__link is-active' : 'mobile-menu__link'}
                aria-current={active === item.id ? 'true' : undefined}
              >
                <span className="mobile-menu__num">{String(index + 1).padStart(2, '0')}</span>
                <span className="mobile-menu__labels">
                  <span className="mobile-menu__label">{item.label}</span>
                  {lang === 'ko' ? <span className="mobile-menu__sub">{t(`nav.${item.id}`)}</span> : null}
                </span>
                <Icon name="arrow-right" size={20} className="mobile-menu__arrow" />
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mobile-menu__lang">
        <p className="eyebrow">{t('nav.language')}</p>
        <div className="mobile-menu__lang-row">
          {['ko', 'en'].map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={lang === code}
              className={lang === code ? 'mobile-menu__lang-btn is-active' : 'mobile-menu__lang-btn'}
              onClick={() => setLang(code)}
            >
              {lang === code ? <Icon name="check" size={18} /> : null}
              {t(`lang.${code}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-menu__links">
        {github ? (
          <a className="btn btn--secondary btn--md" href={github.url} target="_blank" rel="noopener noreferrer">
            <Icon name="github" />
            <span>GitHub</span>
          </a>
        ) : null}
        {profile?.email ? (
          <a className="btn btn--secondary btn--md" href={`mailto:${profile.email}`}>
            <Icon name="mail" />
            <span>Email</span>
          </a>
        ) : null}
        <Link to="/admin/login" className="btn btn--secondary btn--md mobile-menu__admin" onClick={onClose}>
          <Icon name="lock" />
          <span>{t('footer.adminLogin')}</span>
        </Link>
      </div>
      <p className="mobile-menu__copy">© 2026 {brandName(profile)}</p>
    </div>,
    document.body,
  )
}
