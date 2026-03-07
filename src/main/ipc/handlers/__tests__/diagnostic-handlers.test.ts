/**
 * DiagnosticLogger Handlers Tests
 *
 * Tests for diagnostic logging IPC handlers.
 */

import { getDiagnosticLogger } from '../../../services/DiagnosticLogger'

describe('DiagnosticLogger', () => {
  let logger: ReturnType<typeof getDiagnosticLogger>

  beforeEach(() => {
    logger = getDiagnosticLogger()
  })

  describe('getLogDirectory', () => {
    it('should return a valid log directory path', () => {
      const dir = logger.getLogDirectory()

      expect(dir).toBeDefined()
      expect(typeof dir).toBe('string')
      expect(dir.length).toBeGreaterThan(0)
      expect(dir).toContain('logs')
    })
  })

  describe('getCurrentLogFile', () => {
    it('should return a path ending in diagnostics.log', () => {
      const file = logger.getCurrentLogFile()

      expect(file).toBeDefined()
      expect(file).toContain('diagnostics.log')
    })
  })

  describe('getSystemInfo', () => {
    it('should return system information', () => {
      const info = logger.getSystemInfo()

      expect(info).toBeDefined()
      expect(info.os).toBeDefined()
      expect(info.osVersion).toBeDefined()
      expect(info.arch).toBeDefined()
      expect(info.cpus).toBeDefined()
      expect(typeof info.cpus).toBe('number')
      expect(info.totalMemory).toBeDefined()
      expect(info.freeMemory).toBeDefined()
    })
  })

  describe('getLogStats', () => {
    it('should return log statistics', () => {
      const stats = logger.getLogStats()

      expect(stats).toBeDefined()
      expect(typeof stats.totalFiles).toBe('number')
      expect(typeof stats.totalSize).toBe('string')
      expect(stats.totalSize).toContain('MB')
    })
  })

  describe('logInfo', () => {
    it('should log informational message without error', () => {
      expect(() => {
        logger.logInfo('Test diagnostic message', { testKey: 'testValue' })
      }).not.toThrow()
    })
  })

  describe('logError', () => {
    it('should log error without throwing', () => {
      const error = new Error('Test error for diagnostics')

      expect(() => {
        logger.logError(error, 'test-context')
      }).not.toThrow()
    })
  })
})
