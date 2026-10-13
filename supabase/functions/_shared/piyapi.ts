// This file runs in Deno (Supabase Edge Functions), not Node.js
// Type declarations in supabase/deno.d.ts
// Shared utility for PiyAPI credential management
// Used by all Edge Functions that need to call PiyAPI on behalf of a user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PIYAPI_BASE_URL = Deno.env.get('PIYAPI_BASE_URL') || 'https://api.piyapi.cloud'

/**
 * BlueArkive's PiyAPI partner key (pk_live_…). With it, accounts are created
 * through PiyAPI's partner API as managed users; without it, through public
 * sign-up as before. It can create and delete users, so it lives only here —
 * never in the desktop app.
 */
const PIYAPI_PARTNER_KEY = Deno.env.get('PIYAPI_PARTNER_KEY') || ''

interface PiyAPICredentials {
  piyapi_user_id: string
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
  /** Managed-account login, kept so a dead refresh token can be replaced (see migration 003). */
  account_email?: string | null
  account_password?: string | null
  /** Partner-managed user: authenticates with this key, no tokens (see migration 004). */
  api_key?: string | null
  /** Plan last set on the PiyAPI side. */
  piyapi_tier?: string | null
}

/**
 * Get a Supabase admin client (service_role — can read piyapi_credentials)
 */
export function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  return createClient(url, key)
}

// ─── Plan ───────────────────────────────────────────────────────

/** How long after the paid period ends an account keeps its tier (late webhooks, retries). */
const PERIOD_GRACE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * The tier an account is entitled to right now.
 *
 * `profiles.tier` is what was last granted; `current_period_end` is until when
 * it was paid for. A one-time payment (Razorpay order) never sends a
 * cancellation, so without this check a single month's payment kept the tier
 * for ever. A profile with no period on file (licence key, manual grant) does
 * not expire.
 */
export function effectiveTier(
  profile: { tier?: string | null; current_period_end?: string | null } | null | undefined
): string {
  const tier = profile?.tier || 'free'
  if (tier === 'free') return 'free'
  const end = profile?.current_period_end ? Date.parse(profile.current_period_end) : NaN
  if (Number.isNaN(end)) return tier
  return Date.now() > end + PERIOD_GRACE_MS ? 'free' : tier
}

/**
 * Read a user's entitled tier, writing the downgrade back when the paid period
 * has run out (so the desktop app sees it on its next profile refresh).
 */
export async function resolveTier(
  admin: ReturnType<typeof getAdminClient>,
  userId: string
): Promise<string> {
  // select('*'): current_period_end only exists once migration 002 has run.
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle()
  const stored = (profile?.tier as string | undefined) || 'free'
  const entitled = effectiveTier(profile)

  if (entitled !== stored) {
    const { error } = await admin
      .from('profiles')
      .update({ tier: 'free', billing_status: 'cancelled' })
      .eq('id', userId)
      // Only if nothing renewed it in the meantime.
      .eq('current_period_end', profile?.current_period_end)
    if (error) console.error('expired-plan downgrade failed:', error)
  }
  return entitled
}

// ─── Managed PiyAPI account ─────────────────────────────────────

interface TokenReply {
  access_token?: string
  accessToken?: string
  refresh_token?: string
  refreshToken?: string
  user?: { id?: string }
  userId?: string
  user_id?: string
  expires_in?: number
  expiresIn?: number
}

