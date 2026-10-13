import { describe, it, expect } from 'vitest'
import { splitIntoParts } from '../splitText'

describe('splitIntoParts', () => {
  it('returns short text as a single part', () => {
    expect(splitIntoParts('one\ntwo', 100)).toEqual(['one\ntwo'])
  })

  it('breaks between lines and never exceeds the size', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Speaker: line number ${i}`)
    const parts = splitIntoParts(lines.join('\n'), 120)

    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(120)
    // Nothing lost, nothing reordered, no line cut in half
    expect(parts.join('\n')).toBe(lines.join('\n'))
  })

  it('cuts a single line that is longer than a part', () => {
    const parts = splitIntoParts('x'.repeat(250), 100)
    expect(parts.map(p => p.length)).toEqual([100, 100, 50])
  })

  it('keeps text around an over-long line', () => {
    const parts = splitIntoParts(['before', 'y'.repeat(25), 'after'].join('\n'), 10)
    expect(parts).toEqual(['before', 'y'.repeat(10), 'y'.repeat(10), 'y'.repeat(5), 'after'])
  })

  it('returns nothing for empty text', () => {
    expect(splitIntoParts('', 10)).toEqual([])
  })
})
