import React, { useMemo } from 'react'
import { motion } from 'framer-motion'

export interface CalendarStripProps {
  selectedDate: Date
  onSelectDate: (date: Date) => void
  meetingDates?: Date[]
  className?: string
}

export const CalendarStrip: React.FC<CalendarStripProps> = ({
  selectedDate,
  onSelectDate,
  meetingDates = [],
  className = '',
}) => {
  // Generate a rolling window of 14 days (7 before, today, 6 after)
  const days = useMemo(() => {
    const list = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    for (let i = -7; i <= 6; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      list.push(d)
    }
    return list
  }, [])

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()

  const hasMeeting = (d: Date) => meetingDates.some(md => isSameDay(md, d))

  return (
    <div className={`flex items-center gap-1 overflow-x-auto no-scrollbar py-2 ${className}`}>
      {days.map(d => {
        const isSelected = isSameDay(d, selectedDate)
        const isToday = isSameDay(d, new Date())
        const active = hasMeeting(d)

        return (
          <motion.button
            key={d.toISOString()}
            onClick={() => onSelectDate(d)}
            whileTap={{ scale: 0.95 }}
            className={`flex flex-col items-center justify-center min-w-[50px] py-2 rounded-xl transition-colors shrink-0 group relative ${
              isSelected
                ? 'bg-panel backdrop-blur-xl border border-border bg-gradient-to-b from-[rgba(167,139,250,0.15)] to-transparent shadow-macos-sm'
                : 'hover:bg-glass hover:border hover:border-border-subtle border border-transparent'
            }`}
          >
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                isSelected
                  ? 'text-primary'
                  : 'text-secondary group-hover:text-primary transition-colors'
              }`}
            >
              {d.toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
            <span
              className={`text-[16px] font-medium leading-none mt-1 ${
                isSelected ? 'text-violet font-semibold' : 'text-primary'
              }`}
            >
              {d.getDate()}
            </span>

            {/* Meeting Indication Dot */}
            <div className="w-full flex justify-center mt-1.5 h-1">
              {active && (
                <div
                  className={`w-1 h-1 rounded-full ${
                    isSelected ? 'bg-violet shadow-[0_0_8px_rgba(167,139,250,0.8)]' : 'bg-secondary'
                  }`}
                />
              )}
            </div>

            {/* Today indicator line */}
            {isToday && !isSelected && (
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-emerald" />
            )}

            {/* Absolute positioning for focus outline */}
            <div className="absolute inset-0 rounded-xl ring-2 ring-violet ring-offset-2 ring-offset-base opacity-0 group-focus-visible:opacity-100 transition-opacity pointer-events-none" />
          </motion.button>
        )
      })}
    </div>
  )
}
