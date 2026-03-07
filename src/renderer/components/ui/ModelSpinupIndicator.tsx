import React from 'react'
import { motion } from 'framer-motion'
import { BrainCircuit } from 'lucide-react'

export const ModelSpinupIndicator: React.FC = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'rgba(20, 20, 22, 0.8)',
        backdropFilter: 'blur(12px)',
        borderRadius: 8,
        border: '1px solid rgba(139, 92, 246, 0.3)',
        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.15), 0 0 0 1px rgba(139, 92, 246, 0.1) inset',
        userSelect: 'none',
      }}
    >
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <BrainCircuit size={16} color="#8b5cf6" />
      </motion.div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>
          Waking Local AI
        </span>
        <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>
          Loading weights to memory...
        </span>
      </div>
    </motion.div>
  )
}
