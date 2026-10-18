import { useCallback, useState } from 'react'
import { Icon } from '../common/Icon.jsx'
import { ErrorState, LoadingState } from '../common/StateView.jsx'
import { useToast } from '../common/toastContext.js'
import { Button, Notice, TextInput, Toggle } from '../common/ui.jsx'
import { useApi } from '../hooks/useApi.js'
import { formatDateTime, toDateInput } from '../lib/format.js'
import { Link } from '../lib/router.jsx'
import { useRouter } from '../lib/routerCore.js'
import { api } from '../services/api.js'
import { skillOptions } from './adminContext.js'
import { Card, ConfirmDeleteModal, FormMessage, ListEditor, PageHeader, ReferencePicker } from './parts.jsx'
import { emptyToNull, parseTags, SLUG_PATTERN, useResourceForm } from './useResourceForm.js'

function toForm(record) {
  return {
    title: record?.title ?? '',
    slug: record?.slug ?? '',
    summary: record?.summary ?? '',
    description: record?.description ?? '',
    role: record?.role ?? '',
    teamSize: record?.teamSize ? String(record.teamSize) : '',
    highlights: record?.highlights ?? [],
    startedAt: toDateInput(record?.startedAt),
    endedAt: toDateInput(record?.endedAt),
    skillIds: record?.skillIds ?? [],
    tags: (record?.tags ?? []).join(', '),
    githubUrl: record?.githubUrl ?? '',
    demoUrl: record?.demoUrl ?? '',
    thumbnailUrl: record?.thumbnailUrl ?? '',
    featured: record?.featured ?? false,
    sortOrder: String(record?.sortOrder ?? 0),
    visibility: record?.visibility ?? 'private',
  }
}

function toPayload(form) {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    role: emptyToNull(form.role),
    teamSize: form.teamSize ? Number(form.teamSize) : null,
    highlights: form.highlights.map((item) => item.trim()).filter(Boolean),
    startedAt: form.startedAt,
    endedAt: form.endedAt || null,
    skillIds: form.skillIds,
    tags: parseTags(form.tags),
    githubUrl: emptyToNull(form.githubUrl),
    demoUrl: emptyToNull(form.demoUrl),
    thumbnailUrl: emptyToNull(form.thumbnailUrl),
    featured: form.featured,
    sortOrder: Number(form.sortOrder) || 0,
    visibility: form.visibility,
  }
}

function validate(form) {
  const errors = {}
  if (!form.title.trim()) errors.title = '제목을 입력해 주세요.'
  if (!SLUG_PATTERN.test(form.slug.trim()) || form.slug.trim().length < 3) errors.slug = '소문자·숫자·하이픈 3~80자로 입력해 주세요.'
  if (!form.summary.trim()) errors.summary = '한 줄 설명을 입력해 주세요.'
  if (!form.description.trim()) errors.description = '상세 설명을 입력해 주세요.'
  if (!form.startedAt) errors.startedAt = '시작일을 선택해 주세요.'
  if (form.endedAt && form.startedAt && form.endedAt < form.startedAt) errors.endedAt = '시작일 이후 날짜여야 합니다.'
  return errors
}

