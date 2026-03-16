/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Mock Data — Comprehensive pseudo data for every entity in PiyNotes.
 *
 * This file provides rich, realistic data that matches the exact types
 * defined in src/types/database.ts and src/types/ipc.ts.
 *
 * Non-null assertions (!) are safe here — all arrays are constructed above
 * and index access is always within bounds.
 */

import type { Meeting, Transcript, Note, Entity } from '../types/database'
import type {
  AppSettings,
  WeeklyDigest,
  GraphData,
  GraphNode,
  GraphEdge,
  Contradiction,
  SyncStatus,
  HardwareTierInfo,
  InferenceEngineStatus,
  SemanticSearchResult,
  SearchResponse,
  AudioCaptureStatus,
} from '../types/ipc'

// ============================================================================
// Helpers
// ============================================================================

const now = Date.now()
const hour = 3600_000
const day = 86400_000

// ============================================================================
// Meetings — 12 realistic entries across 3 days
// ============================================================================

export const MOCK_MEETINGS: Meeting[] = [
  // Today
  {
    id: 'meet-001',
    title: 'Product Standup — Sprint 24',
    start_time: now - 2 * hour,
    end_time: now - 1.5 * hour,
    duration: 1800,
    participant_count: 5,
    tags: '["standup","sprint-24"]',
    namespace: 'default',
    created_at: now - 2 * hour,
    synced_at: now - 1 * hour,
    performance_tier: 'high',
  },
  {
    id: 'meet-002',
    title: 'Design Systems Deep Dive',
    start_time: now - 5 * hour,
    end_time: now - 3.5 * hour,
    duration: 5400,
    participant_count: 3,
    tags: '["design","ui"]',
    namespace: 'default',
    created_at: now - 5 * hour,
    synced_at: now - 3 * hour,
    performance_tier: 'high',
  },
  {
    id: 'meet-003',
    title: 'AI Feature Brainstorm',
    start_time: now - 7 * hour,
    end_time: now - 6 * hour,
    duration: 3600,
    participant_count: 4,
    tags: '["ai","brainstorm"]',
    namespace: 'default',
    created_at: now - 7 * hour,
    synced_at: now - 5 * hour,
    performance_tier: 'high',
  },

  // Yesterday
  {
    id: 'meet-004',
    title: 'Client Onboarding — Acme Corp',
    start_time: now - 1 * day - 2 * hour,
    end_time: now - 1 * day - 1 * hour,
    duration: 3600,
    participant_count: 6,
    tags: '["client","acme"]',
    namespace: 'default',
    created_at: now - 1 * day - 2 * hour,
    synced_at: now - 1 * day,
    performance_tier: 'high',
  },
  {
    id: 'meet-005',
    title: 'Sprint 23 Retrospective',
    start_time: now - 1 * day - 5 * hour,
    end_time: now - 1 * day - 4 * hour,
    duration: 3600,
    participant_count: 7,
    tags: '["retro","sprint-23"]',
    namespace: 'default',
    created_at: now - 1 * day - 5 * hour,
    synced_at: now - 1 * day - 1 * hour,
    performance_tier: 'high',
  },
  {
    id: 'meet-006',
    title: 'Infrastructure Cost Review',
    start_time: now - 1 * day - 8 * hour,
    end_time: now - 1 * day - 7 * hour,
    duration: 3600,
    participant_count: 3,
    tags: '["infra","budget"]',
    namespace: 'default',
    created_at: now - 1 * day - 8 * hour,
    synced_at: now - 1 * day - 6 * hour,
    performance_tier: 'mid',
  },
  {
    id: 'meet-007',
    title: 'Security Audit Planning',
    start_time: now - 1 * day - 10 * hour,
    end_time: now - 1 * day - 9.5 * hour,
    duration: 1800,
    participant_count: 4,
    tags: '["security","compliance"]',
    namespace: 'default',
    created_at: now - 1 * day - 10 * hour,
    synced_at: now - 1 * day - 9 * hour,
    performance_tier: 'high',
  },

  // Earlier this week
  {
    id: 'meet-008',
    title: 'Quarterly OKR Alignment',
    start_time: now - 3 * day - 3 * hour,
    end_time: now - 3 * day - 1.5 * hour,
    duration: 5400,
    participant_count: 8,
    tags: '["okr","planning"]',
    namespace: 'default',
    created_at: now - 3 * day - 3 * hour,
    synced_at: now - 3 * day,
    performance_tier: 'high',
  },
  {
    id: 'meet-009',
    title: 'API v2 Architecture Review',
    start_time: now - 4 * day - 4 * hour,
    end_time: now - 4 * day - 2.5 * hour,
    duration: 5400,
    participant_count: 5,
    tags: '["api","architecture"]',
    namespace: 'default',
    created_at: now - 4 * day - 4 * hour,
    synced_at: now - 4 * day - 1 * hour,
    performance_tier: 'high',
  },
  {
    id: 'meet-010',
    title: 'Mobile App Kickoff',
    start_time: now - 5 * day - 2 * hour,
    end_time: now - 5 * day - 1 * hour,
    duration: 3600,
    participant_count: 6,
    tags: '["mobile","kickoff"]',
    namespace: 'default',
    created_at: now - 5 * day - 2 * hour,
    synced_at: now - 5 * day,
    performance_tier: 'mid',
  },
  {
    id: 'meet-011',
    title: 'Data Pipeline Debugging',
    start_time: now - 6 * day - 3 * hour,
    end_time: now - 6 * day - 2 * hour,
    duration: 3600,
    participant_count: 2,
    tags: '["data","debugging"]',
    namespace: 'default',
    created_at: now - 6 * day - 3 * hour,
    synced_at: now - 6 * day - 1 * hour,
    performance_tier: 'high',
  },
  {
    id: 'meet-012',
    title: '1:1 with Sarah — Performance Review',
    start_time: now - 6 * day - 6 * hour,
    end_time: now - 6 * day - 5.5 * hour,
    duration: 1800,
    participant_count: 2,
    tags: '["one-on-one","hr"]',
    namespace: 'default',
    created_at: now - 6 * day - 6 * hour,
    synced_at: now - 6 * day - 5 * hour,
    performance_tier: 'mid',
  },
]

