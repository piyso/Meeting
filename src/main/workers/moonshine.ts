/**
 * Moonshine speech recognition (ONNX, "merged" export).
 *
 * Pure inference code with no worker or Electron dependencies, so it can be
 * exercised directly in tests. Used by asr.worker.ts.
 *
 * Model files (huggingface.co/moonshine-ai/moonshine, onnx/merged/base/float):
 *   - encoder_model.onnx          raw 16 kHz mono audio → hidden states
 *   - decoder_model_merged.onnx   autoregressive decoder with a KV cache
 *   - tokenizer.json              BPE vocabulary (SentencePiece-style "▁" spaces)
 *
 * Pipeline: split the audio at pauses → encode each span → greedy-decode
 * token ids → detokenize. Splitting matters twice over: Moonshine is trained
 * on short utterances and degrades on long inputs, and decoding silence makes
 * any speech model invent text.
 */

import * as fs from 'fs'

type OrtModule = typeof import('onnxruntime-node')
type Session = Awaited<ReturnType<OrtModule['InferenceSession']['create']>>
type OrtTensor = InstanceType<OrtModule['Tensor']>

export const MOONSHINE_SAMPLE_RATE = 16000

export const MOONSHINE_FILES = {
  encoder: 'moonshine-encoder.onnx',
  decoder: 'moonshine-decoder.onnx',
  tokenizer: 'moonshine-tokenizer.json',
} as const

export interface RecognizedSegment {
  text: string
  /** Seconds from the start of the audio passed to transcribe(). */
  start: number
  end: number
  /** Geometric-mean probability of the decoded tokens, 0–1. */
  confidence: number
}

export interface SpeechSpan {
  /** Sample offsets into the audio buffer. */
  start: number
  end: number
}

// ─── Speech segmentation ────────────────────────────────────────

/** Tunables for segmentSpeech(); the defaults suit meeting audio. */
export interface SegmentOptions {
  sampleRate?: number
  /** Analysis frame, seconds. */
  frameSec?: number
  /** Pauses shorter than this stay inside a span. */
  minPauseSec?: number
  /** Spans shorter than this are discarded as clicks/noise. */
  minSpeechSec?: number
  /** Context kept on each side of a span. */
  padSec?: number
  /** Longest span sent to the model. */
  maxSpanSec?: number
  /** Absolute RMS below which a frame is never speech. */
  energyFloor?: number
}

/**
 * Find the spans of an audio buffer that contain speech, using frame energy
 * against an adaptive noise floor. Deliberately simple and dependency-free:
 * it only has to keep silence away from the recognizer and cut long audio at
 * pauses rather than mid-word.
 */
