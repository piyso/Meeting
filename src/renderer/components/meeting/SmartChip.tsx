import React from 'react'
import './ui.css'

export type EntityType = 'PERSON' | 'DATE' | 'AMOUNT' | 'ACTION_ITEM'

interface SmartChipProps {
  type: EntityType
  label: string
  onClick?: () => void
}

export const SmartChip: React.FC<SmartChipProps> = ({ type, label, onClick }) => {
  const getIcon = () => {
    switch (type) {
      case 'PERSON': return '👤'
      case 'DATE': return '📅'
      case 'AMOUNT': return '💰'
      case 'ACTION_ITEM': return '⚡'
    }
  }

  return (
    <button 
      className={`ui-smart-chip chip-${type.toLowerCase()}`}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation()
          onClick()
        }
      }}
      disabled={!onClick}
    >
      <span className="chip-icon">{getIcon()}</span>
      <span className="chip-label">{label}</span>
    </button>
  )
}
