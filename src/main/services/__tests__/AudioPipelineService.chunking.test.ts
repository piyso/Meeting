/**
 * AudioPipelineService — when a chunk of audio is handed to the recognizer.
 *
 * Chunks used to be cut every 30 seconds exactly: the live transcript ran half
 * a minute behind and words at each boundary were split across two chunks.
 * They are now sealed at the first pause after a minimum length, with 30s as
 * the cap for speech that never pauses.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const asr = vi.hoisted(() => ({
  transcribe: vi.fn(async (_audio: Float32Array) => ({ segments: [] as unknown[] })),
}))

vi.mock('../ASRService', () => ({
  getASRService: () => ({
    initialize: vi.fn(async () => undefined),
    transcribe: asr.transcribe,
  }),
}))

vi.mock('../TranscriptService', () => ({
  getTranscriptService: () => ({ saveTranscript: vi.fn() }),
}))

import { AudioPipelineService } from '../AudioPipelineService'

const SAMPLE_RATE = 16000

/** A 220Hz tone standing in for speech. */
function speech(seconds: number, amplitude = 0.1): Float32Array {
  const samples = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE)
  }
  return samples
}

function silence(seconds: number): Float32Array {
  return new Float32Array(Math.round(seconds * SAMPLE_RATE))
}

/** Feed audio the way the renderer does: half-second blocks, flushed as they arrive. */
function feed(service: AudioPipelineService, audio: Float32Array): void {
  const block = SAMPLE_RATE / 2
  const flush = (service as unknown as { flushRingBuffer: () => void }).flushRingBuffer.bind(
    service
  )
  for (let offset = 0; offset < audio.length; offset += block) {
    service.processAudioChunk(audio.subarray(offset, Math.min(offset + block, audio.length)))
    flush()
  }
}

const sealedSeconds = (): number[] =>
  asr.transcribe.mock.calls.map(([audio]) => audio.length / SAMPLE_RATE)

describe('AudioPipelineService chunking', () => {
  let service: AudioPipelineService

  beforeEach(async () => {
    asr.transcribe.mockClear()
    service = new AudioPipelineService()
    await service.startCapture('11111111-2222-3333-4444-555555555555')
  })

  afterEach(() => {
    service.reset()
  })

  it('hands a chunk over at the first pause once it is long enough', async () => {
    feed(service, speech(8))
    expect(asr.transcribe).not.toHaveBeenCalled() // still talking

    feed(service, silence(1))
    await vi.waitFor(() => expect(asr.transcribe).toHaveBeenCalledTimes(1))

    const [seconds] = sealedSeconds()
    // The 8s of speech plus the pause that ended it — not a 30s wait.
    expect(seconds).toBeGreaterThanOrEqual(8.4)
    expect(seconds).toBeLessThanOrEqual(9)
  })

  it('does not cut a short utterance loose before the minimum length', async () => {
    feed(service, speech(2))
    feed(service, silence(1))
    feed(service, speech(2))
    expect(asr.transcribe).not.toHaveBeenCalled()
  })

  it('still seals at 30 seconds when nobody pauses', async () => {
    feed(service, speech(31))
    await vi.waitFor(() => expect(asr.transcribe).toHaveBeenCalledTimes(1))
    expect(sealedSeconds()[0]).toBeCloseTo(30, 1)
  })

  it('does not seal early on silence alone', async () => {
    feed(service, silence(20))
    expect(asr.transcribe).not.toHaveBeenCalled()
  })

  it('keeps consecutive chunks in order with no audio lost between them', async () => {
    feed(service, speech(7))
    feed(service, silence(1))
    feed(service, speech(7))
    feed(service, silence(1))
    await vi.waitFor(() => expect(asr.transcribe).toHaveBeenCalledTimes(2))

    const total = sealedSeconds().reduce((sum, seconds) => sum + seconds, 0)
    // Everything fed so far has been sealed except the pause still being measured.
    expect(total).toBeGreaterThan(15)
    expect(total).toBeLessThanOrEqual(16)
  })

  it('transcribes what is left when the recording stops', async () => {
    feed(service, speech(3))
    await service.stopCapture()
    expect(asr.transcribe).toHaveBeenCalledTimes(1)
    expect(sealedSeconds()[0]).toBeCloseTo(3, 1)
  })
})
