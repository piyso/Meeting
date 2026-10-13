import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  MOONSHINE_FILES,
  MOONSHINE_SAMPLE_RATE,
  MoonshineRecognizer,
  MoonshineTokenizer,
  collapseRepeats,
  segmentSpeech,
} from '../moonshine'

const SR = MOONSHINE_SAMPLE_RATE

/**
 * `seconds` of a 220 Hz tone whose loudness pulses about four times a second,
 * the way syllables do — a stand-in for speech energy.
 */
function tone(seconds: number, amplitude = 0.2): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < out.length; i++) {
    const syllable = 0.55 + 0.45 * Math.sin((2 * Math.PI * 4 * i) / SR)
    out[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * amplitude * syllable
  }
  return out
}

/** A steady hum: constant loudness, no syllables. */
function hum(seconds: number, amplitude = 0.05): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * 120 * i) / SR) * amplitude
  return out
}

function silence(seconds: number, noise = 0.0005): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  // Deterministic low-level noise
  let seed = 1
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    out[i] = (seed / 0xffffffff - 0.5) * 2 * noise
  }
  return out
}

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

describe('segmentSpeech', () => {
  it('returns nothing for silence', () => {
    expect(segmentSpeech(silence(10))).toEqual([])
  })

  it('returns nothing for a steady hum', () => {
    expect(segmentSpeech(hum(10))).toEqual([])
  })

  it('returns nothing for an empty buffer', () => {
    expect(segmentSpeech(new Float32Array(0))).toEqual([])
  })

  it('finds separate utterances and keeps them in order without overlap', () => {
    const audio = concat(silence(1), tone(2), silence(1.5), tone(3), silence(1))
    const spans = segmentSpeech(audio)

    expect(spans).toHaveLength(2)
    const [first, second] = spans
    expect(first!.start / SR).toBeGreaterThan(0.7)
    expect(first!.start / SR).toBeLessThan(1.05)
    expect(first!.end / SR).toBeGreaterThan(2.95)
    expect(first!.end / SR).toBeLessThan(3.3)
    expect(second!.start).toBeGreaterThanOrEqual(first!.end)
    expect(second!.end).toBeLessThanOrEqual(audio.length)
  })

  it('bridges pauses shorter than the minimum pause', () => {
    const audio = concat(silence(0.5), tone(1), silence(0.2), tone(1), silence(0.5))
    expect(segmentSpeech(audio)).toHaveLength(1)
  })

  it('drops clicks shorter than the minimum speech length', () => {
    const audio = concat(silence(1), tone(0.08), silence(1))
    expect(segmentSpeech(audio)).toEqual([])
  })

  it('splits continuous speech longer than the maximum span', () => {
    const spans = segmentSpeech(tone(30), { maxSpanSec: 14 })

    expect(spans.length).toBeGreaterThanOrEqual(3)
    for (const span of spans) {
      expect((span.end - span.start) / SR).toBeLessThanOrEqual(14.01)
    }
    // Contiguous: nothing is lost at the cut points
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!.start).toBe(spans[i - 1]!.end)
    }
    expect(spans[spans.length - 1]!.end).toBe(30 * SR)
  })
})

describe('MoonshineTokenizer', () => {
  const tokenizer = new MoonshineTokenizer({
    model: {
      vocab: {
        '<unk>': 0,
        '<s>': 1,
        '</s>': 2,
        '▁Hello': 3,
        '▁world': 4,
        ',': 5,
        '<0xC3>': 6,
        '<0xA9>': 7,
        '▁caf': 8,
      },
    },
    added_tokens: [
      { id: 0, content: '<unk>', special: true },
      { id: 1, content: '<s>', special: true },
      { id: 2, content: '</s>', special: true },
    ],
  })

  it('turns word-boundary markers into spaces and strips the leading one', () => {
    expect(tokenizer.decode([3, 5, 4])).toBe('Hello, world')
  })

  it('skips special tokens and unknown ids', () => {
    expect(tokenizer.decode([1, 3, 999, 4, 2])).toBe('Hello world')
  })

  it('fuses byte-fallback tokens into UTF-8', () => {
    expect(tokenizer.decode([8, 6, 7])).toBe('café')
  })

  it('rejects a file without a vocabulary', () => {
    expect(() => new MoonshineTokenizer({})).toThrow(/vocab/)
  })
})

