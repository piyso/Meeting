/**
 * Action Item Service
 *
 * Three extraction strategies:
 *   1. Regex (real-time, <1ms) — uses LocalEntityExtractor
 *   2. Local LLM (post-meeting) — uses ModelManager
 *   3. Cloud AI (Pro+) — uses PiyAPI backend
 *
 * Following the dual-path pattern from entity.handlers.ts.
 */

import { Logger } from './Logger'
import type { ActionItem, CreateActionItemInput, ActionItemSource } from '../../types/features'
import { createActionItem, getActionItemsByMeeting } from '../database/crud/action-items'

const log = Logger.create('ActionItemService')

/** Minimal entity structure from LocalEntityExtractor */
interface ExtractedEntity {
  text: string
  type: string
  confidence: number
  startOffset: number
  endOffset: number
}

/**
 * Extract action items from transcript text using regex (real-time).
 * Uses existing LocalEntityExtractor.ACTION_ITEM pattern.
 */
export function extractRealTime(text: string): ExtractedEntity[] {
  try {
    // Lazy import to avoid circular dependency

    const { LocalEntityExtractor } = require('./LocalEntityExtractor')
    const extractor = new LocalEntityExtractor()
    const entities = extractor.extract(text)
    return entities.filter((e: ExtractedEntity) => e.type === 'ACTION_ITEM')
  } catch (err) {
    log.debug('Real-time extraction failed', err)
    return []
  }
}

/**
 * Parse assignee from action item text.
 * Looks for patterns like "@John", "John:", "assigned to John"
 */
function parseAssignee(text: string): string | null {
  // Pattern: @Name
  const atMatch = text.match(/@([A-Za-z]+(?:\s[A-Za-z]+)?)/)
  if (atMatch?.[1]) return atMatch[1]

  // Pattern: "Name:" at start
  const colonMatch = text.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*:/)
  if (colonMatch?.[1]) return colonMatch[1]

  // Pattern: "assigned to Name"
  const assignedMatch = text.match(/assigned?\s+to\s+([A-Za-z]+(?:\s[A-Za-z]+)?)/i)
  if (assignedMatch?.[1]) return assignedMatch[1]

  return null
}

/**
 * Parse deadline from action item text.
 * Returns epoch seconds or null.
 */
function parseDeadline(text: string): number | null {
  const lower = text.toLowerCase()

  // "by tomorrow"
  if (lower.includes('by tomorrow') || lower.includes('due tomorrow')) {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(17, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }

  // "by end of week" / "by friday"
  if (lower.includes('end of week') || lower.includes('by friday')) {
    const d = new Date()
    const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + daysUntilFriday)
    d.setHours(17, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }

  // "by next Monday"
  if (lower.includes('next monday')) {
    const d = new Date()
    const daysUntilMonday = (1 - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + daysUntilMonday)
    d.setHours(9, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  }

  return null
}

/**
 * Full post-meeting extraction using local LLM.
 * Calls ModelManager.generate() with structured prompt.
 */
export async function extractWithLLM(
  meetingId: string,
  transcriptText: string
): Promise<ActionItem[]> {
  try {
    const { getModelManager } = await import('./ModelManager')
    const modelManager = getModelManager()

    const prompt = `Extract action items from this meeting transcript. For each, output JSON: {"text": "...", "assignee": "Name or null", "priority": "low|normal|high|critical"}.

Transcript:
${transcriptText.substring(0, 4000)}

Action items (JSON array):`

    const response = await modelManager.generate({
      prompt,
      temperature: 0.2,
      maxTokens: 1024,
    })

    if (!response) return []

    // Parse JSON from LLM response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      text: string
      assignee?: string
      priority?: string
    }>

    const results: ActionItem[] = []
    for (const item of parsed) {
      if (!item.text || item.text.length < 5) continue
      const created = createActionItem({
        meeting_id: meetingId,
        text: item.text,
        assignee: item.assignee || null,
        priority: (item.priority as CreateActionItemInput['priority']) || 'normal',
        deadline: parseDeadline(item.text),
        source: 'llm_local' as ActionItemSource,
      })
      results.push(created)
    }

    log.info(`LLM extracted ${results.length} action items for meeting ${meetingId}`)
    return results
  } catch (err) {
    log.error('LLM extraction failed', err)
    return []
  }
}

/**
 * Cloud AI extraction (Pro+ tier).
 * Uses PiyAPI backend.ask() with structured prompt.
 */
export async function extractWithCloudAI(
  meetingId: string,
  transcriptText: string
): Promise<ActionItem[]> {
  try {
    const { getBackend } = await import('./backend/BackendSingleton')
    const backend = getBackend()

    const health = await backend.healthCheck()
    if (health.status !== 'healthy') {
      log.debug('Backend not healthy, skipping cloud extraction')
      return []
    }

    const answer = await backend.ask(
      `Extract action items from this meeting transcript. Return a JSON array of objects with fields: text, assignee, priority (low/normal/high/critical).

${transcriptText.substring(0, 6000)}`
    )

    if (!answer?.answer) return []

    // Parse JSON response
    const jsonMatch = answer.answer.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      text: string
      assignee?: string
      priority?: string
    }>

    const results: ActionItem[] = []
    for (const item of parsed) {
      if (!item.text || item.text.length < 5) continue
      const created = createActionItem({
        meeting_id: meetingId,
        text: item.text,
        assignee: item.assignee || null,
        priority: (item.priority as CreateActionItemInput['priority']) || 'normal',
        deadline: parseDeadline(item.text),
        source: 'llm_cloud' as ActionItemSource,
      })
      results.push(created)
    }

    // Ingest into knowledge graph
    if (results.length > 0) {
      try {
        const summary = results.map(r => `- ${r.text}`).join('\n')
        await backend.kgIngest(`Action items from meeting ${meetingId}:\n${summary}`)
      } catch {
        // Non-critical
      }
    }

    log.info(`Cloud extracted ${results.length} action items for meeting ${meetingId}`)
    return results
  } catch (err) {
    log.error('Cloud extraction failed', err)
    return []
  }
}

