/**
 * The note editor keeps each meeting's document in its own IndexedDB database
 * (`bluearkive-<meetingId>`, see NoteEditor). Deleting a meeting removes its
 * rows from SQLite in the main process, but nothing removed that database —
 * so the notes of deleted meetings stayed on disk indefinitely.
 *
 * This reconciles the two stores: any note document whose meeting no longer
 * exists is deleted. Safe to call at any time.
 */

const DOC_PREFIX = 'bluearkive-'
const MEETING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function removeOrphanedNoteDocuments(): Promise<number> {
  const api = window.electronAPI
  if (!api?.meeting || typeof indexedDB?.databases !== 'function') return 0

  // Only trust "not found" answers while the database is demonstrably working;
  // if it failed to open, every lookup fails and nothing may be deleted.
  const probe = await api.meeting.list({ limit: 1 }).catch(() => null)
  if (!probe?.success) return 0

  let removed = 0
  for (const { name } of await indexedDB.databases()) {
    if (!name?.startsWith(DOC_PREFIX)) continue
    const meetingId = name.slice(DOC_PREFIX.length)
    if (!MEETING_ID.test(meetingId)) continue

    const result = await api.meeting.get({ meetingId }).catch(() => null)
    const gone = result?.success === false && /not found/i.test(result.error?.message ?? '')
    if (!gone) continue

    await new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = request.onerror = request.onblocked = () => resolve()
    })
    removed++
  }
  return removed
}
