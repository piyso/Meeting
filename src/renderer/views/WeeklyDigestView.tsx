import { useEffect, useState } from 'react'
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
  RefreshCw,
  ChevronLeft,
} from 'lucide-react'

import { Button } from '../components/ui/Button'
import { IconButton } from '../components/ui/IconButton'
import { ProTeaseOverlay } from '../components/ui/ProTeaseOverlay'

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const StatCard = ({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string | number
  icon: React.ElementType
}) => (
  <div className="ui-digest-stat-card">
    <div className="ui-digest-stat-card-title">
      <Icon size={16} /> {title}
    </div>
    <div className="ui-digest-stat-card-val">{value}</div>
  </div>
)

const TopParticipantItem = ({
  name,
  count,
  isLast,
}: {
  name: string
  count: number
  isLast: boolean
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--color-border-subtle)',
    }}
  >
    <span className="text-[var(--color-text-primary)]">{name}</span>
    <span
      style={{
        color: 'var(--color-text-secondary)',
        background: 'var(--color-bg-root)',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
      }}
    >
      {count} mtgs
    </span>
  </div>
)

const TopTopicItem = ({ topic, count }: { topic: string; count: number }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(255,255,255,0.05)',
      padding: '4px 10px',
      borderRadius: 16,
      fontSize: 13,
      color: 'var(--color-text-primary)',
    }}
  >
    {topic} <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>{count}</span>
  </span>
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

  // Check AI engine readiness on mount
  useEffect(() => {
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
  }, [])

  useEffect(() => {
    fetchDigest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchDigest() {
    setIsLoading(true)
    try {
      const res = await window.electronAPI.digest.getLatest()
      if (res.success && res.data) {
        setDigest(res.data)
      } else {
        await handleGenerate()
      }
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
      const startOfThisWeek = new Date()
      startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfThisWeek.getDay())
      startOfThisWeek.setHours(0, 0, 0, 0)

      const res = await window.electronAPI.digest.generate({
        startDate: startOfThisWeek.getTime(),
        endDate: Date.now(),
      })

      if (res.success && res.data) {
        setDigest(res.data)
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
    navigate('meeting-detail', id)
  }

  return (
    <div className="ui-view-digest">
      <header className="ui-header">
        <IconButton
          icon={<ChevronLeft size={18} />}
          onClick={() => navigate('meeting-list')}
          className="mr-2"
          tooltip="Back to Timeline"
        />
        <div className="ui-header-title">
          <h1>Weekly Digest</h1>
          <span className="ui-header-subtitle">
            {digest ? `For week of ${formatDate(digest.startDate)}` : 'Your personalized summary'}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {aiStatusText && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-[rgba(245,158,11,0.2)] bg-[rgba(245,158,11,0.05)] text-[var(--color-amber)] text-xs font-medium tracking-wide shadow-sm transition-all duration-300 ${aiReady === false ? 'opacity-100' : 'opacity-0'}`}
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
                : 'Regenerate weekly digest'
            }
          >
            {isGenerating ? 'Generating...' : aiReady === null ? 'Checking AI...' : 'Regenerate'}
          </Button>
        </div>
      </header>

      <div className="ui-digest-content">
        {isLoading && !isGenerating ? (
          <div className="flex flex-col items-center justify-center p-24 text-[var(--color-text-tertiary)] gap-4 animate-fade-in mt-12">
            <RefreshCw size={28} className="animate-spin opacity-80 text-[var(--color-violet)]" />
            <p className="tracking-wide font-medium">Synthesizing weekly insights...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center p-12 text-[var(--color-rose)] gap-4 animate-slide-up bg-[rgba(244,63,94,0.05)] rounded-2xl border border-[rgba(244,63,94,0.1)] max-w-sm mx-auto mt-12 text-center">
            <AlertTriangle size={32} />
            <p>{error}</p>
          </div>
        ) : digest ? (
          digest.summary.totalMeetings === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-[var(--color-text-secondary)] gap-4 animate-slide-up bg-[rgba(255,255,255,0.02)] rounded-2xl border border-[rgba(255,255,255,0.05)] max-w-md mx-auto mt-12 text-center">
              <Calendar size={36} className="opacity-40 mb-2" />
              <div>
                <h3 className="text-[#e2e8f0] font-medium mb-2 text-lg">No Meetings This Week</h3>
                <p className="text-sm m-0 leading-relaxed opacity-80">
                  You haven't archived any sessions during this week. Your weekly summary and
                  intelligence synthesis requires at least one meeting to process.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="ui-digest-stat-grid">
                <StatCard title="Meetings" value={digest.summary.totalMeetings} icon={Calendar} />
                <StatCard
                  title="Hours"
                  value={`${digest.summary.totalHours.toFixed(1)}h`}
                  icon={Clock}
                />
                <StatCard
                  title="Participants"
                  value={digest.summary.uniqueParticipants}
                  icon={Users}
                />
              </div>

              <div className="ui-digest-main-grid relative">
                {isAiLocked && (
                  <ProTeaseOverlay
                    title="Unlock AI Insights"
                    description="Weekly narrative, extracted decisions, and contradiction detection require Pro."
                    targetTier="pro"
                  />
                )}
                <div
                  className={`ui-digest-col ${isAiLocked ? 'pointer-events-none blur-md select-none opacity-50' : ''}`}
                >
                  <div className="ui-digest-card">
                    <h2 className="ui-digest-card-title">
                      <CheckCircle size={20} color="var(--color-emerald)" /> Action Items
                    </h2>
                    <div className="flex gap-4 mb-4">
                      <span className="text-[var(--color-emerald)] bg-[rgba(16,185,129,0.1)] px-2 py-0.5 rounded-full text-sm font-medium">
                        {digest.actionItems.completed} Done
                      </span>
                      <span className="text-[var(--color-amber)] bg-[rgba(245,158,11,0.1)] px-2 py-0.5 rounded-full text-sm font-medium">
                        {digest.actionItems.open} Open
                      </span>
                      <span className="text-[var(--color-rose)] bg-[rgba(244,63,94,0.1)] px-2 py-0.5 rounded-full text-sm font-medium">
                        {digest.actionItems.overdue} Overdue
                      </span>
                    </div>
                    {digest.actionItems.items.length === 0 ? (
                      <p className="text-[var(--color-text-secondary)] m-0">
                        No action items found.
                      </p>
                    ) : (
                      <ul className="list-none p-0 m-0 flex flex-col gap-3">
                        {digest.actionItems.items.map((item, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-3 p-3 bg-[var(--color-bg-base)] rounded-lg border border-[var(--color-border-subtle)]"
                          >
                            <div
                              className="w-4 h-4 rounded-full mt-0.5 shrink-0 border-2"
                              style={{
                                borderColor:
                                  item.status === 'completed'
                                    ? 'var(--color-emerald)'
                                    : item.status === 'overdue'
                                      ? 'var(--color-rose)'
                                      : 'var(--color-text-tertiary)',
                                background:
                                  item.status === 'completed'
                                    ? 'var(--color-emerald)'
                                    : 'transparent',
                              }}
                            />
                            <div className="grow">
                              <div
                                className={
                                  item.status === 'completed'
                                    ? 'line-through text-[var(--color-text-tertiary)]'
                                    : 'text-[var(--color-text-primary)]'
                                }
                              >
                                {item.text}
                              </div>
                              <div className="text-xs text-[var(--color-text-secondary)] mt-1 flex gap-3">
                                {item.assignee && <span>👤 {item.assignee}</span>}
                                {item.dueDate && <span>🗓 {formatDate(item.dueDate)}</span>}
                                <span
                                  onClick={() => openMeeting(item.meetingId)}
                                  className="text-[var(--color-violet)] hover:text-[#a78bfa] cursor-pointer transition-colors font-medium"
                                  role="button"
                                  tabIndex={0}
                                >
                                  View Origin
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="ui-digest-card">
                    <h2 className="ui-digest-card-title">
                      <Target size={20} color="var(--color-violet)" /> Key Decisions
                    </h2>
                    {digest.keyDecisions.length === 0 ? (
                      <p className="text-[var(--color-text-secondary)] m-0">
                        No important decisions logged.
                      </p>
                    ) : (
                      <ul className="list-none p-0 m-0 flex flex-col gap-3">
                        {digest.keyDecisions.map((decision, i) => (
                          <li
                            key={i}
                            className="p-3 bg-[var(--color-bg-base)] rounded-lg border-l-[3px] border-l-[var(--color-violet)] border-y border-y-[var(--color-border-subtle)] border-r border-r-[var(--color-border-subtle)]"
                          >
                            <p className="m-0 mb-2 text-[var(--color-text-primary)]">
                              {decision.text}
                            </p>
                            <div className="text-xs text-[var(--color-text-secondary)] flex justify-between">
                              <span>{formatDate(decision.timestamp)}</span>
                              <span
                                onClick={() => openMeeting(decision.meetingId)}
                                className="text-[var(--color-violet)] hover:text-[#a78bfa] cursor-pointer transition-colors font-medium"
                                role="button"
                                tabIndex={0}
                              >
                                Source Meeting
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div
                  className={`ui-digest-col ${isAiLocked ? 'pointer-events-none blur-md select-none opacity-50' : ''}`}
                >
                  <div className="ui-digest-card">
                    <h2 className="ui-digest-card-title">
                      <Users size={18} className="text-[var(--color-text-secondary)]" /> Top
                      Participants
                    </h2>
                    {digest.entityAggregation.topPeople.map((p, i) => (
                      <TopParticipantItem
                        key={i}
                        name={p.name}
                        count={p.meetingCount}
                        isLast={i === digest.entityAggregation.topPeople.length - 1}
                      />
                    ))}
                  </div>

                  <div className="ui-digest-card">
                    <h2 className="ui-digest-card-title">
                      <MessageSquare size={18} className="text-[var(--color-text-secondary)]" /> Top
                      Topics
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {digest.entityAggregation.topTopics.map((t, i) => (
                        <TopTopicItem key={i} topic={t.topic} count={t.mentionCount} />
                      ))}
                    </div>
                  </div>

                  {digest.contradictions.length > 0 && (
                    <div
                      className="ui-digest-card"
                      style={{
                        border: '1px solid var(--color-rose)',
                        background: 'rgba(244,63,94,0.02)',
                      }}
                    >
                      <h2 className="ui-digest-card-title text-[var(--color-rose)]">
                        <AlertTriangle size={18} /> Conflicting Info Detected
                      </h2>
                      <ul className="list-none p-0 m-0 flex flex-col gap-3">
                        {digest.contradictions.map((c, i) => (
                          <li
                            key={i}
                            className="p-3 bg-[rgba(244,63,94,0.1)] rounded-lg border border-[rgba(244,63,94,0.2)]"
                          >
                            <div className="text-[13px] mb-2 text-[#fca5a5]">"{c.statement1}"</div>
                            <div className="text-[12px] mb-2 text-[var(--color-rose)] opacity-70 italic text-center font-medium">
                              vs
                            </div>
                            <div className="text-[13px] text-[#fca5a5]">"{c.statement2}"</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
