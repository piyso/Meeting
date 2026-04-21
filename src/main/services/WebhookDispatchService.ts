/**
 * Webhook Dispatch Service
 *
 * HMAC-SHA256 signed payloads, PHI sanitization, exponential backoff retries.
 * All dispatch calls are fire-and-forget — webhook failures NEVER block
 * the primary operation.
 */

import crypto from 'crypto'
import { Logger } from './Logger'
import type { WebhookEventType, WebhookDeliveryStatus } from '../../types/features'
import { getActiveWebhooksByEvent, countActiveWebhooks } from '../database/crud/webhooks'
import {
  createDelivery,
  updateDeliveryStatus,
  getFailedDeliveries,
  markDeliveryDead,
} from '../database/crud/webhook-deliveries'

const log = Logger.create('WebhookDispatch')

/** Retry delays in seconds: [1, 5, 15, 60, 300] */
const RETRY_DELAYS = [1, 5, 15, 60, 300]
const MAX_RETRIES = RETRY_DELAYS.length

/**
 * Sign a payload with HMAC-SHA256.
 */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Sanitize PHI from payload before dispatching.
 * Uses PHIDetectionService.maskPHI() for substitution.
 */
async function sanitizePayload(payload: string): Promise<string> {
  try {
    const { PHIDetectionService } = await import('./PHIDetectionService')
    const result = PHIDetectionService.detectPHI(payload)
    if (result.hasPHI && result.maskedText) {
      return result.maskedText
    }
    return payload
  } catch {
    // PHIDetectionService not available — return as-is
    return payload
  }
}

/**
 * Dispatch a webhook event to all active subscribers.
 * This is the MAIN entry point — call this from handlers.
 *
 * IMPORTANT: This is fire-and-forget. Errors are logged, not thrown.
 */
export async function dispatchWebhookEvent(
  eventType: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const webhooks = getActiveWebhooksByEvent(eventType)
    if (webhooks.length === 0) return

    log.debug(`Dispatching ${eventType} to ${webhooks.length} webhook(s)`)

    for (const webhook of webhooks) {
      // Sanitize PHI
      const rawPayload = JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        data,
      })
      const sanitizedPayload = await sanitizePayload(rawPayload)

      // Create delivery record
      const delivery = createDelivery({
        webhook_id: webhook.id,
        event_type: eventType,
        payload: sanitizedPayload,
      })

      // Sign payload
      const signature = signPayload(sanitizedPayload, webhook.secret)

      // Send request (non-blocking)
      sendWebhookRequest(webhook.url, sanitizedPayload, signature, eventType, delivery.id, 0).catch(
        err => {
          log.debug(`Webhook delivery ${delivery.id} failed:`, err)
        }
      )
    }
  } catch (err) {
    log.error(`dispatchWebhookEvent(${eventType}) failed:`, err)
  }
}

/**
 * Send HTTP request to webhook endpoint.
 */
async function sendWebhookRequest(
  url: string,
  payload: string,
  signature: string,
  eventType: string,
  deliveryId: string,
  retryCount: number
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString()

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BlueArkive-Signature': `sha256=${signature}`,
        'X-BlueArkive-Event': eventType,
        'X-BlueArkive-Delivery': deliveryId,
        'X-BlueArkive-Timestamp': timestamp,
        'User-Agent': 'BlueArkive-Webhook/1.0',
      },
      body: payload,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const responseBody = await response.text().catch(() => '')

    if (response.ok) {
      // Success
      updateDeliveryStatus(
        deliveryId,
        'success',
        response.status,
        responseBody.substring(0, 1024),
        null
      )
      log.debug(`Webhook delivery ${deliveryId} succeeded (${response.status})`)
    } else if (response.status >= 400 && response.status < 500) {
      // Client error — no retry (bad URL, unauthorized, etc.)
      updateDeliveryStatus(
        deliveryId,
        'dead' as WebhookDeliveryStatus,
        response.status,
        responseBody.substring(0, 1024),
        null
      )
      log.warn(`Webhook delivery ${deliveryId} rejected (${response.status}) — no retry`)
    } else {
      // Server error — retry with backoff
      scheduleRetry(
        url,
        payload,
        signature,
        eventType,
        deliveryId,
        retryCount,
        response.status,
        responseBody
      )
    }
  } catch (err) {
    // Network error, timeout — retry
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    scheduleRetry(url, payload, signature, eventType, deliveryId, retryCount, null, errorMessage)
  }
}

