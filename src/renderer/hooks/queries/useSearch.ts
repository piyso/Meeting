import { useQuery } from '@tanstack/react-query'
import type { SearchParams, SemanticSearchParams } from '../../../types/ipc'

export function useSearch(params: SearchParams, enabled = true) {
  return useQuery({
    queryKey: ['search', params.query, params.namespace, params.limit],
    queryFn: async () => {
      const resp = await window.electronAPI?.search?.query(params)
      if (!resp?.success || !resp?.data) {
        throw new Error(resp?.error?.message || 'Search failed')
      }
      return resp.data
    },
    enabled: enabled && !!params.query && params.query.trim().length > 1,
    staleTime: 60000,
  })
}

export function useSemanticSearch(params: SemanticSearchParams, enabled = true) {
  return useQuery({
    queryKey: ['semanticSearch', params.query, params.namespace, params.limit],
    queryFn: async () => {
      const resp = await window.electronAPI?.search?.semantic(params)
      if (!resp?.success || !resp?.data) {
        throw new Error(resp?.error?.message || 'Semantic search failed')
      }
      return resp.data
    },
    enabled: enabled && !!params.query && params.query.trim().length > 2,
    staleTime: 60000,
  })
}
