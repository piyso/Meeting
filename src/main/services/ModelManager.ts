/**
 * ModelManager — Manages LLM lifecycle with node-llama-cpp
 *
 * Replaces Ollama HTTP API with direct node-llama-cpp integration.
 * Models run in-process via Metal GPU (macOS) / Vulkan (Win/Linux).
 *
 * Blueprint §2.4 (L1036-1075):
 * - ASR stays loaded for entire meeting (always needed)
 * - LLM loads on-demand when user presses Ctrl+Enter
 * - LLM unloads after 60s of no AI requests to free RAM
 * - Detects hardware tier to select optimal model
 */

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { Logger } from './Logger'

export interface HardwareTier {
  ram: number
  tier: 'high' | 'mid' | 'low'
  llmModel: string
  asrModel: string
}

/** Options for text generation */
export interface GenerateOptions {
  prompt: string
  temperature?: number
  topP?: number
  topK?: number
  maxTokens?: number
  stop?: string[]
  /** If provided, called with partial text as tokens stream */
  onToken?: (partial: string) => void
}

// Lazy-loaded node-llama-cpp types (ESM module loaded via dynamic import)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _llama: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _model: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _context: any = null

export class ModelManager {
  private llmLoaded = false
  private unloadTimer: ReturnType<typeof setTimeout> | null = null
  private cachedTier: HardwareTier | null = null
  private log = Logger.create('ModelManager')
  private isLoading = false

  /** Idle timeout varies by tier: 8GB=30s (aggressive), 12GB=60s, 16GB+=120s (warm) */
  private getIdleTimeout(): number {
    const tier = this.detectHardwareTier()
    switch (tier.tier) {
      case 'high':
        return 120_000
      case 'mid':
        return 60_000
      case 'low':
        return 30_000
    }
  }

  /** Minimum free RAM (MB) required to load a model — model size + 500MB buffer */
  private getMinFreeRAM(): number {
    const tier = this.detectHardwareTier()
    const modelSizeMB = tier.tier === 'low' ? 1100 : 2200 // Qwen 1.5B vs 3B
    return modelSizeMB + 500 // buffer for GPU context + inference overhead
  }

  /**
   * Detect hardware tier based on available RAM.
   * Blueprint §2.4: 16GB+ → high, 12GB → mid, 8GB → low
   */
  detectHardwareTier(): HardwareTier {
    if (this.cachedTier) return this.cachedTier

    const totalRAM = Math.round(os.totalmem() / 1024 ** 3)

    if (totalRAM >= 16) {
      this.cachedTier = {
        ram: totalRAM,
        tier: 'high',
        llmModel: 'qwen2.5-3b-instruct-q4_k_m.gguf',
        asrModel: 'asr-primary',
      }
    } else if (totalRAM >= 12) {
      this.cachedTier = {
        ram: totalRAM,
        tier: 'mid',
        llmModel: 'qwen2.5-3b-instruct-q4_k_m.gguf',
        asrModel: 'asr-fallback',
      }
    } else {
      this.cachedTier = {
        ram: totalRAM,
        tier: 'low',
        llmModel: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        asrModel: 'asr-fallback',
      }
    }
    return this.cachedTier
  }

  /**
   * Get the model file path based on hardware tier.
   * In production: userData/models/
   * In development: resources/models/
   */
  private getModelPath(): string {
    const tier = this.detectHardwareTier()
    const modelsDir = app.isPackaged
      ? path.join(app.getPath('userData'), 'models')
      : path.join(process.cwd(), 'resources', 'models')
    return path.join(modelsDir, tier.llmModel)
  }

  /**
   * Check if the LLM model file exists on disk
   */
  isModelDownloaded(): boolean {
    const modelPath = this.getModelPath()
    return fs.existsSync(modelPath)
  }

