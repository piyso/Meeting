/**
 * Quick notes typed into the floating widget.
 *
 * A meeting's notes live in the note editor's document (Yjs, in IndexedDB);
 * the saved note row is a copy of it. So a quick note has to end up inside
 * that document, or the editor's next save would overwrite it:
 *
 * - If the editor for the meeting is open, it inserts the line itself.
 * - Otherwise the line is appended to the saved note right away (search and
 *   export see it immediately) and parked here until the editor next opens
 *   that meeting and takes it into the document.
 */

/** Window event the note editor listens for. */
export const QUICK_NOTE_EVENT = 'quick-note'

export interface QuickNoteRequest {
  meetingId: string
  text: string
  /** Set by the note editor once it has inserted the line. */
  handled: boolean
}

const KEY_PREFIX = 'quick-notes-pending-'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function readPending(meetingId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY_PREFIX + meetingId) || '[]')
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : []
  } catch {
    return []
  }
}

/** Park a quick note for the editor to pick up when it next opens the meeting. */
export function queuePendingQuickNote(meetingId: string, text: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + meetingId, JSON.stringify([...readPending(meetingId), text]))
  } catch {
    // Storage unavailable — the line is still in the saved note.
  }
}

/** Take (and clear) the quick notes parked for a meeting. */
export function takePendingQuickNotes(meetingId: string): string[] {
  const pending = readPending(meetingId)
  if (pending.length > 0) {
    try {
      localStorage.removeItem(KEY_PREFIX + meetingId)
    } catch {
      // ignore
    }
  }
  return pending
}

/**
 * Save a quick note for a meeting. Returns false when it could not be stored.
 */
export async function saveQuickNote(meetingId: string, rawText: string): Promise<boolean> {
  const text = rawText.trim()
  if (!text) return false

  // The open editor owns the note document — let it take the line.
  const request: QuickNoteRequest = { meetingId, text, handled: false }
  window.dispatchEvent(new CustomEvent<QuickNoteRequest>(QUICK_NOTE_EVENT, { detail: request }))
  if (request.handled) return true

  // No editor open for this meeting: write to the saved note now and leave
  // the line for the editor to merge into its document later.
  const html = `<p>${escapeHtml(text)}</p>`
  const existing = await window.electronAPI?.note?.get({ meetingId })
  const note = existing?.success ? existing.data?.[0] : undefined
  const res = note
    ? await window.electronAPI?.note?.update({
        noteId: note.id,
        updates: { original_text: `${note.original_text ?? ''}${html}` },
      })
    : await window.electronAPI?.note?.create({
        meetingId,
        timestamp: Math.floor(Date.now() / 1000),
        text: html,
      })
  if (!res?.success) return false
  queuePendingQuickNote(meetingId, text)
  return true
}
