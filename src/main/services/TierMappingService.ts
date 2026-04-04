/**
 * TierMappingService — SINGLE SOURCE OF TRUTH for BlueArkive Pricing & Limits
 *
 * ══════════════════════════════════════════════════════════════════
 *  ALL prices, limits, and feature gates MUST import from here.
 *  DO NOT hardcode prices or limits anywhere else in BlueArkive.
 * ══════════════════════════════════════════════════════════════════
 *
 * BlueArkive pricing is SEPARATE from PiyAPI pricing:
 *   PiyAPI:      Starter $9,  Pro $29,     Team $79       (API platform)
 *   BlueArkive:  Starter $9,  Pro $19,     Team $15/user  (consumer app)
 *
 * Consumers:
 *   - CloudAccessManager: imports getTierConfig() for feature gating
 *   - SyncManager: imports getContentSizeLimit() for chunking
 *   - TranscriptChunker: imports getUpgradeMessage() for UI prompts
 *   - Billing IPC handler: imports BLUEARKIVE_TIERS for config response
 *   - UpgradePrompt/PricingView (via IPC): dynamic tier data
 */

import type { BlueArkiveTier, TierConfig, TierLimits } from '../../types/tiers'

// Re-export types for convenience
export type { BlueArkiveTier, TierConfig, TierLimits }

// ─── Tier Definitions ────────────────────────────────────────

export const BLUEARKIVE_TIERS: Record<BlueArkiveTier, TierConfig> = {
  free: {
    name: 'Free',
    price: '$0',
    priceINR: '₹0',
    period: '',
    features: [
      'Local transcription',
      'Local AI processing',
      '1 device',
      '5K character transcript limit',
    ],
    upgradeMessage: 'Upgrade to Starter ($9/mo) for cloud sync and 2x transcript limit',
    limits: {
      transcriptSize: 5_000,
      monthlyAIQueries: 0,
      deviceLimit: 1,
      cloudSync: false,
      cloudAI: false,
      speakerDiarization: false,
      knowledgeGraph: true,
      knowledgeGraphInteractive: false,
      hybridSearch: false,
      weeklyDigest: false,
      teamCollaboration: false,
      auditLogs: false,
      actionItems: true,
      sentimentAnalysis: true,
      calendarSync: false,
      calendarAutoLink: false,
      webhooks: false,
      webhookLimit: 0,
    },
  },

  starter: {
    name: 'Starter',
    price: '$9',
    priceINR: '₹749',
    period: '/mo',
    yearlyPrice: '$7',
    yearlyPriceINR: '₹599',
    features: [
      'Everything in Free',
      'Cloud Sync',
      '2 devices',
      '50 AI queries/mo',
      '15K character transcript limit',
      'Knowledge Graph',
    ],
    upgradeMessage: 'Upgrade to Pro ($19/mo) for unlimited AI and 2.5x transcript limit',
    limits: {
      transcriptSize: 15_000,
      monthlyAIQueries: 50,
      deviceLimit: 2,
      cloudSync: true,
      cloudAI: true,
      speakerDiarization: true,
      knowledgeGraph: true,
      knowledgeGraphInteractive: false,
      hybridSearch: false,
      weeklyDigest: true,
      teamCollaboration: false,
      auditLogs: false,
      actionItems: true,
      sentimentAnalysis: true,
      calendarSync: true,
      calendarAutoLink: false,
      webhooks: true,
      webhookLimit: 3,
    },
    razorpayPlanId: 'plan_starter_monthly',
    razorpayYearlyPlanId: 'plan_starter_yearly',
    lemonVariantId: 'variant_starter',
    lemonYearlyVariantId: 'variant_starter_yearly',
  },

  pro: {
    name: 'Pro',
    price: '$19',
    priceINR: '₹1,499',
    period: '/mo',
    yearlyPrice: '$15',
    yearlyPriceINR: '₹1,199',
    features: [
      'Everything in Starter',
      'Unlimited devices',
      'Unlimited AI queries',
      'Speaker Diarization',
      'Weekly Digest',
      '50K character transcript limit',
    ],
    upgradeMessage: 'Upgrade to Team ($15/user/mo) for collaboration and 2x transcript limit',
    limits: {
      transcriptSize: 50_000,
      monthlyAIQueries: -1, // unlimited
      deviceLimit: -1, // unlimited
      cloudSync: true,
      cloudAI: true,
      speakerDiarization: true,
      knowledgeGraph: true,
      knowledgeGraphInteractive: true,
      hybridSearch: true,
      weeklyDigest: true,
      teamCollaboration: false,
      auditLogs: false,
      actionItems: true,
      sentimentAnalysis: true,
      calendarSync: true,
      calendarAutoLink: true,
      webhooks: true,
      webhookLimit: 10,
    },
    razorpayPlanId: 'plan_pro_monthly',
    razorpayYearlyPlanId: 'plan_pro_yearly',
    lemonVariantId: 'variant_pro',
    lemonYearlyVariantId: 'variant_pro_yearly',
  },

  team: {
    name: 'Team',
    price: '$15',
    priceINR: '₹1,249',
    period: '/user/mo',
    yearlyPrice: '$12',
    yearlyPriceINR: '₹999',
    features: [
      'Everything in Pro',
      'Shared workspaces',
      'Admin controls',
      'Centralized billing',
      '100K character transcript limit',
    ],
    upgradeMessage: 'Upgrade to Enterprise for 100K transcript limit and audit logs',
    limits: {
      transcriptSize: 100_000,
      monthlyAIQueries: -1,
      deviceLimit: -1,
      cloudSync: true,
      cloudAI: true,
      speakerDiarization: true,
      knowledgeGraph: true,
      knowledgeGraphInteractive: true,
      hybridSearch: true,
      weeklyDigest: true,
      teamCollaboration: true,
      auditLogs: false,
      actionItems: true,
      sentimentAnalysis: true,
      calendarSync: true,
      calendarAutoLink: true,
      webhooks: true,
      webhookLimit: -1,
    },
    razorpayPlanId: 'plan_team_monthly',
    razorpayYearlyPlanId: 'plan_team_yearly',
    lemonVariantId: 'variant_team',
    lemonYearlyVariantId: 'variant_team_yearly',
  },

  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    priceINR: 'Custom',
    period: '',
    features: [
      'Everything in Team',
      'SSO / SAML',
      'HIPAA compliance',
      'Audit logs',
      'Custom SLA',
      '100K character transcript limit',
    ],
    upgradeMessage: '',
    limits: {
      transcriptSize: 100_000,
      monthlyAIQueries: -1,
      deviceLimit: -1,
      cloudSync: true,
      cloudAI: true,
      speakerDiarization: true,
      knowledgeGraph: true,
      knowledgeGraphInteractive: true,
      hybridSearch: true,
      weeklyDigest: true,
      teamCollaboration: true,
      auditLogs: true,
      actionItems: true,
      sentimentAnalysis: true,
      calendarSync: true,
      calendarAutoLink: true,
      webhooks: true,
      webhookLimit: -1,
    },
  },
}

