import { Button, SceneLabel } from '../common/ui.jsx'
import { useDocumentTitle } from '../hooks/useDocumentTitle.js'
import { useI18n } from '../i18n/context.js'
import { SCENES } from '../lib/content.js'
import { useRouter } from '../lib/routerCore.js'

/** 11 · 404 — 비 내리는 골목 장면 */
export function NotFoundPage() {
  const { t } = useI18n()
  const { location } = useRouter()
  useDocumentTitle('404')

  return (
    <section className="not-found" aria-labelledby="not-found-title">
      <div className="not-found__bg" aria-hidden="true" style={{ backgroundImage: `url(${SCENES.detail})` }} />
      <div className="container not-found__inner">
        <div className="enter" style={{ '--i': 1 }}>
          <SceneLabel tone="sakura" centered>
            {t('notFound.scene')}
          </SceneLabel>
        </div>
        <p className="not-found__code enter" style={{ '--i': 2 }} aria-hidden="true">
          404
        </p>
        <h1 id="not-found-title" className="not-found__title enter" style={{ '--i': 3 }}>
          {t('notFound.title')}
        </h1>
        <p className="not-found__body enter" style={{ '--i': 4 }}>
          {t('notFound.body')}
        </p>
        <div className="not-found__actions enter" style={{ '--i': 5 }}>
          <Button variant="contact" size="lg" iconLeft="home" to="/">
            {t('notFound.home')}
          </Button>
          <Button variant="secondary" size="lg" iconLeft="folder" to="/#projects">
            {t('notFound.projects')}
          </Button>
        </div>
        <p className="not-found__path enter" style={{ '--i': 6 }}>
          {location.pathname}
        </p>
      </div>
    </section>
  )
}