export function segmentSpeech(audio: Float32Array, options: SegmentOptions = {}): SpeechSpan[] {
  const sampleRate = options.sampleRate ?? MOONSHINE_SAMPLE_RATE
  const frame = Math.max(1, Math.round((options.frameSec ?? 0.03) * sampleRate))
  const minPause = Math.round((options.minPauseSec ?? 0.3) * sampleRate)
  const minSpeech = Math.round((options.minSpeechSec ?? 0.25) * sampleRate)
  const pad = Math.round((options.padSec ?? 0.15) * sampleRate)
  const maxSpan = Math.round((options.maxSpanSec ?? 14) * sampleRate)
  const energyFloor = options.energyFloor ?? 0.003

  const frameCount = Math.floor(audio.length / frame)
  if (frameCount === 0) return []

  const energy = new Float32Array(frameCount)
  for (let f = 0; f < frameCount; f++) {
    let sum = 0
    const base = f * frame
    for (let i = 0; i < frame; i++) {
      const s = audio[base + i] ?? 0
      sum += s * s
    }
    energy[f] = Math.sqrt(sum / frame)
  }

  // Adaptive threshold from the energy distribution of this buffer:
  //  - `noise`  (10th percentile) is the quietest the room gets,
  //  - `loud`   (95th percentile) is the level of speech peaks.
  // A frame is speech when it clears three times the noise level, bounded
  // relative to the loud level on both sides:
  //  - at least 4% of it, so breaths and room tail between sentences count
  //    as pauses even in a very clean recording;
  //  - at most 12% of it, so that in a buffer with no pauses (where the
  //    "noise" percentile is itself quiet speech) soft syllables are kept.
  const sorted = Float32Array.from(energy).sort()
  const noise = sorted[Math.floor(sorted.length * 0.1)] ?? 0
  const loud = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
  if (loud < energyFloor) return []
  // Speech swings widely between syllables and gaps. Energy that barely
  // varies is a hum, fan or tone — transcribing it only invites invented text.
  if (loud < noise * 2.5) return []
  const threshold = Math.max(energyFloor, Math.min(Math.max(noise * 3, loud * 0.04), loud * 0.12))

  // Runs of speech frames → sample spans.
  const raw: SpeechSpan[] = []
  let runStart = -1
  for (let f = 0; f <= frameCount; f++) {
    const isSpeech = f < frameCount && (energy[f] ?? 0) > threshold
    if (isSpeech && runStart < 0) runStart = f
    if (!isSpeech && runStart >= 0) {
      raw.push({ start: runStart * frame, end: f * frame })
      runStart = -1
    }
  }
  if (raw.length === 0) return []

  // Bridge short pauses, then drop spans too short to be words.
  const merged: SpeechSpan[] = []
  for (const span of raw) {
    const last = merged[merged.length - 1]
    if (last && span.start - last.end < minPause) {
      last.end = span.end
    } else {
      merged.push({ ...span })
    }
  }
  const spoken = merged.filter(span => span.end - span.start >= minSpeech)

  // Pad, clamp, and keep neighbours from overlapping.
  const padded: SpeechSpan[] = []
  for (const span of spoken) {
    const start = Math.max(0, span.start - pad, padded[padded.length - 1]?.end ?? 0)
    const end = Math.min(audio.length, span.end + pad)
    if (end > start) padded.push({ start, end })
  }

  // Cut anything longer than the model handles well, at the quietest frame in
  // the second half of the allowed window.
  const result: SpeechSpan[] = []
  for (const span of padded) {
    let start = span.start
    while (span.end - start > maxSpan) {
      const searchFrom = Math.floor((start + maxSpan / 2) / frame)
      const searchTo = Math.min(frameCount - 1, Math.floor((start + maxSpan) / frame))
      let quietest = searchTo
      let quietestEnergy = Infinity
      for (let f = searchFrom; f <= searchTo; f++) {
        const e = energy[f] ?? 0
        if (e < quietestEnergy) {
          quietestEnergy = e
          quietest = f
        }
      }
      const cut = Math.min(span.end, Math.max(start + frame, quietest * frame))
      result.push({ start, end: cut })
      start = cut
    }
    if (span.end - start >= minSpeech) result.push({ start, end: span.end })
  }
  return result
}

// ─── Tokenizer ──────────────────────────────────────────────────

const BYTE_TOKEN = /^<0x([0-9A-Fa-f]{2})>$/

/**
 * Detokenizer for the Moonshine BPE vocabulary. Mirrors the decoder pipeline
 * declared in tokenizer.json: "▁" → space, byte-fallback tokens (`<0xNN>`)
 * fused back into UTF-8, one leading space stripped.
 */
export class MoonshineTokenizer {
  private readonly idToToken: Map<number, string>
  private readonly specialIds: Set<number>

  constructor(tokenizerJson: unknown) {
    const json = tokenizerJson as {
      model?: { vocab?: Record<string, number> }
      added_tokens?: Array<{ id: number; content: string; special?: boolean }>
    }
    const vocab = json?.model?.vocab
    if (!vocab || typeof vocab !== 'object') {
      throw new Error('Invalid tokenizer file: model.vocab is missing')
    }
    this.idToToken = new Map()
    for (const [token, id] of Object.entries(vocab)) this.idToToken.set(id, token)

    this.specialIds = new Set()
    for (const added of json.added_tokens ?? []) {
      if (added.special) this.specialIds.add(added.id)
      else this.idToToken.set(added.id, added.content)
    }
  }