// ─── Tier Hierarchy ──────────────────────────────────────────

/** Ordered tier hierarchy (lowest → highest) */
export const TIER_HIERARCHY: readonly BlueArkiveTier[] = [
  'free',
  'starter',
  'pro',
  'team',
  'enterprise',
] as const

// ─── Accessor Functions ──────────────────────────────────────

/**
 * Get tier configuration by name (safe — defaults to 'free')
 */
export function getTierConfig(tier: string): TierConfig {
  const normalized = tier.toLowerCase().trim() as BlueArkiveTier
  return BLUEARKIVE_TIERS[normalized] || BLUEARKIVE_TIERS.free
}

/**
 * Get tier limits by name (safe — defaults to free limits)
 */
export function getTierLimits(tier: string): TierLimits {
  return getTierConfig(tier).limits
}

/**
 * Get content size limit for a tier (for SyncManager chunking)
 */
export function getContentSizeLimit(tier: string): number {
  return getTierConfig(tier).limits.transcriptSize
}

/**
 * Get upgrade prompt message for the NEXT tier
 * Returns null if already at highest tier
 */
export function getUpgradeMessage(currentTier: string): string | null {
  const config = getTierConfig(currentTier)
  return config.upgradeMessage || null
}

/**
 * Check if a value represents "unlimited" (-1)
 */
export function isUnlimited(value: number): boolean {
  return value === -1
}

/**
 * Get display value for a limit (handles -1 → "Unlimited")
 */
export function formatLimit(value: number): string {
  if (value === -1) return 'Unlimited'
  if (value === 0) return 'None'
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
  return String(value)
}