// ============================================================================
// Speakers
// ============================================================================

const SPEAKERS = [
  { id: 'spk-piyush', name: 'Piyush Kumar' },
  { id: 'spk-sarah', name: 'Sarah Chen' },
  { id: 'spk-alex', name: 'Alex Rivera' },
  { id: 'spk-maya', name: 'Maya Patel' },
]

// ============================================================================
// Transcripts — per meeting, 15-20 segments each
// ============================================================================

function generateTranscripts(meetingId: string, meetingStart: number, count: number): Transcript[] {
  const dialogues: string[][] = [
    [
      "Good morning everyone, let's get started with today's agenda.",
      'Thanks Piyush. I have a few updates from the frontend team.',
      'Before we jump in, can we address the deployment issue from yesterday?',
      "Sure, I'll cover that first. The CI pipeline was failing due to a Node version mismatch.",
      "We've pinned it to Node 20 LTS now. All green since 6 AM.",
      "Perfect. Sarah, what's the status on the new component library?",
      "We're about 80% through the migration. The Button, Input, and Modal components are done.",
      'The Badge and Tooltip components are still in progress. Should be done by Thursday.',
      'Are we using CSS variables for theming or sticking with the design tokens approach?',
      'CSS variables. They cascade better and we get runtime theme switching for free.',
      'I noticed the bundle size went up 12% after the last merge. We should look into that.',
      "That's from the Framer Motion dependency. We can tree-shake the unused modules.",
      'Let me create a ticket for that. Alex, what about the API changes?',
      "The v2 endpoints are deployed to staging. We've got full backward compatibility.",
      'One breaking change though — the pagination now uses cursor-based instead of offset.',
      "We'll need to update the frontend query hooks. Maya, can you take that?",
      'Already on it. I have a draft PR that switches useMeetings to cursor pagination.',
      "Nice. Let's target merging that by end of day tomorrow.",
      "Any blockers from anyone? No? Great, let's wrap up then.",
      "One more thing — the quarterly demo is next Friday. Let's prep slides by Wednesday.",
    ],
    [
      "Alright, let's dive into the design system review.",
      "I've been studying the Sovereign UI principles. The glassmorphism effects are stunning.",
      'The key challenge is performance. Those blur effects can tank FPS on lower-end machines.',
      'We can use will-change: transform and contain: paint to optimize the compositing.',
      'Good call. What about the color palette? The current violet is too saturated on some displays.',
      "I've prepared three alternative palettes. Let me share my screen.",
      "The muted violet option looks great. It still feels premium but won't strain the eyes.",
      "Agreed. Let's also reduce the glow intensity on the DynamicIsland by about 30%.",
      "For the typography, I'm recommending we switch from Inter to Instrument Sans.",
      'It has better readability at small sizes, which matters for our transcript segments.',
      'What about the spacing scale? The current 4px base feels too tight in some areas.',
      "Let's keep 4px but bump the component padding from 12px to 16px.",
      "I've also designed a new empty state illustration set. Five SVG compositions.",
      'They use our brand colors and have subtle animations on hover.',
      "Love it. The microphone one for 'no meetings' is especially nice.",
      'Should we add dark mode variants or let the CSS invert handle it?',
      'Custom dark variants. Auto-invert always looks washed out with our gradients.',
      "I'll prepare the final design spec by Friday. Everyone review it over the weekend?",
    ],
    [
      "Let's brainstorm how we can improve the AI features for the next release.",
      'The biggest user request is better entity detection. People want it to catch project names.',
      'We could fine-tune the NER model on a custom dataset of product and tech terms.',
      "That's a lot of work. What about a simpler approach — a user-defined dictionary?",
      'A dictionary plus fuzzy matching would cover 90% of cases without retraining.',
      'I like that. We can store it in the settings and sync it across devices.',
      'Another thing — the AI coach tips are sometimes irrelevant during technical discussions.',
      'We need better context windowing. Right now it only looks at the last 30 seconds.',
      'What if we increase the window to 2 minutes and add topic segmentation?',
      "That doubles the inference cost. We'd need to be smart about batching.",
      "For cloud users it doesn't matter — the API handles it. For local, we need to throttle.",
      "Let's add a 'coaching intensity' slider in settings. Low, Medium, High.",
      'Great idea. Low = every 5 minutes, Medium = every 2, High = real-time.',
      'We should also explore the weekly digest format. Users love it but want more detail.',
      "Adding a 'follow-up tracker' to the digest would be huge.",
      "It could cross-reference action items from this week with last week's open items.",
      "That's essentially building a simple project management layer on top of meetings.",
      'Exactly. Meeting-driven task tracking without any extra input from the user.',
      "Let me prototype this over the weekend. I'll use the existing entity graph as the data source.",
      "Perfect. Let's reconvene Monday with the prototype and the NER dictionary design.",
    ],
  ]

  const dialogue = dialogues[Math.abs(meetingId.charCodeAt(7)) % dialogues.length]!
  const segmentCount = Math.min(count, dialogue.length)
  const segmentDuration = 15000 // 15 seconds per segment

  return Array.from({ length: segmentCount }, (_, i) => ({
    id: `txn-${meetingId}-${String(i).padStart(3, '0')}`,
    meeting_id: meetingId,
    start_time: meetingStart + i * segmentDuration,
    end_time: meetingStart + (i + 1) * segmentDuration,
    text: dialogue[i % dialogue.length]!,
    confidence: 0.85 + Math.random() * 0.14,
    speaker_id: SPEAKERS[i % SPEAKERS.length]!.id,
    speaker_name: SPEAKERS[i % SPEAKERS.length]!.name,
    words: null,
    created_at: meetingStart + i * segmentDuration,
    synced_at: meetingStart + i * segmentDuration + 5000,
  }))
}

