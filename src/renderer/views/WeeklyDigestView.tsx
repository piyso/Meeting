import { useAppStore } from '../store/appStore'
import { useNavigationStore } from '../store/navigationStore'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'

import type { WeeklyDigest } from '../../types/ipc'
import {
  Calendar,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Target,
  ChevronLeft,
  ExternalLink,
  ChevronDown,
  User,
  Check,
  ArrowRight,
  Search,
  X,
} from 'lucide-react'

import { Button } from '../components/ui/Button'
import { DigestSkeleton } from '../components/ui/Skeletons'
import { IconButton } from '../components/ui/IconButton'
import { ProTeaseOverlay } from '../components/ui/ProTeaseOverlay'

import { formatDate, formatRelativeTime, toEpochMs } from '../utils/time'

import {
  SourceContextPopover,
  type SourcePopoverData,
} from '../components/digest/SourceContextPopover'
import { StatItem } from '../components/digest/StatItem'
import { TopParticipantItem } from '../components/digest/TopParticipantItem'
import { TopTopicItem } from '../components/digest/TopTopicItem'
import { PodcastPlayer } from '../components/digest/PodcastPlayer'

type ActionItem = WeeklyDigest['actionItems']['items'][number]
type KeyDecision = WeeklyDigest['keyDecisions'][number]

