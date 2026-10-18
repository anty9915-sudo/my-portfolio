import { Button, SceneLabel } from '../common/ui.jsx'
import { useParallax } from '../hooks/useParallax.js'
import { useI18n } from '../i18n/context.js'
import { SCENES } from '../lib/content.js'
import { useProfile } from '../site/profileContext.js'

const PARTICLES = [
  { x: 14, y: 18, s: 3, d: 0 },
  { x: 57, y: 15, s: 2, d: 1.4 },
  { x: 43, y: 62, s: 2, d: 2.2 },
  { x: 71, y: 74, s: 3, d: 0.8 },
  { x: 88, y: 32, s: 2, d: 3.1 },
  { x: 29, y: 44, s: 2, d: 1.9 },
  { x: 95, y: 82, s: 3, d: 2.6 },
  { x: 63, y: 38, s: 2, d: 0.4 },
]

/** SCENE 01 — OPENING: 트와일라이트 도시 */
export function HeroSection() {
  const { t } = useI18n()
  const { status, profile } = useProfile()
  const bgRef = useParallax(0.15)
  const hasName = Boolean(profile?.name)

  return (
    <section id="home" className="hero" aria-labelledby="hero-title">
      <div className="hero__bg" aria-hidden="true">
        <img ref={bgRef} src={SCENES.hero} alt="" className="hero__img" fetchPriority="high" />
        <span className="hero__glow hero__glow--a" />
        <span className="hero__glow hero__glow--b" />
        {PARTICLES.map((particle, index) => (
          <span
            key={index}
            className="hero__particle"
            style={{
              left: `${particle.x}%`,
              top: `${particle.y}%`,
              width: particle.s,
              height: particle.s,
              animationDelay: `${particle.d}s`,
            }}
          />
        ))}
      </div>
      <span className="hero__frame" aria-hidden="true" />

      <div className="container hero__content">
        <div className="enter" style={{ '--i': 1 }}>
          <SceneLabel>{t('hero.scene')}</SceneLabel>
        </div>
        <p className="hero__kicker enter" style={{ '--i': 2 }}>
          {t('hero.kicker')}
        </p>
        <h1 id="hero-title" className="hero__title enter" style={{ '--i': 3 }}>
          <span>{t('hero.titleLine1')}</span>
          <span>{t('hero.titleLine2')}</span>
        </h1>
        <p className="hero__lead enter" style={{ '--i': 4 }}>
          {t('hero.lead')}
        </p>

        <div className="hero__card enter" style={{ '--i': 5 }}>
          <p className="hero__card-label">{t('hero.developer')}</p>
          <div className="hero__card-row">
            <p className={hasName ? 'hero__card-name' : 'hero__card-name is-placeholder'}>
              {status === 'loading' ? <span className="skeleton__bar hero__card-skeleton" /> : profile?.name || t('hero.namePlaceholder')}
            </p>
            {status === 'loading' ? null : (
              <p className="hero__card-hint">{profile?.headline || (status === 'missing' ? t('hero.nameHint') : '')}</p>
            )}
          </div>
        </div>

        <div className="hero__actions enter" style={{ '--i': 6 }}>
          <Button variant="primary" size="lg" icon="arrow-right" to="/#projects">
            {t('hero.ctaProjects')}
          </Button>
          <Button variant="secondary" size="lg" icon="chevron-right" to="/#about">
            {t('hero.ctaAbout')}
          </Button>
        </div>
      </div>

      <p className="hero__side" aria-hidden="true">
        {t('hero.sideLabel')}
      </p>
      <span className="hero__scroll" aria-hidden="true">
        {t('hero.scroll')}
      </span>
    </section>
  )
}
