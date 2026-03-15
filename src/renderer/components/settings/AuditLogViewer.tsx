import React, { useState, useEffect, useCallback } from 'react'
import { Shield, Download, ChevronDown } from 'lucide-react'
import { Button } from '../ui/Button'

interface AuditLogEntry {
  id?: string
  timestamp: string
  operation: string
  table: string
  recordId?: string
  ipAddress?: string
  userAgent?: string
}

const PAGE_SIZE = 50

export const AuditLogViewer: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)

  const fetchLogs = useCallback(async (currentOffset: number, append: boolean) => {
    try {
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      const res = await window.electronAPI?.audit?.query({
        limit: PAGE_SIZE,
        offset: currentOffset,
      })
      if (res?.success && res.data) {
        if (append) {
          setLogs(prev => [...prev, ...(res.data?.items ?? [])])
        } else {
          setLogs(res.data.items)
        }
        setTotal(res.data.total)
      }
    } catch {
      // Ignore fetch errors
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs(0, false)
  }, [fetchLogs])

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    fetchLogs(nextOffset, true)
  }

  const hasMore = logs.length < total

  const handleExport = async () => {
    try {
      setExporting(true)
      const res = await window.electronAPI?.audit?.export()
      if (res?.success && res.data) {
        const fileContent = res.data.content
        const fileName = res.data.filename
        const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.setAttribute('download', fileName)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      }
    } catch {
      // Ignore export errors
    } finally {
      setExporting(false)
    }
  }

  const getOperationColor = (op: string) => {
    if (op.includes('delete') || op.includes('deactivate')) return 'text-[var(--color-rose)]'
    if (op.includes('create') || op.includes('login') || op.includes('register'))
      return 'text-[var(--color-emerald)]'
    if (op.includes('update') || op.includes('rename')) return 'text-[var(--color-amber)]'
    return 'text-[var(--color-sky)]'
  }

  return (
    <div className="flex flex-col gap-4 h-[400px]">
      <div className="flex justify-between items-center">
        <h3 className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">
          Recent Activity ({logs.length} of {total})
        </h3>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          disabled={exporting || loading || logs.length === 0}
        >
          <Download size={14} className="mr-2" />
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Button>
      </div>

      <div className="surface-glass-premium rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] flex-1 overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-6 text-center text-[var(--color-text-tertiary)] text-sm">
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-[var(--color-text-tertiary)] text-sm py-12 flex flex-col items-center">
            <Shield size={32} className="opacity-20 mb-3" />
            No audit logs recorded yet.
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 scrollbar-webkit p-1 text-[13px]">
            <table className="w-full text-left">
              <thead className="bg-[#1a1a1a] sticky top-0 border-b border-[var(--color-border-subtle)] shadow-sm">
                <tr>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3">Time</th>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3">Operation</th>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3">Resource</th>
                  <th className="font-medium text-[var(--color-text-secondary)] p-3 hidden sm:table-cell">
                    Client Info
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id || i}
                    className="border-b border-[var(--color-border-subtle)] last:border-0 hover:bg-[#262626] transition-colors"
                  >
                    <td className="p-3 text-[var(--color-text-tertiary)] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-3 font-mono">
                      <span className={getOperationColor(log.operation)}>{log.operation}</span>
                    </td>
                    <td className="p-3">
                      <div className="text-[var(--color-text-primary)]">{log.table}</div>
                      {log.recordId && (
                        <div
                          className="text-[var(--color-text-tertiary)] text-[11px] font-mono mt-0.5"
                          title={log.recordId}
                        >
                          {log.recordId.slice(0, 8)}...
                        </div>
                      )}
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <div className="text-[var(--color-text-secondary)]">
                        {log.ipAddress || 'Unknown IP'}
                      </div>
                      <div
                        className="text-[var(--color-text-tertiary)] text-[11px] truncate max-w-[120px]"
                        title={log.userAgent}
                      >
                        {log.userAgent || '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Load More Button */}
            {hasMore && (
              <div className="p-3 text-center border-t border-[var(--color-border-subtle)]">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[#1a1a1a] hover:bg-[#262626] rounded-lg border border-[var(--color-border-subtle)] transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    'Loading...'
                  ) : (
                    <>
                      <ChevronDown size={14} />
                      Load More ({total - logs.length} remaining)
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
