import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BrainCircuit } from 'lucide-react'

interface Thought {
  id: string
  text: string
  confidence: number
}

export const AmbientThoughtBubble: React.FC = () => {
  const [currentThought, setCurrentThought] = useState<Thought | null>(null)

  // Mock semantic engine context ingestion
  useEffect(() => {
    const thoughts = [
      "Alice is discussing 'Vector Embeddings'",
      "This relates to yesterday's System Architecture sync...",
      'Extracting action item: Update Pinecone index...',
      'Sentiment shifting to constructive debate',
    ]
    let i = 0
    const t = setInterval(() => {
      setCurrentThought({
        id: `t-${Date.now()}`,
        text: thoughts[i % thoughts.length] ?? 'Processing...',
        confidence: Math.random() * 0.4 + 0.6, // 0.6 to 1.0
      })
      i++
    }, 8000)

    // Initial
    setCurrentThought({ id: 't0', text: 'Listening to semantic context...', confidence: 1.0 })

    return () => clearInterval(t)
  }, [])

  return (
    <div className="fixed bottom-24 right-8 z-[60] pointer-events-none">
      <AnimatePresence mode="wait">
        {currentThought && (
          <motion.div
            key={currentThought.id}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95, filter: 'blur(4px)' }}
            transition={{ duration: 0.8, ease: 'easeInOut' }}
            className="flex items-center gap-3"
          >
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-mono font-medium text-emerald/70 bg-gradient-to-r from-transparent to-black/20 px-2 py-0.5 rounded-l-md">
                {(currentThought.confidence * 100).toFixed(0)}% MATCH
              </span>
              <div className="text-secondary text-[13px] font-medium tracking-tight bg-glass/40 backdrop-blur-md px-3 py-1.5 rounded-xl border border-border-inset shadow-macos-sm max-w-[240px] text-right truncate">
                {currentThought.text}
              </div>
            </div>

            {/* The pulsating AI core */}
            <div className="relative flex items-center justify-center w-8 h-8 rounded-full border border-emerald/30 bg-emerald/10 shadow-[0_0_12px_rgba(52,211,153,0.3)]">
              <BrainCircuit size={14} className="text-emerald" />
              <div
                className="absolute inset-0 rounded-full border border-emerald/50 animate-ping opacity-20"
                style={{ animationDuration: '3s' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
