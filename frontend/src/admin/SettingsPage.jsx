import { useState } from 'react'
import { ErrorState, LoadingState } from '../common/StateView.jsx'
import { useToast } from '../common/toastContext.js'
import { Button, IconButton, Notice, SelectInput, TextInput } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { formatDateTime } from '../lib/format.js'
import { api } from '../services/api.js'
import { adminErrorMessage, fieldErrorsFrom, useAdmin } from './adminContext.js'
import { Card, FormMessage, ListEditor, PageHeader } from './parts.jsx'
import { emptyToNull } from './useResourceForm.js'

const LINK_TYPES = [
  { value: 'github', label: 'GitHub' },
  { value: 'blog', label: '블로그' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'other', label: '기타' },
]

function toForm(profile) {
  return {
    name: profile?.name ?? '',
    headline: profile?.headline ?? '',
    bio: profile?.bio ?? '',
    goals: profile?.goals ?? [],
    email: profile?.email ?? '',
    avatarUrl: profile?.avatarUrl ?? '',
    resumeUrl: profile?.resumeUrl ?? '',
    links: profile?.links ?? [],
  }
}

/**
 * 프로필 편집: GET /profile → PUT /admin/profile (전체 교체).
 * 별도의 관리자용 프로필 조회 API가 없어 공개 프로필 응답을 폼의 시작값으로 쓴다.
 */
function ProfileForm() {
  const { toast } = useToast()
  const query = useApi(
    (signal) =>
      api.profile({ signal }).catch((error) => {
        if (error?.status === 404) return { data: null, meta: { missing: true } }
        throw error
      }),
    [],
  )
  const sourceKey = query.hasLoaded ? (query.data?.updatedAt ?? 'missing') : null
  const [draft, setDraft] = useState({ sourceKey: null, values: null })
  const [errors, setErrors] = useState({})
  const [state, setState] = useState({ status: 'idle', message: '' })
  const form = draft.sourceKey === sourceKey && draft.values ? draft.values : toForm(query.data)
  const set = (name, value) => {
    setDraft({ sourceKey, values: { ...form, [name]: value } })
    setErrors((previous) => ({ ...previous, [name]: undefined }))
  }

  if (query.status === 'error') return <ErrorState error={query.error} onRetry={query.reload} compact />
  if (!query.hasLoaded) return <LoadingState compact />

  const updateLink = (index, patch) => set('links', form.links.map((link, linkIndex) => (linkIndex === index ? { ...link, ...patch } : link)))

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!form.name.trim()) nextErrors.name = '이름을 입력해 주세요.'
    if (!form.headline.trim()) nextErrors.headline = '한 줄 소개를 입력해 주세요.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    // PUT은 전체 교체: 생략한 필드는 서버에서 기본값으로 초기화되므로 항상 모든 값을 보낸다
    const body = {
      name: form.name.trim(),
      headline: form.headline.trim(),
      bio: emptyToNull(form.bio),
      goals: form.goals.map((goal) => goal.trim()).filter(Boolean),
      email: emptyToNull(form.email),
      avatarUrl: emptyToNull(form.avatarUrl),
      resumeUrl: emptyToNull(form.resumeUrl),
      links: form.links
        .filter((link) => link.url.trim() || link.label.trim())
        .map((link) => ({ type: link.type, label: link.label.trim(), url: link.url.trim() })),
    }
    setState({ status: 'saving', message: '' })
    try {
      const { data } = await api.admin.saveProfile(body)
      query.setData(data)
      setState({ status: 'idle', message: '' })
      toast({ title: '저장되었습니다', body: '프로필을 저장했습니다. 공개 사이트에 바로 반영됩니다.' })
    } catch (error) {
      setErrors(fieldErrorsFrom(error))
      setState({ status: 'error', message: adminErrorMessage(error) })
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card
        title="프로필"
        icon="user"
        description="공개 사이트의 이름·소개·목표·연락처에 쓰입니다."
        actions={
          <Button type="submit" variant="solid-aqua" iconLeft="check" loading={state.status === 'saving'}>
            프로필 저장
          </Button>
        }
      >
        {query.meta?.missing ? <Notice tone="amber" icon="info">아직 프로필이 없습니다. 저장하면 새로 만들어집니다.</Notice> : null}
        <div className="form-grid">
          <TextInput label="이름 또는 닉네임" required maxLength={50} value={form.name} error={errors.name} onChange={(event) => set('name', event.target.value)} />
          <TextInput label="한 줄 소개" required maxLength={100} value={form.headline} error={errors.headline} onChange={(event) => set('headline', event.target.value)} />
          <TextInput className="form-grid__full" label="자기소개 (Markdown)" multiline rows={7} maxLength={3000} value={form.bio} error={errors.bio} onChange={(event) => set('bio', event.target.value)} hint="비워 두면 공개 사이트에 기본 소개 문구가 표시됩니다." />
          <div className="form-grid__full">
            <ListEditor label="목표 (NEXT GOAL)" items={form.goals} onChange={(value) => set('goals', value)} max={10} error={errors.goals} addLabel="목표 추가" />
          </div>
          <TextInput label="공개 이메일" type="email" maxLength={254} value={form.email} error={errors.email} onChange={(event) => set('email', event.target.value)} hint="비워 두면 공개하지 않습니다." />
          <TextInput label="프로필 사진 URL" type="url" placeholder="https://" value={form.avatarUrl} error={errors.avatarUrl} onChange={(event) => set('avatarUrl', event.target.value)} />
          <TextInput label="이력서 URL" type="url" placeholder="https://" value={form.resumeUrl} error={errors.resumeUrl} onChange={(event) => set('resumeUrl', event.target.value)} />
        </div>
        <div className="field">
          <span className="field__label">링크 (최대 10개)</span>
          <ul className="link-editor">
            {form.links.map((link, index) => (
              <li key={index} className="link-editor__row">
                <SelectInput label="종류" value={link.type} options={LINK_TYPES} onChange={(event) => updateLink(index, { type: event.target.value })} />
                <TextInput label="표시 이름" maxLength={30} value={link.label} onChange={(event) => updateLink(index, { label: event.target.value })} />
                <TextInput label="URL" type="url" placeholder="https://" value={link.url} onChange={(event) => updateLink(index, { url: event.target.value })} />
                <IconButton icon="trash" label="링크 삭제" variant="danger" onClick={() => set('links', form.links.filter((_, linkIndex) => linkIndex !== index))} />
              </li>
            ))}
          </ul>
          {form.links.length < 10 ? (
            <button type="button" className="list-editor__add" onClick={() => set('links', [...form.links, { type: 'github', label: 'GitHub', url: '' }])}>
              + 링크 추가
            </button>
          ) : null}
          {errors.links ? <p className="field__error">{errors.links}</p> : null}
        </div>
        <FormMessage>{state.status === 'error' ? state.message : ''}</FormMessage>
      </Card>
    </form>
  )
}

