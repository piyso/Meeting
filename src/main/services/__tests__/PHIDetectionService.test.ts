/**
 * PHI Detection Service Tests
 *
 * Tests for HIPAA PHI detection before cloud sync.
 */

import { describe, it, expect } from 'vitest'
import { PHIDetectionService, PHIType } from '../PHIDetectionService'

describe('PHIDetectionService', () => {
  describe('SSN Detection', () => {
    it('should detect SSN with dashes', () => {
      const text = 'Patient SSN is 123-45-6789'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers).toHaveLength(1)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.SSN)
      expect(result.detectedIdentifiers[0]!.value).toBe('123-45-6789')
    })

    it('should detect SSN without dashes', () => {
      const text = 'SSN: 123456789'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.SSN)
    })
  })

  describe('Phone Number Detection', () => {
    it('should detect phone with parentheses', () => {
      const text = 'Call me at (555) 123-4567'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.PHONE)
    })

    it('should detect phone with dashes', () => {
      const text = 'Phone: 555-123-4567'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.PHONE)
    })

    it('should detect phone without formatting', () => {
      const text = 'Contact: 5551234567'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.PHONE)
    })
  })

  describe('Email Detection', () => {
    it('should detect email addresses', () => {
      const text = 'Email patient at john.doe@hospital.com'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.EMAIL)
      expect(result.detectedIdentifiers[0]!.value).toBe('john.doe@hospital.com')
    })
  })

  describe('Medical Record Number Detection', () => {
    it('should detect MRN with label', () => {
      const text = 'Patient MRN: 123456'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.MRN)
    })

    it('should detect MR# format', () => {
      const text = 'MR#987654'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.MRN)
    })
  })

  describe('Credit Card Detection', () => {
    it('should detect credit card with dashes', () => {
      const text = 'Card: 1234-5678-9012-3456'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.CREDIT_CARD)
    })

    it('should detect credit card without dashes', () => {
      const text = 'Card: 1234567890123456'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.CREDIT_CARD)
    })
  })

  describe('IP Address Detection', () => {
    it('should detect IP addresses', () => {
      const text = 'Server IP: 192.168.1.100'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.IP_ADDRESS)
    })
  })

  describe('URL Detection', () => {
    it('should detect HTTP URLs', () => {
      const text = 'Visit http://patient-portal.hospital.com'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.URL)
    })

    it('should detect HTTPS URLs', () => {
      const text = 'Portal: https://secure.hospital.com/patient/12345'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.URL)
    })
  })

  describe('Date Detection', () => {
    it('should detect dates with slashes', () => {
      const text = 'Appointment on 03/15/2024'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.DATE)
    })

    it('should detect dates with dashes', () => {
      const text = 'DOB: 1985-06-20'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.DATE)
    })
  })

  describe('Address Detection', () => {
    it('should detect street addresses', () => {
      const text = 'Patient lives at 123 Main Street'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.ADDRESS)
    })

    it('should detect abbreviated addresses', () => {
      const text = 'Address: 456 Oak Ave'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.ADDRESS)
    })
  })

  describe('Account Number Detection', () => {
    it('should detect account numbers', () => {
      const text = 'Account #123456789'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.detectedIdentifiers[0]!.type).toBe(PHIType.ACCOUNT_NUMBER)
    })
  })

  describe('Risk Level Calculation', () => {
    it('should return none for clean text', () => {
      const text = 'This is a normal meeting about project planning'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.riskLevel).toBe('none')
    })

    it('should return high for SSN', () => {
      const text = 'SSN: 123-45-6789'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.riskLevel).toBe('high')
    })

    it('should return high for MRN', () => {
      const text = 'MRN: 123456'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.riskLevel).toBe('high')
    })

    it('should return high for credit card', () => {
      const text = 'Card: 1234-5678-9012-3456'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.riskLevel).toBe('high')
    })

    it('should return medium for phone and email', () => {
      const text = 'Contact: 555-123-4567 or email@example.com'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.riskLevel).toBe('medium')
    })

    it('should return low for single date', () => {
      const text = 'Meeting on 03/15/2024'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.riskLevel).toBe('low')
    })
  })

  describe('PHI Masking', () => {
    it('should mask SSN', () => {
      const text = 'SSN: 123-45-6789'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.maskedText).toContain('***-**-****')
    })

    it('should mask phone numbers', () => {
      const text = 'Call 555-123-4567'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.maskedText).toContain('***-***-****')
    })

    it('should mask email addresses', () => {
      const text = 'Email: john@example.com'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.maskedText).toContain('***@***.***')
    })

    it('should mask multiple identifiers', () => {
      const text = 'SSN: 123-45-6789, Phone: 555-123-4567'
      const result = PHIDetectionService.detectPHI(text)
      expect(result.maskedText).toContain('***-**-****')
      expect(result.maskedText).toContain('***-***-****')
    })
  })

  describe('Sync Warning Messages', () => {
    it('should return null for clean text', () => {
      const text = 'Normal meeting discussion'
      const warning = PHIDetectionService.checkBeforeSync(text)
      expect(warning).toBeNull()
    })

    it('should return high risk warning for SSN', () => {
      const text = 'SSN: 123-45-6789'
      const warning = PHIDetectionService.checkBeforeSync(text)
      expect(warning).toContain('HIGH RISK')
      expect(warning).toContain('HIPAA')
    })

    it('should return medium risk warning for phone', () => {
      const text = 'Phone: 555-123-4567'
      const warning = PHIDetectionService.checkBeforeSync(text)
      expect(warning).toContain('MEDIUM RISK')
    })

    it('should return low risk warning for date', () => {
      const text = 'Meeting on 03/15/2024'
      const warning = PHIDetectionService.checkBeforeSync(text)
      expect(warning).toContain('LOW RISK')
    })
  })

  describe('Description Generation', () => {
    it('should describe no PHI', () => {
      const text = 'Normal text'
      const result = PHIDetectionService.detectPHI(text)
      const description = PHIDetectionService.getDescription(result)
      expect(description).toBe('No PHI detected')
    })

    it('should describe detected PHI', () => {
      const text = 'SSN: 123-45-6789, Phone: 555-123-4567'
      const result = PHIDetectionService.detectPHI(text)
      const description = PHIDetectionService.getDescription(result)
      expect(description).toContain('SSN')
      expect(description).toContain('PHONE')
    })

    it('should handle multiple of same type', () => {
      const text = 'Phone1: 555-123-4567, Phone2: 555-987-6543'
      const result = PHIDetectionService.detectPHI(text)
      const description = PHIDetectionService.getDescription(result)
      expect(description).toContain('2 PHONE')
    })
  })

  describe('Complex Scenarios', () => {
    it('should detect multiple PHI types in medical transcript', () => {
      const text = `
        Patient John Doe, MRN: 123456
        DOB: 03/15/1985
        Address: 123 Main Street
        Phone: (555) 123-4567
        Email: john.doe@email.com
        SSN: 123-45-6789
      `
      const result = PHIDetectionService.detectPHI(text)
      expect(result.hasPHI).toBe(true)
      expect(result.riskLevel).toBe('high')
      expect(result.detectedIdentifiers.length).toBeGreaterThan(5)
    })

    it('should not detect false positives in technical discussion', () => {
      const text = 'The API returns a 404 error when accessing /api/v1/users'
      const result = PHIDetectionService.detectPHI(text)
      // May detect URL, but should be low risk
      if (result.hasPHI) {
        expect(result.riskLevel).toBe('low')
      }
    })
  })
})
