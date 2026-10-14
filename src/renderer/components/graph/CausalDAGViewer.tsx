import React, { useMemo } from 'react'
import {
  GitCommit,
  ArrowRight,
  Calendar,
  Hash,
  CheckSquare,
  History,
  User,
  CheckCircle2,
  Network,
  ArrowUpRight,
  Search,
} from 'lucide-react'
import type { GraphNode, GraphEdge } from '../../../types/ipc'
import { formatRelativeTime } from '../../utils/time'

interface CausalDAGViewerProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  searchQuery?: string
  onClearSearch?: () => void
  /** Open the meeting a node belongs to */
  onOpenMeeting?: (node: GraphNode) => void
  /** Callback to return to entity graph */
  onReturnToGraph?: () => void
}

interface DecisionTrail {
  decision: GraphNode
  /** Meetings, topics and people the decision is connected to */
  context: GraphNode[]
  /** Action items that follow from the decision */
  followUps: GraphNode[]
  /** Other decisions this one replaces, is replaced by, or conflicts with */
  related: Array<{ node: GraphNode; relation: 'supersedes' | 'superseded by' | 'conflicts with' }>
}

const edgeEndId = (end: unknown): string =>
  typeof end === 'object' && end !== null ? String((end as { id?: unknown }).id) : String(end)

const isAction = (n: GraphNode) => n.type === 'action' || n.type === 'action_item'

/**
 * Build one trail per decision node from the knowledge graph:
 * - What it originated from (context: meetings, topics, participants)
 * - The decision itself and related decisions (supersedes / conflicts)
 * - What it led to (follow-up action items)
 */
function buildDecisionTrails(nodes: GraphNode[], edges: GraphEdge[]): DecisionTrail[] {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const trails = new Map<string, DecisionTrail>()
  for (const n of nodes) {
    if (n.type === 'decision') {
      trails.set(n.id, { decision: n, context: [], followUps: [], related: [] })
    }
  }

  const pushUnique = (list: GraphNode[], node: GraphNode) => {
    if (!list.some(n => n.id === node.id)) list.push(node)
  }

  for (const edge of edges) {
    const source = byId.get(edgeEndId(edge.source))
    const target = byId.get(edgeEndId(edge.target))
    if (!source || !target) continue

    for (const [self, other, selfIsSource] of [
      [source, target, true],
      [target, source, false],
    ] as const) {
      const trail = trails.get(self.id)
      if (!trail) continue

      if (other.type === 'decision') {
        if (trail.related.some(r => r.node.id === other.id)) continue
        if (edge.type === 'supersedes') {
          trail.related.push({
            node: other,
            relation: selfIsSource ? 'supersedes' : 'superseded by',
          })
        } else if (edge.type === 'contradicts') {
          trail.related.push({ node: other, relation: 'conflicts with' })
        }
      } else if (isAction(other)) {
        pushUnique(trail.followUps, other)
      } else {
        pushUnique(trail.context, other)
      }
    }
  }

  return [...trails.values()].sort(
    (a, b) => (b.decision.createdAt || 0) - (a.decision.createdAt || 0)
  )
}

/**
 * Decision Trail: Causal lineage viewer displaying the three-stage progression of each decision:
 * 1. Came from (Origin meeting, participant, or topic domain)
 * 2. Decision (The canonical agreement, consensus level, and rationale)
 * 3. Led to (Downstream action items and execution outcomes)
 */
