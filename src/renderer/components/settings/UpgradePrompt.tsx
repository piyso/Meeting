/**
 * UpgradePrompt — Tier-based feature upsell component
 *
 * Shows a contextual upgrade CTA when a user attempts to access
 * a feature gated behind a higher tier (Free → Starter → Pro).
 *
 * Usage:
 *   <UpgradePrompt feature="knowledgeGraph" currentTier="free" requiredTier="starter" />
 */

import React from 'react'
import { Sparkles, ArrowRight, X } from 'lucide-react'

interface UpgradePromptProps {
  feature: string
  featureLabel: string
  currentTier: string
  requiredTier: string
  onDismiss?: () => void
  onUpgrade?: () => void
}

const TIER_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
}

// We'll fetch dynamic prices from IPC, but provide safe fallbacks
const FALLBACK_PRICES: Record<string, string> = {
  starter: '$9/mo',
  pro: '$19/mo',
  team: '$15/user/mo',
  enterprise: 'Custom',
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  featureLabel,
  currentTier,
  requiredTier,
  onDismiss,
  onUpgrade,
}) => {
  const [prices, setPrices] = React.useState<Record<string, string>>(FALLBACK_PRICES)

  React.useEffect(() => {
    // Fetch dynamic prices from backend IPC
    window.electronAPI?.billing
      ?.getConfig()
      .then(res => {
        if (res?.success && res.data?.tiers) {
          const newPrices: Record<string, string> = {}
          res.data.tiers.forEach(t => {
            if (t.id !== 'free') {
              newPrices[t.id] = t.price + (t.period || '')
            }
          })
          setPrices(prev => ({ ...prev, ...newPrices }))
        }
      })
      .catch(() => {
        /* use fallbacks */
      })
  }, [])

  return (
    <div
      id="upgrade-prompt"
      className="ui-upgrade-prompt"
      style={{
        position: 'relative',
        padding: '20px 24px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(59,130,246,0.08))',
        border: '1px solid rgba(139,92,246,0.2)',
        marginBottom: '16px',
      }}
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            opacity: 0.5,
            color: 'var(--color-text-secondary)',
          }}
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      )}

      {/* Icon + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <Sparkles size={20} style={{ color: 'var(--color-violet, #8b5cf6)' }} />
        <span
          style={{
            fontWeight: 600,
            fontSize: 'var(--text-md, 15px)',
            color: 'var(--color-text-primary)',
          }}
        >
          Unlock {featureLabel}
        </span>
      </div>

      {/* Body */}
      <p
        style={{
          fontSize: 'var(--text-sm, 13px)',
          color: 'var(--color-text-secondary)',
          margin: '0 0 14px',
          lineHeight: 1.5,
        }}
      >
        This feature requires the{' '}
        <strong style={{ color: 'var(--color-violet, #8b5cf6)' }}>
          {TIER_LABELS[requiredTier] || requiredTier}
        </strong>{' '}
        plan.
        {currentTier === 'free' && requiredTier === 'starter' && (
          <> Starting at just {prices[requiredTier] || FALLBACK_PRICES.starter}.</>
        )}
        {currentTier === 'free' && requiredTier === 'pro' && (
          <> Upgrade to Pro for {prices.pro || FALLBACK_PRICES.pro} to access all features.</>
        )}
        {currentTier === 'starter' && requiredTier === 'pro' && (
          <> Upgrade to Pro for the full experience.</>
        )}
      </p>

      {/* CTA */}
      <button
        onClick={onUpgrade}
        id="upgrade-prompt-cta"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 18px',
          borderRadius: '8px',
          border: 'none',
          background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 'var(--text-sm, 13px)',
          cursor: 'pointer',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={e => {
          ;(e.target as HTMLElement).style.transform = 'translateY(-1px)'
          ;(e.target as HTMLElement).style.boxShadow = '0 4px 12px rgba(139,92,246,0.3)'
        }}
        onMouseLeave={e => {
          ;(e.target as HTMLElement).style.transform = 'translateY(0)'
          ;(e.target as HTMLElement).style.boxShadow = 'none'
        }}
      >
        Upgrade Now
        <ArrowRight size={14} />
      </button>
    </div>
  )
}
