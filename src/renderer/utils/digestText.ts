/**
 * A meeting digest arrives from the main process as text written by the
 * language model: "- " lines for the summary points, the decisions and the
 * action items ("- Name: task"). These turn that text into what the digest
 * panel renders.
 */

export interface DigestDecision {
  text: string
  changed?: boolean
  previousValue?: string
}

export interface DigestActionItem {
  id?: string
  text: string
  /** Empty when the model named nobody */
  assignee: string
  dueDate?: string
  completed: boolean
}

/** Shown by the main process in place of a section the model could not produce. */
const UNAVAILABLE = /^⚠️?\s*AI unavailable/i

const NOTHING_FOUND =
  /^(?:none|n\/a|nothing|no (?:final |clear |specific |explicit )?(?:action items?|decisions?|tasks?)\b.*|there (?:are|were) no\b.*)[.!]?$/i

/** Whether the main process reported this section as not generated (as opposed to empty). */
export function isDigestSectionUnavailable(text: unknown): boolean {
  return typeof text === 'string' && UNAVAILABLE.test(text.trim())
}

/** The items of a model-written list, without bullet marks, numbering or emphasis. */
export function digestLines(text: string | null | undefined): string[] {
  if (!text) return []
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/^(?:[-*•–—]+|\d{1,2}[.)])\s+/, '')
      .replace(/\*\*|__/g, '')
      .trim()
    if (!line || UNAVAILABLE.test(line) || NOTHING_FOUND.test(line)) continue
    // A heading the model added ("Key points:"), not an item.
    if (/:$/.test(line) && line.split(/\s+/).length <= 5) continue
    lines.push(line)
  }
  return lines
}

/** Already-structured data (an array, or JSON text of one) is passed through. */
function structured(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text.startsWith('[')) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function parseDecisions(value: unknown): DigestDecision[] {
  const items = structured(value)
  if (items) {
    return items.flatMap(item => {
      if (typeof item === 'string') return item.trim() ? [{ text: item.trim() }] : []
      if (item && typeof item === 'object' && typeof (item as DigestDecision).text === 'string') {
        return [item as DigestDecision]
      }
      return []
    })
  }
  return typeof value === 'string' ? digestLines(value).map(text => ({ text })) : []
}

/** "Name: task" → who and what. A line without a short leading name has no assignee. */
function splitAssignee(line: string): { assignee: string; text: string } {
  const match = /^\[?([^:\]]{1,40})\]?:\s+(.+)$/.exec(line)
  const name = match?.[1]?.trim() ?? ''
  const task = match?.[2]?.trim() ?? ''
  if (!name || !task || name.split(/\s+/).length > 4) return { assignee: '', text: line }
  return { assignee: name, text: task }
}

export function parseActionItems(value: unknown): DigestActionItem[] {
  const items = structured(value)
  if (items) {
    return items.flatMap(item => {
      if (typeof item === 'string') {
        return item.trim() ? [{ ...splitAssignee(item.trim()), completed: false }] : []
      }
      if (item && typeof item === 'object' && typeof (item as DigestActionItem).text === 'string') {
        const action = item as Partial<DigestActionItem> & { text: string }
        return [{ ...action, assignee: action.assignee ?? '', completed: !!action.completed }]
      }
      return []
    })
  }
  if (typeof value !== 'string') return []
  return digestLines(value).map(line => ({ ...splitAssignee(line), completed: false }))
}
