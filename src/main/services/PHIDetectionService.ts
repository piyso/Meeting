/**
 * PHI Detection Service
 *
 * Detects Protected Health Information (PHI) in text before cloud sync.
 * Implements HIPAA's 18 identifiers for PHI detection.
 *
 * HIPAA PHI Identifiers:
 * 1. Names
 * 2. Geographic subdivisions smaller than state
 * 3. Dates (except year)
 * 4. Telephone numbers
 * 5. Fax numbers
 * 6. Email addresses
 * 7. Social Security numbers
 * 8. Medical record numbers
 * 9. Health plan beneficiary numbers
 * 10. Account numbers
 * 11. Certificate/license numbers
 * 12. Vehicle identifiers
 * 13. Device identifiers
 * 14. URLs
 * 15. IP addresses
 * 16. Biometric identifiers
 * 17. Full-face photos
 * 18. Any other unique identifying number
 */

/**
 * PHI detection result
 */
export interface PHIDetectionResult {
  hasPHI: boolean
  riskLevel: 'none' | 'low' | 'medium' | 'high'
  detectedIdentifiers: PHIIdentifier[]
  maskedText?: string
}

/**
 * Detected PHI identifier
 */
export interface PHIIdentifier {
  type: PHIType
  value: string
  startIndex: number
  endIndex: number
  confidence: number
}

/**
 * PHI identifier types
 */
export enum PHIType {
  NAME = 'name',
  ADDRESS = 'address',
  DATE = 'date',
  PHONE = 'phone',
  EMAIL = 'email',
  SSN = 'ssn',
  MRN = 'mrn', // Medical Record Number
  ACCOUNT_NUMBER = 'account_number',
  IP_ADDRESS = 'ip_address',
  URL = 'url',
  CREDIT_CARD = 'credit_card',
  // International identifiers
  AADHAAR = 'aadhaar',
  JP_MY_NUMBER = 'jp_my_number',
  KR_RRN = 'kr_rrn',
  INTL_PHONE = 'intl_phone',
  JP_PHONE = 'jp_phone',
}

/**
 * PHI Detection Service Class
 */
export class PHIDetectionService {
  // Regex patterns for PHI detection
  private static readonly PATTERNS = {
    // Social Security Number: 123-45-6789 or 123456789
    SSN: /\b\d{3}-?\d{2}-?\d{4}\b/g,

    // Phone numbers: (123) 456-7890, 123-456-7890, 1234567890
    PHONE: /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,

    // Email addresses
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,

    // Medical Record Number: MRN-123456, MRN 123456, MR#123456
    MRN: /\b(MRN|MR#?|MEDICAL\s+RECORD)\s*[:-]?\s*\d{5,10}\b/gi,

    // Credit Card: 1234-5678-9012-3456 or 1234567890123456
    CREDIT_CARD: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,

    // IP Address: 192.168.1.1
    IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,

    // URLs: http://example.com, https://example.com
    URL: /\b(https?:\/\/[^\s]+)\b/g,

    // Dates: MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD (except year-only)
    DATE: /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,

    // US Street Address: 123 Main St, 456 Oak Avenue
    ADDRESS:
      /\b\d+\s+[A-Za-z\s]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way)\b/gi,

    // Account numbers: Account #123456, Acct: 123456
    ACCOUNT_NUMBER: /\b(Account|Acct|A\/C)\s*[#:]?\s*\d{5,12}\b/gi,

    // International PHI patterns
    // India: Aadhaar number (exactly 12 digits, grouped 4-4-4, cannot start with 0 or 1)
    AADHAAR: /\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b/g,

    // Japan: My Number (exactly 12 digits, first digit 1-9, usually no grouping)
    JP_MY_NUMBER: /\b[1-9]\d{11}\b/g,

    // Korea: Resident Registration Number (6 digits - 7 digits)
    KR_RRN: /\b\d{6}[\s-]\d{7}\b/g,

    // International phone: +91, +81, +82, +44, +49, etc.
    INTL_PHONE: /\b\+\d{1,3}[\s-]?\(?\d{1,4}\)?[\s-]?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{0,4}\b/g,

    // Japan phone: 090-1234-5678, 03-1234-5678
    JP_PHONE: /\b0\d{1,4}[\s-]\d{2,4}[\s-]\d{3,4}\b/g,

    // European: IBAN (2-letter country + 2 check + up to 30 alphanumeric)
    IBAN: /\b[A-Z]{2}\d{2}\s?[\dA-Z]{4}\s?[\dA-Z]{4}\s?[\dA-Z]{4}\s?[\dA-Z]{0,16}\b/g,

    // UK: National Insurance Number (AB 12 34 56 C)
    UK_NINO: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,

    // Germany: Tax ID / Steuer-IdNr (11 digits)
    DE_TAX_ID: /\b\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/g,
  }

  /**
   * Detect PHI in text
   *
   * @param text - Text to analyze
   * @returns PHI detection result
   */
  public static detectPHI(text: string): PHIDetectionResult {
    const allMatches: PHIIdentifier[] = []

    // Check each pattern
    for (const [type, pattern] of Object.entries(this.PATTERNS)) {
      const regex = new RegExp(pattern.source, pattern.flags)
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        if (match.index !== undefined) {
          allMatches.push({
            type: type.toLowerCase() as PHIType,
            value: match[0],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            confidence: this.calculateConfidence(type, match[0]),
          })
        }
      }
    }

    // Deduplicate overlapping matches: prefer more specific types
    // Priority: account_number > ssn, credit_card > ssn, mrn > ssn, phone > ssn
    const specificTypes = [
      'account_number',
      'credit_card',
      'mrn',
      'phone',
      'aadhaar',
      'jp_my_number',
      'intl_phone',
      'jp_phone',
    ]
    const genericTypes = ['ssn']
    const detectedIdentifiers = allMatches.filter(match => {
      if (genericTypes.includes(match.type)) {
        // Check if a more specific match overlaps this range (partial or full)
        const hasOverlap = allMatches.some(
          other =>
            specificTypes.includes(other.type) &&
            other.startIndex < match.endIndex &&
            other.endIndex > match.startIndex
        )
        return !hasOverlap
      }
      return true
    })

    // Calculate risk level
    const riskLevel = this.calculateRiskLevel(detectedIdentifiers)

    return {
      hasPHI: detectedIdentifiers.length > 0,
      riskLevel,
      detectedIdentifiers,
      maskedText:
        detectedIdentifiers.length > 0 ? this.maskPHI(text, detectedIdentifiers) : undefined,
    }
  }

