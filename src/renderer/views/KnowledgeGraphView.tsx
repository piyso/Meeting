import { useAppStore } from '../store/appStore'
import { useNavigationStore } from '../store/navigationStore'
import { useConnectivityStore } from '../store/connectivityStore'
import React, { useCallback, useEffect, useState } from 'react'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import '../components/graph/graph.css'
import { CausalDAGViewer } from '../components/graph/CausalDAGViewer'
import {
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  Brain,
  Search,
  CheckCircle2,
  GitBranch,
  Network,
  Calendar,
  History,
  RotateCcw,
  Check,
  GitCompare,
  X,
  ArrowRight,
} from 'lucide-react'
import type { GraphData, Contradiction, GraphNode } from '../../types/ipc'
import { IconButton } from '../components/ui/IconButton'
import { Button } from '../components/ui/Button'
import { ProTeaseOverlay } from '../components/ui/ProTeaseOverlay'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorBoundary } from '../components/layout/ErrorBoundary'

export default function KnowledgeGraphView() {
  const currentTier = useAppStore(s => s.currentTier)
  const navigate = useNavigationStore(s => s.navigate)
  const isOnline = useConnectivityStore(s => s.isOnline)

  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [contradictions, setContradictions] = useState<Contradiction[]>([])
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [viewMode, setViewMode] = useState<'semantic' | 'causal' | 'conflicts'>(() => {
    const initial = sessionStorage.getItem('kg_initial_tab')
    if (initial === 'causal' || initial === 'conflicts' || initial === 'semantic') {
      sessionStorage.removeItem('kg_initial_tab')
      return initial
    }
    return 'semantic'
  })

  useEffect(() => {
    const initial = sessionStorage.getItem('kg_initial_tab')
    if (initial === 'causal' || initial === 'conflicts' || initial === 'semantic') {
      sessionStorage.removeItem('kg_initial_tab')
      setViewMode(initial)
    }
  }, [])

  const handleResolveContradiction = async (
    contra: Contradiction,
    choice: 'supersede' | 'keep_both' | 'dismiss',
    options: { silent?: boolean; preferredNodeId?: string } = {}
  ): Promise<boolean> => {
    setResolvingId(contra.id)
    try {
      const res = await window.electronAPI?.graph?.resolveContradiction?.({
        contradictionId: contra.id,
        resolutionChoice: choice,
        preferredNodeId: options.preferredNodeId || contra.meeting2?.id,
      })
      if (!res?.success) {
        throw new Error(res?.error?.message || 'The conflict could not be updated.')
      }

      // Remove from active state
      setContradictions(prev => prev.filter(c => c.id !== contra.id))
      if (!options.silent) {
        useAppStore.getState().addToast(
          choice === 'dismiss'
            ? { type: 'info', title: 'Conflict dismissed', duration: 3000 }
            : {
                type: 'success',
                title: 'Conflict resolved',
                message:
                  options.preferredNodeId === contra.meeting1?.id
                    ? 'The earlier statement is now treated as current.'
                    : 'The newer statement is now treated as current.',
                duration: 3000,
              }
        )
      }
      return true
    } catch (err) {
      useAppStore.getState().addToast({
        type: 'error',
        title: 'Could not resolve conflict',
        message: err instanceof Error ? err.message : undefined,
        duration: 4000,
      })
      return false
    } finally {
      setResolvingId(null)
    }
  }

  const [resolvingAll, setResolvingAll] = useState(false)
  const handleResolveAll = async () => {
    if (resolvingAll) return
    setResolvingAll(true)
    let resolvedCount = 0
    try {
      for (const c of [...contradictions]) {
        const ok = await handleResolveContradiction(c, 'supersede', { silent: true })
        if (!ok) break // the error toast is already shown — don't repeat it per conflict
        resolvedCount++
      }
    } finally {
      setResolvingAll(false)
    }
    if (resolvedCount > 0) {
      useAppStore.getState().addToast({
        type: 'success',
        title: `${resolvedCount} conflict${resolvedCount === 1 ? '' : 's'} resolved`,
        duration: 3000,
      })
    }
  }

  // Press Escape to return to semantic graph from conflicts
  useEffect(() => {
    if (viewMode !== 'conflicts') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewMode('semantic')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [viewMode])

  // Derive lock state from backend tier gate response
  const isLocked = graphData?.blocked === true

  const filteredData = React.useMemo(() => {
    if (!graphData) return null
    if (!searchQuery.trim()) return graphData

    const lowerQ = searchQuery.toLowerCase()
    const fNodes = graphData.nodes.filter(
      n => n.label.toLowerCase().includes(lowerQ) || n.type.toLowerCase().includes(lowerQ)
    )
    const fNodeIds = new Set(fNodes.map(n => n.id))

    const fEdges = graphData.edges.filter(e => {
      const sId =
        typeof e.source === 'object' && e.source !== null
          ? (e.source as { id: string }).id
          : String(e.source)
      const tId =
        typeof e.target === 'object' && e.target !== null
          ? (e.target as { id: string }).id
          : String(e.target)
      return fNodeIds.has(sId) && fNodeIds.has(tId)
    })

    return { nodes: fNodes, edges: fEdges }
  }, [graphData, searchQuery])

  const fetchGraphData = useCallback(async () => {
    if (isLocked) return
    setIsLoading(true)
    setError(null)
    try {
      const [graphRes, contraRes] = await Promise.all([
        window.electronAPI?.graph?.get({ maxHops: 3 }),
        window.electronAPI?.graph?.getContradictions({}),
      ])

      if (!graphRes) {
        setError('Graph API unavailable — electronAPI.graph.get returned undefined.')
      } else if (graphRes.success && graphRes.data) {
        setGraphData(graphRes.data)
      } else {
        setError(graphRes.error?.message || 'Failed to load graph.')
      }

      if (contraRes?.success && contraRes.data) {
        setContradictions(contraRes.data)
      } else if (contraRes && !contraRes.success) {
        console.debug('Contradictions fetch warning:', contraRes.error?.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [isLocked])

  useEffect(() => {
    fetchGraphData()
  }, [fetchGraphData])

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(prev => (prev?.id === node.id ? null : node))
  }, [])

  // Double click inside panel opens meeting detail view
  const openMeeting = useCallback(
    (node: GraphNode) => {
      const metadata = node.metadata as Record<string, unknown> | undefined
      const meetingId = typeof metadata?.meetingId === 'string' ? metadata.meetingId : node.id
      navigate('meeting-detail', meetingId)
    },
    [navigate]
  )

  // ── Full-page lock for free/starter users ──
  if (isLocked) {
    return (
      <ErrorBoundary viewName="KnowledgeGraphView">
        <div className="ui-view graph-view-container">
          <header className="ui-header graph-header-shrink">
            <IconButton
              icon={<ChevronLeft size={18} />}
              onClick={() => navigate('meeting-list')}
              className="mr-2"
              tooltip="Back to Meetings"
            />
            <div className="ui-header-title">
              <h1>Knowledge Graph</h1>
              <span className="ui-header-subtitle">
                Visualize connections across meetings and topics
              </span>
            </div>
          </header>
          {/* graph-main-area: flex-grow:1; position:relative from CSS — ProTeaseOverlay fills via absolute inset-0 */}
          <div className="graph-main-area">
            <ProTeaseOverlay
              title="Unlock the Knowledge Graph"
              description={
                currentTier === 'starter'
                  ? 'Interactive exploration is a Pro feature.'
                  : 'Upgrade to visualize connections across all your meetings.'
              }
              targetTier="pro"
            />
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary viewName="KnowledgeGraphView">
      <div className="ui-view graph-view-container">
        <header className="ui-header graph-header-shrink">
          <IconButton
            icon={<ChevronLeft size={18} />}
            onClick={() => {
              if (viewMode === 'conflicts' || viewMode === 'causal') {
                setViewMode('semantic')
              } else {
                navigate('meeting-list')
              }
            }}
            className="mr-2"
            tooltip={
              viewMode === 'conflicts' || viewMode === 'causal'
                ? 'Back to Entity Graph'
                : 'Back to Meetings'
            }
          />
          <div className="ui-header-title">
            <h1>
              {viewMode === 'conflicts'
                ? 'Conflicting Statements'
                : viewMode === 'causal'
                  ? 'Decision Trail'
                  : 'Knowledge Graph'}
            </h1>
            <span className="ui-header-subtitle">
              {viewMode === 'conflicts'
                ? contradictions.length > 0
                  ? `Truth Engine detected ${contradictions.length} cross-meeting statement disagreement${contradictions.length === 1 ? '' : 's'}`
                  : 'All cross-meeting statements harmonized'
                : viewMode === 'causal'
                  ? 'Causal lineage of decisions, origin meetings, and follow-up impacts'
                  : 'Visualize connections across meetings and topics'}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-white/[0.03] p-0.5 rounded-xl mr-1">
              <button
                onClick={() => setViewMode('semantic')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'semantic'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Network size={13} />
                Entity Graph
              </button>
              <button
                onClick={() => setViewMode('causal')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'causal'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <GitBranch size={13} />
                Decision Trail
              </button>
              <button
                onClick={() => setViewMode('conflicts')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'conflicts'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <GitCompare size={13} />
                <span>Conflicts</span>
                {contradictions.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold leading-none">
                    {contradictions.length}
                  </span>
                )}
              </button>
            </div>

            {viewMode !== 'conflicts' && (
              <div className="relative" style={{ width: '210px' }}>
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  type="text"
                  placeholder={viewMode === 'causal' ? 'Search decisions...' : 'Search graph...'}
                  className="pl-8 pr-4 w-full bg-white/[0.03] hover:bg-white/[0.05] focus:bg-white/[0.07] rounded-xl py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none transition-colors"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            )}
            <IconButton
              icon={<RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />}
              onClick={fetchGraphData}
              tooltip="Refresh Data"
              disabled={isLoading}
            />
          </div>

          {!isOnline && <div className="graph-offline-badge">Offline Mode</div>}
        </header>

        <div className="graph-main-area relative">
          {/* Contradiction Alert Banner Capsule (Only visible on semantic graph) */}
          {contradictions.length > 0 && viewMode === 'semantic' && (
            <button
              type="button"
              onClick={() => setViewMode('conflicts')}
              className="absolute top-5 left-6 z-20 flex items-center gap-3 px-4 py-2 rounded-full bg-[#0d0d14]/90 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.75)] hover:bg-[#151522]/95 cursor-pointer transition-all text-white group animate-fade-in"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                <span className="text-xs font-medium text-zinc-200 tracking-tight">
                  <span className="text-amber-300 font-semibold">{contradictions.length}</span>{' '}
                  conflicting statement
                  {contradictions.length === 1 ? '' : 's'} found
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 group-hover:bg-amber-500/25 transition-all flex items-center gap-1.5">
                <span>Review</span>
                <ArrowRight
                  size={11}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </button>
          )}

          {/* Dedicated Conflicting Statements Page */}
          {viewMode === 'conflicts' ? (
            <div className="flex-1 w-full h-full overflow-y-auto sovereign-scrollbar bg-[#08080c] text-white">
              <div className="max-w-[800px] mx-auto px-6 pt-12 pb-28 space-y-6">
                {/* Clean Status & Batch Toolbar */}
                <div className="flex items-center justify-between gap-4 pb-3.5 mb-6 border-b border-white/[0.03]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-zinc-300">
                      {contradictions.length === 0
                        ? 'Truth Engine status'
                        : `${contradictions.length} unresolved conflict${contradictions.length === 1 ? '' : 's'}`}
                    </span>
                    <span className="text-zinc-600">·</span>
                    <span className="text-xs text-zinc-400">
                      {contradictions.length === 0
                        ? 'Harmonized across all meetings'
                        : 'Select canonical truth or dismiss'}
                    </span>
                  </div>

                  {contradictions.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-[11px] font-mono text-emerald-300">
                      <CheckCircle2 size={12} className="text-emerald-400" />
                      <span>Canon synchronized</span>
                    </span>
                  ) : contradictions.length > 1 ? (
                    <button
                      onClick={handleResolveAll}
                      disabled={resolvingAll || resolvingId !== null}
                      className="px-3.5 py-1.5 rounded-full text-xs font-medium text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-500/25 transition-all flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                    >
                      {resolvingAll ? (
                        <>
                          <RefreshCw size={12} className="animate-spin text-emerald-300" />
                          <span>Resolving all…</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={12} />
                          <span>Keep newer for all ({contradictions.length})</span>
                        </>
                      )}
                    </button>
                  ) : null}
                </div>

                {/* Conflict Cards List / Harmonized State */}
                {contradictions.length === 0 ? (
                  <div className="relative overflow-hidden py-16 px-8 flex flex-col items-center justify-center text-center rounded-2xl bg-gradient-to-b from-white/[0.03] via-emerald-500/[0.015] to-[#0a0a0f]/90 backdrop-blur-3xl border border-white/[0.04] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.03)]">
                    {/* Ambient top green glow */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-36 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />

                    {/* Glowing Emblem */}
                    <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 flex items-center justify-center text-emerald-400 mb-4 shadow-[0_0_32px_rgba(16,185,129,0.2)]">
                      <CheckCircle2 size={26} strokeWidth={2.2} />
                    </div>

                    {/* Status Pill */}
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 font-mono text-[11px] font-medium tracking-wide mb-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>All Statements Harmonized</span>
                    </span>

                    {/* Headings */}
                    <h3 className="text-base font-semibold text-white tracking-tight mb-1.5">
                      All statements aligned
                    </h3>
                    <p className="text-xs text-zinc-400 max-w-md leading-relaxed mb-6">
                      The Truth Engine has harmonized all conflicting assertions across your
                      meetings. Every statement and decision establishes a single, verified
                      canonical truth.
                    </p>

                    {/* Navigation Buttons */}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setViewMode('semantic')}
                        className="h-9 px-5 rounded-xl text-xs font-medium text-white bg-violet-600 hover:bg-violet-500 shadow-[0_2px_14px_rgba(124,58,237,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-all flex items-center gap-2 active:scale-[0.98] group"
                      >
                        <Network size={14} />
                        <span>Return to Entity Graph</span>
                        <ArrowRight
                          size={13}
                          className="opacity-70 group-hover:translate-x-0.5 transition-transform"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => setViewMode('causal')}
                        className="h-9 px-4 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-all flex items-center gap-2 active:scale-[0.98]"
                      >
                        <GitBranch size={13} className="text-violet-400" />
                        <span>View Decision Trail</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contradictions.map((c, i) => {
                      const confidenceVal =
                        typeof c.confidence === 'number' && c.confidence > 0
                          ? Math.round(Math.min(c.confidence, 1) * 100)
                          : 85

                      return (
                        <div
                          key={c.id || i}
                          className="relative rounded-2xl bg-gradient-to-b from-white/[0.03] via-white/[0.01] to-[#0a0a0f]/80 backdrop-blur-3xl border border-white/[0.035] shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6),inset_0_1px_0_0_rgba(255,255,255,0.025)] overflow-hidden transition-all hover:border-white/[0.06]"
                        >
                          {/* Card Top Meta Row: Integrated header strip */}
                          <div className="flex items-center justify-between px-5 py-3 bg-white/[0.01] border-b border-white/[0.025] text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white tracking-tight">
                                Conflict #{i + 1}
                              </span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-zinc-400 font-mono text-[11px]">
                                {c.type === 'supersedes'
                                  ? 'Timeline revision'
                                  : 'Direct contradiction'}
                              </span>
                              <span className="text-zinc-600">·</span>
                              <span className="text-amber-300 font-mono text-[10.5px] bg-amber-400/[0.1] px-2.5 py-0.5 rounded-full font-medium">
                                {confidenceVal}% confidence
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={resolvingId === c.id || resolvingAll}
                              onClick={() => handleResolveContradiction(c, 'dismiss')}
                              className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-md hover:bg-white/[0.04] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                              title="Dismiss conflict"
                            >
                              <X size={12} className="text-zinc-500" />
                              <span>Dismiss</span>
                            </button>
                          </div>

                          {/* Seamless Symmetrical 2-Column Split Arena */}
                          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.025]">
                            {/* Earlier Statement Column */}
                            <div className="p-5 flex flex-col justify-between space-y-4 bg-white/[0.005]">
                              <div className="space-y-2.5">
                                {/* Row 1: Label (Fixed h-5 for alignment) */}
                                <div className="flex items-center justify-between h-5">
                                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                                    <History size={13} className="text-zinc-500 flex-shrink-0" />
                                    <span>Earlier statement</span>
                                  </div>
                                  <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-white/[0.03] text-zinc-400 font-medium tracking-wider">
                                    Challenged
                                  </span>
                                </div>

                                {/* Row 2: Meeting Source (Fixed h-5 for alignment) */}
                                <div className="flex items-center gap-1.5 h-5 text-xs text-zinc-400">
                                  <Calendar size={13} className="text-zinc-500 flex-shrink-0" />
                                  <span className="text-zinc-500 text-[11px]">from</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      c.meeting1?.id && navigate('meeting-detail', c.meeting1.id)
                                    }
                                    className="truncate font-medium text-zinc-300 hover:text-violet-300 hover:underline transition-colors text-left"
                                    title={c.meeting1?.title}
                                  >
                                    {c.meeting1?.title || 'Previous meeting'}
                                  </button>
                                </div>

                                {/* Row 3: Statement Quote (Top-aligned with flex-1 min-h-[56px]) */}
                                <div className="flex-1 min-h-[56px] pt-1 pb-1">
                                  <p className="text-[13.5px] text-zinc-300 leading-[1.65] font-normal m-0">
                                    {c.statement1 ||
                                      (c.meeting1
                                        ? `Decision in "${c.meeting1.title}"`
                                        : 'Previous statement')}
                                  </p>
                                </div>
                              </div>

                              {/* Row 4: Action Button (h-9 for alignment) */}
                              <button
                                type="button"
                                disabled={resolvingId === c.id || resolvingAll}
                                onClick={() =>
                                  handleResolveContradiction(c, 'supersede', {
                                    preferredNodeId: c.meeting1?.id,
                                  })
                                }
                                className="w-full h-9 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-all flex items-center justify-center gap-1.5 active:scale-[0.99] disabled:opacity-50"
                              >
                                {resolvingId === c.id ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin text-zinc-400" />
                                    <span>Saving…</span>
                                  </>
                                ) : (
                                  <>
                                    <RotateCcw size={13} className="text-zinc-400" />
                                    <span>Keep earlier statement</span>
                                  </>
                                )}
                              </button>
                            </div>

                            {/* Newer Statement Column (Recommended) */}
                            <div className="p-5 flex flex-col justify-between space-y-4 bg-gradient-to-b from-emerald-500/[0.025] via-emerald-500/[0.008] to-transparent">
                              <div className="space-y-2.5">
                                {/* Row 1: Label + Recommended Badge (Fixed h-5 for alignment) */}
                                <div className="flex items-center justify-between h-5">
                                  <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                                    </span>
                                    <span>Newer statement</span>
                                  </div>
                                  <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium tracking-wider">
                                    Recommended
                                  </span>
                                </div>

                                {/* Row 2: Meeting Source (Fixed h-5 for alignment) */}
                                <div className="flex items-center gap-1.5 h-5 text-xs text-zinc-400">
                                  <Calendar size={13} className="text-zinc-500 flex-shrink-0" />
                                  <span className="text-zinc-500 text-[11px]">from</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      c.meeting2?.id && navigate('meeting-detail', c.meeting2.id)
                                    }
                                    className="truncate font-medium text-zinc-300 hover:text-emerald-300 hover:underline transition-colors text-left"
                                    title={c.meeting2?.title}
                                  >
                                    {c.meeting2?.title || 'Updated meeting'}
                                  </button>
                                </div>

                                {/* Row 3: Statement Quote (Top-aligned with flex-1 min-h-[56px]) */}
                                <div className="flex-1 min-h-[56px] pt-1 pb-1">
                                  <p className="text-[13.5px] text-white leading-[1.65] font-medium m-0">
                                    {c.statement2 ||
                                      (c.meeting2
                                        ? `Updated in "${c.meeting2.title}"`
                                        : 'Superseding decision')}
                                  </p>
                                </div>
                              </div>

                              {/* Row 4: Action Button (h-9 for alignment) */}
                              <button
                                type="button"
                                disabled={resolvingId === c.id || resolvingAll}
                                onClick={() =>
                                  handleResolveContradiction(c, 'supersede', {
                                    preferredNodeId: c.meeting2?.id,
                                  })
                                }
                                className="w-full h-9 rounded-xl text-xs font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-[0_4px_16px_rgba(16,185,129,0.25)] transition-all flex items-center justify-center gap-1.5 active:scale-[0.99] disabled:opacity-50"
                              >
                                {resolvingId === c.id ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin text-white" />
                                    <span>Saving…</span>
                                  </>
                                ) : (
                                  <>
                                    <Check size={13} strokeWidth={2.5} />
                                    <span>Keep newer statement</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : viewMode === 'causal' ? (
            <CausalDAGViewer
              nodes={graphData?.nodes ?? []}
              edges={graphData?.edges ?? []}
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
              onOpenMeeting={openMeeting}
              onReturnToGraph={() => setViewMode('semantic')}
            />
          ) : (
            /* Main Canvas Area */
            <div className="graph-canvas-container">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-4 animate-fade-in">
                  <RefreshCw
                    size={28}
                    className="animate-spin text-[var(--color-violet)] opacity-80"
                  />
                  <p className="tracking-wide font-medium">Mapping neural connections...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-[var(--color-rose)] gap-4 animate-slide-up bg-[rgba(244,63,94,0.05)] rounded-2xl border border-[rgba(244,63,94,0.1)] p-8 max-w-sm mx-auto mt-[10vh]">
                  <AlertCircle size={32} />
                  <p className="text-center">{error}</p>
                </div>
              ) : filteredData ? (
                <>
                  <GraphCanvas
                    nodes={filteredData.nodes}
                    edges={filteredData.edges}
                    contradictions={contradictions}
                    onNodeClick={handleNodeClick}
                  />
                  {filteredData.nodes.length === 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-sm pointer-events-none">
                      <div className="max-w-md w-full mx-auto pointer-events-auto">
                        <EmptyState
                          icon={Brain}
                          title="Cognitive Void"
                          description="Your knowledge graph is empty. Record your first sovereign meeting, and the semantic engine will automatically extract and map entities and relationships here."
                          action={
                            <Button variant="secondary" onClick={() => navigate('meeting-list')}>
                              Record a Meeting
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {/* Right Sidebar for Selection */}
          {selectedNode && (
            <div className="graph-sidebar">
              <div className="graph-sidebar-header">
                <h3 className="graph-sidebar-title">Node Details</h3>
                <IconButton
                  icon={<span style={{ fontSize: 14 }}>✕</span>}
                  onClick={() => setSelectedNode(null)}
                  className="ml-auto"
                  tooltip="Close"
                />
              </div>

              <div className="graph-detail-group">
                <div className="graph-detail-label">Type</div>
                <div className="graph-type-badge">{selectedNode.type}</div>
              </div>

              <div className="graph-detail-group">
                <div className="graph-detail-label">Label</div>
                <div className="graph-detail-value">{selectedNode.label}</div>
              </div>

              {selectedNode.type === 'meeting' && (
                <div className="mt-4">
                  <Button
                    variant="primary"
                    onClick={() => openMeeting(selectedNode)}
                    className="w-full justify-center"
                  >
                    Open Meeting
                  </Button>
                </div>
              )}

              {Object.keys(selectedNode.metadata || {}).length > 0 && (
                <div className="graph-detail-group" style={{ marginTop: 24 }}>
                  <div className="graph-detail-label">Metadata</div>
                  <pre className="graph-metadata-pre">
                    {JSON.stringify(selectedNode.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  )
}
