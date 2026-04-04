/**
 * CRUD Operations for Webhooks Table
 */

import { getDatabase } from '../connection'
import type {
  Webhook,
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookEventType,
} from '../../../types/features'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

/**
 * Create a new webhook with auto-generated HMAC secret
 */
export function createWebhook(input: CreateWebhookInput): Webhook {
  const db = getDatabase()
  const id = input.id || uuidv4()
  const secret = input.secret || crypto.randomBytes(32).toString('hex')
  const now = Math.floor(Date.now() / 1000)

  db.prepare(
    `INSERT INTO webhooks (id, url, events, secret, description, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, input.url, JSON.stringify(input.events), secret, input.description ?? null, now, now)

  return db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Webhook
}

/**
 * List all webhooks
 */
export function listWebhooks(): Webhook[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as Webhook[]
}

/**
 * Get webhook by ID
 */
export function getWebhookById(id: string): Webhook | null {
  const db = getDatabase()
  return db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Webhook | null
}

/**
 * Update a webhook
 */
export function updateWebhook(id: string, updates: UpdateWebhookInput): Webhook {
  const db = getDatabase()
  const fields: string[] = ['updated_at = ?']
  const values: unknown[] = [Math.floor(Date.now() / 1000)]

  if (updates.url !== undefined) {
    fields.push('url = ?')
    values.push(updates.url)
  }
  if (updates.events !== undefined) {
    fields.push('events = ?')
    values.push(JSON.stringify(updates.events))
  }
  if (updates.description !== undefined) {
    fields.push('description = ?')
    values.push(updates.description)
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(updates.is_active)
  }

  values.push(id)
  db.prepare(`UPDATE webhooks SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const updated = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as Webhook | null
  if (!updated) throw new Error(`Webhook not found: ${id}`)
  return updated
}

/**
 * Delete a webhook (cascade deletes deliveries via FK)
 */
export function deleteWebhook(id: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM webhooks WHERE id = ?').run(id)
}

/**
 * Get all active webhooks subscribed to a specific event type.
 * Uses JSON LIKE for filtering (events is a JSON array stored as TEXT).
 */
export function getActiveWebhooksByEvent(eventType: WebhookEventType): Webhook[] {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT * FROM webhooks
       WHERE is_active = 1 AND events LIKE ?`
    )
    .all(`%"${eventType}"%`) as Webhook[]
}

/**
 * Count active webhooks (for tier limit enforcement)
 */
export function countActiveWebhooks(): number {
  const db = getDatabase()
  const row = db.prepare('SELECT COUNT(*) as count FROM webhooks WHERE is_active = 1').get() as {
    count: number
  }
  return row.count
}
