import React, { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

interface SilentPrompterProps {
  suggestion: string | null
  onDismiss: () => void
}

export const SilentPrompter: React.FC<SilentPrompterProps> = ({ suggestion, onDismiss }) => {
  const [visible, setVisible] = useState(false)
  
  useEffect(() => {
    if (suggestion) {
      setVisible(true)
      const timer = setTimeout(() => {
        setVisible(false)
        setTimeout(onDismiss, 500) // Wait for fade out animation
      }, 10000)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
      return undefined
    }
  }, [suggestion, onDismiss])

  if (!suggestion && !visible) return null

  return (
    <button 
      className={`
        absolute left-1/2 -translate-x-1/2 top-full mt-2
        bg-[var(--color-bg-glass)] border border-[var(--color-border-subtle)]
        px-3 py-1.5 rounded-full flex items-center gap-2 shadow-lg
        transition-all duration-500 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
      `}
      onClick={() => { setVisible(false); setTimeout(onDismiss, 500); }}
      title="Click to dismiss"
    >
      <Sparkles size={12} className="text-[var(--color-violet)] shrink-0" />
      <span className="text-[11px] italic text-[var(--color-text-secondary)]">
        {suggestion}
      </span>
    </button>
  )
}
