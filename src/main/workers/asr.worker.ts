/**
 * ASR (Automatic Speech Recognition) Worker
 *
 * Runs Moonshine Base (ONNX) in a worker thread so transcription never blocks
 * the main process. The inference itself lives in ./moonshine.ts.
 *
 * Protocol (unchanged — see ASRService):
 *   init        → ready | error
 *   transcribe  → transcript | error
 *   unload      → unloaded | error
 *   ping        → pong
 */

import { parentPort } from 'worker_threads'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { MoonshineRecognizer, MOONSHINE_FILES } from './moonshine'

// LAZY IMPORT: onnxruntime-node is loaded on first use, NOT at module parse time.
// This prevents a fatal crash in the main process when the native binary is missing
// or wrong-arch (e.g., macOS binary shipped in Windows build).
type OrtModule = typeof import('onnxruntime-node')
let _ort: OrtModule | null = null
let _ortLoadError: string | null = null

function getOrt(): OrtModule {
  if (_ort) return _ort
  if (_ortLoadError) throw new Error(_ortLoadError)
  try {
    _ort = require('onnxruntime-node') as OrtModule
    return _ort
  } catch (err: unknown) {
    _ortLoadError = `onnxruntime-node failed to load: ${err instanceof Error ? err.message : String(err)}`
    workerLog.error(_ortLoadError)
    throw new Error(_ortLoadError)
  }
}

// Type definitions
interface ASRWorkerMessage {
  type: 'init' | 'transcribe' | 'unload' | 'ping'
  data?: Record<string, unknown>
}

interface ASRWorkerResponse {
  type: 'ready' | 'transcript' | 'error' | 'unloaded' | 'pong'
  data?: Record<string, unknown>
  error?: string
}

/** Structured worker logging — uses console in worker thread context */
const workerLog = {
  info: (...args: unknown[]) => safeConsole('log', args),
  warn: (...args: unknown[]) => safeConsole('warn', args),
  error: (...args: unknown[]) => safeConsole('error', args),
}

function safeConsole(level: 'log' | 'warn' | 'error', args: unknown[]): void {
  try {
    console[level]('[ASR Worker]', ...args)
  } catch {
    /* stdio closed */
  }
}

type HardwareTier = 'high' | 'mid' | 'low'
const MODEL_NAME = 'moonshine-base'

// Worker state
let recognizer: MoonshineRecognizer | null = null
let hardwareTier: HardwareTier | null = null
let resolvedModelsDir: string = ''
// Moonshine Base is an English model; the setting is recorded so a
// multilingual model can honour it later.
let currentLanguage: string = 'en'

/**
 * Detect hardware tier based on available RAM (reported to the UI only —
 * the same model runs on every tier).
 */
function detectHardwareTier(): HardwareTier {
  const totalRAM = os.totalmem() / 1024 / 1024 / 1024 // GB

  if (totalRAM >= 16) {
    return 'high'
  } else if (totalRAM >= 12) {
    return 'mid'
  } else {
    return 'low'
  }
}

function getModelPaths(): { encoder: string; decoder: string; tokenizer: string } {
  if (!resolvedModelsDir) throw new Error('Models dir not set — call init first')
  return {
    encoder: path.join(resolvedModelsDir, MOONSHINE_FILES.encoder),
    decoder: path.join(resolvedModelsDir, MOONSHINE_FILES.decoder),
    tokenizer: path.join(resolvedModelsDir, MOONSHINE_FILES.tokenizer),
  }
}

/**
 * Initialize ASR model
 */
