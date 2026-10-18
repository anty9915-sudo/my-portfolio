import { useEffect, useRef } from 'react'

/** 배경 일러스트를 스크롤의 factor배만큼 움직인다 (05 · Parallax 0.15). 모션 감소 설정이면 움직이지 않는다. */
export function useParallax(factor = 0.15) {
  const ref = useRef(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      const rect = node.parentElement?.getBoundingClientRect()
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) return
      node.style.transform = `translate3d(0, ${(-rect.top * factor).toFixed(1)}px, 0) scale(1.08)`
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [factor])

  return ref
}
