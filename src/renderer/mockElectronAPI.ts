/**
 * Mock ElectronAPI — Complete mock layer that intercepts ALL IPC calls.
 *
 * Features:
 * 1. STATEFUL: Mutations (delete, update, create) modify in-memory state
 * 2. SIMULATED DELAYS: Configurable latency to test loading states
 * 3. STREAM SIMULATION: Transcript chunks and AI tokens emit over time
 *
 * Toggle via USE_MOCK_DATA in main.tsx
 */

import { useAppStore } from './store/appStore'
import {
  MOCK_MEETINGS,
  MOCK_TRANSCRIPTS,
  MOCK_NOTES,
  MOCK_ENTITIES,
  MOCK_GRAPH,
  MOCK_CONTRADICTIONS,
  MOCK_WEEKLY_DIGEST,
  MOCK_SETTINGS,
  MOCK_QUOTA,
  MOCK_USER,
  MOCK_DEVICES,
  MOCK_CURRENT_DEVICE,
  MOCK_SYNC_STATUS,
  MOCK_HARDWARE_TIER,
  MOCK_ENGINE_STATUS,
  MOCK_BILLING_CONFIG,
  MOCK_AUDIT_LOGS,
  MOCK_SEARCH_RESPONSE,
  MOCK_SEMANTIC_RESULTS,
  MOCK_AUDIO_STATUS,
} from './mockData'

import type { Meeting, Note, Entity } from '../types/database'
import type { AppSettings } from '../types/ipc'

// ============================================================================
// Configuration
// ============================================================================

const MOCK_DELAY_MS = 200 // Simulate network latency
const STREAM_INTERVAL_MS = 80 // Token/chunk emit interval

// ============================================================================
// Helpers
// ============================================================================

function ok<T>(data: T) {
  return { success: true as const, data }
}

function okVoid() {
  return { success: true as const }
}

async function delayed<T>(data: T): Promise<{ success: true; data: T }> {
  await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
  return ok(data)
}

async function delayedVoid(): Promise<{ success: true }> {
  await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
  return okVoid()
}

const noop = () => () => {} // Event unsub stub

// ============================================================================
// Period-Aware Mock Digest Factory
// ============================================================================

import type { WeeklyDigest } from '../types/ipc'