export const MOCK_TRANSCRIPTS: Record<string, Transcript[]> = {}
for (const m of MOCK_MEETINGS) {
  MOCK_TRANSCRIPTS[m.id] = generateTranscripts(m.id, m.start_time, 18)
}

// ============================================================================
// Notes — per meeting, 3-5 AI-expanded notes
// ============================================================================

const NOTE_TEMPLATES = [
  {
    original: 'CI pipeline was broken — Node version mismatch, now pinned to v20 LTS.',
    augmented:
      'The CI/CD pipeline experienced failures due to a Node.js version mismatch between the build environment (Node 18) and the project requirements (Node 20 LTS). The team resolved this by pinning the Node version in the CI configuration. All builds have been green since 6 AM today.',
    context: 'Discussion about deployment issues during standup',
  },
  {
    original:
      'Component library migration at 80%. Button, Input, Modal done. Badge and Tooltip pending.',
    augmented:
      'The component library migration to the new Sovereign UI design system is approximately 80% complete. Completed components include Button, Input, and Modal with full accessibility support. Badge and Tooltip components remain in progress and are expected to be finished by Thursday.',
    context: 'Frontend team status update',
  },
  {
    original: 'Bundle size increased 12% from Framer Motion. Need to tree-shake unused modules.',
    augmented:
      'A 12% increase in bundle size was identified after the latest merge, attributed to the Framer Motion animation library dependency. The team plans to implement tree-shaking to remove unused Framer Motion modules, which should reduce the impact to under 3%.',
    context: 'Performance concern raised during code review discussion',
  },
  {
    original: 'API v2 uses cursor-based pagination instead of offset. Frontend hooks need update.',
    augmented:
      'The API v2 migration introduces a breaking change: pagination now uses cursor-based navigation instead of offset-based. This requires updates to frontend query hooks (useMeetings, useSearch). Maya has a draft PR ready that implements the cursor pagination pattern.',
    context: 'API architecture discussion',
  },
  {
    original: 'Quarterly demo next Friday. Slides needed by Wednesday.',
    augmented:
      'The quarterly product demonstration is scheduled for next Friday. The team needs to prepare presentation slides by Wednesday to allow time for review. Key topics to cover include the design system migration, API v2 launch, and AI feature improvements.',
    context: 'Team planning and deadlines',
  },
  {
    original: 'Switch from Inter to Instrument Sans font for better readability at small sizes.',
    augmented:
      'A typography change was proposed: moving from Inter to Instrument Sans. The primary motivation is improved readability at smaller font sizes (11-13px), which is critical for transcript segments and entity chips. Instrument Sans also has better rendering on Windows.',
    context: 'Design systems review discussion',
  },
  {
    original: 'Add user-defined entity dictionary with fuzzy matching for custom terms.',
    augmented:
      'Rather than fine-tuning the NER model (which requires significant ML effort), the team decided to implement a user-defined dictionary approach with fuzzy matching. Users can add custom terms (product names, project codes, etc.) that the entity detector will recognize. The dictionary syncs across devices via the existing CRDT sync mechanism.',
    context: 'AI feature brainstorm',
  },
  {
    original: 'AI coaching intensity slider: Low (5min), Medium (2min), High (real-time).',
    augmented:
      'A new "Coaching Intensity" setting will be added to control how frequently the AI coach provides real-time suggestions during meetings. Three levels: Low (suggestions every 5 minutes), Medium (every 2 minutes), and High (real-time, continuous). This addresses feedback that the current always-on coaching can be distracting during technical discussions.',
    context: 'AI feature improvement discussion',
  },
]

function generateNotes(meetingId: string, meetingStart: number): Note[] {
  const count = 3 + (Math.abs(meetingId.charCodeAt(7)) % 3)
  const offset = Math.abs(meetingId.charCodeAt(7) * 7) % NOTE_TEMPLATES.length
  return Array.from({ length: count }, (_, i) => {
    const template = NOTE_TEMPLATES[(offset + i) % NOTE_TEMPLATES.length]!
    return {
      id: `note-${meetingId}-${i}`,
      meeting_id: meetingId,
      timestamp: meetingStart + (i + 1) * 60000,
      original_text: template.original,
      augmented_text: template.augmented,
      context: template.context,
      is_augmented: true,
      version: 1,
      created_at: meetingStart + (i + 1) * 60000,
      updated_at: meetingStart + (i + 2) * 60000,
      synced_at: meetingStart + (i + 2) * 60000,
    }
  })
}

export const MOCK_NOTES: Record<string, Note[]> = {}
for (const m of MOCK_MEETINGS) {
  MOCK_NOTES[m.id] = generateNotes(m.id, m.start_time)
}

// ============================================================================
// Entities — per meeting, 15-25 detected entities
// ============================================================================

