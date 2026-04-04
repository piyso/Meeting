import React, { useMemo } from 'react'
import { Calendar, ChevronRight, CalendarOff, Loader2 } from 'lucide-react'
import { EventCard, CalendarEventProps } from './EventCard'
import { EmptyState } from '../ui/EmptyState'
import { useCalendar } from '../../hooks/queries/useCalendar'

export const AgendaPanel: React.FC = () => {
  const { upcomingEvents: rawEvents, isLoading, connectCalendar } = useCalendar()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfter = new Date(today)
  dayAfter.setDate(dayAfter.getDate() + 2)

  const mappedEvents = useMemo(() => {
    return rawEvents.map((evt: import('../../../types/features').CalendarEvent, i: number) => {
      const colors: ('violet' | 'emerald' | 'amber' | 'blue')[] = [
        'violet',
        'emerald',
        'amber',
        'blue',
      ]
      let attendeeList: { name: string }[] = []
      try {
        const parsed = evt.attendees ? JSON.parse(evt.attendees) : []
        attendeeList = Array.isArray(parsed) ? parsed.map((a: string) => ({ name: a })) : []
      } catch {
        // Ignore parse error
      }
      return {
        id: evt.id || `evt-${i}`,
        title: evt.title || 'Untitled Event',
        startTime: new Date(evt.start_time * 1000),
        endTime: new Date(evt.end_time * 1000),
        location: evt.location ?? undefined,
        isVirtual:
          evt.location?.toLowerCase().includes('zoom') ||
          evt.location?.toLowerCase().includes('meet'),
        attendees: attendeeList,
        color: colors[i % colors.length],
      } as CalendarEventProps
    })
  }, [rawEvents])

  const eventsToday = mappedEvents.filter(e => e.startTime >= today && e.startTime < tomorrow)
  const eventsTomorrow = mappedEvents.filter(e => e.startTime >= tomorrow && e.startTime < dayAfter)

  return (
    <div className="flex flex-col w-full h-full border-l border-border-subtle bg-transparent">
      <div className="flex items-center justify-between p-6 pb-4 border-b border-border-subtle/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-glass border border-border-inset rounded-lg text-primary shadow-macos-sm">
            <Calendar size={16} />
          </div>
          <h2 className="text-lg font-semibold text-primary tracking-tight">Agenda</h2>
        </div>
        <button
          onClick={() => connectCalendar.mutate('apple')}
          className="text-xs font-semibold text-violet hover:text-white transition-colors flex items-center gap-1 group"
        >
          Connect Calendar
          <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar sovereign-scrollbar">
        {isLoading && (
          <div className="flex items-center justify-center py-6 text-tertiary">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}

        {!isLoading && (
          <>
            <div>
              <h3 className="text-[11px] font-bold text-tertiary uppercase tracking-widest mb-4 flex items-center gap-3">
                Today <div className="h-px bg-border-inset flex-1" />
              </h3>
              {eventsToday.length === 0 ? (
                <div className="text-xs text-tertiary px-2 italic pb-4">
                  No events scheduled today
                </div>
              ) : (
                <div className="space-y-3">
                  {eventsToday.map(event => (
                    <EventCard key={event.id} {...event} />
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-[11px] font-bold text-tertiary uppercase tracking-widest mb-4 flex items-center gap-3">
                Tomorrow <div className="h-px bg-border-inset flex-1" />
              </h3>
              {eventsTomorrow.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={CalendarOff}
                    title="Clear schedule"
                    description="No events scheduled for tomorrow."
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {eventsTomorrow.map(event => (
                    <EventCard key={event.id} {...event} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