function buildMockDigest(
  period: 'daily' | 'weekly' | 'monthly',
  startDate?: number,
  endDate?: number
): WeeklyDigest {
  const _now = Date.now()
  const DAY = 86400000
  const HOUR = 3600000

  if (period === 'daily') {
    return {
      id: 'digest-daily-001',
      startDate: startDate || _now - DAY,
      endDate: endDate || _now,
      generatedAt: _now - HOUR,
      summary: {
        totalMeetings: 2,
        totalHours: 1.8,
        uniqueParticipants: 4,
      },
      keyDecisions: [
        {
          text: 'Finalize API v2 migration timeline for Sprint 24',
          meetingId: 'meet-001',
          meetingTitle: 'Morning Standup',
          timestamp: _now - 6 * HOUR,
          confidence: 0.91,
          meetingDate: _now - 6 * HOUR,
          sourceContext:
            '"Let\'s lock Sprint 24 as the hard deadline for v2 migration — no more slipping." — Piyush Kumar',
        },
      ],
      actionItems: {
        open: 2,
        completed: 1,
        overdue: 0,
        items: [
          {
            text: 'Review pull request #347 — cursor pagination',
            meetingId: 'meet-001',
            meetingTitle: 'Morning Standup',
            assignee: 'Piyush Kumar',
            dueDate: _now + DAY,
            status: 'open',
            meetingDate: _now - 6 * HOUR,
            sourceContext:
              '"Piyush, can you review PR #347 today? The cursor pagination logic needs a second pair of eyes." — Alex Rivera',
          },
          {
            text: 'Update Figma mockups for settings panel',
            meetingId: 'meet-002',
            meetingTitle: 'Design Review',
            assignee: 'Sarah Chen',
            dueDate: _now + DAY,
            status: 'open',
            meetingDate: _now - 4 * HOUR,
            sourceContext:
              '"The settings panel needs to match the new design system — Sarah, can you update the Figma?" — Maya Patel',
          },
          {
            text: 'Fix flaky CI test in auth module',
            meetingId: 'meet-001',
            meetingTitle: 'Morning Standup',
            assignee: 'Alex Rivera',
            dueDate: _now - 2 * HOUR,
            status: 'completed',
            meetingDate: _now - 6 * HOUR,
            sourceContext:
              '"The auth module test keeps failing on CI — it passes locally. Alex, can you take a look?" — Piyush Kumar',
          },
        ],
      },
      contradictions: [],
      entityAggregation: {
        topPeople: [
          {
            name: 'Piyush Kumar',
            meetingCount: 2,
            meetingTitles: ['Morning Standup', 'Design Review'],
          },
          { name: 'Sarah Chen', meetingCount: 1, meetingTitles: ['Design Review'] },
          { name: 'Alex Rivera', meetingCount: 1, meetingTitles: ['Morning Standup'] },
          { name: 'Maya Patel', meetingCount: 1, meetingTitles: ['Morning Standup'] },
        ],
        topTopics: [
          { topic: 'API v2 Migration', mentionCount: 8, meetingTitles: ['Morning Standup'] },
          { topic: 'Design Systems', mentionCount: 5, meetingTitles: ['Design Review'] },
          { topic: 'CI/CD Pipeline', mentionCount: 3, meetingTitles: ['Morning Standup'] },
        ],
      },
    }
  }

  if (period === 'monthly') {
    return {
      id: 'digest-monthly-001',
      startDate: startDate || _now - 30 * DAY,
      endDate: endDate || _now,
      generatedAt: _now - HOUR,
      summary: {
        totalMeetings: 24,
        totalHours: 38.2,
        uniqueParticipants: 12,
      },
      keyDecisions: [
        {
          text: 'Adopt cursor-based pagination for API v2 endpoints',
          meetingId: 'meet-001',
          meetingTitle: 'Product Standup',
          timestamp: _now - 2 * HOUR,
          confidence: 0.95,
          meetingDate: _now - 2 * HOUR,
          sourceContext:
            '"Cursor-based pagination handles real-time inserts better than offset and the client SDK already supports it." — Piyush Kumar',
        },
        {
          text: 'Switch typography from Inter to Instrument Sans',
          meetingId: 'meet-002',
          meetingTitle: 'Design Systems Deep Dive',
          timestamp: _now - 5 * DAY,
          confidence: 0.88,
          meetingDate: _now - 5 * DAY,
          sourceContext:
            '"Instrument Sans wins on x-height and tabular figures. It renders crisper at small sizes on Retina." — Sarah Chen',
        },
        {
          text: 'Implement user-defined entity dictionary instead of NER fine-tuning',
          meetingId: 'meet-003',
          meetingTitle: 'AI Feature Brainstorm',
          timestamp: _now - 7 * DAY,
          confidence: 0.92,
          meetingDate: _now - 7 * DAY,
          sourceContext:
            '"A user-defined dictionary gives us 90% of the accuracy with zero training cost." — Maya Patel',
        },
        {
          text: 'Pin CI/CD pipeline to Node.js 20 LTS',
          meetingId: 'meet-005',
          meetingTitle: 'Sprint 23 Retrospective',
          timestamp: _now - 10 * DAY,
          confidence: 0.97,
          meetingDate: _now - 10 * DAY,
          sourceContext:
            '"The CI keeps pulling latest Node and it broke three builds this sprint. Let\'s pin to 20 LTS." — Raj Mehta',
        },
        {
          text: 'Migrate database from PostgreSQL to SQLite for offline-first',
          meetingId: 'meet-004',
          meetingTitle: 'Architecture Council',
          timestamp: _now - 14 * DAY,
          confidence: 0.93,
          meetingDate: _now - 14 * DAY,
          sourceContext:
            '"SQLite gives us true offline-first with zero server dependency. The WAL mode handles concurrent reads fine." — David Thompson',
        },
        {
          text: 'Adopt CRDT-based sync for real-time collaboration',
          meetingId: 'meet-006',
          meetingTitle: 'Sync Strategy Workshop',
          timestamp: _now - 18 * DAY,
          confidence: 0.89,
          meetingDate: _now - 18 * DAY,
          sourceContext:
            '"CRDTs make conflict resolution automatic. No more manual merge dialogs." — Jordan Lee',
        },
        {
          text: 'Launch closed beta for mobile companion app',
          meetingId: 'meet-007',
          meetingTitle: 'Product Roadmap Review',
          timestamp: _now - 22 * DAY,
          confidence: 0.86,
          meetingDate: _now - 22 * DAY,
          sourceContext:
            '"We should get 50 beta testers on the mobile app by end of month to validate the sync flow." — Emma Wilson',
        },
        {
          text: 'Implement end-to-end encryption for all sync data',
          meetingId: 'meet-008',
          meetingTitle: 'Security Review',
          timestamp: _now - 25 * DAY,
          confidence: 0.94,
          meetingDate: _now - 25 * DAY,
          sourceContext:
            '"E2E encryption is non-negotiable for enterprise customers. We need it before any B2B launch." — Alex Rivera',
        },
      ],
      actionItems: {
        open: 5,
        completed: 8,
        overdue: 2,
        items: [
          {
            text: 'Prepare quarterly demo slides',
            meetingId: 'meet-001',
            meetingTitle: 'Product Standup',
            assignee: 'Piyush Kumar',
            dueDate: _now + 5 * DAY,
            status: 'open',
            meetingDate: _now - 2 * HOUR,
            sourceContext:
              '"Piyush, the quarterly demo is next Friday. Can you own the slide deck?" — Sarah Chen',
          },
          {
            text: 'Complete Badge and Tooltip component migration',
            meetingId: 'meet-002',
            meetingTitle: 'Design Systems Deep Dive',
            assignee: 'Sarah Chen',
            dueDate: _now + 2 * DAY,
            status: 'open',
            meetingDate: _now - 5 * DAY,
            sourceContext:
              '"Badge and Tooltip are the last two components not using the new tokens. Sarah, can you migrate them?" — Maya Patel',
          },
          {
            text: 'Finalize mobile companion app wireframes',
            meetingId: 'meet-007',
            meetingTitle: 'Product Roadmap Review',
            assignee: 'Emma Wilson',
            dueDate: _now + 3 * DAY,
            status: 'open',
            meetingDate: _now - 22 * DAY,
            sourceContext:
              '"Emma, we need final wireframes before the beta testers onboard next week." — Piyush Kumar',
          },
          {
            text: 'Write integration tests for CRDT merge logic',
            meetingId: 'meet-006',
            meetingTitle: 'Sync Strategy Workshop',
            assignee: 'Jordan Lee',
            dueDate: _now + 1 * DAY,
            status: 'open',
            meetingDate: _now - 18 * DAY,
            sourceContext:
              '"Jordan, the CRDT merge has no integration tests. That\'s our biggest risk area." — David Thompson',
          },
          {
            text: 'Set up E2E encryption key rotation schedule',
            meetingId: 'meet-008',
            meetingTitle: 'Security Review',
            assignee: 'Alex Rivera',
            dueDate: _now + 7 * DAY,
            status: 'open',
            meetingDate: _now - 25 * DAY,
            sourceContext:
              '"Key rotation needs to happen every 90 days minimum. Alex, can you automate this?" — Tina Zhao',
          },
          {
            text: 'Deploy API v2 to staging',
            meetingId: 'meet-009',
            meetingTitle: 'API Architecture Review',
            assignee: 'Alex Rivera',
            dueDate: _now - 5 * DAY,
            status: 'completed',
            meetingDate: _now - 12 * DAY,
            sourceContext:
              '"Staging deployment for v2 is ready. Alex, please push it today." — Jordan Lee',
          },
          {
            text: 'Merge cursor pagination PR',
            meetingId: 'meet-003',
            meetingTitle: 'AI Feature Brainstorm',
            assignee: 'Maya Patel',
            dueDate: _now - 3 * DAY,
            status: 'completed',
            meetingDate: _now - 7 * DAY,
            sourceContext:
              '"Maya\'s PR for cursor pagination has been in review for 3 days. Let\'s merge it today." — Alex Rivera',
          },
          {
            text: 'Pin Node.js version in CI config',
            meetingId: 'meet-004',
            meetingTitle: 'Architecture Council',
            assignee: 'Piyush Kumar',
            dueDate: _now - 7 * DAY,
            status: 'completed',
            meetingDate: _now - 14 * DAY,
            sourceContext:
              '"Piyush, update .nvmrc and the GitHub Actions workflow to pin Node 20 LTS." — Raj Mehta',
          },
          {
            text: 'Tree-shake Framer Motion unused modules',
            meetingId: 'meet-005',
            meetingTitle: 'Sprint 23 Retrospective',
            assignee: 'Alex Rivera',
            dueDate: _now - 4 * DAY,
            status: 'overdue',
            meetingDate: _now - 10 * DAY,
            sourceContext:
              '"Framer Motion is adding 47KB to the bundle. Alex, tree-shake the unused animation modules." — Piyush Kumar',
          },
          {
            text: 'Update security audit documentation',
            meetingId: 'meet-008',
            meetingTitle: 'Security Review',
            assignee: 'David Thompson',
            dueDate: _now - 2 * DAY,
            status: 'overdue',
            meetingDate: _now - 25 * DAY,
            sourceContext:
              '"David, the audit docs are three months stale. Please update them before the compliance review." — Tina Zhao',
          },
        ],
      },
      contradictions: MOCK_CONTRADICTIONS.concat([
        {
          id: 'contra-3',
          type: 'contradicts' as const,
          meeting1: null,
          meeting2: null,
          statement1: 'The mobile companion app will launch in Q2.',
          statement2: 'We agreed to postpone mobile until after the v2 API is stable.',
          confidence: 0.78,
          detectedAt: _now - 15 * DAY,
        },
      ]),
      entityAggregation: {
        topPeople: [
          {
            name: 'Piyush Kumar',
            meetingCount: 22,
            meetingTitles: ['Product Standup', 'Sprint 23 Retrospective', 'Architecture Council'],
          },
          {
            name: 'Sarah Chen',
            meetingCount: 16,
            meetingTitles: [
              'Design Systems Deep Dive',
              'Product Standup',
              'Sprint 23 Retrospective',
            ],
          },
          {
            name: 'Alex Rivera',
            meetingCount: 14,
            meetingTitles: ['Product Standup', 'API Architecture Review', 'Security Review'],
          },
          {
            name: 'Maya Patel',
            meetingCount: 11,
            meetingTitles: ['Sprint 23 Retrospective', 'AI Feature Brainstorm'],
          },
          {
            name: 'David Thompson',
            meetingCount: 9,
            meetingTitles: ['Architecture Council', 'Security Review'],
          },
          {
            name: 'Jordan Lee',
            meetingCount: 7,
            meetingTitles: ['Sync Strategy Workshop', 'Sprint 23 Retrospective'],
          },
          {
            name: 'Emma Wilson',
            meetingCount: 6,
            meetingTitles: ['Product Roadmap Review', 'Design Systems Deep Dive'],
          },
          {
            name: 'Raj Mehta',
            meetingCount: 5,
            meetingTitles: ['Client Onboarding', 'Architecture Council'],
          },
          {
            name: 'Tina Zhao',
            meetingCount: 4,
            meetingTitles: ['Security Review', 'Sync Strategy Workshop'],
          },
          { name: 'Chris Park', meetingCount: 3, meetingTitles: ['Product Roadmap Review'] },
          { name: 'Lisa Nguyen', meetingCount: 2, meetingTitles: ['Design Systems Deep Dive'] },
          { name: 'Omar Hassan', meetingCount: 1, meetingTitles: ['Client Onboarding'] },
        ],
        topTopics: [
          {
            topic: 'API v2 Migration',
            mentionCount: 67,
            meetingTitles: [
              'Product Standup',
              'API Architecture Review',
              'Sprint 23 Retrospective',
            ],
          },
          {
            topic: 'Design Systems',
            mentionCount: 48,
            meetingTitles: [
              'Design Systems Deep Dive',
              'Sprint 23 Retrospective',
              'Product Standup',
            ],
          },
          {
            topic: 'CI/CD Pipeline',
            mentionCount: 35,
            meetingTitles: ['Product Standup', 'Sprint 23 Retrospective', 'Architecture Council'],
          },
          {
            topic: 'CRDT Sync',
            mentionCount: 29,
            meetingTitles: ['Sync Strategy Workshop', 'AI Feature Brainstorm'],
          },
          {
            topic: 'End-to-End Encryption',
            mentionCount: 24,
            meetingTitles: ['Security Review', 'Architecture Council'],
          },
          {
            topic: 'Bundle Optimization',
            mentionCount: 22,
            meetingTitles: ['Product Standup', 'Sprint 23 Retrospective'],
          },
          {
            topic: 'Mobile Companion App',
            mentionCount: 19,
            meetingTitles: ['Product Roadmap Review', 'Product Standup'],
          },
          { topic: 'Entity Detection', mentionCount: 16, meetingTitles: ['AI Feature Brainstorm'] },
          {
            topic: 'Quarterly OKRs',
            mentionCount: 14,
            meetingTitles: ['Product Standup', 'Architecture Council'],
          },
          {
            topic: 'Speaker Diarization',
            mentionCount: 11,
            meetingTitles: ['AI Feature Brainstorm'],
          },
          { topic: 'Client Onboarding', mentionCount: 8, meetingTitles: ['Client Onboarding'] },
          { topic: 'Database Migration', mentionCount: 6, meetingTitles: ['Architecture Council'] },
        ],
      },
    }
  }

  // Weekly — return existing MOCK_WEEKLY_DIGEST
  return {
    ...MOCK_WEEKLY_DIGEST,
    startDate: startDate || MOCK_WEEKLY_DIGEST.startDate,
    endDate: endDate || MOCK_WEEKLY_DIGEST.endDate,
  }
}

