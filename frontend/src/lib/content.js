import aboutRoom from '../assets/scenes/about-room.webp'
import contactDawn from '../assets/scenes/contact-dawn.webp'
import detailAlley from '../assets/scenes/detail-alley.webp'
import heroCity from '../assets/scenes/hero-city.webp'
import projectArena from '../assets/scenes/project-arena.webp'
import projectMarket from '../assets/scenes/project-market.webp'
import projectSky from '../assets/scenes/project-sky.webp'
import studyLibrary from '../assets/scenes/study-library.webp'

/*
 * 화면 표시 규칙 — 서버 enum 값을 화면 라벨·색·아이콘으로 바꾼다 (DATABASE.md 3장: 라벨은 프론트엔드에서 매핑).
 */

/** 장면 일러스트 (Pen 키 비주얼 라이브러리) */
export const SCENES = {
  hero: heroCity,
  about: aboutRoom,
  study: studyLibrary,
  contact: contactDawn,
  detail: detailAlley,
}

/** 대표 이미지(thumbnailUrl)가 없는 프로젝트에 순서대로 쓰는 콘셉트 아트와 장면 색 */
export const PROJECT_ART = [
  { src: projectMarket, tone: 'aqua' },
  { src: projectSky, tone: 'lilac' },
  { src: projectArena, tone: 'crimson' },
]

export function projectArt(index) {
  return PROJECT_ART[index % PROJECT_ART.length]
}

/** 태그(소문자·하이픈)를 부제처럼 읽히게 바꾼다: ['중고거래-플랫폼'] → '중고거래 플랫폼' */
export function formatTags(tags) {
  return tags.map((tag) => tag.replace(/-/g, ' ')).join(' · ')
}

/** 기술 상태 → 5칸 게이지 칸 수 */
export const SKILL_LEVEL = { planned: 1, learning: 2, applied: 3, proficient: 4 }
export const SKILL_STATUSES = ['proficient', 'applied', 'learning', 'planned']

/** 공개 화면의 5개 열: 서버 분류 8개를 디자인의 열에 모은다 */
export const SKILL_GROUPS = [
  { key: 'frontend', labelKey: 'skills.groupFrontend', tone: 'aqua', categories: ['frontend', 'language'] },
  { key: 'backend', labelKey: 'skills.groupBackend', tone: 'lilac', categories: ['backend'] },
  { key: 'database', labelKey: 'skills.groupDatabase', tone: 'sakura', categories: ['database'] },
  { key: 'tools', labelKey: 'skills.groupTools', tone: 'amber', categories: ['tool', 'devops'] },
  { key: 'other', labelKey: 'skills.groupOther', tone: 'crimson', categories: ['security', 'other'] },
]

export const SKILL_CATEGORIES = ['language', 'frontend', 'backend', 'database', 'devops', 'security', 'tool', 'other']

export const SKILL_CATEGORY_LABEL = {
  language: 'Language',
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  devops: 'DevOps',
  security: 'Security',
  tool: 'Tools',
  other: 'Other',
}

export const SKILL_CATEGORY_TONE = {
  language: 'aqua',
  frontend: 'aqua',
  backend: 'lilac',
  database: 'sakura',
  devops: 'amber',
  tool: 'amber',
  security: 'crimson',
  other: 'crimson',
}

/** iconKey(소문자·하이픈) → 아이콘. 없으면 분류 아이콘을 쓴다 */
const ICON_BY_KEY = {
  html: 'code',
  html5: 'code',
  css: 'palette',
  css3: 'palette',
  javascript: 'braces',
  js: 'braces',
  typescript: 'braces',
  ts: 'braces',
  react: 'atom',
  vue: 'atom',
  nodejs: 'server',
  node: 'server',
  express: 'route',
  mongodb: 'database',
  postgresql: 'database',
  mysql: 'database',
  supabase: 'cloud',
  firebase: 'cloud',
  git: 'git-branch',
  github: 'github',
  docker: 'layers',
  'web-security': 'shield',
  security: 'shield',
  'rest-api': 'plug',
  api: 'plug',
  'ai-api': 'sparkles',
  ai: 'sparkles',
}

const ICON_BY_CATEGORY = {
  language: 'braces',
  frontend: 'code',
  backend: 'server',
  database: 'database',
  devops: 'layers',
  security: 'shield',
  tool: 'git-branch',
  other: 'sparkles',
}

export function skillIcon(skill) {
  return ICON_BY_KEY[skill.iconKey] ?? ICON_BY_KEY[skill.slug] ?? ICON_BY_CATEGORY[skill.category] ?? 'diamond'
}

/** 문의 상태 (API: new | read | replied | archived) */
export const INQUIRY_STATUS = {
  new: { label: '새 문의', tone: 'amber' },
  read: { label: '확인함', tone: 'lilac' },
  replied: { label: '회신 완료', tone: 'aqua' },
  archived: { label: '보관', tone: 'muted' },
}

export const STUDY_CATEGORIES = ['study', 'troubleshooting']
