import React from 'react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Check } from 'lucide-react'

export const PricingView: React.FC<{ onPlanSelect?: (plan: string) => void }> = ({
  onPlanSelect,
}) => {
  const tiers = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: ['Transcribe', 'Local AI', 'Search', '1 device'],
      cta: 'Get Started',
      variant: 'ghost' as const,
    },
    {
      name: 'Starter',
      price: '$9',
      period: '/mo',
      features: ['+ Sync', '2 devices', '50 AI queries/mo'],
      cta: 'Start Free Trial',
      variant: 'secondary' as const,
    },
    {
      name: 'Pro',
      price: '$19',
      period: '/mo',
      features: ['+ Unlimited devices', '+ Unlimited AI', '+ Priority support'],
      recommended: true,
      cta: 'Go Pro',
      variant: 'primary' as const,
    },
    {
      name: 'Team',
      price: '$15',
      period: '/user',
      features: ['+ Shared workspaces', '+ Admin controls', 'Centralized billing'],
      cta: 'Contact Sales',
      variant: 'secondary' as const,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      features: ['+ Custom SLA & SSO', '+ HIPAA compliance', '+ Dedicated support'],
      cta: 'Talk to Us',
      variant: 'ghost' as const,
    },
  ]

  return (
    <div className="w-full h-full flex items-center justify-center p-[var(--space-24)] bg-[var(--color-bg-root)] overflow-x-auto scrollbar-webkit">
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
                {t.price}
              </span>
              <span className="text-[var(--text-sm)] text-[var(--color-text-tertiary)] ml-1 font-medium">
                {t.period}
              </span>
            </div>

            <ul className="space-y-[var(--space-12)] flex-1 mb-[var(--space-24)]">
              {t.features.map((f, j) => (
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
