/**
 * "Export my data" over real SQLite — run with `npm run test:db`.
 *
 * Checks that the export file holds every record, that it is written in
 * batches without locking the rest of the app out of the database, that it
 * leaves out what must not be in it (embeddings, webhook secrets), and that a
 * failed export leaves nothing behind.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { initializeDatabase, closeDatabase, getDatabase } from '../../database/connection'
import { createMeeting } from '../../database/crud/meetings'
import { createTranscripts } from '../../database/crud/transcripts'
import { createNote } from '../../database/crud/notes'
import { writeUserDataExport } from '../UserDataExport'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bluearkive-exporttest-'))
let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
}

async function main(): Promise<void> {
  initializeDatabase({ filename: path.join(dir, 'export.db') })
  const db = getDatabase()

  const SEGMENTS = 1300 // more than two batches
  for (const id of ['m1', 'm2']) {
    createMeeting({ id, title: `Meeting ${id}`, start_time: 1_760_000_000, duration: 1800 })
  }
  createTranscripts(
    Array.from({ length: SEGMENTS }, (_, i) => ({
      id: `t${i}`,
      meeting_id: i % 2 ? 'm1' : 'm2',
      start_time: i,
      end_time: i + 1,
      text: `segment ${i} — “quoted”, naïve, ₹500, emoji 🎙️`,
      words: [{ word: 'segment', start: i, end: i + 0.3, confidence: 0.9 }],
    }))
  )
  db.prepare("UPDATE transcripts SET embedding = '[0.1,0.2]', embedding_blob = x'DEADBEEF'").run()
  createNote({
    id: 'n1',
    meeting_id: 'm1',
    timestamp: 1,
    original_text: '<p>Ask about <strong>headcount</strong></p>',
  })
  db.prepare(
    `INSERT INTO webhooks (id, url, events, secret, is_active, created_at, updated_at)
     VALUES ('w1', 'https://example.test/hook', '[]', 'whsec_super_secret', 1, 1, 1)`
  ).run()

  console.log('== JSON export')
  const jsonPath = path.join(dir, 'out.json')
  // The rest of the app keeps reading while the export runs.
  let readsDuringExport = 0
  let readFailed: unknown = null
  const reader = setInterval(() => {
    try {
      db.prepare('SELECT COUNT(*) AS n FROM meetings').get()
      readsDuringExport++
    } catch (err) {
      readFailed = err
    }
  }, 0)
  const result = await writeUserDataExport(db, jsonPath, 'json')
  clearInterval(reader)

  const raw = fs.readFileSync(jsonPath, 'utf-8')
  let parsed: {
    data: Record<string, Array<Record<string, unknown>>>
    stats: Record<string, number>
  } | null = null
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    check('the file is valid JSON', false, (err as Error).message)
  }
  if (parsed) {
    check('the file is valid JSON', true)
    check(
      'every record is in it',
      parsed.data.meetings?.length === 2 &&
        parsed.data.transcripts?.length === SEGMENTS &&
        parsed.data.notes?.length === 1,
      `${parsed.data.transcripts?.length} segments`
    )
    const ids = new Set(parsed.data.transcripts?.map(t => t.id))
    check('none twice, none missing across batches', ids.size === SEGMENTS)
    check(
      'text survives exactly',
      parsed.data.transcripts?.find(t => t.id === 't7')?.text ===
        'segment 7 — “quoted”, naïve, ₹500, emoji 🎙️'
    )
    check(
      'the counts it reports are the counts it wrote',
      parsed.stats.transcripts === SEGMENTS && result.stats.transcripts === SEGMENTS
    )
    check(
      'tables with nothing in them are empty lists',
      Array.isArray(parsed.data.actionItems) && parsed.data.actionItems.length === 0
    )
  }
  check('no embeddings in it', !/embedding|DEADBEEF/i.test(raw))
  check(
    'no webhook secret in it',
    !raw.includes('whsec_super_secret') && raw.includes('example.test')
  )
  check('the reported size is the file size', result.bytes === fs.statSync(jsonPath).size)
  check('no temporary file is left', !fs.existsSync(`${jsonPath}.partial`))
  check(
    'the database stayed usable while it ran',
    readFailed === null && readsDuringExport > 0,
    `${readsDuringExport} reads`
  )

  console.log('== Markdown export')
  const mdPath = path.join(dir, 'out.md')
  const md = await writeUserDataExport(db, mdPath, 'markdown')
  const mdText = fs.readFileSync(mdPath, 'utf-8')
  check(
    'has every meeting with its notes as text',
    mdText.includes('## Meeting m1') &&
      mdText.includes('## Meeting m2') &&
      mdText.includes('- Ask about headcount') &&
      !mdText.includes('<strong>')
  )
  check('has the whole transcript', md.stats.transcripts === SEGMENTS)

  console.log('== an export that cannot be written')
  const badPath = path.join(dir, 'no-such-folder', 'out.json')
  let failed: unknown = null
  try {
    await writeUserDataExport(db, badPath, 'json')
  } catch (err) {
    failed = err
  }
  check('fails with an error', failed instanceof Error)
  check('and leaves no file', !fs.existsSync(badPath) && !fs.existsSync(`${badPath}.partial`))

  closeDatabase()
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