  /**
   * Ensure LLM is loaded (on-demand for Ctrl+Enter expansion).
   * Uses dynamic import() to load ESM-only node-llama-cpp from CJS context.
   * Resets the idle unload timer each time.
   */
  async ensureLLMLoaded(): Promise<void> {
    if (this.llmLoaded && _context) {
      this.resetUnloadTimer()
      return
    }

    if (this.isLoading) {
      // Wait for current load to finish
      await new Promise<void>(resolve => {
        const check = setInterval(() => {
          if (!this.isLoading) {
            clearInterval(check)
            resolve()
          }
        }, 100)
      })
      return
    }

    this.isLoading = true

    try {
      const modelPath = this.getModelPath()

      if (!fs.existsSync(modelPath)) {
        throw new Error(
          `AI model not found at ${modelPath}. It will be downloaded on next app launch.`
        )
      }

      // Pre-flight memory guard: refuse to load if not enough free RAM
      const freeRAMMB = Math.round(os.freemem() / 1024 ** 2)
      const requiredMB = this.getMinFreeRAM()
      if (freeRAMMB < requiredMB) {
        throw new Error(
          `Insufficient RAM to load AI model. Need ${requiredMB}MB free but only ${freeRAMMB}MB available. ` +
            `Close other applications and try again, or the model will load automatically when RAM frees up.`
        )
      }

      this.log.info('Loading AI engine...')

      // Dynamic import of ESM module from CJS context
      if (!_llama) {
        const llamaModule = await import('node-llama-cpp')
        _llama = await llamaModule.getLlama()
        this.log.info(`AI engine initialized (GPU: ${_llama.gpu})`)
      }

      // Load model
      if (!_model) {
        _model = await _llama.loadModel({ modelPath })
        this.log.info('AI model loaded')
      }

      // Create context for inference
      if (!_context) {
        _context = await _model.createContext({ contextSize: 4096 })
        this.log.info('AI context ready')
      }

      this.llmLoaded = true
      this.resetUnloadTimer()
      this.log.info('AI engine ready')
    } catch (error) {
      this.log.warn('Failed to load AI engine', error)
      throw error
    } finally {
      this.isLoading = false
    }
  }

  /**
   * Generate text from a prompt using the loaded LLM.
   * Replaces all `fetch(OLLAMA_BASE_URL/api/generate)` calls.
   */
  async generate(options: GenerateOptions): Promise<string> {
    await this.ensureLLMLoaded()
    this.resetUnloadTimer()

    if (!_context || !_model) {
      throw new Error('AI engine not loaded')
    }

    try {
      const llamaModule = await import('node-llama-cpp')
      const session = new llamaModule.LlamaChatSession({
        contextSequence: _context.getSequence(),
      })

      let fullResponse = ''

      const response = await session.prompt(options.prompt, {
        maxTokens: options.maxTokens ?? 100,
        temperature: options.temperature ?? 0.1,
        topP: options.topP ?? 0.9,
        topK: options.topK ?? 40,
        customStopTriggers: options.stop,
        onTextChunk: (text: string) => {
          fullResponse += text
          options.onToken?.(fullResponse)
        },
      })

      // Clean up session
      session.dispose()

      return (response ?? fullResponse).trim()
    } catch (error) {
      this.log.error('AI generation failed', error)
      throw error
    }
  }

  /**
   * Get the correct LLM model filename for this machine's tier
   */
  getLLMModel(): string {
    return this.detectHardwareTier().llmModel
  }

  /**
   * Check if the AI engine is available and ready
   */
  isAvailable(): boolean {
    return this.llmLoaded && _context !== null
  }

  /**
   * Reset the idle timer — called after each AI request
   */
  private resetUnloadTimer(): void {
    if (this.unloadTimer) clearTimeout(this.unloadTimer)
    this.unloadTimer = setTimeout(() => this.unloadLLM(), this.getIdleTimeout())
  }

  /**
   * Unload LLM to free RAM after idle timeout (60s)
   */
  private async unloadLLM(): Promise<void> {
    if (!this.llmLoaded) return

    try {
      if (_context) {
        await _context.dispose()
        _context = null
      }
      if (_model) {
        await _model.dispose()
        _model = null
      }
      // Keep _llama (Metal/Vulkan engine) loaded — it's lightweight

      this.llmLoaded = false
      this.log.info('AI model unloaded to free RAM')
    } catch (err) {
      this.log.debug('AI unload skipped', err)
    }
  }

  /**
   * Force unload all models (called by intelligence:unloadModels)
   */
  async forceUnload(): Promise<void> {
    if (this.unloadTimer) {
      clearTimeout(this.unloadTimer)
      this.unloadTimer = null
    }
    await this.unloadLLM()
  }

  /**
   * Get live resource usage for IPC reporting
   */
  getResourceUsage(): {
    totalRAM: number
    freeRAM: number
    llmLoaded: boolean
    tier: string
    idleTimeoutMs: number
  } {
    const tier = this.detectHardwareTier()
    return {
      totalRAM: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      freeRAM: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
      llmLoaded: this.llmLoaded,
      tier: tier.tier,
      idleTimeoutMs: this.getIdleTimeout(),
    }
  }
}

// Singleton
let instance: ModelManager | null = null

export function getModelManager(): ModelManager {
  if (!instance) {
    instance = new ModelManager()
  }
  return instance
}
