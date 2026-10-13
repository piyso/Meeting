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
      const body = (await req.json()) as { key?: unknown }
      key = body.key as string
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    if (!key || typeof key !== 'string') {
      return errorResponse('Missing license key')
    }

    // Keys are stored upper-case; the desktop app upper-cases before sending.
    const normalizedKey = key.trim().toUpperCase()
    if (normalizedKey.length < 10 || normalizedKey.length > 128) {
      return errorResponse('Invalid license key', 404)
    }

    const admin = getAdminClient()

    // 1. Find the license key
    const { data: license, error: findErr } = await admin
      .from('license_keys')
      .select('*')
      .eq('key', normalizedKey)
      .maybeSingle()

    if (findErr) {
      console.error('license lookup failed:', findErr)
      return errorResponse('Internal error', 500)
    }
    if (!license) {
      return errorResponse('Invalid license key', 404)
    }

    if (license.redeemed_by && license.redeemed_by !== userId) {
      return errorResponse('License key already redeemed', 409)
    }

    // A license must never lower a tier the user already has.
    const TIER_RANK: Record<string, number> = {
      free: 0,
      starter: 1,
      pro: 2,
      team: 3,
      enterprise: 4,
    }
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('tier')
      .eq('id', userId)
      .maybeSingle()
    if (profileErr || !profile) {
      console.error('profile lookup failed:', profileErr)
      return errorResponse('Account not found', 404)
    }
    const currentRank = TIER_RANK[profile.tier as string] ?? 0
    const licenseRank = TIER_RANK[license.tier as string] ?? 0
    if (!license.redeemed_by && licenseRank < currentRank) {
      return errorResponse(
        `Your current plan (${profile.tier}) is already higher than this license (${license.tier})`,
        409
      )
    }

    // 2. Redeem the key. The redeemed_by IS NULL filter makes this atomic:
    //    of two concurrent requests only one gets a row back.
    if (!license.redeemed_by) {
      const { data: claimed, error: redeemErr } = await admin
        .from('license_keys')
        .update({
          redeemed_by: userId,
          redeemed_at: new Date().toISOString(),
        })
        .eq('key', normalizedKey)
        .is('redeemed_by', null)
        .select('key')

      if (redeemErr) {
        console.error('license redeem failed:', redeemErr)
        return errorResponse('Failed to redeem key', 500)
      }
      if (!claimed || claimed.length === 0) {
        return errorResponse('License key already redeemed', 409)
      }
    }

    // 3. Upgrade user tier. Re-running this for a key the same user already
    //    redeemed repairs a redemption whose tier update failed.
    if (licenseRank >= currentRank) {
      const { error: tierErr } = await admin
        .from('profiles')
        .update({
          tier: license.tier,
          billing_status: 'active',
        })
        .eq('id', userId)

      if (tierErr) {
        console.error('tier update after redemption failed:', tierErr)
        return errorResponse('License redeemed but upgrade failed — please retry', 500)
      }
    }

    // 4. Log billing event
    const { error: logErr } = await admin.from('billing_events').insert({
      user_id: userId,
      event_type: 'license_redeemed',
      provider: 'license',
      payload: { key: normalizedKey.slice(0, 4) + '****', tier: license.tier },
    })
    if (logErr) console.error('billing_events insert failed:', logErr)

    const effectiveTier = licenseRank >= currentRank ? license.tier : profile.tier
    return jsonResponse({
      success: true,
      tier: effectiveTier,
      message: `Upgraded to ${effectiveTier} plan`,
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