const ENTITY_POOL: Array<{ type: string; text: string }> = [
  { type: 'PERSON', text: 'Piyush Kumar' },
  { type: 'PERSON', text: 'Sarah Chen' },
  { type: 'PERSON', text: 'Alex Rivera' },
  { type: 'PERSON', text: 'Maya Patel' },
  { type: 'PERSON', text: 'David Thompson' },
  { type: 'ORGANIZATION', text: 'Acme Corp' },
  { type: 'ORGANIZATION', text: 'BlueArkive' },
  { type: 'ORGANIZATION', text: 'Google Cloud' },
  { type: 'TOPIC', text: 'CI/CD Pipeline' },
  { type: 'TOPIC', text: 'Design Systems' },
  { type: 'TOPIC', text: 'API v2 Migration' },
  { type: 'TOPIC', text: 'Bundle Size Optimization' },
  { type: 'TOPIC', text: 'Entity Detection' },
  { type: 'TOPIC', text: 'CRDT Sync' },
  { type: 'TOPIC', text: 'Quarterly OKRs' },
  { type: 'DATE', text: 'Next Friday' },
  { type: 'DATE', text: 'Thursday' },
  { type: 'DATE', text: 'End of Q1' },
  { type: 'AMOUNT', text: '$2,400/mo' },
  { type: 'AMOUNT', text: '12% increase' },
  { type: 'AMOUNT', text: '80% complete' },
  { type: 'EMAIL', text: 'piyush@bluearkive.com' },
  { type: 'EMAIL', text: 'sarah.chen@acme.com' },
  { type: 'URL', text: 'https://github.com/bluearkive/piynotes' },
  { type: 'LOCATION', text: 'San Francisco Office' },
  { type: 'LOCATION', text: 'Mumbai HQ' },
  { type: 'DOCUMENT', text: 'Q1 Product Roadmap.pdf' },
  { type: 'DOCUMENT', text: 'API v2 Spec.md' },
]

function generateEntities(meetingId: string): Entity[] {
  const count = 15 + (Math.abs(meetingId.charCodeAt(5)) % 11)
  const offset = Math.abs(meetingId.charCodeAt(6)) % ENTITY_POOL.length
  return Array.from({ length: count }, (_, i) => {
    const entity = ENTITY_POOL[(offset + i) % ENTITY_POOL.length]!
    return {
      id: `ent-${meetingId}-${i}`,
      meeting_id: meetingId,
      type: entity.type,
      text: entity.text,
      confidence: 0.75 + Math.random() * 0.24,
      start_offset: i * 100,
      end_offset: i * 100 + entity.text.length,
      transcript_id: `txn-${meetingId}-${String(i % 18).padStart(3, '0')}`,
      created_at: now - i * 10000,
    }
  })
}

export const MOCK_ENTITIES: Record<string, Entity[]> = {}
for (const m of MOCK_MEETINGS) {
  MOCK_ENTITIES[m.id] = generateEntities(m.id)
}

// ============================================================================
// Graph Data — for KnowledgeGraphView
// ============================================================================

const graphNodes: GraphNode[] = [
  {
    id: 'gn-1',
    type: 'meeting',
    label: 'Product Standup',
    metadata: { meetingId: 'meet-001' },
    createdAt: now - 2 * hour,
  },
  {
    id: 'gn-2',
    type: 'meeting',
    label: 'Design Systems Deep Dive',
    metadata: { meetingId: 'meet-002' },
    createdAt: now - 5 * hour,
  },
  {
    id: 'gn-3',
    type: 'meeting',
    label: 'AI Feature Brainstorm',
    metadata: { meetingId: 'meet-003' },
    createdAt: now - 7 * hour,
  },
  {
    id: 'gn-4',
    type: 'meeting',
    label: 'Client Onboarding',
    metadata: { meetingId: 'meet-004' },
    createdAt: now - 1 * day,
  },
  {
    id: 'gn-5',
    type: 'meeting',
    label: 'Sprint 23 Retrospective',
    metadata: { meetingId: 'meet-005' },
    createdAt: now - 1 * day,
  },
  {
    id: 'gn-6',
    type: 'person',
    label: 'Piyush Kumar',
    metadata: { role: 'Engineering Lead' },
    createdAt: now - 7 * day,
  },
  {
    id: 'gn-7',
    type: 'person',
    label: 'Sarah Chen',
    metadata: { role: 'Frontend Engineer' },
    createdAt: now - 7 * day,
  },
  {
    id: 'gn-8',
    type: 'person',
    label: 'Alex Rivera',
    metadata: { role: 'Backend Engineer' },
    createdAt: now - 7 * day,
  },
  {
    id: 'gn-9',
    type: 'person',
    label: 'Maya Patel',
    metadata: { role: 'Full Stack Developer' },
    createdAt: now - 7 * day,
  },
  {
    id: 'gn-10',
    type: 'topic',
    label: 'API v2 Migration',
    metadata: { mentionCount: 12 },
    createdAt: now - 5 * day,
  },
  {
    id: 'gn-11',
    type: 'topic',
    label: 'Design System',
    metadata: { mentionCount: 18 },
    createdAt: now - 6 * day,
  },
  {
    id: 'gn-12',
    type: 'topic',
    label: 'CI/CD Pipeline',
    metadata: { mentionCount: 8 },
    createdAt: now - 4 * day,
  },
  {
    id: 'gn-13',
    type: 'decision',
    label: 'Use cursor-based pagination',
    metadata: { confidence: 0.95 },
    createdAt: now - 4 * day,
  },
  {
    id: 'gn-14',
    type: 'decision',
    label: 'Switch to Instrument Sans font',
    metadata: { confidence: 0.88 },
    createdAt: now - 5 * hour,
  },
  {
    id: 'gn-15',
    type: 'action',
    label: 'Prepare quarterly demo slides',
    metadata: { assignee: 'Team', dueDate: now + 5 * day },
    createdAt: now - 2 * hour,
  },
]

