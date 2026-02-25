import { VectorClockManager, VectorClock } from '../VectorClockManager'

describe('VectorClockManager', () => {
  let manager: VectorClockManager

  beforeEach(() => {
    manager = new VectorClockManager()
  })

  describe('initializeForDevice', () => {
    it('should initialize clock with device ID set to 0', () => {
      const clock = manager.initializeForDevice('device-a')

      expect(clock).toEqual({ 'device-a': 0 })
    })

    it('should initialize multiple devices independently', () => {
      const clockA = manager.initializeForDevice('device-a')
      const clockB = manager.initializeForDevice('device-b')

      expect(clockA).toEqual({ 'device-a': 0 })
      expect(clockB).toEqual({ 'device-b': 0 })
    })
  })

  describe('increment', () => {
    it('should increment device timestamp by 1', () => {
      const clock = manager.initializeForDevice('device-a')
      const updated = manager.increment(clock, 'device-a')

      expect(updated['device-a']).toBe(1)
    })

    it('should increment multiple times', () => {
      let clock = manager.initializeForDevice('device-a')
      clock = manager.increment(clock, 'device-a')
      clock = manager.increment(clock, 'device-a')
      clock = manager.increment(clock, 'device-a')

      expect(clock['device-a']).toBe(3)
    })

    it('should initialize device if not present', () => {
      const clock: VectorClock = {}
      const updated = manager.increment(clock, 'device-a')

      expect(updated['device-a']).toBe(1)
    })

    it('should not modify other device timestamps', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3 }
      const updated = manager.increment(clock, 'device-a')

      expect(updated['device-a']).toBe(6)
      expect(updated['device-b']).toBe(3)
    })
  })

  describe('compare', () => {
    it('should return "equal" for identical clocks', () => {
      const clock1: VectorClock = { 'device-a': 5, 'device-b': 3 }
      const clock2: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const result = manager.compare(clock1, clock2)

      expect(result).toBe('equal')
    })

    it('should return "local_newer" when local dominates', () => {
      const local: VectorClock = { 'device-a': 5, 'device-b': 3 }
      const remote: VectorClock = { 'device-a': 4, 'device-b': 2 }

      const result = manager.compare(local, remote)

      expect(result).toBe('local_newer')
    })

    it('should return "remote_newer" when remote dominates', () => {
      const local: VectorClock = { 'device-a': 4, 'device-b': 2 }
      const remote: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const result = manager.compare(local, remote)

      expect(result).toBe('remote_newer')
    })

    it('should return "concurrent" for conflicting clocks', () => {
      const local: VectorClock = { 'device-a': 5, 'device-b': 2 }
      const remote: VectorClock = { 'device-a': 4, 'device-b': 3 }

      const result = manager.compare(local, remote)

      expect(result).toBe('concurrent')
    })

    it('should handle missing devices in one clock', () => {
      const local: VectorClock = { 'device-a': 5 }
      const remote: VectorClock = { 'device-a': 4, 'device-b': 3 }

      const result = manager.compare(local, remote)

      expect(result).toBe('concurrent')
    })

    it('should handle empty clocks', () => {
      const local: VectorClock = {}
      const remote: VectorClock = {}

      const result = manager.compare(local, remote)

      expect(result).toBe('equal')
    })
  })

  describe('merge', () => {
    it('should take maximum timestamp for each device', () => {
      const clock1: VectorClock = { 'device-a': 5, 'device-b': 2 }
      const clock2: VectorClock = { 'device-a': 4, 'device-b': 3 }

      const merged = manager.merge(clock1, clock2)

      expect(merged).toEqual({ 'device-a': 5, 'device-b': 3 })
    })

    it('should include devices from both clocks', () => {
      const clock1: VectorClock = { 'device-a': 5 }
      const clock2: VectorClock = { 'device-b': 3 }

      const merged = manager.merge(clock1, clock2)

      expect(merged).toEqual({ 'device-a': 5, 'device-b': 3 })
    })

    it('should handle empty clocks', () => {
      const clock1: VectorClock = { 'device-a': 5 }
      const clock2: VectorClock = {}

      const merged = manager.merge(clock1, clock2)

      expect(merged).toEqual({ 'device-a': 5 })
    })

    it('should not modify original clocks', () => {
      const clock1: VectorClock = { 'device-a': 5 }
      const clock2: VectorClock = { 'device-b': 3 }

      manager.merge(clock1, clock2)

      expect(clock1).toEqual({ 'device-a': 5 })
      expect(clock2).toEqual({ 'device-b': 3 })
    })
  })

  describe('detectConflict', () => {
    it('should return true for concurrent clocks', () => {
      const local: VectorClock = { 'device-a': 5, 'device-b': 2 }
      const remote: VectorClock = { 'device-a': 4, 'device-b': 3 }

      const hasConflict = manager.detectConflict(local, remote)

      expect(hasConflict).toBe(true)
    })

    it('should return false when local is newer', () => {
      const local: VectorClock = { 'device-a': 5, 'device-b': 3 }
      const remote: VectorClock = { 'device-a': 4, 'device-b': 2 }

      const hasConflict = manager.detectConflict(local, remote)

      expect(hasConflict).toBe(false)
    })

    it('should return false when remote is newer', () => {
      const local: VectorClock = { 'device-a': 4, 'device-b': 2 }
      const remote: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const hasConflict = manager.detectConflict(local, remote)

      expect(hasConflict).toBe(false)
    })

    it('should return false for equal clocks', () => {
      const local: VectorClock = { 'device-a': 5, 'device-b': 3 }
      const remote: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const hasConflict = manager.detectConflict(local, remote)

      expect(hasConflict).toBe(false)
    })
  })

  describe('serialize and deserialize', () => {
    it('should serialize clock to JSON string', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const serialized = manager.serialize(clock)

      expect(typeof serialized).toBe('string')
      expect(JSON.parse(serialized)).toEqual(clock)
    })

    it('should deserialize JSON string to clock', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3 }
      const serialized = JSON.stringify(clock)

      const deserialized = manager.deserialize(serialized)

      expect(deserialized).toEqual(clock)
    })

    it('should round-trip serialize and deserialize', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3, 'device-c': 7 }

      const serialized = manager.serialize(clock)
      const deserialized = manager.deserialize(serialized)

      expect(deserialized).toEqual(clock)
    })

    it('should handle empty clock', () => {
      const clock: VectorClock = {}

      const serialized = manager.serialize(clock)
      const deserialized = manager.deserialize(serialized)

      expect(deserialized).toEqual(clock)
    })
  })

  describe('getTimestamp', () => {
    it('should return timestamp for device', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const timestamp = manager.getTimestamp(clock, 'device-a')

      expect(timestamp).toBe(5)
    })

    it('should return 0 for missing device', () => {
      const clock: VectorClock = { 'device-a': 5 }

      const timestamp = manager.getTimestamp(clock, 'device-b')

      expect(timestamp).toBe(0)
    })
  })

  describe('getDevices', () => {
    it('should return all device IDs', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3, 'device-c': 7 }

      const devices = manager.getDevices(clock)

      expect(devices).toEqual(['device-a', 'device-b', 'device-c'])
    })

    it('should return empty array for empty clock', () => {
      const clock: VectorClock = {}

      const devices = manager.getDevices(clock)

      expect(devices).toEqual([])
    })
  })

  describe('getMaxTimestamp', () => {
    it('should return maximum timestamp across all devices', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3, 'device-c': 7 }

      const max = manager.getMaxTimestamp(clock)

      expect(max).toBe(7)
    })

    it('should return 0 for empty clock', () => {
      const clock: VectorClock = {}

      const max = manager.getMaxTimestamp(clock)

      expect(max).toBe(0)
    })

    it('should handle single device', () => {
      const clock: VectorClock = { 'device-a': 5 }

      const max = manager.getMaxTimestamp(clock)

      expect(max).toBe(5)
    })
  })

  describe('clone', () => {
    it('should create deep copy of clock', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const cloned = manager.clone(clock)

      expect(cloned).toEqual(clock)
      expect(cloned).not.toBe(clock)
    })

    it('should not affect original when modifying clone', () => {
      const clock: VectorClock = { 'device-a': 5, 'device-b': 3 }

      const cloned = manager.clone(clock)
      cloned['device-a'] = 10

      expect(clock['device-a']).toBe(5)
      expect(cloned['device-a']).toBe(10)
    })
  })

  describe('Real-world scenarios', () => {
    it('should handle typical sync scenario', () => {
      // Device A makes 3 edits offline
      let clockA = manager.initializeForDevice('device-a')
      clockA = manager.increment(clockA, 'device-a')
      clockA = manager.increment(clockA, 'device-a')
      clockA = manager.increment(clockA, 'device-a')

      // Device B makes 2 edits offline
      let clockB = manager.initializeForDevice('device-b')
      clockB = manager.increment(clockB, 'device-b')
      clockB = manager.increment(clockB, 'device-b')

      // Both devices come online - conflict detected
      const hasConflict = manager.detectConflict(clockA, clockB)
      expect(hasConflict).toBe(true)

      // Merge clocks after resolution
      const merged = manager.merge(clockA, clockB)
      expect(merged).toEqual({ 'device-a': 3, 'device-b': 2 })
    })

    it('should handle sequential sync without conflict', () => {
      // Device A makes edit
      let clockA = manager.initializeForDevice('device-a')
      clockA = manager.increment(clockA, 'device-a')

      // Device B syncs and gets Device A's clock
      let clockB = manager.clone(clockA)

      // Device B makes edit
      clockB = manager.increment(clockB, 'device-b')

      // No conflict - Device B is newer
      const comparison = manager.compare(clockA, clockB)
      expect(comparison).toBe('remote_newer')
      expect(manager.detectConflict(clockA, clockB)).toBe(false)
    })
  })
})
