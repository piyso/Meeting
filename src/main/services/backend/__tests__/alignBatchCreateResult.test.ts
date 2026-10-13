import { describe, expect, it } from 'vitest'
import { alignBatchCreateResult } from '../PiyAPIBackend'
import type { Memory } from '../IBackendProvider'
import { buildSyncMemory } from '../../syncPayload'

const submitted: Memory[] = [
  { content: 'a', namespace: 'meetings.notes' },
  { content: 'b', namespace: 'meetings.notes' },
  { content: 'c', namespace: 'meetings.notes' },
]

describe('alignBatchCreateResult', () => {
  it('reads the reply PiyAPI actually sends: { successful, failed, summary }', () => {
    const reply = {
      successful: [
        { id: 'm-a', content: 'a', namespace: 'meetings.notes' },
        { id: 'm-b', content: 'b', namespace: 'meetings.notes' },
        { id: 'm-c', content: 'c', namespace: 'meetings.notes' },
      ],
      failed: [],
      summary: { total: 3, successful: 3, failed: 0 },
    }

    expect(alignBatchCreateResult(submitted, reply).map(m => m.id)).toEqual(['m-a', 'm-b', 'm-c'])
  })

  it('keeps each id at the position of the memory it belongs to when one in the middle fails', () => {
    // `successful` leaves the failed one out, so its second entry is the third memory.
    const reply = {
      successful: [
        { id: 'm-a', content: 'a', namespace: 'meetings.notes' },
        { id: 'm-c', content: 'c', namespace: 'meetings.notes' },
      ],
      failed: [{ index: 1, error: 'Content exceeds plan limit', data: {} }],
      summary: { total: 3, successful: 2, failed: 1 },
    }

    const aligned = alignBatchCreateResult(submitted, reply)
    expect(aligned.map(m => m.id)).toEqual(['m-a', undefined, 'm-c'])
    expect(aligned[1]?.content).toBe('b')
  })

  it('prefers the index-aligned results list of newer servers', () => {
    const reply = {
      successful: [{ id: 'm-c' }, { id: 'm-a' }], // deliberately not in order
      failed: [{ index: 1, error: 'duplicate' }],
      results: [
        { index: 0, success: true, id: 'm-a' },
        { index: 1, success: false, error: 'duplicate' },
        { index: 2, success: true, id: 'm-c' },
      ],
    }

    expect(alignBatchCreateResult(submitted, reply).map(m => m.id)).toEqual([
      'm-a',
      undefined,
      'm-c',
    ])
  })

  it('reports nothing as stored when the reply names no memories', () => {
    for (const reply of [{}, null, { summary: { total: 3 } }]) {
      expect(alignBatchCreateResult(submitted, reply).map(m => m.id)).toEqual([
        undefined,
        undefined,
        undefined,
      ])
    }
  })

  it('still accepts a plain array or { memories }', () => {
    const stored = [{ id: 'x', content: 'a', namespace: 'n' }]
    expect(alignBatchCreateResult(submitted, stored)).toBe(stored)
    expect(alignBatchCreateResult(submitted, { memories: stored })).toBe(stored)
  })
})

describe('buildSyncMemory', () => {
  const memory = buildSyncMemory(
    {
      table_name: 'transcripts',
      operation_type: 'create',
      record_id: 'r-1',
      created_at: 1_760_000_000,
    },
    {
      ciphertext: 'Y2lwaGVy',
      iv: 'aXY=',
      salt: 'c2FsdA==',
      authTag: 'dGFn',
      algorithm: 'aes-256-gcm',
    },
    [0.1, 0.2, 0.3]
  )

  it('marks the content as client-encrypted for PiyAPI', () => {
    expect(memory.metadata).toMatchObject({
      encrypted: true,
      client_encrypted: true,
      skip_server_embedding: true,
      record_id: 'r-1',
    })
    expect(memory.namespace).toBe('meetings.transcripts')
  })

  it('uploads neither a plaintext-derived embedding nor a table name as source type', () => {
    expect(memory.embedding).toBeUndefined()
    expect(memory.sourceType).toBeUndefined()
    expect(JSON.stringify(memory)).not.toContain('0.1')
  })
})
