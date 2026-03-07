// license-activate Edge Function
// Redeems a license key and upgrades user tier

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { verifyUser, getAdminClient, errorResponse, jsonResponse } from '../_shared/piyapi.ts'

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    const userId = await verifyUser(req)
    let key: string
    try {
      const body = await req.json()
      key = body.key
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    if (!key || typeof key !== 'string') {
      return errorResponse('Missing license key')
    }

    const admin = getAdminClient()

    // 1. Find the license key
    const { data: license, error: findErr } = await admin
      .from('license_keys')
      .select('*')
      .eq('key', key.trim())
      .single()

    if (findErr || !license) {
      return errorResponse('Invalid license key', 404)
    }

    if (license.redeemed_by) {
      return errorResponse('License key already redeemed', 409)
    }

    // 2. Redeem the key
    const { error: redeemErr } = await admin
      .from('license_keys')
      .update({
        redeemed_by: userId,
        redeemed_at: new Date().toISOString(),
      })
      .eq('key', key.trim())
      .is('redeemed_by', null) // Prevent race conditions

    if (redeemErr) {
      return errorResponse('Failed to redeem key', 500)
    }

    // 3. Upgrade user tier
    await admin
      .from('profiles')
      .update({
        tier: license.tier,
        billing_status: 'active',
      })
      .eq('id', userId)

    // 4. Log billing event
    await admin.from('billing_events').insert({
      user_id: userId,
      event_type: 'license_redeemed',
      provider: 'license',
      payload: { key: key.slice(0, 4) + '****', tier: license.tier },
    })

    return jsonResponse({
      success: true,
      tier: license.tier,
      message: `Upgraded to ${license.tier} plan`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    if (message.includes('Missing Authorization') || message.includes('Invalid or expired')) {
      return errorResponse(message, 401)
    }
    console.error('license-activate error:', err)
    return errorResponse('Internal error', 500)
  }
})