/** 07 · 프로젝트 등록·수정: POST /admin/projects · PATCH /admin/projects/:id */
export function ProjectEditPage({ id }) {
  const { navigate } = useRouter()
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)
  const skills = useApi((signal) => api.admin.skills(undefined, { signal }), [])
  const onCreated = useCallback((record) => navigate(`/admin/projects/${record.id}`, { replace: true }), [navigate])
  const editor = useResourceForm({
    id,
    label: '프로젝트',
    load: (projectId, signal) => api.admin.project(projectId, { signal }),
    create: api.admin.createProject,
    update: api.admin.updateProject,
    toForm,
    toPayload,
    validate,
    onCreated,
  })
  const { query, record, form, setField, errors, dirty, save, saveState, saving } = editor

  if (query.status === 'error') return <ErrorState error={query.error} onRetry={query.reload} />
  if (id && !record) return <LoadingState compact />

  const field = (name) => ({ value: form[name], error: errors[name], onChange: (event) => setField(name, event.target.value) })
  const slugChanged = Boolean(record && form.slug.trim() !== record.slug && record.publishedAt)
  const canPreview = record?.visibility === 'public' && !dirty

  const onSubmit = (event) => {
    event.preventDefault()
    save()
  }

  const confirmDelete = async () => {
    await api.admin.deleteProject(record.id)
    toast({ title: '삭제되었습니다', body: `${record.title} 프로젝트를 삭제했습니다.` })
    navigate('/admin/projects', { replace: true })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        back={
          <Link to="/admin/projects" className="admin-back">
            <Icon name="arrow-left" size={15} />
            프로젝트 목록으로
          </Link>
        }
        title={record ? `${record.title} 수정` : '새 프로젝트'}
        actions={
          <>
            {canPreview ? (
              <Button variant="secondary" iconLeft="eye" href={`/projects/${encodeURIComponent(record.slug)}`}>
                미리보기
              </Button>
            ) : (
              <Button variant="secondary" iconLeft="eye" disabled title="공개 상태로 저장한 뒤 공개 페이지에서 확인할 수 있습니다.">
                미리보기
              </Button>
            )}
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
              <TextInput label="제목" required maxLength={100} {...field('title')} />
              <TextInput label="SLUG (공개 주소)" required maxLength={80} hint={`/projects/${form.slug || 'slug'}`} {...field('slug')} />
              {slugChanged ? <Notice tone="amber" icon="alert-triangle" className="form-grid__full">slug를 바꾸면 기존 공개 주소로는 접근할 수 없습니다 (리다이렉트 기능 없음).</Notice> : null}
              <TextInput className="form-grid__full" label="한 줄 설명 (목록 카드용)" required maxLength={200} {...field('summary')} />
              <TextInput
                className="form-grid__full"
                label="상세 설명 (Markdown)"
                multiline
                rows={14}
                required
                maxLength={20000}
                hint="## 제목으로 나눈 단락은 상세 페이지에서 번호가 붙은 섹션과 목차로 표시됩니다."
                {...field('description')}
              />
            </div>
          </Card>

          <Card title="대표 이미지" icon="image" description="이미지 업로드 API가 없어 https 이미지 주소만 입력할 수 있습니다. 비워 두면 콘셉트 아트를 표시합니다.">
            <div className="thumb-field">
              <div className="thumb-field__preview">
                {form.thumbnailUrl.startsWith('https://') ? <img src={form.thumbnailUrl} alt="대표 이미지 미리보기" /> : <Icon name="image" size={28} />}
              </div>
              <TextInput label="이미지 URL" type="url" placeholder="https://" {...field('thumbnailUrl')} />
            </div>
          </Card>

          <Card title="기술 스택" icon="layers">
            {skills.status === 'error' ? (
              <ErrorState error={skills.error} onRetry={skills.reload} compact />
            ) : (
              <ReferencePicker
                options={skillOptions(skills.data)}
                value={form.skillIds}
                onChange={(value) => setField('skillIds', value)}
                max={30}
                error={errors.skillIds}
                emptyLabel={skills.hasLoaded ? '등록된 기술이 없습니다. 기술 스택 메뉴에서 먼저 추가해 주세요.' : '불러오는 중…'}
              />
            )}
          </Card>

          <Card title="주요 성과" icon="list-checks" description="상세 페이지의 '주요 성과' 카드로 표시됩니다. 기능별 구현/계획 상태는 현재 API에서 지원하지 않습니다.">
            <ListEditor items={form.highlights} onChange={(value) => setField('highlights', value)} max={10} placeholder="예: 상품 등록과 검색" error={errors.highlights} addLabel="성과 추가" />
          </Card>

          <Card title="역할 · 기간 · 링크" icon="calendar">
            <div className="form-grid">
              <TextInput label="담당 역할" maxLength={200} placeholder="예: 기획 · DB 설계 · API · 프론트" hint="'·' 또는 ','로 나누면 상세 페이지에서 목록으로 보여 줍니다." {...field('role')} />
              <TextInput label="팀 인원" type="number" min={1} max={50} placeholder="1이면 개인 프로젝트" {...field('teamSize')} />
              <TextInput label="시작일" type="date" required {...field('startedAt')} />
              <TextInput label="종료일" type="date" hint="비워 두면 '진행 중'으로 표시됩니다." {...field('endedAt')} />
              <TextInput label="GitHub URL" type="url" placeholder="https://github.com/…" {...field('githubUrl')} />
              <TextInput label="데모 URL" type="url" placeholder="https://" {...field('demoUrl')} />
              <TextInput className="form-grid__full" label="태그 (쉼표로 구분)" placeholder="예: 중고거래-플랫폼, 실시간" hint="소문자·숫자·한글·하이픈, 최대 10개. 공개 화면에서 부제처럼 표시됩니다." {...field('tags')} />
            </div>
          </Card>
        </div>

        <aside className="editor__side">
          <Card title="공개 설정" icon="eye">
            <div className="setting-row">
              <span>사이트에 공개</span>
              <Toggle checked={form.visibility === 'public'} onChange={(on) => setField('visibility', on ? 'public' : 'private')} label="사이트에 공개" onLabel="공개" offLabel="비공개" />
            </div>
            <div className="setting-row">
              <span>대표 프로젝트</span>
              <Toggle checked={form.featured} onChange={(on) => setField('featured', on)} label="대표 프로젝트" onLabel="대표" offLabel="일반" />
            </div>
            <TextInput label="정렬 순서 (작을수록 앞)" type="number" min={0} max={9999} {...field('sortOrder')} />
          </Card>

          <Card title="저장 상태" icon="history">
            {dirty ? (
              <Notice tone="amber" icon="alert">저장되지 않은 변경사항</Notice>
            ) : (
              <Notice tone="aqua" icon="check">{record ? '서버에 저장된 내용과 같습니다' : '아직 저장하지 않았습니다'}</Notice>
            )}
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
                <div>
                  <dt>처음 공개</dt>
                  <dd>{record.publishedAt ? formatDateTime(record.publishedAt) : '—'}</dd>
                </div>
              </dl>
            ) : null}
            <FormMessage>{saveState.status === 'error' ? saveState.message : ''}</FormMessage>
          </Card>

          {record ? (
            <Card title="위험 구역" icon="alert-triangle" tone="danger" description="삭제하면 되돌릴 수 없습니다. 삭제 전 확인 창이 표시됩니다.">
              <Button variant="danger-outline" block iconLeft="trash" onClick={() => setDeleting(true)}>
                프로젝트 삭제
              </Button>
            </Card>
          ) : null}
        </aside>
      </div>

      {record ? (
        <ConfirmDeleteModal
          open={deleting}
          onClose={() => setDeleting(false)}
          title="프로젝트를 삭제할까요?"
          name={record.title}
          description="삭제하면 프로젝트의 상세 내용과 학습 기록의 연결이 함께 제거됩니다. 이 작업은 되돌릴 수 없습니다."
          confirmText={record.title}
          onConfirm={confirmDelete}
        />
      ) : null}
    </form>
  )
}

