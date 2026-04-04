import React from 'react'

export interface AvatarProps {
  src?: string
  fallback: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  colorHint?: 'violet' | 'emerald' | 'amber' | 'rose' | 'blue'
}

const colorMap = {
  violet: 'bg-[rgba(167,139,250,0.15)] text-[#c4b5fd] border-[rgba(167,139,250,0.3)]',
  emerald: 'bg-[rgba(52,211,153,0.15)] text-[#6ee7b7] border-[rgba(52,211,153,0.3)]',
  amber: 'bg-[rgba(251,191,36,0.15)] text-[#fcd34d] border-[rgba(251,191,36,0.3)]',
  rose: 'bg-[rgba(251,113,133,0.15)] text-[#fda4af] border-[rgba(251,113,133,0.3)]',
  blue: 'bg-[rgba(59,130,246,0.15)] text-[#93c5fd] border-[rgba(59,130,246,0.3)]',
}

const sizeMap = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-12 h-12 text-sm',
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  fallback,
  size = 'md',
  className = '',
  colorHint = 'violet',
}) => {
  const baseClasses =
    'flex items-center justify-center rounded-full border shadow-sm font-medium uppercase overflow-hidden flex-shrink-0'
  const colors = colorMap[colorHint]
  const dims = sizeMap[size]

  return (
    <div className={`${baseClasses} ${colors} ${dims} ${className}`}>
      {src ? (
        <img src={src} alt={fallback} className="w-full h-full object-cover" />
      ) : (
        <span>{fallback.substring(0, 2)}</span>
      )}
    </div>
  )
}

export interface AvatarGroupProps {
  avatars: { src?: string; fallback: string; colorHint?: AvatarProps['colorHint'] }[]
  max?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  avatars,
  max = 3,
  size = 'md',
  className = '',
}) => {
  const visible = avatars.slice(0, max)
  const overflow = avatars.length > max ? avatars.length - max : 0

  return (
    <div className={`flex items-center -space-x-2 ${className}`}>
      {visible.map((a, i) => (
        <Avatar
          key={i}
          src={a.src}
          fallback={a.fallback}
          colorHint={a.colorHint}
          size={size}
          className="ring-2 ring-base"
        />
      ))}
      {overflow > 0 && (
        <div
          className={`flex items-center justify-center rounded-full border border-border bg-glass ring-2 ring-base text-secondary font-medium flex-shrink-0 ${sizeMap[size]}`}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
