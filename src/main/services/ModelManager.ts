/**
 * ModelManager — Manages LLM lifecycle with idle unloading
 *
 * Blueprint §2.4 (L1036-1075):
 * - ASR stays loaded for entire meeting (always needed)
 * - LLM loads on-demand when user presses Ctrl+Enter
 * - LLM unloads after 60s of no AI requests to free RAM
 * - Detects hardware tier to select optimal model
 */

import { config } from '../config/environment'
import { Logger } from './Logger'

import os from 'os'

export interface HardwareTier {
  ram: number
  tier: 'high' | 'mid' | 'low'
  llmModel: string
  asrModel: string
}

export class ModelManager {
  private llmLoaded = false
  private unloadTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly IDLE_TIMEOUT = 60_000 // Unload after 60s of no AI requests
  private log = Logger.create('ModelManager')

  /**
   * Detect hardware tier based on available RAM.
   * Blueprint §2.4: 16GB+ → high, 12GB → mid, 8GB → low
   * Note: asrModel uses abstract identifiers to prevent tech leaks in compiled JS
   */
  detectHardwareTier(): HardwareTier {
    const totalRAM = Math.round(os.totalmem() / 1024 ** 3)

    if (totalRAM >= 16) {
      return {
        ram: totalRAM,
        tier: 'high',
        llmModel: 'qwen2.5:3b',
        asrModel: 'asr-primary',
      }
    } else if (totalRAM >= 12) {
      return {
        ram: totalRAM,
        tier: 'mid',
        llmModel: 'qwen2.5:3b',
        asrModel: 'asr-fallback',
      }
    } else {
      return {
        ram: totalRAM,
        tier: 'low',
        llmModel: 'qwen2.5:1.5b',
        asrModel: 'asr-fallback',
      }
    }
  }

  /**
   * Ensure LLM is loaded (on-demand for Ctrl+Enter expansion).
   * Resets the idle unload timer each time.
   */
  async ensureLLMLoaded(): Promise<void> {
    if (this.llmLoaded) {
      this.resetUnloadTimer()
      return
    }

    const tier = this.detectHardwareTier()
    this.log.info(`Loading ${tier.llmModel} on-demand...`)

    try {
      await fetch(`${config.OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: tier.llmModel,
          prompt: '',
          keep_alive: '60s',
        }),
      })
      this.llmLoaded = true
      this.resetUnloadTimer()
      this.log.info(`${tier.llmModel} loaded`)
    } catch (error) {
      this.log.warn('Failed to preload LLM', error)
    }
  }

  /**
   * Get the correct LLM model name for this machine's tier
   */
  getLLMModel(): string {
    return this.detectHardwareTier().llmModel
  }

  /**
   * Reset the idle timer — called after each AI request
   */
  private resetUnloadTimer(): void {
    if (this.unloadTimer) clearTimeout(this.unloadTimer)
    this.unloadTimer = setTimeout(() => this.unloadLLM(), ModelManager.IDLE_TIMEOUT)
  }

  /**
   * Unload LLM to free RAM after idle timeout (60s)
   */
  private async unloadLLM(): Promise<void> {
    if (!this.llmLoaded) return

    const tier = this.detectHardwareTier()
    try {
      await fetch(`${config.OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: tier.llmModel,
          keep_alive: '0',
        }),
      })
      this.llmLoaded = false
      this.log.info('LLM unloaded to free RAM')
    } catch (err) {
      this.log.debug('LLM unload skipped — Ollama may not be running', err)
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
}

// Singleton
let instance: ModelManager | null = null

export function getModelManager(): ModelManager {
  if (!instance) {
    instance = new ModelManager()
  }
  return instance
}