  static fromFile(filePath: string): MoonshineTokenizer {
    return new MoonshineTokenizer(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
  }

  get vocabSize(): number {
    return this.idToToken.size
  }

  decode(ids: ArrayLike<number>): string {
    let text = ''
    let pendingBytes: number[] = []
    const flushBytes = () => {
      if (pendingBytes.length === 0) return
      text += Buffer.from(pendingBytes).toString('utf-8')
      pendingBytes = []
    }

    for (let i = 0; i < ids.length; i++) {
      const id = Number(ids[i])
      if (this.specialIds.has(id)) continue
      const token = this.idToToken.get(id)
      if (token === undefined) continue

      const byte = BYTE_TOKEN.exec(token)
      if (byte?.[1]) {
        pendingBytes.push(parseInt(byte[1], 16))
        continue
      }
      flushBytes()
      text += token.split('▁').join(' ')
    }
    flushBytes()

    return text.startsWith(' ') ? text.slice(1) : text
  }
}

// ─── Recognizer ─────────────────────────────────────────────────

const START_TOKEN = 1
const END_TOKEN = 2
/** Moonshine emits at most ~6 tokens per second of speech. */
const TOKENS_PER_SECOND = 6.5
/** The encoder's convolutional front end needs a minimum amount of audio. */
const MIN_SAMPLES = Math.round(0.2 * MOONSHINE_SAMPLE_RATE)
/** Shape of an empty key/value cache entry for the "base" model. */
const BASE_KV_HEADS = 8
const BASE_KV_DIM = 52

export class MoonshineRecognizer {
  private constructor(
    private readonly ort: OrtModule,
    private readonly encoder: Session,
    private readonly decoder: Session,
    private readonly tokenizer: MoonshineTokenizer,
    private readonly pastNames: string[],
    private readonly presentNames: string[]
  ) {}

  /** Paths of the files load() needs, given the models directory. */
  static requiredFiles(modelsDir: string, join: (...parts: string[]) => string): string[] {
    return [
      join(modelsDir, MOONSHINE_FILES.encoder),
      join(modelsDir, MOONSHINE_FILES.decoder),
      join(modelsDir, MOONSHINE_FILES.tokenizer),
    ]
  }

  static async load(
    ort: OrtModule,
    paths: { encoder: string; decoder: string; tokenizer: string }
  ): Promise<MoonshineRecognizer> {
    const tokenizer = MoonshineTokenizer.fromFile(paths.tokenizer)

    // CPU on every platform: the model runs many times faster than real time
    // on CPU, and the merged decoder (dynamic shapes, If-branches for the
    // cache) is not reliably supported by GPU execution providers.
    const sessionOptions = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all' as const,
    }
    const encoder = await ort.InferenceSession.create(paths.encoder, sessionOptions)
    const decoder = await ort.InferenceSession.create(paths.decoder, sessionOptions)

    // Validate the interface up front so a wrong or truncated model file fails
    // here with a clear message rather than on the first utterance.
    const requireName = (names: readonly string[], name: string, what: string) => {
      if (!names.includes(name)) {
        throw new Error(`Unexpected ${what}: missing "${name}" (found: ${names.join(', ')})`)
      }
    }
    requireName(encoder.inputNames, 'input_values', 'encoder model inputs')
    requireName(decoder.inputNames, 'input_ids', 'decoder model inputs')
    requireName(decoder.inputNames, 'encoder_hidden_states', 'decoder model inputs')
    requireName(decoder.inputNames, 'use_cache_branch', 'decoder model inputs')
    requireName(decoder.outputNames, 'logits', 'decoder model outputs')

    const pastNames = decoder.inputNames.filter(name => name.startsWith('past_key_values.'))
    const presentNames = pastNames.map(name => name.replace('past_key_values.', 'present.'))
    for (const name of presentNames) requireName(decoder.outputNames, name, 'decoder outputs')
    if (pastNames.length === 0) {
      throw new Error('Unexpected decoder model: no past_key_values inputs')
    }

    return new MoonshineRecognizer(ort, encoder, decoder, tokenizer, pastNames, presentNames)
  }

  /**
   * Transcribe 16 kHz mono audio. Returns one segment per spoken span, with
   * times relative to the start of `audio`; silence yields no segments.
   */
  async transcribe(audio: Float32Array): Promise<RecognizedSegment[]> {
    const segments: RecognizedSegment[] = []
    for (const span of segmentSpeech(audio)) {
      const samples = audio.subarray(span.start, span.end)
      if (samples.length < MIN_SAMPLES) continue

      const { tokens, confidence } = await this.decodeSpan(samples)
      const text = collapseRepeats(this.tokenizer.decode(tokens).trim())
      if (!text) continue

      segments.push({
        text,
        start: span.start / MOONSHINE_SAMPLE_RATE,
        end: span.end / MOONSHINE_SAMPLE_RATE,
        confidence,
      })
    }
    return segments
  }

