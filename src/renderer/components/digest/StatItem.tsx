import React from 'react'

interface StatItemProps {
  title: string
  value: string | number
  icon: React.ElementType
  subtitle?: string
  accent?: 'violet' | 'emerald' | 'blue'
}

export const StatItem: React.FC<StatItemProps> = ({
  title,
  value,
  icon: Icon,
  subtitle,
  accent = 'violet',
}) => {
  const accentStyles = {
    violet: {
      iconBg: 'bg-violet-500/10 text-violet-400',
      hoverBorder: 'hover:border-violet-500/20',
      glow: 'shadow-[0_0_24px_-6px_rgba(139,92,246,0.12)]',
    },
    emerald: {
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      hoverBorder: 'hover:border-emerald-500/20',
      glow: 'shadow-[0_0_24px_-6px_rgba(16,185,129,0.12)]',
    },
    blue: {
      iconBg: 'bg-blue-500/10 text-blue-400',
      hoverBorder: 'hover:border-blue-500/20',
      glow: 'shadow-[0_0_24px_-6px_rgba(59,130,246,0.12)]',
    },
  }[accent]

  return (
    <div
      className={`relative overflow-hidden p-5 rounded-2xl bg-gradient-to-b from-white/[0.035] via-white/[0.015] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.025)] ${accentStyles.hoverBorder} transition-all duration-300 group`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
          {title}
        </span>
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-300 ${accentStyles.iconBg}`}
        >
          <Icon size={15} />
        </div>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight leading-none font-mono">
        {value}
      </div>
      {subtitle && (
        <p className="text-[11px] text-zinc-500 mt-2 truncate font-normal">{subtitle}</p>
      )}
    </div>
  )
}
