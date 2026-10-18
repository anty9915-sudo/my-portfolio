import { useMemo } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Markdown } from '../common/Markdown.jsx'
import { Reveal } from '../common/Reveal.jsx'
import { Notice, SceneLabel } from '../common/ui.jsx'
import { useI18n } from '../i18n/context.js'
import { SCENES } from '../lib/content.js'
import { parseMarkdown } from '../lib/markdown.js'
import { useProfile } from '../site/profileContext.js'

const FIELDS = [
  { key: 'fieldWeb', icon: 'code', tone: 'aqua' },
  { key: 'fieldSecurity', icon: 'shield', tone: 'sakura' },
  { key: 'fieldDatabase', icon: 'database', tone: 'lilac' },
  { key: 'fieldAi', icon: 'sparkles', tone: 'amber' },
]

/** SCENE 02 — ABOUT: 밤의 작업 공간. 소개·목표는 GET /profile, 학습 중 기술은 GET /skills */
export function AboutSection({ skillsQuery }) {
  const { t } = useI18n()
  const { status, profile } = useProfile()

  const bioBlocks = useMemo(
    () => parseMarkdown(profile?.bio || t('about.fallbackBio')),
    [profile?.bio, t],
  )
  const learning = (skillsQuery.data ?? []).filter((skill) => skill.status === 'learning')
  const goals = profile?.goals ?? []

  return (
    <section id="about" className="about" aria-labelledby="about-title">
      <div className="container about__grid">
        <Reveal as="figure" className="about__visual">
          <span className="about__frame" aria-hidden="true" />
          <div className="about__photo">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} loading="lazy" />
            ) : (
              <img src={SCENES.about} alt={t('about.imageAlt')} loading="lazy" />
            )}
            {profile?.avatarUrl ? null : (
              <figcaption className="about__caption">
                <span className="eyebrow eyebrow--aqua">{t('about.imageLabel')}</span>
                <span>{t('about.imageNote')}</span>
              </figcaption>
            )}
          </div>
        </Reveal>

        <div className="about__body">
          <span className="ghost-number about__ghost" aria-hidden="true">
            02
          </span>
          <Reveal>
            <SceneLabel tone="sakura">{t('about.scene')}</SceneLabel>
            <p className="section-kicker">{t('about.kicker')}</p>
            <h2 id="about-title" className="section-title">
              <span>{t('about.titleLine1')}</span>
              <span>{t('about.titleLine2')}</span>
            </h2>
          </Reveal>

          <Reveal index={1} className="about__bio-wrap">
            <Markdown blocks={bioBlocks} className="prose about__bio" />
          </Reveal>

          <Reveal index={2} className="about__fields">
            <p className="eyebrow">{t('about.fields')}</p>
            <ul className="chip-row">
              {FIELDS.map((field) => (
                <li key={field.key} className={`chip chip--${field.tone}`}>
                  <Icon name={field.icon} size={16} />
                  {t(`about.${field.key}`)}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal index={3} className="about__cards">
            <div className="info-card">
              <p className="info-card__head">
                <span className="eyebrow eyebrow--aqua">{t('about.nowLearning')}</span>
                <span className="info-card__sub">{t('about.nowLearningSub')}</span>
              </p>
              {skillsQuery.hasLoaded ? (
                learning.length ? (
                  <p className="info-card__text">{learning.map((skill) => skill.name).join(' · ')}</p>
                ) : (
                  <p className="info-card__text is-muted">{t('about.noLearning')}</p>
                )
              ) : (
                <span className="skeleton__bar" />
              )}
            </div>
            <div className="info-card">
              <p className="info-card__head">
                <span className="eyebrow eyebrow--sakura">{t('about.nextGoal')}</span>
                <span className="info-card__sub">{t('about.nextGoalSub')}</span>
              </p>
              {status === 'loading' ? (
                <span className="skeleton__bar" />
              ) : goals.length ? (
                <ul className="info-card__list">
                  {goals.map((goal) => (
                    <li key={goal}>{goal}</li>
                  ))}
                </ul>
              ) : (
                <p className="info-card__text is-muted">{t('about.noGoals')}</p>
              )}
            </div>
          </Reveal>

          {status === 'missing' ? (
            <Reveal index={4}>
              <Notice>{t('about.profileMissing')}</Notice>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  )
}
