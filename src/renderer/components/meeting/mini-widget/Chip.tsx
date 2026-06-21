import React from 'react'
import { motion } from 'framer-motion'
import { ThemeName, THEMES } from './Theme'

export const Chip: React.FC<{ theme: ThemeName; label: string; icon: React.ReactNode }> = ({
  theme,
  label,
  icon,
}) => {
  const c = THEMES[theme]
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`flex items-center gap-1.5 ${c.chipBg} border ${c.chipBorder} px-2 py-[3px] rounded-full transition-colors duration-500`}
    >
      <span className={`${c.chipIcon} transition-colors duration-500`}>{icon}</span>
      <span
        className={`text-[9.5px] ${c.chipText} font-bold tracking-[0.08em] uppercase drop-shadow-sm transition-colors duration-500`}
      >
        {label}
      </span>
    </motion.div>
  )
}
