import React from 'react'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24',
  }

  const innerSizeMap = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-5 h-5',
    xl: 'w-8 h-8',
  }

  const ringSizeMap = {
    sm: 'w-4 h-4',
    md: 'w-7 h-7',
    lg: 'w-11 h-11',
    xl: 'w-16 h-16',
  }

  return (
    <div
      className={`relative flex items-center justify-center rounded-xl bg-slate-900/50 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)] ${sizeMap[size]} ${className}`}
    >
      {/* Outer pulsing ring */}
      <div
        className={`absolute rounded-full border border-cyan-400/30 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] ${ringSizeMap[size]}`}
      />

      {/* Inner wave ring */}
      <div
        className={`absolute rounded-full border-2 border-blue-500/40 border-t-cyan-400/60 border-b-cyan-400/60 animate-[spin_4s_linear_infinite] ${ringSizeMap[size]}`}
      />

      {/* Center recording dot */}
      <div
        className={`rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] ${innerSizeMap[size]}`}
      />
    </div>
  )
}
