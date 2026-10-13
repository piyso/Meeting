-- BlueArkive Backend Schema
-- Phase 2: security hardening for profiles + billing
--
-- Run AFTER 001_initial_schema.sql. Safe to re-run (idempotent).

-- ═══════════════════════════════════════════════════════════
-- 1. PROFILES — clients must never write tier / billing_status
-- ═══════════════════════════════════════════════════════════
-- 001 created "profiles_update_own" with no column restriction, which let any
-- signed-in user run `update profiles set tier = 'enterprise'` with the public
-- anon key. Nothing in the desktop app updates profiles from the client, so the
-- policy is removed outright; only Edge Functions (service_role) write here.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Defense in depth: even if an UPDATE policy is re-added later, the client
-- roles have no column privilege on the billing fields.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════
-- 2. PROFILES — subscription bookkeeping
-- ═══════════════════════════════════════════════════════════
-- Recorded by billing-webhook so that a cancellation/expiry only downgrades
-- the profile when it refers to the subscription that actually granted the
-- tier (stops one user's cancel event from downgrading another user).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_provider TEXT,
  ADD COLUMN IF NOT EXISTS subscription_id       TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end    TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════
-- 3. WEBHOOK EVENTS — idempotency / replay protection
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.webhook_events (
  provider    TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);

COMMENT ON TABLE public.webhook_events IS 'Processed payment webhook deliveries. The primary key makes replays and provider retries no-ops.';

-- RLS: no client access (Edge Functions only)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- 4. LICENSE KEYS — store and match keys case-insensitively
-- ═══════════════════════════════════════════════════════════
-- The desktop app upper-cases keys before sending them.
UPDATE public.license_keys SET key = UPPER(key) WHERE key <> UPPER(key);
