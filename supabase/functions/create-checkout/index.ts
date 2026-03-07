// create-checkout Edge Function
// Creates a payment checkout session for Razorpay (INR) or Lemon Squeezy (USD)
// Called from billing-web checkout.js

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { verifyUser, getAdminClient, errorResponse, jsonResponse } from '../_shared/piyapi.ts'

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || ''
const LEMON_SQUEEZY_API_KEY = Deno.env.get('LEMON_SQUEEZY_API_KEY') || ''
const LEMON_SQUEEZY_STORE_ID = Deno.env.get('LEMON_SQUEEZY_STORE_ID') || ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// Tier → pricing config
interface TierPricing {
  name: string
  razorpay: { monthly: number; yearly: number } // amounts in paise (INR × 100)
  lemon: { monthlyVariantId: string; yearlyVariantId: string }
}

const TIER_PRICING: Record<string, TierPricing> = {
  starter: {
    name: 'Starter',
    razorpay: { monthly: 74900, yearly: 718800 }, // ₹749/mo, ₹7,188/yr
    lemon: {
      monthlyVariantId: Deno.env.get('LEMON_STARTER_MONTHLY_VARIANT') || '',
      yearlyVariantId: Deno.env.get('LEMON_STARTER_YEARLY_VARIANT') || '',
    },
  },
  pro: {
    name: 'Pro',
    razorpay: { monthly: 149900, yearly: 1438800 }, // ₹1,499/mo, ₹14,388/yr
    lemon: {
      monthlyVariantId: Deno.env.get('LEMON_PRO_MONTHLY_VARIANT') || '',
      yearlyVariantId: Deno.env.get('LEMON_PRO_YEARLY_VARIANT') || '',
    },
  },
  team: {
    name: 'Team',
    razorpay: { monthly: 124900, yearly: 1198800 }, // ₹1,249/mo, ₹11,988/yr
    lemon: {
      monthlyVariantId: Deno.env.get('LEMON_TEAM_MONTHLY_VARIANT') || '',
      yearlyVariantId: Deno.env.get('LEMON_TEAM_YEARLY_VARIANT') || '',
    },
  },
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405)
  }

  try {
    // 1. Verify user
    const userId = await verifyUser(req)

    // 2. Parse body
    let body: { tierId: string; currency: string; billingInterval: string }
    try {
      body = (await req.json()) as { tierId: string; currency: string; billingInterval: string }
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    const { tierId, currency, billingInterval } = body
    if (!tierId || !currency) {
      return errorResponse('Missing tierId or currency', 400)
    }

    const tier = TIER_PRICING[tierId]
    if (!tier) {
      return errorResponse(`Unknown tier: ${tierId}`, 400)
    }

    const interval = billingInterval === 'yearly' ? 'yearly' : 'monthly'

    // 3. Get user email from profile
    const admin = getAdminClient()
    const { data: user } = await admin.auth.admin.getUserById(userId)
    const email = user?.user?.email || ''

    // 4. Create checkout based on currency
    if (currency === 'INR') {
      // Razorpay Order
      const amount = tier.razorpay[interval]

      const orderRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
        },
        body: JSON.stringify({
          amount,
          currency: 'INR',
          receipt: `ba_${userId}_${tierId}_${interval}`,
          notes: {
            user_id: userId,
            tier: tierId,
            interval,
          },
        }),
      })

      if (!orderRes.ok) {
        const err = await orderRes.text()
        console.error('Razorpay order creation failed:', err)
        return errorResponse('Failed to create payment order', 502)
      }

      const order = (await orderRes.json()) as { id: string; amount: number }

      return jsonResponse({
        provider: 'razorpay',
        data: {
          keyId: RAZORPAY_KEY_ID,
          orderId: order.id,
          amount: order.amount,
          tierName: tier.name,
        },
      })
    } else {
      // Lemon Squeezy Checkout
      const variantId = tier.lemon[`${interval}VariantId`]
      if (!variantId) {
        return errorResponse(`Lemon Squeezy variant not configured for ${tierId} ${interval}`, 500)
      }

      const checkoutRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/vnd.api+json',
          Authorization: `Bearer ${LEMON_SQUEEZY_API_KEY}`,
        },
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: {
                email,
                custom: {
                  user_id: userId,
                  tier: tierId,
                  interval,
                },
              },
            },
            relationships: {
              store: { data: { type: 'stores', id: LEMON_SQUEEZY_STORE_ID } },
              variant: { data: { type: 'variants', id: variantId } },
            },
          },
        }),
      })

      if (!checkoutRes.ok) {
        const err = await checkoutRes.text()
        console.error('Lemon Squeezy checkout creation failed:', err)
        return errorResponse('Failed to create checkout session', 502)
      }

      const checkoutData = (await checkoutRes.json()) as {
        data?: { attributes?: { url?: string } }
      }
      const checkoutUrl = checkoutData.data?.attributes?.url

      if (!checkoutUrl) {
        return errorResponse('No checkout URL returned', 502)
      }

      return jsonResponse({
        provider: 'lemonsqueezy',
        data: { checkoutUrl },
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    if (message.includes('Missing Authorization') || message.includes('Invalid or expired')) {
      return errorResponse(message, 401)
    }
    console.error('create-checkout error:', err)
    return errorResponse('Internal error', 500)
  }
})
