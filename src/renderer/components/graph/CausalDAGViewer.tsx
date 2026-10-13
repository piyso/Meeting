import React, { useMemo, useState } from 'react'
import { GitCommit, ArrowRight, Calendar, Hash, CheckSquare, History, User } from 'lucide-react'
import type { GraphNode, GraphEdge } from '../../../types/ipc'

interface CausalDAGViewerProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Open the meeting a node belongs to */
  onOpenMeeting?: (node: GraphNode) => void
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
 * Build one trail per decision node from the knowledge graph: what it is
 * connected to (context), what follows from it (action items) and how it
 * relates to other decisions. Purely structural — nothing is inferred.
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

const contextIcon = (type: GraphNode['type']) => {
  if (type === 'meeting') return <Calendar size={12} />
  if (type === 'person') return <User size={12} />
  return <Hash size={12} />
}

/**
 * Decision trail: for every decision in the knowledge graph, shows where it
 * came from, the decision itself, and what it led to.
 */
export const CausalDAGViewer: React.FC<CausalDAGViewerProps> = ({
  nodes,
  edges,
  onOpenMeeting,
}) => {
  const trails = useMemo(() => buildDecisionTrails(nodes, edges), [nodes, edges])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (trails.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-8 text-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300">
          <GitCommit size={22} />
        </div>
        <h3 className="text-base font-semibold tracking-tight">No decisions mapped yet</h3>
        <p className="text-sm text-white/50 max-w-sm leading-relaxed">
          When decisions are detected in your meetings, each one appears here with the meetings and
          topics it came from and the action items that followed.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full h-full flex flex-col p-6 text-white overflow-y-auto sovereign-scrollbar">
      <div className="mb-5">
        <h3 className="text-lg font-bold tracking-tight">Decision Trail</h3>
        <p className="text-xs text-white/50 mt-0.5">
          {trails.length} decision{trails.length === 1 ? '' : 's'} from your meetings — where each
          came from and what it led to
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {trails.map(trail => {
          const isSelected = selectedId === trail.decision.id
          const meetings = trail.context.filter(n => n.type === 'meeting')
          return (
            <div
              key={trail.decision.id}
              className={`grid grid-cols-1 lg:grid-cols-[1fr_auto_1.2fr_auto_1fr] gap-3 items-stretch rounded-2xl border p-3 transition-colors ${
                isSelected
                  ? 'border-violet-500/40 bg-violet-500/[0.06]'
                  : 'border-white/[0.06] bg-white/[0.02]'
              }`}
            >
              {/* Came from */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-white/40">
                  Came from
                </span>
                {trail.context.length === 0 ? (
                  <span className="text-xs text-white/30">No linked meeting or topic</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {trail.context.slice(0, 6).map(n =>
                      n.type === 'meeting' && onOpenMeeting ? (
                        <button
                          key={n.id}
                          onClick={() => onOpenMeeting(n)}
                          title={`Open "${n.label}"`}
                          className="inline-flex items-center gap-1 max-w-full px-2 py-1 rounded-lg text-[11px] bg-violet-500/10 border border-violet-500/20 text-violet-200 hover:bg-violet-500/20 transition-colors"
                        >
                          {contextIcon(n.type)}
                          <span className="truncate">{n.label}</span>
                        </button>
                      ) : (
                        <span
                          key={n.id}
                          className="inline-flex items-center gap-1 max-w-full px-2 py-1 rounded-lg text-[11px] bg-white/[0.04] border border-white/[0.06] text-white/70"
                        >
                          {contextIcon(n.type)}
                          <span className="truncate">{n.label}</span>
                        </span>
                      )
                    )}
                    {trail.context.length > 6 && (
                      <span className="text-[11px] text-white/40 self-center">
                        +{trail.context.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="hidden lg:flex items-center text-white/20">
                <ArrowRight size={16} />
              </div>

              {/* Decision */}
              <button
                onClick={() => setSelectedId(isSelected ? null : trail.decision.id)}
                aria-expanded={isSelected}
                className="text-left rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 hover:bg-violet-500/15 transition-colors min-w-0"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold text-violet-300 mb-1">
                  <GitCommit size={12} />
                  Decision
                </div>
                <p
                  className={`text-sm font-medium leading-snug text-white ${isSelected ? '' : 'line-clamp-3'}`}
                >
                  {trail.decision.label}
                </p>
                {trail.related.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {trail.related.map(r => (
                      <span
                        key={`${r.relation}-${r.node.id}`}
                        className={`inline-flex items-start gap-1 text-[11px] ${
                          r.relation === 'conflicts with' ? 'text-amber-300/90' : 'text-white/50'
                        }`}
                      >
                        <History size={11} className="mt-0.5 shrink-0" />
                        <span className={isSelected ? '' : 'line-clamp-1'}>
                          {r.relation === 'supersedes'
                            ? 'Replaces'
                            : r.relation === 'superseded by'
                              ? 'Replaced by'
                              : 'Conflicts with'}
                          : {r.node.label}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {isSelected && meetings.length === 0 && trail.followUps.length === 0 && (
                  <p className="mt-2 text-[11px] text-white/40">
                    This decision is not linked to a meeting or action item yet.
                  </p>
                )}
              </button>

              <div className="hidden lg:flex items-center text-white/20">
                <ArrowRight size={16} />
              </div>

              {/* Led to */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="text-[10px] uppercase tracking-widest font-semibold text-white/40">
                  Led to
                </span>
                {trail.followUps.length === 0 ? (
                  <span className="text-xs text-white/30">No action items linked</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {trail.followUps.slice(0, isSelected ? undefined : 3).map(n => (
                      <li
                        key={n.id}
                        className="flex items-start gap-1.5 text-[12px] text-emerald-200/90"
                      >
                        <CheckSquare size={12} className="mt-0.5 shrink-0 text-emerald-400" />
                        <span className={isSelected ? '' : 'line-clamp-2'}>{n.label}</span>
                      </li>
                    ))}
                    {!isSelected && trail.followUps.length > 3 && (
                      <li className="text-[11px] text-white/40">
                        +{trail.followUps.length - 3} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
