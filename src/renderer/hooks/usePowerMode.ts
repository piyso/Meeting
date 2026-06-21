import { useState, useEffect, useCallback } from 'react'

/**
 * Power mode hook using Electron's powerMonitor (via IPC).
 *
 * The Web Battery API (navigator.getBattery()) silently fails in Electron.
 * This hook uses the main process powerMonitor for reliable battery detection.
 */
export function usePowerMode() {
  const [isPowerSaveMode, setIsPowerSaveMode] = useState(false)
  const [isOnBattery, setIsOnBattery] = useState(false)

  const checkPowerStatus = useCallback(async () => {
    try {
      // Use Electron's powerMonitor via IPC (reliable in Electron)
      const result = await window.electronAPI?.power?.getStatus?.()
      if (result?.success) {
        const onBattery = result.data?.isOnBattery ?? false
        setIsOnBattery(onBattery)
        // Enable power save mode if running on battery
        setIsPowerSaveMode(onBattery)
      }
    } catch (err) {
      console.debug(
        '[usePowerMode] IPC power check failed, trying Web Battery API:',
        err instanceof Error ? err.message : String(err)
      )
      if ('getBattery' in navigator) {
        try {
          const battery = await (
            navigator as unknown as {
              getBattery: () => Promise<{ charging: boolean; level: number }>
            }
          ).getBattery()
          setIsOnBattery(!battery.charging)
          setIsPowerSaveMode(!battery.charging && battery.level < 0.3)
        } catch (batteryErr) {
          console.debug(
            '[usePowerMode] Web Battery API also failed:',
            batteryErr instanceof Error ? batteryErr.message : String(batteryErr)
          )
          setIsPowerSaveMode(false)
        }
      }
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkPowerStatus()

    // Listen for power state changes from the main process
    const unsubscribe = window.electronAPI?.on?.powerStateChanged?.(state => {
      setIsOnBattery(state.isOnBattery)
      setIsPowerSaveMode(state.isOnBattery)
    })

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [checkPowerStatus])

  return { isPowerSaveMode, isOnBattery }
}
