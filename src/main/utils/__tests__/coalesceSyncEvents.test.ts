import { describe, it, expect } from 'vitest'
import { coalesceSyncEvents, type QueuedSyncEvent } from '../coalesceSyncEvents'

let seq = 0
function event(
  operation_type: 'create' | 'update' | 'delete',
  record_id: string,
  payload: string | null = `{"v":${seq}}`,
  table_name = 'notes'
): QueuedSyncEvent {
  return { id: `q${++seq}`, operation_type, table_name, record_id, payload }
}

describe('coalesceSyncEvents', () => {
  it('leaves unrelated events alone', () => {
    const queued = [event('create', 'a'), event('update', 'b'), event('delete', 'c')]
    const result = coalesceSyncEvents(queued)
    expect(result.events).toEqual(queued)
    expect(result.supersededIds).toEqual([])
    expect(result.payloadUpdates).toEqual([])
  })

  it('drops a create that is followed by a delete, but still runs the delete', () => {
    // The create failed once and is being retried; meanwhile the record was deleted.
    const create = event('create', 'a')
    const remove = event('delete', 'a')
    const result = coalesceSyncEvents([create, remove])

    expect(result.events).toEqual([remove])
    expect(result.supersededIds).toEqual([create.id])
  })

  it('drops updates that precede a delete as well', () => {
    const create = event('create', 'a')
    const update = event('update', 'a')
    const remove = event('delete', 'a')
    const other = event('create', 'b')
    const result = coalesceSyncEvents([create, other, update, remove])

    expect(result.events).toEqual([other, remove])
    expect(result.supersededIds.sort()).toEqual([create.id, update.id].sort())
  })

  it('folds updates into the create they follow, keeping the newest payload', () => {
    const create = event('create', 'a', '{"text":"first"}')
    const update1 = event('update', 'a', '{"text":"second"}')
    const update2 = event('update', 'a', '{"text":"third"}')
    const result = coalesceSyncEvents([create, update1, update2])

    expect(result.events).toEqual([{ ...create, payload: '{"text":"third"}' }])
    expect(result.supersededIds).toEqual([update1.id, update2.id])
    expect(result.payloadUpdates).toEqual([{ id: create.id, payload: '{"text":"third"}' }])
  })

  it('keeps only the newest of several updates', () => {
    const update1 = event('update', 'a', '{"n":1}')
    const update2 = event('update', 'a', '{"n":2}')
    const result = coalesceSyncEvents([update1, update2])

    expect(result.events).toEqual([{ ...update1, payload: '{"n":2}' }])
    expect(result.supersededIds).toEqual([update2.id])
    expect(result.payloadUpdates).toEqual([{ id: update1.id, payload: '{"n":2}' }])
  })

  it('keeps a record that was deleted and then created again, in that order', () => {
    const oldUpdate = event('update', 'a')
    const remove = event('delete', 'a')
    const recreate = event('create', 'a', '{"text":"new"}')
    const result = coalesceSyncEvents([oldUpdate, remove, recreate])

    expect(result.events).toEqual([remove, recreate])
    expect(result.supersededIds).toEqual([oldUpdate.id])
  })

  it('treats the same id in different tables as different records', () => {
    const noteCreate = event('create', 'x', '{}', 'notes')
    const meetingDelete = event('delete', 'x', '{}', 'meetings')
    const result = coalesceSyncEvents([noteCreate, meetingDelete])

    expect(result.events).toEqual([noteCreate, meetingDelete])
    expect(result.supersededIds).toEqual([])
  })

  it('does not fold shapes it does not recognise', () => {
    // An update queued before a create for the same record should not happen;
    // if it does, both are sent rather than guessing.
    const update = event('update', 'a')
    const create = event('create', 'a')
    const result = coalesceSyncEvents([update, create])

    expect(result.events).toEqual([update, create])
    expect(result.supersededIds).toEqual([])
  })
})
