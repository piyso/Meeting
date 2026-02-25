import { ipcMain } from 'electron'
import { PiyAPIBackend } from '../../services/backend/PiyAPIBackend'

// Shared backend instance — set token via graph:setToken or reuse from sync
let sharedBackend: PiyAPIBackend | null = null

export function getBackend(): PiyAPIBackend {
  if (!sharedBackend) {
    sharedBackend = new PiyAPIBackend()
  }
  return sharedBackend
}

export function setGraphBackendToken(token: string, userId: string): void {
  getBackend().setAccessToken(token, userId)
}

export function registerGraphHandlers(): void {
  // graph:get — Get knowledge graph (requires cloud PiyAPI)
  ipcMain.handle('graph:get', async (_, params) => {
    try {
      const backend = getBackend()
      const isHealthy = await backend.healthCheck()

      if (!isHealthy) {
        // Offline mode — return empty graph
        return {
          success: true,
          data: {
            nodes: [],
            edges: [],
            stats: { totalNodes: 0, totalEdges: 0 },
          },
        }
      }

      // Online — fetch from PiyAPI
      const graph = await backend.getGraph(
        params?.namespace || 'meetings',
        params?.maxHops || 2
      )
      return { success: true, data: graph }
    } catch (error) {
      return {
        success: true,
        data: {
          nodes: [],
          edges: [],
          stats: { totalNodes: 0, totalEdges: 0 },
        },
      }
    }
  })

  // graph:getContradictions — Get decisions that changed across meetings
  ipcMain.handle('graph:getContradictions', async (_, params) => {
    try {
      const backend = getBackend()
      const isHealthy = await backend.healthCheck()

      if (!isHealthy) {
        return { success: true, data: { contradictions: [] } }
      }

      const graph = await backend.getGraph(
        params?.namespace || 'meetings',
        1
      )
      const contradictions =
        graph.edges?.filter((e: any) => e.type === 'contradicts') || []
      return { success: true, data: { contradictions } }
    } catch {
      return { success: true, data: { contradictions: [] } }
    }
  })
}
