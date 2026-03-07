import React, { useState, useEffect } from 'react'
import { Laptop, Smartphone, Monitor } from 'lucide-react'

interface Device {
  device_id: string
  device_name?: string
  hostname?: string
  platform: string
  app_version?: string
  is_active: number
  last_active_at: string
}

export const DeviceManagement: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null)

  useEffect(() => {
    fetchDevices()
  }, [])

  const fetchDevices = async () => {
    try {
      setLoading(true)
      const [listRes, currentRes] = await Promise.all([
        window.electronAPI.device.list(),
        window.electronAPI.device.getCurrent(),
      ])
      if (listRes.success && listRes.data) {
        setDevices(listRes.data as Device[])
      } else {
        setError(listRes.error?.message || 'Failed to load devices')
      }
      if (currentRes.success && currentRes.data) {
        setCurrentDeviceId(currentRes.data.deviceId || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const deactivateDevice = async (deviceId: string) => {
    if (deviceId === currentDeviceId) return // Safety guard
    try {
      const res = await window.electronAPI.device.deactivate({ deviceId, userId: 'current-user' })
      if (res.success) {
        setDevices(prev => prev.map(d => (d.device_id === deviceId ? { ...d, is_active: 0 } : d)))
      } else {
        setError(res.error?.message || 'Failed to deactivate device')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate device')
    }
  }

  const getIcon = (platform: string) => {
    if (platform.includes('mac') || platform.includes('win')) return <Monitor size={20} />
    if (platform.includes('ios') || platform.includes('android')) return <Smartphone size={20} />
    return <Laptop size={20} />
  }

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="text-[var(--color-text-secondary)] text-sm">Loading devices...</div>
      ) : error ? (
        <div className="text-[var(--color-rose)] text-sm">{error}</div>
      ) : (
        <div className="surface-glass-premium rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#1a1a1a] border-b border-[var(--color-border-subtle)]">
              <tr>
                <th className="font-medium text-[var(--color-text-secondary)] p-3">Device</th>
                <th className="font-medium text-[var(--color-text-secondary)] p-3">Last Active</th>
                <th className="font-medium text-[var(--color-text-secondary)] p-3">Status</th>
                <th className="font-medium text-[var(--color-text-secondary)] p-3"></th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr
                  key={d.device_id}
                  className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[#262626]"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="text-[var(--color-text-tertiary)] bg-[#111] p-2 rounded-lg">
                        {getIcon(d.platform)}
                      </div>
                      <div>
                        <div className="text-[var(--color-text-primary)] font-medium">
                          {d.device_name || d.hostname}
                        </div>
                        <div className="text-[var(--color-text-tertiary)] text-xs font-mono">
                          {d.app_version || 'Unknown Ver.'} • {d.platform}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-[var(--color-text-secondary)]">
                    {new Date(d.last_active_at).toLocaleDateString()}
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
                    {d.is_active === 1 &&
                      (d.device_id === currentDeviceId ? (
                        <span className="text-[var(--color-text-tertiary)] text-xs px-3 py-1.5">
                          This device
                        </span>
                      ) : (
                        <button
                          onClick={() => deactivateDevice(d.device_id)}
                          className="text-[var(--color-rose)] hover:bg-[var(--color-rose)]/10 px-3 py-1.5 rounded-md transition-colors font-medium text-xs"
                        >
                          Deactivate
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-[var(--color-text-tertiary)]">
                    No devices registered.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
