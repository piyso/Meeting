import React from 'react'
import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'

export const SovereignOrb: React.FC<{
  isRecording: boolean
  isPaused?: boolean
  onClick: () => void
  onHoverStart: () => void
}> = ({ isRecording, isPaused, onClick, onHoverStart }) => {
  return (
    <motion.div
      layoutId="sovereign-orb-handoff"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={onHoverStart}
      className={`
        w-12 h-12 rounded-full cursor-pointer widget-draggable
        flex items-center justify-center relative
        surface-glass-premium border border-white/10
      `}
      style={{
        boxShadow:
          isRecording && !isPaused
            ? '0 0 30px -5px rgba(56, 189, 248, 0.4), inset 0 1px 2px rgba(255,255,255,0.2)'
            : '0 4px 20px -5px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.1)',
      }}
    >
      {/* Noise Texture */}
      <div className="absolute inset-0 rounded-full pointer-events-none with-noise opacity-50" />

      {isRecording && !isPaused ? (
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-3 h-3 rounded-full bg-[#38bdf8] shadow-[0_0_12px_#38bdf8]"
        />
      ) : isPaused ? (
        <div className="w-3 h-3 rounded-full bg-amber-500/80" />
      ) : (
        <Activity size={16} className="text-white/60" />
      )}
    </motion.div>
  )
}
