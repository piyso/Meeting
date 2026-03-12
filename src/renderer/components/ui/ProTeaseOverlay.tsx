import React, { useEffect, useRef } from 'react'
import { Lock } from 'lucide-react'
import { useAppStore } from '../../store/appStore'

interface ProTeaseOverlayProps {
  title?: string
  description?: string
  targetTier?: 'starter' | 'pro'
}

export const ProTeaseOverlay: React.FC<ProTeaseOverlayProps> = ({
  title = 'Unlock Premium Memory',
  description = 'Upgrade to access this feature.',
  targetTier = 'pro',
}) => {
  const navigate = useAppStore(s => s.navigate)
  const ctaRef = useRef<HTMLButtonElement>(null)

  // Auto-focus the upgrade button so keyboard users land inside the overlay
  useEffect(() => {
    ctaRef.current?.focus()
  }, [])

  // Trap focus inside the overlay — prevent tabbing behind it
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Escape navigates back to meetings (the only way "out" for locked users)
      navigate('meeting-list')
    }
    if (e.key === 'Tab') {
      // Only one focusable element — keep focus on the button
      e.preventDefault()
      ctaRef.current?.focus()
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-tease-title"
      aria-describedby="pro-tease-desc"
      onKeyDown={handleKeyDown}
      style={{
        background: 'rgba(5, 5, 5, 0.4)',
        backdropFilter: 'blur(32px) saturate(160%)',
        WebkitBackdropFilter: 'blur(32px) saturate(160%)',
      }}
    >
      <div className="surface-glass-premium flex flex-col items-center justify-center p-12 text-center relative overflow-hidden max-w-sm w-full shadow-[0_24px_64px_-12px_rgba(0,0,0,0.4)] border border-[var(--color-border-subtle)]">
        {/* Ambient violet floor glow behind the lock */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-32 bg-[var(--color-violet)] rounded-full mix-blend-screen opacity-10 blur-[48px] pointer-events-none" />

        <div className="w-16 h-16 rounded-2xl bg-[rgba(167,139,250,0.05)] border border-[rgba(167,139,250,0.2)] shadow-[0_0_24px_rgba(167,139,250,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] flex items-center justify-center mb-6 ring-1 ring-white/5 relative overflow-hidden z-10">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-violet)]/20 to-transparent opacity-60" />
          <Lock className="text-[#d8b4fe] opacity-90 relative z-10" size={28} aria-hidden="true" />
        </div>

        <h3
          id="pro-tease-title"
          className="text-xl font-semibold text-[var(--color-text-primary)] mb-3 tracking-wide z-10 relative"
        >
          {title}
        </h3>

        <p
          id="pro-tease-desc"
          className="text-[var(--text-base)] text-[var(--color-text-secondary)] max-w-[280px] mb-8 leading-relaxed z-10 relative"
        >
          {description}
        </p>

        <button
          ref={ctaRef}
          onClick={() => navigate('pricing')}
          className="ui-btn-primary w-full justify-center z-10 relative"
          style={{ height: '44px', fontSize: '14px', fontWeight: 600, letterSpacing: '0.02em' }}
        >
          Upgrade to {targetTier === 'pro' ? 'Pro' : 'Starter'}
        </button>
      </div>
    </div>
  )
}
