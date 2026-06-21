import React from 'react'
import { motion, MotionValue, useTransform, useMotionValue } from 'framer-motion'
import { ThemeName, THEMES } from './Theme'

export const RecordingPulse = React.memo(
  ({
    isPaused,
    theme,
    audioRms,
  }: {
    isPaused: boolean
    theme: ThemeName
    audioRms?: MotionValue<number>
  }) => {
    const fallbackRms = useMotionValue(0)
    const rms = audioRms ?? fallbackRms

    // Map RMS (0 to 1) to a scale factor (e.g. 1 to 2.5) without triggering React re-renders
    const activeScale = useTransform(rms, [0, 1], [1, 2.5])
    const activeOpacity = useTransform(rms, [0, 1], [0.3, 0.8])
    const innerScale = useTransform(rms, [0, 1], [1, 1.5])

    return (
      <div className="relative flex items-center justify-center w-4 h-4 ml-1">
        {/* Outer blurred glow */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: isPaused ? 'var(--color-amber)' : THEMES[theme].viz,
            filter: 'blur(4px)',
            scale: isPaused ? 1 : activeScale,
            opacity: isPaused ? 0.3 : activeOpacity,
          }}
          transition={
            isPaused
              ? { duration: 0.3 }
              : { type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }
          }
        />
        {/* Inner sharp orb */}
        <motion.div
          className="relative w-2 h-2 rounded-full"
          style={{
            background: isPaused ? 'var(--color-amber)' : '#fff',
            boxShadow: !isPaused ? `0 0 8px ${THEMES[theme].viz}, inset 0 0 4px #fff` : 'none',
            scale: isPaused ? 1 : innerScale,
          }}
          transition={
            isPaused
              ? { duration: 0.3 }
              : { type: 'spring', stiffness: 300, damping: 20, mass: 0.5 }
          }
        />
      </div>
    )
  }
)
