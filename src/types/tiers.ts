/**
 * BlueArkive Tier Type Definitions
 *
 * Shared types importable by BOTH main process and renderer process.
 * This file MUST NOT contain runtime logic — only type definitions.
 *
 * Runtime constants and helpers live in:
 *   src/main/services/TierMappingService.ts
 */

// ─── Canonical Tier Type ─────────────────────────────────────

/** BlueArkive subscription tiers — matches CloudAccessManager's PlanTier */
export type PiyNotesTier = 'free' | 'starter' | 'pro' | 'team' | 'enterprise'

// ─── Limit Definitions ───────────────────────────────────────

/** Feature limits per tier */
export interface TierLimits {
  /** Max characters per transcript */
  transcriptSize: number
  /** Monthly cloud AI queries (0 = none, -1 = unlimited) */
  monthlyAIQueries: number
  /** Max simultaneous devices (-1 = unlimited) */
  deviceLimit: number
  /** Cloud sync access */
  cloudSync: boolean
  /** Cloud AI access */
  cloudAI: boolean
  /** Speaker diarization */
  speakerDiarization: boolean
  /** Knowledge graph feature (read-only preview for Starter, full for Pro+) */
  knowledgeGraph: boolean
  /** Interactive knowledge graph (click, filter, traverse — Pro+ only) */
  knowledgeGraphInteractive: boolean
  /** Hybrid search (semantic + keyword — Pro+ only) */
  hybridSearch: boolean
  /** Weekly digest feature */
  weeklyDigest: boolean
  /** Team collaboration */
  teamCollaboration: boolean
  /** Audit logs */
  auditLogs: boolean
}

// ─── Tier Configuration ──────────────────────────────────────

/** Complete tier configuration */
export interface TierConfig {
  /** Display name */
  name: string
  /** USD price string (e.g. "$19") */
  price: string
  /** INR price string (e.g. "₹1,499") */
  priceINR: string
  /** Billing period (e.g. "/mo" or "/user/mo") */
  period: string
  /** USD yearly price string per month (e.g. "$15") */
  yearlyPrice?: string
  /** INR yearly price string per month (e.g. "₹1,199") */
  yearlyPriceINR?: string
  /** Feature bullets for UI display */
  features: string[]
  /** Upgrade call-to-action message */
  upgradeMessage: string
  /** Feature limits */
  limits: TierLimits
  /** Razorpay plan ID (if applicable) */
  razorpayPlanId?: string
  /** Razorpay yearly plan ID (if applicable) */
  razorpayYearlyPlanId?: string
  /** Lemon Squeezy variant ID (if applicable) */
  lemonVariantId?: string
  /** Lemon Squeezy yearly variant ID (if applicable) */
  lemonYearlyVariantId?: string
}

// ─── Billing Status ──────────────────────────────────────────

/** Billing/subscription status from PiyAPI */
export type BillingStatus = 'active' | 'past_due' | 'cancelled' | 'trial' | 'unknown'

/** Billing info returned by billing IPC calls */
export interface BillingInfo {
  status: BillingStatus
  tier: PiyNotesTier
  nextBillingDate?: string
}

/** Billing config returned by billing:getConfig */
export interface BillingConfig {
  billingUrl: string
  appName: string
  tiers: Array<{
    id: PiyNotesTier
    name: string
    price: string
    priceINR: string
    period: string
    yearlyPrice?: string
    yearlyPriceINR?: string
    features: string[]
  }>
}
