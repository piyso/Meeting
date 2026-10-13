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
  ShieldAlert,
  GitBranch,
  Network,
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
  const [showContradictionsDrawer, setShowContradictionsDrawer] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [viewMode, setViewMode] = useState<'semantic' | 'causal'>('semantic')

  const handleResolveContradiction = async (
    contra: Contradiction,
    choice: 'supersede' | 'keep_both' | 'dismiss',
    options: { silent?: boolean } = {}
  ): Promise<boolean> => {
    setResolvingId(contra.id)
    try {
      const res = await window.electronAPI?.graph?.resolveContradiction?.({
        contradictionId: contra.id,
        resolutionChoice: choice,
        preferredNodeId: contra.meeting2?.id,
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
                message: 'The newer statement is now treated as current.',
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

  // Close the conflicts dialog with Escape
  useEffect(() => {
    if (!showContradictionsDrawer) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowContradictionsDrawer(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showContradictionsDrawer])

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

          <div className="ml-auto flex items-center gap-2" style={{ marginRight: '24px' }}>
            {/* View Mode Toggle */}
            <div className="flex items-center bg-white/[0.04] p-0.5 rounded-lg border border-white/10 mr-1">
              <button
                onClick={() => setViewMode('semantic')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'semantic'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <Network size={13} />
                Entity Graph
              </button>
              <button
                onClick={() => setViewMode('causal')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'causal'
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                <GitBranch size={13} />
                Decision Trail
              </button>
            </div>

            <div className="relative" style={{ width: '200px' }}>
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]"
              />
              <input
                type="text"
                placeholder="Search graph..."
                className="ui-entity-search-input pl-9 pr-4 w-full bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.1)] rounded-md py-1.5 text-sm"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <IconButton
              icon={<RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />}
              onClick={fetchGraphData}
              tooltip="Refresh Graph"
              disabled={isLoading}
            />
          </div>

          {!isOnline && <div className="graph-offline-badge">Offline Mode</div>}
        </header>

        <div className="graph-main-area relative">
          {/* Contradiction Alert Banner Capsule */}
          {contradictions.length > 0 && viewMode === 'semantic' && (
            <button
              type="button"
              onClick={() => setShowContradictionsDrawer(true)}
              className="absolute top-4 left-6 z-20 flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#0c0c12]/95 border border-amber-500/15 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:border-amber-500/30 cursor-pointer transition-all text-white group animate-fade-in"
            >
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                </span>
                <span className="text-xs font-medium text-amber-200/90 tracking-tight">
                  {contradictions.length} conflicting statement
                  {contradictions.length === 1 ? '' : 's'} found
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300/90 border border-amber-500/20 group-hover:bg-amber-500/20 transition-all flex items-center gap-1">
                <span>Review</span>
                <span className="text-[9px]">→</span>
              </span>
            </button>
          )}

          {/* Main Canvas Area */}
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
            ) : filteredData && viewMode === 'causal' ? (
              <CausalDAGViewer
                nodes={filteredData.nodes}
                edges={filteredData.edges}
                onOpenMeeting={openMeeting}
              />
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

          {/* Truth Engine Contradiction Resolution Modal Overlay */}
          {showContradictionsDrawer && contradictions.length > 0 && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
              onMouseDown={e => {
                if (e.target === e.currentTarget) setShowContradictionsDrawer(false)
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Conflicting statements"
                className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#09090e] border border-white/[0.05] rounded-2xl shadow-[0_32px_96px_rgba(0,0,0,0.9)] overflow-hidden animate-slide-up text-white"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04] bg-white/[0.01]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                      <ShieldAlert size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white tracking-wide">
                          Conflicting statements
                        </h3>
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/90 border border-amber-500/15">
                          {contradictions.length} Conflict{contradictions.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Statements from different meetings that disagree. Keep the newer one, or
                        dismiss the conflict.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {contradictions.length > 1 && (
                      <button
                        onClick={handleResolveAll}
                        disabled={resolvingAll || resolvingId !== null}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        <span>
                          {resolvingAll
                            ? 'Resolving…'
                            : `Keep newer for all (${contradictions.length})`}
                        </span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowContradictionsDrawer(false)}
                      className="w-8 h-8 rounded-lg hover:bg-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                      title="Close"
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Conflict Cards List */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 sovereign-scrollbar">
                  {contradictions.map((c, i) => (
                    <div
                      key={c.id || i}
                      className="p-5 rounded-xl bg-[#101018]/60 border border-white/[0.04] hover:border-white/[0.07] transition-all space-y-4"
                    >
                      {/* Conflict Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-semibold text-zinc-300">
                          Conflict #{i + 1}
                        </span>
                        <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/15 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          {typeof c.confidence === 'number' && c.confidence > 0
                            ? `${Math.round(Math.min(c.confidence, 1) * 100)}% confidence`
                            : 'Detected conflict'}
                        </span>
                      </div>

                      {/* Bitemporal Timeline Diff Branch */}
                      <div className="space-y-2.5">
                        {/* 1. Historical Assertion (Older) */}
                        <div className="p-3.5 rounded-xl bg-black/30 border border-white/[0.03] relative">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase font-mono font-medium text-zinc-500 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
                              Earlier statement
                            </span>
                            {c.meeting1?.title && (
                              <span className="text-[10px] text-zinc-500 font-mono">
                                from "{c.meeting1.title}"
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-400 line-through opacity-70 leading-relaxed pl-3 border-l-2 border-zinc-700/60">
                            {c.statement1 ||
                              (c.meeting1 ? `Decision in "${c.meeting1.title}"` : 'Previous fact')}
                          </p>
                        </div>

                        {/* Transition Connector */}
                        <div className="flex items-center justify-center gap-2 text-zinc-500 text-[10px] font-mono">
                          <div className="h-[1px] flex-1 bg-white/[0.03]" />
                          <span>conflicts with</span>
                          <div className="h-[1px] flex-1 bg-white/[0.03]" />
                        </div>

                        {/* 2. Newer Decision (Active) */}
                        <div className="p-3.5 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/15 relative">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase font-mono font-medium text-emerald-400 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Newer statement
                            </span>
                            {c.meeting2?.title && (
                              <span className="text-[10px] text-emerald-300/70 font-mono">
                                from "{c.meeting2.title}"
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-200 font-medium leading-relaxed pl-3 border-l-2 border-emerald-500/60">
                            {c.statement2 ||
                              (c.meeting2
                                ? `Updated in "${c.meeting2.title}"`
                                : 'Superseding decision')}
                          </p>
                        </div>
                      </div>

                      {/* Action Dock */}
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="text-[11px] text-zinc-500 italic">
                          Keeping the newer statement marks it as current and hides this conflict.
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            className="py-1.5 px-3 rounded-lg text-xs font-medium bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400 hover:text-white border border-white/[0.04] transition-colors"
                            disabled={resolvingId === c.id || resolvingAll}
                            onClick={() => handleResolveContradiction(c, 'dismiss')}
                            title="Hide this conflict without choosing a statement"
                          >
                            Dismiss
                          </button>

                          <button
                            className="py-1.5 px-4 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                            disabled={resolvingId === c.id || resolvingAll}
                            onClick={() => handleResolveContradiction(c, 'supersede')}
                          >
                            <CheckCircle2 size={13} />
                            <span>{resolvingId === c.id ? 'Saving…' : 'Keep newer statement'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