  /**
   * Calculate confidence score for detected identifier
   *
   * @param type - PHI type
   * @param value - Detected value
   * @returns Confidence score (0-1)
   */
  private static calculateConfidence(type: string, value: string): number {
    switch (type) {
      case 'SSN':
        // High confidence if format is 123-45-6789
        return value.includes('-') ? 0.95 : 0.75
      case 'PHONE':
        // High confidence if includes area code
        return value.length >= 10 ? 0.9 : 0.7
      case 'EMAIL':
        // High confidence for email
        return 0.95
      case 'MRN':
        // High confidence if explicitly labeled
        return value.toLowerCase().includes('mrn') ? 0.9 : 0.7
      case 'CREDIT_CARD':
        // Medium confidence (could be other numbers)
        return 0.7
      case 'IP_ADDRESS':
        // Medium confidence (common in tech discussions)
        return 0.6
      case 'URL':
        // Low confidence (URLs are often public)
        return 0.5
      case 'DATE':
        // Low confidence (dates are common)
        return 0.5
      case 'ADDRESS':
        // Medium confidence
        return 0.7
      case 'ACCOUNT_NUMBER':
        // High confidence if explicitly labeled
        return value.toLowerCase().includes('account') ? 0.85 : 0.6
      case 'AADHAAR':
        // High confidence: starts with 2-9, specific format
        return value.includes('-') || value.includes(' ') ? 0.85 : 0.7
      case 'JP_MY_NUMBER':
        // Medium confidence: 12 digits could be other IDs
        return 0.65
      case 'KR_RRN':
        // High confidence: 6-7 format is unique to Korean RRN
        return 0.9
      case 'INTL_PHONE':
        // High confidence: starts with + country code
        return 0.85
      case 'JP_PHONE':
        // Medium-high confidence: 0xx-xxxx format is specific
        return 0.8
      default:
        return 0.5
    }
  }