function parseTokens(body: TokenReply) {
  const expiresIn = body.expires_in || body.expiresIn || 900
  return {
    accessToken: body.access_token || body.accessToken,
    refreshToken: body.refresh_token || body.refreshToken,
    piyapiUserId: body.user?.id || body.userId || body.user_id,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
}

async function readCredentials(userId: string): Promise<PiyAPICredentials | null> {
  const { data } = await getAdminClient()
    .from('piyapi_credentials')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return (data as PiyAPICredentials | null) ?? null
}

function isFresh(creds: PiyAPICredentials): boolean {
  if (creds.api_key) return true // API keys do not expire
  if (!creds.expires_at) return true
  return new Date(creds.expires_at).getTime() - Date.now() >= 60_000
}

/** Unique per user; never receives mail. */
function managedEmail(userId: string): string {
  return `ba_${userId}@managed.bluearkive.com`
}

/**
 * The PiyAPI plan a BlueArkive plan runs on.
 *
 * Every paying account is a PiyAPI `managed` account (50,000 memories,
 * unmetered search); what each BlueArkive plan may use is decided by the proxy.
 * A free account stores only its keyring, so PiyAPI's free plan is enough —
 * and after a downgrade it keeps reads and deletes working while refusing new
 * writes.
 */
export function piyapiTierFor(tier: string): 'free' | 'managed' {
  return tier === 'free' ? 'free' : 'managed'
}

/** Call PiyAPI's partner API (create users, set their plan, rotate their keys). */
function partnerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${PIYAPI_BASE_URL}/api/v1/partner${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PIYAPI_PARTNER_KEY}`,
    },
  })
}

/**
 * Issue a new API key for a managed user, revoking the old ones. A key is
 * returned only when it is created, so this is how a lost one is replaced.
 */
async function rotateManagedKey(
  userId: string
): Promise<{ user_id?: string; api_key?: string } | null> {
  const res = await partnerFetch(`/users/${encodeURIComponent(userId)}/rotate-key`, {
    method: 'POST',
  })
  if (!res.ok) {
    console.error('PiyAPI key rotation failed:', res.status, await res.text())
    return null
  }
  return (await res.json()) as { user_id?: string; api_key?: string }
}

/** Create the user under BlueArkive's partner record and store its API key. */
async function provisionManagedUser(userId: string, tier: string): Promise<PiyAPICredentials> {
  const piyapiTier = piyapiTierFor(tier)
  const createRes = await partnerFetch('/users', {
    method: 'POST',
    body: JSON.stringify({
      external_id: userId,
      email: managedEmail(userId),
      display_name: `BlueArkive ${userId.slice(0, 8)}`,
      tier_override: piyapiTier,
    }),
  })

  let reply: { user_id?: string; api_key?: string } | null = null
  if (createRes.ok) {
    reply = (await createRes.json()) as { user_id?: string; api_key?: string }
  } else if (createRes.status === 409) {
    // The user exists already: another request won the race, or an earlier
    // attempt created it and failed before storing the key.
    const raced = await readCredentials(userId)
    if (raced) return raced
    reply = await rotateManagedKey(userId)
  } else {
    console.error('PiyAPI registration failed:', await createRes.text())
    throw new Error(`PiyAPI registration failed: ${createRes.status}`)
  }

  if (!reply?.user_id || !reply.api_key) {
    throw new Error('Invalid PiyAPI registration response')
  }

  const row = {
    user_id: userId,
    piyapi_user_id: reply.user_id,
    api_key: reply.api_key,
    piyapi_tier: piyapiTier,
    access_token: null,
    refresh_token: null,
    expires_at: null,
  }
  // Needs migration 004 (api_key column, nullable tokens).
  const { error } = await getAdminClient().from('piyapi_credentials').upsert(row)
  if (error) {
    console.error('Failed to store PiyAPI credentials:', error)
    throw new Error('Failed to store PiyAPI credentials')
  }
  return row
}

/**
 * Push a changed BlueArkive plan to the user's PiyAPI account. Runs on the
 * first request after the change; a failure leaves the old plan in place and
 * is tried again on the next request.
 */
async function syncManagedTier(
  userId: string,
  creds: PiyAPICredentials,
  tier: string
): Promise<PiyAPICredentials> {
  if (!creds.api_key || !PIYAPI_PARTNER_KEY) return creds
  const wanted = piyapiTierFor(tier)
  if (creds.piyapi_tier === wanted) return creds

  const res = await partnerFetch(`/users/${encodeURIComponent(userId)}/limits`, {
    method: 'PUT',
    body: JSON.stringify({ tier: wanted }),
  })
  if (!res.ok) {
    console.error('PiyAPI plan update failed:', res.status, await res.text())
    return creds
  }

  const { error } = await getAdminClient()
    .from('piyapi_credentials')
    .update({ piyapi_tier: wanted })
    .eq('user_id', userId)
  if (error) console.error('Failed to record PiyAPI plan:', error)
  return { ...creds, piyapi_tier: wanted }
}

/**
 * Create the PiyAPI account for a user and store its credentials.
 *
 * Called by the on-signup webhook and — because that webhook is not retried
 * when it fails — lazily by the proxy the first time a user without
 * credentials makes a request. Idempotent: returns existing credentials.
 *
 * With a partner key configured the account is a partner-managed user;
 * otherwise it is created through public sign-up, which PiyAPI always puts on
 * its free plan.
 */
export async function provisionPiyAPIAccount(
  userId: string,
  tier = 'free'
): Promise<PiyAPICredentials> {
  const existing = await readCredentials(userId)
  if (existing) return existing

  if (PIYAPI_PARTNER_KEY) return provisionManagedUser(userId, tier)

  const email = managedEmail(userId)
  // Never shown to the user — managed internally.
  const password = crypto.randomUUID() + crypto.randomUUID()

  const registerRes = await fetch(`${PIYAPI_BASE_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: `BlueArkive ${userId.slice(0, 8)}` }),
  })

  if (!registerRes.ok) {
    // Two requests can race to provision; the loser finds the winner's row.
    const raced = await readCredentials(userId)
    if (raced) return raced
    console.error('PiyAPI registration failed:', await registerRes.text())
    throw new Error(`PiyAPI registration failed: ${registerRes.status}`)
  }

  const tokens = parseTokens((await registerRes.json()) as TokenReply)
  if (!tokens.accessToken || !tokens.refreshToken || !tokens.piyapiUserId) {
    throw new Error('Invalid PiyAPI registration response')
  }

  const row = {
    user_id: userId,
    piyapi_user_id: tokens.piyapiUserId,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt,
  }
  const admin = getAdminClient()
  // The login columns arrive with migration 003; store them when they exist so
  // the account can be signed in again if its refresh token is ever lost.
  let { error } = await admin
    .from('piyapi_credentials')
    .upsert({ ...row, account_email: email, account_password: password })
  if (error) {
    ;({ error } = await admin.from('piyapi_credentials').upsert(row))
  }
  if (error) {
    console.error('Failed to store PiyAPI credentials:', error)
    throw new Error('Failed to store PiyAPI credentials')
  }

  return { ...row, account_email: email, account_password: password }
}

