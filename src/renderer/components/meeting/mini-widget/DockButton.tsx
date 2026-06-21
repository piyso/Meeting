import React from 'react'
import { motion } from 'framer-motion'

export const DockButton: React.FC<{
  icon: React.ReactNode
  onClick: () => void
  title: string
  active?: boolean
  hoverColor?: 'violet' | 'rose' | 'emerald'
}> = ({ icon, onClick, title, active, hoverColor }) => {
  const hoverMap = {
    violet: 'hover:text-[var(--color-violet)] hover:bg-[var(--color-violet)]/15',
    rose: 'hover:text-[var(--color-rose)] hover:bg-[var(--color-rose)]/15',
    emerald: 'hover:text-[var(--color-emerald)] hover:bg-[var(--color-emerald)]/15',
  }
  const hoverClass = hoverColor ? hoverMap[hoverColor] : 'hover:text-white hover:bg-white/10'

  return (
    <motion.button
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
      className={`w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-200 widget-nodrag outline-none ${
        active
          ? 'bg-[var(--color-violet)] text-white shadow-[0_0_14px_rgba(167,139,250,0.5)]'
          : `text-white/55 ${hoverClass}`
      }`}
      title={title}
    >
      {icon}
    </motion.button>
  )
}
