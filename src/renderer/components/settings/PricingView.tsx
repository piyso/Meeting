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
      <div className="flex items-center gap-1 mb-12 bg-white/[0.02] p-1.5 rounded-full border border-white/5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_4px_24px_rgba(0,0,0,0.3)] animate-fade-in">
        <button
          onClick={() => setCurrency('USD')}
          className={`px-6 py-2 rounded-full text-[0.8rem] tracking-widest uppercase font-bold transition-all duration-500 ${currency === 'USD' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(16,185,129,0.2)]' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
        >
          USD ($)
        </button>
        <button
          onClick={() => setCurrency('INR')}
          className={`px-6 py-2 rounded-full text-[0.8rem] tracking-widest uppercase font-bold transition-all duration-500 ${currency === 'INR' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(16,185,129,0.2)]' : 'text-slate-400 hover:text-slate-200 border border-transparent'}`}
        >
          INR (₹)
        </button>
      </div>

      {/* Cards Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl px-4 pb-10 mt-6 items-stretch">
        {tiers.map((t, i) => {
          let gridClass = ''
          // Elevate recommended tier physically with padding/margin adjustment
          if (t.recommended) gridClass = 'md:-mt-6 md:mb-6 z-10'

          return (
            <div
              key={i}
              className={`
              group rounded-[2rem] p-8 lg:p-10 flex flex-col relative transition-all duration-700 hover:-translate-y-2
              backdrop-blur-xl h-full
              ${
                t.recommended
                  ? 'border border-emerald-500/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_40px_rgba(16,185,129,0.15)] bg-emerald-500/[0.03] hover:border-emerald-400/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_20px_60px_-15px_rgba(16,185,129,0.3)] hover:bg-emerald-500/[0.06]'
                  : 'border border-white/5 bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_30px_rgba(0,0,0,0.3)] hover:border-white/15 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_20px_40px_-15px_rgba(0,0,0,0.5)] hover:bg-white/[0.04]'
              }
              animate-slide-up
              ${gridClass}
            `}
              style={{ animationDelay: `${i * 80}ms`, animationFillMode: 'both' }}
            >
              {t.recommended && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-1.5 border border-emerald-500/40 bg-emerald-950/80 text-emerald-300 text-[0.65rem] font-bold uppercase tracking-widest rounded-full shadow-[0_0_20px_rgba(16,185,129,0.3)] whitespace-nowrap backdrop-blur-xl z-20">
                  Optimal Capacity
                </div>
              )}

              <h3 className="text-[0.75rem] font-bold tracking-[0.2em] uppercase text-slate-400 mb-3 transition-colors duration-500 group-hover:text-slate-200">{t.name}</h3>

              <div className="mb-8 border-b border-white/10 pb-6 flex items-end">
                <span className={`text-[2.75rem] leading-none font-extralight tracking-tight transition-colors duration-500 ${t.recommended ? 'text-emerald-300' : 'text-white group-hover:text-emerald-300'}`}>
                  {currency === 'INR' && t.priceINR ? t.priceINR : t.price}
                </span>
                <span className="text-[0.7rem] tracking-widest uppercase text-slate-500 ml-2 mb-1.5 font-medium">/ {t.period}</span>
              </div>

              <ul className="space-y-4 flex-1 mb-8">
                {t.features.map((f: string, j: number) => (
                  <li
                    key={j}
                    className="flex gap-4 items-start text-[0.95rem] text-slate-300 font-light leading-snug transition-colors duration-500 group-hover:text-slate-200"
                  >
                    <div className={`mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-full border transition-all duration-500 ${t.recommended ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-white/10 bg-white/5 text-slate-400 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 group-hover:text-emerald-400'}`}>
                      <Check size={12} strokeWidth={2.5} />
                    </div>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={t.variant}
                className={`w-full py-4 mt-auto rounded-2xl font-bold tracking-[0.15em] uppercase text-[0.7rem] transition-all duration-500 ${
                  t.recommended 
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)]' 
                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 hover:border-white/20'
                }`}
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
