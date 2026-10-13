// billing-webhook Edge Function
// Receives payment webhooks (Razorpay, Lemon Squeezy) and updates user tier.
//
// Trust model:
//   - The HMAC signature proves the payload came from the provider.
//   - The *tier* is never taken from free text. For Lemon Squeezy it is derived
//     from the purchased variant ID (custom_data can be forged through the
//     checkout URL); for Razorpay it comes from the notes on the order that
//     create-checkout wrote server-side.
//   - Cancellations/expiries only downgrade the profile when they refer to the
//     subscription that granted the tier.
//   - Every delivery is recorded in webhook_events so replays are no-ops.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAdminClient, errorResponse, jsonResponse } from '../_shared/piyapi.ts'

type Provider = 'razorpay' | 'lemon'
type PaidTier = 'starter' | 'pro' | 'team' | 'enterprise'
type BillingStatus = 'active' | 'past_due' | 'cancelled' | 'paused'
type Json = Record<string, unknown>

const WEBHOOK_SECRETS: Record<Provider, string> = {
  razorpay: Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '',
  lemon: Deno.env.get('LEMON_WEBHOOK_SECRET') || '',
}

const PAID_TIERS: readonly PaidTier[] = ['starter', 'pro', 'team', 'enterprise']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lemon Squeezy variant ID → tier. Same env vars create-checkout uses. */
const LEMON_VARIANT_TIERS: Record<string, PaidTier> = (() => {
  const map: Record<string, PaidTier> = {}
  const add = (envKey: string, tier: PaidTier) => {
    const id = Deno.env.get(envKey)
    if (id) map[id] = tier
  }
  add('LEMON_STARTER_MONTHLY_VARIANT', 'starter')
  add('LEMON_STARTER_YEARLY_VARIANT', 'starter')
  add('LEMON_PRO_MONTHLY_VARIANT', 'pro')
  add('LEMON_PRO_YEARLY_VARIANT', 'pro')
  add('LEMON_TEAM_MONTHLY_VARIANT', 'team')
  add('LEMON_TEAM_YEARLY_VARIANT', 'team')
  return map
})()

/** What a webhook asks us to do to a profile. */
interface TierAction {
  userId: string
  /** New tier, or undefined to leave the tier untouched. */
  tier?: PaidTier | 'free'
  status: BillingStatus
  subscriptionId: string | null
  periodEnd: string | null
  /** True when the change must only apply to the subscription already on file. */
  requiresMatchingSubscription: boolean
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const body = await req.text()
    const providerParam = new URL(req.url).searchParams.get('provider') || 'razorpay'
    if (providerParam !== 'razorpay' && providerParam !== 'lemon') {
      return errorResponse(`Unknown provider: ${providerParam}`, 400)
    }
    const provider: Provider = providerParam

    // 1. Verify webhook signature
    const secret = WEBHOOK_SECRETS[provider]
    if (!secret) {
      console.error(`Webhook secret not configured for ${provider}`)
      return errorResponse('Webhook not configured', 503)
    }
    const signature =
      (provider === 'razorpay'
        ? req.headers.get('x-razorpay-signature')
        : req.headers.get('x-signature')) || ''

    if (!(await verifySignature(body, signature, secret))) {
      console.error('Invalid webhook signature')
      return errorResponse('Invalid signature', 401)
    }

    // 2. Parse event
    let event: Json
    try {
      event = JSON.parse(body) as Json
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }
    const eventType = String(
      event.event || event.type || (event.meta as Json | undefined)?.event_name || 'unknown'
    )

    const admin = getAdminClient()

