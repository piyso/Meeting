import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'

export function useSystemState() {
  const setCurrentTier = useAppStore(s => s.setCurrentTier)
  const setQuotaData = useAppStore(s => s.setQuotaData)
  const setDeviceInfo = useAppStore(s => s.setDeviceInfo)

  useEffect(() => {
    const loadUserData = async () => {
      // OPT: Fire all 3 IPC calls in parallel instead of sequentially.
      // Saves ~200ms since each call waits for IPC round-trip.
      const [userRes, quotaRes, devRes] = await Promise.allSettled([
        window.electronAPI?.auth?.getCurrentUser(),
        window.electronAPI?.quota?.check(),
        window.electronAPI?.device?.list({ activeOnly: true }),
      ])

      if (userRes.status === 'fulfilled' && userRes.value?.success && userRes.value.data) {
        setCurrentTier(userRes.value.data.tier)
      }

      if (quotaRes.status === 'fulfilled' && quotaRes.value?.success && quotaRes.value.data) {
        setQuotaData(
          quotaRes.value.data as {
            used: number
            limit: number
            remaining: number
            exhausted: boolean
          }
        )
      }

      if (
        devRes.status === 'fulfilled' &&
        devRes.value?.success &&
        Array.isArray(devRes.value.data)
      ) {
        setDeviceInfo({ count: devRes.value.data.length })
      }
    }

    loadUserData()

    // Periodic quota refresh so exhaustion is detected mid-session
    const quotaInterval = setInterval(async () => {
      if (document.visibilityState === 'hidden') return
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
        /* ignore */
      }
    }, 60_000) // Every 60 seconds

    const onTierRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.tier) setCurrentTier(detail.tier)
      loadUserData() // Re-fetch quota with new tier
    }

    window.addEventListener('tier-refreshed', onTierRefresh)
    return () => {
      window.removeEventListener('tier-refreshed', onTierRefresh)
      clearInterval(quotaInterval)
    }
  }, [setCurrentTier, setQuotaData, setDeviceInfo])

  // Auto tier-refresh on focus
  useEffect(() => {
    let lastCheck = 0
    const COOLDOWN_MS = 10_000 // Don't spam: max once per 10s

    const onFocus = async () => {
      if (!document.hasFocus()) return // Ignore programmatic focus events
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
      unsub = window.electronAPI?.on?.showIntelligenceWall(
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