async function initializeModel(data?: { modelsDir?: string; language?: string }): Promise<void> {
  try {
    // Set language for transcription (can be called without modelsDir for language-only updates)
    if (data?.language) {
      currentLanguage = data.language
      workerLog.info(`Language set to: ${currentLanguage}`)
    }

    // If only language was sent and model is already loaded, skip model reload
    if (!data?.modelsDir && recognizer) {
      sendResponse({
        type: 'ready',
        data: { model: MODEL_NAME, tier: hardwareTier, language: currentLanguage },
      })
      return
    }

    // Set models directory from parent thread or fall back to cwd
    if (data?.modelsDir) {
      resolvedModelsDir = data.modelsDir
    } else if (!resolvedModelsDir) {
      resolvedModelsDir = path.join(process.cwd(), 'resources', 'models')
    }

    hardwareTier = detectHardwareTier()

    if (!recognizer) {
      const paths = getModelPaths()
      const missing = Object.values(paths).filter(p => !fs.existsSync(p))
      if (missing.length > 0) {
        throw new Error(
          `Speech model not downloaded (missing ${missing.map(p => path.basename(p)).join(', ')})`
        )
      }

      workerLog.info('Loading Moonshine Base...')
      const started = Date.now()
      recognizer = await MoonshineRecognizer.load(getOrt(), paths)
      workerLog.info(`Moonshine Base loaded in ${Date.now() - started}ms`)
    }

    sendResponse({
      type: 'ready',
      data: {
        model: MODEL_NAME,
        tier: hardwareTier,
        language: currentLanguage,
      },
    })
  } catch (error: unknown) {
    workerLog.error('Initialization failed:', error)
    sendResponse({
      type: 'error',
      error: `Failed to initialize ASR model: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

/**
 * Unload model to free memory
 */
async function unloadModel(): Promise<void> {
  const loaded = recognizer
  recognizer = null
  try {
    await loaded?.release()
    workerLog.info('Model unloaded')
    sendResponse({ type: 'unloaded' })
  } catch (error: unknown) {
    workerLog.error('Unload failed:', error)
    sendResponse({
      type: 'error',
      error: `Failed to unload model: ${error instanceof Error ? error.message : String(error)}`,
    })
  } finally {
    // Force garbage collection if available
    if (global.gc) {
      global.gc()
    }
  }
}

/**
 * Send response to main thread
 */
function sendResponse(response: ASRWorkerResponse): void {
  if (parentPort) {
    parentPort.postMessage(response)
  }
}

// Requests are handled strictly one at a time: ONNX sessions are shared, and
// interleaving an unload with a transcription would release them mid-run.
let queue: Promise<void> = Promise.resolve()

async function handleMessage(message: ASRWorkerMessage): Promise<void> {
  try {
    switch (message.type) {
      case 'init':
        await initializeModel(message.data)
        break

      case 'transcribe': {
        const id = message.data?.id
        if (!recognizer) {
          sendResponse({ type: 'error', data: { id }, error: 'Model not initialized' })
          return
        }

        const audioData = message.data?.audioBuffer as ArrayBufferLike | undefined
        if (!audioData) {
          sendResponse({ type: 'error', data: { id }, error: 'No audio data provided' })
          return
        }
        // Honour the view's offset/length — the buffer may be larger than the audio.
        const byteOffset = Number(message.data?.byteOffset) || 0
        const byteLength = Number(message.data?.byteLength) || audioData.byteLength - byteOffset
        const audio = new Float32Array(audioData, byteOffset, Math.floor(byteLength / 4))

        const started = Date.now()
        const segments = await recognizer.transcribe(audio)
        const audioSec = audio.length / 16000
        const tookSec = (Date.now() - started) / 1000
        workerLog.info(
          `Transcribed ${audioSec.toFixed(1)}s audio in ${tookSec.toFixed(2)}s ` +
            `(${(audioSec / Math.max(tookSec, 0.001)).toFixed(1)}x real time, ${segments.length} segments)`
        )

        sendResponse({
          type: 'transcript',
          data: {
            id,
            segments,
            model: MODEL_NAME,
            tier: hardwareTier,
          },
        })
        break
      }

      case 'unload':
        await unloadModel()
        break

      case 'ping':
        sendResponse({ type: 'pong' })
        break

      default:
        sendResponse({
          type: 'error',
          error: `Unknown message type: ${message.type}`,
        })
    }
  } catch (error: unknown) {
    workerLog.error('Error handling message:', error)
    sendResponse({
      type: 'error',
      data: { id: message.data?.id },
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

if (parentPort) {
  parentPort.on('message', (message: ASRWorkerMessage) => {
    queue = queue.then(() => handleMessage(message))
  })
}

workerLog.info('Worker thread started')