  /** Greedy decode of one span. */
  private async decodeSpan(
    samples: Float32Array
  ): Promise<{ tokens: number[]; confidence: number }> {
    const { Tensor } = this.ort

    // Copy: the span is a view into a larger buffer, and ORT reads the whole
    // underlying ArrayBuffer of a typed-array view on some versions.
    const input = new Tensor('float32', Float32Array.from(samples), [1, samples.length])
    const encoded = await this.encoder.run({ input_values: input })
    const hiddenName = this.encoder.outputNames[0]
    const hidden = hiddenName ? encoded[hiddenName] : undefined
    if (!hidden) throw new Error('Encoder returned no output')

    const past: Record<string, OrtTensor> = {}
    for (const name of this.pastNames) {
      past[name] = new Tensor('float32', new Float32Array(0), [0, BASE_KV_HEADS, 1, BASE_KV_DIM])
    }

    const maxTokens = Math.max(
      8,
      Math.ceil((samples.length / MOONSHINE_SAMPLE_RATE) * TOKENS_PER_SECOND)
    )
    const tokens: number[] = []
    let logProbSum = 0
    let next = START_TOKEN

    for (let step = 0; step < maxTokens; step++) {
      const useCache = step > 0
      const outputs = await this.decoder.run({
        input_ids: new Tensor('int64', BigInt64Array.from([BigInt(next)]), [1, 1]),
        encoder_hidden_states: hidden,
        use_cache_branch: new Tensor('bool', Uint8Array.from([useCache ? 1 : 0]), [1]),
        ...past,
      })

      const logits = outputs['logits']
      if (!logits) throw new Error('Decoder returned no logits')
      const { index, logProb } = argmaxWithLogProb(logits.data as Float32Array, logits.dims)
      if (index === END_TOKEN) break

      tokens.push(index)
      logProbSum += logProb
      next = index

      // Encoder-side cache entries are produced once (on the uncached first
      // step) and reused; decoder-side entries grow every step.
      this.pastNames.forEach((name, i) => {
        const presentName = this.presentNames[i]
        const present = presentName ? outputs[presentName] : undefined
        if (present && (!useCache || name.includes('.decoder.'))) {
          past[name] = present as OrtTensor
        }
      })

      // A model stuck repeating one token is hallucinating — stop early.
      if (tokens.length >= 12 && tokens.slice(-12).every(t => t === index)) {
        tokens.length -= 11
        break
      }
    }

    const confidence = tokens.length > 0 ? Math.exp(logProbSum / tokens.length) : 0
    return { tokens, confidence: Math.min(1, Math.max(0, confidence)) }
  }

  async release(): Promise<void> {
    await Promise.allSettled([this.encoder.release(), this.decoder.release()])
  }
}

/** Argmax over the last position of a [1, seq, vocab] logits tensor, with its log-probability. */
function argmaxWithLogProb(
  data: Float32Array,
  dims: readonly number[]
): { index: number; logProb: number } {
  const vocab = dims[dims.length - 1] ?? data.length
  const offset = data.length - vocab

  let best = 0
  let bestValue = -Infinity
  for (let i = 0; i < vocab; i++) {
    const value = data[offset + i] ?? -Infinity
    if (value > bestValue) {
      bestValue = value
      best = i
    }
  }
  // log-softmax of the winner: value - logsumexp(all), computed stably.
  let sum = 0
  for (let i = 0; i < vocab; i++) {
    sum += Math.exp((data[offset + i] ?? -Infinity) - bestValue)
  }
  return { index: best, logProb: -Math.log(sum) }
}

/**
 * Collapse a phrase the decoder repeated back-to-back many times
 * ("thank you thank you thank you …") down to a single occurrence.
 */
export function collapseRepeats(text: string): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 8) return text

  for (let size = 1; size <= 6; size++) {
    const out: string[] = []
    let i = 0
    let collapsed = false
    while (i < words.length) {
      const phrase = words
        .slice(i, i + size)
        .join(' ')
        .toLowerCase()
      let repeats = 1
      while (
        i + (repeats + 1) * size <= words.length &&
        words
          .slice(i + repeats * size, i + (repeats + 1) * size)
          .join(' ')
          .toLowerCase() === phrase
      ) {
        repeats++
      }
      out.push(...words.slice(i, i + size))
      if (repeats >= 4) collapsed = true
      i += repeats >= 4 ? repeats * size : size
    }
    if (collapsed) return out.join(' ')
  }
  return text
}
