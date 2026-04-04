import React, { useState, useEffect } from 'react'
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Copy,
  Mail,
  Download,
} from 'lucide-react'
import { Button } from '../ui/Button'

interface HealthResult {
  system: string
  status: 'ok' | 'warn' | 'error'
  message: string
  fix?: string
}

interface SystemInfo {
  [key: string]: string
}

export const HealthDashboard: React.FC = () => {
  const [results, setResults] = useState<HealthResult[]>([])
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({})
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const runHealthCheck = async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI?.diagnostic?.healthCheck()
      if (res?.success && res.data) {
        setResults(res.data.results)
        setSystemInfo(res.data.systemInfo)
        setLastChecked(new Date())
      }
    } catch {
      // unavailable
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runHealthCheck()
  }, [])

  const getStatusIcon = (status: HealthResult['status']) => {
    switch (status) {
      case 'ok':
        return <CheckCircle size={16} className="text-[var(--color-emerald)]" />
      case 'warn':
        return <AlertTriangle size={16} className="text-[var(--color-amber)]" />
      case 'error':
        return <XCircle size={16} className="text-[var(--color-rose)]" />
    }
  }

  const getStatusDot = (status: HealthResult['status']) => {
    const colors = {
      ok: 'bg-[var(--color-emerald)]',
      warn: 'bg-[var(--color-amber)]',
      error: 'bg-[var(--color-rose)]',
    }
    return (
      <div className={`w-2 h-2 rounded-full ${colors[status]} shadow-[0_0_6px_currentColor]`} />
    )
  }

  const errorCount = (results || []).filter(r => r.status === 'error').length
  const warnCount = (results || []).filter(r => r.status === 'warn').length

  const copyReport = () => {
    const lines = [
      '═══ BlueArkive Health Report ═══',
      '',
      ...results.map(r => {
        const icon = r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️' : '❌'
        return `${icon} ${r.system}: ${r.message}${r.fix ? ` → ${r.fix}` : ''}`
      }),
      '',
      '─── System Info ───',
      ...Object.entries(systemInfo).map(([k, v]) => `${k}: ${v}`),
      '',
      `Checked: ${lastChecked?.toISOString() || 'N/A'}`,
    ]
    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {
        /* clipboard unavailable */
      })
  }

  const emailReport = () => {
    const body = results
      .map(r => {
        const icon = r.status === 'ok' ? '✅' : r.status === 'warn' ? '⚠️' : '❌'
        return `${icon} ${r.system}: ${r.message}`
      })
      .join('\n')
    const sysInfo = Object.entries(systemInfo)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')
    const mailto = `mailto:support@bluearkive.com?subject=BlueArkive Health Report&body=${encodeURIComponent(`Health Check Results:\n\n${body}\n\nSystem Info:\n${sysInfo}`)}`
    window.electronAPI?.shell?.openExternal(mailto)
  }

  const handleExportDiagnostics = () => {
    window.electronAPI?.diagnostic?.export()
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-sky)]/10 flex items-center justify-center">
            <Activity size={18} className="text-[var(--color-sky)]" />
          </div>
          <div>
            <h3 className="text-[var(--text-base)] font-semibold text-[var(--color-text-primary)]">
              System Health
            </h3>
            {lastChecked && (
              <p className="text-[11px] text-[var(--color-text-tertiary)]">
                Last checked {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={runHealthCheck} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span className="ml-1.5">{loading ? 'Checking...' : 'Run Diagnostics'}</span>
        </Button>
      </div>

      {/* Summary badge */}
      {results.length > 0 && (
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium ${
            errorCount > 0
              ? 'bg-[var(--color-rose)]/10 text-[var(--color-rose)]'
              : warnCount > 0
                ? 'bg-[var(--color-amber)]/10 text-[var(--color-amber)]'
                : 'bg-[var(--color-emerald)]/10 text-[var(--color-emerald)]'
          }`}
        >
          {errorCount > 0 ? (
            <>
              <XCircle size={14} /> {errorCount} issue{errorCount > 1 ? 's' : ''} need attention
            </>
          ) : warnCount > 0 ? (
            <>
              <AlertTriangle size={14} /> {warnCount} warning{warnCount > 1 ? 's' : ''}
            </>
          ) : (
            <>
              <CheckCircle size={14} /> All systems operational
            </>
          )}
        </div>
      )}

      {/* Results list */}
      <div className="surface-glass-premium rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] overflow-hidden divide-y divide-[var(--color-border-subtle)]">
        {results.map((r, i) => (
          <div
            key={i}
            className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              {getStatusIcon(r.status)}
              <div className="min-w-0">
                <span className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
                  {r.system}
                </span>
                <p className="text-[11px] text-[var(--color-text-tertiary)] truncate">
                  {r.message}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getStatusDot(r.status)}
              {r.fix && r.status !== 'ok' && (
                <span className="text-[11px] text-[var(--color-sky)] font-medium whitespace-nowrap">
                  {r.fix}
                </span>
              )}
            </div>
          </div>
        ))}
        {results.length === 0 && !loading && (
          <div className="px-4 py-8 text-center text-[var(--color-text-tertiary)] text-sm">
            Click "Run Diagnostics" to check all systems
          </div>
        )}
        {loading && results.length === 0 && (
          <div className="px-4 py-8 text-center text-[var(--color-text-tertiary)] text-sm">
            <RefreshCw size={16} className="animate-spin inline-block mr-2" />
            Testing all systems...
          </div>
        )}
      </div>

      {/* Actions */}
      {results.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" size="sm" onClick={copyReport}>
            <Copy size={14} />
            <span className="ml-1.5">{copied ? 'Copied!' : 'Copy Report'}</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={emailReport}>
            <Mail size={14} />
            <span className="ml-1.5">Email Support</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportDiagnostics}>
            <Download size={14} />
            <span className="ml-1.5">Export Logs ZIP</span>
          </Button>
        </div>
      )}
    </div>
  )
}
