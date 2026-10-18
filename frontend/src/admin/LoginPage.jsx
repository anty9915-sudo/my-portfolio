import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Button, TextInput } from '../common/ui.jsx'
import { SCENES } from '../lib/content.js'
import { Link } from '../lib/router.jsx'
import { useRouter, useSearchParams } from '../lib/routerCore.js'
import { api } from '../services/api.js'
import { adminErrorMessage } from './adminContext.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function loginErrorMessage(error) {
  if (error.code === 'INVALID_CREDENTIALS') return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (error.code === 'TOO_MANY_ATTEMPTS') {
    const minutes = error.retryAfter ? Math.ceil(error.retryAfter / 60) : 15
    return `로그인 실패가 반복되어 계정이 잠시 잠겼습니다. 약 ${minutes}분 후 다시 시도해 주세요.`
  }
  if (error.code === 'RATE_LIMITED') return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  return adminErrorMessage(error)
}

/** 다른 사이트로 이동하지 않도록 /admin 아래 경로만 허용한다 */
function safeNext(value) {
  return value && value.startsWith('/admin') && !value.startsWith('/admin/login') && !value.startsWith('//') ? value : '/admin'
}

/** 04 · 관리자 로그인: POST /auth/login (서버 세션 + HttpOnly 쿠키) */
export function LoginPage() {
  const { navigate } = useRouter()
  const params = useSearchParams()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [state, setState] = useState({ status: 'idle', message: '' })
  const busy = state.status === 'busy'

  const onSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!EMAIL_PATTERN.test(form.email.trim())) nextErrors.email = '이메일 형식을 확인해 주세요.'
    if (!form.password) nextErrors.password = '비밀번호를 입력해 주세요.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setState({ status: 'busy', message: '' })
    try {
      await api.login({ email: form.email.trim(), password: form.password })
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (error) {
      setForm((previous) => ({ ...previous, password: '' }))
      setState({ status: 'error', message: loginErrorMessage(error) })
    }
  }

  return (
    <div className="login">
      <aside className="login__visual">
        <img src={SCENES.hero} alt="" aria-hidden="true" />
        <div className="login__visual-text">
          <Link to="/" className="brand">
            <Icon name="diamond" size={22} strokeWidth={1.5} className="brand__mark" />
            <span className="brand__name">PORTFOLIO</span>
          </Link>
          <p className="login__visual-title">관리자 페이지</p>
          <p className="login__visual-desc">프로젝트, 기술 스택, 학습 기록, 문의를 한 곳에서 관리합니다.</p>
        </div>
      </aside>

      <main className="login__main">
        <div className="login__column">
          <form className="login-card" onSubmit={onSubmit} noValidate>
            <p className="eyebrow eyebrow--aqua">ADMIN / SIGN IN</p>
            <h1 className="login-card__title">관리자 로그인</h1>
            <p className="login-card__desc">등록된 관리자 계정으로 로그인해 주세요.</p>
            <TextInput
              label="EMAIL / 이메일"
              type="email"
              autoComplete="username"
              placeholder="관리자 이메일을 입력해 주세요"
              value={form.email}
              error={errors.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
            <TextInput
              label="PASSWORD / 비밀번호"
              type="password"
              autoComplete="current-password"
              placeholder="비밀번호를 입력해 주세요"
              value={form.password}
              error={errors.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
            {state.status === 'error' ? (
              <p className="form-message form-message--error" role="alert">
                <Icon name="alert" size={16} />
                {state.message}
              </p>
            ) : null}
            <Button type="submit" variant="primary" size="lg" block icon="login" loading={busy}>
              {busy ? '로그인 중…' : '로그인'}
            </Button>
            <p className="login-card__note">
              <Icon name="shield" size={15} />
              기존 백엔드의 인증·세션 방식(서버 세션 + HttpOnly 쿠키)을 그대로 사용합니다.
            </p>
          </form>
          <p className="login__hint">
            <Icon name="lock" size={15} />
            로그인하지 않은 상태로 관리자 화면에 접근하면 이 화면으로 이동합니다.
          </p>
          <Link to="/" className="login__back">
            <Icon name="arrow-left" size={15} />
            사이트로 돌아가기
          </Link>
        </div>
      </main>
    </div>
  )
}