/**
 * Schedule a retry with exponential backoff.
 */
function scheduleRetry(
  url: string,
  payload: string,
  signature: string,
  eventType: string,
  deliveryId: string,
  retryCount: number,
  statusCode: number | null,
  responseBody: string
): void {
  if (retryCount >= MAX_RETRIES) {
    // Mark as dead — max retries exceeded
    markDeliveryDead(deliveryId)
    log.warn(`Webhook delivery ${deliveryId} marked dead after ${MAX_RETRIES} retries`)
    return
  }

  const delaySec = RETRY_DELAYS[retryCount] ?? 300
  const nextRetryAt = Math.floor(Date.now() / 1000) + delaySec

  updateDeliveryStatus(
    deliveryId,
    'failed',
    statusCode,
    responseBody.substring(0, 1024),
    nextRetryAt
  )

  log.debug(`Webhook delivery ${deliveryId} failed, retry ${retryCount + 1} in ${delaySec}s`)

  // Schedule retry
  // M-12 AUDIT: .unref() prevents pending retry timers from blocking shutdown
  const retryTimer = setTimeout(() => {
    sendWebhookRequest(url, payload, signature, eventType, deliveryId, retryCount + 1).catch(() => {
      // Already handled in sendWebhookRequest
    })
  }, delaySec * 1000)
  retryTimer.unref()
}

/**
 * Process failed deliveries that are due for retry.
 * Called periodically (e.g., every 60 seconds from auto-sync).
 */
export function processRetryQueue(): void {
  try {
    const pending = getFailedDeliveries()
    if (pending.length === 0) return

    log.info(`Processing ${pending.length} pending webhook retries`)

    // Import synchronously (already required at module level via static import)

    const { getWebhookById } = require('../database/crud/webhooks') as {
      getWebhookById: (
        id: string
      ) => { id: string; url: string; secret: string; is_active: number } | null
    }

    for (const delivery of pending) {
      try {
        const webhook = getWebhookById(delivery.webhook_id)
        if (!webhook || !webhook.is_active) {
          markDeliveryDead(delivery.id)
          continue
        }

        const signature = signPayload(delivery.payload, webhook.secret)

        sendWebhookRequest(
          webhook.url,
          delivery.payload,
          signature,
          delivery.event_type,
          delivery.id,
          delivery.retry_count
        ).catch(() => {
          // Handled internally
        })
      } catch {
        // Webhook may have been deleted
      }
    }
  } catch (err) {
    log.error('Retry queue processing failed:', err)
  }
}

/**
 * Test a webhook by sending a test event.
 */
export async function testWebhook(webhookId: string): Promise<{
  success: boolean
  status?: number
}> {
  const { getWebhookById } = await import('../database/crud/webhooks')
  const webhook = getWebhookById(webhookId)
  if (!webhook) throw new Error('Webhook not found')

  const testPayload = JSON.stringify({
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook delivery from BlueArkive' },
  })

  const signature = signPayload(testPayload, webhook.secret)

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BlueArkive-Signature': `sha256=${signature}`,
        'X-BlueArkive-Event': 'test',
        'X-BlueArkive-Delivery': `test-${Date.now()}`,
        'User-Agent': 'BlueArkive-Webhook/1.0',
      },
      body: testPayload,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    return { success: response.ok, status: response.status }
  } catch (err) {
    log.warn(`Test webhook failed for ${webhookId}:`, err)
    return { success: false }
  }
}

/**
 * Check tier limit for webhook creation.
 */
export async function checkWebhookLimit(): Promise<{
  allowed: boolean
  current: number
  limit: number
}> {
  try {
    const { getCloudAccessManager } = await import('./CloudAccessManager')
    const cam = getCloudAccessManager()
    const features = await cam.getFeatureAccess()

    if (!features.webhooks) {
      return { allowed: false, current: 0, limit: 0 }
    }

    const current = countActiveWebhooks()
    const limit = features.webhookLimit

    return {
      allowed: limit === Infinity || current < limit,
      current,
      limit: limit === Infinity ? -1 : limit,
    }
  } catch {
    // Default: allow
    return { allowed: true, current: 0, limit: -1 }
  }
}
