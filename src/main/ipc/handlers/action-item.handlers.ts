/**
 * Action Item IPC Handlers
 *
 * 8 handlers following the pattern from entity.handlers.ts.
 * Includes sync queue integration and webhook dispatch.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { Logger } from '../../services/Logger'
import {
  createActionItem,
  getActionItemsByMeeting,
  getActionItemsByStatus,
  updateActionItem,
  deleteActionItem,
  getOverdueActionItems,
  getActionItemStats,
} from '../../database/crud/action-items'
import { extractFromTranscript } from '../../services/ActionItemService'
import type { IPCResponse } from '../../../types/ipc'

const log = Logger.create('ActionItemHandlers')

/**
 * Register all action item IPC handlers
 */
export function registerActionItemHandlers(): void {
  // actionItem:list — Get action items, optionally filtered
  ipcMain.handle(
    'actionItem:list',
    async (_, params?: { meetingId?: string; status?: string }): Promise<IPCResponse> => {
      try {
        let items
        if (params?.meetingId) {
          items = getActionItemsByMeeting(params.meetingId)
        } else if (params?.status) {
          items = getActionItemsByStatus(params.status)
        } else {
          items = getActionItemsByStatus('open')
        }
        return { success: true, data: items }
      } catch (error) {
        log.error('actionItem:list failed', error)
        return {
          success: false,
          error: {
            code: 'ACTION_ITEM_LIST_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // actionItem:create — Create a new action item
  ipcMain.handle(
    'actionItem:create',
    async (
      _,
      params: {
        meeting_id: string
        text: string
        assignee?: string
        deadline?: number
        priority?: string
      }
    ): Promise<IPCResponse> => {
      try {
        const item = createActionItem({
          meeting_id: params.meeting_id,
          text: params.text,
          assignee: params.assignee || null,
          deadline: params.deadline !== undefined ? params.deadline : null,
          priority: (params.priority as 'low' | 'normal' | 'high' | 'critical') || 'normal',
          source: 'manual',
        })

        // Sync is handled automatically by SyncManager's dirty-table interval

        // Push event to renderer
        const mainWindow = BrowserWindow.getAllWindows().find(
          w => !w.isDestroyed() && w.getBounds().width > 400
        )
        if (mainWindow) {
          mainWindow.webContents.send('event:actionItemDetected', {
            meetingId: params.meeting_id,
            items: [{ text: item.text, type: 'ACTION_ITEM', confidence: 1.0 }],
            timestamp: Math.floor(Date.now() / 1000),
          })
        }

        // Dispatch webhook (fire-and-forget)
        import('../../services/WebhookDispatchService')
          .then(({ dispatchWebhookEvent }) =>
            dispatchWebhookEvent('action_item.created', {
              id: item.id,
              meeting_id: item.meeting_id,
              text: item.text,
              assignee: item.assignee,
              priority: item.priority,
            })
          )
          .catch(() => {})

        return { success: true, data: item }
      } catch (error) {
        log.error('actionItem:create failed', error)
        return {
          success: false,
          error: {
            code: 'ACTION_ITEM_CREATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // actionItem:update — Update an action item
  ipcMain.handle(
    'actionItem:update',
    async (
      _,
      params: { id: string; updates: import('../../../types/features').UpdateActionItemInput }
    ): Promise<IPCResponse> => {
      try {
        const item = updateActionItem(params.id, params.updates)

        // Sync is handled automatically by SyncManager's dirty-table interval

        // Dispatch webhook if status changed to completed
        if (params.updates.status === 'completed') {
          import('../../services/WebhookDispatchService')
            .then(({ dispatchWebhookEvent }) =>
              dispatchWebhookEvent('action_item.completed', {
                id: item.id,
                meeting_id: item.meeting_id,
                text: item.text,
                status: item.status,
              })
            )
            .catch(() => {})
        }

        return { success: true, data: item }
      } catch (error) {
        log.error('actionItem:update failed', error)
        return {
          success: false,
          error: {
            code: 'ACTION_ITEM_UPDATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // actionItem:delete — Delete an action item
  ipcMain.handle('actionItem:delete', async (_, params: { id: string }): Promise<IPCResponse> => {
    try {
      deleteActionItem(params.id)

      // Sync is handled automatically by SyncManager's dirty-table interval

      return { success: true, data: undefined }
    } catch (error) {
      log.error('actionItem:delete failed', error)
      return {
        success: false,
        error: {
          code: 'ACTION_ITEM_DELETE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // actionItem:extract — Full post-meeting extraction pipeline
  ipcMain.handle(
    'actionItem:extract',
    async (_, params: { meetingId: string }): Promise<IPCResponse> => {
      try {
        const items = await extractFromTranscript(params.meetingId)
        return { success: true, data: items }
      } catch (error) {
        log.error('actionItem:extract failed', error)
        return {
          success: false,
          error: {
            code: 'ACTION_ITEM_EXTRACT_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // actionItem:getOverdue — Get all overdue action items
  ipcMain.handle('actionItem:getOverdue', async (): Promise<IPCResponse> => {
    try {
      const items = getOverdueActionItems()
      return { success: true, data: items }
    } catch (error) {
      log.error('actionItem:getOverdue failed', error)
      return {
        success: false,
        error: {
          code: 'ACTION_ITEM_OVERDUE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // actionItem:stats — Get aggregate stats
  ipcMain.handle('actionItem:stats', async (): Promise<IPCResponse> => {
    try {
      const stats = getActionItemStats()
      return { success: true, data: stats }
    } catch (error) {
      log.error('actionItem:stats failed', error)
      return {
        success: false,
        error: {
          code: 'ACTION_ITEM_STATS_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // actionItem:extractRealTime — Extract action items from a text chunk (live during recording)
  ipcMain.handle(
    'actionItem:extractRealTime',
    async (_, params: { text: string; meetingId: string }): Promise<IPCResponse> => {
      try {
        const { extractRealTime } = await import('../../services/ActionItemService')
        const items = extractRealTime(params.text)
        if (items.length > 0) {
          // Push to renderer
          const mainWindow = BrowserWindow.getAllWindows().find(
            w => !w.isDestroyed() && w.getBounds().width > 400
          )
          if (mainWindow) {
            mainWindow.webContents.send('event:actionItemDetected', {
              meetingId: params.meetingId,
              items,
              timestamp: Math.floor(Date.now() / 1000),
            })
          }
        }
        return { success: true, data: items }
      } catch (error) {
        log.error('actionItem:extractRealTime failed', error)
        return {
          success: false,
          error: {
            code: 'ACTION_ITEM_REALTIME_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  log.info('Action item handlers registered')
}
