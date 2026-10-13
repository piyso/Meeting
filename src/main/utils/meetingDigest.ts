/**
 * Summary, decisions and action items of one meeting, from its transcript.
 *
 * The local model's context holds about 8,000 characters of input, so a
 * longer transcript is read in consecutive parts. Each part is asked the same
 * three questions directly — summarising summaries a second time is where a
 * small model drops or invents things — and the answers are joined in code:
 * lists are merged with repeats removed, part summaries are kept in order.
 *
 * What comes back from the model is cleaned line by line (digestLists): it
 * does not reliably keep to the requested format.
 */

import { splitIntoParts } from './splitText'
import {
  formatBulletList,
  leadingSentences,
  mergeBulletLists,
  parseActionLines,
  parseBulletLines,
  parseDecisionLines,
} from './digestLists'

/** Characters of meeting text one prompt can carry within the model's context. */
export const DIGEST_INPUT_BUDGET = 8000

/** The model's answer, or null when it could not be asked (engine unavailable, cancelled). */
export type GenerateText = (prompt: string, maxTokens: number) => Promise<string | null>

export interface MeetingDigestText {
  /** Null = the model could not be asked; '' = it was asked and found nothing. */
  summary: string | null
  actionItems: string | null
  decisions: string | null
}

export interface TranscriptLine {
  text: string
  speaker?: string | null
}

const SAME_LANGUAGE = 'Respond in the same language as the meeting.'

/** Longest summary kept for one part of a multi-part meeting. */
const PART_SUMMARY_CHARS = 450

// The question comes after the transcript: with it in front, the small model
// tends to continue the transcript (copying its lines) instead of answering.
function summaryPrompt(part: string, whole: boolean): string {
  return whole
    ? `TRANSCRIPT:\n${part}\n\nSummarize the meeting above in 3 short bullet points, each starting with "- ". Use only what is said in it. ${SAME_LANGUAGE}\n\nSUMMARY:`
    : `TRANSCRIPT (one part of a longer meeting):\n${part}\n\nIn one or two sentences, say what was discussed and agreed in this part of the meeting. Use only what is said above. ${SAME_LANGUAGE}\n\nSUMMARY:`
}

function decisionsPrompt(part: string): string {
  return `TRANSCRIPT:\n${part}\n\nList the final decisions made in the transcript above: at most 6, one short line each, starting with "- ". Only decisions, not questions, opinions or tasks. Write them in your own words. If no decision was made, write "NONE". ${SAME_LANGUAGE}\n\nDECISIONS:`
}

function actionsPrompt(part: string): string {
  return `TRANSCRIPT:\n${part}\n\nExtract the action items from the transcript above. Format: "- [ASSIGNEE]: Task description". If there are none, write "NONE". ${SAME_LANGUAGE}\n\nACTION ITEMS:`
}

/** Transcript lines as prompt text. No "null:" in front of lines without a known speaker. */
export function transcriptText(lines: readonly TranscriptLine[]): string {
  return lines.map(line => (line.speaker ? `${line.speaker}: ${line.text}` : line.text)).join('\n')
}

export async function buildMeetingDigest(
  lines: readonly TranscriptLine[],
  generate: GenerateText,
  partSize: number = DIGEST_INPUT_BUDGET
): Promise<MeetingDigestText> {
  const parts = splitIntoParts(transcriptText(lines), partSize)
  const whole = parts.length === 1
  const speakers = [...new Set(lines.map(line => line.speaker ?? '').filter(Boolean))]

  const summaries: string[] = []
  const decisions: string[][] = []
  const actions: string[][] = []
  // One unanswered question leaves that section incomplete — reported as
  // unavailable rather than shown (and cached) with a part of the meeting missing.
  const failed = { summary: false, decisions: false, actions: false }

  for (const part of parts) {
    const summary = failed.summary ? null : await generate(summaryPrompt(part, whole), 200)
    if (summary === null) failed.summary = true
    else summaries.push(summary)

    const decided = failed.decisions ? null : await generate(decisionsPrompt(part), 260)
    if (decided === null) failed.decisions = true
    else decisions.push(parseDecisionLines(decided, speakers))

    const tasks = failed.actions ? null : await generate(actionsPrompt(part), 260)
    if (tasks === null) failed.actions = true
    else actions.push(parseActionLines(tasks))

    if (failed.summary && failed.decisions && failed.actions) break
  }

  const summaryLines = whole
    ? parseBulletLines(summaries[0] ?? '')
    : summaries.map(text => leadingSentences(text, PART_SUMMARY_CHARS)).filter(Boolean)

  return {
    // An answer with nothing usable in it is no summary either.
    summary: failed.summary || summaryLines.length === 0 ? null : formatBulletList(summaryLines),
    decisions: failed.decisions ? null : formatBulletList(mergeBulletLists(decisions)),
    actionItems: failed.actions ? null : formatBulletList(mergeBulletLists(actions)),
  }
}
