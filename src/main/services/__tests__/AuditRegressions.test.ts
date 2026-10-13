/**
 * Regression tests for defects found in the October 2026 code audit.
 * Each block names what used to happen.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Webhook payloads ─────────────────────────────────────────────

vi.mock('../../database/crud/webhooks', () => ({
  getActiveWebhooksByEvent: vi.fn(() => []),
  countActiveWebhooks: vi.fn(() => 0),
  getWebhookById: vi.fn(() => null),
}))
vi.mock('../../database/crud/webhook-deliveries', () => ({
  createDelivery: vi.fn(),
  updateDeliveryStatus: vi.fn(),
  getFailedDeliveries: vi.fn(() => []),
  markDeliveryDead: vi.fn(),
}))

import { maskPhiInPayload } from '../WebhookDispatchService'
import { PHIDetectionService } from '../PHIDetectionService'

const maskText = (text: string): string => {
  const result = PHIDetectionService.detectPHI(text)
  return result.hasPHI && result.maskedText ? result.maskedText : text
}

describe('webhook PHI masking', () => {
  // Masking used to run over the serialized JSON. A 10-digit epoch matched the
  // phone pattern and "deadline":1760262000 became "deadline":***-***-**** —
  // which is not JSON — and the digits ending a UUID were masked as an id number.
  const data = {
    id: 'a1',
    meetingId: '550e8400-e29b-41d4-a716-446655440000',
    text: 'Call Priya on 415-555-0199 about the renewal',
    deadline: 1760262000,
    created_at: 1760258400,
    assignee: 'priya@example.com',
    nested: { notes: ['SSN is 123-45-6789'], count: 3, done: false },
  }

  it('leaves numbers, ids and structure alone and still produces valid JSON', () => {
    const masked = maskPhiInPayload(data, maskText)
    const roundTripped = JSON.parse(JSON.stringify({ event: 'x', data: masked }))

    expect(roundTripped.data.deadline).toBe(1760262000)
    expect(roundTripped.data.created_at).toBe(1760258400)
    expect(roundTripped.data.meetingId).toBe('550e8400-e29b-41d4-a716-446655440000')
    expect(roundTripped.data.id).toBe('a1')
    expect(roundTripped.data.nested.count).toBe(3)
    expect(roundTripped.data.nested.done).toBe(false)
  })

  it('still masks PHI inside free-text values, at any depth', () => {
    const masked = maskPhiInPayload(data, maskText)

    expect(masked.text).not.toContain('415-555-0199')
    expect(masked.text).toContain('Call Priya')
    expect(masked.assignee).not.toContain('priya@example.com')
    expect(masked.nested.notes[0]).not.toContain('123-45-6789')
  })

  it('does not treat an ISO timestamp as a date of birth', () => {
    const masked = maskPhiInPayload({ startedAt: '2026-10-12T09:30:00.000Z' }, maskText)
    expect(masked.startedAt).toBe('2026-10-12T09:30:00.000Z')
  })
})

// ── Paid period ──────────────────────────────────────────────────

import { entitledTier } from '../AuthService'

describe('entitledTier', () => {
  const day = 24 * 60 * 60 * 1000
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

  it('keeps the tier while the paid period is running', () => {
    expect(entitledTier({ tier: 'pro', current_period_end: iso(10 * day) })).toBe('pro')
  })

  it('keeps the tier for a short grace period after it ends', () => {
    expect(entitledTier({ tier: 'pro', current_period_end: iso(-1 * day) })).toBe('pro')
  })

  // A one-time payment sends no cancellation; the tier used to last for ever.
  it('falls back to free once the period ended more than the grace period ago', () => {
    expect(entitledTier({ tier: 'starter', current_period_end: iso(-10 * day) })).toBe('free')
  })

  it('does not expire a tier with no period on file (licence key)', () => {
    expect(entitledTier({ tier: 'team', current_period_end: null })).toBe('team')
    expect(entitledTier({ tier: 'team' })).toBe('team')
  })

  it('treats a missing tier as free', () => {
    expect(entitledTier({})).toBe('free')
  })
})

// ── Audio attestations ───────────────────────────────────────────

const attestationRows = vi.hoisted(() => [] as Array<Record<string, unknown>>)
vi.mock('../DatabaseService', () => ({
  getDatabaseService: () => ({
    getDb: () => ({
      exec: () => undefined,
      prepare: (sql: string) => ({
        run: (...args: unknown[]) => {
          if (/INSERT INTO audio_attestations/.test(sql)) {
            const [id, meeting_id, segment_index, audio_hash, signature, public_key, timestamp] =
              args
            attestationRows.push({
              id,
              meeting_id,
              segment_index,
              audio_hash,
              signature,
              public_key,
              timestamp,
              verified: 1,
            })
          }
          return { changes: 1 }
        },
        all: (meetingId: string) => attestationRows.filter(row => row.meeting_id === meetingId),
      }),
    }),
  }),
}))

import { AudioProvenanceService } from '../AudioProvenanceService'

describe('AudioProvenanceService', () => {
  beforeEach(() => {
    attestationRows.length = 0
  })

  // createSign('') throws "Invalid digest" for Ed25519, so signSegment()
  // returned null for every segment and nothing was ever attested.
  it('signs a segment and verifies it against the same audio', async () => {
    const service = new AudioProvenanceService()
    const audio = Buffer.from('sixteen kilohertz of something')

    const attestation = await service.signSegment('meeting-1', 0, audio)

    expect(attestation).not.toBeNull()
    if (!attestation) return
    expect(service.verifyAttestation(attestation, audio)).toBe(true)
    expect(service.verifyAttestation(attestation, Buffer.from('different audio'))).toBe(false)
  })

  it('rejects an attestation whose fields were changed after signing', async () => {
    const service = new AudioProvenanceService()
    const attestation = await service.signSegment('meeting-1', 3, Buffer.from('audio'))
    if (!attestation) throw new Error('not signed')

    expect(service.verifySignature(attestation)).toBe(true)
    expect(service.verifySignature({ ...attestation, segmentIndex: 4 })).toBe(false)
    expect(service.verifySignature({ ...attestation, meetingId: 'meeting-2' })).toBe(false)
    expect(service.verifySignature({ ...attestation, audioHash: 'f'.repeat(64) })).toBe(false)
  })

  // Rows come back snake_case; they were returned as-is, so every camelCase
  // field was undefined and each segment was reported as tampered.
  it('verifies stored attestations and notices a tampered one', async () => {
    const service = new AudioProvenanceService()
    await service.signSegment('meeting-1', 0, Buffer.from('first'))
    await service.signSegment('meeting-1', 1, Buffer.from('second'))

    expect(service.verifyMeetingChain('meeting-1')).toMatchObject({
      valid: true,
      totalSegments: 2,
      verifiedSegments: 2,
    })

    const second = attestationRows[1]
    if (second) second.audio_hash = '0'.repeat(64)
    expect(service.verifyMeetingChain('meeting-1')).toMatchObject({
      valid: false,
      tamperedSegments: [1],
    })
  })

  it('uses one key pair per installation, not one per call', async () => {
    const service = new AudioProvenanceService()
    const a = await service.signSegment('meeting-1', 0, Buffer.from('a'))
    const b = await service.signSegment('meeting-1', 1, Buffer.from('b'))
    expect(a?.publicKey).toBeTruthy()
    expect(a?.publicKey).toBe(b?.publicKey)
  })
})

// ── Keychain loader ──────────────────────────────────────────────

import { keytarSafe } from '../keytarSafe'

describe('keytarSafe', () => {
  // A flag was set before the module finished loading, so a second caller
  // arriving during the load was told the keychain was unavailable.
  it('gives concurrent first callers the same module', async () => {
    const [first, second, third] = await Promise.all([keytarSafe(), keytarSafe(), keytarSafe()])
    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(third).toBe(first)
  })
})
