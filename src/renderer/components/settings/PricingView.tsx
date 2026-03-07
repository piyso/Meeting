import React from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Check } from 'lucide-react'

interface UITier {
  id: string
  name: string
  price: string
  priceINR?: string
  period: string
  yearlyPrice?: string
  yearlyPriceINR?: string
  features: string[]
  cta: string
  variant: 'primary' | 'secondary' | 'ghost'
  recommended: boolean
}

export const PricingView: React.FC<{ onPlanSelect?: (plan: string) => void }> = ({
  onPlanSelect,
}) => {
  const [tiers, setTiers] = React.useState<UITier[]>([])
  const [currency, setCurrency] = React.useState<'USD' | 'INR'>('USD')

  React.useEffect(() => {
    // Fetch dynamic tiers from IPC
    window.electronAPI?.billing
      ?.getConfig()
      .then(res => {
        if (res?.success && res.data?.tiers) {
          // Add cta and variant props based on tier id for the UI
          const mappedTiers = res.data.tiers.map(t => {
            let cta = 'Subscribe'
            let variant: 'primary' | 'secondary' | 'ghost' = 'secondary'
            let recommended = false

            if (t.id === 'free') {
              cta = 'Get Started'
              variant = 'ghost'
            }
            if (t.id === 'starter') {
              cta = 'Start Free Trial'
              variant = 'secondary'
            }
            if (t.id === 'pro') {
              cta = 'Go Pro'
              variant = 'primary'
              recommended = true
            }
            if (t.id === 'team') {
              cta = 'Contact Sales'
              variant = 'secondary'
            }
            if (t.id === 'enterprise') {
              cta = 'Talk to Us'
              variant = 'ghost'
            }

            return { ...t, cta, variant, recommended }
          })
          setTiers(mappedTiers)
        }
      })
      .catch(() => {
        /* error handling */
      })
  }, [])

  if (tiers.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--color-text-tertiary)]">
        Loading tiers...
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-[var(--space-24)] bg-[var(--color-bg-root)] overflow-x-auto scrollbar-webkit">
      {/* Currency Toggle */}
      <div className="flex items-center gap-2 mb-8 bg-[var(--color-bg-elevated)] p-1 rounded-full border border-[var(--color-border-subtle)] animate-fade-in">
        <button
          onClick={() => setCurrency('USD')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${currency === 'USD' ? 'bg-[var(--color-violet)] text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
        >
          USD ($)
        </button>
        <button
          onClick={() => setCurrency('INR')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${currency === 'INR' ? 'bg-[var(--color-violet)] text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
        >
          INR (₹)
        </button>
      </div>

      <div className="flex gap-[var(--space-16)] min-w-max pb-4">
        {tiers.map((t, i) => (
          <div
            key={i}
            className={`
              w-[220px] rounded-[var(--radius-lg)] p-[var(--space-24)] flex flex-col relative
              bg-[var(--color-bg-glass)] border 
              ${t.recommended ? 'border-[var(--color-violet)] shadow-[0_0_24px_rgba(167,139,250,0.1)]' : 'border-[var(--color-border-subtle)]'}
              animate-slide-up
            `}
            style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
          >
            {t.recommended && (
              <Badge
                variant="default"
                className="absolute -top-3 right-[var(--space-24)] px-2 bg-[var(--color-violet)] text-white border-none"
              >
                ⭐ Recommended
              </Badge>
            )}

            <h3 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)] mb-2">
              {t.name}
            </h3>

            <div className="mb-[var(--space-24)] border-b border-[var(--color-border-subtle)] pb-[var(--space-16)] flex items-baseline">
              <span className="text-[var(--text-3xl)] font-bold text-[var(--color-text-primary)] tracking-tight">
                {currency === 'INR' && t.priceINR ? t.priceINR : t.price}
              </span>
              <span className="text-[var(--text-sm)] text-[var(--color-text-tertiary)] ml-1 font-medium">
                {t.period}
              </span>
            </div>

            <ul className="space-y-[var(--space-12)] flex-1 mb-[var(--space-24)]">
              {t.features.map((f: string, j: number) => (
                <li
                  key={j}
                  className="flex gap-2 items-start text-[var(--text-sm)] text-[var(--color-text-secondary)] leading-tight"
                >
                  <Check size={14} className="mt-0.5 shrink-0 text-[var(--color-violet)]" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button
              variant={t.variant}
              className="w-full shadow-sm"
              onClick={() => onPlanSelect?.(t.name)}
            >
              {t.cta}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
