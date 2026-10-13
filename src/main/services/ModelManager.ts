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
import { execFileSync } from 'child_process'
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
  /**
   * P1-2 FIX: If provided, the generation will be aborted when this signal
   * fires. Checked in the onTextChunk callback to stop inference mid-stream.
   */
  signal?: AbortSignal
}

// Lazy-loaded node-llama-cpp types (ESM module loaded via dynamic import)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _llama: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _model: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _context: any = null

/**
 * Memory that can actually be handed to a new allocation, in MB.
 *
 * os.freemem() on macOS counts only completely unused pages. macOS keeps
 * almost all RAM in use as file cache and reclaims it on demand, so a 16GB
 * Mac routinely reports a few hundred MB "free" and the pre-flight guard
 * refused to load the model on machines with plenty of room. Count the
 * reclaimable page classes as well.
 */
function getAvailableMemoryMB(): number {
  const freeMB = Math.round(os.freemem() / 1024 ** 2)
  if (process.platform !== 'darwin') return freeMB
  try {
    const out = execFileSync('/usr/bin/vm_stat', { encoding: 'utf8', timeout: 2000 })
    const pageSize = Number(/page size of (\d+) bytes/.exec(out)?.[1]) || 16384
    const pages = (label: string): number =>
      Number(new RegExp(`${label}:\\s+(\\d+)`).exec(out)?.[1]) || 0
    const reclaimable =
      pages('Pages free') +
      pages('Pages inactive') +
      pages('Pages speculative') +
      pages('Pages purgeable')
    return Math.max(freeMB, Math.round((reclaimable * pageSize) / 1024 ** 2))
  } catch {
    return freeMB
  }
}

export class ModelManager {
  private llmLoaded = false
  private unloadTimer: ReturnType<typeof setTimeout> | null = null
  private cachedTier: HardwareTier | null = null
  private log = Logger.create('ModelManager')
  private isLoading = false
  private isUnloading = false
  private unloadPromise: Promise<void> | null = null
  private unloadResolve: (() => void) | null = null
  private loadPromise: Promise<void> | null = null
  private loadResolve: (() => void) | null = null

  // Generation mutex — serializes all generate() calls to prevent deadlock.
  // node-llama-cpp LlamaChatSession.prompt() is NOT reentrant: calling prompt()
  // on ANY session while a previous prompt() is running on the same context
  // causes the second call to hang forever (internal context sequence lock).
  // This queue ensures only one inference runs at a time.
  private generateQueue: Promise<string> = Promise.resolve('')

