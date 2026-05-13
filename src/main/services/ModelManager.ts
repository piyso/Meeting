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

  // Session pool — reuse sessions per use-case to avoid create/dispose overhead
  // P2-3 FIX: Cap pool size to prevent unbounded GPU memory accumulation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sessionPool: Map<string, { session: any; lastUsed: number }> = new Map()
  private readonly SESSION_IDLE_MS = 60_000 // Dispose idle sessions after 60s
  private readonly MAX_SESSIONS = 5 // P2-3: Prevent unbounded GPU memory growth

  // P1-10 FIX: Single cleanup timer — prevents O(n²) timer stacking when
  // multiple sessions are created in quick succession.
  private cleanupTimerId: ReturnType<typeof setTimeout> | null = null

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
    this.resetUnloadTimer()

    if (!_context || !_model) {
      throw new Error('AI engine not loaded')
    }

    try {
      const llamaModule = await import('node-llama-cpp')
      const poolKey = sessionKey || '_default'

      // Get or create session from pool
      let session: InstanceType<typeof llamaModule.LlamaChatSession>
      const cached = this.sessionPool.get(poolKey)
      if (cached) {
        session = cached.session
        cached.lastUsed = Date.now()
      } else {
        // P2-3 FIX: Evict LRU session if pool is at capacity
        if (this.sessionPool.size >= this.MAX_SESSIONS) {
          let oldestKey = ''
          let oldestTime = Infinity
          for (const [k, v] of this.sessionPool) {
            if (v.lastUsed < oldestTime) {
              oldestTime = v.lastUsed
              oldestKey = k
            }
          }
          if (oldestKey) {
            try {
              this.sessionPool.get(oldestKey)?.session?.dispose?.()
            } catch {
              /* ignore dispose errors */
            }
            this.sessionPool.delete(oldestKey)
          }
        }

        session = new llamaModule.LlamaChatSession({
          contextSequence: _context.getSequence(),
        })
        this.sessionPool.set(poolKey, { session, lastUsed: Date.now() })

        // Schedule idle session cleanup
        this.scheduleSessionCleanup()
      }

      let fullResponse = ''

      const response = await session.prompt(options.prompt, {
        maxTokens: options.maxTokens ?? 100,
        temperature: options.temperature ?? 0.1,
        topP: options.topP ?? 0.9,
        topK: options.topK ?? 40,
        customStopTriggers: options.stop,
        onTextChunk: (text: string) => {
          // P1-2 FIX: Check abort signal on every token to stop inference
          // mid-stream when user cancels. Without this, cancelled requests
          // continue burning GPU cycles until maxTokens is exhausted.
          if (options.signal?.aborted) {
            throw new DOMException('Generation aborted', 'AbortError')
          }
          fullResponse += text
          options.onToken?.(fullResponse)
        },
      })

      return (response ?? fullResponse).trim()
    } catch (error) {
      // Session is broken — remove from pool so next call creates fresh one
      const poolKey = sessionKey || '_default'
      const cached = this.sessionPool.get(poolKey)
      if (cached) {
        try {
          cached.session.dispose()
        } catch {
          /* ignore */
        }
        this.sessionPool.delete(poolKey)
      }
      this.log.error('AI generation failed', error)
      throw error
    }
  }

  /**
   * Clean up idle sessions from the pool.
   * P1-10 FIX: Uses a single tracked timer. Previously, every new session
   * spawned an independent setTimeout → O(n²) callbacks over time.
   */
  private scheduleSessionCleanup(): void {
    // Already have a cleanup timer pending — don't stack another
    if (this.cleanupTimerId) return

    // M-4 AUDIT: .unref() prevents this timer from blocking clean process exit
    this.cleanupTimerId = setTimeout(() => {
      this.cleanupTimerId = null
      const now = Date.now()
      for (const [key, entry] of this.sessionPool) {
        if (now - entry.lastUsed > this.SESSION_IDLE_MS) {
          try {
            entry.session.dispose()
          } catch {
            /* ignore */
          }
          this.sessionPool.delete(key)
          this.log.debug(`Session pool: disposed idle session '${key}'`)
        }
      }
      // Reschedule if pool not empty
      if (this.sessionPool.size > 0) {
        this.scheduleSessionCleanup()
      }
    }, this.SESSION_IDLE_MS)
    this.cleanupTimerId.unref()
  }

  /**
   * Dispose all pooled sessions (called during model unload)
   */
  private disposeAllSessions(): void {
    for (const [key, entry] of this.sessionPool) {
      try {
        entry.session.dispose()
      } catch {
        /* ignore */
      }
      this.log.debug(`Session pool: disposed session '${key}' on unload`)
    }
    this.sessionPool.clear()
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
    if (this.isLoading) return // Don't unload while a load is in progress

    this.isUnloading = true
    this.unloadPromise = new Promise<void>(resolve => {
      this.unloadResolve = resolve
    })
    try {
      // Dispose all pooled sessions before unloading model
      this.disposeAllSessions()

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
      // P1-10 FIX: Clear session cleanup timer on unload
      if (this.cleanupTimerId) {
        clearTimeout(this.cleanupTimerId)
        this.cleanupTimerId = null
      }
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
