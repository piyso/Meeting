// on-signup Edge Function
// Triggered when a new user signs up via Supabase Auth
// Creates a PiyAPI account with "managed" plan and stores credentials

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getAdminClient, errorResponse, jsonResponse } from '../_shared/piyapi.ts'

const PIYAPI_BASE_URL = Deno.env.get('PIYAPI_BASE_URL') || 'https://api.piyapi.cloud'

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

    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    const headerSecret = req.headers.get('x-webhook-secret')

    if (webhookSecret && headerSecret !== webhookSecret) {
      console.error('Unauthorized webhook attempt')
      return errorResponse('Unauthorized signature', 401)
    }

    let payload: WebhookPayload
    try {
      payload = await req.json()
    } catch {
      return errorResponse('Invalid JSON payload', 400)
    }

    if (!payload.record?.id || !payload.record?.email) {
      return errorResponse('Invalid webhook payload')
    }

    const { id: userId, email } = payload.record

    // Generate a secure password for the PiyAPI account
    // This is never shown to the user — managed internally
    const password = crypto.randomUUID() + crypto.randomUUID()

    // 1. Register PiyAPI account with "managed" plan
    const registerRes = await fetch(`${PIYAPI_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `ba_${userId}@managed.bluearkive.com`, // Unique email per user
        password,
        plan: 'managed',
      }),
    })

    if (!registerRes.ok) {
      const err = await registerRes.text()
      console.error('PiyAPI registration failed:', err)
      return errorResponse(`PiyAPI registration failed: ${registerRes.status}`, 502)
    }

    const registerData = await registerRes.json()

    // Extract tokens from PiyAPI response
    const accessToken = registerData.access_token || registerData.accessToken
    const refreshToken = registerData.refresh_token || registerData.refreshToken
    const piyapiUserId = registerData.user?.id || registerData.userId
    const expiresIn = registerData.expires_in || registerData.expiresIn || 900

    if (!accessToken || !refreshToken || !piyapiUserId) {
      console.error('Invalid PiyAPI registration response:', JSON.stringify(registerData))
      return errorResponse('Invalid PiyAPI registration response', 502)
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // 2. Store PiyAPI credentials in Supabase (service_role — bypasses RLS)
    const admin = getAdminClient()
    const { error: insertError } = await admin.from('piyapi_credentials').upsert({
      user_id: userId,
      piyapi_user_id: piyapiUserId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
    })

    if (insertError) {
      console.error('Failed to store PiyAPI credentials:', insertError)
      return errorResponse('Failed to store credentials', 500)
    }

    console.log(`PiyAPI account created for user ${userId} (email: ${email})`)

    return jsonResponse({
      success: true,
      message: 'PiyAPI account created',
      piyapi_user_id: piyapiUserId,
    })
  } catch (err) {
    console.error('on-signup error:', err)
    return errorResponse('Internal error', 500)
  }
})
