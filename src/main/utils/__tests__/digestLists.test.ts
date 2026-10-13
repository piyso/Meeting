import { describe, it, expect } from 'vitest'
import {
  formatBulletList,
  leadingSentences,
  mergeBulletLists,
  parseActionLines,
  parseBulletLines,
  parseDecisionLines,
} from '../digestLists'

// The inputs below are answers the 1.5B model actually gave during testing.

describe('parseBulletLines', () => {
  it('reads dash, star, dot and numbered lists', () => {
    expect(parseBulletLines('- one\n* two\n• three\n1. four\n2) five')).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
    ])
  })

  it('drops headings, emphasis marks and empty lines', () => {
    const answer =
      '**Key Points:**\n\n- **Launch** moved to March 14th.\n\nDecisions Made:\n- Widget dropped.'
    expect(parseBulletLines(answer)).toEqual(['Launch moved to March 14th.', 'Widget dropped.'])
  })

  it('treats "none" answers as an empty list', () => {
    for (const answer of [
      'NONE',
      '- None.',
      'No action items.',
      'There are no decisions in this part.',
      'N/A',
    ]) {
      expect(parseBulletLines(answer)).toEqual([])
    }
  })

  it('keeps a line that merely ends with a colon when it is a sentence', () => {
    const line = 'The team agreed on the following plan for the next two quarters:'
    expect(parseBulletLines(line)).toEqual([line])
  })
})

describe('parseActionLines', () => {
  it('removes brackets and the echoed format words', () => {
    expect(
      parseActionLines(
        '- [Marco]: Task description: provide the staging environment\n- Sam: Task: move the webinar'
      )
    ).toEqual(['Marco: provide the staging environment', 'Sam: move the webinar'])
  })

  it('splits several items the model wrote on one line', () => {
    const answer =
      '- Lena: pilot agreement to legal by Monday and the warehouse interface description. Priya: named contact for the pilot and the audit end to end. NONE'
    expect(parseActionLines(answer)).toEqual([
      'Lena: pilot agreement to legal by Monday and the warehouse interface description.',
      'Priya: named contact for the pilot and the audit end to end.',
    ])
  })

  it('drops names with nothing to do, bare names and mis-filed decisions', () => {
    const answer =
      '- Dana: NONE\n- Marco: None.\n- Dana\n- Marco: Decision: the public launch moves to March fourteenth.\n- Priya: own the security audit'
    expect(parseActionLines(answer)).toEqual(['Priya: own the security audit'])
  })

  it('drops a line too long to be one item', () => {
    const looping = `- Priya: ${'coordinate with Kestrel for the report, '.repeat(12)}`
    expect(parseActionLines(`${looping}\n- Sam: move the webinar`)).toEqual([
      'Sam: move the webinar',
    ])
  })
})

describe('parseDecisionLines', () => {
  it('removes "Decision:" and known speaker labels', () => {
    const answer =
      '- Decision: the public launch moves to March fourteenth.\n- Dana: We offer Aiko eighty-eight thousand euros.\n- Budget: forty-two thousand euros approved.'
    expect(parseDecisionLines(answer, ['Dana', 'Marco'])).toEqual([
      'The public launch moves to March fourteenth.',
      'We offer Aiko eighty-eight thousand euros.',
      'Budget: forty-two thousand euros approved.',
    ])
  })

  it('drops questions copied from the transcript', () => {
    expect(
      parseDecisionLines(
        '- Could we close the gap with equity or a signing bonus?\n- The widget is dropped.'
      )
    ).toEqual(['The widget is dropped.'])
  })
})

describe('mergeBulletLists', () => {
  it('keeps the order of the meeting across parts', () => {
    expect(mergeBulletLists([['First decision made'], ['Second decision made'], []])).toEqual([
      'First decision made',
      'Second decision made',
    ])
  })

  it('keeps a repeated item once, in its more detailed wording', () => {
    const merged = mergeBulletLists([
      ['The Android home screen widget is dropped from the Atlas release.'],
      ['The Android widget is dropped from the release', 'The pilot starts April 7th'],
    ])
    expect(merged).toEqual([
      'The Android home screen widget is dropped from the Atlas release.',
      'The pilot starts April 7th',
    ])
  })

  it('treats an item cut off by the length limit as a repeat of the full one', () => {
    const merged = mergeBulletLists([
      ['Priya: ownership of the security audit, report due November 3rd.', 'Priya: ownership of'],
    ])
    expect(merged).toEqual(['Priya: ownership of the security audit, report due November 3rd.'])
  })

  it('removes the repeats of a model stuck in a loop', () => {
    const loop = Array.from({ length: 9 }, (_, i) =>
      i % 2
        ? 'Priya: Coordinate with Kestrel Security for the report.'
        : 'Dana: Coordinate with Kestrel Security for the report.'
    )
    expect(mergeBulletLists([loop])).toHaveLength(2)
  })

  it('does not merge the same task given to different people', () => {
    const tasks = ['Sam: update the pricing page', 'Priya: update the pricing page']
    expect(mergeBulletLists([tasks])).toEqual(tasks)
  })

  it('does not merge items that differ in a figure', () => {
    const facts = [
      'The pilot budget is approved at 42,000 euros in total',
      'The pilot budget is approved at 26,000 euros in total',
    ]
    expect(mergeBulletLists([facts])).toEqual(facts)
  })

  it('does not merge different short items', () => {
    expect(mergeBulletLists([['Hire Aiko', 'Hire Tomas']])).toEqual(['Hire Aiko', 'Hire Tomas'])
  })
})

describe('leadingSentences', () => {
  it('returns short text unchanged, as one paragraph', () => {
    expect(leadingSentences('- The launch moved.\n- The pilot was approved.', 200)).toBe(
      'The launch moved. The pilot was approved.'
    )
  })

  it('cuts at a sentence boundary', () => {
    const text =
      'The launch moved to March. The pilot was approved at 42,000 euros. The widget was dropped.'
    expect(leadingSentences(text, 70)).toBe(
      'The launch moved to March. The pilot was approved at 42,000 euros.'
    )
  })

  it('cuts a single over-long sentence with an ellipsis', () => {
    const cut = leadingSentences('word '.repeat(60), 40)
    expect(cut.length).toBeLessThanOrEqual(41)
    expect(cut.endsWith('…')).toBe(true)
  })
})

describe('formatBulletList', () => {
  it('writes one dash line per item and nothing for an empty list', () => {
    expect(formatBulletList(['a', 'b'])).toBe('- a\n- b')
    expect(formatBulletList([])).toBe('')
  })
})
