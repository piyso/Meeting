/**
 * LocalEntityExtractor — Real-time regex-based entity extraction (Tier 2)
 *
 * Blueprint §2.9: Fast local extraction runs during meetings.
 * Extracts: PERSON, DATE, AMOUNT, EMAIL, ACTION_ITEM
 * Speed: <10ms per transcript segment
 * Accuracy: ~70% (supplemented by PiyAPI server-side extraction for Pro users)
 */

export interface ExtractedEntity {
  text: string
  type: 'PERSON' | 'DATE' | 'AMOUNT' | 'EMAIL' | 'ACTION_ITEM'
  confidence: number
  startOffset: number
  endOffset: number
}

export class LocalEntityExtractor {
  // Regex patterns for real-time extraction (Blueprint §2.9)
  private patterns: Record<string, RegExp> = {
    // Unicode-aware: matches names in Latin, CJK, Devanagari, Arabic, Hangul, and Thai scripts
    PERSON:
      /\b(?:(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+)?(?:\p{Lu}\p{Ll}{1,20}\s+\p{Lu}\p{Ll}{1,20}|[\u4e00-\u9fff]{2,4}|[\uac00-\ud7af]{2,4}|[\u0900-\u097f]{2,15}(?:\s[\u0900-\u097f]{2,15}){0,2}|[\u0600-\u06ff]{2,15}(?:\s[\u0600-\u06ff]{2,15}){0,2}|[\u0e00-\u0e7f]{2,15})\b/gu,
    // International date formats: MM/DD/YYYY, DD.MM.YYYY, YYYY-MM-DD, "Month Day, Year"
    DATE: /\b(?:\d{1,2}[/\-.]?\d{1,2}[/\-.]?\d{2,4}|\d{4}[/\-.]?\d{1,2}[/\-.]?\d{1,2}|\w+ \d{1,2}(?:st|nd|rd|th)?(?:,? \d{4})?)\b/g,
    // International currencies: prefix ($, €, £, ¥, ₹, ₩) and postfix (万円, 원, EUR)
    AMOUNT:
      /(?:[$€£¥₹₩][\d,]+(?:\.\d{2})?[KMB]?\b|\b[\d,]+(?:\.\d{2})?\s*(?:万?円|원|EUR|GBP|USD|CHF|RUB|INR)\b|\b[\d,]+(?:\.\d{2})?\s*[$€£¥₹₩])/g,
    EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    // Multilingual action item keywords (English, Spanish, French, German, Japanese, Korean, Hindi)
    ACTION_ITEM:
      /\b(?:TODO|ACTION|TASK|need to|should|must|will|necesita|doit|muss|soll|必要|해야|करना\s+है|करना\s+होगा)\b[^\n]*?[.!?\n。！？]/giu,
  }

  /**
   * Extract entities from text using regex patterns.
   * Runs in <10ms for typical transcript segments.
   */
  extract(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = []

    for (const [type, pattern] of Object.entries(this.patterns)) {
      // Reset regex state for each call
      const regex = new RegExp(pattern.source, pattern.flags)
      let match: RegExpExecArray | null

      while ((match = regex.exec(text)) !== null) {
        // Avoid zero-length matches causing infinite loops
        if (match[0].length === 0) {
          regex.lastIndex++
          continue
        }

        entities.push({
          text: match[0].trim(),
          type: type as ExtractedEntity['type'],
          confidence: this.getConfidence(type),
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        })
      }
    }

    // Deduplicate entities with same text and type
    return this.deduplicate(entities)
  }

  /**
   * Extract entities from multiple transcript segments (batch)
   */
  extractBatch(texts: Array<{ id: string; text: string }>): Map<string, ExtractedEntity[]> {
    const results = new Map<string, ExtractedEntity[]>()
    for (const item of texts) {
      results.set(item.id, this.extract(item.text))
    }
    return results
  }

  private getConfidence(type: string): number {
    // Regex-based extraction has varying accuracy per type
    const confidenceMap: Record<string, number> = {
      PERSON: 0.7,
      DATE: 0.85,
      AMOUNT: 0.9,
      EMAIL: 0.95,
      ACTION_ITEM: 0.65,
    }
    return confidenceMap[type] ?? 0.75
  }

  private deduplicate(entities: ExtractedEntity[]): ExtractedEntity[] {
    const seen = new Set<string>()
    return entities.filter(entity => {
      const key = `${entity.type}:${entity.text.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
}

// Singleton instance
let instance: LocalEntityExtractor | null = null

export function getLocalEntityExtractor(): LocalEntityExtractor {
  if (!instance) {
    instance = new LocalEntityExtractor()
  }
  return instance
}
