import { describe, it, expect } from 'vitest'
import { containsAllTerms, excerptAround, plainTextFromHtml, searchTerms } from '../htmlText'

describe('plainTextFromHtml', () => {
  it('keeps the words and the line structure, drops the markup', () => {
    expect(
      plainTextFromHtml(
        '<h2>Plan</h2><p>Ask about <strong class="x">headcount</strong></p><ul><li>one</li><li>two</li></ul>'
      )
    ).toBe('Plan\nAsk about headcount\none\ntwo')
  })

  it('decodes the entities the editor writes, once', () => {
    expect(plainTextFromHtml('<p>R&amp;D &lt;3 &quot;quotes&quot;&nbsp;here</p>')).toBe(
      'R&D <3 "quotes" here'
    )
    // Text that only looks like an entity after decoding stays as typed.
    expect(plainTextFromHtml('<p>&amp;lt;</p>')).toBe('&lt;')
  })

  it('leaves text that was never HTML alone', () => {
    expect(plainTextFromHtml('just a line')).toBe('just a line')
  })
})

describe('searchTerms', () => {
  it('gives the words of a query, without operators, case or accents', () => {
    expect(searchTerms('  Café "Budget*" (Q4) ')).toEqual(['cafe', 'budget', 'q4'])
    expect(searchTerms('')).toEqual([])
  })
})

describe('excerptAround', () => {
  const text =
    'We agreed to revisit the hiring plan next quarter. The forecast for marketing was revised upward after the review, and Asha will send the numbers on Friday.'

  it('cuts a readable stretch around the first match', () => {
    const excerpt = excerptAround(text, ['forecast'], 30)
    expect(excerpt).toContain('forecast')
    expect(excerpt?.startsWith('…')).toBe(true)
    expect(excerpt?.endsWith('…')).toBe(true)
    expect(excerpt?.length).toBeLessThan(90)
    // Whole words at both ends.
    expect(excerpt).toMatch(/^…\S+ /)
  })

  it('matches the start of a word, as typing a prefix does — not the middle of one', () => {
    expect(excerptAround(text, ['fore'])).toContain('forecast')
    expect(excerptAround(text, ['cast'])).toBeNull()
    expect(excerptAround('the plan', ['p'])).toContain('plan')
    expect(excerptAround('stop', ['p'])).toBeNull()
  })

  it('ignores case and accents, as the index does', () => {
    expect(excerptAround('Meet at the Café tomorrow', ['cafe'])).toContain('Café')
  })

  it('returns the whole text when it is short', () => {
    expect(excerptAround('Ask about headcount', ['headcount'])).toBe('Ask about headcount')
  })
})

describe('containsAllTerms', () => {
  it('needs every term to start a word', () => {
    expect(containsAllTerms('Ask about headcount', ['ask', 'head'])).toBe(true)
    expect(containsAllTerms('Ask about headcount', ['ask', 'budget'])).toBe(false)
  })
})