/**
 * Full extraction pipeline (called post-meeting).
 * Deduplicates across strategies.
 */
export async function extractFromTranscript(meetingId: string): Promise<ActionItem[]> {
  log.info(`Starting full extraction for meeting ${meetingId}`)

  // Get transcripts
  const { getTranscriptsByMeetingId } = await import('../database/crud/transcripts')
  const transcripts = getTranscriptsByMeetingId(meetingId)
  if (transcripts.length === 0) {
    log.debug('No transcripts found for meeting')
    return []
  }

  const fullText = transcripts.map(t => t.text).join(' ')

  // Check existing items to avoid duplicates
  const existing = getActionItemsByMeeting(meetingId)
  const existingTexts = new Set(existing.map(e => e.text.toLowerCase().trim()))

  // Strategy 1: Regex extraction
  const regexEntities = extractRealTime(fullText)
  const regexItems: ActionItem[] = []
  for (const entity of regexEntities) {
    const text = entity.text.trim()
    if (existingTexts.has(text.toLowerCase())) continue
    existingTexts.add(text.toLowerCase())
    regexItems.push(
      createActionItem({
        meeting_id: meetingId,
        text,
        assignee: parseAssignee(text),
        deadline: parseDeadline(text),
        source: 'regex',
      })
    )
  }

  // Strategy 2: Local LLM (filter duplicates)
  const llmItems = await extractWithLLM(meetingId, fullText)
  const newLlmItems = llmItems.filter(i => !existingTexts.has(i.text.toLowerCase().trim()))

  // Strategy 3: Cloud AI (Pro+ only, filter duplicates)
  let cloudItems: ActionItem[] = []
  try {
    const { getCloudAccessManager } = await import('./CloudAccessManager')
    const cam = getCloudAccessManager()
    const features = await cam.getFeatureAccess()
    if (features.cloudAI) {
      const all = await extractWithCloudAI(meetingId, fullText)
      cloudItems = all.filter(i => !existingTexts.has(i.text.toLowerCase().trim()))
    }
  } catch {
    // Not available
  }

  const allItems = [...existing, ...regexItems, ...newLlmItems, ...cloudItems]
  log.info(
    `Extraction complete: ${regexItems.length} regex, ${newLlmItems.length} LLM, ${cloudItems.length} cloud (${allItems.length} total)`
  )

  return allItems
}
