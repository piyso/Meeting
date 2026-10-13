// PiyAPI Proxy Edge Function
// Unified proxy for all PiyAPI data operations (sync, search, ask, graph, context, kg)
// Authenticates via Supabase JWT, forwards to PiyAPI with user's own JWT
//
// URL PATTERNS SUPPORTED:
//   /piyapi-proxy?path=/memories          (query param style)
//   /piyapi-proxy/memories                (path segment style — used by PiyAPIBackend)
//   /piyapi-proxy/search/semantic         (nested path segments)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  piyapiFetch,
  verifyUser,
  errorResponse,
  getAdminClient,
  resolveTier,
} from '../_shared/piyapi.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

/** Largest request body forwarded upstream (a 50-memory batch fits comfortably). */
const MAX_BODY_BYTES = 8 * 1024 * 1024

/**
 * The account keyring: wrapped copies of the key an account's synced data is
 * encrypted with (see KeyringService in the desktop app). It has to exist from
 * the first sign-in, whatever the plan — otherwise an account that starts on
 * the free plan and upgrades later has no password-wrapped key to give its
 * second device. It is one small document, so it is not a storage feature.
 */
const KEYRING_NAMESPACE = 'meetings.keyring'
const MAX_KEYRING_BYTES = 32 * 1024

/**
 * Endpoint allowlist. Anything not listed is rejected — in particular the
 * upstream /auth/* routes, which would let a user take over the managed
 * PiyAPI account the proxy holds credentials for.
 */
const ANY_TIER_PATHS = ['/export'] // GDPR: never tier-gated
// Of /compliance only the PHI check is exposed. In particular not
// DELETE /compliance/data: it deletes the PiyAPI account itself, API keys
// included, which would cut a managed user off from cloud storage for good.
// Erasure goes through DELETE /memories/namespace/<ns> and DELETE /kg/data.
const STARTER_PATHS = ['/memories', '/search', '/ask', '/feedback', '/compliance/phi-check']
const PRO_PATHS = ['/graph', '/context', '/kg']
const PRO_TIERS = ['pro', 'team', 'enterprise']

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    // 1. Verify Supabase JWT
    const userId = await verifyUser(req)

    // 2. Check user tier for feature gating. resolveTier() also ends a paid
    //    tier whose period has run out (one-time payments send no cancellation).
    const tier = await resolveTier(getAdminClient(), userId)

    // 3. Extract PiyAPI path — support BOTH formats:
    //    ?path=/memories  OR  /piyapi-proxy/memories
    const url = new URL(req.url)
    let rawPath = url.searchParams.get('path')

    if (!rawPath) {
      // Extract from URL path: /piyapi-proxy/memories → /memories
      const pathParts = url.pathname.split('/piyapi-proxy')
      if (pathParts.length > 1 && pathParts[1]) {
        rawPath = pathParts[1]
      }
    }

    if (!rawPath || rawPath === '/') {
      return errorResponse('Missing PiyAPI path. Use ?path=/memories or append /memories to URL')
    }

    const piyapiPath = normalizePath(rawPath)
    if (!piyapiPath) {
      return errorResponse('Invalid PiyAPI path', 400)
    }

    // 4. Tier-gate features
    const gateResult = checkTierAccess(tier, piyapiPath, req.method)
    /** Set when the body had to be read here to decide; forwarded in place of the stream. */
    let inspectedBody: string | undefined
    if (!gateResult.allowed) {
      const keyringBody =
        gateResult.status === undefined && isSingleMemoryWrite(piyapiPath, req.method)
          ? await readKeyringBody(req)
          : null
      if (keyringBody === null) {
        return errorResponse(gateResult.reason || 'Access denied', gateResult.status ?? 403)
      }
      inspectedBody = keyringBody
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
    const declaredLength = Number(req.headers.get('Content-Length') || '0')
    if (declaredLength > MAX_BODY_BYTES) {
      return errorResponse('Request body too large', 413)
    }
    const body =
      inspectedBody !== undefined
        ? inspectedBody
        : req.method !== 'GET' && req.method !== 'HEAD'
          ? req.body
          : undefined

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

    const piyapiRes = await piyapiFetch(
      userId,
      fullPiyapiPath,
      {
        method: req.method,
        headers,
        body,
      },
      tier
    )

    // 7. Stream PiyAPI response straight to client.
    // fetch() has already decoded the body, so the upstream encoding/length
    // headers no longer describe it.
    const responseHeaders = new Headers(piyapiRes.headers)
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('content-length')
    responseHeaders.delete('set-cookie')
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
    if (
      message.includes('No PiyAPI credentials') ||
      message.includes('PiyAPI registration failed') ||
      message.includes('Failed to store PiyAPI credentials') ||
      message.includes('Invalid PiyAPI registration response')
    ) {
      // 503, not 401/403: the account exists, its cloud storage could not be
      // set up right now. The desktop app treats 5xx as "try again later".
      return errorResponse(
        'Cloud storage is being set up for this account. Try again shortly.',
        503
      )
    }
    if (message.includes('PiyAPI token refresh failed')) {
      // Not 401: the user's own session is fine, and signing in again would
      // not help — a 401 here sent the desktop app into a refresh loop.
      return errorResponse('Cloud storage is temporarily unavailable for this account.', 503)
    }

    console.error('proxy error:', err)
    return errorResponse('Internal error', 500)
  }
})