export const CausalDAGViewer: React.FC<CausalDAGViewerProps> = ({
  nodes,
  edges,
  searchQuery,
  onClearSearch,
  onOpenMeeting,
  onReturnToGraph,
}) => {
  const allTrails = useMemo(() => buildDecisionTrails(nodes, edges), [nodes, edges])

  const trails = useMemo(() => {
    if (!searchQuery?.trim()) return allTrails
    const q = searchQuery.toLowerCase()
    return allTrails.filter(trail => {
      if (trail.decision.label.toLowerCase().includes(q)) return true
      if (trail.context.some(c => c.label.toLowerCase().includes(q))) return true
      if (trail.followUps.some(f => f.label.toLowerCase().includes(q))) return true
      return false
    })
  }, [allTrails, searchQuery])

  if (trails.length === 0) {
    return (
      <div className="flex-1 w-full h-full overflow-y-auto sovereign-scrollbar bg-[#08080c] text-white">
        <div className="max-w-[840px] mx-auto px-6 pt-10 pb-20">
          <div className="py-20 flex flex-col items-center justify-center text-center rounded-2xl bg-gradient-to-b from-white/[0.03] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.04] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.03)] p-8">
            <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center text-violet-300 mb-3 shadow-[0_0_24px_rgba(139,92,246,0.12)]">
              {searchQuery ? <Search size={22} /> : <GitCommit size={24} />}
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">
              {searchQuery ? `No decisions matching "${searchQuery}"` : 'No decisions mapped yet'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mb-5 leading-relaxed">
              {searchQuery
                ? 'Try searching with a different keyword or clear the search filter to see all decisions.'
                : 'When decisions are agreed upon in your meetings, each one appears here with origin meetings and follow-up impacts.'}
            </p>
            <div className="flex items-center gap-2">
              {searchQuery && onClearSearch && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="h-8 px-3.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all active:scale-[0.98]"
                >
                  Clear search filter
                </button>
              )}
              {onReturnToGraph && (
                <button
                  type="button"
                  onClick={onReturnToGraph}
                  className="h-8 px-3.5 rounded-lg text-xs font-medium bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 transition-all flex items-center gap-1.5 active:scale-[0.98]"
                >
                  <Network size={13} />
                  <span>Return to Entity Graph</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full h-full overflow-y-auto sovereign-scrollbar bg-[#08080c] text-white">
      <div className="max-w-[840px] mx-auto px-6 pt-12 pb-28 space-y-6">
        {/* Clean Status & Progression Toolbar */}
        <div className="flex items-center justify-between gap-4 pb-3.5 mb-6 border-b border-white/[0.03]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-300">
              {trails.length} causal decision trail{trails.length === 1 ? '' : 's'}
            </span>
            <span className="text-zinc-600">·</span>
            <span className="text-xs text-zinc-400">
              Where each decision originated and what it led to
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.03] text-[11px] font-mono text-zinc-400">
              <span>Origin</span>
              <span className="text-zinc-600">➔</span>
              <span className="text-violet-300 font-medium">Decision</span>
              <span className="text-zinc-600">➔</span>
              <span>Impact</span>
            </span>
          </div>
        </div>

        {/* Decision Trail Cards List */}
        <div className="space-y-5">
          {trails.map((trail, i) => {
            const meetings = trail.context.filter(n => n.type === 'meeting')
            const people = trail.context.filter(n => n.type === 'person')
            const topics = trail.context.filter(
              n => n.type === 'topic' || (n.type !== 'meeting' && n.type !== 'person')
            )

            // Primary origin items for Stage 1 (Meeting + Author)
            const primaryMeeting = meetings[0]
            const primaryPerson = people[0]
            const primaryTopic = topics[0]

            // Remaining context tags (exclude already rendered primary items)
            const primaryIds = new Set([primaryMeeting?.id, primaryPerson?.id].filter(Boolean))
            const tags = trail.context.filter(n => !primaryIds.has(n.id))

            // Domain title for card top strip
            const domainLabel =
              primaryTopic?.label || (primaryMeeting ? primaryMeeting.label : 'Contributor Input')

            // Confidence percentage
            const rawConfidence = (trail.decision.metadata as Record<string, unknown> | undefined)
              ?.confidence
            const confidenceVal =
              typeof rawConfidence === 'number' && rawConfidence > 0
                ? Math.round(rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence)
                : null

            // Relative creation time
            const timeAgo = formatRelativeTime(trail.decision.createdAt)

            return (
              <div
                key={trail.decision.id}
                className="relative rounded-2xl bg-gradient-to-b from-white/[0.03] via-white/[0.01] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] overflow-hidden transition-all hover:border-white/[0.06]"
              >
                {/* Card Top Meta Strip */}
                <div className="flex items-center justify-between px-5 py-3 bg-white/[0.01] border-b border-white/[0.025] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white tracking-tight">
                      Decision #{i + 1}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-400 font-mono text-[11px] truncate max-w-[260px]">
                      {domainLabel}
                    </span>
                    {timeAgo && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span className="text-zinc-500 font-mono text-[11px]">{timeAgo}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {confidenceVal !== null && (
                      <span className="text-zinc-400 font-mono text-[11px]">
                        {confidenceVal}% confidence
                      </span>
                    )}
                    <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 font-medium tracking-wider">
                      Canon
                    </span>
                  </div>
                </div>

                {/* Card 3-Stage Pipeline: Came From (28%) ➔ Decision (44%) ➔ Led To (28%) */}
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1.35fr_1fr] divide-y md:divide-y-0 md:divide-x divide-white/[0.025] items-stretch">
                  {/* Stage 1: Came From (Origin) */}
                  <div className="p-5 flex flex-col justify-start space-y-3 bg-transparent">
                    {/* Row 1: Stage Header */}
                    <div className="flex items-center justify-between h-5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
                        <span className="font-mono text-[10px] text-zinc-500 font-normal">01</span>
                        <span>Came from</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-white/[0.03] text-zinc-400 font-medium tracking-wider">
                        Origin
                      </span>
                    </div>

                    {/* Row 2 & 3: Primary Source Container & Context Chips */}
                    <div className="space-y-2">
                      {primaryMeeting && (
                        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] group hover:bg-white/[0.05] transition-colors">
                          <div className="flex items-center gap-2 min-w-0">
                            <Calendar size={13} className="text-violet-400 shrink-0" />
                            {onOpenMeeting ? (
                              <button
                                type="button"
                                onClick={() => onOpenMeeting(primaryMeeting)}
                                className="truncate text-xs font-medium text-zinc-200 group-hover:text-violet-300 group-hover:underline transition-colors text-left"
                                title={`Open "${primaryMeeting.label}"`}
                              >
                                {primaryMeeting.label}
                              </button>
                            ) : (
                              <span
                                className="truncate text-xs font-medium text-zinc-200"
                                title={primaryMeeting.label}
                              >
                                {primaryMeeting.label}
                              </span>
                            )}
                          </div>
                          {onOpenMeeting && (
                            <ArrowUpRight
                              size={12}
                              className="text-zinc-500 group-hover:text-violet-300 transition-colors shrink-0"
                            />
                          )}
                        </div>
                      )}

                      {primaryPerson && (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-500/[0.06]">
                          <User size={12} className="text-blue-400 shrink-0" />
                          <span className="text-[11px] font-medium text-blue-200 truncate">
                            {primaryPerson.label}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono ml-auto">
                            Contributor
                          </span>
                        </div>
                      )}

                      {!primaryMeeting && !primaryPerson && (
                        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.03]">
                          <History size={13} className="text-zinc-500 shrink-0" />
                          <span className="text-xs text-zinc-400 italic">Direct input</span>
                        </div>
                      )}

                      {/* Associated Topic Badges */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {tags.map(tag => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md text-[11px] font-medium bg-white/[0.03] text-zinc-300"
                            >
                              {tag.type === 'meeting' && (
                                <Calendar size={11} className="text-zinc-500 shrink-0" />
                              )}
                              {tag.type === 'person' && (
                                <User size={11} className="text-zinc-500 shrink-0" />
                              )}
                              {tag.type !== 'meeting' && tag.type !== 'person' && (
                                <Hash size={11} className="text-zinc-500 shrink-0" />
                              )}
                              <span className="truncate">{tag.label}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage 2: Decision (Canonical Choice & Rationale) */}
                  <div className="p-5 flex flex-col justify-start space-y-3 bg-gradient-to-b from-violet-500/[0.03] via-emerald-500/[0.01] to-transparent">
                    {/* Row 1: Stage Header */}
                    <div className="flex items-center justify-between h-5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-violet-300">
                        <ArrowRight size={12} className="text-zinc-600 hidden md:block" />
                        <span className="font-mono text-[10px] text-violet-400/80 font-normal">
                          02
                        </span>
                        <span>Decision</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300 font-medium tracking-wider">
                        Agreed
                      </span>
                    </div>

                    {/* Row 2 & 3: Hero Decision Statement & Relations */}
                    <div className="space-y-2">
                      <h4 className="text-[14.5px] font-semibold text-white leading-snug tracking-tight">
                        {trail.decision.label}
                      </h4>

                      {/* Relation Badge or Superseded / Conflicting links */}
                      {trail.related.length > 0 ? (
                        <div className="pt-2 border-t border-white/[0.025] space-y-1">
                          {trail.related.map(r => (
                            <div
                              key={`${r.relation}-${r.node.id}`}
                              className="flex items-start gap-1.5 text-[11px]"
                            >
                              <History
                                size={11}
                                className={`mt-0.5 shrink-0 ${
                                  r.relation === 'conflicts with'
                                    ? 'text-amber-400'
                                    : 'text-zinc-500'
                                }`}
                              />
                              <span
                                className={
                                  r.relation === 'conflicts with'
                                    ? 'text-amber-300/90 font-medium'
                                    : 'text-zinc-400'
                                }
                              >
                                {r.relation === 'supersedes'
                                  ? 'Replaces: '
                                  : r.relation === 'superseded by'
                                    ? 'Replaced by: '
                                    : 'Conflicts with: '}
                                "{r.node.label}"
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 pt-0.5">
                          <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                          <span>Established in consensus · Sovereign canon</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Stage 3: Led To (Impact & Actions) */}
                  <div className="p-5 flex flex-col justify-start space-y-3 bg-transparent">
                    {/* Row 1: Stage Header */}
                    <div className="flex items-center justify-between h-5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                        <ArrowRight size={12} className="text-zinc-600 hidden md:block" />
                        <span className="font-mono text-[10px] text-emerald-500/80 font-normal">
                          03
                        </span>
                        <span>Led to</span>
                      </div>
                      <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-medium tracking-wider">
                        {trail.followUps.length > 0
                          ? `${trail.followUps.length} follow-up${trail.followUps.length === 1 ? '' : 's'}`
                          : 'Impact'}
                      </span>
                    </div>

                    {/* Row 2 & 3: Action Items or Clean Empty State Slot */}
                    <div className="space-y-2">
                      {trail.followUps.length > 0 ? (
                        <div className="space-y-1.5">
                          {trail.followUps.map(n => (
                            <div
                              key={n.id}
                              className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-500/[0.06] text-xs text-emerald-200"
                            >
                              <CheckSquare size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                              <span className="font-medium leading-relaxed">{n.label}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-white/[0.02] flex items-start gap-2.5">
                          <div className="w-5 h-5 rounded-full bg-white/[0.03] flex items-center justify-center text-zinc-500 shrink-0 mt-0.5">
                            <CheckCircle2 size={11} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-zinc-300 font-medium m-0 leading-tight">
                              No action items linked
                            </p>
                            <p className="text-[11px] text-zinc-500 m-0 mt-0.5 leading-normal">
                              Consensus finalized without pending tasks.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
