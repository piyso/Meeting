import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, TrendingUp, TrendingDown, Minus } from 'lucide-react'

export interface MeetingVibeGaugeProps {
  score: number // -1.0 to 1.0 overall score
  confidence?: number // 0 to 1
  className?: string
}

export const MeetingVibeGauge: React.FC<MeetingVibeGaugeProps> = ({
  score,
  confidence = 0.85,
  className = '',
}) => {
  const getTheme = (s: number) => {
    if (s > 0.3)
      return {
        color: 'text-emerald',
        bg: 'bg-emerald/10',
        border: 'border-emerald/20',
        icon: TrendingUp,
        label: 'Positive',
      }
    if (s < -0.3)
      return {
        color: 'text-rose',
        bg: 'bg-rose/10',
        border: 'border-rose/20',
        icon: TrendingDown,
        label: 'Tense',
      }
    return {
      color: 'text-amber',
      bg: 'bg-amber/10',
      border: 'border-amber/20',
      icon: Minus,
      label: 'Neutral',
    }
  }

  const theme = getTheme(score)
  const Icon = theme.icon

  // Convert -1 to 1 into a 0 to 180 degree rotation for the gauge needle
  const rotation = (score + 1) * 90 // 0 to 180

  return (
    <div
      className={`p-4 rounded-2xl border bg-glass ${theme.border} transition-colors ${className}`}
    >
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Sparkles size={14} className="text-violet" />
          Overall Vibe
        </h4>
        <span
          className={`text-[10px] flex items-center gap-1 font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${theme.bg} ${theme.color}`}
        >
          <Icon size={12} />
          {theme.label}
        </span>
      </div>

      <div className="relative w-full h-16 overflow-hidden flex justify-center items-end pb-2">
        {/* Semi-circle Gauge Background */}
        <div className="absolute bottom-0 w-32 h-16 rounded-t-full border-[6px] border-border-subtle" />

        {/* Gradient Arc overlay for gauge coloring */}
        <div
          className="absolute bottom-0 w-32 h-16 rounded-t-full border-[6px] border-transparent"
          style={{
            borderImage:
              'linear-gradient(to right, var(--color-rose), var(--color-amber), var(--color-emerald)) 1',
            maskImage: 'linear-gradient(to right, white, white)',
            WebkitMaskImage: 'linear-gradient(to right, white, white)',
            opacity: 0.8,
          }}
        />

        {/* The Needle */}
        <motion.div
          initial={{ rotate: 90 }} // Start neutral
          animate={{ rotate: rotation }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          style={{ originX: 0.5, originY: 1 }}
          className="absolute bottom-1 w-1 h-14 bg-white rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10"
        />

        {/* Center Pin */}
        <div className="absolute bottom-0 w-3 h-3 bg-white rounded-full z-20 shadow-macos-sm translate-y-1/2" />
      </div>

      <div className="mt-2 flex justify-between items-center text-[10px] font-mono text-tertiary">
        <span>TENSE</span>
        <span>Confidence: {Math.round(confidence * 100)}%</span>
        <span>GREAT</span>
      </div>
    </div>
  )
}
