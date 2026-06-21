/**
 * Hardware Tier Detection Service
 *
 * Detects system hardware capabilities and classifies into tiers:
 * - High (16GB+): Whisper turbo + Qwen 3B (4.5GB total)
 * - Mid (12GB): Moonshine Base + Qwen 3B (3.3GB total)
 * - Low (8GB): Moonshine Base + Qwen 1.5B (2.2GB total)
 *
 * Also provides:
 * - Battery-aware AI scheduling (performance/balanced/battery-saver)
 * - Apple Silicon GPU detection for MLX model selection
 * - Concurrency flag: mid/low tiers run ASR + LLM concurrently
 */

import * as os from 'os'
import { execSync } from 'child_process'
import { getDatabaseService } from './DatabaseService'
import { Logger } from './Logger'
const log = Logger.create('HardwareTier')

export type HardwareTier = 'high' | 'mid' | 'low'
export type ModelType = 'whisper-turbo' | 'moonshine-base'
export type LLMModel = 'qwen2.5:3b' | 'qwen2.5:1.5b'
export type PowerMode = 'performance' | 'balanced' | 'battery-saver'

interface HardwareInfo {
  tier: HardwareTier
  totalRAM: number // GB
  ramBudget: number // GB
  asrModel: ModelType
  llmModel: LLMModel
  asrRAM: number // GB
  llmRAM: number // GB
  cpuCores: number
  platform: string
  arch: string
  hasAppleSiliconGPU: boolean
  concurrentASRandLLM: boolean // true for mid/low tiers (Moonshine 300MB allows it)
}

export class HardwareTierService {
  private hardwareInfo: HardwareInfo | null = null

  /**
   * Detect hardware tier and store in database
   */
  async detectAndStore(): Promise<HardwareInfo> {
    const info = this.detectHardware()
    this.hardwareInfo = info

    // Store in database
    const db = getDatabaseService()
    await db.setSetting('hardware_tier', info.tier)
    await db.setSetting('total_ram', info.totalRAM.toString())
    await db.setSetting('ram_budget', info.ramBudget.toString())
    await db.setSetting('asr_model', info.asrModel)
    await db.setSetting('llm_model', info.llmModel)

    log.info('[Hardware Tier] Detected:', info)

    return info
  }

  /**
   * Get hardware info (detect if not cached)
   */
  async getHardwareInfo(): Promise<HardwareInfo> {
    if (this.hardwareInfo) {
      return this.hardwareInfo
    }

    // Try to load from database
    const db = getDatabaseService()
    const tier = await db.getSetting('hardware_tier')

    if (tier) {
      const totalRAM = parseFloat((await db.getSetting('total_ram')) || '0')
      const ramBudget = parseFloat((await db.getSetting('ram_budget')) || '0')
      const asrModel = (await db.getSetting('asr_model')) as ModelType
      const llmModel = (await db.getSetting('llm_model')) as LLMModel

      this.hardwareInfo = {
        tier: tier as HardwareTier,
        totalRAM,
        ramBudget,
        asrModel,
        llmModel,
        asrRAM: this.getASRRAM(asrModel),
        llmRAM: this.getLLMRAM(llmModel),
        cpuCores: os.cpus().length,
        platform: os.platform(),
        arch: os.arch(),
        hasAppleSiliconGPU: this.detectAppleSiliconGPU(),
        concurrentASRandLLM: asrModel === 'moonshine-base', // Moonshine 300MB allows concurrent
      }

      return this.hardwareInfo!
    }

    // Detect and store
    return await this.detectAndStore()
  }

  /**
   * Detect hardware capabilities
   */
  private detectHardware(): HardwareInfo {
    const totalRAM = os.totalmem() / 1024 / 1024 / 1024 // GB
    const cpuCores = os.cpus().length
    const platform = os.platform()
    const arch = os.arch()
    const hasAppleSiliconGPU = this.detectAppleSiliconGPU()

    // Classify tier based on RAM
    let tier: HardwareTier
    let asrModel: ModelType
    let llmModel: LLMModel
    let ramBudget: number
    let concurrentASRandLLM: boolean

    if (totalRAM >= 16) {
      tier = 'high'
      asrModel = 'whisper-turbo'
      llmModel = 'qwen2.5:3b'
      ramBudget = 4.5 // 1.5GB ASR + 2.2GB LLM + 0.8GB overhead
      concurrentASRandLLM = false // Whisper 1.5GB + Qwen 2.2GB = mutual exclusion needed
    } else if (totalRAM >= 12) {
      tier = 'mid'
      asrModel = 'moonshine-base'
      llmModel = 'qwen2.5:3b'
      ramBudget = 3.3 // 0.3GB ASR + 2.2GB LLM + 0.8GB overhead
      concurrentASRandLLM = true // Moonshine 300MB allows concurrent operation
    } else {
      tier = 'low'
      asrModel = 'moonshine-base'
      llmModel = 'qwen2.5:1.5b'
      ramBudget = 2.2 // 0.3GB ASR + 1.1GB LLM + 0.8GB overhead
      concurrentASRandLLM = true // Moonshine 300MB allows concurrent operation
    }

    return {
      tier,
      totalRAM,
      ramBudget,
      asrModel,
      llmModel,
      asrRAM: this.getASRRAM(asrModel),
      llmRAM: this.getLLMRAM(llmModel),
      cpuCores,
      platform,
      arch,
      hasAppleSiliconGPU,
      concurrentASRandLLM,
    }
  }