// ============================================================================
// Stateful In-Memory Store
// ============================================================================

let meetings = [...MOCK_MEETINGS]
const transcripts = { ...MOCK_TRANSCRIPTS }
const notes: Record<string, Note[]> = { ...MOCK_NOTES }
const entities: Record<string, Entity[]> = { ...MOCK_ENTITIES }
let settings: AppSettings = { ...MOCK_SETTINGS }
let nextMeetingNum = meetings.length + 1

// Shared listener storage — used by both the event system and stream simulation
const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}

// ============================================================================
// The Mock API
// ============================================================================

function createMockElectronAPI() {
  const api = {
    // ── Platform ──────────────────────────────────────────────────────
    platform: 'darwin',

    // ── Meeting ───────────────────────────────────────────────────────
    meeting: {
      list: async (params: { limit?: number; offset?: number }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const limit = params.limit ?? 20
        const offset = params.offset ?? 0
        const slice = meetings.slice(offset, offset + limit)
        return ok({
          items: slice,
          total: meetings.length,
          limit,
          offset,
          hasMore: offset + limit < meetings.length,
        })
      },
      get: async (params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const m = meetings.find(x => x.id === params.meetingId)
        return m
          ? ok(m)
          : {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Meeting not found', timestamp: Date.now() },
            }
      },
      start: async (params: { title?: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const id = `meet-new-${nextMeetingNum++}`
        const mockDuration = (Math.floor(Math.random() * 40) + 15) * 60 // 15-55 min in seconds
        const mockParticipants = Math.floor(Math.random() * 5) + 2 // 2-6 participants
        const nowSec = Math.floor(Date.now() / 1000)
        const newMeeting: Meeting = {
          id,
          title: params.title || `New Meeting ${nextMeetingNum}`,
          start_time: nowSec - mockDuration,
          end_time: nowSec,
          duration: mockDuration,
          participant_count: mockParticipants,
          tags: '[]',
          namespace: 'default',
          created_at: nowSec,
          synced_at: nowSec,
          performance_tier: 'high',
        }
        meetings = [newMeeting, ...meetings]
        transcripts[id] = []
        notes[id] = []
        entities[id] = []
        return ok({ meeting: newMeeting, audioDevices: [] })
      },
      stop: async () => delayedVoid(),
      delete: async (params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        meetings = meetings.filter(m => m.id !== params.meetingId)
        delete transcripts[params.meetingId]
        delete notes[params.meetingId]
        delete entities[params.meetingId]
        return okVoid()
      },
      update: async (params: { meetingId: string; updates: { title?: string } }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        meetings = meetings.map(m => (m.id === params.meetingId ? { ...m, ...params.updates } : m))
        const updated = meetings.find(m => m.id === params.meetingId) || meetings[0]
        return ok(updated)
      },
      export: async () => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({
          content: '# Meeting Export\n\nThis is a mock export of the meeting data.',
          format: 'markdown',
          filename: 'meeting-export.md',
          filePath: '/tmp/meeting-export.md',
          fileSize: 1024,
        })
      },
      onGlobalShortcutStart: noop,
    },

    // ── Note ──────────────────────────────────────────────────────────
    note: {
      get: async (params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok(notes[params.meetingId] || [])
      },
      create: async (params: { meetingId: string; timestamp: number; text: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const note: Note = {
          id: `note-new-${Date.now()}`,
          meeting_id: params.meetingId,
          timestamp: params.timestamp,
          original_text: params.text,
          augmented_text: null,
          context: null,
          is_augmented: false,
          version: 1,
          created_at: Math.floor(Date.now() / 1000),
          updated_at: Math.floor(Date.now() / 1000),
          synced_at: Math.floor(Date.now() / 1000),
        }
        if (!notes[params.meetingId]) {
          notes[params.meetingId] = []
        }
        const noteArr = notes[params.meetingId]
        if (noteArr) noteArr.push(note)
        return ok(note)
      },
      update: async (params: { noteId: string; updates: { original_text?: string } }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        for (const key of Object.keys(notes)) {
          const noteArr = notes[key]
          if (!noteArr) continue
          const idx = noteArr.findIndex(n => n.id === params.noteId)
          if (idx !== -1) {
            noteArr[idx] = {
              ...noteArr[idx],
              ...params.updates,
              updated_at: Math.floor(Date.now() / 1000),
            } as Note
            return ok(noteArr[idx])
          }
        }
        return ok(null)
      },
      expand: async (_params: {
        noteId: string
        meetingId: string
        timestamp: number
        text: string
      }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 15)) // Simulate AI processing delay for beautiful UI shimmer
        return ok({
          expandedText: `This point was discussed in the context of improving team velocity. The consensus was to prioritize automation and reduce manual overhead. Key stakeholders expressed strong support for this direction, with a target implementation date of end of quarter.`,
          context: 'Expanded using local LLM with meeting transcript context',
          tokensUsed: 128,
          inferenceTime: 1200,
          sourceSegments: ['Previous discussion about velocity improvements'],
          source: 'local' as const,
        })
      },
      batchExpand: async () => delayedVoid(),
      delete: async (params: { noteId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        for (const key of Object.keys(notes)) {
          const noteArr = notes[key]
          if (noteArr) {
            notes[key] = noteArr.filter(n => n.id !== params.noteId)
          }
        }
        return okVoid()
      },
    },

    // ── Transcript ────────────────────────────────────────────────────
    transcript: {
      get: async (params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok(transcripts[params.meetingId] || [])
      },
      getContext: async (params: {
        meetingId: string
        timestamp: number
        beforeSeconds: number
        afterSeconds: number
      }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const all = transcripts[params.meetingId] || []
        const start = params.timestamp - params.beforeSeconds * 1000
        const end = params.timestamp + params.afterSeconds * 1000
        const filtered = all.filter(t => t.start_time >= start && t.end_time <= end)
        return ok({
          transcripts: filtered,
          contextText: filtered.map(t => t.text).join(' '),
          startTime: start,
          endTime: end,
        })
      },
      updateSpeaker: async () => delayedVoid(),
    },

    // ── Entity ────────────────────────────────────────────────────────
    entity: {
      get: async (params: { meetingId: string; types?: string[] }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        let result = entities[params.meetingId] || []
        const filterTypes = params.types
        if (filterTypes && filterTypes.length > 0) {
          result = result.filter(e => filterTypes.includes(e.type))
        }
        return ok(result)
      },
      getByType: async (params: { type: string; limit?: number }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const all = Object.values(entities)
          .flat()
          .filter(e => e.type === params.type)
        const grouped: Record<
          string,
          { count: number; meetings: Set<string>; firstSeen: number; lastSeen: number }
        > = {}
        for (const e of all) {
          if (!grouped[e.text]) {
            grouped[e.text] = {
              count: 0,
              meetings: new Set(),
              firstSeen: e.created_at,
              lastSeen: e.created_at,
            }
          }
          const g = grouped[e.text]
          if (g) {
            g.count++
            g.meetings.add(e.meeting_id)
            g.firstSeen = Math.min(g.firstSeen, e.created_at)
            g.lastSeen = Math.max(g.lastSeen, e.created_at)
          }
        }
        const result = Object.entries(grouped).map(([text, g]) => ({
          type: params.type,
          text,
          count: g.count,
          meetings: Array.from(g.meetings),
          firstSeen: g.firstSeen,
          lastSeen: g.lastSeen,
        }))
        return ok(result.slice(0, params.limit || 20))
      },
      extract: async (params: { text: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok([
          { text: 'Piyush', type: 'PERSON', confidence: 0.95, startOffset: 0, endOffset: 6 },
          {
            text: 'next Friday',
            type: 'DATE',
            confidence: 0.88,
            startOffset: params.text.indexOf('Friday') - 5,
            endOffset: params.text.indexOf('Friday') + 6,
          },
        ])
      },
    },

    // ── Search ────────────────────────────────────────────────────────
    search: {
      query: async (params: { query: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        if (!params.query || params.query.trim().length < 2) {
          return ok({ transcripts: [], notes: [], totalResults: 0, queryTime: 5 })
        }
        // Filter mock results by query (case-insensitive)
        const q = params.query.toLowerCase()
        const filteredTranscripts = MOCK_SEARCH_RESPONSE.transcripts.filter(
          t =>
            t.snippet.toLowerCase().includes(q) || (t.meeting.title || '').toLowerCase().includes(q)
        )
        const filteredNotes = MOCK_SEARCH_RESPONSE.notes.filter(
          n =>
            n.snippet.toLowerCase().includes(q) || (n.meeting.title || '').toLowerCase().includes(q)
        )
        return ok({
          transcripts: filteredTranscripts.length
            ? filteredTranscripts
            : MOCK_SEARCH_RESPONSE.transcripts,
          notes: filteredNotes.length ? filteredNotes : MOCK_SEARCH_RESPONSE.notes,
          totalResults: filteredTranscripts.length + filteredNotes.length || 3,
          queryTime: 45,
        })
      },
      semantic: async (params: { query: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 2))
        if (!params.query || params.query.trim().length < 3) {
          return ok([])
        }
        return ok(MOCK_SEMANTIC_RESULTS)
      },
    },

    // ── Sync ──────────────────────────────────────────────────────────
    sync: {
      getStatus: async () => delayed(MOCK_SYNC_STATUS),
      trigger: async () => delayedVoid(),
      login: async () =>
        delayed({
          userId: MOCK_USER.id,
          email: MOCK_USER.email,
          tier: 'pro' as const,
          devices: [],
        }),
      logout: async () => delayedVoid(),
      googleAuth: async () => delayed({ status: 'success', message: 'Authenticated' }),
      onConflict: noop,
      resolveConflict: async () => delayedVoid(),
    },

    // ── Audio ─────────────────────────────────────────────────────────
    audio: {
      listDevices: async () =>
        delayed([
          {
            id: 'dev-builtin-mic',
            label: 'Built-in Microphone',
            kind: 'microphone' as const,
            isDefault: true,
            isAvailable: true,
            deviceType: 'built-in' as const,
            connectionType: 'internal' as const,
          },
          {
            id: 'dev-builtin-out',
            label: 'MacBook Pro Speakers',
            kind: 'system' as const,
            isDefault: true,
            isAvailable: true,
            deviceType: 'built-in' as const,
            connectionType: 'internal' as const,
          },
        ]),
      startCapture: async () => delayed({ ...MOCK_AUDIO_STATUS, isCapturing: true }),
      stopCapture: async (_params?: { meetingId?: string }) => delayedVoid(),
      pauseCapture: async () => delayedVoid(),
      resumeCapture: async () => delayedVoid(),
      getStatus: async () => delayed(MOCK_AUDIO_STATUS),
      preFlightTest: async () =>
        delayed({
          systemAudio: { available: true, tested: true },
          microphone: { available: true, tested: true },
          recommendation: 'system' as const,
        }),
      openSoundSettings: async () => delayedVoid(),
      getScreenRecordingPermission: async () =>
        delayed({ status: 'granted', message: 'Screen recording permission granted' }),
      openScreenRecordingSettings: async () => delayedVoid(),
      startSystemAudioTest: async () =>
        delayed({ success: true, message: 'Test started', requiresUserAction: false }),
      stopSystemAudioTest: async () =>
        delayed({
          success: true,
          audioDetected: true,
          maxLevel: 0.72,
          duration: 5000,
          message: 'Audio detected',
        }),
      getSystemAudioTestStatus: async () =>
        delayed({ isActive: false, audioDetected: true, maxLevel: 0.72, duration: 5000 }),
      startMicrophoneTest: async () =>
        delayed({ success: true, message: 'Mic test started', requiresUserAction: false }),
      stopMicrophoneTest: async () =>
        delayed({
          success: true,
          audioDetected: true,
          maxLevel: 0.65,
          duration: 5000,
          message: 'Microphone working',
        }),
      getMicrophoneTestStatus: async () =>
        delayed({ isActive: false, audioDetected: true, maxLevel: 0.65, duration: 5000 }),
      exportDiagnostics: async () => delayed('/tmp/audio-diagnostics.zip'),
      getDiagnosticsPath: async () => delayed('/tmp/diagnostics'),
      getDiagnosticsStats: async () =>
        delayed({
          totalFiles: 12,
          totalSize: '4.2 MB',
          oldestLog: new Date(Date.now() - 7 * 86400000).toISOString(),
          newestLog: new Date().toISOString(),
        }),
      clearDiagnostics: async () => delayedVoid(),
      openDiagnosticsFolder: async () => delayedVoid(),
      onFallbackOccurred: noop,
      startCaptureWithFallback: async () =>
        delayed({
          success: true,
          source: 'system' as const,
          message: 'Capturing system audio',
          requiresUserAction: false,
        }),
      handleCaptureFallback: async () =>
        delayed({
          success: true,
          newSource: 'microphone' as const,
          message: 'Fell back to microphone',
        }),
    },

    // ── Shell ─────────────────────────────────────────────────────────
    shell: {
      openExternal: async () => delayedVoid(),
    },

    // ── Intelligence ──────────────────────────────────────────────────
    intelligence: {
      getHardwareTier: async () => delayed(MOCK_HARDWARE_TIER),
      getEngineStatus: async () => delayed(MOCK_ENGINE_STATUS),
      checkOllama: async () =>
        delayed({
          isInstalled: true,
          isRunning: true,
          version: '0.3.3',
          models: ['qwen2.5:3b'],
          downloadUrl: undefined,
        }),
      unloadModels: async () => delayedVoid(),
      meetingSuggestion: async () => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 2))
        return ok({
          suggestion:
            'Consider discussing the timeline for the API v2 migration and how it impacts the mobile app kickoff.',
          mode: 'question',
        })
      },
      askMeetings: async (params: { question: string }) => {
        // Simulate streaming by emitting tokens, then return full answer
        const answer = `Based on your meeting history, here's what I found:\n\n**Regarding "${params.question}":**\n\nIn the Product Standup (2 hours ago), the team discussed the CI/CD pipeline fix and component library migration progress. Sarah reported 80% completion of the UI migration. Alex confirmed API v2 is deployed to staging with cursor-based pagination.\n\nIn the Design Systems Deep Dive (5 hours ago), the team decided to switch from Inter to Instrument Sans for better readability. The glassmorphism effects were reviewed with performance optimizations using \`will-change: transform\`.\n\nKey action items include:\n- Prepare quarterly demo slides by Wednesday\n- Complete Badge and Tooltip components by Thursday\n- Merge cursor pagination PR by tomorrow\n\n*Sources: meet-001, meet-002, meet-003*`

        // Emit stream tokens via the event system
        const words = answer.split(' ')
        let emitted = ''
        let tokenIndex = 0
        const streamInterval = setInterval(() => {
          if (tokenIndex >= words.length) {
            clearInterval(streamInterval)
            return
          }
          emitted += (tokenIndex > 0 ? ' ' : '') + words[tokenIndex]
          const cbs = listeners['intelligence:streamToken'] || []
          for (const cb of cbs) {
            cb({ token: words[tokenIndex], fullText: emitted })
          }
          tokenIndex++
        }, STREAM_INTERVAL_MS)

        // Wait for stream to finish, then return full answer
        await new Promise(r => setTimeout(r, words.length * STREAM_INTERVAL_MS + 200))
        return ok({ answer })
      },
    },

    // ── Model ─────────────────────────────────────────────────────────
    model: {
      detectHardwareTier: async () => delayed(MOCK_HARDWARE_TIER),
      isFirstLaunch: async () => delayed(false),
      areModelsDownloaded: async () => delayed(true),
      downloadModelsForTier: async () => delayedVoid(),
      downloadAll: async () => delayedVoid(),
      getResourceUsage: async () => delayed({ ramUsed: 4.3, ramTotal: 16, cpuPercent: 12 }),
      verifyModel: async () => delayed(true),
      deleteModel: async () => delayedVoid(),
      getModelPaths: async () => delayed(['/models/whisper-turbo', '/models/qwen2.5-3b']),
      onDownloadProgress: noop,
    },

    // ── Settings ──────────────────────────────────────────────────────
    settings: {
      getAll: async () => delayed(settings),
      get: async (params: { key: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return ok((settings as any)[params.key])
      },
      update: async (params: { key: string; value: unknown }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        settings = { ...settings, [params.key]: params.value }
        return ok(settings)
      },
      reset: async () => {
        settings = { ...MOCK_SETTINGS }
        return delayed(settings)
      },
    },

    // ── Graph ─────────────────────────────────────────────────────────
    graph: {
      get: async () => delayed(MOCK_GRAPH),
      getContradictions: async () => delayed(MOCK_CONTRADICTIONS),
      traverse: async () =>
        delayed({ nodes: MOCK_GRAPH.nodes.slice(0, 5), edges: MOCK_GRAPH.edges.slice(0, 5) }),
      search: async () => delayed({ nodes: MOCK_GRAPH.nodes.slice(0, 3) }),
      getStats: async () =>
        delayed({
          totalNodes: MOCK_GRAPH.nodes.length,
          totalEdges: MOCK_GRAPH.edges.length,
          clusters: 3,
        }),
      contradictionPreview: async () =>
        delayed({
          count: MOCK_CONTRADICTIONS.length,
          available: true,
          requiresPro: false,
          preview: MOCK_CONTRADICTIONS[0]?.statement1 || null,
        }),
    },

    // ── Digest ────────────────────────────────────────────────────────
    digest: {
      generate: async (params: {
        meetingId?: string
        startDate?: number
        endDate?: number
        periodType?: string
      }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 4)) // Simulate AI processing time
        if (params.meetingId) {
          // useDigest hook casts this as { summary?: string, actionItems?: string, decisions?: string }
          const meeting = meetings.find(m => m.id === params.meetingId)
          const meetingNotes = notes[params.meetingId] || []
          const topicCount = meetingNotes.length || Math.floor(Math.random() * 4) + 3 // 3-6 if empty
          const actionCount = Math.floor(Math.random() * 3) + 2
          return ok({
            summary:
              `Meeting "${meeting?.title || 'Untitled'}" covered ${topicCount} key topics. ` +
              `The team discussed progress on current sprint items, identified ${actionCount} action items, ` +
              `and made decisions regarding the upcoming product roadmap. Key areas of focus included infrastructure ` +
              `improvements, component library migration, and AI feature enhancements.`,
            actionItems:
              meetingNotes.map(n => `• ${n.original_text}`).join('\n') ||
              '• Review deployment pipeline\n• Update component library\n• Prepare demo slides',
            decisions:
              '• Adopted cursor-based pagination for API v2\n• Switched to Instrument Sans typography\n• Pinned CI to Node.js 20 LTS',
            generatedAt: new Date().toISOString(),
          })
        }
        // Return period-aware digest
        const periodType = (params.periodType || 'weekly') as 'daily' | 'weekly' | 'monthly'
        return ok(buildMockDigest(periodType, params.startDate, params.endDate))
      },
      getLatest: async (params?: { periodType?: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const periodType = (params?.periodType || 'weekly') as 'daily' | 'weekly' | 'monthly'
        return ok(buildMockDigest(periodType))
      },
    },

    // ── Export & GDPR ─────────────────────────────────────────────────
    export: {
      userData: async () =>
        delayed({ content: '{"meetings":[],"notes":[],"transcripts":[]}', format: 'json' }),
      deleteAllData: async () =>
        delayed({ localDeleted: true, cloudDeleted: true, message: 'All data deleted (mock)' }),
    },

    // ── Window ────────────────────────────────────────────────────────
    window: {
      restoreMain: async () => delayedVoid(),
    },

    // ── Widget ────────────────────────────────────────────────────────
    widget: {
      updateState: async () => delayedVoid(),
      triggerBookmark: async () => delayedVoid(),
      submitQuickNote: async () => delayedVoid(),
      triggerPauseToggle: async () => delayedVoid(),
    },

    // ── Highlight ─────────────────────────────────────────────────────
    highlight: {
      create: async (params: {
        meetingId: string
        startTime: number
        endTime: number
        label?: string
        color?: string
      }) => {
        return delayed({
          id: `hl-${Date.now()}`,
          meeting_id: params.meetingId,
          start_time: params.startTime,
          end_time: params.endTime,
          label: params.label || null,
          color: params.color || '#8B5CF6',
          created_at: Math.floor(Date.now() / 1000),
        })
      },
      list: async () => delayed([]),
      delete: async () => delayed({ deleted: true }),
    },

    // ── Window Controls (Windows title bar) ───────────────────────────
    windowControls: {
      minimize: async () => okVoid(),
      maximize: async () => okVoid(),
      close: async () => okVoid(),
      isMaximized: async () => false,
    },

    // ── Desktop Capturer Sources ──────────────────────────────────────
    desktopCapturerSources: async () => [],

    // ── Event Listeners ───────────────────────────────────────────────

    _listeners: listeners,

    on: {
      transcriptChunk: (callback: (...args: unknown[]) => void) => {
        if (!listeners['transcriptChunk']) listeners['transcriptChunk'] = []
        listeners['transcriptChunk'].push(callback)
        return () => {
          listeners['transcriptChunk'] = (listeners['transcriptChunk'] || []).filter(
            cb => cb !== callback
          )
        }
      },
      llmToken: (callback: (...args: unknown[]) => void) => {
        if (!listeners['llmToken']) listeners['llmToken'] = []
        listeners['llmToken'].push(callback)
        return () => {
          listeners['llmToken'] = (listeners['llmToken'] || []).filter(cb => cb !== callback)
        }
      },
      syncEvent: (callback: (...args: unknown[]) => void) => {
        if (!listeners['syncEvent']) listeners['syncEvent'] = []
        listeners['syncEvent'].push(callback)
        return () => {
          listeners['syncEvent'] = (listeners['syncEvent'] || []).filter(cb => cb !== callback)
        }
      },
      audioEvent: noop,
      batchExpandProgress: noop,
      widgetStateUpdated: noop,
      error: noop,
      'intelligence:streamToken': (callback: (...args: unknown[]) => void) => {
        const key = 'intelligence:streamToken'
        if (!listeners[key]) listeners[key] = []
        listeners[key].push(callback)
        return () => {
          listeners[key] = (listeners[key] || []).filter(cb => cb !== callback)
        }
      },
      showIntelligenceWall: noop,
      bookmarkRequested: noop,
      pauseRequested: noop,
      quickNoteRequested: noop,
      deepLink: noop,
      windowMaximized: noop,
      windowUnmaximized: noop,
    },

    // ── IPC Renderer ──────────────────────────────────────────────────
    ipcRenderer: {
      send: () => {},
      on: () => () => {},
    },

    // ── Power ─────────────────────────────────────────────────────────
    power: {
      getStatus: async () => delayed({ isOnBattery: false }),
    },

    // ── Auth ──────────────────────────────────────────────────────────
    auth: {
      login: async () => delayed({ user: MOCK_USER, expiresIn: 86400 }),
      register: async () => delayed({ user: MOCK_USER, expiresIn: 86400 }),
      logout: async () => delayedVoid(),
      getCurrentUser: async () => delayed(MOCK_USER),
      isAuthenticated: async () => delayed({ authenticated: true }),
      googleAuth: async () => delayedVoid(),
      refreshToken: async () => delayed({ refreshed: true }),
      generateRecoveryKey: async () =>
        delayed({
          phrase: [
            'abandon',
            'ability',
            'able',
            'about',
            'above',
            'absent',
            'absorb',
            'abstract',
            'absurd',
            'abuse',
            'access',
            'accident',
            'account',
            'accuse',
            'achieve',
            'acid',
            'acoustic',
            'acquire',
            'across',
            'act',
            'action',
            'actor',
            'actress',
            'actual',
          ],
        }),
      onSessionExpired: noop,
      onSessionExpiring: noop,
      onOAuthSuccess: noop,
      onOAuthError: noop,
      recordActivity: async () => delayedVoid(),
      refreshProfile: async () => delayed(MOCK_USER),
      activateLicense: async () => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 3))
        return ok(MOCK_USER)
      },
      forgotPassword: async () => delayedVoid(),
    },

    // ── Device ────────────────────────────────────────────────────────
    device: {
      list: async (_params?: { activeOnly?: boolean }) => delayed(MOCK_DEVICES),
      getCurrent: async () => delayed(MOCK_CURRENT_DEVICE),
      register: async () =>
        delayed({
          success: true,
          isNewDevice: false,
          limitReached: false,
          currentDeviceCount: 2,
          maxDevices: 999,
          message: 'Device registered',
        }),
      deactivate: async () => delayed({ deactivated: true }),
      rename: async () => delayed({ renamed: true }),
    },

    // ── Diagnostic ────────────────────────────────────────────────────
    diagnostic: {
      export: async () => delayed({ path: '/tmp/diagnostics-export.zip' }),
      clear: async () => delayedVoid(),
      stats: async () =>
        delayed({
          totalFiles: 24,
          totalSize: '8.1 MB',
          oldestLog: new Date(Date.now() - 14 * 86400000).toISOString(),
          newestLog: new Date().toISOString(),
        }),
      openFolder: async () => delayedVoid(),
      getSystemInfo: async () =>
        delayed({
          platform: 'darwin',
          arch: 'arm64',
          cpus: 10,
          memory: { total: 17179869184 },
          nodeVersion: 'v20.11.1',
          electronVersion: '28.2.0',
        }),
      rebuildFts: async () => delayed({ transcripts: true, notes: true }),
      healthCheck: async () =>
        delayed({
          results: [
            {
              system: 'Database',
              status: 'ok',
              message: 'SQLite WAL mode active, 4 tables healthy',
            },
            {
              system: 'Audio Pipeline',
              status: 'ok',
              message: 'VAD + ASR workers ready',
            },
            {
              system: 'LLM Engine',
              status: 'ok',
              message: 'qwen2.5:3b loaded (3.1 GB VRAM)',
            },
            {
              system: 'Storage',
              status: 'ok',
              message: '2.1 GB used / 256 GB available',
            },
            {
              system: 'Network',
              status: 'ok',
              message: 'Mock mode — all systems simulated',
            },
          ],
          systemInfo: {
            Platform: 'macOS 15.3 (darwin/arm64)',
            Electron: '33.4.11',
            Node: 'v20.18.3',
            'App Version': '0.3.3',
            Memory: '16 GB',
            CPUs: '10 cores',
          },
        }),
    },

    // ── Billing ───────────────────────────────────────────────────────
    billing: {
      getConfig: async () => delayed(MOCK_BILLING_CONFIG),
      getStatus: async () => delayed({ status: 'active', tier: 'pro' }),
      openCheckout: async () => delayedVoid(),
    },

    // ── Quota ─────────────────────────────────────────────────────────
    quota: {
      check: async () => delayed(MOCK_QUOTA),
    },

    // ── Audit ─────────────────────────────────────────────────────────
    audit: {
      query: async (params: { limit?: number; offset?: number }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const limit = params.limit ?? 50
        const offset = params.offset ?? 0
        const slice = MOCK_AUDIT_LOGS.slice(offset, offset + limit)
        return ok({ items: slice, total: MOCK_AUDIT_LOGS.length })
      },
      export: async () => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const csv =
          'timestamp,operation,table,recordId,ipAddress\n' +
          MOCK_AUDIT_LOGS.map(
            l => `${l.timestamp},${l.operation},${l.table},${l.recordId || ''},${l.ipAddress || ''}`
          ).join('\n')
        return ok({ content: csv, filename: 'audit-log-export.csv' })
      },
    },

    // ── Action Items ───────────────────────────────────────────────────
    actionItem: {
      list: async (_params: { meetingId?: string; status?: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const items = [
          {
            id: 'ai-001',
            meeting_id: 'meet-001',
            text: 'Review pull request #347 — cursor pagination',
            assignee: 'Piyush Kumar',
            status: 'open' as const,
            due_date: Math.floor(Date.now() / 1000) + 86400,
            created_at: Math.floor(Date.now() / 1000) - 7200,
            source_segment: 'Can you review PR #347 today?',
            confidence: 0.92,
          },
          {
            id: 'ai-002',
            meeting_id: 'meet-002',
            text: 'Update Figma mockups for settings panel',
            assignee: 'Sarah Chen',
            status: 'open' as const,
            due_date: Math.floor(Date.now() / 1000) + 172800,
            created_at: Math.floor(Date.now() / 1000) - 14400,
            source_segment: 'Sarah, can you update the Figma?',
            confidence: 0.88,
          },
          {
            id: 'ai-003',
            meeting_id: 'meet-001',
            text: 'Fix flaky CI test in auth module',
            assignee: 'Alex Rivera',
            status: 'completed' as const,
            due_date: Math.floor(Date.now() / 1000) - 3600,
            created_at: Math.floor(Date.now() / 1000) - 28800,
            source_segment: 'The auth module test keeps failing on CI.',
            confidence: 0.95,
          },
        ]
        const filtered = _params.meetingId
          ? items.filter(i => i.meeting_id === _params.meetingId)
          : _params.status
            ? items.filter(i => i.status === _params.status)
            : items
        return ok(filtered)
      },
      create: async (params: unknown) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({
          id: `ai-new-${Date.now()}`,
          ...(params as object),
          created_at: Math.floor(Date.now() / 1000),
        })
      },
      update: async (params: { id: string; updates: object }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({ id: params.id, ...params.updates, updated_at: Math.floor(Date.now() / 1000) })
      },
      delete: async (_params: { id: string }) => delayedVoid(),
      extract: async (_params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 3))
        return ok({ extracted: 2, items: [] })
      },
      getOverdue: async () => delayed([]),
      stats: async () => delayed({ total: 3, open: 2, completed: 1, overdue: 0 }),
    },

    // ── Sentiment Analysis ────────────────────────────────────────────
    sentiment: {
      analyze: async (_params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 2))
        return ok({ meetingId: _params.meetingId, overallSentiment: 0.72, analyzed: true })
      },
      getByMeeting: async (_params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok([
          {
            timestamp: Date.now() - 3600000,
            score: 0.65,
            label: 'positive',
            segment: 'Great progress on the sprint.',
          },
          {
            timestamp: Date.now() - 3000000,
            score: 0.45,
            label: 'neutral',
            segment: "Let's revisit the timeline.",
          },
          {
            timestamp: Date.now() - 2400000,
            score: 0.82,
            label: 'positive',
            segment: 'The demo went really well!',
          },
        ])
      },
      getMood: async (_params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({ mood: 'productive', score: 0.72, energy: 'high' })
      },
      getTimeline: async (_params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const now = Math.floor(Date.now() / 1000)
        return ok([
          { timestamp: now - 3600, score: 0.65, label: 'positive' },
          { timestamp: now - 3000, score: 0.45, label: 'neutral' },
          { timestamp: now - 2400, score: 0.82, label: 'positive' },
          { timestamp: now - 1800, score: 0.38, label: 'negative' },
          { timestamp: now - 1200, score: 0.71, label: 'positive' },
          { timestamp: now - 600, score: 0.88, label: 'positive' },
        ])
      },
    },

    // ── Calendar ──────────────────────────────────────────────────────
    calendar: {
      sync: async (_params: { provider: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 2))
        return ok({ synced: true, provider: _params.provider, eventsImported: 5 })
      },
      list: async (_params: { start: number; end: number }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        const now = Math.floor(Date.now() / 1000)
        return ok([
          {
            id: 'cal-001',
            title: 'Sprint Planning',
            start_time: now + 3600,
            end_time: now + 5400,
            attendees: ['Piyush Kumar', 'Sarah Chen', 'Alex Rivera'],
            location: 'Zoom',
            calendar_provider: 'google',
            linked_meeting_id: null,
          },
          {
            id: 'cal-002',
            title: 'Design Review',
            start_time: now + 86400,
            end_time: now + 90000,
            attendees: ['Piyush Kumar', 'Maya Patel'],
            location: 'Meet',
            calendar_provider: 'google',
            linked_meeting_id: null,
          },
          {
            id: 'cal-003',
            title: '1:1 with Manager',
            start_time: now + 172800,
            end_time: now + 174600,
            attendees: ['Piyush Kumar', 'David Thompson'],
            location: 'Office',
            calendar_provider: 'apple',
            linked_meeting_id: null,
          },
        ])
      },
      link: async (_params: { eventId: string; meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({ linked: true, eventId: _params.eventId, meetingId: _params.meetingId })
      },
      autoLink: async (_params: { meetingId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({ matched: false, eventId: null })
      },
      getPreContext: async (_params: { eventId: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({
          previousMeetings: [],
          openActionItems: [],
          suggestedTopics: ["Follow up on last week's decisions", 'Review sprint progress'],
        })
      },
    },

    // ── Webhooks ──────────────────────────────────────────────────────
    webhook: {
      list: async () => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok([
          {
            id: 'wh-001',
            url: 'https://hooks.slack.com/services/mock/webhook',
            events: ['meeting.completed', 'action_item.created'],
            is_active: 1,
            description: 'Slack notifications',
            created_at: Math.floor(Date.now() / 1000) - 604800,
            last_triggered: Math.floor(Date.now() / 1000) - 3600,
          },
        ])
      },
      create: async (params: unknown) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({
          id: `wh-new-${Date.now()}`,
          ...(params as object),
          is_active: 1,
          created_at: Math.floor(Date.now() / 1000),
        })
      },
      update: async (params: { id: string; updates: object }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({ id: params.id, ...params.updates })
      },
      delete: async (_params: { id: string }) => delayedVoid(),
      test: async (_params: { id: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 2))
        return ok({ delivered: true, statusCode: 200, responseTime: 142 })
      },
      getDeliveries: async (_params: { webhookId: string; limit?: number }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok([
          {
            id: 'del-001',
            webhook_id: _params.webhookId,
            event_type: 'meeting.completed',
            status_code: 200,
            delivered_at: Math.floor(Date.now() / 1000) - 3600,
            response_time_ms: 142,
          },
        ])
      },
    },

    // ── PiyAPI Power Features ────────────────────────────────────────
    piyapi: {
      feedback: async (_params: { memoryIds: string[]; type: 'positive' | 'negative' }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok({ acknowledged: true })
      },
      fuzzySearch: async (params: { query: string; namespace?: string; limit?: number }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS))
        return ok([
          { id: 'mem-1', content: `Mock fuzzy result for "${params.query}"`, score: 0.85 },
          { id: 'mem-2', content: `Another match for "${params.query}"`, score: 0.72 },
        ])
      },
      deduplicate: async () => delayed({ duplicates: 3, merged: 0 }),
      pinMemory: async (params: { memoryId: string; unpin?: boolean }) =>
        delayed({ memoryId: params.memoryId, pinned: !params.unpin }),
      getClusters: async () => delayed({ totalNodes: 42, totalEdges: 78, clusters: 5 }),
      getContext: async (params: { query: string }) => {
        await new Promise(r => setTimeout(r, MOCK_DELAY_MS * 2))
        return ok({
          context: `Mock context for query: "${params.query}". This includes relevant meeting transcripts and notes.`,
          tokens_used: 256,
          segments: [
            {
              content: 'Mock transcript segment 1',
              timestamp: Date.now() - 3600000,
              meeting_id: 'meet-001',
            },
            {
              content: 'Mock transcript segment 2',
              timestamp: Date.now() - 7200000,
              meeting_id: 'meet-002',
            },
          ],
        })
      },
    },
  }

  return api
}

// ============================================================================
// Installer — call from main.tsx
// ============================================================================

export function installMockElectronAPI() {
  console.log(
    '%c🧪 MOCK MODE ACTIVE — All IPC calls intercepted with pseudo data',
    'color: #8B5CF6; font-size: 14px; font-weight: bold; background: #1a1a2e; padding: 8px 16px; border-radius: 8px;'
  )

  const mockAPI = createMockElectronAPI()

  // The preload script checks USE_MOCK_DATA and skips contextBridge,
  // so window.electronAPI is undefined here. Simple direct assign works.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).electronAPI = mockAPI

  // Set store to pro tier SYNCHRONOUSLY — must run before React renders
  // to prevent race conditions with useSystemState, useSyncEngine hooks.
  useAppStore.setState({
    currentTier: 'pro',
    isOnline: true,
    syncStatus: 'idle',
    quotaData: {
      used: MOCK_QUOTA.used,
      limit: MOCK_QUOTA.limit,
      remaining: MOCK_QUOTA.remaining,
      exhausted: false,
    },
  })
}
