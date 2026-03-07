import React from 'react'
import './ui.css'

interface EmptyStateProps {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="ui-empty-state stagger-child" role="status">
      <div className="ui-empty-icon-wrapper">
        <Icon className="ui-empty-icon" size={48} strokeWidth={1} />
      </div>
      <h3 className="ui-empty-title">{title}</h3>
      {description && <p className="ui-empty-desc">{description}</p>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  )
}
