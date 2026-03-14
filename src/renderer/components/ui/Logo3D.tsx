import React from 'react'

interface Logo3DProps {
  className?: string
}

/**
 * Large version of the canonical BlueArkive logo for onboarding/splash screens.
 * Matches build/icon.svg exactly. All gradient IDs use 'ba3-' prefix to avoid
 * collisions with Logo.tsx on the same page.
 */
export const Logo3D: React.FC<Logo3DProps> = ({ className = '' }) => {
  return (
    <div className={`relative w-48 h-48 mx-auto flex items-center justify-center ${className}`}>
      <svg width="160" height="160" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ba3-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0C1120" />
            <stop offset="100%" stopColor="#040608" />
          </linearGradient>
          <linearGradient id="ba3-rim" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.0)" />
          </linearGradient>
          <linearGradient
            id="ba3-arc-tl"
            x1="292"
            y1="512"
            x2="512"
            y2="292"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#00F0FF" />
            <stop offset="100%" stopColor="#0055FF" />
          </linearGradient>
          <linearGradient
            id="ba3-arc-br"
            x1="732"
            y1="512"
            x2="512"
            y2="732"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#00F0FF" />
            <stop offset="100%" stopColor="#0055FF" />
          </linearGradient>
          <radialGradient id="ba3-core" cx="40%" cy="38%" r="62%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="20%" stopColor="#A5F3FC" />
            <stop offset="55%" stopColor="#0EA5E9" />
            <stop offset="100%" stopColor="#0369A1" />
          </radialGradient>
          <filter id="ba3-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="14" result="b1" />
            <feGaussianBlur stdDeviation="6" result="b2" />
            <feMerge>
              <feMergeNode in="b1" />
              <feMergeNode in="b2" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ba3-core-fx" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="12" stdDeviation="20" floodColor="#000" floodOpacity="0.7" />
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="28"
              floodColor="#00D4FF"
              floodOpacity="0.25"
            />
          </filter>
        </defs>

        {/* Base squircle */}
        <rect width="1024" height="1024" rx="230" fill="url(#ba3-bg)" />
        <rect
          x="2"
          y="2"
          width="1020"
          height="1020"
          rx="228"
          fill="none"
          stroke="url(#ba3-rim)"
          strokeWidth="3"
        />

        {/* Ambient backlight */}
        <circle cx="512" cy="512" r="340" fill="#0088FF" opacity="0.06" filter="url(#ba3-glow)" />

        {/* Outer orbit */}
        <circle
          cx="512"
          cy="512"
          r="300"
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="1.5"
          strokeDasharray="4 16"
        />

        {/* Mid ring */}
        <circle
          cx="512"
          cy="512"
          r="220"
          fill="none"
          stroke="rgba(56,189,248,0.15)"
          strokeWidth="4"
        />

        {/* Wave arcs */}
        <path
          d="M 292 512 A 220 220 0 0 1 512 292"
          fill="none"
          stroke="url(#ba3-arc-tl)"
          strokeWidth="12"
          strokeLinecap="round"
          filter="url(#ba3-glow)"
        />
        <path
          d="M 732 512 A 220 220 0 0 1 512 732"
          fill="none"
          stroke="url(#ba3-arc-br)"
          strokeWidth="12"
          strokeLinecap="round"
          filter="url(#ba3-glow)"
        />

        {/* Inner precision ring */}
        <circle
          cx="512"
          cy="512"
          r="140"
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1.5"
        />

        {/* Core orb */}
        <circle cx="512" cy="512" r="80" fill="url(#ba3-core)" filter="url(#ba3-core-fx)" />

        {/* Core specular highlight */}
        <ellipse
          cx="488"
          cy="480"
          rx="24"
          ry="12"
          transform="rotate(-30 488 480)"
          fill="#FFFFFF"
          opacity="0.35"
        />
      </svg>
    </div>
  )
}
