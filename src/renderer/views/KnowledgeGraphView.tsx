import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { GraphCanvas } from '../components/graph/GraphCanvas'
import '../components/graph/graph.css'
import { RefreshCw, AlertCircle, ChevronLeft } from 'lucide-react'
import type { GraphData, Contradiction, GraphNode } from '../../types/ipc'
import { IconButton } from '../components/ui/IconButton'
import { Button } from '../components/ui/Button'
import { ProTeaseOverlay } from '../components/ui/ProTeaseOverlay'

export default function KnowledgeGraphView() {
  const currentTier = useAppStore(s => s.currentTier)
  const isLocked = currentTier === 'free' || currentTier === 'starter'
  const navigate = useAppStore(s => s.navigate)
  const isOnline = useAppStore(s => s.isOnline)

  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [contradictions, setContradictions] = useState<Contradiction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)

  useEffect(() => {
    async function fetchGraphData() {
      setIsLoading(true)
      try {
        const [graphRes, contraRes] = await Promise.all([
          window.electronAPI.graph.get({ maxHops: 3 }),
          window.electronAPI.graph.getContradictions({}),
        ])

        if (graphRes.success && graphRes.data) {
          setGraphData(graphRes.data)
        } else {
          setError(graphRes.error?.message || 'Failed to load graph.')
        }

        if (contraRes.success && contraRes.data) {
          setContradictions(contraRes.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    fetchGraphData()
  }, [])

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node)
  }

  // Double click inside panel opens meeting detail view
  const openMeeting = (id: string) => {
    navigate('meeting-detail', id)
  }

  return (
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

        {!isOnline && <div className="graph-offline-badge">Offline Mode</div>}
      </header>

      <div className="graph-main-area relative">
        {isLocked && (
          <ProTeaseOverlay
            title="Unlock the Knowledge Graph"
            description={
              currentTier === 'starter'
                ? 'Interactive exploration is a Pro feature.'
                : 'Upgrade to visualize connections across all your meetings.'
            }
            targetTier="pro"
          />
        )}
        {/* Main Canvas Area */}
        <div
          className={`graph-canvas-container ${isLocked ? 'pointer-events-none opacity-40 blur-sm' : ''}`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)] gap-4 animate-fade-in">
              <RefreshCw size={28} className="animate-spin text-[var(--color-violet)] opacity-80" />
              <p className="tracking-wide font-medium">Mapping neural connections...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--color-rose)] gap-4 animate-slide-up bg-[rgba(244,63,94,0.05)] rounded-2xl border border-[rgba(244,63,94,0.1)] p-8 max-w-sm mx-auto mt-[10vh]">
              <AlertCircle size={32} />
              <p className="text-center">{error}</p>
            </div>
          ) : graphData ? (
            <GraphCanvas
              nodes={graphData.nodes}
              edges={graphData.edges}
              contradictions={contradictions}
              onNodeClick={handleNodeClick}
            />
          ) : null}
        </div>

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
                  onClick={() => openMeeting(selectedNode.id)}
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
  )
}
