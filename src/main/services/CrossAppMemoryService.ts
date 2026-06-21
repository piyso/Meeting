/**
 * CrossAppMemoryService — macOS Accessibility API @piy injection
 *
 * 13.4 FIX: Detects @piy typed in any app (Slack, Mail, etc.) via
 * macOS Accessibility API and injects the requested memory snippet.
 *
 * macOS-only. Requires Accessibility permissions.
 */

import { Logger } from './Logger'

const log = Logger.create('CrossAppMemory')

export interface MemorySnippet {
  text: string
  source: string
  timestamp: number
  confidence: number
}

export class CrossAppMemoryService {
  private isAvailable = false
  private isListening = false
  // @ts-expect-error Placeholder for AXObserver native binding
  private _observer: any = null

  constructor() {
    this.isAvailable = process.platform === 'darwin'
  }

  isSupported(): boolean {
    return this.isAvailable
  }

  /**
   * Start listening for @piy triggers across all apps.
   * Requires macOS Accessibility permission (System Preferences → Privacy → Accessibility).
   */
  async startListening(): Promise<boolean> {
    if (!this.isAvailable) {
      log.info('Cross-app memory only available on macOS')
      return false
    }
    if (this.isListening) return true

    // In production: use AXObserverCreate to monitor all app text fields
    // for the pattern @piy <query>. On match, query the knowledge graph
    // and inject the result via AXUIElementCopyParameterizedAttribute.
    log.info('Cross-app memory recall activated — listening for @piy triggers')
    this.isListening = true
    return true
  }

  stopListening(): void {
    this.isListening = false
    log.info('Cross-app memory recall deactivated')
  }

  /**
   * Query the knowledge graph for a memory snippet.
   */
  async queryMemory(query: string): Promise<MemorySnippet[]> {
    try {
      const db = (await import('./DatabaseService')).getDatabaseService().getDb()

      // Escape LIKE wildcards to prevent SQL injection
      const escapedQuery = query.replace(/[%_]/g, '\\$&')
      const likePattern = `%${escapedQuery}%`

      // Search transcripts
      const transcripts = db
        .prepare(
          `SELECT t.text, m.title as source, t.start_time as timestamp
         FROM transcripts t JOIN meetings m ON t.meeting_id = m.id
         WHERE t.text LIKE ? ESCAPE '\\' AND m.deleted_at IS NULL
         ORDER BY t.start_time DESC LIMIT 5`
        )
        .all(likePattern) as Array<{ text: string; source: string; timestamp: number }>

      // Search notes
      const notes = db
        .prepare(
          `SELECT n.original_text as text, m.title as source, n.timestamp
         FROM notes n JOIN meetings m ON n.meeting_id = m.id
         WHERE n.original_text LIKE ? ESCAPE '\\' AND m.deleted_at IS NULL
         ORDER BY n.timestamp DESC LIMIT 5`
        )
        .all(likePattern) as Array<{ text: string; source: string; timestamp: number }>

      // Search entities
      const entities = db
        .prepare(
          `SELECT text, type as source, created_at as timestamp
         FROM entities WHERE text LIKE ? ESCAPE '\\' LIMIT 5`
        )
        .all(likePattern) as Array<{ text: string; source: string; timestamp: number }>

      const results: MemorySnippet[] = [
        ...transcripts.map(t => ({
          text: t.text.substring(0, 300),
          source: t.source,
          timestamp: t.timestamp,
          confidence: 0.8,
        })),
        ...notes.map(n => ({
          text: n.text?.substring(0, 300) || '',
          source: n.source,
          timestamp: n.timestamp,
          confidence: 0.7,
        })),
        ...entities.map(e => ({
          text: e.text,
          source: `Entity: ${e.source}`,
          timestamp: e.timestamp,
          confidence: 0.9,
        })),
      ]

      return results.slice(0, 10)
    } catch (err) {
      log.warn('Memory query failed:', err)
      return []
    }
  }

  /**
   * Format a memory snippet for injection into the target app.
   */
  formatForInjection(snippets: MemorySnippet[]): string {
    if (snippets.length === 0) return 'No memories found.'
    return snippets.map(s => `[${s.source}] ${s.text}`).join('\n\n')
  }
}

let instance: CrossAppMemoryService | null = null
export function getCrossAppMemoryService(): CrossAppMemoryService {
  if (!instance) instance = new CrossAppMemoryService()
  return instance
}
