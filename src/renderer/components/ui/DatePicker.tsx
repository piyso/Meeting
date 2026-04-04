import React, { useState } from 'react'
import { Popover } from './Popover'
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from './IconButton'
import { motion } from 'framer-motion'

export interface DatePickerProps {
  date: Date | null
  onChange: (date: Date) => void
  placeholder?: string
  className?: string
}

export const DatePicker: React.FC<DatePickerProps> = ({
  date,
  onChange,
  placeholder = 'Select date...',
  className = '',
}) => {
  const [currentMonth, setCurrentMonth] = useState(date || new Date())

  // Basic calendar logic (for illustration, a production app might use date-fns)
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const prevMonthEmpty = Array.from({ length: firstDay }, (_, i) => i)

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const handleSelectDate = (d: number) => {
    onChange(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d))
  }

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  const trigger = (
    <button
      type="button"
      className={`flex items-center gap-2 h-9 px-3 rounded-md border border-border-subtle bg-glass hover:bg-glass-hover text-sm transition-colors text-left min-w-[140px] focus:outline-none focus:ring-2 focus:ring-violet ${className}`}
    >
      <CalendarIcon size={14} className="text-secondary" />
      <span className={date ? 'text-primary' : 'text-muted'}>
        {date ? date.toLocaleDateString() : placeholder}
      </span>
    </button>
  )

  const content = (
    <div className="w-[260px] p-2 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <IconButton icon={<ChevronLeft size={16} />} onClick={handlePrevMonth} />
        <div className="text-sm font-medium tracking-wide">
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </div>
        <IconButton icon={<ChevronRight size={16} />} onClick={handleNextMonth} />
      </div>

      {/* Days header */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-[10px] uppercase font-bold text-secondary tracking-widest">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {prevMonthEmpty.map(d => (
          <div key={`empty-${d}`} className="h-8" />
        ))}
        {days.map(d => {
          const isSelected =
            date?.getDate() === d &&
            date?.getMonth() === currentMonth.getMonth() &&
            date?.getFullYear() === currentMonth.getFullYear()
          const isToday =
            new Date().getDate() === d &&
            new Date().getMonth() === currentMonth.getMonth() &&
            new Date().getFullYear() === currentMonth.getFullYear()

          return (
            <motion.button
              key={d}
              onClick={() => handleSelectDate(d)}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className={`h-8 w-8 rounded-full flex items-center justify-center text-xs transition-colors ${
                isSelected
                  ? 'bg-violet text-panel shadow-[0_0_12px_rgba(167,139,250,0.5)] font-medium'
                  : isToday
                    ? 'text-emerald font-bold border border-emerald/50 bg-emerald/10'
                    : 'text-primary hover:bg-glass-hover hover:text-violet'
              }`}
            >
              {d}
            </motion.button>
          )
        })}
      </div>
    </div>
  )

  return <Popover trigger={trigger} content={content} />
}
