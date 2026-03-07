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
    } catch {
      // Fallback: try Web Battery API (may work in some Electron versions)
      if ('getBattery' in navigator) {
        try {
          const battery = await (
            navigator as unknown as {
              getBattery: () => Promise<{ charging: boolean; level: number }>
            }
          ).getBattery()
          setIsOnBattery(!battery.charging)
          setIsPowerSaveMode(!battery.charging && battery.level < 0.3)
        } catch {
          // Neither method works — assume plugged in
          setIsPowerSaveMode(false)
        }
      }
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkPowerStatus()

    // Poll every 30 seconds for power status changes
    const interval = setInterval(checkPowerStatus, 30_000)

    return () => clearInterval(interval)
  }, [checkPowerStatus])

  return { isPowerSaveMode, isOnBattery }
}