const graphEdges: GraphEdge[] = [
  { id: 'ge-1', source: 'gn-1', target: 'gn-6', type: 'references', weight: 0.9, metadata: {} },
  { id: 'ge-2', source: 'gn-1', target: 'gn-7', type: 'references', weight: 0.8, metadata: {} },
  { id: 'ge-3', source: 'gn-1', target: 'gn-12', type: 'references', weight: 0.85, metadata: {} },
  { id: 'ge-4', source: 'gn-2', target: 'gn-11', type: 'references', weight: 0.95, metadata: {} },
  { id: 'ge-5', source: 'gn-2', target: 'gn-14', type: 'implements', weight: 0.9, metadata: {} },
  { id: 'ge-6', source: 'gn-3', target: 'gn-10', type: 'references', weight: 0.7, metadata: {} },
  { id: 'ge-7', source: 'gn-4', target: 'gn-6', type: 'references', weight: 0.85, metadata: {} },
  { id: 'ge-8', source: 'gn-5', target: 'gn-1', type: 'follows', weight: 0.6, metadata: {} },
  { id: 'ge-9', source: 'gn-9', target: 'gn-13', type: 'implements', weight: 0.92, metadata: {} },
  { id: 'ge-10', source: 'gn-8', target: 'gn-10', type: 'references', weight: 0.88, metadata: {} },
  { id: 'ge-11', source: 'gn-10', target: 'gn-13', type: 'supports', weight: 0.95, metadata: {} },
  { id: 'ge-12', source: 'gn-11', target: 'gn-14', type: 'supports', weight: 0.85, metadata: {} },
  { id: 'ge-13', source: 'gn-3', target: 'gn-9', type: 'references', weight: 0.7, metadata: {} },
  { id: 'ge-14', source: 'gn-7', target: 'gn-11', type: 'references', weight: 0.92, metadata: {} },
  { id: 'ge-15', source: 'gn-1', target: 'gn-15', type: 'implements', weight: 0.8, metadata: {} },
  { id: 'ge-16', source: 'gn-5', target: 'gn-3', type: 'follows', weight: 0.5, metadata: {} },
  { id: 'ge-17', source: 'gn-12', target: 'gn-10', type: 'supports', weight: 0.6, metadata: {} },
  { id: 'ge-18', source: 'gn-6', target: 'gn-8', type: 'references', weight: 0.65, metadata: {} },
]

export const MOCK_GRAPH: GraphData = { nodes: graphNodes, edges: graphEdges }

// ============================================================================
// Contradictions
// ============================================================================

export const MOCK_CONTRADICTIONS: Contradiction[] = [
  {
    id: 'contra-1',
    type: 'contradicts',
    meeting1: MOCK_MEETINGS[0]
      ? { id: MOCK_MEETINGS[0].id, title: MOCK_MEETINGS[0].title ?? 'Untitled' }
      : null,
    meeting2: MOCK_MEETINGS[4]
      ? { id: MOCK_MEETINGS[4].id, title: MOCK_MEETINGS[4].title ?? 'Untitled' }
      : null,
    statement1: 'The API v2 migration will be completed by end of Sprint 24.',
    statement2: 'We agreed to delay the API v2 migration until Q2 to focus on stability.',
    confidence: 0.82,
    detectedAt: now - 1 * day,
  },
  {
    id: 'contra-2',
    type: 'supersedes',
    meeting1: MOCK_MEETINGS[1]
      ? { id: MOCK_MEETINGS[1].id, title: MOCK_MEETINGS[1].title ?? 'Untitled' }
      : null,
    meeting2: MOCK_MEETINGS[8]
      ? { id: MOCK_MEETINGS[8].id, title: MOCK_MEETINGS[8].title ?? 'Untitled' }
      : null,
    statement1: 'We will use Instrument Sans for the new design system typography.',
    statement2: 'Inter was chosen as the primary font for all UI components.',
    confidence: 0.91,
    detectedAt: now - 5 * hour,
  },
]

// ============================================================================
// Weekly Digest
// ============================================================================

