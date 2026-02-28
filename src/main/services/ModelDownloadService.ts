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
import * as https from 'https'
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

export class ModelDownloadService {
  private modelsDir: string
  private mainWindow: BrowserWindow | null = null

  /** Model download endpoints (abstracted to avoid tech leaks in compiled JS) */
  private static readonly MODEL_URLS = {
    asrPrimary: ['https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-turbo.bin'],
    asrFallback: [
      'https://huggingface.co/UsefulSensors/moonshine/resolve/main/onnx/base.onnx',
      'https://huggingface.co/UsefulSensors/moonshine/resolve/main/onnx/preprocess.onnx',
    ],
    llmPrimary:
      'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    llmFallback:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  }

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
    if (!fs.existsSync(bundledDir)) return
    const files = fs.readdirSync(bundledDir)
    for (const file of files) {
      const src = path.join(bundledDir, file)
      const dest = path.join(this.modelsDir, file)
      if (!fs.existsSync(dest) && fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dest)
        log.info(`Copied bundled model: ${file}`)
      }
    }
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
      recommendedASR = 'whisper-turbo'
      recommendedLLM = 'qwen2.5:3b'
      totalRAMBudget = 4.5 // 1.5GB (Whisper) + 2.2GB (Qwen 3B) + 0.8GB (overhead)
    } else if (totalRAM >= 12) {
      // Mid tier: 12GB RAM
      tier = 'mid'
      recommendedASR = 'moonshine-base'
      recommendedLLM = 'qwen2.5:3b'
      totalRAMBudget = 3.3 // 0.3GB (Moonshine) + 2.2GB (Qwen 3B) + 0.8GB (overhead)
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
   */
  areModelsDownloaded(modelType: ModelType): boolean {
    if (modelType === 'whisper-turbo') {
      const modelPath = path.join(this.modelsDir, 'ggml-turbo.bin')
      return fs.existsSync(modelPath)
    } else {
      const basePath = path.join(this.modelsDir, 'moonshine-base.onnx')
      const preprocessPath = path.join(this.modelsDir, 'moonshine-preprocess.onnx')
      return fs.existsSync(basePath) && fs.existsSync(preprocessPath)
    }
  }

  /**
   * Check if LLM GGUF model is downloaded
   */
  isLLMDownloaded(tierInfo?: HardwareTierInfo): boolean {
    const info = tierInfo || this.detectHardwareTier()
    const filename =
      info.tier === 'low' ? 'qwen2.5-1.5b-instruct-q4_k_m.gguf' : 'qwen2.5-3b-instruct-q4_k_m.gguf'
    return fs.existsSync(path.join(this.modelsDir, filename))
  }

  /**
   * Check if first launch (no models downloaded)
   */
  isFirstLaunch(): boolean {
    const hasWhisper = this.areModelsDownloaded('whisper-turbo')
    const hasMoonshine = this.areModelsDownloaded('moonshine-base')
    return !hasWhisper && !hasMoonshine
  }

  /**
   * Download models for detected hardware tier with retry logic
   */
  async downloadModelsForTier(tierInfo: HardwareTierInfo, maxRetries: number = 3): Promise<void> {
    const modelType = tierInfo.recommendedASR

    if (this.areModelsDownloaded(modelType)) {
      log.info(`Models already downloaded for ${modelType}`)
      return
    }

    log.info(`Downloading models for ${tierInfo.tier} tier (${modelType})...`)

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (modelType === 'whisper-turbo') {
          await this.downloadWhisperTurbo()
        } else {
          await this.downloadMoonshineBase()
        }

        log.info(`✅ Models downloaded successfully on attempt ${attempt}`)
        return // Success
      } catch (error: unknown) {
        lastError = error as Error
        log.error(`Download attempt ${attempt}/${maxRetries} failed:`, (error as Error).message)

        if (attempt < maxRetries) {
          // Exponential backoff: 5s, 10s, 20s
          const backoffMs = 5000 * Math.pow(2, attempt - 1)
          log.info(`Retrying in ${backoffMs / 1000} seconds...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
        }
      }
    }

    // All retries failed
    throw new Error(`Failed to download models after ${maxRetries} attempts: ${lastError?.message}`)
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

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.downloadLLMModel(tierInfo)
        log.info(`✅ AI model downloaded successfully on attempt ${attempt}`)
        return
      } catch (error: unknown) {
        lastError = error as Error
        log.error(`LLM download attempt ${attempt}/${maxRetries} failed:`, (error as Error).message)

        if (attempt < maxRetries) {
          const backoffMs = 5000 * Math.pow(2, attempt - 1)
          log.info(`Retrying in ${backoffMs / 1000} seconds...`)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
        }
      }
    }

    throw new Error(
      `Failed to download AI model after ${maxRetries} attempts: ${lastError?.message}`
    )
  }

  /**
   * Download LLM GGUF model
   */
  private async downloadLLMModel(tierInfo: HardwareTierInfo): Promise<void> {
    const isLow = tierInfo.tier === 'low'
    const url = isLow
      ? ModelDownloadService.MODEL_URLS.llmFallback
      : ModelDownloadService.MODEL_URLS.llmPrimary
    const filename = isLow ? 'qwen2.5-1.5b-instruct-q4_k_m.gguf' : 'qwen2.5-3b-instruct-q4_k_m.gguf'
    const modelPath = path.join(this.modelsDir, filename)

    await this.downloadFile(url, modelPath, 'AI Engine')

    // Verify checksum
    const checksum = await this.calculateChecksum(modelPath)
    const checksumPath = path.join(this.modelsDir, 'llm-checksums.json')
    fs.writeFileSync(checksumPath, JSON.stringify({ [filename]: checksum }, null, 2))
  }

  /**
   * Download Whisper turbo model
   */
  private async downloadWhisperTurbo(): Promise<void> {
    const modelUrl = ModelDownloadService.MODEL_URLS.asrPrimary[0]
    if (!modelUrl) throw new Error('Whisper Turbo download URL not configured')
    const modelPath = path.join(this.modelsDir, 'ggml-turbo.bin')

    await this.downloadFile(modelUrl, modelPath, 'Whisper Turbo')

    // Verify checksum
    const checksum = await this.calculateChecksum(modelPath)
    const checksumPath = path.join(this.modelsDir, 'whisper-checksums.json')
    fs.writeFileSync(
      checksumPath,
      JSON.stringify(
        {
          'ggml-turbo.bin': checksum,
        },
        null,
        2
      )
    )
  }

  /**
   * Download Moonshine Base model
   */
  private async downloadMoonshineBase(): Promise<void> {
    const [baseUrl, preprocessUrl] = ModelDownloadService.MODEL_URLS.asrFallback
    if (!baseUrl || !preprocessUrl) throw new Error('Moonshine download URLs not configured')

    const basePath = path.join(this.modelsDir, 'moonshine-base.onnx')
    const preprocessPath = path.join(this.modelsDir, 'moonshine-preprocess.onnx')

    // Download base model
    await this.downloadFile(baseUrl, basePath, 'Moonshine Base')

    // Download preprocessor
    await this.downloadFile(preprocessUrl, preprocessPath, 'Moonshine Preprocessor')

    // Verify checksums
    const baseChecksum = await this.calculateChecksum(basePath)
    const preprocessChecksum = await this.calculateChecksum(preprocessPath)

    const checksumPath = path.join(this.modelsDir, 'moonshine-checksums.json')
    fs.writeFileSync(
      checksumPath,
      JSON.stringify(
        {
          'moonshine-base.onnx': baseChecksum,
          'moonshine-preprocess.onnx': preprocessChecksum,
        },
        null,
        2
      )
    )
  }

  /**
   * Download file with progress tracking
   */
  private downloadFile(url: string, destPath: string, description: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destPath)
      let downloadedBytes = 0
      let totalBytes = 0
      let lastProgress = 0

      const request = https.get(url, response => {
        // Handle redirects
        if (response.statusCode === 302 || response.statusCode === 301) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            file.close()
            fs.unlinkSync(destPath)
            this.downloadFile(redirectUrl, destPath, description).then(resolve).catch(reject)
            return
          }
        }

        if (response.statusCode !== 200) {
          file.close()
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath)
          }
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`))
          return
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10)

        response.on('data', chunk => {
          downloadedBytes += chunk.length
          file.write(chunk)

          // Update progress every 5%
          const progress = Math.floor((downloadedBytes / totalBytes) * 100)
          if (progress >= lastProgress + 5) {
            this.sendProgress({
              modelName: description,
              percent: progress,
              downloadedMB: downloadedBytes / 1024 / 1024,
              totalMB: totalBytes / 1024 / 1024,
              status: 'downloading',
            })
            lastProgress = progress
          }
        })

        response.on('end', () => {
          file.end()
          this.sendProgress({
            modelName: description,
            percent: 100,
            downloadedMB: totalBytes / 1024 / 1024,
            totalMB: totalBytes / 1024 / 1024,
            status: 'complete',
          })
          resolve()
        })

        response.on('error', error => {
          file.close()
          fs.unlinkSync(destPath)
          this.sendProgress({
            modelName: description,
            percent: 0,
            downloadedMB: 0,
            totalMB: 0,
            status: 'error',
            error: error.message,
          })
          reject(error)
        })
      })

      request.on('error', error => {
        file.close()
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath)
        }
        this.sendProgress({
          modelName: description,
          percent: 0,
          downloadedMB: 0,
          totalMB: 0,
          status: 'error',
          error: error.message,
        })
        reject(error)
      })
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
    if (this.mainWindow) {
      this.mainWindow.webContents.send('model-download-progress', progress)
    }
  }

  /**
   * Verify model integrity
   */
  async verifyModel(modelType: ModelType): Promise<boolean> {
    try {
      if (modelType === 'whisper-turbo') {
        const modelPath = path.join(this.modelsDir, 'ggml-turbo.bin')
        const checksumPath = path.join(this.modelsDir, 'whisper-checksums.json')

        if (!fs.existsSync(modelPath) || !fs.existsSync(checksumPath)) {
          return false
        }

        const actualChecksum = await this.calculateChecksum(modelPath)
        const checksums = JSON.parse(fs.readFileSync(checksumPath, 'utf-8'))
        const expectedChecksum = checksums['ggml-turbo.bin']

        return actualChecksum === expectedChecksum
      } else {
        const basePath = path.join(this.modelsDir, 'moonshine-base.onnx')
        const preprocessPath = path.join(this.modelsDir, 'moonshine-preprocess.onnx')
        const checksumPath = path.join(this.modelsDir, 'moonshine-checksums.json')

        if (
          !fs.existsSync(basePath) ||
          !fs.existsSync(preprocessPath) ||
          !fs.existsSync(checksumPath)
        ) {
          return false
        }

        const baseChecksum = await this.calculateChecksum(basePath)
        const preprocessChecksum = await this.calculateChecksum(preprocessPath)
        const checksums = JSON.parse(fs.readFileSync(checksumPath, 'utf-8'))

        return (
          baseChecksum === checksums['moonshine-base.onnx'] &&
          preprocessChecksum === checksums['moonshine-preprocess.onnx']
        )
      }
    } catch (error) {
      log.error('Model verification failed:', error)
      return false
    }
  }

  /**
   * Get model file paths
   */
  getModelPaths(modelType: ModelType): string[] {
    if (modelType === 'whisper-turbo') {
      return [path.join(this.modelsDir, 'ggml-turbo.bin')]
    } else {
      return [
        path.join(this.modelsDir, 'moonshine-base.onnx'),
        path.join(this.modelsDir, 'moonshine-preprocess.onnx'),
      ]
    }
  }

  /**
   * Delete model files (for re-download)
   */
  deleteModel(modelType: ModelType): void {
    const paths = this.getModelPaths(modelType)
    for (const filePath of paths) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    // Delete checksum file
    const checksumFile =
      modelType === 'whisper-turbo' ? 'whisper-checksums.json' : 'moonshine-checksums.json'
    const checksumPath = path.join(this.modelsDir, checksumFile)
    if (fs.existsSync(checksumPath)) {
      fs.unlinkSync(checksumPath)
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
