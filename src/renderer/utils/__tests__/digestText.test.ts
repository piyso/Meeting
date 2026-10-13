import { describe, it, expect } from 'vitest'
import {
  digestLines,
  isDigestSectionUnavailable,
  parseActionItems,
  parseDecisions,
} from '../digestText'

describe('digestLines', () => {
  it('reads the lines the main process sends', () => {
    expect(digestLines('- Launch moved to March 14th.\n- Pilot approved.')).toEqual([
      'Launch moved to March 14th.',
      'Pilot approved.',
    ])
  })

  it('reads summaries stored by earlier versions (numbered, starred, with headings)', () => {
    expect(
      digestLines('**Key Points:**\n1. Launch moved.\n* **Pilot** approved.\n• Widget dropped.')
    ).toEqual(['Launch moved.', 'Pilot approved.', 'Widget dropped.'])
  })

  it('is empty for nothing, "none" and the unavailable marker', () => {
    expect(digestLines(undefined)).toEqual([])
    expect(digestLines('')).toEqual([])
    expect(digestLines('NONE')).toEqual([])
    expect(digestLines('⚠️ AI unavailable')).toEqual([])
  })
})

describe('parseDecisions', () => {
  it('turns lines of text into decisions', () => {
    // This is what the app receives. It used to be given to JSON.parse, which
    // threw, so the decisions list was always empty.
    expect(parseDecisions('- The launch moves to March 14th.\n- The widget is dropped.')).toEqual([
      { text: 'The launch moves to March 14th.' },
      { text: 'The widget is dropped.' },
    ])
  })

  it('passes structured decisions through', () => {
    const decisions = [{ text: 'Use Postgres', changed: true, previousValue: 'Use MySQL' }]
    expect(parseDecisions(decisions)).toEqual(decisions)
    expect(parseDecisions(JSON.stringify(decisions))).toEqual(decisions)
    expect(parseDecisions('["One", "Two"]')).toEqual([{ text: 'One' }, { text: 'Two' }])
  })

  it('is empty for missing or unusable values', () => {
    expect(parseDecisions(undefined)).toEqual([])
    expect(parseDecisions('')).toEqual([])
    expect(parseDecisions(42)).toEqual([])
    expect(parseDecisions('⚠️ AI unavailable')).toEqual([])
  })
})

describe('parseActionItems', () => {
  it('separates the assignee from the task', () => {
    expect(
      parseActionItems(
        '- Marco: provide the staging environment by October 16th\n- [Priya]: own the audit'
      )
    ).toEqual([
      {
        assignee: 'Marco',
        text: 'provide the staging environment by October 16th',
        completed: false,
      },
      { assignee: 'Priya', text: 'own the audit', completed: false },
    ])
  })

  it('keeps a task nobody is named for', () => {
    expect(parseActionItems('- Send the offer by Thursday')).toEqual([
      { assignee: '', text: 'Send the offer by Thursday', completed: false },
    ])
  })

  it('does not mistake a sentence with a colon for a name', () => {
    const line =
      'The team agreed to do the following before the launch date: finish the import worker'
    expect(parseActionItems(`- ${line}`)).toEqual([{ assignee: '', text: line, completed: false }])
  })

  it('keeps a time in the task intact', () => {
    expect(parseActionItems('- Dana: meet again Thursday at 10:30')).toEqual([
      { assignee: 'Dana', text: 'meet again Thursday at 10:30', completed: false },
    ])
  })

  it('passes structured action items through', () => {
    const items = [{ id: 'a1', text: 'Ship it', assignee: 'Sam', completed: true }]
    expect(parseActionItems(items)).toEqual(items)
    expect(parseActionItems(JSON.stringify(items))).toEqual(items)
    expect(parseActionItems([{ text: 'No owner' }])).toEqual([
      { text: 'No owner', assignee: '', completed: false },
    ])
  })

  it('is empty when nothing was found or the section is unavailable', () => {
    expect(parseActionItems('')).toEqual([])
    expect(parseActionItems('NONE')).toEqual([])
    expect(parseActionItems('⚠️ AI unavailable')).toEqual([])
    expect(parseActionItems(null)).toEqual([])
  })
})

describe('isDigestSectionUnavailable', () => {
  it('tells "could not be generated" from "nothing found"', () => {
    expect(isDigestSectionUnavailable('⚠️ AI unavailable')).toBe(true)
    expect(isDigestSectionUnavailable('')).toBe(false)
    expect(isDigestSectionUnavailable('- Marco: do it')).toBe(false)
    expect(isDigestSectionUnavailable(undefined)).toBe(false)
  })
})
