import React, { useMemo } from 'react'
import { motion } from 'framer-motion'

export interface SentimentDataPoint {
  time: number
  score: number // -1.0 to 1.0
  id: string
}

export interface SentimentWaveformProps {
  data: SentimentDataPoint[]
  width?: number
  height?: number
  className?: string
}

export const SentimentWaveform: React.FC<SentimentWaveformProps> = ({
  data,
  width = '100%',
  height = 60,
  className = '',
}) => {
  // SVG points calculation
  const points = useMemo(() => {
    if (!data || data.length === 0) return ''

    // Simple linear distribution for mock
    return data
      .map((d, i) => {
        const x = (i / (data.length - 1)) * 100
        // Map -1 to 1 into height percentages (0 to 100, where 0 is bottom, 100 is top)
        // -1 -> 100% (bottom), 1 -> 0% (top), 0 -> 50% (middle)
        const y = 50 - d.score * 40 // Scale to leave some padding
        return `${x},${y}`
      })
      .join(' ')
  }, [data])

  const sentimentColor = (score: number) => {
    if (score > 0.3) return 'var(--color-emerald)'
    if (score < -0.3) return 'var(--color-rose)'
    return 'var(--color-amber)'
  }

  // Calculate current/latest vibe
  const currentScore = data.length > 0 ? (data[data.length - 1]?.score ?? 0) : 0
  const currentColor = sentimentColor(currentScore)

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {/* Zero line */}
      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-border-subtle border-dashed border-t border-[rgba(255,255,255,0.1)] -translate-y-1/2" />

      {/* Gradient Mask for Waveform */}
      <div className="absolute inset-0 z-10 w-full h-full">
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          {/* Fill under the curve */}
          {points && (
            <motion.polygon
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.1 }}
              points={`0,100 ${points} 100,100`}
              fill={`url(#sentiment-gradient)`}
            />
          )}

          {/* The line itself */}
          {points && (
            <motion.polyline
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              points={points}
              fill="none"
              stroke={currentColor}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          <defs>
            <linearGradient id="sentiment-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={currentColor} stopOpacity="1" />
              <stop offset="100%" stopColor={currentColor} stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Label for current sentiment */}
      <div
        className="absolute top-0 right-0 z-20 bg-glass backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold tracking-widest border border-border-inset shadow-macos-sm"
        style={{ color: currentColor }}
      >
        {currentScore > 0.3 ? 'POSITIVE' : currentScore < -0.3 ? 'NEGATIVE' : 'NEUTRAL'}
      </div>
    </div>
  )
}
