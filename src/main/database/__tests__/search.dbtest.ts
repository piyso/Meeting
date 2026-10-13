/**
 * Note search over real SQLite — run with `npm run test:db`.
 *
 * Notes are stored as editor HTML. The search must find them by their words,
 * must not find them by their markup, and must hand back excerpts that can be
 * shown as plain text.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { initializeDatabase, closeDatabase } from '../connection'
import { createMeeting } from '../crud/meetings'
import { createNote } from '../crud/notes'
import { createTranscript } from '../crud/transcripts'
import { searchNotes, searchTranscripts } from '../search'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluearkive-searchtest-'))
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
}

initializeDatabase({ filename: path.join(dir, 'search.db') })
createMeeting({ id: 'm1', title: 'Budget review', start_time: 1_760_000_000 })
createNote({
  id: 'n1',
  meeting_id: 'm1',
  timestamp: 1,
  original_text:
    '<p>Ask about <strong>headcount</strong> for the platform team</p><ul><li><p>two backend roles</p></li></ul>',
})
createNote({
  id: 'n2',
  meeting_id: 'm1',
  timestamp: 2,
  original_text: '<p>Short</p>',
  augmented_text:
    '<p>The <em>forecast</em> for marketing was revised upward after the review; the café budget stays.</p>',
  is_augmented: true,
})
for (let i = 0; i < 60; i++) {
  createNote({
    id: `filler-${i}`,
    meeting_id: 'm1',
    timestamp: 10 + i,
    original_text: `<p class="strong">filler ${i}</p><ul><li><p>item</p></li></ul>`,
  })
}
createTranscript({
  id: 't1',
  meeting_id: 'm1',
  start_time: 0,
  end_time: 5,
  text: 'Let us talk about the quarterly forecast and the hiring plan.',
})

console.log('== notes are found by their words')
const headcount = searchNotes('headcount')
check('a word inside inline formatting', headcount.length === 1 && headcount[0]?.note.id === 'n1')
check(
  'the excerpt is text, with no markup in it',
  !!headcount[0] &&
    !/[<>]/.test(headcount[0].snippet) &&
    headcount[0].snippet.includes('headcount'),
  headcount[0]?.snippet
)
const forecast = searchNotes('forecast')
check(
  'a word that is only in the expanded text',
  forecast.length === 1 &&
    forecast[0]?.note.id === 'n2' &&
    forecast[0].snippet.includes('forecast') &&
    !/[<>]/.test(forecast[0].snippet),
  forecast[0]?.snippet
)
check('a prefix, as while typing', searchNotes('headc').length === 1)
check('several words', searchNotes('backend roles').length === 1)
check('without accents', searchNotes('cafe').length === 1)

console.log('== and not by their markup')
for (const tag of ['strong', 'li', 'ul', 'em', 'class']) {
  const found = searchNotes(tag)
  check(`"${tag}" finds nothing`, found.length === 0, `${found.length} result(s)`)
}
// A single letter is a prefix search: of 62 notes wrapped in <p>, only the
// one with a word that starts with "p" ("platform") is a match.
const p = searchNotes('p')
check('"p" finds the note about the platform team only', p.length === 1 && p[0]?.note.id === 'n1')

console.log('== paging counts real matches')
const firstPage = searchNotes('filler', { limit: 25 })
const secondPage = searchNotes('filler', { limit: 25, offset: 25 })
const thirdPage = searchNotes('filler', { limit: 25, offset: 50 })
const ids = new Set([...firstPage, ...secondPage, ...thirdPage].map(r => r.note.id))
check(
  'pages are full and do not overlap',
  firstPage.length === 25 && secondPage.length === 25 && thirdPage.length === 10 && ids.size === 60,
  `${firstPage.length}/${secondPage.length}/${thirdPage.length}, ${ids.size} distinct`
)

console.log('== transcript excerpts')
const spoken = searchTranscripts('forecast')
check(
  'are plain text too',
  spoken.length === 1 &&
    spoken[0]?.snippet.includes('forecast') === true &&
    !/[<>]/.test(spoken[0].snippet),
  spoken[0]?.snippet
)

closeDatabase()
fs.rmSync(dir, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
