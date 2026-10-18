import { useRef, useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Reveal } from '../common/Reveal.jsx'
import { Button, Checkbox, SceneLabel, TextInput } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { useI18n } from '../i18n/context.js'
import { SCENES } from '../lib/content.js'
import { errorMessage } from '../lib/errors.js'
import { api } from '../services/api.js'
import { displayUrl, profileLink, useProfile } from '../site/profileContext.js'

const EMPTY_FORM = { name: '', email: '', subject: '', message: '', consent: false, website: '' }
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// 서버는 폼 토큰 발급 후 3초 안의 제출을 저장하지 않는다(봇 방지). 정상 사용자가 걸리지 않게 그만큼 기다린다.
const MIN_TOKEN_AGE_MS = 3200

function validate(form, t) {
  const errors = {}
  if (!form.name.trim()) errors.name = t('errors.required')
  if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = t('errors.email')
  if (form.message.trim().length < 10) errors.message = t('errors.minMessage')
  if (!form.consent) errors.consent = t('errors.consent')
  return errors
}

function ContactCard({ icon, tone, label, value, href }) {
  const { t } = useI18n()
  const content = (
    <>
      <span className={`contact-card__icon contact-card__icon--${tone}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="contact-card__text">
        <span className="eyebrow">{label}</span>
        <span className="contact-card__value">{value ?? '—'}</span>
      </span>
      {value ? <Icon name="external" size={16} className="contact-card__go" /> : <span className="mini-badge">{t('contact.notRegistered')}</span>}
    </>
  )
  return value ? (
    <a className="contact-card" href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    <div className="contact-card is-empty">{content}</div>
  )
}

/** SCENE 06 — CONTACT: GET /inquiries/form-token → POST /inquiries (202일 때만 성공 표시) */
export function ContactSection() {
  const { t } = useI18n()
  const { profile } = useProfile()
  const github = profileLink(profile, 'github')
  const tokenQuery = useApi((signal) => api.formToken({ signal }).then((result) => ({ ...result, meta: { receivedAt: Date.now() } })), [])
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [submitState, setSubmitState] = useState({ status: 'idle', message: '' })
  const formRef = useRef(null)

  const update = (field) => (value) => {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = validate(form, t)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      formRef.current?.querySelector('[aria-invalid="true"]')?.focus()
      return
    }
    const token = tokenQuery.data
    if (!token) return

    setSubmitState({ status: 'sending', message: '' })
    const age = Date.now() - (tokenQuery.meta?.receivedAt ?? 0)
    if (age < MIN_TOKEN_AGE_MS) await new Promise((resolve) => setTimeout(resolve, MIN_TOKEN_AGE_MS - age))

    try {
      await api.sendInquiry({
        name: form.name.trim(),
        email: form.email.trim(),
        subject: form.subject.trim() || null,
        message: form.message.trim(),
        consent: true,
        consentVersion: token.consentVersion,
        formToken: token.formToken,
        website: form.website,
      })
      setSubmitState({ status: 'success', message: '' })
      setForm(EMPTY_FORM)
    } catch (error) {
      const fieldErrors = error.fieldErrors?.() ?? {}
      if (fieldErrors.formToken || fieldErrors.consentVersion) {
        tokenQuery.reload()
        setSubmitState({ status: 'error', message: t('contact.tokenExpired') })
        return
      }
      setErrors(fieldErrors)
      setSubmitState({ status: 'error', message: errorMessage(error, t) })
    }
  }

  const resetForm = () => {
    setSubmitState({ status: 'idle', message: '' })
    tokenQuery.reload()
  }

  const tokenReady = tokenQuery.status === 'success'
  const sending = submitState.status === 'sending'

  return (
    <section id="contact" className="contact" aria-labelledby="contact-title">
      <div className="contact__bg" aria-hidden="true" style={{ backgroundImage: `url(${SCENES.contact})` }} />
      <div className="container contact__inner">
        <Reveal className="contact__head">
          <SceneLabel tone="sakura" centered>
            {t('contact.scene')}
          </SceneLabel>
          <h2 id="contact-title" className="section-title section-title--center">
            <span>{t('contact.titleLine1')}</span>
            <span>{t('contact.titleLine2')}</span>
          </h2>
          <p className="section-lead">{t('contact.lead')}</p>
        </Reveal>

        <div className="contact__grid">
          <Reveal index={1} className="contact__aside">
            <ContactCard icon="mail" tone="sakura" label={t('contact.email')} value={profile?.email} href={`mailto:${profile?.email ?? ''}`} />
            <ContactCard icon="github" tone="aqua" label={t('contact.github')} value={github ? displayUrl(github.url) : null} href={github?.url ?? ''} />
            <p className="contact__note">
              <Icon name="info" size={15} />
              {t('contact.contactNote')}
            </p>
          </Reveal>

          <Reveal index={2} className="contact__panel">
            {submitState.status === 'success' ? (
              <div className="contact__success" role="status">
                <span className="state__icon state__icon--aqua">
                  <Icon name="check" size={22} />
                </span>
                <p className="state__title">{t('contact.successTitle')}</p>
                <p className="state__body">{t('contact.successBody')}</p>
                <Button variant="secondary" size="sm" onClick={resetForm}>
                  {t('contact.sendAnother')}
                </Button>
              </div>
            ) : (
              <form ref={formRef} className="contact-form" onSubmit={onSubmit} noValidate>
                <div className="contact-form__row">
                  <TextInput label={t('contact.name')} placeholder={t('contact.namePlaceholder')} value={form.name} maxLength={50} autoComplete="name" required error={errors.name} onChange={(event) => update('name')(event.target.value)} />
                  <TextInput label={t('contact.emailLabel')} type="email" placeholder={t('contact.emailPlaceholder')} value={form.email} maxLength={254} autoComplete="email" required error={errors.email} onChange={(event) => update('email')(event.target.value)} />
                </div>
                <TextInput label={t('contact.subject')} placeholder={t('contact.subjectPlaceholder')} value={form.subject} maxLength={100} error={errors.subject} onChange={(event) => update('subject')(event.target.value)} />
                <TextInput label={t('contact.message')} multiline rows={6} placeholder={t('contact.messagePlaceholder')} value={form.message} maxLength={3000} required error={errors.message} onChange={(event) => update('message')(event.target.value)} />
                {/* 허니팟: 사람에게는 보이지 않는 칸. 값이 있으면 서버가 저장하지 않는다 */}
                <div className="hp-field" aria-hidden="true">
                  <label>
                    Website
                    <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update('website')(event.target.value)} />
                  </label>
                </div>
                <Checkbox checked={form.consent} onChange={update('consent')} error={errors.consent}>
                  {t('contact.consent')} <span className="mini-badge mini-badge--sakura">{t('contact.required')}</span>
                </Checkbox>
                <p className="contact-form__consent">{t('contact.consentDetail')}</p>

                {tokenQuery.status === 'error' ? (
                  <p className="form-message form-message--error" role="alert">
                    <Icon name="alert" size={16} />
                    {t('contact.tokenError')} {errorMessage(tokenQuery.error, t)}
                    <button type="button" className="form-message__retry" onClick={tokenQuery.reload}>
                      {t('state.retry')}
                    </button>
                  </p>
                ) : null}
                {submitState.status === 'error' && submitState.message ? (
                  <p className="form-message form-message--error" role="alert">
                    <Icon name="alert" size={16} />
                    {submitState.message}
                  </p>
                ) : null}

                <Button type="submit" variant="contact" size="lg" block icon={sending ? undefined : 'send'} loading={sending} disabled={!tokenReady || sending}>
                  {sending ? t('contact.sending') : tokenReady ? t('contact.send') : t('contact.preparing')}
                </Button>
                <p className="contact-form__note">
                  <Icon name="server" size={15} />
                  {t('contact.serverNote')}
                </p>
              </form>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  )
}
