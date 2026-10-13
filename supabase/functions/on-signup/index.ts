// on-signup Edge Function
// Triggered when a new user signs up via Supabase Auth
// Creates a PiyAPI account with "managed" plan and stores credentials

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { provisionPiyAPIAccount, errorResponse, jsonResponse } from '../_shared/piyapi.ts'

interface WebhookPayload {
  type: 'INSERT'
  table: 'users'
  schema: 'auth'
  record: {
    id: string
    email: string
    created_at: string
  }
}

serve(async (req: Request) => {
  try {
    // Verify this is a POST from Supabase webhook
    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405)
    }

    // Fail closed: without a configured secret anyone could call this endpoint
    // and re-point another user's PiyAPI credentials at a fresh empty account.
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('WEBHOOK_SECRET is not configured — refusing request')
      return errorResponse('Webhook not configured', 503)
    }
    const headerSecret = req.headers.get('x-webhook-secret') || ''
    if (!timingSafeEqual(headerSecret, webhookSecret)) {
      console.error('Unauthorized webhook attempt')
      return errorResponse('Unauthorized signature', 401)
    }

    let payload: WebhookPayload
    try {
      payload = (await req.json()) as WebhookPayload
    } catch {
      return errorResponse('Invalid JSON payload', 400)
    }

    if (!payload.record?.id || !payload.record?.email) {
      return errorResponse('Invalid webhook payload')
    }

    const { id: userId } = payload.record

    // Idempotent: Supabase retries webhooks, and a second registration would
    // fail upstream (the managed email already exists) and must never replace
    // credentials that already work. The same routine runs lazily from the
    // proxy for a user whose webhook delivery was lost.
    let credentials
    try {
      credentials = await provisionPiyAPIAccount(userId)
    } catch (provisionErr) {
      console.error('PiyAPI provisioning failed:', provisionErr)
      return errorResponse('PiyAPI provisioning failed', 502)
    }

    console.log(`PiyAPI account ready for user ${userId}`)

    return jsonResponse({
      success: true,
      message: 'PiyAPI account ready',
      piyapi_user_id: credentials.piyapi_user_id,
    })
  } catch (err) {
    console.error('on-signup error:', err)
    return errorResponse('Internal error', 500)
  }
})

/** Constant-time string comparison (length is not secret). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