describe('collapseRepeats', () => {
  it('collapses a phrase repeated many times', () => {
    expect(collapseRepeats('thank you thank you thank you thank you thank you')).toBe('thank you')
  })

  it('leaves ordinary sentences untouched', () => {
    const sentence = 'we agreed that the launch moves to the first week of December'
    expect(collapseRepeats(sentence)).toBe(sentence)
  })

  it('keeps short natural repetition', () => {
    const sentence = 'no no that is not what I meant at all really'
    expect(collapseRepeats(sentence)).toBe(sentence)
  })
})

// ─── End-to-end against the real model ──────────────────────────
// Runs when the model files are present (npm run download-models) and the
// macOS `say` tool can synthesize a test utterance; skipped elsewhere.
const modelsDir = path.join(process.cwd(), 'resources', 'models')
const modelPaths = {
  encoder: path.join(modelsDir, MOONSHINE_FILES.encoder),
  decoder: path.join(modelsDir, MOONSHINE_FILES.decoder),
  tokenizer: path.join(modelsDir, MOONSHINE_FILES.tokenizer),
}
const canRunModel =
  process.platform === 'darwin' &&
  Object.values(modelPaths).every(p => fs.existsSync(p)) &&
  fs.existsSync('/usr/bin/say')

function readFloat32Wav(file: string): Float32Array {
  const bytes = fs.readFileSync(file)
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    if (id === 'data') {
      const samples = new Float32Array(Math.floor(size / 4))
      for (let i = 0; i < samples.length; i++) samples[i] = bytes.readFloatLE(offset + 8 + i * 4)
      return samples
    }
    offset += 8 + size + (size % 2)
  }
  throw new Error('No data chunk in WAV file')
}

describe.runIf(canRunModel)('MoonshineRecognizer (real model)', () => {
  let recognizer: MoonshineRecognizer
  let tmpDir: string

  beforeAll(async () => {
    // src/test/setup.ts mocks onnxruntime-node globally; this suite needs the real one.
    const ort = await vi.importActual<typeof import('onnxruntime-node')>('onnxruntime-node')
    recognizer = await MoonshineRecognizer.load(ort, modelPaths)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moonshine-test-'))
  }, 60_000)

  afterAll(async () => {
    await recognizer?.release()
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('transcribes synthesized speech with timestamps and confidence', async () => {
    const wav = path.join(tmpDir, 'utterance.wav')
    execFileSync('/usr/bin/say', [
      '-o',
      wav,
      '--data-format=LEF32@16000',
      'The quarterly budget review is on Friday.',
    ])
    const audio = concat(silence(1), readFloat32Wav(wav), silence(1))

    const segments = await recognizer.transcribe(audio)
    const text = segments
      .map(s => s.text)
      .join(' ')
      .toLowerCase()

    expect(segments.length).toBeGreaterThan(0)
    expect(text).toContain('budget')
    expect(text).toContain('friday')
    for (const segment of segments) {
      expect(segment.start).toBeGreaterThanOrEqual(0.5)
      expect(segment.end).toBeGreaterThan(segment.start)
      expect(segment.end).toBeLessThanOrEqual(audio.length / SR)
      expect(segment.confidence).toBeGreaterThan(0.5)
      expect(segment.confidence).toBeLessThanOrEqual(1)
    }
  }, 60_000)

  it('produces no segments for silence', async () => {
    expect(await recognizer.transcribe(silence(8))).toEqual([])
  }, 30_000)
})