/**
 * Canonicalise a client-supplied path, or return null if it is not a plain
 * absolute path. Rejecting dot segments, encoded characters and query/fragment
 * markers here is what makes the prefix checks in checkTierAccess meaningful:
 * `/memories/../graph` must not pass as a `/memories` request.
 */
function normalizePath(raw: string): string | null {
  let path: string
  try {
    path = decodeURIComponent(raw)
  } catch {
    return null
  }
  if (!path.startsWith('/')) path = '/' + path
  if (path.length > 512) return null
  // Only unreserved path characters; no '%', '?', '#', '\' or whitespace.
  if (!/^[A-Za-z0-9\-._~/:@]+$/.test(path)) return null
  // Drop a single trailing slash, then every segment must be a real name.
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  const segments = path.split('/').slice(1)
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    return null
  }
  return path
}

/** POST /memories or PATCH|PUT /memories/<id> — one memory, not a batch. */
function isSingleMemoryWrite(path: string, method: string): boolean {
  if (method === 'POST') return path === '/memories'
  if (method === 'PATCH' || method === 'PUT') {
    return /^\/memories\/[^/]+$/.test(path) && path !== '/memories/batch'
  }
  return false
}

/**
 * The request body, if it is a keyring document small enough to be one;
 * otherwise null. Reads at most MAX_KEYRING_BYTES whatever the client declares.
 */
async function readKeyringBody(req: Request): Promise<string | null> {
  if (Number(req.headers.get('Content-Length') || '0') > MAX_KEYRING_BYTES) return null
  const reader = req.body?.getReader()
  if (!reader) return null

  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_KEYRING_BYTES) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  const text = new TextDecoder().decode(bytes)
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && parsed.namespace === KEYRING_NAMESPACE
      ? text
      : null
  } catch {
    return null
  }
}

function matchesPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path === p || path.startsWith(p + '/'))
}

/**
 * Check if user's tier allows access to the requested PiyAPI endpoint
 */
function checkTierAccess(
  tier: string,
  path: string,
  method: string
): { allowed: boolean; reason?: string; status?: number } {
  // Data export and erasure are available to every account, including
  // accounts that have been downgraded to free.
  if (matchesPrefix(path, ANY_TIER_PATHS)) {
    return { allowed: true }
  }

  // Reading and deleting what one has already stored are rights, not plan
  // features. The upstream bulk-erase route does not exist, so erasure works
  // by listing memories and deleting them one by one — which a free or
  // downgraded account must therefore be allowed to do. Writing stays gated.
  if (matchesPrefix(path, ['/memories']) && (method === 'GET' || method === 'DELETE')) {
    return { allowed: true }
  }
  // The same goes for what the knowledge graph derived from it.
  if (path === '/kg/data' && method === 'DELETE') {
    return { allowed: true }
  }

  const isStarterPath = matchesPrefix(path, STARTER_PATHS)
  const isProPath = matchesPrefix(path, PRO_PATHS)

  if (!isStarterPath && !isProPath) {
    return { allowed: false, reason: 'Endpoint not available', status: 404 }
  }

  // Free users: no cloud features
  if (tier === 'free') {
    return {
      allowed: false,
      reason: 'Cloud features require a Starter plan or above. Upgrade at bluearkive.com/billing',
    }
  }

  // Starter is sold a read-only knowledge graph (the desktop app shows it for
  // that plan), so reading /graph is allowed from Starter up. Feeding the graph
  // (/kg), context sessions and anything that changes the graph stay Pro.
  const isGraphRead = method === 'GET' && matchesPrefix(path, ['/graph'])

  if (isProPath && !isGraphRead && !PRO_TIERS.includes(tier)) {
    return {
      allowed: false,
      reason: `${path.split('/')[1]} requires a Pro plan or above. Upgrade at bluearkive.com/billing`,
    }
  }

  return { allowed: true }
}
