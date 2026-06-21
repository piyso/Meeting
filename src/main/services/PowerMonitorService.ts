/**
 * PowerMonitorService — Event-driven power state tracking
 *
 * 2.8 FIX: Replaces 30s polling in usePowerMode with native powerMonitor events.
 * Forwards on-ac / on-battery events from main process to renderer via IPC.
 */

import { powerMonitor } from 'electron'
import { Logger } from './Logger'

const log = Logger.create('PowerMonitor')

export type PowerState = 'on-ac' | 'on-battery' | 'unknown'

export class PowerMonitorService {
  private currentState: PowerState = 'unknown'
  private listeners: Array<(state: PowerState) => void> = []
  private initialized = false
  private onAcHandler: (() => void) | null = null
  private onBatteryHandler: (() => void) | null = null

  initialize(): void {
    if (this.initialized) return

    try {
      this.currentState = powerMonitor.isOnBatteryPower() ? 'on-battery' : 'on-ac'
      log.info(`Initial power state: ${this.currentState}`)

      this.onAcHandler = () => {
        this.currentState = 'on-ac'
        log.info('Switched to AC power')
        this.notifyListeners()
      }
      this.onBatteryHandler = () => {
        this.currentState = 'on-battery'
        log.info('Switched to battery power')
        this.notifyListeners()
      }

      powerMonitor.on('on-ac', this.onAcHandler)
      powerMonitor.on('on-battery', this.onBatteryHandler)

      this.initialized = true
    } catch (err) {
      log.warn('PowerMonitor not available:', err)
    }
  }

  getState(): PowerState {
    return this.currentState
  }

  isOnBattery(): boolean {
    return this.currentState === 'on-battery'
  }

  onChange(callback: (state: PowerState) => void): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback)
    }
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentState)
      } catch {
        /* skip broken */
      }
    }
  }

  destroy(): void {
    if (this.onAcHandler) powerMonitor.removeListener('on-ac', this.onAcHandler)
    if (this.onBatteryHandler) powerMonitor.removeListener('on-battery', this.onBatteryHandler)
    this.onAcHandler = null
    this.onBatteryHandler = null
    this.listeners = []
    this.initialized = false
  }
}

let instance: PowerMonitorService | null = null

export function getPowerMonitorService(): PowerMonitorService {
  if (!instance) {
    instance = new PowerMonitorService()
  }
  return instance
}
