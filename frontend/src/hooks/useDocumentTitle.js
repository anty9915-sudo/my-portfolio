import { useEffect } from 'react'

const SITE_TITLE = 'Portfolio'

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SITE_TITLE}` : SITE_TITLE
  }, [title])
}
