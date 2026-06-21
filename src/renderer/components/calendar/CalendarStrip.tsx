import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface CalendarMeetingItem {
  start_time: number
}

export interface CalendarStripProps {
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  meetings?: CalendarMeetingItem[]
  className?: string
}

const isSameDay = (d1: Date | null, d2: Date | null) => {
  if (!d1 || !d2) return false
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  )
}

const CalendarDay = React.memo(
  ({
    dateStr,
    dayNum,
    weekday,
    isSelected,
    isToday,
    stats,
    onSelect,
  }: {
    dateStr: string
    dayNum: number
    weekday: string
    isSelected: boolean
    isToday: boolean
    stats?: { past: number; future: number }
    onSelect: (dateStr: string) => void
  }) => {
    const hasPast = stats && stats.past > 0
    const hasFuture = stats && stats.future > 0

    let tooltipText = undefined
    if (stats) {
      const parts = []
      if (stats.past > 0) parts.push(`${stats.past} Recorded`)
      if (stats.future > 0) parts.push(`${stats.future} Scheduled`)
      tooltipText = parts.join(' • ')
    }

    return (
      <motion.button
        onClick={() => onSelect(dateStr)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(dateStr)
          }
        }}
        data-selected={isSelected}
        data-today={isToday}
        title={tooltipText}
        whileTap={{ scale: 0.95 }}
        className={`flex flex-col items-center justify-center min-w-[50px] py-2 rounded-xl transition-colors group relative ${
          !isSelected
            ? 'hover:bg-glass hover:border hover:border-border-subtle border border-transparent'
            : 'border border-transparent'
        }`}
      >
        {isSelected && (
          <motion.div
            layoutId="calendar-selection-bg"
            className="absolute inset-0 bg-panel backdrop-blur-xl border border-border bg-gradient-to-b from-[rgba(167,139,250,0.15)] to-transparent shadow-macos-sm rounded-xl"
            style={{ zIndex: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        <span
          className={`text-[10px] font-bold uppercase tracking-widest relative z-10 ${
            isSelected
              ? 'text-primary'
              : 'text-secondary group-hover:text-primary transition-colors'
          }`}
        >
          {weekday}
        </span>
        <span
          className={`text-[16px] font-medium leading-none mt-1 relative z-10 ${
            isSelected ? 'text-violet font-semibold' : 'text-primary'
          }`}
        >
          {dayNum}
        </span>

        {/* Semantic Meeting Indicators */}
        <div className="w-full flex justify-center items-center mt-1.5 h-1 gap-[2px] relative z-10">
          {hasPast && (
            <div
              className={`w-1 h-1 rounded-full ${
                isSelected
                  ? 'bg-violet shadow-[0_0_8px_rgba(167,139,250,0.8)]'
                  : 'bg-violet opacity-70'
              }`}
            />
          )}
          {hasFuture && (
            <div
              className={`w-1 h-1 rounded-full ${
                isSelected
                  ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
                  : 'bg-amber-500 opacity-70'
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
  }
)

const formatDateString = (d: Date) => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export const CalendarStrip: React.FC<CalendarStripProps> = ({
  selectedDate,
  onSelectDate,
  meetings = [],
  className = '',
}) => {
  const [today, setToday] = useState(new Date())

  // The center of our 7-day window. Defaults to today's date initially.
  const [windowCenter, setWindowCenter] = useState(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  })

  // Handle midnight rollover
  useEffect(() => {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timeUntilMidnight = tomorrow.getTime() - now.getTime()

    const timer = setTimeout(() => {
      setToday(new Date())
    }, timeUntilMidnight + 1000) // add 1s buffer

    return () => clearTimeout(timer)
  }, [today])

  // Generate exactly 7 days (-3 to +3) around the windowCenter
  const days = useMemo(() => {
    const list = []
    const base = new Date(windowCenter)
    base.setHours(0, 0, 0, 0)

    for (let i = -3; i <= 3; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      list.push(d)
    }
    return list
  }, [windowCenter])

  // O(N) lookup mapping date strings to past/future counts
  const meetingDateStats = useMemo(() => {
    const stats = new Map<string, { past: number; future: number }>()
    const now = Date.now()

    for (const m of meetings) {
      const d = new Date(m.start_time * 1000)
      const dateStr = formatDateString(d)

      const current = stats.get(dateStr) || { past: 0, future: 0 }
      if (m.start_time * 1000 <= now) {
        current.past += 1
      } else {
        current.future += 1
      }
      stats.set(dateStr, current)
    }
    return stats
  }, [meetings])

  const handlePrevWeek = useCallback(() => {
    setWindowCenter(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }, [])

  const handleNextWeek = useCallback(() => {
    setWindowCenter(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return d
    })
  }, [])

  const handleSelectDateString = useCallback(
    (ds: string) => {
      const [y = '0', m = '1', day = '1'] = ds.split('-')
      onSelectDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(day, 10)))
    },
    [onSelectDate]
  )

  const monthYearLabel = useMemo(() => {
    if (days.length === 0) return ''
    const first = days[0]
    const last = days[days.length - 1]
    if (!first || !last) return ''

    const startMonth = first.toLocaleString('en-US', { month: 'short' })
    const endMonth = last.toLocaleString('en-US', { month: 'short' })
    const startYear = first.getFullYear()
    const endYear = last.getFullYear()

    if (startYear !== endYear) {
      return `${startMonth} ${startYear} - ${endMonth} ${endYear}`
    } else if (startMonth !== endMonth) {
      return `${startMonth} - ${endMonth} ${startYear}`
    }
    return `${first.toLocaleString('en-US', { month: 'long' })} ${startYear}`
  }, [days])

  return (
    <div
      className={`flex flex-col items-center py-2 outline-none ${className}`}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft') {
          handlePrevWeek()
        } else if (e.key === 'ArrowRight') {
          handleNextWeek()
        }
      }}
    >
      {/* Month / Year Header */}
      <div className="relative h-8 w-full flex justify-center items-center mb-2">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={monthYearLabel}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="text-sm font-medium text-secondary tracking-wide select-none leading-loose pb-1"
          >
            {monthYearLabel}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Date Strip */}
      <div className="flex items-center justify-center gap-1">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handlePrevWeek}
          className="p-1 text-secondary hover:text-primary transition-colors rounded-full hover:bg-glass"
        >
          <ChevronLeft size={20} />
        </motion.button>

        <div className="flex items-center gap-1">
          {days.map(d => {
            const dateStr = formatDateString(d)
            return (
              <CalendarDay
                key={dateStr}
                dateStr={dateStr}
                dayNum={d.getDate()}
                weekday={d.toLocaleDateString(undefined, { weekday: 'short' })}
                isSelected={isSameDay(d, selectedDate)}
                isToday={isSameDay(d, today)}
                stats={meetingDateStats.get(dateStr)}
                onSelect={handleSelectDateString}
              />
            )
          })}
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleNextWeek}
          className="p-1 text-secondary hover:text-primary transition-colors rounded-full hover:bg-glass"
        >
          <ChevronRight size={20} />
        </motion.button>
      </div>
    </div>
  )
}
