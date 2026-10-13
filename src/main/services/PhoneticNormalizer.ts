/**
 * PhoneticNormalizer — Code-switching and Hinglish / Deccani Phonetic Normalizer
 *
 * Ports the speech pacing and code-switching phonetic dictionary from the
 * Voice Over / DSP Studio assets to enhance speech recognition accuracy and entity extraction.
 *
 * Normalizes common code-switched terms across Indian English meetings before:
 * 1. Pre-ASR prompt biasing
 * 2. Post-ASR transcript boundary detection
 * 3. Semantic indexing and NER entity matching
 */

export interface PhoneticMapping {
  raw: string
  canonical: string
  category: 'term' | 'slang' | 'filler' | 'affirmation' | 'idiom'
  weight: number
}

export const PHONETIC_DICTIONARY: PhoneticMapping[] = [
  // Deccani / Hyderabad / South Asian terms
  { raw: 'miyan', canonical: 'miyan', category: 'term', weight: 1.0 },
  { raw: 'pasha', canonical: 'pasha', category: 'term', weight: 1.0 },
  { raw: 'dimag', canonical: 'dimaag', category: 'term', weight: 1.0 },
  { raw: 'dimaag kharab', canonical: 'dimaag kharaab', category: 'idiom', weight: 1.2 },
  { raw: 'kaiko', canonical: 'kyun', category: 'slang', weight: 0.9 },
  { raw: 'nakko', canonical: 'nahi', category: 'slang', weight: 0.9 },
  { raw: 'hau', canonical: 'haan', category: 'affirmation', weight: 0.9 },
  { raw: 'pottey', canonical: 'ladke', category: 'term', weight: 0.8 },
  { raw: 'kirrak', canonical: 'shandaar', category: 'slang', weight: 0.9 },
  { raw: 'hallu', canonical: 'dheere', category: 'term', weight: 0.8 },

  // Hinglish Business & Work Expressions
  { raw: 'jugaad', canonical: 'jugaad', category: 'term', weight: 1.0 },
  { raw: 'accha', canonical: 'achha', category: 'affirmation', weight: 0.8 },
  { raw: 'theek hai', canonical: 'theek hai', category: 'affirmation', weight: 0.8 },
  { raw: 'chalo', canonical: 'chalo', category: 'filler', weight: 0.7 },
  { raw: 'kya bolte', canonical: 'kya bolte', category: 'filler', weight: 0.8 },
  { raw: 'fundae', canonical: 'fundas', category: 'slang', weight: 0.9 },
  { raw: 'pakka', canonical: 'pakka', category: 'affirmation', weight: 0.9 },
  { raw: 'arre', canonical: 'are', category: 'filler', weight: 0.6 },
  { raw: 'bas', canonical: 'bas', category: 'filler', weight: 0.7 },
  { raw: 'matlab', canonical: 'meaning', category: 'filler', weight: 0.7 },
  { raw: 'faaltu', canonical: 'useless', category: 'slang', weight: 0.8 },
  { raw: 'scene', canonical: 'situation', category: 'slang', weight: 0.8 },
  { raw: 'fundoo', canonical: 'great', category: 'slang', weight: 0.8 },
  { raw: 'bindaas', canonical: 'carefree', category: 'slang', weight: 0.8 },
]

export class PhoneticNormalizer {
  private normalizerMap = new Map<string, string>()
  private regexPattern: RegExp

  constructor() {
    for (const item of PHONETIC_DICTIONARY) {
      this.normalizerMap.set(item.raw.toLowerCase(), item.canonical)
    }

    // Build unified regex for whole-word replacement with word boundaries
    const escapedTerms = Array.from(this.normalizerMap.keys())
      .sort((a, b) => b.length - a.length) // Longest match first
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

    this.regexPattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi')
  }

  /**
   * Normalize transcript text by replacing misrecognized phonetic variants
   * with their canonical representation.
   */
  normalizeText(text: string): string {
    if (!text || text.trim().length === 0) return text

    return text.replace(this.regexPattern, match => {
      const canonical = this.normalizerMap.get(match.toLowerCase())
      if (!canonical) return match

      // Preserve title casing if original was title cased
      if (match[0] && match[0] === match[0].toUpperCase()) {
        return canonical.charAt(0).toUpperCase() + canonical.slice(1)
      }
      return canonical
    })
  }

  /**
   * Extract code-switched terms detected in text.
   */
  extractPhoneticTerms(text: string): Array<{ term: string; canonical: string; index: number }> {
    const matches: Array<{ term: string; canonical: string; index: number }> = []
    let match: RegExpExecArray | null

    const regex = new RegExp(this.regexPattern.source, 'gi')
    while ((match = regex.exec(text)) !== null) {
      const raw = match[0].toLowerCase()
      const canonical = this.normalizerMap.get(raw) || match[0]
      matches.push({
        term: match[0],
        canonical,
        index: match.index,
      })
    }

    return matches
  }

  /**
   * Alias for extracting replacements with original and canonical terms
   */
  getReplacements(text: string): Array<{ original: string; canonical: string; index: number }> {
    return this.extractPhoneticTerms(text).map(t => ({
      original: t.term,
      canonical: t.canonical,
      index: t.index,
    }))
  }

  /**
   * Build pre-ASR prompt biasing string with common custom terms.
   */
  getASRPromptBias(): string {
    return Array.from(this.normalizerMap.values()).slice(0, 30).join(', ')
  }
}

let instance: PhoneticNormalizer | null = null
export function getPhoneticNormalizer(): PhoneticNormalizer {
  if (!instance) instance = new PhoneticNormalizer()
  return instance
}
