/**
 * Vector Clock Manager
 *
 * Implements vector clocks for distributed conflict detection.
 * Used to track causality and detect concurrent edits across devices.
 *
 * Vector Clock: { deviceId: logicalTimestamp, ... }
 * Example: { device-a: 5, device-b: 3, device-c: 1 }
 *
 * Comparison Rules:
 * - v1 > v2 (v1 dominates): All timestamps in v1 >= v2, at least one >
 * - v1 < v2 (v2 dominates): All timestamps in v2 >= v1, at least one >
 * - v1 || v2 (concurrent): Neither dominates (CONFLICT)
 */
import { Logger } from './Logger'
const log = Logger.create('VectorClock')

export interface VectorClock {
  [deviceId: string]: number
}

export type ClockComparison = 'equal' | 'local_newer' | 'remote_newer' | 'concurrent'

export class VectorClockManager {
  /**
   * Initialize vector clock for a device
   *
   * @param deviceId - Device ID
   * @returns New vector clock with device at timestamp 0
   */
  public initializeForDevice(deviceId: string): VectorClock {
    return {
      [deviceId]: 0,
    }
  }

  /**
   * Increment clock on local change
   *
   * @param clock - Current vector clock
   * @param deviceId - Device ID making the change
   * @returns Updated vector clock
   */
  public increment(clock: VectorClock, deviceId: string): VectorClock {
    const newClock = { ...clock }
    newClock[deviceId] = (newClock[deviceId] || 0) + 1
    return newClock
  }

  /**
   * Compare two vector clocks
   *
   * @param local - Local vector clock
   * @param remote - Remote vector clock
   * @returns Comparison result
   */
  public compare(local: VectorClock, remote: VectorClock): ClockComparison {
    // Get all device IDs from both clocks
    const allDevices = new Set([...Object.keys(local), ...Object.keys(remote)])

    let localNewer = false
    let remoteNewer = false

    for (const deviceId of allDevices) {
      const localTime = local[deviceId] || 0
      const remoteTime = remote[deviceId] || 0

      if (localTime > remoteTime) {
        localNewer = true
      } else if (remoteTime > localTime) {
        remoteNewer = true
      }
    }

    // Determine relationship
    if (localNewer && !remoteNewer) {
      return 'local_newer'
    } else if (remoteNewer && !localNewer) {
      return 'remote_newer'
    } else if (localNewer && remoteNewer) {
      return 'concurrent' // CONFLICT
    } else {
      // Equal clocks
      return 'equal'
    }
  }

  /**
   * Merge two vector clocks (take maximum timestamp for each device)
   *
   * @param v1 - First vector clock
   * @param v2 - Second vector clock
   * @returns Merged vector clock
   */
  public merge(v1: VectorClock, v2: VectorClock): VectorClock {
    const allDevices = new Set([...Object.keys(v1), ...Object.keys(v2)])
    const merged: VectorClock = {}

    for (const deviceId of allDevices) {
      const time1 = v1[deviceId] || 0
      const time2 = v2[deviceId] || 0
      merged[deviceId] = Math.max(time1, time2)
    }

    return merged
  }

  /**
   * Check if clock1 dominates clock2 (clock1 >= clock2 for all devices)
   *
   * @param clock1 - First vector clock
   * @param clock2 - Second vector clock
   * @returns True if clock1 dominates clock2
   */
  public dominates(clock1: VectorClock, clock2: VectorClock): boolean {
    const allDevices = new Set([...Object.keys(clock1), ...Object.keys(clock2)])

    for (const deviceId of allDevices) {
      const time1 = clock1[deviceId] || 0
      const time2 = clock2[deviceId] || 0

      if (time1 < time2) {
        return false
      }
    }

    return true
  }

  /**
   * Check if two clocks are concurrent (neither dominates)
   *
   * @param clock1 - First vector clock
   * @param clock2 - Second vector clock
   * @returns True if clocks are concurrent
   */
  public isConcurrent(clock1: VectorClock, clock2: VectorClock): boolean {
    return this.compare(clock1, clock2) === 'concurrent'
  }

  /**
   * Detect if there is a conflict between two clocks (alias for isConcurrent)
   *
   * @param local - Local vector clock
   * @param remote - Remote vector clock
   * @returns True if conflict detected (concurrent edits)
   */
  public detectConflict(local: VectorClock, remote: VectorClock): boolean {
    return this.isConcurrent(local, remote)
  }

  /**
   * Serialize vector clock to string for storage
   *
   * @param clock - Vector clock
   * @returns JSON string
   */
  public serialize(clock: VectorClock): string {
    return JSON.stringify(clock)
  }

  /**
   * Deserialize vector clock from string
   *
   * @param serialized - JSON string
   * @returns Vector clock
   */
  public deserialize(serialized: string): VectorClock {
    try {
      return JSON.parse(serialized)
    } catch (error) {
      log.error('[VectorClockManager] Failed to deserialize clock:', error)
      return {}
    }
  }

  /**
   * Get timestamp for a specific device
   *
   * @param clock - Vector clock
   * @param deviceId - Device ID
   * @returns Timestamp for device (0 if not found)
   */
  public getTimestamp(clock: VectorClock, deviceId: string): number {
    return clock[deviceId] || 0
  }

  /**
   * Set timestamp for a specific device
   *
   * @param clock - Vector clock
   * @param deviceId - Device ID
   * @param timestamp - New timestamp
   * @returns Updated vector clock
   */
  public setTimestamp(clock: VectorClock, deviceId: string, timestamp: number): VectorClock {
    return {
      ...clock,
      [deviceId]: timestamp,
    }
  }

  /**
   * Get all device IDs in clock
   *
   * @param clock - Vector clock
   * @returns Array of device IDs
   */
  public getDevices(clock: VectorClock): string[] {
    return Object.keys(clock)
  }

  /**
   * Get maximum timestamp across all devices
   *
   * @param clock - Vector clock
   * @returns Maximum timestamp
   */
  public getMaxTimestamp(clock: VectorClock): number {
    const timestamps = Object.values(clock)
    return timestamps.length > 0 ? Math.max(...timestamps) : 0
  }

  /**
   * Create a copy of vector clock
   *
   * @param clock - Vector clock
   * @returns Copy of vector clock
   */
  public clone(clock: VectorClock): VectorClock {
    return { ...clock }
  }
}

// Singleton instance
let instance: VectorClockManager | null = null

export function getVectorClockManager(): VectorClockManager {
  if (!instance) {
    instance = new VectorClockManager()
  }
  return instance
}
