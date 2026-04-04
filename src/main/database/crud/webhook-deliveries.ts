/**
 * CRUD Operations for Webhook Deliveries Table
 */

import { getDatabase } from '../connection'
import type {
  WebhookDelivery,
  CreateWebhookDeliveryInput,
  WebhookDeliveryStatus,
} from '../../../types/features'
import { v4 as uuidv4 } from 'uuid'

/**
 * Create a delivery record
 */
export function createDelivery(input: CreateWebhookDeliveryInput): WebhookDelivery {
  const db = getDatabase()
  const id = input.id || uuidv4()

  db.prepare(
    `INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status)
     VALUES (?, ?, ?, ?, 'pending')`
  ).run(id, input.webhook_id, input.event_type, input.payload)

  return db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(id) as WebhookDelivery
}

/**
 * Get deliveries for a webhook (most recent first)
 */
export function getDeliveriesByWebhook(webhookId: string, limit: number = 50): WebhookDelivery[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM webhook_deliveries
       WHERE webhook_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(webhookId, limit) as WebhookDelivery[]
}

/**
 * Update delivery status after an attempt
 */
export function updateDeliveryStatus(
  id: string,
  status: WebhookDeliveryStatus,
  statusCode: number | null,
  responseBody: string | null,
  nextRetryAt: number | null
): void {
  const db = getDatabase()
  if (status === 'success' || status === 'dead') {
    // Final state — don't increment retry_count
    db.prepare(
      `UPDATE webhook_deliveries
       SET status = ?, status_code = ?, response_body = ?, next_retry_at = NULL
       WHERE id = ?`
    ).run(status, statusCode, responseBody ? responseBody.substring(0, 1024) : null, id)
  } else {
    // Failure — increment retry_count and schedule next retry
    db.prepare(
      `UPDATE webhook_deliveries
       SET status = ?, status_code = ?, response_body = ?, retry_count = retry_count + 1, next_retry_at = ?
       WHERE id = ?`
    ).run(
      status,
      statusCode,
      responseBody ? responseBody.substring(0, 1024) : null,
      nextRetryAt,
      id
    )
  }
}

/**
 * Get all failed deliveries that are due for retry
 */
export function getFailedDeliveries(): WebhookDelivery[] {
  const db = getDatabase()
  const now = Math.floor(Date.now() / 1000)
  return db
    .prepare(
      `SELECT * FROM webhook_deliveries
       WHERE status = 'failed' AND next_retry_at IS NOT NULL AND next_retry_at <= ?
       ORDER BY next_retry_at ASC`
    )
    .all(now) as WebhookDelivery[]
}

/**
 * Mark a delivery as dead (max retries exceeded)
 */
export function markDeliveryDead(id: string): void {
  const db = getDatabase()
  db.prepare(
    `UPDATE webhook_deliveries
     SET status = 'dead', next_retry_at = NULL
     WHERE id = ?`
  ).run(id)
}
