-- BlueArkive Backend Schema
-- Phase 3: billing integrity + recoverable managed accounts
--
-- Run AFTER 002_security_hardening.sql. Safe to re-run (idempotent).
-- The Edge Functions tolerate this migration not being applied yet, but two of
-- the fixes below only take effect once it is.

-- ═══════════════════════════════════════════════════════════
-- 1. WEBHOOK EVENTS — "claimed" is not "applied"
-- ═══════════════════════════════════════════════════════════
-- billing-webhook inserts a row before it applies a payment. If the function
-- died in between, the provider's retry found the row and was acknowledged as
-- a duplicate — the payment was never applied. processed_at is set only after
-- the change has been written; a claim without it that is more than two
-- minutes old is taken over by the next delivery.
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Deliveries recorded before this column existed were applied when recorded.
UPDATE public.webhook_events
   SET processed_at = received_at
 WHERE processed_at IS NULL;

-- ═══════════════════════════════════════════════════════════
-- 2. PIYAPI CREDENTIALS — keep the managed account's login
-- ═══════════════════════════════════════════════════════════
-- The managed PiyAPI account's password was generated and thrown away, so an
-- account whose refresh token was lost or revoked could never be signed in
-- again. New accounts store their login here (service_role only — this table
-- has RLS enabled and no policies).
ALTER TABLE public.piyapi_credentials
  ADD COLUMN IF NOT EXISTS account_email    TEXT,
  ADD COLUMN IF NOT EXISTS account_password TEXT;

-- ═══════════════════════════════════════════════════════════
-- 3. PROFILES — find accounts whose paid period has ended
-- ═══════════════════════════════════════════════════════════
-- piyapi-proxy ends a paid tier three days after current_period_end (a
-- one-time Razorpay payment sends no cancellation event). This index is for
-- reporting on / sweeping those rows; the proxy itself reads by primary key.
CREATE INDEX IF NOT EXISTS idx_profiles_period_end
  ON public.profiles (current_period_end)
  WHERE current_period_end IS NOT NULL;
