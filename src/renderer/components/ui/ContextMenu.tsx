import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import './ui.css'

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  divider?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  useEffect(() => {
    const handleClick = () => onClose()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    // Slight delay to not fire onClose synchronously from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
      document.addEventListener('contextmenu', handleClick)
    }, 0)

    document.addEventListener('keydown', handleKey)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
      document.removeEventListener('contextmenu', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 200), // Prevent offscreen bottom
    left: Math.min(x, window.innerWidth - 200), // Prevent offscreen right
  }

  return createPortal(
    <div className="ui-context-menu surface-glass-premium gpu-promoted" style={menuStyle}>
      {items.map((item, idx) => {
        if (item.divider) return <div key={`div-${idx}`} className="ui-menu-divider" />
        return (
          <button
            key={`item-${idx}`}
            className={`ui-menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={e => {
              e.stopPropagation()
              item.onClick()
              onClose()
            }}
          >
            {item.icon && <span className="ui-menu-icon">{item.icon}</span>}
            {item.label}
          </button>
        )
      })}
    </div>,
    document.body
  )
}
