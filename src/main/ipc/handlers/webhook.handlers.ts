/**
 * Webhook IPC Handlers
 *
 * 6 handlers for webhook management.
 * Includes tier limit enforcement.
 */

import { ipcMain } from 'electron'
import { Logger } from '../../services/Logger'
import {
  createWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
} from '../../database/crud/webhooks'
import { getDeliveriesByWebhook } from '../../database/crud/webhook-deliveries'
import { testWebhook, checkWebhookLimit } from '../../services/WebhookDispatchService'
import type { IPCResponse } from '../../../types/ipc'
import type { WebhookEventType } from '../../../types/features'

const log = Logger.create('WebhookHandlers')

/**
 * Register all webhook IPC handlers
 */
export function registerWebhookHandlers(): void {
  // webhook:list — List all webhooks
  ipcMain.handle('webhook:list', async (): Promise<IPCResponse> => {
    try {
      const webhooks = listWebhooks()
      // Strip secrets from response (security: secrets should never reach renderer)
      const safe = webhooks.map(w => ({
        ...w,
        secret: '••••••••', // Masked
      }))
      return { success: true, data: safe }
    } catch (error) {
      log.error('webhook:list failed', error)
      return {
        success: false,
        error: {
          code: 'WEBHOOK_LIST_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // webhook:create — Create a new webhook with tier limit check
  ipcMain.handle(
    'webhook:create',
    async (
      _,
      params: { url: string; events: string[]; description?: string }
    ): Promise<IPCResponse> => {
      try {
        // Check tier limit
        const limit = await checkWebhookLimit()
        if (!limit.allowed) {
          return {
            success: false,
            error: {
              code: 'WEBHOOK_LIMIT_REACHED',
              message: `Webhook limit reached (${limit.current}/${limit.limit}). Upgrade your plan for more webhooks.`,
              timestamp: Date.now(),
            },
          }
        }

        // Validate URL
        try {
          new URL(params.url)
        } catch {
          return {
            success: false,
            error: {
              code: 'INVALID_URL',
              message: 'Invalid webhook URL',
              timestamp: Date.now(),
            },
          }
        }

        // Validate event types
        const validEvents: WebhookEventType[] = [
          'meeting.started',
          'meeting.completed',
          'transcript.ready',
          'action_item.created',
          'action_item.completed',
          'digest.generated',
          'sentiment.alert',
        ]
        const invalidEvents = params.events.filter(e => !(validEvents as string[]).includes(e))
        if (invalidEvents.length > 0) {
          return {
            success: false,
            error: {
              code: 'INVALID_EVENTS',
              message: `Invalid event types: ${invalidEvents.join(', ')}`,
              timestamp: Date.now(),
            },
          }
        }

        const webhook = createWebhook({
          url: params.url,
          events: params.events as WebhookEventType[],
          description: params.description || null,
        })

        return { success: true, data: { ...webhook, secret: '••••••••' } }
      } catch (error) {
        log.error('webhook:create failed', error)
        return {
          success: false,
          error: {
            code: 'WEBHOOK_CREATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // webhook:update — Update a webhook
  ipcMain.handle(
    'webhook:update',
    async (
      _,
      params: { id: string; updates: import('../../../types/features').UpdateWebhookInput }
    ): Promise<IPCResponse> => {
      try {
        const webhook = updateWebhook(params.id, params.updates)
        return { success: true, data: { ...webhook, secret: '••••••••' } }
      } catch (error) {
        log.error('webhook:update failed', error)
        return {
          success: false,
          error: {
            code: 'WEBHOOK_UPDATE_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  // webhook:delete — Delete a webhook
  ipcMain.handle('webhook:delete', async (_, params: { id: string }): Promise<IPCResponse> => {
    try {
      deleteWebhook(params.id)
      return { success: true, data: undefined }
    } catch (error) {
      log.error('webhook:delete failed', error)
      return {
        success: false,
        error: {
          code: 'WEBHOOK_DELETE_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // webhook:test — Test a webhook
  ipcMain.handle('webhook:test', async (_, params: { id: string }): Promise<IPCResponse> => {
    try {
      const result = await testWebhook(params.id)
      return { success: true, data: result }
    } catch (error) {
      log.error('webhook:test failed', error)
      return {
        success: false,
        error: {
          code: 'WEBHOOK_TEST_FAILED',
          message: (error as Error).message,
          timestamp: Date.now(),
        },
      }
    }
  })

  // webhook:getDeliveries — Get delivery history for a webhook
  ipcMain.handle(
    'webhook:getDeliveries',
    async (_, params: { webhookId: string; limit?: number }): Promise<IPCResponse> => {
      try {
        const deliveries = getDeliveriesByWebhook(params.webhookId, params.limit || 50)
        return { success: true, data: deliveries }
      } catch (error) {
        log.error('webhook:getDeliveries failed', error)
        return {
          success: false,
          error: {
            code: 'WEBHOOK_DELIVERIES_FAILED',
            message: (error as Error).message,
            timestamp: Date.now(),
          },
        }
      }
    }
  )

  log.info('Webhook handlers registered')
}
