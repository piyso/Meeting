import { describe, it, expect } from 'vitest'
import { buildMeetingDigest, transcriptText, type GenerateText } from '../meetingDigest'

/** A stand-in for the model: answers by which question the prompt asks. */
function model(answers: {
  summary?: (part: string) => string | null
  decisions?: (part: string) => string | null
  actions?: (part: string) => string | null
}): { generate: GenerateText; prompts: string[] } {
  const prompts: string[] = []
  const generate: GenerateText = async prompt => {
    prompts.push(prompt)
    const part = /^TRANSCRIPT[^\n]*\n([\s\S]*?)\n\n/.exec(prompt)?.[1] ?? ''
    if (prompt.endsWith('SUMMARY:')) return answers.summary ? answers.summary(part) : '- a summary'
    if (prompt.endsWith('DECISIONS:')) return answers.decisions ? answers.decisions(part) : 'NONE'
    if (prompt.endsWith('ACTION ITEMS:')) return answers.actions ? answers.actions(part) : 'NONE'
    throw new Error(`unexpected prompt: ${prompt.slice(-40)}`)
  }
  return { generate, prompts }
}

const line = (text: string, speaker: string | null = null) => ({ text, speaker })

describe('transcriptText', () => {
  it('labels only the lines whose speaker is known', () => {
    expect(transcriptText([line('Hello.', 'Dana'), line('Hi.'), line('Bye.', '')])).toBe(
      'Dana: Hello.\nHi.\nBye.'
    )
  })
})

describe('buildMeetingDigest', () => {
  it('asks three questions about a short meeting and cleans the answers', async () => {
    const { generate, prompts } = model({
      summary: () => '**Summary:**\n1. Launch moved.\n2. Pilot approved.\n3. Widget dropped.',
      decisions: () => '- Decision: the launch moves to March 14th.',
      actions: () => '- [Marco]: Task description: provide the staging environment',
    })

    const digest = await buildMeetingDigest(
      [line('We move the launch.'), line('Agreed.')],
      generate
    )

    expect(prompts).toHaveLength(3)
    expect(prompts.every(prompt => prompt.includes('We move the launch.\nAgreed.'))).toBe(true)
    expect(digest).toEqual({
      summary: '- Launch moved.\n- Pilot approved.\n- Widget dropped.',
      decisions: '- The launch moves to March 14th.',
      actionItems: '- Marco: provide the staging environment',
    })
  })

  it('reads a long meeting part by part and covers every part', async () => {
    const lines = Array.from({ length: 40 }, (_, i) => line(`Sentence number ${i} of the meeting.`))
    const { generate, prompts } = model({
      summary: part => `This part ran from ${part.split('\n')[0]}`,
      decisions: part => `- Decided after ${part.split('\n')[0]}`,
      actions: part => `- Sam: follow up on ${part.split('\n').pop()}`,
    })

    const digest = await buildMeetingDigest(lines, generate, 400)

    const parts = prompts.length / 3
    expect(parts).toBeGreaterThan(2)
    // Every line of the meeting was shown to the model exactly once per question.
    const shown = prompts.filter(prompt => prompt.endsWith('DECISIONS:')).join('\n')
    for (const each of lines) expect(shown.split(each.text).length - 1).toBe(1)

    expect(digest.summary?.split('\n')).toHaveLength(parts)
    expect(digest.decisions?.split('\n')).toHaveLength(parts)
    expect(digest.actionItems?.split('\n')).toHaveLength(parts)
    expect(digest.summary).toContain('Sentence number 0 of the meeting.')
    expect(digest.actionItems).toContain('Sentence number 39 of the meeting.')
  })

  it('merges what consecutive parts repeat', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => line(`Sentence number ${i} of the meeting.`))
    const { generate } = model({
      decisions: () => '- The Android widget is dropped from the release.',
      actions: () => '- Priya: own the security audit, report due November 3rd',
    })

    const digest = await buildMeetingDigest(lines, generate, 400)

    expect(digest.decisions).toBe('- The Android widget is dropped from the release.')
    expect(digest.actionItems).toBe('- Priya: own the security audit, report due November 3rd')
  })

  it('reports "nothing found" as empty, not as unavailable', async () => {
    const { generate } = model({ decisions: () => 'NONE', actions: () => '- None.' })

    const digest = await buildMeetingDigest([line('Just chatting.')], generate)

    expect(digest.decisions).toBe('')
    expect(digest.actionItems).toBe('')
    expect(digest.summary).toBe('- a summary')
  })

  it('reports a section the model could not answer as unavailable', async () => {
    const { generate } = model({ actions: () => null })

    const digest = await buildMeetingDigest([line('We decided things.')], generate)

    expect(digest.actionItems).toBeNull()
    expect(digest.summary).not.toBeNull()
    expect(digest.decisions).not.toBeNull()
  })

  it('does not present a long meeting as summarised when one part went unanswered', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => line(`Sentence number ${i} of the meeting.`))
    let asked = 0
    const { generate, prompts } = model({
      summary: () => (++asked === 2 ? null : 'A part summary.'),
    })

    const digest = await buildMeetingDigest(lines, generate, 400)

    expect(digest.summary).toBeNull()
    expect(digest.decisions).not.toBeNull()
    // The summary question is not asked again once it has failed.
    expect(prompts.filter(prompt => prompt.endsWith('SUMMARY:'))).toHaveLength(2)
  })

  it('stops asking when the model is unavailable altogether', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => line(`Sentence number ${i} of the meeting.`))
    const prompts: string[] = []
    const generate: GenerateText = async prompt => {
      prompts.push(prompt)
      return null
    }

    const digest = await buildMeetingDigest(lines, generate, 400)

    expect(digest).toEqual({ summary: null, decisions: null, actionItems: null })
    expect(prompts).toHaveLength(3)
  })

  it('treats a summary with nothing usable in it as unavailable', async () => {
    const { generate } = model({ summary: () => 'NONE' })
    const digest = await buildMeetingDigest([line('Hello.')], generate)
    expect(digest.summary).toBeNull()
  })
})
