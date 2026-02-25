/**
 * QueryQuotaManager — Tracks AI query usage for Starter tier (50/month)
 *
 * Blueprint §5.1 (L3019, L3068-3085):
 * - Starter plan: 50 AI queries per month
 * - Pro/Team/Enterprise: Unlimited
 * - Free: No cloud AI access
 * - When exhausted, fall back to local Qwen silently
 */

import { getDatabase } from '../database/connection'

interface QuotaStatus {
  used: number
  limit: number
  remaining: number
  resetsAt: string // ISO date of next month reset
  exhausted: boolean
}

export class QueryQuotaManager {
  private static readonly STARTER_LIMIT = 50

  /**
   * Check if user can make a cloud AI query.
   * Returns quota status and whether the query is allowed.
   */
  async checkQuota(
    tier: 'free' | 'starter' | 'pro' | 'team' | 'enterprise'
  ): Promise<QuotaStatus> {
    // Free tier: no cloud AI access at all
    if (tier === 'free') {
      return {
        used: 0,
        limit: 0,
        remaining: 0,
        resetsAt: this.getMonthResetDate(),
        exhausted: true,
      }
    }

    // Pro/Team/Enterprise: unlimited
    if (tier !== 'starter') {
      return {
        used: 0,
        limit: Infinity,
        remaining: Infinity,
        resetsAt: this.getMonthResetDate(),
        exhausted: false,
      }
    }

    // Starter tier: 50 queries/month
    const used = this.getMonthlyUsage()
    const remaining = Math.max(0, QueryQuotaManager.STARTER_LIMIT - used)

    return {
      used,
      limit: QueryQuotaManager.STARTER_LIMIT,
      remaining,
      resetsAt: this.getMonthResetDate(),
      exhausted: remaining <= 0,
    }
  }

  /**
   * Record a cloud AI query usage
   */
  recordUsage(): void {
    const db = getDatabase()
    const now = Math.floor(Date.now() / 1000)
    db.prepare(
      `INSERT INTO query_usage (timestamp, type) VALUES (?, 'cloud_ai')`
    ).run(now)
  }

  /**
   * Get usage count for current month
   */
  private getMonthlyUsage(): number {
    const db = getDatabase()
    const monthStart = this.getMonthStartTimestamp()

    const result = db
      .prepare(
        `SELECT COUNT(*) as count FROM query_usage WHERE timestamp >= ? AND type = 'cloud_ai'`
      )
      .get(monthStart) as { count: number } | undefined

    return result?.count ?? 0
  }

  /**
   * Get timestamp of current month start
   */
  private getMonthStartTimestamp(): number {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    return Math.floor(monthStart.getTime() / 1000)
  }

  /**
   * Get ISO date of when quota resets (first of next month)
   */
  private getMonthResetDate(): string {
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return nextMonth.toISOString()
  }

  /**
   * Ensure the query_usage table exists
   */
  static ensureTable(): void {
    const db = getDatabase()
    db.exec(`
      CREATE TABLE IF NOT EXISTS query_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'cloud_ai'
      )
    `)
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_query_usage_timestamp ON query_usage(timestamp)`
    )
  }
}

// Singleton
let instance: QueryQuotaManager | null = null

export function getQueryQuotaManager(): QueryQuotaManager {
  if (!instance) {
    instance = new QueryQuotaManager()
  }
  return instance
}
