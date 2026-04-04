/**
 * Feature Type Definitions — Action Items, Sentiment, Calendar, Webhooks
 *
 * Shared types importable by BOTH main process and renderer process.
 * This file MUST NOT contain runtime logic — only type definitions.
 *
 * Conventions:
 *   - All timestamps are epoch SECONDS (integer), matching SQLite strftime('%s','now')
 *   - JSON-serialized arrays stored as TEXT columns use `string` type here
 *   - IDs are UUIDv4 strings
 */

// ─── Action Items ────────────────────────────────────────────

/** Action item statuses (matches digest.handlers.ts parseActionStatus()) */
export type ActionItemStatus = 'open' | 'completed' | 'overdue'

/** Action item priorities (matches schema DEFAULT 'normal') */
export type ActionItemPriority = 'low' | 'normal' | 'high' | 'critical'

/** Source of action item extraction */
export type ActionItemSource = 'regex' | 'llm_local' | 'llm_cloud' | 'manual'

/** Action item as stored in the action_items table */
export interface ActionItem {
  id: string
  meeting_id: string
  text: string
  assignee: string | null
  /** Epoch seconds (NOT milliseconds). See digest.handlers.ts:397 */
  deadline: number | null
  priority: ActionItemPriority
  status: ActionItemStatus
  /** Epoch seconds */
  created_at: number
  /** Epoch seconds, null when not completed */
  completed_at: number | null
  /** Extraction source — how this action item was detected */
  source: ActionItemSource
}

/** Input for creating an action item */
export interface CreateActionItemInput {
  /** Optional — auto-generated if omitted */
  id?: string
  meeting_id: string
  text: string
  assignee?: string | null
  /** Epoch seconds */
  deadline?: number | null
  priority?: ActionItemPriority
  status?: ActionItemStatus
  source?: ActionItemSource
}

/** Input for updating an action item */
export interface UpdateActionItemInput {
  text?: string
  assignee?: string | null
  deadline?: number | null
  priority?: ActionItemPriority
  status?: ActionItemStatus
  completed_at?: number | null
}

/** Action item extraction result (from TranscriptService event) */
export interface ActionItemDetectedEvent {
  meetingId: string
  items: Array<{
    text: string
    type: string
    confidence: number
    startOffset: number
    endOffset: number
  }>
  timestamp: number
}

// ─── Sentiment Analysis ──────────────────────────────────────

/** Sentiment labels */
export type SentimentLabel = 'positive' | 'neutral' | 'negative'

/** Sentiment analysis source */
export type SentimentSource = 'heuristic' | 'llm_local' | 'llm_cloud'

/** Sentiment score as stored in the sentiment_scores table */
export interface SentimentScore {
  id: string
  meeting_id: string
  /** FK to transcripts.id (nullable for aggregate scores) */
  transcript_id: string | null
  /** Score range: -1.0 (very negative) to +1.0 (very positive) */
  score: number
  label: SentimentLabel
  /** 0.0 to 1.0 */
  confidence: number
  source: SentimentSource
  /** Speaker name from transcript (nullable) */
  speaker_name: string | null
  /** Epoch seconds — time position within the meeting */
  timestamp_sec: number
  /** Epoch seconds */
  created_at: number
}

/** Input for creating a sentiment score */
export interface CreateSentimentScoreInput {
  id?: string
  meeting_id: string
  transcript_id?: string | null
  score: number
  label: SentimentLabel
  confidence: number
  source: SentimentSource
  speaker_name?: string | null
  timestamp_sec: number
}

/** Meeting mood aggregate */
export interface MeetingMood {
  avgScore: number
  label: SentimentLabel
  confidence: number
  totalSegments: number
}

/** Real-time sentiment update event */
export interface SentimentUpdateEvent {
  meetingId: string
  score: number
  label: SentimentLabel
  confidence: number
  speakerName: string | null
}

// ─── Calendar Integration ────────────────────────────────────

/** Calendar providers */
export type CalendarProvider = 'apple' | 'google'

/** Calendar event as stored in the calendar_events table */
export interface CalendarEvent {
  id: string
  provider: CalendarProvider
  /** External ID from provider (e.g., Google Calendar event ID) */
  external_id: string
  title: string
  description: string | null
  location: string | null
  /** Epoch seconds */
  start_time: number
  /** Epoch seconds */
  end_time: number
  /** JSON-serialized string[] of attendee emails/names */
  attendees: string | null
  /** FK to meetings.id (nullable until linked) */
  meeting_id: string | null
  /** Organizer name or email */
  organizer: string | null
  is_all_day: number // SQLite boolean (0 or 1)
  /** Epoch seconds */
  created_at: number
  /** Epoch seconds */
  synced_at: number
}

/** Input for upserting a calendar event */
export interface UpsertCalendarEventInput {
  id?: string
  provider: CalendarProvider
  external_id: string
  title: string
  description?: string | null
  location?: string | null
  start_time: number
  end_time: number
  attendees?: string | null
  meeting_id?: string | null
  organizer?: string | null
  is_all_day?: number
}

/** Calendar event approaching notification */
export interface CalendarEventSoonEvent {
  event: CalendarEvent
  minutesUntil: number
}

// ─── Webhooks ────────────────────────────────────────────────

/** Supported webhook event types */
export type WebhookEventType =
  | 'meeting.started'
  | 'meeting.completed'
  | 'transcript.ready'
  | 'action_item.created'
  | 'action_item.completed'
  | 'digest.generated'
  | 'sentiment.alert'

/** Webhook as stored in the webhooks table */
export interface Webhook {
  id: string
  url: string
  /** JSON-serialized WebhookEventType[] */
  events: string
  /** HMAC-SHA256 signing secret */
  secret: string
  description: string | null
  is_active: number // SQLite boolean (0 or 1)
  /** Epoch seconds */
  created_at: number
  /** Epoch seconds */
  updated_at: number
}

/** Input for creating a webhook */
export interface CreateWebhookInput {
  id?: string
  url: string
  events: WebhookEventType[]
  description?: string | null
  /** Auto-generated if omitted */
  secret?: string
}

/** Input for updating a webhook */
export interface UpdateWebhookInput {
  url?: string
  events?: WebhookEventType[]
  description?: string | null
  is_active?: number
}

/** Webhook delivery status */
export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed' | 'dead'

/** Webhook delivery record as stored in the webhook_deliveries table */
export interface WebhookDelivery {
  id: string
  webhook_id: string
  event_type: WebhookEventType
  /** JSON-serialized payload that was sent */
  payload: string
  /** HTTP status code from the target server */
  status_code: number | null
  /** Response body (truncated to 1KB) */
  response_body: string | null
  status: WebhookDeliveryStatus
  retry_count: number
  /** Epoch seconds of next retry (null if no retry scheduled) */
  next_retry_at: number | null
  /** Epoch seconds */
  created_at: number
}

/** Input for creating a delivery record */
export interface CreateWebhookDeliveryInput {
  id?: string
  webhook_id: string
  event_type: WebhookEventType
  payload: string
}
