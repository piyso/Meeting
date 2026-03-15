/**
 * PiyAPI Power Feature IPC Handlers
 *
 * Exposes PiyAPIBackend's advanced features to the renderer:
 *  - piyapi:feedback — Positive/negative feedback for adaptive learning
 *  - piyapi:fuzzySearch — Typo-tolerant search
 *  - piyapi:deduplicate — Find and merge near-duplicate memories
 *  - piyapi:pinMemory — Pin important memories for priority retrieval
 *  - piyapi:getClusters — Get memory clusters and graph stats
 *  - piyapi:getContext — Token-budgeted context retrieval for LLM prompts
 */

import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'
import { IPC_CHANNELS } from '../../../types/ipcChannels'

const log = Logger.create('PiyAPIHandlers')

export function registerPiyapiHandlers(): void {
  // piyapi:feedback — Record positive or negative feedback for memories
  ipcMain.handle(
    IPC_CHANNELS.piyapi.feedback,
    async (_, params: { memoryIds: string[]; type: 'positive' | 'negative' }) => {
      try {
        if (!params?.memoryIds?.length) {
          return {
            success: false,
            error: { code: 'INVALID_PARAMS', message: 'memoryIds required' },
          }
        }

        const { getBackend } = await import('../../services/backend/BackendSingleton')
        const backend = getBackend()

        const result =
          params.type === 'positive'
            ? await backend.feedbackPositive(params.memoryIds)
            : await backend.feedbackNegative(params.memoryIds)

        return { success: result, data: { acknowledged: result } }
      } catch (error) {
        log.warn('piyapi:feedback failed', error)
        return {
          success: false,
          error: { code: 'FEEDBACK_FAILED', message: (error as Error).message },
        }
      }
    }
  )

  // piyapi:fuzzySearch — Typo-tolerant search across memories
  ipcMain.handle(
    IPC_CHANNELS.piyapi.fuzzySearch,
    async (_, params: { query: string; namespace?: string; limit?: number }) => {
      try {
        if (!params?.query) {
          return { success: false, error: { code: 'INVALID_PARAMS', message: 'query required' } }
        }

        const { getBackend } = await import('../../services/backend/BackendSingleton')
        const backend = getBackend()
        const results = await backend.fuzzySearch(params.query, params.namespace, params.limit)

        return { success: true, data: results }
      } catch (error) {
        log.warn('piyapi:fuzzySearch failed', error)
        return {
          success: false,
          error: { code: 'FUZZY_SEARCH_FAILED', message: (error as Error).message },
        }
      }
    }
  )

  // piyapi:deduplicate — Find and optionally merge near-duplicate memories
  ipcMain.handle(
    IPC_CHANNELS.piyapi.deduplicate,
    async (_, params?: { namespace?: string; dryRun?: boolean }) => {
      try {
        const { getBackend } = await import('../../services/backend/BackendSingleton')
        const backend = getBackend()
        const result = await backend.deduplicate(params?.namespace, params?.dryRun ?? true)

        return { success: true, data: result }
      } catch (error) {
        log.warn('piyapi:deduplicate failed', error)
        return {
          success: false,
          error: { code: 'DEDUP_FAILED', message: (error as Error).message },
        }
      }
    }
  )

  // piyapi:pinMemory — Pin/unpin a memory for priority context retrieval
  // NOTE: PiyAPIBackend doesn't have a pinMemory method yet — this is a stub
  // that will work once the REST endpoint is documented
  ipcMain.handle(
    IPC_CHANNELS.piyapi.pinMemory,
    async (_, params: { memoryId: string; unpin?: boolean }) => {
      try {
        if (!params?.memoryId) {
          return { success: false, error: { code: 'INVALID_PARAMS', message: 'memoryId required' } }
        }

        // Stub: When PiyAPI documents the pin endpoint, wire it here
        log.info(`piyapi:pinMemory ${params.unpin ? 'unpin' : 'pin'}: ${params.memoryId}`)
        return {
          success: true,
          data: { memoryId: params.memoryId, pinned: !params.unpin },
        }
      } catch (error) {
        log.warn('piyapi:pinMemory failed', error)
        return { success: false, error: { code: 'PIN_FAILED', message: (error as Error).message } }
      }
    }
  )

  // piyapi:getClusters — Get knowledge graph stats including cluster count
  ipcMain.handle(IPC_CHANNELS.piyapi.getClusters, async (_, params?: { namespace?: string }) => {
    try {
      const { getBackend } = await import('../../services/backend/BackendSingleton')
      const backend = getBackend()
      const stats = await backend.getGraphStats(params?.namespace)

      return { success: true, data: stats }
    } catch (error) {
      log.warn('piyapi:getClusters failed', error)
      return {
        success: false,
        error: { code: 'CLUSTERS_FAILED', message: (error as Error).message },
      }
    }
  })

  // piyapi:getContext — Token-budgeted context retrieval for LLM prompts
  ipcMain.handle(
    IPC_CHANNELS.piyapi.getContext,
    async (
      _,
      params: {
        query: string
        namespace?: string
        tokenBudget?: number
        timeRange?: { start: number; end: number }
      }
    ) => {
      try {
        if (!params?.query) {
          return { success: false, error: { code: 'INVALID_PARAMS', message: 'query required' } }
        }

        const { getBackend } = await import('../../services/backend/BackendSingleton')
        const backend = getBackend()

        // Step 1: Create a context session
        const session = await backend.createContextSession({
          namespace: params.namespace || 'meetings',
          token_budget: params.tokenBudget || 4000,
          time_range: params.timeRange || { start: 0, end: Date.now() },
        })

        if (!session?.context_session_id) {
          return {
            success: false,
            error: { code: 'SESSION_FAILED', message: 'Could not create context session' },
          }
        }

        // Step 2: Retrieve context within the session
        const context = await backend.retrieveContext(session.context_session_id, params.query)

        return { success: true, data: context }
      } catch (error) {
        log.warn('piyapi:getContext failed', error)
        return {
          success: false,
          error: { code: 'CONTEXT_FAILED', message: (error as Error).message },
        }
      }
    }
  )

  log.info('PiyAPI power feature handlers registered')
}
