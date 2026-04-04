import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

interface CursorData {
  id: string
  x: number
  y: number
  color: string
  name: string
  state: 'idle' | 'typing' | 'clicking'
}

export const CollaboratorCursors: React.FC = () => {
  const [cursors, setCursors] = useState<CursorData[]>([
    { id: 'u1', x: 250, y: 300, color: '#a78bfa', name: 'Alice', state: 'idle' },
    { id: 'u2', x: 800, y: 150, color: '#34d399', name: 'Bob', state: 'clicking' },
  ])

  // Mock animation to simulate WebRTC cursor movement
  useEffect(() => {
    const interval = setInterval(() => {
      setCursors(prev =>
        prev.map(c => ({
          ...c,
          x: c.x + (Math.random() - 0.5) * 50,
          y: c.y + (Math.random() - 0.5) * 50,
        }))
      )
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {cursors.map(cursor => (
        <motion.div
          key={cursor.id}
          animate={{ x: cursor.x, y: cursor.y }}
          transition={{ type: 'spring', stiffness: 200, damping: 25, mass: 0.8 }}
          className="absolute top-0 left-0 flex items-start gap-3"
        >
          {/* Custom SVG Mouse Cursor pointing top-left */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-md"
          >
            <path
              d="M4.693 2.152a1 1 0 0 1 1.488-.13l13.91 11.922a1 1 0 0 1-.365 1.696L14.4 16.9l-2.062 5.093a1 1 0 0 1-1.854 0L8.423 16.9l-5.327-1.26a1 1 0 0 1-.366-1.696l1.963-11.792z"
              fill={cursor.color}
              stroke="rgba(255,255,255,0.8)"
              strokeWidth="1.5"
            />
          </svg>

          <div className="flex flex-col gap-1 mt-3">
            <div
              className="px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide text-white shadow-macos-sm whitespace-nowrap"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.name}
            </div>

            {cursor.state === 'typing' && (
              <div className="flex gap-1 px-2 py-1 rounded bg-black/60 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce" />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce"
                  style={{ animationDelay: '100ms' }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce"
                  style={{ animationDelay: '200ms' }}
                />
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