export const MOCK_WEEKLY_DIGEST: WeeklyDigest = {
  id: 'digest-weekly-001',
  startDate: now - 7 * day,
  endDate: now,
  generatedAt: now - 1 * hour,
  summary: {
    totalMeetings: 8,
    totalHours: 12.5,
    uniqueParticipants: 6,
  },
  keyDecisions: [
    {
      text: 'Adopt cursor-based pagination for API v2 endpoints',
      meetingId: 'meet-001',
      meetingTitle: 'Product Standup — Sprint 24',
      meetingDate: now - 2 * day,
      sourceContext:
        '"Let\'s go with cursor-based pagination — it handles real-time inserts better than offset and the client SDK already supports it." — Piyush Kumar',
      timestamp: now - 2 * hour,
      confidence: 0.95,
    },
    {
      text: 'Switch typography from Inter to Instrument Sans',
      meetingId: 'meet-002',
      meetingTitle: 'Design Systems Deep Dive',
      meetingDate: now - 3 * day,
      sourceContext:
        '"After comparing Inter, Geist, and Instrument Sans side by side, Instrument Sans wins on the x-height and tabular figures. Let\'s ship it." — Sarah Chen',
      timestamp: now - 5 * hour,
      confidence: 0.88,
    },
    {
      text: 'Implement user-defined entity dictionary instead of NER fine-tuning',
      meetingId: 'meet-003',
      meetingTitle: 'AI Feature Brainstorm',
      meetingDate: now - 4 * day,
      sourceContext:
        '"Fine-tuning NER models takes weeks and the results are brittle. A user-managed dictionary gives instant control and zero training cost." — Maya Patel',
      timestamp: now - 7 * hour,
      confidence: 0.92,
    },
    {
      text: 'Pin CI/CD pipeline to Node.js 20 LTS',
      meetingId: 'meet-005',
      meetingTitle: 'Sprint 23 Retrospective',
      meetingDate: now - 5 * day,
      sourceContext:
        '"We had three CI failures this week from Node 21 breaking changes. Let\'s pin to 20 LTS and revisit in Q2." — Alex Rivera',
      timestamp: now - 2 * hour,
      confidence: 0.97,
    },
  ],
  actionItems: {
    open: 3,
    completed: 2,
    overdue: 1,
    items: [
      {
        text: 'Prepare quarterly demo slides',
        meetingId: 'meet-001',
        meetingTitle: 'Product Standup — Sprint 24',
        meetingDate: now - 2 * day,
        sourceContext:
          '"Piyush, can you put together the Q1 demo deck by Friday? Include the new digest feature and the API v2 progress metrics." — David Thompson',
        assignee: 'Piyush Kumar',
        dueDate: now + 5 * day,
        status: 'open',
      },
      {
        text: 'Complete Badge and Tooltip component migration',
        meetingId: 'meet-002',
        meetingTitle: 'Design Systems Deep Dive',
        meetingDate: now - 3 * day,
        sourceContext:
          '"The Badge and Tooltip components are still using the old design tokens. Sarah, can you migrate those to the new Sovereign system this sprint?" — Piyush Kumar',
        assignee: 'Sarah Chen',
        dueDate: now + 2 * day,
        status: 'open',
      },
      {
        text: 'Merge cursor pagination PR',
        meetingId: 'meet-003',
        meetingTitle: 'AI Feature Brainstorm',
        meetingDate: now - 4 * day,
        sourceContext:
          '"Maya\'s PR for cursor pagination has been in review for 3 days. The API v2 launch is blocked on this — let\'s prioritize the review." — Alex Rivera',
        assignee: 'Maya Patel',
        dueDate: now + 1 * day,
        status: 'open',
      },
      {
        text: 'Tree-shake Framer Motion unused modules',
        meetingId: 'meet-005',
        meetingTitle: 'Sprint 23 Retrospective',
        meetingDate: now - 5 * day,
        sourceContext:
          '"Framer Motion is adding 47KB to the bundle and we only use 3 of its modules. Alex, can you tree-shake or switch to CSS animations?" — Piyush Kumar',
        assignee: 'Alex Rivera',
        dueDate: now - 1 * day,
        status: 'overdue',
      },
      {
        text: 'Deploy API v2 to staging',
        meetingId: 'meet-009',
        meetingTitle: 'API v2 Architecture Review',
        meetingDate: now - 6 * day,
        sourceContext:
          '"Staging deployment for v2 is ready — just needs the final smoke test and a signoff from Alex. Let\'s target EOD tomorrow." — Jordan Lee',
        assignee: 'Alex Rivera',
        dueDate: now - 2 * day,
        status: 'completed',
      },
      {
        text: 'Pin Node.js version in CI config',
        meetingId: 'meet-004',
        meetingTitle: 'Client Onboarding — Acme Corp',
        meetingDate: now - 3 * day,
        sourceContext:
          '"The CI keeps pulling the latest Node which broke the onboarding flow twice. Piyush, let\'s lock it to 20.11.1 in the Docker image." — Raj Mehta',
        assignee: 'Piyush Kumar',
        dueDate: now - 1 * day,
        status: 'completed',
      },
    ],
  },
  contradictions: MOCK_CONTRADICTIONS,
  entityAggregation: {
    topPeople: [
      {
        name: 'Piyush Kumar',
        meetingCount: 8,
        meetingTitles: ['Product Standup', 'Sprint 23 Retrospective', 'AI Feature Brainstorm'],
      },
      {
        name: 'Sarah Chen',
        meetingCount: 6,
        meetingTitles: ['Design Systems Deep Dive', 'Product Standup', 'Sprint 23 Retrospective'],
      },
      {
        name: 'Alex Rivera',
        meetingCount: 5,
        meetingTitles: ['Product Standup', 'API Architecture Review'],
      },
      {
        name: 'Maya Patel',
        meetingCount: 4,
        meetingTitles: ['Sprint 23 Retrospective', 'AI Feature Brainstorm'],
      },
      {
        name: 'David Thompson',
        meetingCount: 3,
        meetingTitles: ['Client Onboarding', 'Product Standup'],
      },
      {
        name: 'Jordan Lee',
        meetingCount: 2,
        meetingTitles: ['API Architecture Review', 'Sprint 23 Retrospective'],
      },
      { name: 'Raj Mehta', meetingCount: 2, meetingTitles: ['Client Onboarding'] },
      { name: 'Emma Wilson', meetingCount: 1, meetingTitles: ['Design Systems Deep Dive'] },
    ],
    topTopics: [
      {
        topic: 'API v2 Migration',
        mentionCount: 24,
        meetingTitles: ['Product Standup', 'API Architecture Review', 'Sprint 23 Retrospective'],
      },
      {
        topic: 'Design Systems',
        mentionCount: 18,
        meetingTitles: ['Design Systems Deep Dive', 'Sprint 23 Retrospective'],
      },
      {
        topic: 'CI/CD Pipeline',
        mentionCount: 12,
        meetingTitles: ['Product Standup', 'Sprint 23 Retrospective'],
      },
      {
        topic: 'Bundle Optimization',
        mentionCount: 9,
        meetingTitles: ['Product Standup', 'Performance Review'],
      },
      { topic: 'Entity Detection', mentionCount: 7, meetingTitles: ['AI Feature Brainstorm'] },
      {
        topic: 'CRDT Sync',
        mentionCount: 6,
        meetingTitles: ['AI Feature Brainstorm', 'Sprint 23 Retrospective'],
      },
      {
        topic: 'Quarterly OKRs',
        mentionCount: 5,
        meetingTitles: ['Product Standup', 'Client Onboarding'],
      },
      { topic: 'Speaker Diarization', mentionCount: 4, meetingTitles: ['AI Feature Brainstorm'] },
      { topic: 'Mobile App Kickoff', mentionCount: 3, meetingTitles: ['Product Standup'] },
    ],
  },
}

// ============================================================================
// Settings
// ============================================================================

