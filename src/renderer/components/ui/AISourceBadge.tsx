import React from 'react'

interface AISourceBadgeProps {
  source: 'edge' | 'cloud'
}

export const AISourceBadge: React.FC<AISourceBadgeProps> = ({ source }) => {
  const isEdge = source === 'edge'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: isEdge ? 'rgba(16, 185, 129, 0.1)' : 'rgba(139, 92, 246, 0.1)',
        color: isEdge ? '#10b981' : '#8b5cf6',
        border: `1px solid ${isEdge ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)'}`,
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
      }}
      title={
        isEdge
          ? 'Processed entirely on your local device for absolute privacy.'
          : 'Processed via secured cloud API.'
      }
    >
      {isEdge ? '💻 Edge AI' : '☁️ Cloud AI'}
    </span>
  )
}
