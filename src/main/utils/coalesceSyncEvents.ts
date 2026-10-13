/**
 * Reduce a batch of queued sync events to what actually needs uploading.
 *
 * Within one upload pass, creates are sent last (as a single batch) while
 * updates and deletes are sent as they are met. For a record that has both a
 * create and a later delete or update still queued — which happens when the
 * create failed once and is being retried — that order is wrong:
 *
 *  - the delete finds nothing to remove, then the create uploads the record:
 *    something the user deleted comes back in their cloud copy;
 *  - the update "creates" the new state, then the create adds the old one.
 *
 * So, per record, in queue order:
 *  - everything before the last delete is dropped (the delete still runs — an
 *    earlier attempt may have reached the server);
 *  - a create followed by updates becomes that one create, carrying the newest
 *    payload;
 *  - several updates become the newest update.
 */

export interface QueuedSyncEvent {
  id: string
  operation_type: string
  table_name: string
  record_id: string
  payload: string | null
}

export interface CoalescedSyncEvents<T extends QueuedSyncEvent> {
  /** Events to process, in their original relative order */
  events: T[]
  /** Queue rows made unnecessary by a later event for the same record */
  supersededIds: string[]
  /** Queue rows whose stored payload must be replaced (a create that absorbed updates) */
  payloadUpdates: Array<{ id: string; payload: string | null }>
}

export function coalesceSyncEvents<T extends QueuedSyncEvent>(
  queued: readonly T[]
): CoalescedSyncEvents<T> {
  const byRecord = new Map<string, T[]>()
  for (const event of queued) {
    const key = `${event.table_name}\u0000${event.record_id}`
    const group = byRecord.get(key)
    if (group) group.push(event)
    else byRecord.set(key, [event])
  }

  const supersededIds: string[] = []
  const payloadUpdates: Array<{ id: string; payload: string | null }> = []
  const replacement = new Map<string, T>()

  for (const group of byRecord.values()) {
    if (group.length < 2) continue

    // Everything before the last delete no longer matters.
    let start = 0
    for (let i = group.length - 1; i >= 0; i--) {
      if (group[i]?.operation_type === 'delete') {
        start = i
        break
      }
    }
    for (let i = 0; i < start; i++) {
      const dropped = group[i]
      if (dropped) supersededIds.push(dropped.id)
    }

    // What follows the delete (or the whole group when there is none).
    const tail = group.slice(group[start]?.operation_type === 'delete' ? start + 1 : start)
    const head = tail[0]
    const newest = tail[tail.length - 1]
    if (!head || !newest || tail.length < 2) continue
    // Only fold the shapes described above; anything unexpected is left as is.
    if (!tail.slice(1).every(event => event.operation_type === 'update')) continue
    if (head.operation_type !== 'create' && head.operation_type !== 'update') continue

    for (const event of tail.slice(1)) supersededIds.push(event.id)
    if (head.payload !== newest.payload) {
      payloadUpdates.push({ id: head.id, payload: newest.payload })
      replacement.set(head.id, { ...head, payload: newest.payload })
    }
  }

  const dropped = new Set(supersededIds)
  const events = queued
    .filter(event => !dropped.has(event.id))
    .map(event => replacement.get(event.id) ?? event)

  return { events, supersededIds, payloadUpdates }
}
