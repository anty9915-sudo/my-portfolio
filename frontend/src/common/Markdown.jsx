import { parseInline } from '../lib/markdown.js'

function Inline({ text }) {
  return parseInline(text).map((token, index) => {
    if (token.type === 'code') return <code key={index}>{token.value}</code>
    if (token.type === 'strong') return <strong key={index}>{token.value}</strong>
    if (token.type === 'em') return <em key={index}>{token.value}</em>
    if (token.type === 'link') {
      return (
        <a key={index} href={token.href} target="_blank" rel="noopener noreferrer">
          {token.value}
        </a>
      )
    }
    return <span key={index}>{token.value}</span>
  })
}

function Lines({ text }) {
  const lines = text.split('\n')
  return lines.map((line, index) => (
    <span key={index}>
      <Inline text={line} />
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ))
}

/**
 * parseMarkdown() 결과를 그린다. headingIds를 주면 제목에 id를 붙여 목차에서 이동할 수 있게 한다.
 * @param {{ blocks: ReturnType<typeof import('../lib/markdown.js').parseMarkdown>, headingIds?: Map<number, string> }} props
 */
export function Markdown({ blocks, headingIds, className = 'prose' }) {
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${Math.min(block.level + 1, 5)}`
            return (
              <Tag key={index} id={headingIds?.get(index)}>
                <Inline text={block.text} />
              </Tag>
            )
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul'
            return (
              <Tag key={index} className={block.ordered ? 'prose__ol' : 'prose__ul'}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </Tag>
            )
          }
          case 'quote':
            return (
              <blockquote key={index}>
                <Lines text={block.text} />
              </blockquote>
            )
          case 'code':
            return (
              <pre key={index}>
                <code>{block.text}</code>
              </pre>
            )
          case 'hr':
            return <hr key={index} />
          default:
            return (
              <p key={index}>
                <Lines text={block.text} />
              </p>
            )
        }
      })}
    </div>
  )
}
