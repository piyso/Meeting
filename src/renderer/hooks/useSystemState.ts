import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function useSystemState() {
  const setCurrentTier = useAppStore(s => s.setCurrentTier)
  const setQuotaData = useAppStore(s => s.setQuotaData)
  const setDeviceInfo = useAppStore(s => s.setDeviceInfo)

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const userRes = await window.electronAPI?.auth?.getCurrentUser()
        if (userRes?.success && userRes.data) {
          setCurrentTier(userRes.data.tier)
        }
      } catch {
        /* not logged in */
      }

      try {
        const quotaRes = await window.electronAPI?.quota?.check()
        if (quotaRes?.success && quotaRes.data) {
          setQuotaData(
            quotaRes.data as {
              used: number
              limit: number
              remaining: number
              exhausted: boolean
            }
          )
        }
      } catch {
        /* quota check failed, defaults remain */
      }

      try {
        const devRes = await window.electronAPI?.device?.list({ activeOnly: true })
        if (devRes?.success && Array.isArray(devRes.data)) {
          setDeviceInfo({ count: devRes.data.length })
        }
      } catch {
        /* device list failed */
      }
    }

    loadUserData()

    const onTierRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.tier) setCurrentTier(detail.tier)
      loadUserData() // Re-fetch quota with new tier
    }

    window.addEventListener('tier-refreshed', onTierRefresh)
    return () => window.removeEventListener('tier-refreshed', onTierRefresh)
  }, [setCurrentTier, setQuotaData, setDeviceInfo])

  // Auto tier-refresh on focus
  useEffect(() => {
    let lastCheck = 0
    const COOLDOWN_MS = 10_000 // Don't spam: max once per 10s

    const onFocus = async () => {
      const now = Date.now()
      if (now - lastCheck < COOLDOWN_MS) return
      lastCheck = now

      try {
        const res = await window.electronAPI?.auth?.refreshProfile()
        if (res?.success && res.data) {
          window.dispatchEvent(new CustomEvent('tier-refreshed', { detail: res.data }))
        }
      } catch {
        // Ignore — user may not be logged in or offline
      }
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  // Wire intelligence wall IPC event
  useEffect(() => {
    let unsub: (() => void) | undefined
    if (window.electronAPI?.on?.showIntelligenceWall) {
      unsub = window.electronAPI.on.showIntelligenceWall(
        (data: { used: number; limit: number }) => {
          // Update quota in store to reflect exhaustion immediately
          useAppStore.getState().setQuotaData({
            used: data.used,
            limit: data.limit,
            remaining: 0,
            exhausted: true,
          })
          window.dispatchEvent(new CustomEvent('show-intelligence-wall'))
        }
      )
    }
    return () => {
      if (unsub) unsub()
    }
  }, [])
}
