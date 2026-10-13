/**
 * Model Download Service
 *
 * Manages AI model downloads on first launch with hardware tier detection.
 * Handles progress tracking, verification, and error recovery.
 */

import { app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { Logger } from './Logger'

const log = Logger.create('ModelDownloadService')

export type HardwareTier = 'high' | 'mid' | 'low'
export type ModelType = 'whisper-turbo' | 'moonshine-base'

export interface ModelDownloadProgress {
  modelName: string
  percent: number
  downloadedMB: number
  totalMB: number
  status: 'downloading' | 'verifying' | 'complete' | 'error'
  error?: string
}

export interface HardwareTierInfo {
  tier: HardwareTier
  totalRAM: number // GB
  recommendedASR: ModelType
  recommendedLLM: 'qwen2.5:3b' | 'qwen2.5:1.5b'
  totalRAMBudget: number // GB
}

/** One downloadable file, pinned to an exact revision and content hash. */
interface ModelFile {
  /** File name inside the models directory. */
  name: string
  /** Shown in the download progress UI. */
  label: string
  url: string
  /** Exact size in bytes. */
  size: number
  /** SHA-256 of the file contents (lowercase hex). */
  sha256: string
}

/** URL of a file at a fixed commit — `resolve/main` can change under us. */
const hf = (repo: string, commit: string, file: string): string =>
  `https://huggingface.co/${repo}/resolve/${commit}/${file}`

const MOONSHINE_REV = '48b4e427b587bcf67797a5be706d6ddc4a298149'
const MINILM_REV = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'

/**
 * Every model the app downloads. Sizes and hashes are the published values
 * for the pinned revisions; a download that does not match is discarded.
 * (Previously the "checksum" was computed from whatever had been downloaded
 * and stored next to it, which verified nothing.)
 */
const MODEL_FILES = {
  // Moonshine Base, merged ONNX export: encoder + decoder + tokenizer.
  asr: [
    {
      name: 'moonshine-encoder.onnx',
      label: 'Speech model (encoder)',
      url: hf('moonshine-ai/moonshine', MOONSHINE_REV, 'onnx/merged/base/float/encoder_model.onnx'),
      size: 80818781,
      sha256: '153e128e7abd64a74ee47f2c3f585c3171c4d46cbb368b032827934c4e01e779',
    },
    {
      name: 'moonshine-decoder.onnx',
      label: 'Speech model (decoder)',
      url: hf(
        'moonshine-ai/moonshine',
        MOONSHINE_REV,
        'onnx/merged/base/float/decoder_model_merged.onnx'
      ),
      size: 166211345,
      sha256: '58778763ca8438963190244d6b26572bdca2cedec56a4b91e828f3f2d69ef3c5',
    },
    {
      name: 'moonshine-tokenizer.json',
      label: 'Speech model (vocabulary)',
      url: hf('moonshine-ai/moonshine', MOONSHINE_REV, 'onnx/merged/base/float/tokenizer.json'),
      size: 3761751,
      sha256: 'ad3a2ceb0e84e4da57451d86fa337f8116dcff5f5d106434f8aa0b0de89718b9',
    },
  ],
  // all-MiniLM-L6-v2 sentence embeddings (file names expected by LocalEmbeddingService).
  embedding: [
    {
      name: 'all-MiniLM-L6-v2.onnx',
      label: 'Search model',
      url: hf('sentence-transformers/all-MiniLM-L6-v2', MINILM_REV, 'onnx/model.onnx'),
      size: 90405214,
      sha256: '6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452',
    },
    {
      name: 'all-MiniLM-L6-v2-tokenizer.json',
      label: 'Search model (tokenizer)',
      url: hf('sentence-transformers/all-MiniLM-L6-v2', MINILM_REV, 'tokenizer.json'),
      size: 466247,
      sha256: 'be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037',
    },
    {
      name: 'all-MiniLM-L6-v2-vocab.txt',
      label: 'Search model (vocabulary)',
      url: hf('sentence-transformers/all-MiniLM-L6-v2', MINILM_REV, 'vocab.txt'),
      size: 231508,
      sha256: '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3',
    },
  ],
  // One language model for every hardware tier. The 3B variant that 12GB+
  // machines used to get is published under the Qwen Research License
  // (non-commercial; commercial use needs a licence from Alibaba Cloud), so it
  // cannot ship in a paid product. The 1.5B and 7B variants are Apache-2.0.
  llm: {
    name: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    label: 'AI Engine',
    url: hf(
      'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
      '91cad51170dc346986eccefdc2dd33a9da36ead9',
      'qwen2.5-1.5b-instruct-q4_k_m.gguf'
    ),
    size: 1117320736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  },
} satisfies Record<string, ModelFile | ModelFile[]>

/** Files written by earlier versions that no code path can use any more. */
const OBSOLETE_FILES = [
  'moonshine-base.onnx',
  'moonshine-preprocess.onnx',
  'moonshine-checksums.json',
  'whisper-checksums.json',
  'llm-checksums.json',
  'ggml-large-v3-turbo.bin',
  'ggml-large-v3-turbo.bin.partial',
  // Replaced by the Apache-2.0 1.5B model (see MODEL_FILES.llm)
  'qwen2.5-3b-instruct-q4_k_m.gguf',
  'qwen2.5-3b-instruct-q4_k_m.gguf.partial',
]

export class ModelDownloadService {
  private modelsDir: string
  private mainWindow: BrowserWindow | null = null

  constructor() {
    // In production: models live in userData (persists across updates, outside asar)
    // In dev: use project resources folder
    this.modelsDir = app.isPackaged
      ? path.join(app.getPath('userData'), 'models')
      : path.join(process.cwd(), 'resources', 'models')
    this.ensureModelsDirectory()
    // Copy bundled micro-models from extraResources to userData on first launch
    if (app.isPackaged) {
      this.copyBundledModels()
    }
  }

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  /**
   * Ensure models directory exists
   */
  private ensureModelsDirectory(): void {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true })
    }
  }

  /**
   * Copy bundled micro-models (silero_vad, MiniLM) from extraResources to userData
   */
  private copyBundledModels(): void {
    const bundledDir = path.join(process.resourcesPath, 'models')
    if (!fs.existsSync(bundledDir)) {
      log.warn(
        `Bundled models directory not found at ${bundledDir}. ` +
          'VAD (silero_vad.onnx) and local embeddings (MiniLM) will be unavailable until models are downloaded. ' +
          'Check extraResources config in package.json.'
      )
      return
    }
    const files = fs.readdirSync(bundledDir)
    if (files.length === 0) {
      log.warn(`Bundled models directory is empty: ${bundledDir}`)
      return
    }
    for (const file of files) {
      const src = path.join(bundledDir, file)
      const dest = path.join(this.modelsDir, file)
      if (!fs.existsSync(dest) && fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest)
        log.info(`Copied bundled model: ${file}`)
      }
    }
    log.info(`Bundled model copy complete. ${files.length} model files checked.`)
  }

  /**
   * Detect hardware tier based on available RAM
   */
  detectHardwareTier(): HardwareTierInfo {
    const totalRAM = os.totalmem() / 1024 / 1024 / 1024 // Convert to GB

    let tier: HardwareTier
    let recommendedASR: ModelType
    let recommendedLLM: 'qwen2.5:3b' | 'qwen2.5:1.5b'
    let totalRAMBudget: number

    if (totalRAM >= 16) {
      // High tier: 16GB+ RAM
      tier = 'high'
      // NOTE: Whisper native binding not yet integrated — always falls back to Moonshine.
      // Use moonshine-base to avoid downloading 1.5GB model that never runs.
      recommendedASR = 'moonshine-base'
      recommendedLLM = 'qwen2.5:1.5b'
      totalRAMBudget = 2.2 // 0.3GB (Moonshine) + 1.1GB (Qwen 1.5B) + 0.8GB (overhead)
    } else if (totalRAM >= 12) {
      // Mid tier: 12GB RAM
      tier = 'mid'
      recommendedASR = 'moonshine-base'
      recommendedLLM = 'qwen2.5:1.5b'
      totalRAMBudget = 2.2 // 0.3GB (Moonshine) + 1.1GB (Qwen 1.5B) + 0.8GB (overhead)
    } else {
      // Low tier: 8GB RAM
      tier = 'low'
      recommendedASR = 'moonshine-base'
      recommendedLLM = 'qwen2.5:1.5b'
      totalRAMBudget = 2.2 // 0.3GB (Moonshine) + 1.1GB (Qwen 1.5B) + 0.8GB (overhead)
    }

    return {
      tier,
      totalRAM: Math.round(totalRAM * 10) / 10,
      recommendedASR,
      recommendedLLM,
      totalRAMBudget,
    }
  }

  /**
   * Check if models are already downloaded
   *
   * Both model types resolve to the same Moonshine files — there is no Whisper
   * runtime ('whisper-turbo' is kept in the type for IPC compatibility).
   */
  areModelsDownloaded(_modelType: ModelType): boolean {
    return MODEL_FILES.asr.every(file => this.isFilePresent(file))
  }

  /** Local embedding model + tokenizer (semantic search). */
  areSupportModelsDownloaded(): boolean {
    return MODEL_FILES.embedding.every(file => this.isFilePresent(file))
  }

  /**
   * Check if LLM GGUF model is downloaded
   */
  isLLMDownloaded(tierInfo?: HardwareTierInfo): boolean {
    const info = tierInfo || this.detectHardwareTier()
    return this.isFilePresent(this.llmFileFor(info))
  }

  /**
   * Check if first launch (no models downloaded)
   */
  isFirstLaunch(): boolean {
    return !this.areModelsDownloaded('moonshine-base')
  }

  /**
   * Download the speech model (required) and the embedding model (optional)
   * with retry logic.
   */
  async downloadModelsForTier(tierInfo: HardwareTierInfo, maxRetries: number = 3): Promise<void> {
    if (this.areModelsDownloaded(tierInfo.recommendedASR)) {
      log.info('Speech model already downloaded')
    } else {
      log.info(`Downloading speech model for ${tierInfo.tier} tier...`)
      await this.withRetries('speech model', maxRetries, () => this.ensureFiles(MODEL_FILES.asr))
      this.removeObsoleteFiles()
    }

    // Semantic search needs the embedding model, its tokenizer and vocabulary.
    // Release builds do not bundle them, so fetch them here. Not fatal:
    // recording and transcription work without semantic search.
    if (!this.areSupportModelsDownloaded()) {
      try {
        await this.withRetries('search model', maxRetries, () =>
          this.ensureFiles(MODEL_FILES.embedding)
        )
      } catch (error) {
        log.warn('Search model download failed — semantic search stays unavailable:', error)
      }
    }
  }

  /**
   * Download LLM GGUF model for detected hardware tier with retry logic
   */
  async downloadLLMForTier(tierInfo: HardwareTierInfo, maxRetries: number = 3): Promise<void> {
    if (this.isLLMDownloaded(tierInfo)) {
      log.info('LLM model already downloaded')
      return
    }

    log.info(`Downloading AI model for ${tierInfo.tier} tier...`)
    await this.withRetries('AI model', maxRetries, () =>
      this.ensureFiles([this.llmFileFor(tierInfo)])
    )
    this.removeObsoleteFiles()
  }

  private llmFileFor(tierInfo: HardwareTierInfo): ModelFile {
    void tierInfo // every tier uses the same model for now
    return MODEL_FILES.llm
  }

  private async withRetries(
    what: string,
    maxRetries: number,
    task: () => Promise<void>
  ): Promise<void> {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await task()
        log.info(`${what} ready (attempt ${attempt})`)
        return
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error))
        log.error(`${what} download attempt ${attempt}/${maxRetries} failed:`, lastError.message)

        if (attempt < maxRetries) {
          // Exponential backoff: 5s, 10s, 20s
          const backoffMs = 5000 * Math.pow(2, attempt - 1)
          log.info(`Retrying in ${backoffMs / 1000} seconds...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
        }
      }
    }
    throw new Error(
      `Failed to download ${what} after ${maxRetries} attempts: ${lastError?.message}`
    )
  }

  // ── File-level download ────────────────────────────────────

  private pathFor(file: ModelFile): string {
    return path.join(this.modelsDir, file.name)
  }

  /** Present = exists with exactly the published size (a cheap check; see verifyFile). */
  private isFilePresent(file: ModelFile): boolean {
    try {
      return fs.statSync(this.pathFor(file)).size === file.size
    } catch {
      return false
    }
  }

  /** Downloads in flight, so two callers asking for the same file share one transfer. */
  private inFlight = new Map<string, Promise<void>>()

  private async ensureFiles(files: readonly ModelFile[]): Promise<void> {
    for (const file of files) {
      if (this.isFilePresent(file)) continue
      let pending = this.inFlight.get(file.name)
      if (!pending) {
        pending = this.downloadAndVerify(file).finally(() => this.inFlight.delete(file.name))
        this.inFlight.set(file.name, pending)
      }
      await pending
    }
  }

  /**
   * Download one file to `<name>.partial`, check it against the pinned size
   * and SHA-256, and only then move it into place. A truncated or tampered
   * download can therefore never be mistaken for a usable model.
   */
  private async downloadAndVerify(file: ModelFile): Promise<void> {
    const destPath = this.pathFor(file)
    const partialPath = destPath + '.partial'

    let existingBytes = 0
    try {
      existingBytes = fs.statSync(partialPath).size
    } catch {
      /* no partial file */
    }
    // A partial that is not smaller than the file cannot be resumed.
    if (existingBytes > file.size) {
      fs.rmSync(partialPath, { force: true })
      existingBytes = 0
    }

    if (existingBytes < file.size) {
      if (existingBytes > 0) {
        log.info(
          `Resuming ${file.label} download from ${(existingBytes / 1024 / 1024).toFixed(1)}MB`
        )
      }
      await this.fetchToFile(file, partialPath, existingBytes)
    }

    this.sendProgress({
      modelName: file.label,
      percent: 100,
      downloadedMB: file.size / 1024 / 1024,
      totalMB: file.size / 1024 / 1024,
      status: 'verifying',
    })

    const actualSize = fs.statSync(partialPath).size
    const actualHash = actualSize === file.size ? await this.calculateChecksum(partialPath) : ''
    if (actualSize !== file.size || actualHash !== file.sha256) {
      // Do not keep (or resume) data that is known to be wrong.
      fs.rmSync(partialPath, { force: true })
      const reason =
        actualSize !== file.size
          ? `size ${actualSize} bytes, expected ${file.size}`
          : 'checksum mismatch'
      const error = new Error(`${file.label} failed verification (${reason})`)
      this.sendProgress({
        modelName: file.label,
        percent: 0,
        downloadedMB: 0,
        totalMB: 0,
        status: 'error',
        error: error.message,
      })
      throw error
    }

    fs.renameSync(partialPath, destPath)
    this.sendProgress({
      modelName: file.label,
      percent: 100,
      downloadedMB: file.size / 1024 / 1024,
      totalMB: file.size / 1024 / 1024,
      status: 'complete',
    })
  }

  /**
   * Stream a file to disk, resuming from `startByte` when the server allows.
   */
  private fetchToFile(file: ModelFile, partialPath: string, startByte: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const STALL_TIMEOUT_MS = 2 * 60 * 1000
      let settled = false
      let stallTimer: ReturnType<typeof setTimeout> | null = null
      let out: fs.WriteStream | null = null
      let request: import('electron').ClientRequest | null = null
      let downloadedBytes = startByte
      let lastProgress = -5

      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (stallTimer) clearTimeout(stallTimer)
        if (error) {
          try {
            request?.abort()
          } catch {
            /* ignore */
          }
          // Keep the partial file — the next attempt resumes from it.
          out?.destroy()
          this.sendProgress({
            modelName: file.label,
            percent: 0,
            downloadedMB: 0,
            totalMB: 0,
            status: 'error',
            error: error.message,
          })
          reject(error)
          return
        }
        if (out) out.end(() => resolve())
        else resolve()
      }

      // Rolling stall timer — resets on every data chunk to detect mid-download stalls
      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer)
        stallTimer = setTimeout(
          () => finish(new Error(`Download stalled: ${file.label} — no data for 2 minutes`)),
          STALL_TIMEOUT_MS
        )
      }

      try {
        // Issue 14: Electron's net.request respects system proxy settings.
        const { net } = require('electron') as typeof import('electron')
        request = net.request({ url: file.url, redirect: 'follow' })
        if (startByte > 0) request.setHeader('Range', `bytes=${startByte}-`)
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)))
        return
      }

      resetStallTimer()

      request.on('response', response => {
        const status = response.statusCode
        if (status !== 200 && status !== 206) {
          finish(new Error(`Failed to download ${file.label}: HTTP ${status}`))
          return
        }

        // 200 in answer to a Range request: the server is sending the whole
        // file, so start over instead of appending.
        const appending = status === 206 && startByte > 0
        if (!appending) downloadedBytes = 0

        const stream = fs.createWriteStream(partialPath, { flags: appending ? 'a' : 'w' })
        out = stream
        // Disk full / permission errors arrive here; without a listener they
        // are uncaught exceptions in the main process.
        stream.on('error', err => finish(err))

        const pausable = response as unknown as { pause?: () => void; resume?: () => void }

        response.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length
          resetStallTimer()

          // Respect backpressure so a slow disk does not buffer the model in RAM.
          if (!stream.write(chunk) && pausable.pause && pausable.resume) {
            pausable.pause()
            stream.once('drain', () => pausable.resume?.())
          }

          const progress = Math.min(99, Math.floor((downloadedBytes / file.size) * 100))
          if (progress >= lastProgress + 5) {
            lastProgress = progress
            this.sendProgress({
              modelName: file.label,
              percent: progress,
              downloadedMB: downloadedBytes / 1024 / 1024,
              totalMB: file.size / 1024 / 1024,
              status: 'downloading',
            })
          }
        })

        response.on('end', () => finish())
        response.on('error', (error: Error) => finish(error))
        response.on('aborted', () => finish(new Error(`Download interrupted: ${file.label}`)))
      })

      request.on('error', (error: Error) => finish(error))
      request.end()
    })
  }

  /**
   * Calculate SHA-256 checksum of a file
   */
  private calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)

      stream.on('data', data => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  /**
   * Send progress update to renderer
   */
  private sendProgress(progress: ModelDownloadProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('model-download-progress', progress)
    }
  }

  /**
   * Remove model files from earlier versions that nothing can load:
   * the encoder-only Moonshine export (no decoder — it never produced text)
   * and the 1.6GB Whisper file (there is no Whisper runtime).
   */
  private removeObsoleteFiles(): void {
    for (const name of OBSOLETE_FILES) {
      const filePath = path.join(this.modelsDir, name)
      try {
        if (fs.existsSync(filePath)) {
          const sizeMB = fs.statSync(filePath).size / 1024 / 1024
          fs.rmSync(filePath, { force: true })
          log.info(`Removed obsolete model file ${name} (${sizeMB.toFixed(0)} MB)`)
        }
      } catch (error) {
        log.debug(`Could not remove obsolete model file ${name}:`, error)
      }
    }
  }

  /**
   * Verify model integrity against the pinned SHA-256 hashes
   */
  async verifyModel(_modelType: ModelType): Promise<boolean> {
    try {
      for (const file of MODEL_FILES.asr) {
        if (!this.isFilePresent(file)) return false
        if ((await this.calculateChecksum(this.pathFor(file))) !== file.sha256) return false
      }
      return true
    } catch (error) {
      log.error('Model verification failed:', error)
      return false
    }
  }

  /**
   * Get model file paths
   */
  getModelPaths(_modelType: ModelType): string[] {
    return MODEL_FILES.asr.map(file => this.pathFor(file))
  }

  /**
   * Delete model files (for re-download)
   */
  deleteModel(_modelType: ModelType): void {
    for (const file of MODEL_FILES.asr) {
      fs.rmSync(this.pathFor(file), { force: true })
      fs.rmSync(this.pathFor(file) + '.partial', { force: true })
    }
  }
}

// Singleton instance
let modelDownloadService: ModelDownloadService | null = null

export function getModelDownloadService(): ModelDownloadService {
  if (!modelDownloadService) {
    modelDownloadService = new ModelDownloadService()
  }
  return modelDownloadService
}
