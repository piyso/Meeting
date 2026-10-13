import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useWebhooks(selectedWebhookId?: string) {
  const queryClient = useQueryClient()

  const { data: webhooks = [], isLoading } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const res = await window.electronAPI?.webhook?.list?.()
      if (!res?.success) throw new Error(res?.error?.message ?? 'Failed to fetch webhooks')
      return res.data ?? []
    },
    initialData: [],
  })

  const { data: logs = [] } = useQuery({
    queryKey: ['webhooks', 'logs', selectedWebhookId],
    queryFn: async () => {
      if (!selectedWebhookId) return []
      const res = await (
        window.electronAPI?.webhook as unknown as {
          getDeliveries?: (params: {
            webhookId: string
          }) => Promise<{ success: boolean; data?: unknown[] }>
        }
      )?.getDeliveries?.({ webhookId: selectedWebhookId })
      return res?.success && Array.isArray(res.data) ? res.data : []
    },
    enabled: !!selectedWebhookId,
    initialData: [],
  })

  const saveWebhook = useMutation({
    mutationFn: async (payload: {
      id?: string
      url: string
      events: string[]
      is_active?: number
    }) => {
      const res = payload.id
        ? await window.electronAPI?.webhook?.update?.({
            id: payload.id,
            updates: {
              url: payload.url,
              events:
                payload.events as unknown as import('../../../types/features').WebhookEventType[],
              is_active: payload.is_active,
            },
          })
        : await window.electronAPI?.webhook?.create?.({
            url: payload.url,
            events: payload.events,
            description: undefined,
          })
      if (!res?.success) throw new Error(res?.error?.message ?? 'Webhook save failed')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  const removeWebhook = useMutation({
    mutationFn: async (id: string) => {
      const res = await window.electronAPI?.webhook?.delete?.({ id })
      if (!res?.success) throw new Error(res?.error?.message ?? 'Webhook delete failed')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] })
    },
  })

  return { webhooks, logs, isLoading, saveWebhook, removeWebhook }
}