    // 3. Idempotency — claim the delivery first; a duplicate key means another
    //    invocation has it (provider retry or replayed request).
    const eventId = req.headers.get('x-razorpay-event-id') || (await sha256Hex(body))
    const { error: dedupeErr } = await admin
      .from('webhook_events')
      .insert({ provider, event_id: eventId, event_type: eventType })
    if (dedupeErr) {
      if (dedupeErr.code !== '23505') {
        console.error('webhook_events insert failed:', dedupeErr)
        return errorResponse('Internal error', 500)
      }
      // Claimed before. "Claimed" is not "applied": if the earlier invocation
      // died between claiming and applying (timeout, crash), treating this
      // retry as a duplicate would lose the payment for good. Only a delivery
      // marked processed is a true duplicate.
      const claim = await readClaim(admin, provider, eventId)
      if (claim === 'processed' || claim === 'unknown') {
        return jsonResponse({ received: true, duplicate: true, event: eventType })
      }
      if (claim === 'in-progress') {
        // Still being handled — ask the provider to come back later.
        return errorResponse('Delivery is being processed', 409)
      }
      // 'stale': the earlier attempt never finished; take it over.
    }

    // 4. Work out what (if anything) this event changes
    const action =
      provider === 'lemon' ? lemonAction(eventType, event) : razorpayAction(eventType, event)

    if (!action) {
      // Signed and well-formed, but not an event we act on. Acknowledge so the
      // provider does not keep retrying.
      await markProcessed(admin, provider, eventId)
      return jsonResponse({ received: true, ignored: true, event: eventType })
    }

    try {
      // 5. Audit log (never blocks the tier update)
      const { error: logErr } = await admin.from('billing_events').insert({
        user_id: action.userId,
        event_type: eventType,
        provider,
        payload: event,
      })
      if (logErr) console.error('billing_events insert failed:', logErr)

      // 6. Apply
      const applied = await applyTierAction(admin, provider, action)
      await markProcessed(admin, provider, eventId)
      console.log(
        `billing-webhook ${eventType}: user=${action.userId} tier=${action.tier ?? '(unchanged)'} ` +
          `status=${action.status} applied=${applied}`
      )
      return jsonResponse({ received: true, event: eventType, applied })
    } catch (applyErr) {
      // Let the provider retry: forget the delivery so the retry is not
      // treated as a duplicate.
      await admin.from('webhook_events').delete().eq('provider', provider).eq('event_id', eventId)
      throw applyErr
    }
  } catch (err) {
    console.error('billing-webhook error:', err)
    return errorResponse('Internal error', 500)
  }
})

/** A claimed delivery older than this without a processed mark was abandoned. */
const STALE_CLAIM_MS = 2 * 60 * 1000

/**
 * State of a delivery that was claimed earlier.
 * 'unknown' = the processed_at column is not there yet (migration 003 not
 * applied); fall back to the old behaviour and treat the claim as final.
 */
async function readClaim(
  admin: ReturnType<typeof getAdminClient>,
  provider: Provider,
  eventId: string
): Promise<'processed' | 'in-progress' | 'stale' | 'unknown'> {
  const { data, error } = await admin
    .from('webhook_events')
    .select('received_at, processed_at')
    .eq('provider', provider)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error || !data) return 'unknown'
  if (data.processed_at) return 'processed'
  const age = Date.now() - Date.parse(data.received_at as string)
  return age > STALE_CLAIM_MS ? 'stale' : 'in-progress'
}

