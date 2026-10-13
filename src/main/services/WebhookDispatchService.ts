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
import {
  getActiveWebhooksByEvent,
  countActiveWebhooks,
  getWebhookById,
} from '../database/crud/webhooks'
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

/** Fields that identify or timestamp a record — never free text, never masked. */
const STRUCTURAL_KEY =
  /^(id|event|type|status|priority|source|timestamp)$|(_id|Id|_at|At|_time|Time)$/
const UUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE_VALUE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/

/**
 * Mask PHI in the free-text values of a payload.
 *
 * Only string values are touched, one at a time. Masking the serialized JSON
 * (as this used to) treats structure as text: a 10-digit epoch such as
 * `"deadline":1760262000` matched the phone-number pattern and came out as
 * `"deadline":***-***-****` — not JSON any more — and the digits at the end of
 * a UUID were masked as a national id number.
 */
export function maskPhiInPayload<T>(value: T, mask: (text: string) => string, key: string = ''): T {
  if (typeof value === 'string') {
    if (STRUCTURAL_KEY.test(key) || UUID_VALUE.test(value) || ISO_DATE_VALUE.test(value)) {
      return value
    }
    return mask(value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map(item => maskPhiInPayload(item, mask, key)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = maskPhiInPayload(child, mask, childKey)
    }
    return out as T
  }
  return value
}

/**
 * Sanitize PHI from event data before dispatching.
 */
async function sanitizeData(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const { PHIDetectionService } = await import('./PHIDetectionService')
    return maskPhiInPayload(data, text => {
      const result = PHIDetectionService.detectPHI(text)
      return result.hasPHI && result.maskedText ? result.maskedText : text
    })
  } catch {
    // PHIDetectionService not available — return as-is
    return data
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
): Promise<number> {
  try {
    const webhooks = getActiveWebhooksByEvent(eventType)
    if (webhooks.length === 0) return 0

    log.debug(`Dispatching ${eventType} to ${webhooks.length} webhook(s)`)

    ensureRetryLoop()

    // Sanitize PHI in the text fields, then serialize once for all subscribers.
    const sanitizedPayload = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: await sanitizeData(data),
    })

    for (const webhook of webhooks) {
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
    return webhooks.length
  } catch (err) {
    log.error(`dispatchWebhookEvent(${eventType}) failed:`, err)
    return 0
  }
}

/** True when at least one active webhook subscribes to the event. */
export function hasWebhookSubscribers(eventType: WebhookEventType): boolean {
  try {
    return getActiveWebhooksByEvent(eventType).length > 0
  } catch {
    return false
  }
}

/**
 * Dispatch an event without waiting for it. Never throws — a webhook problem
 * must not disturb whatever the app was doing when the event happened.
 */
export function emitWebhookEvent(eventType: WebhookEventType, data: Record<string, unknown>): void {
  void dispatchWebhookEvent(eventType, data).catch(err => {
    log.debug(`emitWebhookEvent(${eventType}) failed:`, err)
  })
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
    } else if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 429
    ) {
      // Client error — no retry (bad URL, unauthorized, etc.). A timeout (408)
      // or rate limit (429) is temporary and falls through to the retry below.
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
      scheduleRetry(deliveryId, retryCount, response.status, responseBody)
    }
  } catch (err) {
    // Network error, timeout — retry
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    scheduleRetry(deliveryId, retryCount, null, errorMessage)
  }
}

/**
 * Record a failed attempt and when it is next due (exponential backoff).
 */
function scheduleRetry(
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

  // The retry itself is sent by the retry loop, which reads due deliveries
  // from the database — so a retry still happens if the app is restarted in
  // the meantime (an in-memory timer here died with the process, and running
  // both would send the same delivery twice).
  ensureRetryLoop()
}

/** How often due retries are looked for. */
const RETRY_SCAN_INTERVAL_MS = 15_000
let retryLoop: ReturnType<typeof setInterval> | null = null
/** Deliveries with a request in flight — a scan must not send them again. */
const inFlightDeliveries = new Set<string>()

/** Start the retry loop (idempotent). Call at startup so retries left by the last run resume. */
export function ensureRetryLoop(): void {
  if (retryLoop) return
  retryLoop = setInterval(processRetryQueue, RETRY_SCAN_INTERVAL_MS)
  // M-12 AUDIT: .unref() prevents the loop from blocking shutdown
  retryLoop.unref()
}

/**
 * Process failed deliveries that are due for retry.
 * Called periodically (e.g., every 60 seconds from auto-sync).
 */
export function processRetryQueue(): void {
  try {
    const pending = getFailedDeliveries()
    if (pending.length === 0) return

    log.debug(`Processing ${pending.length} pending webhook retries`)

    for (const delivery of pending) {
      if (inFlightDeliveries.has(delivery.id)) continue
      try {
        const webhook = getWebhookById(delivery.webhook_id)
        if (!webhook || !webhook.is_active) {
          markDeliveryDead(delivery.id)
          continue
        }

        const signature = signPayload(delivery.payload, webhook.secret)

        inFlightDeliveries.add(delivery.id)
        sendWebhookRequest(
          webhook.url,
          delivery.payload,
          signature,
          delivery.event_type,
          delivery.id,
          delivery.retry_count
        )
          .catch(() => {
            // Handled internally
          })
          .finally(() => inFlightDeliveries.delete(delivery.id))
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