export const MOCK_SETTINGS: AppSettings = {
  preferredAudioDevice: null,
  audioFallbackEnabled: true,
  vadThreshold: 0.3,
  hardwareTier: 'high',
  forceWhisperTurbo: false,
  useCloudTranscription: false,
  cloudTranscriptionUsage: 4.2,
  llmEngine: 'local',
  llmIdleTimeout: 300,
  maxTokensPerExpansion: 512,
  keepAudioFiles: true,
  maxDiskUsage: 10,
  autoDeleteOldMeetings: false,
  autoDeleteAfterDays: 90,
  syncEnabled: true,
  syncInterval: 30,
  encryptionEnabled: true,
  theme: 'dark',
  language: 'en',
  showSmartChips: true,
  autoExpandNotes: true,
  phiDetectionEnabled: true,
  maskPHIBeforeSync: true,
  auditLoggingEnabled: true,
  onboarding_completed: true,
}

// ============================================================================
// Quota
// ============================================================================

export const MOCK_QUOTA = {
  used: 42,
  limit: 100,
  remaining: 58,
  resetsAt: new Date(now + 20 * day).toISOString(),
  exhausted: false,
  tier: 'pro',
}

// ============================================================================
// User
// ============================================================================

export const MOCK_USER = {
  id: 'usr-mock-001',
  email: 'piyush@bluearkive.com',
  tier: 'pro',
}

// ============================================================================
// Devices
// ============================================================================

export const MOCK_DEVICES = [
  {
    device_id: 'dev-macbook-001',
    device_name: 'MacBook Pro M2',
    hostname: 'Piyushs-MacBook-Pro',
    platform: 'darwin-arm64',
    app_version: '0.3.3',
    is_active: 1,
    last_active_at: new Date(now - 5 * 60000).toISOString(),
  },
  {
    device_id: 'dev-iphone-001',
    device_name: 'iPhone 15 Pro',
    hostname: 'Piyushs-iPhone',
    platform: 'ios',
    app_version: '0.3.3',
    is_active: 1,
    last_active_at: new Date(now - 2 * hour).toISOString(),
  },
]

export const MOCK_CURRENT_DEVICE = {
  deviceId: 'dev-macbook-001',
  deviceName: 'MacBook Pro M2',
  platform: 'darwin-arm64',
  hostname: 'Piyushs-MacBook-Pro',
  appVersion: '0.3.3',
}

// ============================================================================
// Sync Status
// ============================================================================

export const MOCK_SYNC_STATUS: SyncStatus = {
  isOnline: true,
  isSyncing: false,
  queuedEvents: 0,
  lastSyncTime: now - 5 * 60000,
  lastSyncError: null,
}

// ============================================================================
// Hardware & Engine
// ============================================================================

export const MOCK_HARDWARE_TIER: HardwareTierInfo = {
  tier: 'high',
  totalRAM: 16,
  availableRAM: 10,
  asrEngine: 'whisper-turbo',
  llmModel: 'qwen2.5:3b',
  llmMaxTokens: 4096,
  totalRAMBudget: '6 GB',
  canRunConcurrent: true,
}

export const MOCK_ENGINE_STATUS: InferenceEngineStatus = {
  engine: 'local',
  tokensPerSecond: 42,
  models: [
    {
      name: 'whisper-turbo',
      isLoaded: true,
      ramUsage: 1.5,
      lastUsed: now - 30000,
      autoUnloadIn: 270,
    },
    { name: 'qwen2.5:3b', isLoaded: true, ramUsage: 2.8, lastUsed: now - 60000, autoUnloadIn: 240 },
  ],
}

// ============================================================================
// Billing Config
// ============================================================================

export const MOCK_BILLING_CONFIG = {
  billingUrl: 'https://billing-web-azure.vercel.app',
  functionsUrl: 'https://api.bluearkive.com',
  appName: 'BlueArkive',
  tiers: [
    {
      id: 'free',
      name: 'Sovereign Local',
      price: '$0',
      period: 'forever',
      features: ['1 Device', 'Local Processing', 'Basic Transcription'],
    },
    {
      id: 'starter',
      name: 'Enhanced Sync',
      price: '$9',
      yearlyPrice: '$7',
      period: 'month',
      features: ['2 Devices', 'Cloud Sync', '50 AI Queries/mo'],
    },
    {
      id: 'pro',
      name: 'Limitless Memory',
      price: '$19',
      yearlyPrice: '$15',
      period: 'month',
      features: ['Unlimited Devices', 'Unlimited AI', 'Speaker Diarization', 'Weekly Digests'],
    },
  ],
}

// ============================================================================
// Audit Logs
// ============================================================================

