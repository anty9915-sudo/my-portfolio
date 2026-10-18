import { useMemo } from 'react'
import { useApi } from '../hooks/useApi.js'
import { api } from '../services/api.js'
import { ProfileContext } from './profileContext.js'

export function ProfileProvider({ children }) {
  const query = useApi(
    (signal) =>
      api.profile({ signal }).catch((error) => {
        if (error?.status === 404) return { data: null, meta: { missing: true } }
        throw error
      }),
    [],
  )

  const value = useMemo(() => {
    let status = 'loading'
    if (query.status === 'error') status = 'error'
    else if (query.hasLoaded) status = query.meta?.missing ? 'missing' : 'ready'
    return { status, profile: query.data, error: query.error, reload: query.reload }
  }, [query.status, query.hasLoaded, query.meta, query.data, query.error, query.reload])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
