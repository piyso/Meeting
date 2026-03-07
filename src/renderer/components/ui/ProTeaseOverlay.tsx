import React from 'react'
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

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center rounded-xl"
      style={{
        background: 'rgba(15, 15, 18, 0.4)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] shadow-2xl flex items-center justify-center mb-4 ring-1 ring-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-violet)]/20 to-transparent opacity-50" />
        <Lock className="text-[var(--color-violet)] opacity-90 relative z-10" size={24} />
      </div>
      <h3 className="text-lg font-semibold text-[var(--color-title)] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] max-w-[260px] mb-6 leading-relaxed">
        {description}
      </p>
      <button
        onClick={() => navigate('pricing')}
        className="px-6 py-2.5 rounded-full bg-[var(--color-violet)] hover:bg-[#7c4dff] text-white font-medium text-[var(--text-sm)] transition-all shadow-lg shadow-[var(--color-violet)]/20 active:scale-95"
      >
        Upgrade to {targetTier === 'pro' ? 'Pro' : 'Starter'}
      </button>
    </div>
  )
}