/** 비밀번호 변경: PATCH /auth/password (성공 시 다른 세션은 서버가 모두 삭제) */
function PasswordForm() {
  const { toast } = useToast()
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [state, setState] = useState({ status: 'idle', message: '' })

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!form.currentPassword) nextErrors.currentPassword = '현재 비밀번호를 입력해 주세요.'
    if (form.newPassword.length < 12 || form.newPassword.length > 128) nextErrors.newPassword = '12~128자로 입력해 주세요.'
    else if (form.newPassword === form.currentPassword) nextErrors.newPassword = '현재 비밀번호와 달라야 합니다.'
    if (form.confirm !== form.newPassword) nextErrors.confirm = '새 비밀번호가 일치하지 않습니다.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setState({ status: 'saving', message: '' })
    try {
      await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
      setForm({ currentPassword: '', newPassword: '', confirm: '' })
      setState({ status: 'idle', message: '' })
      toast({ title: '비밀번호를 변경했습니다', body: '다른 기기의 로그인은 모두 종료되었습니다.' })
    } catch (error) {
      if (error.code === 'INVALID_CREDENTIALS') {
        setErrors({ currentPassword: '현재 비밀번호가 올바르지 않습니다.' })
        setState({ status: 'idle', message: '' })
        return
      }
      setErrors(fieldErrorsFrom(error))
      setState({ status: 'error', message: adminErrorMessage(error) })
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card title="비밀번호 변경" icon="key" description="변경하면 현재 로그인은 유지되고 다른 기기의 로그인은 모두 종료됩니다.">
        <div className="form-grid form-grid--single">
          <TextInput label="현재 비밀번호" type="password" autoComplete="current-password" value={form.currentPassword} error={errors.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} />
          <TextInput label="새 비밀번호 (12자 이상)" type="password" autoComplete="new-password" value={form.newPassword} error={errors.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} />
          <TextInput label="새 비밀번호 확인" type="password" autoComplete="new-password" value={form.confirm} error={errors.confirm} onChange={(event) => setForm({ ...form, confirm: event.target.value })} />
        </div>
        <FormMessage>{state.status === 'error' ? state.message : ''}</FormMessage>
        <Button type="submit" variant="secondary" iconLeft="key" loading={state.status === 'saving'}>
          비밀번호 변경
        </Button>
      </Card>
    </form>
  )
}

export function SettingsPage() {
  const { admin } = useAdmin()
  return (
    <>
      <PageHeader title="프로필 · 계정" description={`로그인 계정 ${admin?.email ?? ''} · 최근 로그인 ${admin?.lastLoginAt ? formatDateTime(admin.lastLoginAt) : '—'}`} />
      <div className="settings-grid">
        <ProfileForm />
        <PasswordForm />
      </div>
    </>
  )
}
