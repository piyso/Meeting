/**
 * Lists written by the language model (summary points, decisions, action
 * items): reading them line by line, and merging the lists taken from
 * consecutive parts of one long meeting.
 */

const NOTHING_FOUND =
  /^(?:none|n\/a|nothing|no (?:final |clear |specific |explicit )?(?:action items?|decisions?|tasks?)\b.*|there (?:are|were) no\b.*)[.!]?$/i

/** Lines of a model-written list, without bullet marks, numbering, emphasis or filler. */
export function parseBulletLines(text: string): string[] {
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw
      .trim()
      .replace(/^(?:[-*•–—]+|\d{1,2}[.)])\s+/, '')
      .replace(/\*\*|__/g, '')
      .trim()
    if (!line) continue
    if (NOTHING_FOUND.test(line)) continue
    // A heading the model added ("Key points:", "ACTION ITEMS:"), not an item.
    if (/:$/.test(line) && line.split(/\s+/).length <= 5) continue
    lines.push(line)
  }
  return lines
}

/** Longer than any single list item: the model has run several together, or is looping. */
const MAX_ITEM_CHARS = 280

/** Where one "Name: task." ends and the next "Name: task" begins on the same line. */
const NEXT_ACTION = /(?<=[.!?;])\s+(?=\p{Lu}[\p{L}'’-]{1,24}(?:\s\p{Lu}[\p{L}'’-]{1,24})?:\s)/u

/**
 * Action items as "Name: task", one per line. The model sometimes brackets
 * the name, repeats the words of the requested format ("Marco: Task
 * description: …"), or writes several items on one line.
 */
export function parseActionLines(text: string): string[] {
  const items: string[] = []
  for (const line of parseBulletLines(text)) {
    for (const piece of line.split(NEXT_ACTION)) {
      // "Dana: None" — a name with nothing to do.
      if (/^[^:]{1,60}:\s*(?:none|n\/a|nothing)?\.?\s*$/i.test(piece.trim())) continue
      const item = piece
        .replace(/^\[([^\]]{1,60})\]\s*:?\s*/, '$1: ')
        .replace(/^([^:]{1,60}):\s*(?:task description|task|action item)\s*:\s*/i, '$1: ')
        .replace(/\s+NONE\.?$/, '')
        .trim()
      if (!item || NOTHING_FOUND.test(item)) continue
      // "Marco: Decision: the launch moves" — a decision filed under a name, not a task.
      if (/^[^:]{1,60}:\s*decisions?\s*:/i.test(item)) continue
      // A name on its own ("Dana"), cut off before the task.
      if (!item.includes(':') && item.split(/\s+/).length < 3) continue
      if (item.length > MAX_ITEM_CHARS) continue
      items.push(item)
    }
  }
  return items
}

/** Decisions, one per line, without the "Decision:" or speaker label some answers carry. */
export function parseDecisionLines(text: string, speakers: readonly string[] = []): string[] {
  const names = new Set(speakers.map(name => name.trim().toLowerCase()).filter(Boolean))
  const items: string[] = []
  for (const line of parseBulletLines(text)) {
    let item = line.replace(/^decisions?\s*:\s*/i, '')
    const label = /^([^:]{1,40}):\s+(.+)$/.exec(item)
    if (label?.[1] && label[2] && names.has(label[1].trim().toLowerCase())) {
      item = label[2].replace(/^decisions?\s*:\s*/i, '')
    }
    item = item.trim()
    if (!item || item.length > MAX_ITEM_CHARS) continue
    // A question is not a decision; small models sometimes echo transcript lines.
    if (item.endsWith('?')) continue
    items.push(item.charAt(0).toUpperCase() + item.slice(1))
  }
  return items
}

/** The first sentences of `text` that fit in `maxChars`, as one paragraph. */
export function leadingSentences(text: string, maxChars: number): string {
  const paragraph = parseBulletLines(text).join(' ').replace(/\s+/g, ' ').trim()
  if (paragraph.length <= maxChars) return paragraph
  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)/g) ?? []
  let kept = ''
  for (const sentence of sentences) {
    if ((kept + sentence).trimEnd().length > maxChars) break
    kept += sentence
  }
  return kept.trim() || `${paragraph.slice(0, maxChars).trimEnd()}…`
}

const STOPWORDS = new Set(
  'a an and are as at be by for from has have i in is it of on or our that the their this to was we were will with'.split(
    ' '
  )
)

interface ListItem {
  line: string
  /** The line in lower case without punctuation, for comparing wording. */
  plain: string
  words: Set<string>
  /** Words with a digit in them: "42,000" and "26,000" are different facts. */
  numbers: Set<string>
  /** What stands before a leading colon — the assignee of an action item. */
  label: string
}

function plainText(text: string): string {
  return text
    .toLowerCase()
    .replace(/(?<=\d)[.,](?=\d)/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function listItem(line: string): ListItem {
  const plain = plainText(line)
  const words = plain.split(' ').filter(word => word && !STOPWORDS.has(word))
  const label = /^([^:]{1,40}):\s/.exec(line)?.[1] ?? ''
  return {
    line,
    plain,
    words: new Set(words),
    numbers: new Set(words.filter(word => /\d/.test(word))),
    label: label.split(/\s+/).length <= 3 ? plainText(label) : '',
  }
}

/**
 * Whether two items say the same thing: nearly every word of the shorter one
 * is in the longer one, or the shorter one is the longer one cut short (an
 * answer that ran into the length limit ends mid-item).
 */
function saysTheSame(a: ListItem, b: ListItem): boolean {
  const [small, large] = a.words.size <= b.words.size ? [a, b] : [b, a]
  if (small.words.size === 0) return false
  if (large.plain.startsWith(small.plain)) return true
  if (small.words.size < 3) return false
  // The same task for two people is two tasks; the same sentence with another
  // figure in it is another fact.
  if (small.label && large.label && small.label !== large.label) return false
  for (const number of small.numbers) if (!large.numbers.has(number)) return false
  let shared = 0
  for (const word of small.words) if (large.words.has(word)) shared++
  return shared / small.words.size >= 0.8
}

/**
 * One list from the lists of consecutive parts, in meeting order. An item
 * that repeats an earlier one (a recap at the end of the meeting, or a point
 * straddling two parts) is kept once, in its more detailed wording.
 */
export function mergeBulletLists(lists: readonly (readonly string[])[]): string[] {
  const merged: ListItem[] = []
  for (const list of lists) {
    for (const line of list) {
      const item = listItem(line)
      if (item.words.size === 0) continue
      const index = merged.findIndex(earlier => saysTheSame(earlier, item))
      if (index < 0) merged.push(item)
      else if (item.words.size > (merged[index]?.words.size ?? 0)) merged[index] = item
    }
  }
  return merged.map(item => item.line)
}

export function formatBulletList(lines: readonly string[]): string {
  return lines.map(line => `- ${line}`).join('\n')
}
