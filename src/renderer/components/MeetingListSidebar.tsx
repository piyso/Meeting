import React from 'react'
import { useQuery } from '@tanstack/react-query'
import './MeetingListSidebar.css'

interface MeetingListSidebarProps {
  activeMeetingId?: string
  onMeetingSelect?: (meetingId: string) => void
}

export const MeetingListSidebar: React.FC<MeetingListSidebarProps> = ({
  activeMeetingId,
  onMeetingSelect,
}) => {
  // Fetch meetings using React Query
  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['meetings'],
    queryFn: async () => {
      const result = await window.electronAPI.meeting.list({})
      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch meetings')
      }
      return result
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  const meetings = response?.data?.items || []

  // Sort meetings by start_time (most recent first)
  const sortedMeetings = [...meetings].sort((a, b) => b.start_time - a.start_time)

  const handleMeetingClick = (meetingId: string) => {
    if (onMeetingSelect) {
      onMeetingSelect(meetingId)
    }
  }

  const handleRefresh = () => {
    refetch()
  }

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return 'Today'
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays} days ago`
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      })
    }
  }

  const formatDuration = (durationMs?: number | null): string => {
    if (!durationMs) return 'In progress'

    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m`
    } else {
      return `${seconds}s`
    }
  }

  return (
    <div className="meeting-list-sidebar">
      <div className="sidebar-header">
        <h2>Meetings</h2>
        <button
          className="refresh-button"
          onClick={handleRefresh}
          title="Refresh meetings"
          aria-label="Refresh meetings"
        >
          ↻
        </button>
      </div>

      <div className="sidebar-content">
        {isLoading && (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading meetings...</p>
          </div>
        )}

        {isError && (
          <div className="error-state">
            <p className="error-message">
              Failed to load meetings: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <button className="retry-button" onClick={handleRefresh}>
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && sortedMeetings.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <p className="empty-message">No meetings yet</p>
            <p className="empty-hint">Start recording to create your first meeting</p>
          </div>
        )}

        {!isLoading && !isError && sortedMeetings.length > 0 && (
          <ul className="meeting-list">
            {sortedMeetings.map(meeting => (
              <li
                key={meeting.id}
                className={`meeting-item ${activeMeetingId === meeting.id ? 'active' : ''}`}
                onClick={() => handleMeetingClick(meeting.id)}
              >
                <div className="meeting-item-header">
                  <h3 className="meeting-title">{meeting.title}</h3>
                </div>
                <div className="meeting-item-meta">
                  <div className="meeting-date">
                    <span>📅</span>
                    <span>{formatDate(meeting.start_time)}</span>
                  </div>
                  <div className="meeting-duration">
                    <span>⏱️</span>
                    <span>{formatDuration(meeting.duration)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