  /** Generations currently running — the idle unloader must not fire under them. */
  private activeGenerations = 0

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
    const modelSizeMB = 1100 // Qwen 2.5 1.5B (Q4_K_M) on every tier
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
        llmModel: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        asrModel: 'asr-primary',
      }
    } else if (totalRAM >= 12) {
      this.cachedTier = {
        ram: totalRAM,
        tier: 'mid',
        llmModel: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
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
    // Wait for any in-progress unload to complete before loading
    if (this.isUnloading && this.unloadPromise) {
      const TIMEOUT = 10_000
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          this.unloadPromise,
          new Promise<void>((_, reject) => {
            timeoutId = setTimeout(() => {
              this.isUnloading = false // Force-clear stuck flag
              reject(new Error('Timed out waiting for model unload'))
            }, TIMEOUT)
          }),
        ]).finally(() => {
          if (timeoutId) clearTimeout(timeoutId)
        })
      } catch (err) {
        this.log.warn((err as Error).message)
      }
    }

    // TOCTOU fix: Check isLoading FIRST — prevents concurrent callers
    // from both passing the llmLoaded check and entering the load path
    if (this.isLoading && this.loadPromise) {
      await this.loadPromise
      return
    }

    if (this.llmLoaded && _context) {
      this.resetUnloadTimer()
      return
    }

    this.isLoading = true
    this.loadPromise = new Promise<void>(resolve => {
      this.loadResolve = resolve
    })

    try {
      const modelPath = this.getModelPath()

      if (!fs.existsSync(modelPath)) {
        // The model is normally fetched during onboarding. It can be missing
        // afterwards — the download was skipped or failed, or an update
        // changed which model the app uses. The old message promised a
        // download "on next app launch" that nothing performed; start it now
        // (resumable, and a second request joins the one in progress).
        this.startModelDownload()
        throw new Error(
          'The AI model is being downloaded (about 1.1 GB). AI features will work as soon as it finishes — try again in a few minutes.'
        )
      }

      // Pre-flight memory guard: refuse to load if not enough free RAM
      const freeRAMMB = getAvailableMemoryMB()
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
      if (this.loadResolve) {
        this.loadResolve()
        this.loadResolve = null
        this.loadPromise = null
      }
    }
  }

  /**
   * Generate text from a prompt using the loaded LLM.
   * Uses session pool to reuse LlamaChatSession instances per use-case.
   *
   * @param options - Generation options
   * @param sessionKey - Optional session key for pooling (e.g., 'askMeetings', 'digest')
   */
  async generate(options: GenerateOptions, sessionKey?: string): Promise<string> {
    // Serialize all generation calls through the mutex queue.
    // This prevents deadlock when two features (e.g., note:expand and
    // intelligence:askMeetings) call generate() concurrently — the second
    // caller awaits the first to finish instead of deadlocking on the
    // shared LlamaContext's internal sequence lock.
    const result = this.generateQueue.then(
      () => this._doGenerate(options, sessionKey),
      () => this._doGenerate(options, sessionKey) // Also chain on rejection
    )
    // Update queue head (whether this call succeeds or fails, next caller proceeds)
    this.generateQueue = result.catch(() => '')
    return result
  }

  /**
   * Internal generation — called serialized through the mutex queue.
   */
  private async _doGenerate(options: GenerateOptions, sessionKey?: string): Promise<string> {
    await this.ensureLLMLoaded()

    if (!_context || !_model) {
      throw new Error('AI engine not loaded')
    }

    // Hold the idle unloader off for as long as this generation runs. The
    // timer used to be armed once at the start, so a generation longer than
    // the idle timeout (30s on low-RAM machines) had its model disposed
    // underneath it.
    this.activeGenerations++
    if (this.unloadTimer) {
      clearTimeout(this.unloadTimer)
      this.unloadTimer = null
    }

    // One session per request, disposed afterwards together with its context
    // sequence:
    //  - A LlamaChatSession keeps its conversation. Reusing one per feature
    //    fed every earlier prompt and answer back into unrelated requests and
    //    slowly filled the context window.
    //  - The context has a single sequence and a session does not release it
    //    on dispose() unless asked to, so a second pooled session failed with
    //    "No sequences left" until the model was unloaded.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let session: any = null
    try {
      const llamaModule = await import('node-llama-cpp')
      session = new llamaModule.LlamaChatSession({
        contextSequence: _context.getSequence(),
        autoDisposeSequence: true,
      })

      let fullResponse = ''

      const response = await session.prompt(options.prompt, {
        maxTokens: options.maxTokens ?? 100,
        temperature: options.temperature ?? 0.1,
        topP: options.topP ?? 0.9,
        topK: options.topK ?? 40,
        customStopTriggers: options.stop,
        signal: options.signal,
        stopOnAbortSignal: true,
        onTextChunk: (text: string) => {
          fullResponse += text
          options.onToken?.(fullResponse)
        },
      })

      if (options.signal?.aborted) {
        const abortErr = new Error('Generation aborted')
        abortErr.name = 'AbortError'
        throw abortErr
      }

      return (response ?? fullResponse).trim()
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        this.log.error(`AI generation failed (${sessionKey || 'default'})`, error)
      }
      throw error
    } finally {
      try {
        session?.dispose()
      } catch {
        /* ignore dispose errors */
      }
      this.activeGenerations--
      this.resetUnloadTimer()
    }
  }

  private modelDownload: Promise<void> | null = null

  /** Fetch the language model in the background (one download at a time). */
  private startModelDownload(): void {
    if (this.modelDownload) return
    this.modelDownload = (async () => {
      try {
        const { getModelDownloadService } = await import('./ModelDownloadService')
        const service = getModelDownloadService()
        await service.downloadLLMForTier(service.detectHardwareTier())
        this.log.info('AI model downloaded')
      } catch (err) {
        this.log.warn('AI model download failed — it resumes on the next AI request', err)
      } finally {
        this.modelDownload = null
      }
    })()
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
    this.unloadTimer = setTimeout(() => {
      this.unloadLLM().catch(err => this.log.debug('Idle unload failed', err))
    }, this.getIdleTimeout())
    if (this.unloadTimer.unref) this.unloadTimer.unref()
  }

  /**
   * Unload LLM to free RAM after idle timeout (60s)
   */
  private async unloadLLM(): Promise<void> {
    if (!this.llmLoaded) return
    if (this.isLoading) return // Don't unload while a load is in progress
    if (this.activeGenerations > 0) {
      // Still generating — try again after the next idle period.
      this.resetUnloadTimer()
      return
    }

    this.isUnloading = true
    this.unloadPromise = new Promise<void>(resolve => {
      this.unloadResolve = resolve
    })
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
    } finally {
      // P1-11 FIX: Always reset state, even on partial unload failure.
      // Without this, a failed dispose() leaves llmLoaded=true while
      // _model/_context are in an undefined state → zombie engine.
      this.llmLoaded = false
      _context = null
      _model = null
      this.isUnloading = false
      if (this.unloadResolve) {
        this.unloadResolve()
        this.unloadResolve = null
        this.unloadPromise = null
      }
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