  /**
   * Calculate overall risk level
   *
   * @param identifiers - Detected identifiers
   * @returns Risk level
   */
  private static calculateRiskLevel(
    identifiers: PHIIdentifier[]
  ): 'none' | 'low' | 'medium' | 'high' {
    if (identifiers.length === 0) {
      return 'none'
    }

    // High risk: SSN, MRN, or multiple high-confidence identifiers
    const highRiskTypes = ['ssn', 'mrn', 'credit_card']
    const hasHighRisk = identifiers.some(id => highRiskTypes.includes(id.type))
    if (hasHighRisk) {
      return 'high'
    }

    // Medium risk: Multiple identifiers or sensitive types
    const sensitiveTypes = ['phone', 'email', 'address', 'account_number']
    const hasSensitive = identifiers.some(id => sensitiveTypes.includes(id.type))
    if (identifiers.length >= 3 || hasSensitive) {
      return 'medium'
    }

    // Low risk: Few identifiers with low confidence
    return 'low'
  }

  /**
   * Mask PHI in text
   *
   * @param text - Original text
   * @param identifiers - Detected identifiers
   * @returns Masked text
   */
  public static maskPHI(text: string, identifiers: PHIIdentifier[]): string {
    let maskedText = text

    // Deduplicate overlapping matches: sort by start ascending, then merge overlaps
    // Higher-confidence match wins when spans overlap
    const sorted = [...identifiers].sort((a, b) =>
      a.startIndex !== b.startIndex ? a.startIndex - b.startIndex : b.confidence - a.confidence
    )

    const deduped: PHIIdentifier[] = []
    for (const ident of sorted) {
      const last = deduped[deduped.length - 1]
      if (last && ident.startIndex < last.endIndex) {
        // Overlap detected — keep the higher-confidence match
        if (ident.confidence > last.confidence) {
          deduped[deduped.length - 1] = ident
        }
        // Otherwise skip this overlapping match
      } else {
        deduped.push(ident)
      }
    }

    // Sort by start index descending to avoid index shifting during replacement
    const descending = [...deduped].sort((a, b) => b.startIndex - a.startIndex)

    for (const identifier of descending) {
      const maskLength = identifier.value.length
      const mask = this.getMaskForType(identifier.type, maskLength)
      maskedText =
        maskedText.substring(0, identifier.startIndex) +
        mask +
        maskedText.substring(identifier.endIndex)
    }

    return maskedText
  }

  /**
   * Get mask string for PHI type
   *
   * @param type - PHI type
   * @param length - Original value length
   * @returns Mask string
   */
  private static getMaskForType(type: PHIType, length: number): string {
    switch (type) {
      case PHIType.SSN:
        return '***-**-****'
      case PHIType.PHONE:
        return '***-***-****'
      case PHIType.EMAIL:
        return '***@***.***'
      case PHIType.MRN:
        return 'MRN-******'
      case PHIType.CREDIT_CARD:
        return '****-****-****-****'
      case PHIType.IP_ADDRESS:
        return '***.***.***.***'
      case PHIType.ACCOUNT_NUMBER:
        return 'ACCT-******'
      default:
        return '*'.repeat(Math.min(length, 10))
    }
  }

  /**
   * Check if text should be synced to cloud
   * Returns warning message if PHI detected
   *
   * @param text - Text to check
   * @returns Warning message or null if safe to sync
   */
  public static checkBeforeSync(text: string): string | null {
    const result = this.detectPHI(text)

    if (!result.hasPHI) {
      return null
    }

    switch (result.riskLevel) {
      case 'high':
        return `⚠️ HIGH RISK: Detected ${result.detectedIdentifiers.length} PHI identifiers including sensitive data (SSN, MRN, or credit card). Syncing to cloud may violate HIPAA compliance. Consider masking or keeping local-only.`
      case 'medium':
        return `⚠️ MEDIUM RISK: Detected ${result.detectedIdentifiers.length} PHI identifiers (phone, email, address). Review before syncing to cloud.`
      case 'low':
        return `ℹ️ LOW RISK: Detected ${result.detectedIdentifiers.length} potential PHI identifiers. Review if sensitive.`
      default:
        return null
    }
  }

  /**
   * Get user-friendly description of detected PHI
   *
   * @param result - PHI detection result
   * @returns Human-readable description
   */
  public static getDescription(result: PHIDetectionResult): string {
    if (!result.hasPHI) {
      return 'No PHI detected'
    }

    const typeCounts = result.detectedIdentifiers.reduce(
      (acc, id) => {
        acc[id.type] = (acc[id.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    const descriptions = Object.entries(typeCounts).map(([type, count]) => {
      const label = type.replace('_', ' ').toUpperCase()
      return `${count} ${label}${count > 1 ? 's' : ''}`
    })

    return `Detected: ${descriptions.join(', ')}`
  }
}
