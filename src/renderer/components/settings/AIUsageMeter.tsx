import React, { useState, useEffect } from 'react'
import { Brain, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'

export const AIUsageMeter: React.FC = () => {
  const [quota, setQuota] = useState<{
    used: number
    limit: number
    remaining: number
    resetsAt: string
    exhausted: boolean
    tier: string
  } | null>(null)

  const [loading, setLoading] = useState(true)

  const fetchQuota = async () => {
    try {
      setLoading(true)
      const res = await window.electronAPI.quota.check()
      if (res.success && res.data) {
        setQuota(res.data)
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQuota()
  }, [])

  if (loading && !quota) {
    return <div className="text-[var(--color-text-tertiary)] text-sm">Loading AI usage...</div>
  }

  if (!quota) return null

  const isUnlimited = quota.limit === Infinity
  const percentUsed = isUnlimited ? 0 : Math.min(100, Math.round((quota.used / quota.limit) * 100))

  const getProgressColor = () => {
    if (isUnlimited) return 'var(--color-emerald)'
    if (percentUsed > 90) return 'var(--color-rose)'
    if (percentUsed > 75) return 'var(--color-amber)'
    return 'var(--color-emerald)'
  }

  const resetDate = new Date(quota.resetsAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="surface-glass-premium p-5 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-[var(--text-base)] font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <Brain size={16} className="text-[var(--color-sky)]" />
            Cloud AI Usage
          </h3>
          <p className="text-[var(--color-text-tertiary)] text-[var(--text-sm)] mt-1">
            Current Tier:{' '}
            <span className="uppercase text-[var(--color-text-secondary)] font-medium">
              {quota.tier}
            </span>
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchQuota} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-secondary)]">Queries Used</span>
          <span className="text-[var(--color-text-primary)] font-medium">
            {quota.used} {isUnlimited ? '' : `/ ${quota.limit}`}
          </span>
        </div>

        {!isUnlimited && (
          <div className="w-full bg-[#1a1a1a] h-2 rounded-full overflow-hidden mt-1">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percentUsed}%`, backgroundColor: getProgressColor() }}
            />
          </div>
        )}

        <div className="flex justify-between mt-2 pt-2 border-t border-[var(--color-border-subtle)]">
          <span className="text-[var(--color-text-tertiary)] text-xs">
            {isUnlimited
              ? 'You have unlimited Cloud AI access.'
              : quota.exhausted
                ? 'Cloud AI quota exhausted. Falling back to local models.'
                : `${quota.remaining} queries remaining until reset.`}
          </span>
          <span className="text-[var(--color-text-tertiary)] text-xs">Resets: {resetDate}</span>
        </div>
      </div>
    </div>
  )
}
