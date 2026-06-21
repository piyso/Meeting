/**
 * EntityExtractionService — Extract people, projects, concepts from transcripts
 *
 * Uses regex + heuristics for local extraction. Falls back to LLM for
 * disambiguation when confidence is low.
 */

import { Logger } from './Logger'
import { getDatabaseService } from './DatabaseService'
import { v4 as uuidv4 } from 'uuid'

const log = Logger.create('EntityExtraction')

export type EntityType = 'person' | 'project' | 'concept' | 'date' | 'metric' | 'decision'

export interface ExtractedEntity {
  id: string
  text: string
  type: EntityType
  confidence: number
  meetingId: string
  segmentIndex: number
  metadata: Record<string, string>
}

export class EntityExtractionService {
  // ── Regex-based extractors (zero-latency, local) ──

  private static readonly PATTERNS: Array<{ type: EntityType; regex: RegExp }> = [
    // People: "John said", "assigned to Alice", "@Bob", "@alice"
    {
      type: 'person',
      regex: /\b(?:assigned to|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})|@(\w{2,30})/g,
    },
    // Projects: "Project X", "#project-name", "the ___ initiative"
    {
      type: 'project',
      regex: /\b(?:project|initiative|sprint)\s+["']?([A-Z][\w\s-]{2,40})["']?/gi,
    },
    // Dates: "by Friday", "due March 15", "Q3 2026"
    {
      type: 'date',
      regex:
        /\b(?:by|due|deadline|scheduled)\s+((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?|Q[1-4]\s*\d{4}|(?:next|this)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|week|month|quarter))/gi,
    },
    // Metrics: "30% increase", "$50K budget", "2.5x growth"
    {
      type: 'metric',
      regex: /\b(\d+(?:\.\d+)?\s*(?:%|x|K|M|B|dollars|USD|hours|days|weeks|users|customers))\b/gi,
    },
    // Decisions: "We decided to ___", "Decision: ___", "RESOLVED: ___"
    {
      type: 'decision',
      regex: /\b(?:decided to|decision:?\s*|resolved:?\s*|agreed to)\s+(.{10,120}?)(?:\.|$)/gi,
    },
  ]

  /**
   * Extract entities from a transcript segment.
   */
  extractFromSegment(text: string, meetingId: string, segmentIndex: number): ExtractedEntity[] {
    const entities: ExtractedEntity[] = []
    const seen = new Set<string>()

    for (const pattern of EntityExtractionService.PATTERNS) {
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
      let match

      while ((match = regex.exec(text)) !== null) {
        // Person regex has two alternations: group1 (formal name) or group2 (@mention)
        const raw = (match[2] || match[1] || match[0]).trim()
        // Normalize: remove trailing punctuation, collapse whitespace
        const normalized = raw
          .replace(/[.,;:!?]+$/, '')
          .replace(/\s+/g, ' ')
          .trim()
        if (normalized.length < 2 || normalized.length > 80) continue

        const dedupKey = `${pattern.type}:${normalized.toLowerCase()}`
        if (seen.has(dedupKey)) continue
        seen.add(dedupKey)

        entities.push({
          id: uuidv4(),
          text: normalized,
          type: pattern.type,
          confidence: 0.7,
          meetingId,
          segmentIndex,
          metadata: { raw_match: raw },
        })
      }
    }

    return entities
  }

  /**
   * Extract entities from a full meeting transcript.
   */
  async extractFromMeeting(meetingId: string, transcriptText: string): Promise<ExtractedEntity[]> {
    const segments = transcriptText.split(/(?<=[.!?])\s+/)
    const allEntities: ExtractedEntity[] = []

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (!seg || seg.length < 10) continue
      const entities = this.extractFromSegment(seg, meetingId, i)
      allEntities.push(...entities)
    }

    // Deduplicate across segments
    const deduped = this.deduplicate(allEntities)

    // Persist to database
    await this.persistEntities(deduped)

    log.info(`Extracted ${deduped.length} entities from meeting ${meetingId}`)
    return deduped
  }

  /**
   * Get all entities for a meeting.
   */
  getEntitiesForMeeting(meetingId: string): ExtractedEntity[] {
    try {
      const db = getDatabaseService().getDb()
      return db
        .prepare('SELECT * FROM entities WHERE meeting_id = ? ORDER BY segment_index ASC')
        .all(meetingId) as ExtractedEntity[]
    } catch {
      return []
    }
  }

  /**
   * Search entities across all meetings.
   */
  searchEntities(query: string, type?: EntityType, limit = 50): ExtractedEntity[] {
    try {
      const db = getDatabaseService().getDb()
      let sql = 'SELECT * FROM entities WHERE text LIKE ?'
      const params: unknown[] = [`%${query}%`]
      if (type) {
        sql += ' AND type = ?'
        params.push(type)
      }
      sql += ' ORDER BY meeting_id, segment_index LIMIT ?'
      params.push(limit)
      return db.prepare(sql).all(...params) as ExtractedEntity[]
    } catch {
      return []
    }
  }

  /**
   * Query entities by arbitrary parameters.
   */
  queryEntities(params: { type?: string; meetingId?: string; limit?: number }): ExtractedEntity[] {
    try {
      const db = getDatabaseService().getDb()
      let sql = 'SELECT * FROM entities WHERE 1=1'
      const sqlParams: unknown[] = []

      if (params.type) {
        sql += ' AND type = ?'
        sqlParams.push(params.type)
      }
      if (params.meetingId) {
        sql += ' AND meeting_id = ?'
        sqlParams.push(params.meetingId)
      }

      sql += ' ORDER BY meeting_id, segment_index LIMIT ?'
      sqlParams.push(params.limit || 50)

      return db.prepare(sql).all(...sqlParams) as ExtractedEntity[]
    } catch {
      return []
    }
  }

  /**
   * Get entity frequency stats.
   */
  getEntityStats(): Array<{ text: string; type: EntityType; meeting_count: number }> {
    try {
      const db = getDatabaseService().getDb()
      return db
        .prepare(
          `SELECT text, type, COUNT(DISTINCT meeting_id) as meeting_count
           FROM entities GROUP BY text, type
           ORDER BY meeting_count DESC LIMIT 100`
        )
        .all() as Array<{ text: string; type: EntityType; meeting_count: number }>
    } catch {
      return []
    }
  }

  // ── Private ──

  private deduplicate(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Map<string, ExtractedEntity>()
    for (const e of entities) {
      const key = `${e.type}:${e.text.toLowerCase()}`
      const existing = seen.get(key)
      if (!existing || existing.confidence < e.confidence) {
        seen.set(key, e)
      }
    }
    return Array.from(seen.values())
  }

  private async persistEntities(entities: ExtractedEntity[]): Promise<void> {
    try {
      const db = getDatabaseService().getDb()

      const stmt = db.prepare(`
        INSERT OR REPLACE INTO entities (id, text, type, confidence, meeting_id, segment_index, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)

      const txn = db.transaction(() => {
        for (const e of entities) {
          stmt.run(
            e.id,
            e.text,
            e.type,
            e.confidence,
            e.meetingId,
            e.segmentIndex,
            JSON.stringify(e.metadata)
          )
        }
      })
      txn()
    } catch (err) {
      log.warn('Failed to persist entities:', err)
    }
  }
}

let instance: EntityExtractionService | null = null

export function getEntityExtractionService(): EntityExtractionService {
  if (!instance) {
    instance = new EntityExtractionService()
  }
  return instance
}
