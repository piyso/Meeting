// PiyAPI Proxy Edge Function
// Unified proxy for all PiyAPI data operations (sync, search, ask, graph, context, kg)
// Authenticates via Supabase JWT, forwards to PiyAPI with user's own JWT
//
// URL PATTERNS SUPPORTED:
//   /piyapi-proxy?path=/memories          (query param style)
//   /piyapi-proxy/memories                (path segment style — used by PiyAPIBackend)
//   /piyapi-proxy/search/semantic         (nested path segments)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { piyapiFetch, verifyUser, errorResponse, getAdminClient } from '../_shared/piyapi.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    // 1. Verify Supabase JWT
    const userId = await verifyUser(req)

    // 2. Check user tier for feature gating
    const admin = getAdminClient()
    const { data: profile } = await admin.from('profiles').select('tier').eq('id', userId).single()

    const tier = profile?.tier || 'free'

    // 3. Extract PiyAPI path — support BOTH formats:
    //    ?path=/memories  OR  /piyapi-proxy/memories
    const url = new URL(req.url)
    let piyapiPath = url.searchParams.get('path')

    if (!piyapiPath) {
      // Extract from URL path: /piyapi-proxy/memories → /memories
      const pathParts = url.pathname.split('/piyapi-proxy')
      if (pathParts.length > 1 && pathParts[1]) {
        piyapiPath = pathParts[1]
      }
    }

    if (!piyapiPath || piyapiPath === '/') {
      return errorResponse('Missing PiyAPI path. Use ?path=/memories or append /memories to URL')
    }

    // Ensure leading slash
    if (!piyapiPath.startsWith('/')) {
      piyapiPath = '/' + piyapiPath
    }

    // 4. Tier-gate features
    const gateResult = checkTierAccess(tier, piyapiPath)
    if (!gateResult.allowed) {
      return errorResponse(gateResult.reason || 'Access denied', 403)
    }

    // 5. Forward query params to PiyAPI (except 'path')
    const forwardParams = new URLSearchParams()
    url.searchParams.forEach((value, key) => {
      if (key !== 'path') {
        forwardParams.set(key, value)
      }
    })
    const queryString = forwardParams.toString()
    const fullPiyapiPath = queryString
      ? `/api/v1${piyapiPath}?${queryString}`
      : `/api/v1${piyapiPath}`

    // 6. Forward body as a stream for non-GET methods
    const body = req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined

    // Forward original Content-Type and Accept headers if present
    const reqContentType = req.headers.get('Content-Type')
    const reqAccept = req.headers.get('Accept')
    const headers: Record<string, string> = {}
    if (reqContentType) {
      headers['Content-Type'] = reqContentType
    }
    if (reqAccept) {
      headers['Accept'] = reqAccept
    }

    const piyapiRes = await piyapiFetch(userId, fullPiyapiPath, {
      method: req.method,
      headers,
      body,
    })

    // 7. Stream PiyAPI response straight to client
    const responseHeaders = new Headers(piyapiRes.headers)
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(key, value)
    }

    return new Response(piyapiRes.body, {
      status: piyapiRes.status,
      headers: responseHeaders,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'

    if (message.includes('Missing Authorization') || message.includes('Invalid or expired')) {
      return errorResponse(message, 401)
    }
    if (message.includes('No PiyAPI credentials')) {
      return errorResponse('Account not provisioned. Please contact support.', 503)
    }
    if (message.includes('PiyAPI token refresh failed')) {
      return errorResponse('Session expired. Please sign in again.', 401)
    }

    console.error('proxy error:', err)
    return errorResponse('Internal error', 500)
  }
})

/**
 * Check if user's tier allows access to the requested PiyAPI endpoint
 */
function checkTierAccess(tier: string, path: string): { allowed: boolean; reason?: string } {
  // Free users: no cloud features
  if (tier === 'free') {
    return {
      allowed: false,
      reason: 'Cloud features require a Starter plan or above. Upgrade at bluearkive.com/billing',
    }
  }

  // Starter+: basic sync, search, ask, PHI, memories
  const starterPaths = ['/memories', '/search', '/ask', '/phi']
  const isStarterPath = starterPaths.some(p => path.startsWith(p))

  // Pro+: graph, context, kg
  const proPaths = ['/graph', '/context', '/kg']
  const isProPath = proPaths.some(p => path.startsWith(p))

  if (isStarterPath) {
    return { allowed: true }
  }

  if (isProPath) {
    const proTiers = ['pro', 'team', 'enterprise']
    if (proTiers.includes(tier)) {
      return { allowed: true }
    }
    return {
      allowed: false,
      reason: `${path.split('/')[1]} requires a Pro plan or above. Upgrade at bluearkive.com/billing`,
    }
  }

  // Allow unrecognized paths (forward to PiyAPI, let it handle)
  return { allowed: true }
}
