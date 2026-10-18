import { useReveal } from '../hooks/useReveal.js'

/** 스크롤 진입 시 아래에서 올라오며 나타나는 블록 (index로 80ms씩 순차 지연) */
export function Reveal({ as: Element = 'div', index = 0, className, style, children, ...rest }) {
  const [ref, visible] = useReveal()
  return (
    <Element
      ref={ref}
      className={['reveal', visible && 'is-visible', className].filter(Boolean).join(' ')}
      style={{ ...style, '--reveal-index': index }}
      {...rest}
    >
      {children}
    </Element>
  )
}
