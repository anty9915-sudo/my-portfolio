import { useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { Modal } from '../common/Modal.jsx'
import { EmptyState, ErrorState, LoadingState } from '../common/StateView.jsx'
import { useToast } from '../common/toastContext.js'
import { Button, Gauge, SelectInput, TextInput, Toggle } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { SKILL_CATEGORIES, SKILL_CATEGORY_LABEL, SKILL_CATEGORY_TONE, SKILL_STATUSES, skillIcon } from '../lib/content.js'
import { translate } from '../i18n/context.js'
import { api } from '../services/api.js'
import { adminErrorMessage, fieldErrorsFrom } from './adminContext.js'
import { Card, ConfirmDeleteModal, FormMessage, PageHeader, RowActions, VisibilityToggle } from './parts.jsx'
import { emptyToNull, SLUG_PATTERN } from './useResourceForm.js'

const STATUS_LABEL = Object.fromEntries(SKILL_STATUSES.map((status) => [status, translate('ko', `skillStatus.${status}`)]))
const STATUS_TONE = { proficient: 'aqua', applied: 'aqua', learning: 'lilac', planned: 'muted' }
const CATEGORY_OPTIONS = SKILL_CATEGORIES.map((value) => ({ value, label: SKILL_CATEGORY_LABEL[value] }))
const STATUS_OPTIONS = SKILL_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))

const EMPTY_SKILL = { name: '', slug: '', category: 'frontend', status: 'learning', description: '', iconKey: '', sortOrder: '0', visibility: 'private' }

function toForm(skill) {
  return skill
    ? {
        name: skill.name,
        slug: skill.slug,
        category: skill.category,
        status: skill.status,
        description: skill.description ?? '',
        iconKey: skill.iconKey ?? '',
        sortOrder: String(skill.sortOrder ?? 0),
        visibility: skill.visibility,
      }
    : EMPTY_SKILL
}