  /**
   * Get ASR model RAM usage
   */
  private getASRRAM(model: ModelType): number {
    switch (model) {
      case 'whisper-turbo':
        return 1.5
      case 'moonshine-base':
        return 0.3
      default:
        return 0
    }
  }

  /**
   * Get LLM model RAM usage
   */
  private getLLMRAM(model: LLMModel): number {
    switch (model) {
      case 'qwen2.5:3b':
        return 2.2
      case 'qwen2.5:1.5b':
        return 1.1
      default:
        return 0
    }
  }

  /**
   * Override hardware tier (for advanced users)
   */
  async overrideTier(tier: HardwareTier): Promise<void> {
    const info = this.detectHardware()

    // Update tier and models
    let asrModel: ModelType
    let llmModel: LLMModel
    let ramBudget: number

    if (tier === 'high') {
      asrModel = 'whisper-turbo'
      llmModel = 'qwen2.5:3b'
      ramBudget = 4.5
    } else if (tier === 'mid') {
      asrModel = 'moonshine-base'
      llmModel = 'qwen2.5:3b'
      ramBudget = 3.3
    } else {
      asrModel = 'moonshine-base'
      llmModel = 'qwen2.5:1.5b'
      ramBudget = 2.2
    }

    this.hardwareInfo = {
      ...info,
      tier,
      asrModel,
      llmModel,
      ramBudget,
      asrRAM: this.getASRRAM(asrModel),
      llmRAM: this.getLLMRAM(llmModel),
    }

    // Store in database
    const db = getDatabaseService()
    await db.setSetting('hardware_tier', tier)
    await db.setSetting('asr_model', asrModel)
    await db.setSetting('llm_model', llmModel)
    await db.setSetting('ram_budget', ramBudget.toString())

    log.info('[Hardware Tier] Override to:', tier)
  }

  /**
   * Check if cloud transcription is recommended
   */
  shouldRecommendCloud(): boolean {
    if (!this.hardwareInfo) {
      return false
    }

    // Recommend cloud for low tier machines
    return this.hardwareInfo.tier === 'low'
  }

  /**
   * Detect Apple Silicon GPU for MLX model acceleration
   */
  private detectAppleSiliconGPU(): boolean {
    // Apple Silicon Macs: arm64 + darwin = always has Apple GPU (M1/M2/M3/M4)
    return os.platform() === 'darwin' && os.arch() === 'arm64'
  }

  // ─── Battery-Aware AI Scheduling ─────────────────────────────
  // Returns a power mode based on current battery state.
  // Performance: 100% AI frequency (AC power)
  // Balanced:    70% AI frequency (~10% battery/hr)
  // Battery-saver: 30% AI frequency, queue non-critical (<5% battery/hr)
  private _powerMode: PowerMode = 'performance'

  /**
   * Get current power mode based on battery state.
   * On desktop/AC: always 'performance'.
   * On battery: 'balanced' if >20%, 'battery-saver' if <=20%.
   */
  getPowerMode(): PowerMode {
    if (os.platform() !== 'darwin' && os.platform() !== 'win32') {
      return 'performance' // Linux: no battery API — assume AC
    }

    try {
      if (os.platform() === 'darwin') {
        const pmset = execSync('pmset -g batt', { timeout: 2000 }).toString()
        const isAC = pmset.includes('AC Power')
        if (isAC) {
          this._powerMode = 'performance'
          return 'performance'
        }

        const match = pmset.match(/(\d+)%/)
        const pct = match ? parseInt(match[1]!, 10) : 100
        this._powerMode = pct <= 20 ? 'battery-saver' : 'balanced'
        return this._powerMode
      }
    } catch {
      // If battery check fails, default to performance
    }
    return this._powerMode
  }

  /**
   * Get AI frequency multiplier based on power mode.
   * Used by AudioPipelineService to throttle inference intervals.
   */
  getAIFrequency(): number {
    switch (this.getPowerMode()) {
      case 'performance':
        return 1.0 // 100% — no throttling
      case 'balanced':
        return 0.7 // 70% — reduce inference frequency
      case 'battery-saver':
        return 0.3 // 30% — queue non-critical, only process urgent
    }
  }

  /**
   * Check if ASR and LLM can run concurrently on this hardware.
   */
  canRunConcurrently(): boolean {
    return this.hardwareInfo?.concurrentASRandLLM ?? false
  }
}

// Singleton instance
let hardwareTierServiceInstance: HardwareTierService | null = null

export function getHardwareTierService(): HardwareTierService {
  if (!hardwareTierServiceInstance) {
    hardwareTierServiceInstance = new HardwareTierService()
  }
  return hardwareTierServiceInstance
}
