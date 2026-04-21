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
    } else {
      setVisible(false)
    }
  }, [suggestion])

  if (!suggestion && !visible) return null

  return (
    <div
      role="button"
      tabIndex={0}
      aria-live="polite"
      aria-label={`AI suggestion: ${suggestion || ''}. Press Enter to dismiss.`}
      className={`ui-silent-prompter ${visible ? 'is-visible' : ''} cursor-pointer`}
      onClick={e => {
        e.preventDefault()
        setVisible(false)
        setTimeout(onDismiss, 500)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setVisible(false)
          setTimeout(onDismiss, 500)
        }
      }}
      title="Click to dismiss"
    >
      <Sparkles size={14} aria-hidden="true" className="ui-silent-prompter-icon" />
      <span className="ui-silent-prompter-text">{suggestion}</span>
      <span
        aria-hidden="true"
        className="ui-silent-prompter-action text-[11px] font-semibold uppercase tracking-wider text-[var(--color-violet)] bg-[rgba(139,92,246,0.1)] px-2 py-0.5 rounded-full ml-1"
      >
        Dismiss
      </span>
    </div>
  )
}