/** 기술 등록·수정 대화 상자: POST /admin/skills · PATCH /admin/skills/:id */
function SkillFormModal({ skill, open, onClose, onSaved }) {
  const [form, setForm] = useState(() => toForm(skill))
  const [errors, setErrors] = useState({})
  const [state, setState] = useState({ status: 'idle', message: '' })
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    const nextErrors = {}
    if (!form.name.trim()) nextErrors.name = '이름을 입력해 주세요.'
    if (!SLUG_PATTERN.test(form.slug.trim())) nextErrors.slug = '소문자·숫자·하이픈만 사용할 수 있습니다.'
    if (form.iconKey && !/^[a-z0-9-]+$/.test(form.iconKey.trim())) nextErrors.iconKey = '소문자·숫자·하이픈만 사용할 수 있습니다.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    const body = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      category: form.category,
      status: form.status,
      description: emptyToNull(form.description),
      iconKey: emptyToNull(form.iconKey),
      sortOrder: Number(form.sortOrder) || 0,
      visibility: form.visibility,
    }
    setState({ status: 'saving', message: '' })
    try {
      const { data } = skill ? await api.admin.updateSkill(skill.id, body) : await api.admin.createSkill(body)
      onSaved(data, Boolean(skill))
    } catch (error) {
      setErrors(fieldErrorsFrom(error))
      setState({ status: 'error', message: adminErrorMessage(error) })
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={skill ? '기술 수정' : '기술 추가'} className="modal--wide" closeDisabled={state.status === 'saving'}>
      <form onSubmit={submit} noValidate>
        <p className="modal__title">{skill ? `${skill.name} 수정` : '기술 추가'}</p>
        <div className="form-grid">
          <TextInput label="이름" required maxLength={50} value={form.name} error={errors.name} onChange={set('name')} />
          <TextInput label="SLUG (필터용)" required maxLength={50} value={form.slug} error={errors.slug} onChange={set('slug')} hint="예: nodejs, web-security" />
          <SelectInput label="분류" value={form.category} options={CATEGORY_OPTIONS} onChange={set('category')} error={errors.category} />
          <SelectInput label="상태" value={form.status} options={STATUS_OPTIONS} onChange={set('status')} error={errors.status} />
          <TextInput label="아이콘 키" maxLength={50} value={form.iconKey} error={errors.iconKey} onChange={set('iconKey')} hint="예: react, nodejs, git (비우면 분류 아이콘)" />
          <TextInput label="정렬 순서" type="number" min={0} max={9999} value={form.sortOrder} error={errors.sortOrder} onChange={set('sortOrder')} />
          <TextInput className="form-grid__full" label="설명" multiline rows={3} maxLength={300} value={form.description} error={errors.description} onChange={set('description')} />
          <div className="setting-row form-grid__full">
            <span>사이트에 공개</span>
            <Toggle checked={form.visibility === 'public'} onChange={(on) => setForm({ ...form, visibility: on ? 'public' : 'private' })} label="사이트에 공개" onLabel="공개" offLabel="비공개" />
          </div>
        </div>
        <FormMessage>{state.status === 'error' ? state.message : ''}</FormMessage>
        <div className="confirm__actions">
          <Button variant="secondary" onClick={onClose} disabled={state.status === 'saving'}>
            취소
          </Button>
          <Button type="submit" variant="solid-aqua" iconLeft="check" loading={state.status === 'saving'}>
            저장
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** 08 · 기술 스택 관리: GET /admin/skills (전체) */
export function SkillsPage() {
  const { toast } = useToast()
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState(null) // { skill } | { skill: null }
  const [deleting, setDeleting] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const list = useApi((signal) => api.admin.skills(undefined, { signal }), [])
  const skills = list.data ?? []
  const visible = category ? skills.filter((skill) => skill.category === category) : skills
  const usedCategories = SKILL_CATEGORIES.filter((value) => skills.some((skill) => skill.category === value))

  const patch = async (skill, body) => {
    setBusyId(skill.id)
    try {
      const { data } = await api.admin.updateSkill(skill.id, body)
      list.setData((items) => items.map((item) => (item.id === data.id ? data : item)))
      toast({ title: '저장되었습니다', body: `${skill.name}을(를) 수정했습니다.` })
    } catch (error) {
      toast({ tone: 'error', title: '저장하지 못했습니다', body: adminErrorMessage(error) })
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    try {
      await api.admin.deleteSkill(deleting.id)
    } catch (error) {
      if (error.code === 'RESOURCE_IN_USE') {
        // 어디에서 쓰이는지 알려 주기 위해 참조 개수를 조회한다
        const { data } = await api.admin.skill(deleting.id).catch(() => ({ data: null }))
        const usage = data?.usage
        throw new Error(
          usage
            ? `프로젝트 ${usage.projects}개, 학습 기록 ${usage.studyRecords}개에서 사용 중이라 삭제할 수 없습니다. 연결을 먼저 해제해 주세요.`
            : adminErrorMessage(error),
          { cause: error },
        )
      }
      throw error
    }
    toast({ title: '삭제되었습니다', body: `${deleting.name}을(를) 삭제했습니다.` })
    setDeleting(null)
    list.reload()
  }

  const onSaved = (data, existing) => {
    setEditing(null)
    toast({ title: '저장되었습니다', body: `${data.name}을(를) ${existing ? '수정' : '추가'}했습니다.` })
    list.reload()
  }

  let body
  if (list.status === 'error') body = <ErrorState error={list.error} onRetry={list.reload} />
  else if (!list.hasLoaded) body = <LoadingState compact />
  else if (!skills.length) body = <EmptyState icon="layers" title="등록된 기술이 없습니다" body="기술을 추가하면 공개 사이트의 기술 스택과 프로젝트 필터에 쓰입니다." />
  else {
    body = (
      <div className="table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">기술명</th>
              <th scope="col">분류</th>
              <th scope="col">상태</th>
              <th scope="col">게이지</th>
              <th scope="col">공개</th>
              <th scope="col" className="col-actions">
                <span className="sr-only">관리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((skill) => (
              <tr key={skill.id}>
                <td>
                  <div className="cell-title">
                    <span className="cell-icon">
                      <Icon name={skillIcon(skill)} size={16} />
                    </span>
                    <span>
                      <span className="cell-title__main">{skill.name}</span>
                      <span className="cell-title__sub">
                        {skill.slug} · 순서 {skill.sortOrder}
                      </span>
                    </span>
                  </div>
                </td>
                <td>
                  <label className="inline-select">
                    <span className="sr-only">{skill.name} 분류</span>
                    <select value={skill.category} disabled={busyId !== null} onChange={(event) => patch(skill, { category: event.target.value })}>
                      {CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevron-down" size={14} />
                  </label>
                </td>
                <td>
                  <label className={`inline-select inline-select--badge inline-select--${STATUS_TONE[skill.status]}`}>
                    <span className="sr-only">{skill.name} 상태</span>
                    <select value={skill.status} disabled={busyId !== null} onChange={(event) => patch(skill, { status: event.target.value })}>
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevron-down" size={14} />
                  </label>
                </td>
                <td className="cell-gauge">
                  <Gauge status={skill.status} tone={STATUS_TONE[skill.status] === 'muted' ? 'muted' : SKILL_CATEGORY_TONE[skill.category]} label={STATUS_LABEL[skill.status]} />
                </td>
                <td>
                  <VisibilityToggle visibility={skill.visibility} disabled={busyId !== null} onChange={(next) => patch(skill, { visibility: next })} />
                </td>
                <td className="col-actions">
                  <RowActions onEdit={() => setEditing({ skill })} onDelete={() => setDeleting(skill)} disabled={busyId !== null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-foot">
          <span>
            전체 {skills.length}개 · 공개 {skills.filter((skill) => skill.visibility === 'public').length}개
          </span>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="기술 스택 관리" description="분류·상태·정렬 순서와 공개 여부를 관리합니다. 상태에 따라 공개 사이트의 게이지가 표시됩니다." />
      <Card
        title="기술 스택"
        icon="layers"
        actions={
          <Button variant="solid-aqua" iconLeft="plus" onClick={() => setEditing({ skill: null })}>
            기술 추가
          </Button>
        }
      >
        <div className="tabs" role="group" aria-label="분류">
          <button type="button" className={category === '' ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={category === ''} onClick={() => setCategory('')}>
            전체
          </button>
          {usedCategories.map((value) => (
            <button key={value} type="button" className={category === value ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={category === value} onClick={() => setCategory(value)}>
              {SKILL_CATEGORY_LABEL[value]}
            </button>
          ))}
        </div>
        {body}
      </Card>
      {editing ? <SkillFormModal key={editing.skill?.id ?? 'new'} skill={editing.skill} open onClose={() => setEditing(null)} onSaved={onSaved} /> : null}
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="기술을 삭제할까요?"
        name={deleting?.name}
        description="프로젝트나 학습 기록에서 사용 중인 기술은 삭제할 수 없습니다 (서버에서 409로 거부). 이 작업은 되돌릴 수 없습니다."
        onConfirm={confirmDelete}
      />
    </>
  )
}
