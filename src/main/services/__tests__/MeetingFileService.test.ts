/**
 * Meeting files (.pnotes) — reading one that came from somewhere else.
 *
 * The database side (export → import on another device) is in
 * meeting-file.dbtest.ts; this is about what a file is allowed to contain.
 */

import { describe, it, expect } from 'vitest'
import {
  MEETING_FILE_FORMAT,
  MeetingFileError,
  parseMeetingFile,
  plainTextFromHtml,
  renderMeetingHtml,
  type MeetingFile,
} from '../MeetingFileService'

function fileWith(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: MEETING_FILE_FORMAT,
    version: 1,
    exportedAt: '2026-10-12T10:00:00.000Z',
    meeting: { id: 'm1', title: 'Budget review', start_time: 1_760_000_000, duration: 1800 },
    transcripts: [
      { id: 't1', start_time: 0, end_time: 4, text: 'Hello there', speaker_name: 'Asha' },
    ],
    notes: [{ id: 'n1', timestamp: 2, original_text: '<p>Ask about headcount</p>' }],
    entities: [{ id: 'e1', type: 'PERSON', text: 'Asha', transcript_id: 't1' }],
    highlights: [{ start_time: 1, end_time: 3, label: 'Decision', color: '#7c3aed' }],
    ...overrides,
  })
}

describe('parseMeetingFile', () => {
  it('reads a file the app wrote', () => {
    const file = parseMeetingFile(fileWith())
    expect(file.meeting).toMatchObject({ id: 'm1', title: 'Budget review', duration: 1800 })
    expect(file.transcripts).toHaveLength(1)
    expect(file.notes[0]?.original_text).toBe('<p>Ask about headcount</p>')
    expect(file.entities[0]?.transcript_id).toBe('t1')
    expect(file.highlights).toHaveLength(1)
  })

  it.each([
    ['not JSON at all', 'PK\u0003\u0004 binary'],
    ['some other JSON', JSON.stringify({ meetings: [] })],
    ['a different format', fileWith({ format: 'something.else' })],
    ['no meeting', fileWith({ meeting: null })],
    ['a meeting without an id', fileWith({ meeting: { title: 'x', start_time: 1 } })],
    ['a meeting without a start time', fileWith({ meeting: { id: 'm1' } })],
    ['transcripts that are not a list', fileWith({ transcripts: 'all of them' })],
  ])('refuses %s', (_label, text) => {
    expect(() => parseMeetingFile(text)).toThrow(MeetingFileError)
  })

  it('says so when the file is from a newer version of the app', () => {
    expect(() => parseMeetingFile(fileWith({ version: 2 }))).toThrow(/newer version/)
  })

  it('refuses ids that are not plain identifiers', () => {
    for (const id of ["m1'; DROP TABLE meetings;--", '../../etc/passwd', '', 'a'.repeat(65), 42]) {
      expect(() =>
        parseMeetingFile(fileWith({ meeting: { id, start_time: 1_760_000_000 } }))
      ).toThrow(MeetingFileError)
    }
  })

  it('keeps the meeting and drops the records that do not hold up', () => {
    const file = parseMeetingFile(
      fileWith({
        transcripts: [
          { id: 't1', start_time: 0, end_time: 4, text: 'kept' },
          { id: 't1', start_time: 5, end_time: 6, text: 'same id again' },
          { id: 't2', start_time: 'soon', end_time: 4, text: 'bad time' },
          { id: 't3', start_time: 0, end_time: 4, text: { nested: true } },
          { id: 't4', start_time: 0, end_time: 4 },
          'not an object',
          null,
        ],
        notes: [
          { id: 'n1', timestamp: 2 },
          { timestamp: 2, original_text: 'no id' },
        ],
        entities: [
          { id: 'e1', type: 'PERSON', text: 'Asha', transcript_id: 'not-in-this-file' },
          { id: 'e2', type: 'SPACESHIP', text: 'Enterprise' },
        ],
        highlights: [
          { start_time: 5, end_time: 2 },
          { start_time: -1, end_time: 2 },
          { start_time: 1, end_time: 2, color: 'url(javascript:alert(1))' },
        ],
      })
    )
    expect(file.transcripts.map(t => t.text)).toEqual(['kept'])
    expect(file.notes).toHaveLength(0)
    // The entity stays, without a pointer to a segment that is not there.
    expect(file.entities).toEqual([expect.objectContaining({ id: 'e1', transcript_id: null })])
    expect(file.highlights).toEqual([expect.objectContaining({ start_time: 1, color: null })])
  })

  it('takes only the fields it knows', () => {
    const file = parseMeetingFile(
      fileWith({
        meeting: {
          id: 'm1',
          start_time: 1_760_000_000,
          deleted_at: 1,
          synced_at: 99,
          namespace: 'someone-elses',
          __proto__: { polluted: true },
        },
      })
    )
    expect(Object.keys(file.meeting).sort()).toEqual(
      ['duration', 'end_time', 'id', 'participant_count', 'start_time', 'tags', 'title'].sort()
    )
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('refuses a file with more records than a meeting can have', () => {
    const many = Array.from({ length: 20_001 }, (_, i) => ({
      id: `n${i}`,
      timestamp: i,
      original_text: 'x',
    }))
    expect(() => parseMeetingFile(fileWith({ notes: many }))).toThrow(/too many notes/)
  })

  it('reads word timings whether they were stored as a list or as text', () => {
    const words = [{ word: 'Hello', start: 0, end: 0.4, confidence: 0.9 }]
    for (const stored of [words, JSON.stringify(words)]) {
      const file = parseMeetingFile(
        fileWith({
          transcripts: [{ id: 't1', start_time: 0, end_time: 1, text: 'Hello', words: stored }],
        })
      )
      expect(file.transcripts[0]?.words).toEqual(words)
    }
  })
})

describe('renderMeetingHtml', () => {
  const hostile: MeetingFile = parseMeetingFile(
    fileWith({
      meeting: {
        id: 'm1',
        title: '<img src=x onerror=alert(1)>',
        start_time: 1_760_000_000,
      },
      transcripts: [
        {
          id: 't1',
          start_time: 3725,
          end_time: 3730,
          text: '</p><script>fetch("https://evil.example")</script>',
          speaker_name: '"><svg onload=alert(1)>',
        },
      ],
      notes: [
        {
          id: 'n1',
          timestamp: 2,
          original_text: '<p>Line one</p><p>Line <b>two</b> &amp; more</p>',
        },
      ],
    })
  )

  it('never lets text from the meeting become markup', () => {
    const html = renderMeetingHtml(hostile)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<svg/i)
    expect(html).toContain('&lt;script&gt;')
    // And the page itself forbids scripts and loading anything.
    expect(html).toContain("default-src 'none'")
  })

  it('shows notes as text and times as a clock', () => {
    const html = renderMeetingHtml(hostile)
    expect(html).toContain('Line one<br>Line two &amp; more')
    expect(html).toContain('1:02:05')
  })
})

describe('plainTextFromHtml', () => {
  it('turns editor HTML into the text a person typed', () => {
    expect(
      plainTextFromHtml(
        '<p>Ask about <strong>headcount</strong></p><ul><li>one</li><li>two</li></ul>'
      )
    ).toBe('Ask about headcount\none\ntwo')
    expect(plainTextFromHtml('plain text')).toBe('plain text')
    expect(plainTextFromHtml('a &lt;b&gt; &amp; c')).toBe('a <b> & c')
  })
})
