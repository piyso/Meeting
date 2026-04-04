import React from 'react'
import { motion } from 'framer-motion'
import { CalendarIcon, MapPin, ExternalLink, Video } from 'lucide-react'
import { AvatarGroup } from '../ui/AvatarGroup'

export interface CalendarEventProps {
  id: string
  title: string
  startTime: Date
  endTime: Date
  location?: string
  isVirtual?: boolean
  attendees: { name: string; email?: string; photo?: string }[]
  color?: 'violet' | 'amber' | 'emerald' | 'blue'
  onJoin?: () => void
  className?: string
}

export const EventCard: React.FC<CalendarEventProps> = ({
  title,
  startTime,
  endTime,
  location,
  isVirtual,
  attendees,
  color = 'violet',
  onJoin,
  className = '',
}) => {
  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const avatars = attendees.map(a => ({
    src: a.photo,
    fallback: a.name,
    colorHint: 'amber' as const, // We could randomize or hash this
  }))

  const colorStyles = {
    violet: 'border-violet/20 bg-violet/5 hover:border-violet/40',
    amber: 'border-amber/20 bg-amber/5 hover:border-amber/40',
    emerald: 'border-emerald/20 bg-emerald/5 hover:border-emerald/40',
    blue: 'border-blue/20 bg-blue/5 hover:border-blue/40',
  }[color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className={`relative rounded-2xl border backdrop-blur-xl p-4 flex flex-col gap-3 transition-colors group ${colorStyles} ${className}`}
    >
      <div className="flex justify-between items-start gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-primary leading-tight group-hover:text-white transition-colors">
            {title}
          </h3>
          <div className="flex items-center gap-2 text-xs font-medium text-secondary">
            <CalendarIcon size={12} className="opacity-70" />
            <span>
              {formatTime(startTime)} - {formatTime(endTime)}
            </span>
          </div>
        </div>

        {onJoin && isVirtual && (
          <button
            onClick={onJoin}
            className="flex items-center gap-1.5 shrink-0 bg-glass hover:bg-glass-hover border border-border-subtle rounded-full px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-transform active:scale-95"
          >
            <Video size={12} className={`text-${color}`} />
            Join
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mt-auto pt-2">
        <div className="flex items-center gap-3">
          {attendees.length > 0 && <AvatarGroup avatars={avatars} max={4} size="sm" />}
        </div>

        {location && !isVirtual && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-tertiary max-w-[120px] truncate">
            <MapPin size={12} />
            <span className="truncate">{location}</span>
          </div>
        )}

        {location && isVirtual && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-tertiary">
            <ExternalLink size={12} />
            <span>Zoom</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
