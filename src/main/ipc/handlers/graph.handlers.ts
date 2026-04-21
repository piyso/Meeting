import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'
import { getBackend } from '../../services/backend/BackendSingleton'

const log = Logger.create('GraphHandlers')

export function registerGraphHandlers(): void {
  // graph:get — Get knowledge graph (requires cloud PiyAPI + tier gate)
  ipcMain.handle('graph:get', async (_, params) => {
    try {
      // Tier gate: check knowledgeGraph access
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.knowledgeGraph) {
        return {
          success: true,
          data: {
            nodes: [],
            edges: [],
            stats: { totalNodes: 0, totalEdges: 0 },
            blocked: true,
            reason: 'Knowledge Graph requires Starter or Pro plan',
            interactive: false,
          },
        }
      }

      const backend = getBackend()
      const health = await backend.healthCheck()

      if (health.status !== 'healthy') {
        // Offline mode — return empty graph
        return {
          success: true,
          data: {
            nodes: [],
            edges: [],
            stats: { totalNodes: 0, totalEdges: 0 },
            interactive: features.knowledgeGraphInteractive,
          },
        }
      }

      // Online — fetch from PiyAPI
      // M-17 AUDIT: Cap maxHops to prevent expensive deep traversals
      const graph = await backend.getGraph(
        params?.namespace || 'meetings',
        Math.min(params?.maxHops || 2, 5)
      )
      return {
        success: true,
        data: {
          ...graph,
          interactive: features.knowledgeGraphInteractive,
        },
      }
    } catch (error) {
      log.error('Failed to fetch graph', error)
      return {
        success: false,
        error: {
          code: 'GRAPH_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        },
      }
    }
  })

  // graph:getContradictions — Get decisions that changed across meetings (Pro+ only)
  ipcMain.handle('graph:getContradictions', async (_, params) => {
    try {
      // Tier gate: contradictions require interactive KG (Pro+)
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.knowledgeGraphInteractive) {
        return {
          success: true,
          data: [],
        }
      }

      const backend = getBackend()
      const health = await backend.healthCheck()

      if (health.status !== 'healthy') {
        return { success: true, data: [] }
      }

      const graph = await backend.getGraph(params?.namespace || 'meetings', 1)
      const contradictionEdges =
        graph.edges?.filter((e: { type: string }) => e.type === 'contradicts') || []

      // Transform edges into the Contradiction shape the frontend expects
      const contradictions = contradictionEdges.map(
        (
          e: {
            source: string
            target: string
            weight?: number | string
            metadata?: Record<string, unknown>
          },
          idx: number
        ) => {
          const sourceNode = graph.nodes?.find((n: { id: string }) => n.id === e.source)
          const targetNode = graph.nodes?.find((n: { id: string }) => n.id === e.target)
          return {
            id: `contra-${idx}`,
            type: 'contradicts' as const,
            meeting1: sourceNode ? { id: e.source, title: sourceNode.label || '' } : null,
            meeting2: targetNode ? { id: e.target, title: targetNode.label || '' } : null,
            statement1: (e.metadata?.statement1 as string) || '',
            statement2: (e.metadata?.statement2 as string) || '',
            confidence:
              typeof e.weight === 'string' ? parseFloat(e.weight) || 0.5 : e.weight || 0.5,
            detectedAt: Date.now(),
          }
        }
      )

      return { success: true, data: contradictions }
    } catch (err) {
      log.error('Contradiction check failed', err)
      return {
        success: false,
        error: {
          code: 'CONTRADICTIONS_FETCH_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
          timestamp: Date.now(),
        },
      }
    }
  })

  // graph:traverse — Deep graph traversal from a specific node (Pro+)
  ipcMain.handle('graph:traverse', async (_, params) => {
    try {
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.knowledgeGraphInteractive) {
        return {
          success: true,
          data: {
            nodes: [],
            edges: [],
            blocked: true,
            reason: 'Graph traversal requires Pro plan',
          },
        }
      }

      if (!params?.nodeId) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'nodeId is required',
            timestamp: Date.now(),
          },
        }
      }

      const backend = getBackend()
      const health = await backend.healthCheck()
      if (health.status !== 'healthy') {
        return { success: true, data: { nodes: [], edges: [] } }
      }

      try {
        const result = await backend.traverseGraph(params.nodeId, Math.min(params.maxDepth || 2, 5))
        return { success: true, data: result }
      } catch {
        // Fallback: use getGraph with higher maxHops
        const graph = await backend.getGraph(
          params.namespace || 'meetings',
          Math.min(params.maxDepth || 3, 5)
        )
        return { success: true, data: graph }
      }
    } catch (err) {
      log.error('Graph traversal failed', err)
      return {
        success: false,
        error: {
          code: 'GRAPH_TRAVERSE_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
          timestamp: Date.now(),
        },
      }
    }
  })

  // graph:search — Search entities in the knowledge graph (Pro+)
  ipcMain.handle('graph:search', async (_, params) => {
    try {
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.knowledgeGraph) {
        return {
          success: true,
          data: { results: [], blocked: true, reason: 'Graph search requires Pro plan' },
        }
      }

      if (!params?.query) {
        return {
          success: false,
          error: {
            code: 'INVALID_PARAMS',
            message: 'query is required',
            timestamp: Date.now(),
          },
        }
      }

      const backend = getBackend()
      const health = await backend.healthCheck()
      if (health.status !== 'healthy') {
        return { success: true, data: { results: [] } }
      }

      if (typeof backend.searchGraph === 'function') {
        const results = await backend.searchGraph(
          params.query.substring(0, 500),
          params.namespace || 'meetings',
          Math.min(params.limit || 20, 100)
        )
        return { success: true, data: { results } }
      }

      // Fallback: fetch full graph and filter locally
      const graph = await backend.getGraph(params.namespace || 'meetings', 1)
      const query = params.query.toLowerCase()
      const matchingNodes = (graph.nodes || []).filter((n: { label?: string }) =>
        n.label?.toLowerCase().includes(query)
      )
      return { success: true, data: { results: matchingNodes } }
    } catch (err) {
      log.error('Graph search failed', err)
      return {
        success: false,
        error: {
          code: 'GRAPH_SEARCH_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
          timestamp: Date.now(),
        },
      }
    }
  })

  // graph:getStats — Get graph statistics (Pro+)
  ipcMain.handle('graph:getStats', async () => {
    try {
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      if (!features.knowledgeGraph) {
        return {
          success: true,
          data: {
            totalNodes: 0,
            totalEdges: 0,
            clusters: 0,
            blocked: true,
            reason: 'Graph stats require Pro plan',
          },
        }
      }

      const backend = getBackend()
      const health = await backend.healthCheck()
      if (health.status !== 'healthy') {
        return {
          success: true,
          data: { totalNodes: 0, totalEdges: 0, clusters: 0 },
        }
      }

      if (typeof backend.getGraphStats === 'function') {
        const stats = await backend.getGraphStats('meetings')
        return { success: true, data: stats }
      }

      // Fallback: compute from full graph
      const graph = await backend.getGraph('meetings', 1)
      return {
        success: true,
        data: {
          totalNodes: graph.nodes?.length || 0,
          totalEdges: graph.edges?.length || 0,
          clusters: 0,
        },
      }
    } catch (err) {
      log.error('Graph stats failed', err)
      return {
        success: false,
        error: {
          code: 'GRAPH_STATS_FAILED',
          message: err instanceof Error ? err.message : 'Unknown error',
          timestamp: Date.now(),
        },
      }
    }
  })

  // graph:contradictionPreview — Starter-friendly preview (count only, no full graph)
  // Returns contradiction count so Starter users can see "3 changed decisions — 🔓 Pro"
  ipcMain.handle('graph:contradictionPreview', async (_, params) => {
    try {
      const { getCloudAccessManager } = await import('../../services/CloudAccessManager')
      const cam = getCloudAccessManager()
      const features = await cam.getFeatureAccess()

      // Only need basic cloud access (Starter+), not full KG
      if (!features.cloudSync) {
        return {
          success: true,
          data: { count: 0, available: false },
        }
      }

      const backend = getBackend()
      const health = await backend.healthCheck()
      if (health.status !== 'healthy') {
        return { success: true, data: { count: 0, available: false } }
      }

      const graph = await backend.getGraph(params?.namespace || 'meetings', 1)
      const contradictionCount =
        graph.edges?.filter((e: { type: string }) => e.type === 'contradicts').length || 0

      return {
        success: true,
        data: {
          count: contradictionCount,
          available: true,
          // Starter: show count only. Pro: can access full contradictions via graph:getContradictions
          requiresPro: !features.knowledgeGraphInteractive,
          preview:
            contradictionCount > 0
              ? `${contradictionCount} decision${contradictionCount === 1 ? '' : 's'} changed this week`
              : null,
        },
      }
    } catch (err) {
      log.debug('Contradiction preview failed', err)
      return {
        success: true,
        data: { count: 0, available: false },
      }
    }
  })
}
