import React, { useState, useEffect } from 'react'
import { Laptop, Monitor } from 'lucide-react'
import type { RegisteredDevice } from '../../../types/ipc'
import { useAppStore } from '../../store/appStore'

const PLATFORM_LABELS: Record<string, string> = {
  darwin: 'macOS',
  win32: 'Windows',
  linux: 'Linux',
}

const getIcon = (platform: string) =>
  platform === 'darwin' ? <Laptop size={20} /> : <Monitor size={20} />

/** "12 Oct 2026", or a dash when the date is missing/unparseable */
const formatLastActive = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export const DeviceManagement: React.FC = () => {
  const [devices, setDevices] = useState<RegisteredDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null)
  // Two-step confirm: the first click arms the button for this device
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchDevices = React.useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [listRes, currentRes] = await Promise.all([
        // Include signed-out devices so a deactivated one stays visible as "Inactive"
        window.electronAPI?.device?.list({ activeOnly: false }),
        window.electronAPI?.device?.getCurrent(),
      ])
      if (listRes?.success && listRes.data) {
        setDevices(listRes.data)
      } else if (listRes) {
        setError(listRes.error?.message || 'Failed to load devices')
      }
      if (currentRes?.success && currentRes.data) {
        setCurrentDeviceId(currentRes.data.deviceId || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // Disarm the confirm button if the user walks away from it
  useEffect(() => {
    if (!confirmingId) return
    const timer = setTimeout(() => setConfirmingId(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmingId])

  const deactivateDevice = React.useCallback(
    async (deviceId: string) => {
      if (deviceId === currentDeviceId) return // Safety guard
      if (confirmingId !== deviceId) {
        setConfirmingId(deviceId)
        return
      }
      setConfirmingId(null)
      setBusyId(deviceId)
      try {
        const res = await window.electronAPI?.device?.deactivate({ deviceId })
        if (res?.success) {
          setDevices(prev => prev.map(d => (d.id === deviceId ? { ...d, is_active: false } : d)))
          useAppStore
            .getState()
            .addToast({ type: 'success', title: 'Device deactivated', duration: 3000 })
        } else {
          throw new Error(res?.error?.message || 'Failed to deactivate device')
        }
      } catch (err) {
        useAppStore.getState().addToast({
          type: 'error',
          title: 'Could not deactivate device',
          message: err instanceof Error ? err.message : undefined,
          duration: 4000,
        })
      } finally {
        setBusyId(null)
      }
    },
    [currentDeviceId, confirmingId]
  )

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="text-[var(--color-text-secondary)] text-sm">Loading devices...</div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 text-[var(--color-rose)] text-sm">
          <span>{error}</span>
          <button
            onClick={fetchDevices}
            className="text-[var(--color-text-secondary)] hover:text-white underline text-xs"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="surface-glass-premium border border-[var(--color-border-subtle)] rounded-3xl p-2 shadow-sm overflow-hidden">
          <div className="rounded-2xl overflow-hidden bg-[#1a1a1a]/40">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#1a1a1a] border-b border-[var(--color-border-subtle)]">
                <tr>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3">Device</th>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3">
                    Last Active
                  </th>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3">Status</th>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3"></th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr
                    key={d.id}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[#262626]"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="text-[var(--color-text-tertiary)] bg-[#111] p-2 rounded-lg">
                          {getIcon(d.platform)}
                        </div>
                        <div>
                          <div className="text-[var(--color-text-primary)] font-medium">
                            {d.device_name || d.hostname || 'Unnamed device'}
                          </div>
                          <div className="text-[var(--color-text-tertiary)] text-xs font-mono">
                            {d.app_version ? `v${d.app_version}` : 'Unknown version'} •{' '}
                            {PLATFORM_LABELS[d.platform] || d.platform}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-[var(--color-text-secondary)]">
                      {formatLastActive(d.last_sync_at)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          d.is_active
                            ? 'bg-[var(--color-emerald)]/10 text-[var(--color-emerald)]'
                            : 'bg-[var(--color-text-tertiary)]/10 text-[var(--color-text-tertiary)]'
                        }`}
                      >
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {d.is_active &&
                        (d.id === currentDeviceId ? (
                          <span className="text-[var(--color-text-tertiary)] text-xs px-3 py-1.5">
                            This device
                          </span>
                        ) : (
                          <button
                            onClick={() => deactivateDevice(d.id)}
                            disabled={busyId === d.id}
                            className="text-[var(--color-rose)] hover:bg-[var(--color-rose)]/10 px-3 py-1.5 rounded-md transition-colors font-medium text-xs disabled:opacity-50"
                          >
                            {busyId === d.id
                              ? 'Deactivating…'
                              : confirmingId === d.id
                                ? 'Click to confirm'
                                : 'Deactivate'}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
                {devices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-[var(--color-text-tertiary)]">
                      No devices registered. Devices appear here once you sign in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
