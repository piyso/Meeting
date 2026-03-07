// billing-webhook Edge Function
// Receives payment webhooks (Razorpay, Lemon) and updates user tier

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAdminClient, errorResponse, jsonResponse } from '../_shared/piyapi.ts'

const WEBHOOK_SECRETS: Record<string, string> = {
  razorpay: Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '',
  lemon: Deno.env.get('LEMON_WEBHOOK_SECRET') || '',
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const body = await req.text()
    const provider = new URL(req.url).searchParams.get('provider') || 'razorpay'

    // 1. Verify webhook signature
    const signature =
      req.headers.get('x-razorpay-signature') || req.headers.get('x-signature') || ''

    const secret = WEBHOOK_SECRETS[provider]
    if (!secret) {
      return errorResponse(`Unknown provider: ${provider}`, 400)
    }

    const isValid = await verifySignature(body, signature, secret)
    if (!isValid) {
      console.error('Invalid webhook signature')
      return errorResponse('Invalid signature', 401)
    }

    // 2. Parse event
    const event = JSON.parse(body)
    const eventType = event.event || event.type || event.meta?.event_name || 'unknown'
    const userId = extractUserId(event, provider)

    if (!userId) {
      console.error('Could not extract user ID from webhook:', eventType)
      return errorResponse('Missing user ID')
    }

    // 3. Determine new tier based on event
    const tierUpdate = determineTierUpdate(eventType, event, provider)

    const admin = getAdminClient()

    // 4. Log billing event
    await admin.from('billing_events').insert({
      user_id: userId,
      event_type: eventType,
      provider,
      payload: event,
    })

    // 5. Update user tier if applicable
    if (tierUpdate) {
      await admin
        .from('profiles')
        .update({
          tier: tierUpdate.tier,
          billing_status: tierUpdate.status,
        })
        .eq('id', userId)

      console.log(`Tier updated: ${userId} → ${tierUpdate.tier} (${tierUpdate.status})`)
    }

    return jsonResponse({ received: true, event: eventType })
  } catch (err) {
    console.error('billing-webhook error:', err)
    return errorResponse('Internal error', 500)
  }
})

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
  if (computed.length !== signature.length) return false
  let result = 0
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return result === 0
}

/**
 * Extract the BlueArkive user ID from a webhook payload
 */
function extractUserId(event: Record<string, unknown>, provider: string): string | null {
  if (provider === 'razorpay') {
    const notes = (event.payload as Record<string, unknown>)?.payment?.entity?.notes as Record<
      string,
      string
    >
    return notes?.bluearkive_user_id || null
  }
  if (provider === 'lemon') {
    const meta = event.meta as Record<string, unknown>
    const customData = meta?.custom_data as Record<string, string>
    return customData?.bluearkive_user_id || null
  }
  return null
}

/**
 * Determine tier and billing status from webhook event.
 * Reads the actual target tier from the payment metadata/notes
 * instead of hardcoding a static mapping.
 */
function determineTierUpdate(
  eventType: string,
  event: Record<string, unknown>,
  provider: string
): { tier: string; status: string } | null {
  // Cancellation/failure events always map to known states
  const staticMapping: Record<string, { tier: string; status: string }> = {
    subscription_cancelled: { tier: 'free', status: 'cancelled' },
    'subscription.cancelled': { tier: 'free', status: 'cancelled' },
    payment_failed: { tier: 'free', status: 'past_due' },
    'subscription.halted': { tier: 'free', status: 'paused' },
  }

  if (staticMapping[eventType]) return staticMapping[eventType]

  // For activation/update events, extract the actual tier from the payload
  const activationEvents = [
    'subscription_activated',
    'subscription.activated',
    'subscription_updated',
    'subscription.updated',
    'order_created',
  ]

  if (!activationEvents.includes(eventType)) return null

  // Extract tier from payment metadata
  let tier: string | null = null

  if (provider === 'razorpay') {
    const notes = (event.payload as Record<string, unknown>)?.payment?.entity?.notes as Record<
      string,
      string
    >
    tier = notes?.bluearkive_tier || notes?.tier || null
  }

  if (provider === 'lemon') {
    const meta = event.meta as Record<string, unknown>
    const customData = meta?.custom_data as Record<string, string>
    tier = customData?.bluearkive_tier || customData?.tier || null
  }

  // Fallback: try to infer from plan name in the event
  if (!tier) {
    const eventStr = JSON.stringify(event).toLowerCase()
    if (eventStr.includes('enterprise')) tier = 'enterprise'
    else if (eventStr.includes('team')) tier = 'team'
    else if (eventStr.includes('pro')) tier = 'pro'
    else if (eventStr.includes('starter')) tier = 'starter'
    else tier = 'starter' // Ultimate fallback
  }

  return { tier, status: 'active' }
}