export const MOCK_AUDIT_LOGS = [
  {
    id: 'aud-1',
    timestamp: new Date(now - 10 * 60000).toISOString(),
    operation: 'create_meeting',
    table: 'meetings',
    recordId: 'meet-001',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-2',
    timestamp: new Date(now - 30 * 60000).toISOString(),
    operation: 'update_note',
    table: 'notes',
    recordId: 'note-meet-001-0',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-3',
    timestamp: new Date(now - 1 * hour).toISOString(),
    operation: 'create_transcript',
    table: 'transcripts',
    recordId: 'txn-meet-001-000',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-4',
    timestamp: new Date(now - 2 * hour).toISOString(),
    operation: 'login',
    table: 'auth',
    recordId: 'usr-mock-001',
    ipAddress: '203.0.113.1',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-5',
    timestamp: new Date(now - 3 * hour).toISOString(),
    operation: 'update_settings',
    table: 'settings',
    recordId: 'settings-global',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-6',
    timestamp: new Date(now - 5 * hour).toISOString(),
    operation: 'create_meeting',
    table: 'meetings',
    recordId: 'meet-002',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-7',
    timestamp: new Date(now - 6 * hour).toISOString(),
    operation: 'delete_transcript',
    table: 'transcripts',
    recordId: 'txn-old-001',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-8',
    timestamp: new Date(now - 8 * hour).toISOString(),
    operation: 'create_entity',
    table: 'entities',
    recordId: 'ent-meet-002-0',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-9',
    timestamp: new Date(now - 1 * day).toISOString(),
    operation: 'register_device',
    table: 'devices',
    recordId: 'dev-iphone-001',
    ipAddress: '10.0.0.5',
    userAgent: 'BlueArkive/0.3.3 iOS',
  },
  {
    id: 'aud-10',
    timestamp: new Date(now - 1 * day - 2 * hour).toISOString(),
    operation: 'create_meeting',
    table: 'meetings',
    recordId: 'meet-004',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-11',
    timestamp: new Date(now - 1 * day - 4 * hour).toISOString(),
    operation: 'update_note',
    table: 'notes',
    recordId: 'note-meet-004-1',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-12',
    timestamp: new Date(now - 2 * day).toISOString(),
    operation: 'create_meeting',
    table: 'meetings',
    recordId: 'meet-008',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-13',
    timestamp: new Date(now - 3 * day).toISOString(),
    operation: 'rename_meeting',
    table: 'meetings',
    recordId: 'meet-009',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-14',
    timestamp: new Date(now - 4 * day).toISOString(),
    operation: 'login',
    table: 'auth',
    recordId: 'usr-mock-001',
    ipAddress: '203.0.113.50',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
  {
    id: 'aud-15',
    timestamp: new Date(now - 5 * day).toISOString(),
    operation: 'deactivate_device',
    table: 'devices',
    recordId: 'dev-old-laptop',
    ipAddress: '192.168.1.42',
    userAgent: 'BlueArkive/0.3.3 macOS',
  },
]

// ============================================================================
// Search Results (for CommandPalette, GlobalContextBar)
// ============================================================================

export const MOCK_SEARCH_RESPONSE: SearchResponse = {
  transcripts: [
    {
      transcript: MOCK_TRANSCRIPTS['meet-001']![0]!,
      meeting: MOCK_MEETINGS[0]!,
      rank: 1,
      snippet: "...let's get started with today's agenda. I have updates from the frontend team...",
    },
    {
      transcript: MOCK_TRANSCRIPTS['meet-002']![3]!,
      meeting: MOCK_MEETINGS[1]!,
      rank: 2,
      snippet: '...design system review. The glassmorphism effects are stunning...',
    },
  ],
  notes: [
    {
      note: MOCK_NOTES['meet-001']![0]!,
      meeting: MOCK_MEETINGS[0]!,
      rank: 1,
      snippet: '...CI pipeline was broken — Node version mismatch...',
    },
  ],
  totalResults: 3,
  queryTime: 45,
}

export const MOCK_SEMANTIC_RESULTS: SemanticSearchResult[] = [
  {
    meeting: MOCK_MEETINGS[0]!,
    relevance: 0.94,
    snippet: 'Discussed CI/CD pipeline issues and component library migration progress.',
    entities: (MOCK_ENTITIES['meet-001'] || []).slice(0, 3),
  },
  {
    meeting: MOCK_MEETINGS[1]!,
    relevance: 0.87,
    snippet: 'Deep dive into Sovereign UI design system, typography, and color palette decisions.',
    entities: (MOCK_ENTITIES['meet-002'] || []).slice(0, 3),
  },
  {
    meeting: MOCK_MEETINGS[2]!,
    relevance: 0.81,
    snippet:
      'Brainstormed AI feature improvements including entity detection and coaching intensity.',
    entities: (MOCK_ENTITIES['meet-003'] || []).slice(0, 3),
  },
]

// ============================================================================
// Audio Status (for mocking audio capture state)
// ============================================================================

export const MOCK_AUDIO_STATUS: AudioCaptureStatus = {
  isCapturing: false,
  meetingId: null,
  deviceId: null,
  deviceKind: null,
  sampleRate: 16000,
  channelCount: 1,
  bufferSize: 4096,
  duration: 0,
  chunksReceived: 0,
}

// ============================================================================
// Post-Meeting Digest (per meeting, for PostMeetingDigest component)
// ============================================================================

export const MOCK_POST_MEETING_DIGESTS: Record<string, object> = {}
for (const m of MOCK_MEETINGS) {
  const notes = MOCK_NOTES[m.id] || []
  const entities = MOCK_ENTITIES[m.id] || []
  MOCK_POST_MEETING_DIGESTS[m.id] = {
    id: `pmd-${m.id}`,
    meetingId: m.id,
    startDate: m.start_time,
    endDate: m.end_time || m.start_time + (m.duration || 3600) * 1000,
    generatedAt: (m.end_time || m.start_time) + 30000,
    summary: {
      totalMeetings: 1,
      totalHours: (m.duration || 3600) / 3600,
      uniqueParticipants: m.participant_count || 2,
    },
    keyDecisions: notes.slice(0, 2).map(n => ({
      text: n.original_text,
      meetingId: m.id,
      timestamp: n.timestamp,
      confidence: 0.9,
    })),
    actionItems: {
      open: 2,
      completed: 1,
      overdue: 0,
      items: notes.slice(0, 3).map((n, i) => ({
        text: n.original_text,
        meetingId: m.id,
        assignee: SPEAKERS[i % SPEAKERS.length]!.name,
        dueDate: now + (i + 1) * day,
        status: i === 2 ? ('completed' as const) : ('open' as const),
      })),
    },
    contradictions: [],
    entityAggregation: {
      topPeople: entities
        .filter(e => e.type === 'PERSON')
        .slice(0, 3)
        .map(e => ({ name: e.text, meetingCount: 1 })),
      topTopics: entities
        .filter(e => e.type === 'TOPIC')
        .slice(0, 3)
        .map(e => ({ topic: e.text, mentionCount: Math.floor(Math.random() * 5) + 2 })),
    },
  }
}
