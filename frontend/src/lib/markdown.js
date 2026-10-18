/*
 * 저장된 Markdown(description·content·bio)을 블록 단위로 나눈다.
 * HTML 문자열을 만들지 않고 React 요소로만 그리므로 사용자 입력이 HTML로 해석되지 않는다.
 * 지원: 제목(#~####), 문단, 목록(-, *, 1.), 인용(>), 코드 블록(```), 구분선(---)
 */

export function parseMarkdown(source = '') {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let paragraph = []
  let list = null
  let quote = []

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join('\n') })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push(list)
    list = null
  }
  const flushQuote = () => {
    if (quote.length) blocks.push({ type: 'quote', text: quote.join('\n') })
    quote = []
  }
  const flushAll = () => {
    flushParagraph()
    flushList()
    flushQuote()
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/)
    if (fence) {
      flushAll()
      const code = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      blocks.push({ type: 'code', lang: fence[1] || null, text: code.join('\n') })
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      flushAll()
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushAll()
      blocks.push({ type: 'hr' })
      continue
    }

    const quoteLine = line.match(/^\s*>\s?(.*)$/)
    if (quoteLine) {
      flushParagraph()
      flushList()
      quote.push(quoteLine[1])
      continue
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (bullet || numbered) {
      flushParagraph()
      flushQuote()
      const ordered = Boolean(numbered)
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { type: 'list', ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)[1])
      continue
    }

    flushList()
    flushQuote()
    paragraph.push(line.trim())
  }
  flushAll()
  return blocks
}

/** 인라인 서식: `코드`, **굵게**, *기울임*, [링크](https://…) */
export function parseInline(text) {
  const tokens = []
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) tokens.push({ type: 'text', value: text.slice(last, match.index) })
    const [value] = match
    if (match[1]) tokens.push({ type: 'code', value: value.slice(1, -1) })
    else if (match[2]) tokens.push({ type: 'strong', value: value.slice(2, -2) })
    else if (match[3]) tokens.push({ type: 'em', value: value.slice(1, -1) })
    else {
      const link = value.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      tokens.push(isSafeUrl(link[2]) ? { type: 'link', value: link[1], href: link[2] } : { type: 'text', value: link[1] })
    }
    last = match.index + value.length
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) })
  return tokens
}

export function isSafeUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function slugifyHeading(text, index) {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `${base || 'section'}-${index}`
}
