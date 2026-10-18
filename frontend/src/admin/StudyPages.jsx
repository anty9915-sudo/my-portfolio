import { useCallback, useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { EmptyState, ErrorState, LoadingState } from '../common/StateView.jsx'
import { useToast } from '../common/toastContext.js'
import { Badge, Button, Notice, SelectInput, Tag, TextInput, Toggle } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { useDebouncedValue } from '../hooks/useReveal.js'
import { formatDate, formatDateTime, kstDateKey, toDateInput } from '../lib/format.js'
import { Link } from '../lib/router.jsx'
import { useRouter } from '../lib/routerCore.js'
import { api } from '../services/api.js'
import { adminErrorMessage, skillOptions } from './adminContext.js'
import { Card, ConfirmDeleteModal, FormMessage, PageHeader, Pagination, ReferencePicker, RowActions, VisibilityToggle } from './parts.jsx'
import { emptyToNull, parseTags, SLUG_PATTERN, useResourceForm } from './useResourceForm.js'

const PAGE_SIZE = 20
const CATEGORY_LABEL = { study: '학습 정리', troubleshooting: '문제 해결' }

function CategoryBadge({ category }) {
  return <Badge tone={category === 'troubleshooting' ? 'crimson' : 'amber'}>{CATEGORY_LABEL[category] ?? category}</Badge>
}

/** 08 · 학습 기록 관리: GET /admin/study-records */
export function StudyPage() {
  const { navigate } = useRouter()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [pageState, setPageState] = useState({ key: '', page: 1 })
  const [busyId, setBusyId] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const debounced = useDebouncedValue(search.trim(), 300)
  const q = debounced.length >= 2 ? debounced : ''
  const filterKey = `${q}|${category}`
  const page = pageState.key === filterKey ? pageState.page : 1
  const list = useApi((signal) => api.admin.studyRecords({ q, category, page, limit: PAGE_SIZE, sort: '-learnedAt' }, { signal }), [q, category, page])
  const records = list.data ?? []

  const toggle = async (record, visibility) => {
    setBusyId(record.id)
    try {
      const { data } = await api.admin.updateStudyRecord(record.id, { visibility })
      list.setData((items) => items.map((item) => (item.id === data.id ? data : item)))
      toast({ title: '저장되었습니다', body: `${record.title}을(를) ${visibility === 'public' ? '공개' : '비공개로 전환'}했습니다.` })
    } catch (error) {
      toast({ tone: 'error', title: '저장하지 못했습니다', body: adminErrorMessage(error) })
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    await api.admin.deleteStudyRecord(deleting.id)
    toast({ title: '삭제되었습니다', body: `${deleting.title}을(를) 삭제했습니다.` })
    setDeleting(null)
    list.reload()
  }

  let body
  if (list.status === 'error') body = <ErrorState error={list.error} onRetry={list.reload} />
  else if (!list.hasLoaded) body = <LoadingState compact />
  else if (!records.length) {
    body = q || category ? <EmptyState icon="search" tone="amber" title="검색 결과가 없습니다" /> : <EmptyState icon="book" title="등록된 학습 기록이 없습니다" body="첫 글을 작성하면 여기에 표시됩니다." />
  } else {
    body = (
      <div className="table-wrap">
        <table className={list.isLoading ? 'admin-table is-stale' : 'admin-table'}>
          <thead>
            <tr>
              <th scope="col">학습일</th>
              <th scope="col">제목</th>
              <th scope="col">분류</th>
              <th scope="col">기술 · 태그</th>
              <th scope="col">공개</th>
              <th scope="col" className="col-actions">
                <span className="sr-only">관리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td className="cell-mono">{formatDate(record.learnedAt)}</td>
                <td>
                  <span className="cell-title__main">{record.title}</span>
                  <span className="cell-title__sub">{record.slug}</span>
                </td>
                <td>
                  <CategoryBadge category={record.category} />
                </td>
                <td>
                  <span className="tag-row tag-row--small">
                    {[...(record.skills ?? []).map((skill) => skill.name), ...(record.tags ?? [])].slice(0, 4).map((tag) => (
                      <Tag key={tag} mono>
                        {tag}
                      </Tag>
                    ))}
                  </span>
                </td>
                <td>
                  <VisibilityToggle visibility={record.visibility} disabled={busyId !== null} onChange={(next) => toggle(record, next)} />
                </td>
                <td className="col-actions">
                  <RowActions onEdit={() => navigate(`/admin/study/${record.id}`)} onDelete={() => setDeleting(record)} disabled={busyId !== null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-foot">
          <span>전체 {list.meta?.totalItems ?? 0}개</span>
          <Pagination meta={list.meta} page={page} onPage={(next) => setPageState({ key: filterKey, page: next })} disabled={list.isLoading} />
        </div>
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="학습 기록 관리"
        description="날짜·태그·공개 여부를 설정하고 상세 내용을 작성합니다."
        actions={
          <Button variant="solid-aqua" iconLeft="plus" to="/admin/study/new">
            글 작성
          </Button>
        }
      />
      <div className="admin-filter">
        <label className="search-box">
          <Icon name="search" size={17} />
          <span className="sr-only">학습 기록 검색</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="제목·요약·태그 검색 (2자 이상)" />
        </label>
        <div className="tabs" role="group" aria-label="분류">
          {[['', '전체'], ['study', '학습 정리'], ['troubleshooting', '문제 해결']].map(([value, label]) => (
            <button key={value} type="button" className={category === value ? 'filter-chip is-active' : 'filter-chip'} aria-pressed={category === value} onClick={() => setCategory(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="admin-panel">{body}</div>
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="학습 기록을 삭제할까요?"
        name={deleting?.title}
        description="삭제한 글은 되돌릴 수 없습니다."
        onConfirm={confirmDelete}
      />
    </>
  )
}

function toForm(record) {
  return {
    title: record?.title ?? '',
    slug: record?.slug ?? '',
    category: record?.category ?? 'study',
    summary: record?.summary ?? '',
    content: record?.content ?? '',
    skillIds: record?.skillIds ?? [],
    projectIds: record?.projectIds ?? [],
    tags: (record?.tags ?? []).join(', '),
    learnedAt: record ? toDateInput(record.learnedAt) : kstDateKey(),
    visibility: record?.visibility ?? 'private',
  }
}

function toPayload(form) {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    category: form.category,
    summary: emptyToNull(form.summary),
    content: form.content.trim(),
    skillIds: form.skillIds,
    projectIds: form.projectIds,
    tags: parseTags(form.tags),
    learnedAt: form.learnedAt,
    visibility: form.visibility,
  }
}

function validate(form) {
  const errors = {}
  if (!form.title.trim()) errors.title = '제목을 입력해 주세요.'
  if (!SLUG_PATTERN.test(form.slug.trim()) || form.slug.trim().length < 3) errors.slug = '소문자·숫자·하이픈 3자 이상으로 입력해 주세요.'
  if (!form.content.trim()) errors.content = '내용을 입력해 주세요.'
  if (!form.learnedAt) errors.learnedAt = '학습일을 선택해 주세요.'
  else if (form.learnedAt > kstDateKey()) errors.learnedAt = '미래 날짜는 선택할 수 없습니다.'
  return errors
}

/** 학습 기록 작성·수정: POST /admin/study-records · PATCH /admin/study-records/:id */
export function StudyEditPage({ id }) {
  const { navigate } = useRouter()
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)
  const skills = useApi((signal) => api.admin.skills(undefined, { signal }), [])
  const projects = useApi((signal) => api.admin.projects({ limit: 50, sort: 'title' }, { signal }), [])
  const onCreated = useCallback((record) => navigate(`/admin/study/${record.id}`, { replace: true }), [navigate])
  const { query, record, form, setField, errors, dirty, save, saveState, saving } = useResourceForm({
    id,
    label: '학습 기록',
    load: (recordId, signal) => api.admin.studyRecord(recordId, { signal }),
    create: api.admin.createStudyRecord,
    update: api.admin.updateStudyRecord,
    toForm,
    toPayload,
    validate,
    onCreated,
  })

  if (query.status === 'error') return <ErrorState error={query.error} onRetry={query.reload} />
  if (id && !record) return <LoadingState compact />

  const field = (name) => ({ value: form[name], error: errors[name], onChange: (event) => setField(name, event.target.value) })
  const projectOptions = (projects.data ?? []).map((project) => ({ id: project.id, label: project.title }))

  const confirmDelete = async () => {
    await api.admin.deleteStudyRecord(record.id)
    toast({ title: '삭제되었습니다', body: `${record.title}을(를) 삭제했습니다.` })
    navigate('/admin/study', { replace: true })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
      noValidate
    >
      <PageHeader
        back={
          <Link to="/admin/study" className="admin-back">
            <Icon name="arrow-left" size={15} />
            학습 기록 목록으로
          </Link>
        }
        title={record ? `${record.title} 수정` : '새 학습 기록'}
        actions={
          <>
            {record?.visibility === 'public' && !dirty ? (
              <Button variant="secondary" iconLeft="eye" href={`/study/${encodeURIComponent(record.slug)}`}>
                미리보기
              </Button>
            ) : null}
            <Button type="submit" variant="solid-aqua" iconLeft="check" loading={saving}>
              저장
            </Button>
          </>
        }
      />
      <div className="editor">
        <div className="editor__main">
          <Card title="기본 정보" icon="file">
            <div className="form-grid">
              <TextInput label="제목" required maxLength={120} {...field('title')} />
              <TextInput label="SLUG (공개 주소)" required maxLength={80} hint={`/study/${form.slug || 'slug'}`} {...field('slug')} />
              <SelectInput label="분류" value={form.category} error={errors.category} onChange={(event) => setField('category', event.target.value)} options={[{ value: 'study', label: '학습 정리' }, { value: 'troubleshooting', label: '문제 해결' }]} />
              <TextInput label="학습일" type="date" required max={kstDateKey()} {...field('learnedAt')} />
              <TextInput className="form-grid__full" label="요약 (목록용)" maxLength={300} {...field('summary')} />
              <TextInput className="form-grid__full" label="내용 (Markdown)" multiline rows={18} required maxLength={50000} hint="## 제목, - 목록, ```코드``` 를 사용할 수 있습니다." {...field('content')} />
            </div>
          </Card>
          <Card title="연결" icon="link">
            <div className="form-grid form-grid--single">
              <ReferencePicker label="관련 기술" options={skillOptions(skills.data)} value={form.skillIds} onChange={(value) => setField('skillIds', value)} max={20} error={errors.skillIds} />
              <ReferencePicker label="관련 프로젝트" options={projectOptions} value={form.projectIds} onChange={(value) => setField('projectIds', value)} max={10} error={errors.projectIds} />
              <TextInput label="태그 (쉼표로 구분)" hint="소문자·숫자·한글·하이픈, 최대 10개" {...field('tags')} />
            </div>
          </Card>
        </div>
        <aside className="editor__side">
          <Card title="공개 설정" icon="eye">
            <div className="setting-row">
              <span>사이트에 공개</span>
              <Toggle checked={form.visibility === 'public'} onChange={(on) => setField('visibility', on ? 'public' : 'private')} label="사이트에 공개" onLabel="공개" offLabel="비공개" />
            </div>
          </Card>
          <Card title="저장 상태" icon="history">
            {dirty ? <Notice tone="amber" icon="alert">저장되지 않은 변경사항</Notice> : <Notice tone="aqua" icon="check">{record ? '서버에 저장된 내용과 같습니다' : '아직 저장하지 않았습니다'}</Notice>}
            {record ? (
              <dl className="meta-list">
                <div>
                  <dt>생성일</dt>
                  <dd>{formatDateTime(record.createdAt)}</dd>
                </div>
                <div>
                  <dt>마지막 수정</dt>
                  <dd>{formatDateTime(record.updatedAt)}</dd>
                </div>
              </dl>
            ) : null}
            <FormMessage>{saveState.status === 'error' ? saveState.message : ''}</FormMessage>
          </Card>
          {record ? (
            <Card title="위험 구역" icon="alert-triangle" tone="danger">
              <Button variant="danger-outline" block iconLeft="trash" onClick={() => setDeleting(true)}>
                학습 기록 삭제
              </Button>
            </Card>
          ) : null}
        </aside>
      </div>
      {record ? (
        <ConfirmDeleteModal open={deleting} onClose={() => setDeleting(false)} title="학습 기록을 삭제할까요?" name={record.title} description="삭제한 글은 되돌릴 수 없습니다." onConfirm={confirmDelete} />
      ) : null}
    </form>
  )
}
