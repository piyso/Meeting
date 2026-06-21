import React from 'react'

interface StatItemProps {
  title: string
  value: string | number
  icon: React.ElementType
}

export const StatItem: React.FC<StatItemProps> = ({ title, value, icon: Icon }) => (
  <div className="ui-digest-stat-item">
    <div className="ui-digest-stat-squircle">
      <Icon size={20} />
    </div>
    <div className="ui-digest-stat-info">
      <div className="ui-digest-stat-card-title">{title}</div>
      <div className="ui-digest-stat-card-val">{value}</div>
    </div>
  </div>
)
