import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import type { WeeklyDigest } from '../../types/ipc'
import {
  Calendar,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  MessageSquare,
  Target,
  ChevronLeft,
  ExternalLink,
  ChevronDown,
} from 'lucide-react'

import { Button } from '../components/ui/Button'
import { DigestSkeleton } from '../components/ui/Skeletons'
import { IconButton } from '../components/ui/IconButton'
import { ProTeaseOverlay } from '../components/ui/ProTeaseOverlay'

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const formatRelativeTime = (ts: number) => {
  const diff = Date.now() - ts
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/* ── Source Context Popover ── */
interface SourcePopoverData {
  meetingTitle: string
  meetingDate?: number
  sourceContext?: string
  meetingId: string
}

const SourceContextPopover = ({
  data,
  anchorRect,
  onClose,
  onOpenMeeting,
}: {
  data: SourcePopoverData
  anchorRect: DOMRect
  onClose: () => void
  onOpenMeeting: (id: string) => void
}) => {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  // Position popover above or below the anchor depending on available space
  const spaceAbove = anchorRect.top
  const spaceBelow = window.innerHeight - anchorRect.bottom
  const positionAbove = spaceAbove > 200 || spaceAbove > spaceBelow
  const style: React.CSSProperties = {
    position: 'fixed',
    ...(positionAbove
      ? { bottom: window.innerHeight - anchorRect.top + 8 }
      : { top: anchorRect.bottom + 8 }),
    left: Math.max(
      16,
      Math.min(anchorRect.left + anchorRect.width / 2 - 160, window.innerWidth - 336)
    ),
    zIndex: 999,
  }

  return (
    <div ref={popoverRef} className="ui-digest-source-popover" style={style}>
      <div className="ui-digest-source-popover-header">
        <span className="ui-digest-source-popover-title">{data.meetingTitle}</span>
        {data.meetingDate && (
          <span className="ui-digest-source-popover-date">{formatDate(data.meetingDate)}</span>
        )}
      </div>
      {data.sourceContext && (
        <blockquote className="ui-digest-source-popover-quote">{data.sourceContext}</blockquote>
      )}
      <button
        className="ui-digest-source-popover-open"
        onClick={() => {
          onOpenMeeting(data.meetingId)
          onClose()
        }}
      >
        Open Full Meeting →
      </button>
    </div>
  )
}

const StatItem = ({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string | number
  icon: React.ElementType
}) => (
  <div className="ui-digest-stat-item">
    <div className="ui-digest-stat-squircle">
      <Icon size={20} />
    </div>
    <div className="ui-digest-stat-info">
      <div className="ui-digest-stat-card-title">{title}</div>
      <div className="ui-digest-stat-card-val">{value}</div>
    </div>
  </div>
)

const TopParticipantItem = ({
  name,
  count,
  isLast,
  meetingTitles,
  maxCount,
}: {
  name: string
  count: number
  isLast: boolean
  meetingTitles?: string[]
  maxCount: number
}) => (
  <div className={`ui-digest-participant-item${isLast ? ' is-last' : ''}`}>
    <div className="ui-digest-participant-info">
      <span className="ui-digest-participant-name">{name}</span>
      {meetingTitles && meetingTitles.length > 0 && (
        <span className="ui-digest-participant-meetings">
          {meetingTitles.slice(0, 2).join(', ')}
          {meetingTitles.length > 2 ? ` +${meetingTitles.length - 2}` : ''}
        </span>
      )}
    </div>
    <div className="ui-digest-participant-bar-container">
      <div className="ui-digest-participant-bar">
        <div
          className="ui-digest-participant-bar-fill"
          style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
        />
      </div>
    </div>
    <span className="ui-digest-participant-count">{count} mtgs</span>
  </div>
)

const TopTopicItem = ({
  topic,
  count,
  meetingTitles,
  maxCount,
}: {
  topic: string
  count: number
  meetingTitles?: string[]
  maxCount: number
}) => (
  <div className="ui-digest-topic-item">
    <div className="ui-digest-topic-item-info">
      <div className="ui-digest-topic-item-name">{topic}</div>
      {meetingTitles && meetingTitles.length > 0 && (
        <div className="ui-digest-topic-item-meetings">
          {meetingTitles.slice(0, 2).join(', ')}
          {meetingTitles.length > 2 ? ` +${meetingTitles.length - 2}` : ''}
        </div>
      )}
    </div>
    <div className="ui-digest-topic-bar-container">
      <div className="ui-digest-topic-bar">
        <div
          className="ui-digest-topic-bar-fill"
          style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
        />
      </div>
    </div>
    <span className="ui-digest-topic-count">{count}</span>
  </div>
)

export default function WeeklyDigestView() {
  const navigate = useAppStore(s => s.navigate)
  const currentTier = useAppStore(s => s.currentTier)
  const isAiLocked = currentTier === 'free' || currentTier === 'starter'
  const [digest, setDigest] = useState<WeeklyDigest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const [aiStatusText, setAiStatusText] = useState<string>('')
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  // Sections default to collapsed — user expands what they need
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['actions']))
  const [sourcePopover, setSourcePopover] = useState<{
    data: SourcePopoverData
    rect: DOMRect
  } | null>(null)

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const showSourcePopover = (e: React.MouseEvent, data: SourcePopoverData) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setSourcePopover({ data, rect })
  }

  /** Compute dynamic date range based on the selected period */
  function getDateRange(period: 'daily' | 'weekly' | 'monthly'): { start: Date; end: Date } {
    const now = new Date()
    const end = now
    const start = new Date(now)
    if (period === 'daily') {
      start.setHours(0, 0, 0, 0)
    } else if (period === 'weekly') {
      // P10 fix: Use Monday as week start (ISO 8601) instead of Sunday
      // (getDay()+6)%7 gives 0 for Monday, 6 for Sunday
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      start.setHours(0, 0, 0, 0)
    } else {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
    }
    return { start, end }
  }

  /** Format a date range for display, e.g. "Mar 3 – 9, 2026" */
  function formatDateRange(startMs: number, endMs: number): string {
    const s = new Date(startMs)
    const e = new Date(endMs)
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]
    if (
      s.getMonth() === e.getMonth() &&
      s.getFullYear() === e.getFullYear() &&
      s.getDate() === e.getDate()
    ) {
      // Same day (daily period)
      return `${monthNames[s.getMonth()]} ${s.getDate()}, ${e.getFullYear()}`
    }
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${monthNames[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
    }
    return `${monthNames[s.getMonth()]} ${s.getDate()} – ${monthNames[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`
  }

  const periodLabel =
    activePeriod === 'daily' ? "Today's" : activePeriod === 'weekly' ? 'Weekly' : 'Monthly'
  const periodNoun = activePeriod === 'daily' ? 'day' : activePeriod === 'weekly' ? 'week' : 'month'
  const periodAdj =
    activePeriod === 'daily' ? 'daily' : activePeriod === 'weekly' ? 'weekly' : 'monthly'

  // Check AI engine readiness on mount — ONLY for paying users
  useEffect(() => {
    if (isAiLocked) return // Free users never need AI status
    async function checkAIStatus() {
      try {
        const res = await window.electronAPI.intelligence.getEngineStatus()
        if (res.success && res.data) {
          const modelsLoaded = res.data.models.some(m => m.isLoaded)
          setAiReady(modelsLoaded)
          if (!modelsLoaded) {
            setAiStatusText('AI engine is loading — generation may take longer')
          } else {
            setAiStatusText('')
          }
        } else {
          setAiReady(false)
          setAiStatusText('AI engine unavailable')
        }
      } catch {
        setAiReady(false)
        setAiStatusText('AI engine status unknown')
      }
    }
    checkAIStatus()
  }, [isAiLocked])

  useEffect(() => {
    if (isAiLocked) return
    fetchDigest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiLocked, activePeriod])

  async function fetchDigest() {
    setIsLoading(true)
    try {
      const res = await window.electronAPI.digest.getLatest({ periodType: activePeriod })
      if (res.success && res.data) {
        setDigest(res.data)
      }
      // Don't auto-generate — just show empty state with Generate button
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const { start, end } = getDateRange(activePeriod)

      const res = await window.electronAPI.digest.generate({
        startDate: start.getTime(),
        endDate: end.getTime(),
        periodType: activePeriod,
      })

      if (res.success && res.data) {
        setDigest(res.data)
        // Reset expand states for fresh data — keep action items expanded
        setExpandedSections(new Set(['actions']))
      } else {
        const errorMsg = res.error?.message || 'Failed to generate digest.'
        const errorCode = res.error?.code || ''
        if (errorCode === 'LLM_NOT_LOADED' || errorMsg.toLowerCase().includes('ai engine')) {
          setError('AI engine is still loading. Please wait a moment and try again.')
        } else {
          setError(errorMsg)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during generation')
    } finally {
      setIsGenerating(false)
    }
  }

  const openMeeting = (id: string) => {
    if (!id) return // Guard against empty meetingId from backend fallbacks
    navigate('meeting-detail', id)
  }

  // ── Full-page lock for free/starter users ──
  if (isAiLocked) {
    return (
      <div className="ui-view-digest">
        <header className="ui-header">
          <IconButton
            icon={<ChevronLeft size={18} />}
            onClick={() => navigate('meeting-list')}
            className="mr-2"
            tooltip="Back to Meetings"
          />
          <div className="ui-header-title">
            <h1>{periodLabel} Digest</h1>
            <span className="ui-header-subtitle">Your personalized summary</span>
          </div>
        </header>
        {/* flex:1 fills remaining height; position:relative anchors ProTeaseOverlay's absolute inset-0 */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ProTeaseOverlay
            title="Unlock Weekly Digest"
            description={
              currentTier === 'starter'
                ? 'AI-powered weekly summaries are a Pro feature.'
                : 'Upgrade to get weekly summaries, action items, and analytics.'
            }
            targetTier="pro"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="ui-view-digest">
      <header className="ui-header">
        <IconButton
          icon={<ChevronLeft size={18} />}
          onClick={() => navigate('meeting-list')}
          className="mr-2"
          tooltip="Back to Meetings"
        />
        <div className="ui-header-title">
          <h1>{periodLabel} Digest</h1>
          <span className="ui-header-subtitle">
            {digest
              ? `${formatDateRange(digest.startDate, digest.endDate)}${digest.generatedAt ? ` · Generated ${formatRelativeTime(digest.generatedAt)}` : ''}`
              : 'Your personalized summary'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {/* Period selector — segmented control */}
          <div className="ui-digest-period-selector">
            {(['daily', 'weekly', 'monthly'] as const).map(period => (
              <button
                key={period}
                className={`ui-digest-period-btn${activePeriod === period ? ' is-active' : ''}`}
                onClick={() => {
                  setActivePeriod(period)
                  setDigest(null)
                  setError(null)
                  setExpandedSections(new Set(['actions']))
                }}
              >
                {period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          {aiStatusText && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(251,191,36,0.2)] bg-[rgba(251,191,36,0.04)] text-[var(--color-amber)] text-[11px] font-semibold tracking-wide backdrop-blur-md transition-opacity duration-300 ${aiReady === false ? 'opacity-100' : 'opacity-0'}`}
            >
              {aiStatusText}
            </div>
          )}

          <Button
            variant={aiReady === false ? 'secondary' : 'primary'}
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
            className={
              aiReady === false
                ? 'opacity-75 cursor-not-allowed hover:opacity-75 hover:bg-[var(--color-bg-elevated)]'
                : ''
            }
            title={
              aiReady === false
                ? 'AI engine is still loading — generation may be slower or fail'
                : `Regenerate ${periodAdj} digest`
            }
          >
            {isGenerating
              ? 'Generating...'
              : aiReady === null
                ? 'Checking AI...'
                : digest
                  ? 'Regenerate'
                  : 'Generate'}
          </Button>
        </div>
      </header>

      <div className="ui-digest-content scrollbar-webkit sovereign-scrollbar">
        {isLoading && !isGenerating ? (
          <DigestSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-[var(--color-rose)] gap-4 animate-slide-up bg-[rgba(244,63,94,0.05)] rounded-2xl border border-[rgba(244,63,94,0.1)] max-w-sm mx-auto mt-12 text-center">
            <AlertTriangle size={32} />
            <p>{error}</p>
            <Button variant="secondary" onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        ) : digest ? (
          digest.summary.totalMeetings === 0 ? (
            <div
              className="flex flex-col items-center justify-center p-20 gap-4 ui-stagger-enter sovereign-glass-panel rounded-[var(--radius-xl)] max-w-lg mx-auto mt-12 text-center relative overflow-hidden"
              style={{
                animationDelay: '80ms',
                padding: 'clamp(32px, 5vw, 64px) clamp(16px, 3vw, 32px)',
              }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[var(--color-violet)] rounded-full mix-blend-screen opacity-[0.12] blur-[64px] pointer-events-none" />
              <div className="relative z-10 w-20 h-20 rounded-full bg-[rgba(167,139,250,0.08)] border border-[rgba(255,255,255,0.05)] flex items-center justify-center mb-2 shadow-[0_0_32px_rgba(167,139,250,0.15),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md">
                <Calendar size={36} className="text-[var(--color-violet)] opacity-90" />
              </div>
              <div className="relative z-10">
                <h3 className="text-[var(--color-text-primary)] font-semibold mb-3 text-lg tracking-wide">
                  No Meetings This{' '}
                  {activePeriod === 'daily' ? 'Day' : activePeriod === 'weekly' ? 'Week' : 'Month'}
                </h3>
                <p className="text-sm m-0 leading-relaxed text-[var(--color-text-secondary)]">
                  You haven't archived any sessions during this period. Your{' '}
                  {periodLabel.toLowerCase()} summary and intelligence synthesis requires at least
                  one meeting to process.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Native Apple Metadata Band */}
              <div
                className="ui-digest-metadata-band ui-stagger-enter"
                style={{ animationDelay: '80ms' }}
              >
                <StatItem title="Meetings" value={digest.summary.totalMeetings} icon={Calendar} />
                <StatItem
                  title="Hours"
                  value={`${(digest.summary.totalHours || 0).toFixed(1)}h`}
                  icon={Clock}
                />
                <StatItem
                  title="Participants"
                  value={digest.summary.uniqueParticipants}
                  icon={Users}
                />
              </div>

              {/* AI Executive Summary — shown when cloud AI generates one */}
              {digest.summary.aiSummary && (
                <div className="ui-digest-ai-summary">
                  <p className="ui-digest-ai-summary-text">{digest.summary.aiSummary}</p>
                </div>
              )}

              <div className="osx-digest-columns">
                <div className="ui-digest-col">
                  {/* Action Items Section */}
                  {/* Outer unboxed section container */}
                  <div
                    className="flex flex-col gap-3 ui-stagger-enter"
                    style={{ animationDelay: '160ms' }}
                  >
                    <button
                      className="ui-digest-section-header"
                      onClick={() => toggleSection('actions')}
                    >
                      <div className="ui-digest-squircle monochrome">
                        <CheckCircle size={16} strokeWidth={2.5} />
                      </div>
                      <h2 className="ui-digest-card-title m-0">Action Items</h2>
                      <span className="ui-digest-count-badge monochrome">
                        {digest.actionItems.items.length}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`ui-digest-chevron${expandedSections.has('actions') ? ' is-expanded' : ''}`}
                      />
                    </button>

                    {expandedSections.has('actions') && (
                      <>
                        <div className="ui-digest-badges px-1">
                          <span className="ui-digest-pill monochrome">
                            <span className="pill-val">{digest.actionItems.completed}</span> Done
                          </span>
                          <span className="ui-digest-pill monochrome">
                            <span className="pill-val">{digest.actionItems.open}</span> Open
                          </span>
                          <span className="ui-digest-pill monochrome">
                            <span className="pill-val">{digest.actionItems.overdue}</span> Overdue
                          </span>
                        </div>

                        {digest.actionItems.items.length === 0 ? (
                          <div className="ui-digest-card flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent">
                            <CheckCircle
                              size={24}
                              className="text-[var(--color-text-muted)] mb-3 opacity-50"
                            />
                            <p className="ui-digest-empty-text text-sm">
                              You have zero pending tasks for this {periodNoun}.
                            </p>
                          </div>
                        ) : (
                          <ul className="ui-digest-action-list">
                            {[...digest.actionItems.items]
                              .sort((a, b) => {
                                // Priority: overdue → open → completed
                                const priority = { overdue: 0, open: 1, completed: 2 }
                                return (
                                  (priority[a.status as keyof typeof priority] ?? 1) -
                                  (priority[b.status as keyof typeof priority] ?? 1)
                                )
                              })
                              .map((item, i) => (
                                <li
                                  key={`action-${item.meetingId}-${i}`}
                                  className="ui-digest-action-list-item"
                                >
                                  <div
                                    className={`ui-digest-action-dot${item.status === 'completed' ? ' is-completed' : item.status === 'overdue' ? ' is-overdue' : ''}`}
                                  />
                                  <div
                                    className={`ui-digest-action-text-body${item.status === 'completed' ? ' is-completed' : ''}`}
                                  >
                                    <div>{item.text}</div>
                                    <div className="ui-digest-action-meta">
                                      {item.assignee && (
                                        <span className="flex items-center gap-1">
                                          👤 {item.assignee}
                                        </span>
                                      )}
                                      {item.dueDate && (
                                        <span className="flex items-center gap-1">
                                          🗓 {formatDate(item.dueDate)}
                                        </span>
                                      )}
                                      <span
                                        onClick={e =>
                                          showSourcePopover(e, {
                                            meetingTitle: item.meetingTitle || 'Meeting',
                                            meetingDate: item.meetingDate,
                                            sourceContext: item.sourceContext,
                                            meetingId: item.meetingId,
                                          })
                                        }
                                        onKeyDown={e =>
                                          e.key === 'Enter' &&
                                          showSourcePopover(e as unknown as React.MouseEvent, {
                                            meetingTitle: item.meetingTitle || 'Meeting',
                                            meetingDate: item.meetingDate,
                                            sourceContext: item.sourceContext,
                                            meetingId: item.meetingId,
                                          })
                                        }
                                        className="ui-digest-source-link ml-auto"
                                        role="button"
                                        tabIndex={0}
                                      >
                                        <ExternalLink size={12} className="opacity-70" />{' '}
                                        {item.meetingTitle || 'Source'}
                                      </span>
                                    </div>
                                  </div>
                                </li>
                              ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>

                  <div
                    className="flex flex-col gap-3 mt-4 ui-stagger-enter"
                    style={{ animationDelay: '240ms' }}
                  >
                    <button
                      className="ui-digest-section-header"
                      onClick={() => toggleSection('decisions')}
                    >
                      <div className="ui-digest-squircle monochrome">
                        <Target size={16} strokeWidth={2.5} />
                      </div>
                      <h2 className="ui-digest-card-title m-0">Key Decisions</h2>
                      <span className="ui-digest-count-badge monochrome">
                        {digest.keyDecisions.length}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`ui-digest-chevron${expandedSections.has('decisions') ? ' is-expanded' : ''}`}
                      />
                    </button>

                    {expandedSections.has('decisions') && (
                      <>
                        {digest.keyDecisions.length === 0 ? (
                          <div className="ui-digest-card flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent">
                            <Target
                              size={24}
                              className="text-[var(--color-text-muted)] mb-3 opacity-50"
                            />
                            <p className="ui-digest-empty-text text-sm">
                              No critical decisions this {periodNoun}.
                            </p>
                          </div>
                        ) : (
                          <ul className="ui-digest-decision-list">
                            {digest.keyDecisions.map((decision, i) => (
                              <li
                                key={`dec-${decision.meetingId}-${i}`}
                                className="ui-digest-decision-row"
                              >
                                <p className="ui-digest-decision-text">{decision.text}</p>
                                <div className="ui-digest-decision-meta">
                                  <span>{formatDate(decision.timestamp)}</span>
                                  <span
                                    onClick={e =>
                                      showSourcePopover(e, {
                                        meetingTitle: decision.meetingTitle || 'Meeting',
                                        meetingDate: decision.meetingDate,
                                        sourceContext: decision.sourceContext,
                                        meetingId: decision.meetingId,
                                      })
                                    }
                                    onKeyDown={e =>
                                      e.key === 'Enter' &&
                                      showSourcePopover(e as unknown as React.MouseEvent, {
                                        meetingTitle: decision.meetingTitle || 'Meeting',
                                        meetingDate: decision.meetingDate,
                                        sourceContext: decision.sourceContext,
                                        meetingId: decision.meetingId,
                                      })
                                    }
                                    className="ui-digest-source-link"
                                    role="button"
                                    tabIndex={0}
                                  >
                                    <ExternalLink size={12} className="opacity-70" />{' '}
                                    {decision.meetingTitle || 'Source'}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="ui-digest-col">
                  {/* Top Participants Section */}
                  <div
                    className="flex flex-col gap-3 ui-stagger-enter"
                    style={{ animationDelay: '160ms' }}
                  >
                    <button
                      className="ui-digest-section-header"
                      onClick={() => toggleSection('participants')}
                    >
                      <div className="ui-digest-squircle monochrome">
                        <Users size={16} strokeWidth={2.5} />
                      </div>
                      <h2 className="ui-digest-card-title m-0">Top Participants</h2>
                      <span className="ui-digest-count-badge monochrome">
                        {digest.entityAggregation.topPeople.length}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`ui-digest-chevron${expandedSections.has('participants') ? ' is-expanded' : ''}`}
                      />
                    </button>

                    {expandedSections.has('participants') && (
                      <div className="ui-digest-card px-2 py-2">
                        {digest.entityAggregation.topPeople.length > 0 ? (
                          <div className="flex flex-col w-full">
                            {(() => {
                              const maxPCount = Math.max(
                                ...digest.entityAggregation.topPeople.map(p => p.meetingCount),
                                1
                              )
                              return digest.entityAggregation.topPeople.map((p, i) => (
                                <TopParticipantItem
                                  key={p.name}
                                  name={p.name}
                                  count={p.meetingCount}
                                  meetingTitles={p.meetingTitles}
                                  maxCount={maxPCount}
                                  isLast={i === digest.entityAggregation.topPeople.length - 1}
                                />
                              ))
                            })()}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent">
                            <Users
                              size={24}
                              className="text-[var(--color-text-muted)] mb-3 opacity-50"
                            />
                            <p className="ui-digest-empty-text text-sm">
                              No participants this {periodNoun}.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Top Topics Section */}
                  <div
                    className="flex flex-col gap-3 mt-4 ui-stagger-enter"
                    style={{ animationDelay: '240ms' }}
                  >
                    <button
                      className="ui-digest-section-header"
                      onClick={() => toggleSection('topics')}
                    >
                      <div className="ui-digest-squircle monochrome">
                        <MessageSquare size={16} strokeWidth={2.5} />
                      </div>
                      <h2 className="ui-digest-card-title m-0">Top Topics</h2>
                      <span className="ui-digest-count-badge monochrome">
                        {digest.entityAggregation.topTopics.length}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`ui-digest-chevron${expandedSections.has('topics') ? ' is-expanded' : ''}`}
                      />
                    </button>

                    {expandedSections.has('topics') && (
                      <div className="ui-digest-card px-0 py-1">
                        {digest.entityAggregation.topTopics.length > 0 ? (
                          <div className="flex flex-col">
                            {(() => {
                              const maxCount = Math.max(
                                ...digest.entityAggregation.topTopics.map(t => t.mentionCount),
                                1
                              )
                              return digest.entityAggregation.topTopics.map(t => (
                                <TopTopicItem
                                  key={t.topic}
                                  topic={t.topic}
                                  count={t.mentionCount}
                                  meetingTitles={t.meetingTitles}
                                  maxCount={maxCount}
                                />
                              ))
                            })()}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent">
                            <MessageSquare
                              size={24}
                              className="text-[var(--color-text-muted)] mb-3 opacity-50"
                            />
                            <p className="ui-digest-empty-text text-sm">
                              No topics this {periodNoun}.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Conflicting Info Section */}
                  <div
                    className="flex flex-col gap-3 mt-4 ui-stagger-enter"
                    style={{ animationDelay: '320ms' }}
                  >
                    <button
                      className="ui-digest-section-header"
                      onClick={() => toggleSection('contradictions')}
                    >
                      <div className="ui-digest-squircle monochrome">
                        {digest.contradictions.length > 0 ? (
                          <AlertTriangle size={16} strokeWidth={2.5} />
                        ) : (
                          <CheckCircle size={16} strokeWidth={2.5} />
                        )}
                      </div>
                      <h2 className="ui-digest-card-title m-0">
                        {digest.contradictions.length > 0
                          ? 'Conflicts Detected'
                          : 'No Contradictions'}
                      </h2>
                      {digest.contradictions.length > 0 && (
                        <span className="ui-digest-count-badge monochrome">
                          {digest.contradictions.length}
                        </span>
                      )}
                      <ChevronDown
                        size={16}
                        className={`ui-digest-chevron${expandedSections.has('contradictions') ? ' is-expanded' : ''}`}
                      />
                    </button>

                    {expandedSections.has('contradictions') && (
                      <>
                        {digest.contradictions.length > 0 ? (
                          <div className="ui-digest-contradiction-container">
                            {digest.contradictions.map((c, i) => (
                              <div
                                key={`contra-${c.id || i}`}
                                className="ui-digest-contradiction-group"
                              >
                                <div className="ui-digest-contradiction-block">
                                  <span className="ui-digest-contradiction-label">
                                    Statement A
                                    {c.meeting1?.title && (
                                      <span
                                        className="ui-digest-source-link ml-2"
                                        onClick={e =>
                                          c.meeting1 &&
                                          showSourcePopover(e, {
                                            meetingTitle: c.meeting1.title || 'Meeting',
                                            meetingId: c.meeting1.id,
                                            sourceContext: c.statement1,
                                          })
                                        }
                                        onKeyDown={e =>
                                          e.key === 'Enter' &&
                                          c.meeting1 &&
                                          showSourcePopover(e as unknown as React.MouseEvent, {
                                            meetingTitle: c.meeting1.title || 'Meeting',
                                            meetingId: c.meeting1.id,
                                            sourceContext: c.statement1,
                                          })
                                        }
                                        role="button"
                                        tabIndex={0}
                                      >
                                        <ExternalLink size={10} className="opacity-70" />{' '}
                                        {c.meeting1.title}
                                      </span>
                                    )}
                                  </span>
                                  <div className="ui-digest-contradiction-stmt">{c.statement1}</div>
                                </div>

                                <div className="ui-digest-contradiction-divider">
                                  <span className="ui-digest-contradiction-vs-pill">vs</span>
                                </div>

                                <div className="ui-digest-contradiction-block">
                                  <span className="ui-digest-contradiction-label">
                                    Statement B
                                    {c.meeting2?.title && (
                                      <span
                                        className="ui-digest-source-link ml-2"
                                        onClick={e =>
                                          c.meeting2 &&
                                          showSourcePopover(e, {
                                            meetingTitle: c.meeting2.title || 'Meeting',
                                            meetingId: c.meeting2.id,
                                            sourceContext: c.statement2,
                                          })
                                        }
                                        onKeyDown={e =>
                                          e.key === 'Enter' &&
                                          c.meeting2 &&
                                          showSourcePopover(e as unknown as React.MouseEvent, {
                                            meetingTitle: c.meeting2.title || 'Meeting',
                                            meetingId: c.meeting2.id,
                                            sourceContext: c.statement2,
                                          })
                                        }
                                        role="button"
                                        tabIndex={0}
                                      >
                                        <ExternalLink size={10} className="opacity-70" />{' '}
                                        {c.meeting2.title}
                                      </span>
                                    )}
                                  </span>
                                  <div className="ui-digest-contradiction-stmt">{c.statement2}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="ui-digest-card flex items-center gap-3 p-4">
                            <CheckCircle
                              size={18}
                              style={{ color: 'rgb(34,197,94)', opacity: 0.7 }}
                            />
                            <p className="text-sm m-0 text-[var(--color-text-secondary)]">
                              All statements from this {periodNoun} are consistent — no conflicting
                              information detected.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          /* Empty state — no cached digest, user needs to generate */
          <div
            className="flex flex-col items-center justify-center p-20 gap-4 ui-stagger-enter sovereign-glass-panel rounded-[var(--radius-xl)] max-w-lg mx-auto mt-12 text-center relative overflow-hidden"
            style={{
              animationDelay: '80ms',
              padding: 'clamp(32px, 5vw, 64px) clamp(16px, 3vw, 32px)',
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-[var(--color-violet)] rounded-full mix-blend-screen opacity-[0.12] blur-[64px] pointer-events-none" />
            <div className="relative z-10 w-20 h-20 rounded-full bg-[rgba(167,139,250,0.08)] border border-[rgba(255,255,255,0.05)] flex items-center justify-center mb-2 shadow-[0_0_32px_rgba(167,139,250,0.15),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-md">
              <MessageSquare size={36} className="text-[var(--color-violet)] opacity-90" />
            </div>
            <div className="relative z-10">
              <h3 className="text-[var(--color-text-primary)] font-semibold mb-3 text-lg tracking-wide">
                No {periodLabel} Digest Yet
              </h3>
              <p className="text-sm m-0 leading-relaxed text-[var(--color-text-secondary)] mb-4">
                Click Generate to create your {periodAdj} digest. It will analyze your meetings and
                surface key decisions, action items, and trends.
              </p>
              <Button
                variant="primary"
                onClick={handleGenerate}
                disabled={isGenerating || isLoading}
              >
                {isGenerating ? 'Generating...' : `Generate ${periodLabel} Digest`}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Source Context Popover */}
      {sourcePopover && (
        <SourceContextPopover
          data={sourcePopover.data}
          anchorRect={sourcePopover.rect}
          onClose={() => setSourcePopover(null)}
          onOpenMeeting={openMeeting}
        />
      )}
    </div>
  )
}
