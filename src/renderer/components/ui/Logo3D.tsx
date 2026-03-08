import React from 'react'

interface Logo3DProps {
  className?: string
}

/** Simple static SVG logo — matches the macOS app icon exactly */
export const Logo3D: React.FC<Logo3DProps> = ({ className = '' }) => {
  return (
    <div className={`relative w-48 h-48 mx-auto flex items-center justify-center ${className}`}>
      <svg width="160" height="160" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        {/* Outer ring (cyan glow) */}
        <circle
          cx="512"
          cy="512"
          r="280"
          fill="none"
          stroke="rgba(6,182,212,0.25)"
          strokeWidth="8"
        />

        {/* Inner spinning ring */}
        <circle
          cx="512"
          cy="512"
          r="220"
          fill="none"
          stroke="rgba(59,130,246,0.4)"
          strokeWidth="12"
        />

        {/* Wave arcs (left and right) */}
        <path
          d="M 292 512 A 220 220 0 0 1 512 292"
          fill="none"
          stroke="rgba(34,211,238,0.6)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 732 512 A 220 220 0 0 1 512 732"
          fill="none"
          stroke="rgba(34,211,238,0.6)"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Center recording dot */}
        <circle cx="512" cy="512" r="80" fill="#22D3EE" />

        {/* Dot inner highlight */}
        <circle cx="512" cy="512" r="50" fill="#0EA5E9" opacity="0.6" />
      </svg>
    </div>
  )
}
