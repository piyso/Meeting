// This file runs in Deno (Supabase Edge Functions), not Node.js
// Type declarations in supabase/deno.d.ts
// Shared utility for PiyAPI credential management
// Used by all Edge Functions that need to call PiyAPI on behalf of a user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PIYAPI_BASE_URL = Deno.env.get('PIYAPI_BASE_URL') || 'https://api.piyapi.cloud'

interface PiyAPICredentials {
  piyapi_user_id: string
  access_token: string
  refresh_token: string
  expires_at: string | null
}

/**
 * Get a Supabase admin client (service_role — can read piyapi_credentials)
 */
export function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL') || ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  return createClient(url, key)
}

/**
 * Get PiyAPI credentials for a user, refreshing the token if expired
 */
export async function getPiyAPICredentials(userId: string): Promise<PiyAPICredentials> {
  const admin = getAdminClient()

  const { data, error } = await admin
    .from('piyapi_credentials')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw new Error(`No PiyAPI credentials for user ${userId}`)
  }

  // Check if token is expired (with 60s buffer)
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at).getTime()
    const now = Date.now()
    if (expiresAt - now < 60_000) {
      return await refreshPiyAPIToken(userId, data)
    }
  }

  return data as PiyAPICredentials
}

/**
 * Refresh an expired PiyAPI token and update the DB
 */
async function refreshPiyAPIToken(
  userId: string,
  current: PiyAPICredentials
): Promise<PiyAPICredentials> {
  const res = await fetch(`${PIYAPI_BASE_URL}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${current.refresh_token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`PiyAPI token refresh failed: ${res.status}`)
  }

  const body = (await res.json()) as Record<string, unknown>
  const newAccessToken = (body.access_token || body.accessToken) as string
  const newRefreshToken = (body.refresh_token ||
    body.refreshToken ||
    current.refresh_token) as string
  const expiresIn = (body.expires_in || body.expiresIn || 900) as number

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

  // Update DB
  const admin = getAdminClient()
  await admin
    .from('piyapi_credentials')
    .update({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: expiresAt,
    })
    .eq('user_id', userId)

  return {
    ...current,
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    expires_at: expiresAt,
  }
}

/**
 * Make an authenticated PiyAPI request on behalf of a user
 */
export async function piyapiFetch(
  userId: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const creds = await getPiyAPICredentials(userId)

  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${creds.access_token}`)
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${PIYAPI_BASE_URL}${path}`, {
    ...options,
    headers,
  })
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
