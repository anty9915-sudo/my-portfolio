import { Icon } from '../common/Icon.jsx'
import { useI18n } from '../i18n/context.js'
import { Link } from '../lib/router.jsx'
import { NAV_ITEMS } from './navItems.js'
import { brandName, profileLink, useProfile } from './profileContext.js'
import { BrandMark } from './SiteHeader.jsx'

export function SiteFooter() {
  const { t } = useI18n()
  const { profile } = useProfile()
  const name = brandName(profile)
  const github = profileLink(profile, 'github')

  const scrollTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <footer className="site-footer">
      <span className="site-footer__ghost" aria-hidden="true">
        {name}
      </span>
      <div className="container site-footer__inner">
        <div className="site-footer__top">
          <div>
            <BrandMark sub={null} />
            <p className="site-footer__tagline">{t('footer.tagline')}</p>
          </div>
          <nav aria-label="Footer">
            <ul className="site-footer__nav">
              {NAV_ITEMS.map((item) => (
                <li key={item.id}>
                  <Link to={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="site-footer__bottom">
          <div className="site-footer__meta">
            <p>
              © 2026 {name}. {t('footer.rights')}
            </p>
            <p>{t('footer.illustrationNote')}</p>
          </div>
          <div className="site-footer__actions">
            {github ? (
              <a className="btn btn--secondary btn--sm" href={github.url} target="_blank" rel="noopener noreferrer">
                <Icon name="github" size={16} />
                <span>GitHub</span>
              </a>
            ) : null}
            {profile?.email ? (
              <a className="btn btn--secondary btn--sm" href={`mailto:${profile.email}`}>
                <Icon name="mail" size={16} />
                <span>Email</span>
              </a>
            ) : null}
            <Link to="/admin/login" className="btn btn--secondary btn--sm">
              <Icon name="lock" size={15} />
              <span>{t('footer.adminLogin')}</span>
            </Link>
            <button type="button" className="btn btn--accent btn--sm site-footer__top-btn" onClick={scrollTop}>
              <Icon name="arrow-up" size={15} />
              <span>{t('footer.top')}</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
