import { useI18n } from '../i18n/context.js'
import { SiteFooter } from './SiteFooter.jsx'
import { SiteHeader } from './SiteHeader.jsx'

export function SiteLayout({ children }) {
  const { t } = useI18n()
  return (
    <div className="site">
      <a className="skip-link" href="#main">
        {t('meta.skipToContent')}
      </a>
      <SiteHeader />
      <main id="main" className="site-main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