async function markProcessed(
  admin: ReturnType<typeof getAdminClient>,
  provider: Provider,
  eventId: string
): Promise<void> {
  const { error } = await admin
    .from('webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('provider', provider)
    .eq('event_id', eventId)
  // Before migration 003 the column does not exist; the claim row alone then
  // acts as the duplicate guard, as it did before.
  if (error) console.warn('webhook_events processed mark not stored:', error.message)
}

/**
 * Write the tier change. Throws on database errors so the provider retries.
 * Returns false when the change was deliberately skipped.
 */
async function applyTierAction(
  admin: ReturnType<typeof getAdminClient>,
  provider: Provider,
  action: TierAction
): Promise<boolean> {
  if (action.requiresMatchingSubscription) {
    const { data: profile, error } = await admin
      .from('profiles')
      .select('subscription_provider, subscription_id')
      .eq('id', action.userId)
      .maybeSingle()
    if (error) throw new Error(`profile lookup failed: ${error.message}`)
    if (!profile) return false
    const onFile = profile.subscription_id as string | null
    // No subscription on file: the tier came from a licence key or a manual
    // grant, and no subscription event may take that away.
    if (!onFile) return false
    // A cancel/expiry for some other subscription must not touch this profile.
    if (action.subscriptionId && onFile !== action.subscriptionId) return false
    if (onFile && profile.subscription_provider && profile.subscription_provider !== provider) {
      return false
    }
  }

  const update: Json = { billing_status: action.status }
  if (action.tier) update.tier = action.tier
  if (action.tier && action.tier !== 'free') {
    update.subscription_provider = provider
    update.subscription_id = action.subscriptionId
  }
  if (action.tier === 'free') {
    update.subscription_provider = null
    update.subscription_id = null
  }
  if (action.periodEnd) update.current_period_end = action.periodEnd

  const { data, error } = await admin
    .from('profiles')
    .update(update)
    .eq('id', action.userId)
    .select('id')
  if (error) throw new Error(`profile update failed: ${error.message}`)
  if (!data || data.length === 0) {
    console.error(`billing-webhook: no profile for user ${action.userId}`)
    return false
  }
  return true
}

// ─── Lemon Squeezy ──────────────────────────────────────────────

function lemonAction(eventType: string, event: Json): TierAction | null {
  const meta = (event.meta || {}) as Json
  const custom = (meta.custom_data || {}) as Record<string, string>
  const userId = validUserId(custom.user_id || custom.bluearkive_user_id)
  if (!userId) return null

  const data = (event.data || {}) as Json
  const attrs = (data.attributes || {}) as Json
  const firstItem = (attrs.first_order_item || {}) as Json
  const variantId = String(attrs.variant_id ?? firstItem.variant_id ?? '')
  const tier = LEMON_VARIANT_TIERS[variantId]
  const isSubscriptionEvent = eventType.startsWith('subscription_')
  // For subscription_* events data.id is the subscription; for order_* it is the order.
  const subscriptionId = isSubscriptionEvent ? String(data.id ?? '') || null : null
  const periodEnd = asIsoDate(attrs.renews_at) || asIsoDate(attrs.ends_at)

  const base = { userId, subscriptionId, periodEnd }

  switch (eventType) {
    case 'subscription_created':
    case 'subscription_resumed':
    case 'subscription_unpaused':
    case 'subscription_payment_success':
    case 'subscription_payment_recovered':
    case 'subscription_updated':
    case 'subscription_plan_changed': {
      const status = String(attrs.status || 'active')
      if (status === 'expired') {
        return { ...base, tier: 'free', status: 'cancelled', requiresMatchingSubscription: true }
      }
      if (status === 'cancelled') {
        // Cancelled but still inside the paid period — keep the tier.
        return { ...base, status: 'cancelled', requiresMatchingSubscription: true }
      }
      if (status === 'past_due' || status === 'unpaid') {
        return { ...base, status: 'past_due', requiresMatchingSubscription: true }
      }
      if (status === 'paused') {
        return { ...base, status: 'paused', requiresMatchingSubscription: true }
      }
      if (!tier) {
        console.error(`billing-webhook: unmapped Lemon variant ${variantId} — tier not granted`)
        return null
      }
      return { ...base, tier, status: 'active', requiresMatchingSubscription: false }
    }

    case 'subscription_cancelled':
      // Access continues until ends_at; subscription_expired does the downgrade.
      return { ...base, status: 'cancelled', requiresMatchingSubscription: true }

    case 'subscription_expired':
      return { ...base, tier: 'free', status: 'cancelled', requiresMatchingSubscription: true }

    case 'subscription_paused':
      return { ...base, status: 'paused', requiresMatchingSubscription: true }

    case 'subscription_payment_failed':
      return { ...base, status: 'past_due', requiresMatchingSubscription: true }

    case 'subscription_payment_refunded':
      return { ...base, tier: 'free', status: 'cancelled', requiresMatchingSubscription: true }

    // order_refunded is deliberately not acted on. Its only link to a profile
    // is custom_data.user_id, which anyone can set on a checkout link — so a
    // refunded order naming someone else's id used to downgrade that person.
    // Every plan here is a subscription, and refunding one also sends
    // subscription_payment_refunded, which is matched against the
    // subscription on file.

    default:
      // order_created is followed by subscription_created for subscription
      // products, which is the event that grants the tier.
      return null
  }
}

// ─── Razorpay ───────────────────────────────────────────────────

function razorpayAction(eventType: string, event: Json): TierAction | null {
  const payload = (event.payload || {}) as Json
  const order = entityOf(payload.order)
  const payment = entityOf(payload.payment)
  const subscription = entityOf(payload.subscription)

  // Notes written server-side by create-checkout live on the order (one-time
  // payments) or the subscription. Payment notes are client-supplied, so they
  // are only used to find the user, never to pick the tier.
  const trustedNotes = ((order?.notes || subscription?.notes || {}) as Record<string, string>) || {}
  const paymentNotes = ((payment?.notes || {}) as Record<string, string>) || {}

  const userId = validUserId(
    trustedNotes.user_id ||
      trustedNotes.bluearkive_user_id ||
      paymentNotes.user_id ||
      paymentNotes.bluearkive_user_id
  )
  if (!userId) return null

  const tier = validTier(trustedNotes.tier || trustedNotes.bluearkive_tier)
  const subscriptionId = subscription?.id ? String(subscription.id) : null
  const orderId = order?.id ? String(order.id) : null

  switch (eventType) {
    case 'order.paid': {
      if (!tier) {
        console.error('billing-webhook: order.paid without a tier in order notes')
        return null
      }
      const days = trustedNotes.interval === 'yearly' ? 365 : 30
      return {
        userId,
        tier,
        status: 'active',
        subscriptionId: orderId,
        periodEnd: new Date(Date.now() + days * 86_400_000).toISOString(),
        requiresMatchingSubscription: false,
      }
    }

    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed': {
      if (!tier) return null
      const currentEnd = Number(subscription?.current_end)
      return {
        userId,
        tier,
        status: 'active',
        subscriptionId,
        periodEnd: currentEnd > 0 ? new Date(currentEnd * 1000).toISOString() : null,
        requiresMatchingSubscription: false,
      }
    }

    case 'subscription.pending':
      return {
        userId,
        status: 'past_due',
        subscriptionId,
        periodEnd: null,
        requiresMatchingSubscription: true,
      }

    case 'subscription.halted':
    case 'subscription.paused':
      return {
        userId,
        tier: 'free',
        status: 'paused',
        subscriptionId,
        periodEnd: null,
        requiresMatchingSubscription: true,
      }

    case 'subscription.cancelled':
    case 'subscription.completed':
    case 'subscription.expired':
      return {
        userId,
        tier: 'free',
        status: 'cancelled',
        subscriptionId,
        periodEnd: null,
        requiresMatchingSubscription: true,
      }

    default:
      // payment.captured / payment.failed for an order are covered by
      // order.paid; a failed one-time payment changes nothing.
      return null
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function entityOf(wrapper: unknown): Json | null {
  const entity = (wrapper as Json | undefined)?.entity
  return entity && typeof entity === 'object' ? (entity as Json) : null
}

function validUserId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null
}

function validTier(value: unknown): PaidTier | null {
  return typeof value === 'string' && (PAID_TIERS as readonly string[]).includes(value)
    ? (value as PaidTier)
    : null
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verify webhook signature using HMAC-SHA256
 */
async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  const provided = signature.trim().toLowerCase()
  if (computed.length !== provided.length) return false
  let result = 0
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ provided.charCodeAt(i)
  }
  return result === 0
}
