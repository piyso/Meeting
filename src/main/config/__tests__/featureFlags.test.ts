/**
 * Feature Flag Service Tests
 *
 * Tests the feature flag system in environment.ts.
 */

import { FEATURE_FLAG_DEFAULTS } from '../../config/environment'

describe('Feature Flags', () => {
  describe('FEATURE_FLAG_DEFAULTS', () => {
    it('should define all expected feature flags', () => {
      expect(FEATURE_FLAG_DEFAULTS).toBeDefined()
      expect(typeof FEATURE_FLAG_DEFAULTS.knowledge_graph).toBe('boolean')
      expect(typeof FEATURE_FLAG_DEFAULTS.weekly_digest).toBe('boolean')
      expect(typeof FEATURE_FLAG_DEFAULTS.entity_extraction).toBe('boolean')
      expect(typeof FEATURE_FLAG_DEFAULTS.silent_prompter).toBe('boolean')
      expect(typeof FEATURE_FLAG_DEFAULTS.semantic_search).toBe('boolean')
      expect(typeof FEATURE_FLAG_DEFAULTS.phi_detection).toBe('boolean')
      expect(typeof FEATURE_FLAG_DEFAULTS.telemetry).toBe('boolean')
    })

    it('should have knowledge_graph enabled by default', () => {
      expect(FEATURE_FLAG_DEFAULTS.knowledge_graph).toBe(true)
    })

    it('should have weekly_digest enabled by default', () => {
      expect(FEATURE_FLAG_DEFAULTS.weekly_digest).toBe(true)
    })

    it('should have phi_detection disabled by default', () => {
      expect(FEATURE_FLAG_DEFAULTS.phi_detection).toBe(false)
    })

    it('should have telemetry disabled by default', () => {
      expect(FEATURE_FLAG_DEFAULTS.telemetry).toBe(false)
    })
  })
})
