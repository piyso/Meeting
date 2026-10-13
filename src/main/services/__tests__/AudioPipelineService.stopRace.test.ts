/**
 * AudioPipelineService — stopping while an earlier recording is still being
 * transcribed.
 *
 * Stop waits (up to 90s) for the stopped meeting's queued audio. While it
 * waited, the service used to stay flagged as "stopping": a recording started
 * in the meantime could not be stopped — its stop request returned as if
 * nothing were capturing — and its last audio was never transcribed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface Deferred {
  audio: Float32Array
  finish: () => void
}

const asr = vi.hoisted(() => ({
  pending: [] as Deferred[],
  transcribe: vi.fn(),
}))

vi.mock('../ASRService', () => ({
  getASRService: () => ({
    initialize: vi.fn(async () => undefined),
    transcribe: asr.transcribe,
  }),
}))

const saved = vi.hoisted(() => ({ transcripts: [] as Array<{ meetingId: string }> }))

vi.mock('../TranscriptService', () => ({
  getTranscriptService: () => ({
    saveTranscript: vi.fn((entry: { meetingId: string }) => {
      saved.transcripts.push({ meetingId: entry.meetingId })
    }),
  }),
}))

import { AudioPipelineService } from '../AudioPipelineService'

const SAMPLE_RATE = 16000
const MEETING_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEETING_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function speech(seconds: number): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.1 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE)
  }
  return samples
}

function feed(service: AudioPipelineService, audio: Float32Array): void {
  const flush = (service as unknown as { flushRingBuffer: () => void }).flushRingBuffer.bind(
    service
  )
  service.processAudioChunk(audio)
  flush()
}

describe('AudioPipelineService: stop while an earlier meeting is still transcribing', () => {
  let service: AudioPipelineService

  beforeEach(() => {
    asr.pending.length = 0
    saved.transcripts.length = 0
    // Each transcription stays pending until the test finishes it.
    asr.transcribe.mockReset().mockImplementation(
      (audio: Float32Array) =>
        new Promise(resolve => {
          asr.pending.push({
            audio,
            finish: () =>
              resolve({ segments: [{ text: 'hello', start: 0, end: 1, confidence: 0.9 }] }),
          })
        })
    )
    service = new AudioPipelineService()
  })

  afterEach(() => {
    service.reset()
  })

  it('stops the second recording and transcribes its audio', async () => {
    const statuses: Array<{ meetingId: string | null; status: string }> = []
    service.on('status', event => statuses.push(event))

    await service.startCapture(MEETING_A)
    feed(service, speech(2))
    const stopA = service.stopCapture() // waits on A's transcription
    await vi.waitFor(() => expect(asr.pending).toHaveLength(1))

    await service.startCapture(MEETING_B)
    feed(service, speech(3))

    const stopB = service.stopCapture()
    // B is no longer capturing as soon as the stop is requested…
    expect(service.getStatus().isCapturing).toBe(false)

    // …and its audio is queued behind A's and transcribed.
    asr.pending[0]?.finish()
    await vi.waitFor(() => expect(asr.pending).toHaveLength(2))
    expect((asr.pending[1]?.audio.length ?? 0) / SAMPLE_RATE).toBeCloseTo(3, 1)
    asr.pending[1]?.finish()

    const [resultA, resultB] = await Promise.all([stopA, stopB])
    expect(resultA.segments).toBe(1)
    expect(resultB.segments).toBe(1)
    expect(saved.transcripts.map(t => t.meetingId)).toEqual([MEETING_A, MEETING_B])

    // Each meeting got its own stopping/stopped pair.
    const stopped = statuses.filter(s => s.status === 'stopped').map(s => s.meetingId)
    expect(stopped.sort()).toEqual([MEETING_A, MEETING_B])
  })

  it('reports the first meeting by its own numbers, not the next recording’s', async () => {
    await service.startCapture(MEETING_A)
    feed(service, speech(2))
    const stopA = service.stopCapture()
    await vi.waitFor(() => expect(asr.pending).toHaveLength(1))

    await service.startCapture(MEETING_B)
    // B is recording; A's chunk completes now.
    asr.pending[0]?.finish()
    const resultA = await stopA

    expect(resultA.segments).toBe(1)
    // B is untouched by A's stop completing.
    expect(service.getStatus()).toMatchObject({ isCapturing: true, meetingId: MEETING_B })
    expect(service.getStatus().totalSegments).toBe(0)

    const stopB = service.stopCapture()
    asr.pending.slice(1).forEach(p => p.finish())
    await stopB
  })

  it('ignores a second stop request for the same recording', async () => {
    await service.startCapture(MEETING_A)
    feed(service, speech(2))
    const first = service.stopCapture()
    const second = await service.stopCapture()
    expect(second).toEqual({ duration: 0, segments: 0 })

    await vi.waitFor(() => expect(asr.pending).toHaveLength(1))
    asr.pending[0]?.finish()
    expect((await first).segments).toBe(1)
    expect(asr.transcribe).toHaveBeenCalledTimes(1)
  })
})
