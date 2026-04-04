import React from 'react'
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

  const [loadError, setLoadError] = React.useState(false)

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
        } else {
          setLoadError(true)
        }
      })
      .catch(() => {
        setLoadError(true)
      })
  }, [])

  if (tiers.length === 0) {
    if (loadError) {
      return (
        <div className="w-full flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-[var(--color-text-secondary)] text-sm">
            Could not load subscription tiers.
          </p>
          <Button
            variant="secondary"
            className="bg-white/5 border-white/10 hover:bg-white/10"
            onClick={() => onPlanSelect?.('Free')}
          >
            Continue with Free Tier →
          </Button>
        </div>
      )
    }
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--color-text-tertiary)]">
        Loading tiers...
      </div>
    )
  }

  return (
    <div className="w-full flex flex-col items-center p-4 overflow-y-auto sovereign-scrollbar">
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

      {/* Cards Layout - 3 on top, 2 wider on bottom */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 w-full max-w-5xl pb-10">
        {tiers.map((t, i) => {
          // Calculate grid boundaries based on index
          // 0: Free (col 1-2), 1: Starter (col 3-4), 2: Pro (col 5-6)
          // 3: Team (col 2-4), 4: Enterprise (col 4-6)
          let gridClass = ''
          if (i === 0) gridClass = 'lg:col-span-2'
          if (i === 1) gridClass = 'lg:col-span-2'
          if (i === 2) gridClass = 'lg:col-span-2 transform lg:-translate-y-2' // Elevate recommended tier
          if (i === 3) gridClass = 'lg:col-span-3 lg:col-start-1 mt-4'
          if (i === 4) gridClass = 'lg:col-span-3 lg:col-start-4 mt-4'

          return (
            <div
              key={i}
              className={`
              rounded-2xl p-6 flex flex-col relative transition-all duration-300 hover:scale-[1.02]
              bg-[var(--color-bg-glass)] border 
              ${
                t.recommended
                  ? 'border-[var(--color-violet)] shadow-[0_8px_32px_rgba(167,139,250,0.15)] bg-slate-900/40 z-10'
                  : 'border-white/10 hover:border-white/20 shadow-lg'
              }
              animate-slide-up
              ${gridClass}
            `}
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
            >
              {t.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-md whitespace-nowrap">
                  ⭐ Recommended
                </div>
              )}

              <h3 className="text-base font-semibold text-slate-200 mb-2">{t.name}</h3>

              <div className="mb-4 border-b border-white/10 pb-4 flex items-baseline">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {currency === 'INR' && t.priceINR ? t.priceINR : t.price}
                </span>
                <span className="text-sm text-slate-400 ml-1.5 font-medium">{t.period}</span>
              </div>

              <ul className="space-y-3 flex-1 mb-6">
                {t.features.map((f: string, j: number) => (
                  <li
                    key={j}
                    className="flex gap-2.5 items-start text-sm text-slate-300 leading-tight"
                  >
                    <Check size={14} className="mt-0.5 shrink-0 text-violet-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={t.variant}
                className={`w-full shadow-sm py-4 rounded-xl font-medium tracking-wide ${
                  t.recommended ? 'bg-violet-600 hover:bg-violet-500 text-white border-none' : ''
                } ${t.variant === 'ghost' ? 'bg-white/5 hover:bg-white/10 text-white border-white/10' : ''}`}
                onClick={() => onPlanSelect?.(t.name)}
              >
                {t.cta}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