export default function WeeklyDigestView() {
  const navigate = useNavigationStore(s => s.navigate)
  const currentTier = useAppStore(s => s.currentTier)
  const isAiLocked = currentTier === 'free'
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['actions', 'decisions', 'participants', 'topics', 'contradictions'])
  )
  const [actionFilter, setActionFilter] = useState<'all' | 'open' | 'overdue' | 'completed'>('all')
  const [actionSearch, setActionSearch] = useState('')
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({})
  const [decisionSearch, setDecisionSearch] = useState('')
  const [sourcePopover, setSourcePopover] = useState<{
    data: SourcePopoverData
    rect: DOMRect
  } | null>(null)

  const { data: aiStatusData } = useQuery({
    queryKey: ['aiStatus'],
    queryFn: async () => {
      const res = await window.electronAPI?.intelligence?.getEngineStatus()
      if (res?.success && res.data) {
        const modelsLoaded = res.data.models.some(m => m.isLoaded)
        return {
          ready: modelsLoaded,
          text: modelsLoaded ? '' : 'AI engine is loading — generation may take longer',
        }
      }
      return { ready: false, text: 'AI engine unavailable' }
    },
    enabled: !isAiLocked,
    refetchInterval: query => (query.state.data?.ready ? false : 2000),
  })

  const aiReady = aiStatusData?.ready ?? null
  const aiStatusText = aiStatusData?.text ?? ''

  const {
    data: digest = null,
    isLoading,
    error: queryError,
    refetch,
  } = useQuery<WeeklyDigest, Error>({
    queryKey: ['weeklyDigest', activePeriod],
    queryFn: async () => {
      const res = await window.electronAPI?.digest?.getLatest({ periodType: activePeriod })
      if (!res?.success) throw new Error(res?.error?.message || 'Failed to fetch digest')
      return res.data as WeeklyDigest
    },
    enabled: !isAiLocked,
  })

  const {
    mutateAsync: generateDigest,
    isPending: isGenerating,
    error: mutationError,
  } = useMutation({
    mutationFn: async () => {
      const { start, end } = getDateRange(activePeriod)
      const res = await window.electronAPI?.digest?.generate({
        startDate: start.getTime(),
        endDate: end.getTime(),
        periodType: activePeriod,
      })
      if (!res?.success) {
        const errorMsg = res?.error?.message || 'Failed to generate digest.'
        const errorCode = res?.error?.code || ''
        if (errorCode === 'LLM_NOT_LOADED' || errorMsg.toLowerCase().includes('ai engine')) {
          throw new Error('AI engine is still loading. Please wait a moment and try again.')
        }
        throw new Error(errorMsg)
      }
      return res.data as WeeklyDigest
    },
    onSuccess: () => {
      refetch()
    },
  })

  const error = (queryError as Error)?.message || (mutationError as Error)?.message || null

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
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      start.setHours(0, 0, 0, 0)
    } else {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
    }
    return { start, end }
  }

  /** Format a date range for display */
  function formatDateRange(startMs: number, endMs: number): string {
    const validStart = toEpochMs(startMs) ?? Date.now() - 7 * 86400000
    const validEnd = toEpochMs(endMs) ?? Date.now()
    const s = new Date(validStart)
    const e = new Date(validEnd)
    const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'short' })
    const sMonth = monthFmt.format(s)
    const eMonth = monthFmt.format(e)
    if (
      s.getMonth() === e.getMonth() &&
      s.getFullYear() === e.getFullYear() &&
      s.getDate() === e.getDate()
    ) {
      return `${sMonth} ${s.getDate()}, ${e.getFullYear()}`
    }
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
      return `${sMonth} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`
    }
    return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${e.getFullYear()}`
  }

  const periodLabel =
    activePeriod === 'daily' ? "Today's" : activePeriod === 'weekly' ? 'Weekly' : 'Monthly'
  const periodNoun = activePeriod === 'daily' ? 'day' : activePeriod === 'weekly' ? 'week' : 'month'
  const periodAdj =
    activePeriod === 'daily' ? 'daily' : activePeriod === 'weekly' ? 'weekly' : 'monthly'

  async function handleGenerate() {
    try {
      await generateDigest()
    } catch {
      // Error handled by mutation state
    }
  }

  const openMeeting = (id: string) => {
    if (!id) return
    navigate('meeting-detail', id)
  }

  // ── Full-page lock for free users ──
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
        <div style={{ flex: 1, position: 'relative' }}>
          <ProTeaseOverlay
            title="Unlock Weekly Digest"
            description="Upgrade to Starter to get weekly summaries, action items, and analytics."
            targetTier="starter"
          />
        </div>
      </div>
    )
  }

  const toggleActionCompleted = (itemKey: string, currentEffective: boolean) => {
    setCompletedOverrides(prev => ({
      ...prev,
      [itemKey]: !currentEffective,
    }))
  }

  const allActionItems: ActionItem[] = digest?.actionItems?.items || []

  const completedCount = allActionItems.filter((item: ActionItem) => {
    const itemKey = `${item.meetingId}-${item.text}`
    return completedOverrides[itemKey] !== undefined
      ? completedOverrides[itemKey]
      : item.status === 'completed'
  }).length

  const openCount = allActionItems.filter((item: ActionItem) => {
    const itemKey = `${item.meetingId}-${item.text}`
    const isCompleted =
      completedOverrides[itemKey] !== undefined
        ? completedOverrides[itemKey]
        : item.status === 'completed'
    const effectiveStatus = isCompleted
      ? 'completed'
      : item.status === 'completed'
        ? 'open'
        : item.status
    return effectiveStatus === 'open'
  }).length

  const overdueCount = allActionItems.filter((item: ActionItem) => {
    const itemKey = `${item.meetingId}-${item.text}`
    const isCompleted =
      completedOverrides[itemKey] !== undefined
        ? completedOverrides[itemKey]
        : item.status === 'completed'
    const effectiveStatus = isCompleted
      ? 'completed'
      : item.status === 'completed'
        ? 'open'
        : item.status
    return effectiveStatus === 'overdue'
  }).length

  const filteredActionItems: ActionItem[] = allActionItems.filter((item: ActionItem) => {
    const itemKey = `${item.meetingId}-${item.text}`
    const isCompleted =
      completedOverrides[itemKey] !== undefined
        ? completedOverrides[itemKey]
        : item.status === 'completed'
    const effectiveStatus = isCompleted
      ? 'completed'
      : item.status === 'completed'
        ? 'open'
        : item.status

    if (actionFilter !== 'all' && effectiveStatus !== actionFilter) return false
    if (actionSearch.trim()) {
      const q = actionSearch.toLowerCase()
      return (
        item.text.toLowerCase().includes(q) ||
        (item.assignee && item.assignee.toLowerCase().includes(q)) ||
        (item.meetingTitle && item.meetingTitle.toLowerCase().includes(q))
      )
    }
    return true
  })

  const filteredDecisions: KeyDecision[] = (digest?.keyDecisions || []).filter(
    (decision: KeyDecision) => {
      if (!decisionSearch.trim()) return true
      const q = decisionSearch.toLowerCase()
      return (
        decision.text.toLowerCase().includes(q) ||
        (decision.meetingTitle && decision.meetingTitle.toLowerCase().includes(q))
      )
    }
  )

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
              ? `${formatDateRange(digest.startDate, digest.endDate)}${formatRelativeTime(digest.generatedAt) ? ` · Generated ${formatRelativeTime(digest.generatedAt)}` : ''}`
              : 'Your personalized summary'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Unified Period Selector */}
          <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl">
            {(['daily', 'weekly', 'monthly'] as const).map(period => (
              <button
                key={period}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  activePeriod === period
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                onClick={() => setActivePeriod(period)}
              >
                {period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </div>

          {aiStatusText && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-300 text-[11px] font-semibold tracking-wide backdrop-blur-md transition-opacity duration-300 ${aiReady === false ? 'opacity-100' : 'opacity-0'}`}
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

      <div className="ui-digest-content sovereign-scrollbar">
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
                padding: 'clamp(32px, 5vw, 64px) 24px',
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
                  {periodLabel.toLowerCase()} summary requires at least one meeting to process.
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[1120px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-32 space-y-6">
              {/* Sovereign Executive Metrics Band */}
              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-4 ui-stagger-enter"
                style={{ animationDelay: '80ms' }}
              >
                <StatItem
                  title="Meetings"
                  value={digest.summary.totalMeetings}
                  icon={Calendar}
                  subtitle="Recorded sessions"
                  accent="violet"
                />
                <StatItem
                  title="Hours"
                  value={`${(digest.summary.totalHours || 0).toFixed(1)}h`}
                  icon={Clock}
                  subtitle="Total speaking time"
                  accent="emerald"
                />
                <StatItem
                  title="Participants"
                  value={digest.summary.uniqueParticipants}
                  icon={Users}
                  subtitle="Collaborator network"
                  accent="blue"
                />
              </div>

              {/* Executive Briefing Console — Fused AI Summary & Audio Intelligence */}
              <div className="ui-stagger-enter" style={{ animationDelay: '120ms' }}>
                <PodcastPlayer
                  summaryText={digest.summary.aiSummary}
                  script={[
                    digest.summary.aiSummary || '',
                    `Welcome to your BlueArkive briefing for ${formatDateRange(digest.startDate, digest.endDate)}.`,
                    `During this period, you logged ${digest.summary.totalMeetings} meetings totaling ${(digest.summary.totalHours || 0).toFixed(1)} hours of discussion.`,
                    digest.entityAggregation?.topTopics?.length
                      ? `Your primary focus areas included: ${digest.entityAggregation.topTopics
                          .slice(0, 4)
                          .map((t: { topic: string }) => t.topic)
                          .join(', ')}.`
                      : '',
                    `You completed ${completedCount} action items with ${openCount} items remaining in progress.`,
                    digest.keyDecisions?.length
                      ? `Key decisions reached: ${digest.keyDecisions
                          .slice(0, 3)
                          .map((d: { text: string }) => d.text)
                          .join('. ')}.`
                      : '',
                    `That concludes your summary.`,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  weekRange={formatDateRange(digest.startDate, digest.endDate)}
                  meetingCount={digest.summary.totalMeetings}
                  totalHours={Number((digest.summary.totalHours || 0).toFixed(1))}
                />
              </div>

              {/* Two-Column Command Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Left Column: Action Items & Key Decisions */}
                <div className="space-y-6">
                  {/* Action Items Unified Card */}
                  <div
                    className="relative rounded-2xl bg-gradient-to-b from-white/[0.035] via-white/[0.015] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] overflow-hidden transition-all hover:border-white/[0.06] ui-stagger-enter"
                    style={{ animationDelay: '160ms' }}
                  >
                    {/* Integrated Header Bar */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-white/[0.01] border-b border-white/[0.025]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                          <CheckCircle2 size={15} strokeWidth={2.2} />
                        </div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold text-white tracking-tight m-0">
                            Action Items
                          </h2>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 font-medium">
                            {allActionItems.length}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Micro Segmented Status Filters */}
                        <div className="flex items-center bg-white/[0.03] p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setActionFilter('all')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                              actionFilter === 'all'
                                ? 'bg-white/[0.1] text-white shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            All
                          </button>
                          <button
                            type="button"
                            onClick={() => setActionFilter('completed')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                              actionFilter === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300 shadow-sm'
                                : 'text-zinc-400 hover:text-emerald-400'
                            }`}
                          >
                            {completedCount} Done
                          </button>
                          <button
                            type="button"
                            onClick={() => setActionFilter('open')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                              actionFilter === 'open'
                                ? 'bg-violet-500/20 text-violet-300 shadow-sm'
                                : 'text-zinc-400 hover:text-violet-400'
                            }`}
                          >
                            {openCount} Open
                          </button>
                          <button
                            type="button"
                            onClick={() => setActionFilter('overdue')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                              actionFilter === 'overdue'
                                ? 'bg-rose-500/20 text-rose-300 shadow-sm'
                                : 'text-zinc-400 hover:text-rose-400'
                            }`}
                          >
                            {overdueCount} Overdue
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleSection('actions')}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                          title={expandedSections.has('actions') ? 'Collapse' : 'Expand'}
                        >
                          <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${expandedSections.has('actions') ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Content Area */}
                    {expandedSections.has('actions') && (
                      <div>
                        {filteredActionItems.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-8 text-center">
                            <CheckCircle2 size={24} className="text-zinc-600 mb-2" />
                            <p className="text-xs text-zinc-400 m-0">
                              {actionFilter === 'all'
                                ? `No action items recorded for this ${periodNoun}.`
                                : `No ${actionFilter} action items found.`}
                            </p>
                          </div>
                        ) : (
                          <>
                            {/* Quick Filter Input if more than 5 action items */}
                            {allActionItems.length > 5 && (
                              <div className="px-4 py-2 bg-white/[0.01] border-b border-white/[0.025]">
                                <div className="relative">
                                  <Search
                                    size={11}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Filter by task or assignee..."
                                    value={actionSearch}
                                    onChange={e => setActionSearch(e.target.value)}
                                    className="w-full pl-7 pr-7 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.07] text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors"
                                  />
                                  {actionSearch && (
                                    <button
                                      type="button"
                                      onClick={() => setActionSearch('')}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                    >
                                      <X size={10} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Bounded Scroll List */}
                            <ul className="max-h-[460px] overflow-y-auto sovereign-scrollbar divide-y divide-white/[0.025] m-0 p-0 list-none">
                              {filteredActionItems.map((item: ActionItem, i: number) => {
                                const itemKey = `${item.meetingId}-${item.text}`
                                const isItemCompleted =
                                  completedOverrides[itemKey] !== undefined
                                    ? completedOverrides[itemKey]
                                    : item.status === 'completed'
                                const effectiveStatus = isItemCompleted
                                  ? 'completed'
                                  : item.status === 'completed'
                                    ? 'open'
                                    : item.status

                                return (
                                  <li
                                    key={`action-${item.meetingId}-${i}`}
                                    className="p-3.5 flex items-start gap-3.5 hover:bg-white/[0.02] transition-colors"
                                  >
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleActionCompleted(
                                          itemKey,
                                          effectiveStatus === 'completed'
                                        )
                                      }
                                      className="shrink-0 mt-0.5 group/check cursor-pointer"
                                      title={
                                        effectiveStatus === 'completed' ? 'Mark open' : 'Mark done'
                                      }
                                    >
                                      {effectiveStatus === 'completed' ? (
                                        <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover/check:bg-emerald-500/30 transition-all">
                                          <Check size={11} strokeWidth={2.5} />
                                        </div>
                                      ) : effectiveStatus === 'overdue' ? (
                                        <div className="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 group-hover/check:bg-rose-500/30 transition-all">
                                          <AlertTriangle size={11} strokeWidth={2.5} />
                                        </div>
                                      ) : (
                                        <div className="w-5 h-5 rounded-full border border-white/10 bg-white/[0.02] group-hover/check:border-violet-400/50 transition-colors" />
                                      )}
                                    </button>

                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`text-[13px] font-medium leading-relaxed m-0 ${
                                          effectiveStatus === 'completed'
                                            ? 'line-through text-zinc-500'
                                            : 'text-zinc-200'
                                        }`}
                                      >
                                        {item.text}
                                      </p>

                                      <div className="flex items-center justify-between gap-3 mt-2">
                                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                                          {item.assignee && (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.03] text-[11px] text-zinc-300">
                                              <User size={10} className="text-zinc-500 shrink-0" />
                                              <span className="truncate max-w-[130px]">
                                                {item.assignee}
                                              </span>
                                            </span>
                                          )}
                                          {toEpochMs(item.dueDate) !== null && (
                                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/[0.03] text-[11px] text-zinc-400">
                                              <Calendar
                                                size={10}
                                                className="text-zinc-500 shrink-0"
                                              />
                                              <span>{formatDate(item.dueDate)}</span>
                                            </span>
                                          )}
                                          {effectiveStatus === 'overdue' && (
                                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-medium">
                                              Overdue
                                            </span>
                                          )}
                                          {effectiveStatus === 'completed' && (
                                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium">
                                              Done
                                            </span>
                                          )}
                                        </div>

                                        <button
                                          type="button"
                                          onClick={e =>
                                            showSourcePopover(e, {
                                              meetingTitle: item.meetingTitle || 'Meeting',
                                              meetingDate: item.meetingDate,
                                              sourceContext: item.sourceContext,
                                              meetingId: item.meetingId,
                                            })
                                          }
                                          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-violet-300 hover:underline transition-colors shrink-0 max-w-[170px] truncate"
                                          title={`View source: ${item.meetingTitle || 'Meeting'}`}
                                        >
                                          <ExternalLink size={10} className="opacity-70 shrink-0" />
                                          <span className="truncate">
                                            {item.meetingTitle || 'Source'}
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Key Decisions Unified Card */}
                  <div
                    className="relative rounded-2xl bg-gradient-to-b from-white/[0.035] via-white/[0.015] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] overflow-hidden transition-all hover:border-white/[0.06] ui-stagger-enter"
                    style={{ animationDelay: '200ms' }}
                  >
                    {/* Integrated Header Bar */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-white/[0.01] border-b border-white/[0.025]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-400">
                          <Target size={15} strokeWidth={2.2} />
                        </div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold text-white tracking-tight m-0">
                            Key Decisions
                          </h2>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 font-medium">
                            {digest.keyDecisions.length}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.setItem('kg_initial_tab', 'causal')
                            navigate('knowledge-graph')
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-violet-300 hover:text-white bg-violet-500/15 hover:bg-violet-500/25 transition-all"
                          title="Explore causal lineage in Decision Trail"
                        >
                          <span>Decision Trail</span>
                          <ArrowRight size={10} />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleSection('decisions')}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                          title={expandedSections.has('decisions') ? 'Collapse' : 'Expand'}
                        >
                          <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${expandedSections.has('decisions') ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Content Area */}
                    {expandedSections.has('decisions') && (
                      <div>
                        {digest.keyDecisions.length === 0 ? (
                          <div className="flex flex-col items-center justify-center p-8 text-center">
                            <Target size={24} className="text-zinc-600 mb-2" />
                            <p className="text-xs text-zinc-400 m-0">
                              No critical decisions recorded this {periodNoun}.
                            </p>
                          </div>
                        ) : (
                          <>
                            {/* Quick Filter Input if more than 4 decisions */}
                            {digest.keyDecisions.length > 4 && (
                              <div className="px-4 py-2 bg-white/[0.01] border-b border-white/[0.025]">
                                <div className="relative">
                                  <Search
                                    size={11}
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Filter decisions by topic or term..."
                                    value={decisionSearch}
                                    onChange={e => setDecisionSearch(e.target.value)}
                                    className="w-full pl-7 pr-7 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.07] text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors"
                                  />
                                  {decisionSearch && (
                                    <button
                                      type="button"
                                      onClick={() => setDecisionSearch('')}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                    >
                                      <X size={10} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {filteredDecisions.length === 0 ? (
                              <div className="flex flex-col items-center justify-center p-8 text-center">
                                <Target size={24} className="text-zinc-600 mb-2" />
                                <p className="text-xs text-zinc-400 m-0">
                                  No decisions match &ldquo;{decisionSearch}&rdquo;
                                </p>
                              </div>
                            ) : (
                              /* Bounded Scroll Container */
                              <div className="max-h-[460px] overflow-y-auto sovereign-scrollbar divide-y divide-white/[0.025]">
                                {filteredDecisions.map(
                                  (decision: WeeklyDigest['keyDecisions'][number], i: number) => (
                                    <div
                                      key={`dec-${decision.meetingId}-${i}`}
                                      className="p-4 hover:bg-white/[0.02] transition-colors"
                                    >
                                      <div className="flex items-start justify-between gap-3 mb-2">
                                        <p className="text-[13px] font-medium text-white leading-relaxed flex-1 m-0">
                                          {decision.text}
                                        </p>
                                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 font-medium tracking-wider shrink-0">
                                          Canon
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs text-zinc-400 pt-1">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
                                          <Calendar size={11} />
                                          <span>
                                            {formatDate(
                                              decision.meetingDate ?? decision.timestamp,
                                              undefined,
                                              ''
                                            )}
                                          </span>
                                        </span>
                                        <button
                                          type="button"
                                          onClick={e =>
                                            showSourcePopover(e, {
                                              meetingTitle: decision.meetingTitle || 'Meeting',
                                              meetingDate: decision.meetingDate,
                                              sourceContext: decision.sourceContext,
                                              meetingId: decision.meetingId,
                                            })
                                          }
                                          className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-violet-300 hover:underline transition-colors shrink-0 max-w-[180px] truncate"
                                        >
                                          <ExternalLink size={11} className="opacity-70 shrink-0" />
                                          <span className="truncate">
                                            {decision.meetingTitle || 'Source'}
                                          </span>
                                        </button>
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Participants, Topics & Consistency */}
                <div className="space-y-6">
                  {/* Top Participants Unified Card */}
                  <div
                    className="relative rounded-2xl bg-gradient-to-b from-white/[0.035] via-white/[0.015] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] overflow-hidden transition-all hover:border-white/[0.06] ui-stagger-enter"
                    style={{ animationDelay: '160ms' }}
                  >
                    {/* Integrated Header Bar */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-white/[0.01] border-b border-white/[0.025]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                          <Users size={15} strokeWidth={2.2} />
                        </div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold text-white tracking-tight m-0">
                            Top Participants
                          </h2>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 font-medium">
                            {digest.entityAggregation.topPeople.length}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleSection('participants')}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        title={expandedSections.has('participants') ? 'Collapse' : 'Expand'}
                      >
                        <ChevronDown
                          size={14}
                          className={`transition-transform duration-200 ${expandedSections.has('participants') ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>

                    {/* Content Area */}
                    {expandedSections.has('participants') && (
                      <div>
                        {digest.entityAggregation.topPeople.length > 0 ? (
                          /* Bounded Scroll Container */
                          <div className="max-h-[380px] overflow-y-auto sovereign-scrollbar flex flex-col w-full">
                            {(() => {
                              const maxPCount = Math.max(
                                ...digest.entityAggregation.topPeople.map(
                                  (p: WeeklyDigest['entityAggregation']['topPeople'][number]) =>
                                    p.meetingCount
                                ),
                                1
                              )
                              return digest.entityAggregation.topPeople.map(
                                (
                                  p: WeeklyDigest['entityAggregation']['topPeople'][number],
                                  i: number
                                ) => (
                                  <TopParticipantItem
                                    key={p.name}
                                    name={p.name}
                                    count={p.meetingCount}
                                    meetingTitles={p.meetingTitles}
                                    maxCount={maxPCount}
                                    isLast={i === digest.entityAggregation.topPeople.length - 1}
                                  />
                                )
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-8 text-center">
                            <Users size={24} className="text-zinc-600 mb-2" />
                            <p className="text-xs text-zinc-400 m-0">
                              No participants recorded this {periodNoun}.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Top Topics Unified Card */}
                  <div
                    className="relative rounded-2xl bg-gradient-to-b from-white/[0.035] via-white/[0.015] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] overflow-hidden transition-all hover:border-white/[0.06] ui-stagger-enter"
                    style={{ animationDelay: '200ms' }}
                  >
                    {/* Integrated Header Bar */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-white/[0.01] border-b border-white/[0.025]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                          <MessageSquare size={15} strokeWidth={2.2} />
                        </div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold text-white tracking-tight m-0">
                            Top Topics
                          </h2>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-zinc-400 font-medium">
                            {digest.entityAggregation.topTopics.length}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleSection('topics')}
                        className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        title={expandedSections.has('topics') ? 'Collapse' : 'Expand'}
                      >
                        <ChevronDown
                          size={14}
                          className={`transition-transform duration-200 ${expandedSections.has('topics') ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>

                    {/* Content Area */}
                    {expandedSections.has('topics') && (
                      <div>
                        {digest.entityAggregation.topTopics.length > 0 ? (
                          /* Bounded Scroll Container */
                          <div className="max-h-[380px] overflow-y-auto sovereign-scrollbar flex flex-col">
                            {(() => {
                              const maxCount = Math.max(
                                ...digest.entityAggregation.topTopics.map(
                                  (t: WeeklyDigest['entityAggregation']['topTopics'][number]) =>
                                    t.mentionCount
                                ),
                                1
                              )
                              return digest.entityAggregation.topTopics.map(
                                (t: WeeklyDigest['entityAggregation']['topTopics'][number]) => (
                                  <TopTopicItem
                                    key={t.topic}
                                    topic={t.topic}
                                    count={t.mentionCount}
                                    meetingTitles={t.meetingTitles}
                                    maxCount={maxCount}
                                  />
                                )
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center p-8 text-center">
                            <MessageSquare size={24} className="text-zinc-600 mb-2" />
                            <p className="text-xs text-zinc-400 m-0">
                              No topics recorded this {periodNoun}.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Conflicting Info / Truth Engine Unified Card */}
                  <div
                    className="relative rounded-2xl bg-gradient-to-b from-white/[0.035] via-white/[0.015] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] overflow-hidden transition-all hover:border-white/[0.06] ui-stagger-enter"
                    style={{ animationDelay: '240ms' }}
                  >
                    {/* Integrated Header Bar */}
                    <div className="flex items-center justify-between px-5 py-3.5 bg-white/[0.01] border-b border-white/[0.025]">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                            digest.contradictions.length > 0
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}
                        >
                          {digest.contradictions.length > 0 ? (
                            <AlertTriangle size={15} strokeWidth={2.2} />
                          ) : (
                            <CheckCircle2 size={15} strokeWidth={2.2} />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold text-white tracking-tight m-0">
                            {digest.contradictions.length > 0
                              ? 'Conflicts Detected'
                              : 'Truth Engine Consistency'}
                          </h2>
                          {digest.contradictions.length > 0 && (
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-semibold leading-none">
                              {digest.contradictions.length}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {digest.contradictions.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              sessionStorage.setItem('kg_initial_tab', 'conflicts')
                              navigate('knowledge-graph')
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 transition-all"
                          >
                            <span>Resolve Conflicts</span>
                            <ArrowRight size={10} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleSection('contradictions')}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                          title={expandedSections.has('contradictions') ? 'Collapse' : 'Expand'}
                        >
                          <ChevronDown
                            size={14}
                            className={`transition-transform duration-200 ${expandedSections.has('contradictions') ? 'rotate-180' : ''}`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Content Area */}
                    {expandedSections.has('contradictions') && (
                      <div className="p-4">
                        {digest.contradictions.length > 0 ? (
                          <div className="p-3.5 rounded-xl bg-amber-500/[0.04] space-y-2.5">
                            <div className="flex items-start gap-2.5">
                              <AlertTriangle size={15} className="text-amber-400 mt-0.5 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-xs text-amber-200 font-medium m-0">
                                  {digest.contradictions.length} cross-meeting statement
                                  disagreement
                                  {digest.contradictions.length === 1 ? '' : 's'} detected
                                </p>
                                <p className="text-xs text-zinc-400 leading-relaxed m-0">
                                  Contradictory assertions were detected across your recorded
                                  meetings. Review and establish canonical truth in the Truth
                                  Engine.
                                </p>
                              </div>
                            </div>
                            <div className="pt-0.5 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  sessionStorage.setItem('kg_initial_tab', 'conflicts')
                                  navigate('knowledge-graph')
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors"
                              >
                                <span>Open in Truth Engine</span>
                                <ArrowRight size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 p-1">
                            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                            <p className="text-xs text-zinc-300 leading-relaxed m-0">
                              All statements from this {periodNoun} are harmonized. The Truth Engine
                              has verified cross-meeting canon with 0 unresolved contradictions.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        ) : (
          /* Empty state — generate */
          <div
            className="flex flex-col items-center justify-center p-20 gap-4 ui-stagger-enter sovereign-glass-panel rounded-[var(--radius-xl)] max-w-lg mx-auto mt-12 text-center relative overflow-hidden"
            style={{
              animationDelay: '80ms',
              padding: 'clamp(32px, 5vw, 64px) 24px',
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