/**
 * Get PiyAPI credentials for a user, refreshing the token if expired
 */
export async function getPiyAPICredentials(
  userId: string,
  tier?: string
): Promise<PiyAPICredentials> {
  // A user whose signup webhook failed has no row yet: create the account now
  // instead of answering "not provisioned" for ever.
  const creds =
    (await readCredentials(userId)) ?? (await provisionPiyAPIAccount(userId, tier ?? 'free'))
  if (creds.api_key) {
    return tier ? await syncManagedTier(userId, creds, tier) : creds
  }
  return isFresh(creds) ? creds : await refreshPiyAPIToken(userId, creds)
}

async function storeTokens(
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: string }
): Promise<void> {
  const { error } = await getAdminClient()
    .from('piyapi_credentials')
    .update({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
    })
    .eq('user_id', userId)
  // The tokens are still good for this request; the next one refreshes again.
  if (error) console.error('Failed to store refreshed PiyAPI tokens:', error)
}

/**
 * Refresh an expired PiyAPI token and update the DB
 */
async function refreshPiyAPIToken(
  userId: string,
  current: PiyAPICredentials
): Promise<PiyAPICredentials> {
  // PiyAPI reads the refresh token from the body. It used to be sent as a
  // Bearer header with no body, which the endpoint answers with 400 — so no
  // token was ever refreshed this way.
  const res = await fetch(`${PIYAPI_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: current.refresh_token ?? '' }),
  })

  if (res.ok) {
    const tokens = parseTokens((await res.json()) as TokenReply)
    if (tokens.accessToken) {
      const next = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || current.refresh_token || '',
        expiresAt: tokens.expiresAt,
      }
      await storeTokens(userId, next)
      return {
        ...current,
        access_token: next.accessToken,
        refresh_token: next.refreshToken,
        expires_at: next.expiresAt,
      }
    }
  }

  // The desktop app sends requests in parallel, and they all notice the
  // expiry together. If the token is single-use, only the first refresh wins;
  // the others land here — and can simply use what the winner stored.
  const latest = await readCredentials(userId)
  if (latest && latest.refresh_token !== current.refresh_token && isFresh(latest)) {
    return latest
  }

  // The refresh token itself is no longer accepted: sign the managed account
  // in again (possible for accounts created after migration 003).
  const login = latest ?? current
  if (login.account_email && login.account_password) {
    const loginRes = await fetch(`${PIYAPI_BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: login.account_email, password: login.account_password }),
    })
    if (loginRes.ok) {
      const tokens = parseTokens((await loginRes.json()) as TokenReply)
      if (tokens.accessToken && tokens.refreshToken) {
        const next = {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        }
        await storeTokens(userId, next)
        return {
          ...login,
          access_token: next.accessToken,
          refresh_token: next.refreshToken,
          expires_at: next.expiresAt,
        }
      }
    }
  }

  throw new Error(`PiyAPI token refresh failed: ${res.status}`)
}

/**
 * Make an authenticated PiyAPI request on behalf of a user
 */
export async function piyapiFetch(
  userId: string,
  path: string,
  options: RequestInit = {},
  /** The user's BlueArkive plan; when given, the PiyAPI plan is kept in step with it. */
  tier?: string
): Promise<Response> {
  const creds = await getPiyAPICredentials(userId, tier)

  const send = (credential: string | null | undefined) => {
    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${credential ?? ''}`)
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(`${PIYAPI_BASE_URL}${path}`, { ...options, headers })
  }

  const res = await send(creds.api_key ?? creds.access_token)
  if (res.status !== 401 || !creds.api_key || !PIYAPI_PARTNER_KEY) return res

  // The stored key is no longer accepted (revoked upstream, or two first
  // requests raced and the losing key was stored). Replace it.
  const rotated = await rotateManagedKey(userId)
  if (!rotated?.api_key) return res
  const { error } = await getAdminClient()
    .from('piyapi_credentials')
    .update({ api_key: rotated.api_key })
    .eq('user_id', userId)
  if (error) console.error('Failed to store rotated PiyAPI key:', error)

  // A streamed body has been consumed and cannot be sent twice.
  const replayable = options.body === undefined || typeof options.body === 'string'
  if (!replayable) {
    return new Response(JSON.stringify({ error: 'Cloud storage was reconnected. Try again.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  await res.body?.cancel().catch(() => undefined)
  return send(rotated.api_key)
}

/**
 * Verify the Supabase JWT and return the user ID
 */
export async function verifyUser(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing Authorization header')
  }

  const token = authHeader.slice(7)
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const supabase = createClient(url, key)

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user) {
    throw new Error('Invalid or expired token')
  }

  return user.id
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-client-info',
}

/**
 * Standard JSON error response
 */
export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/**
 * Standard JSON success response
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
