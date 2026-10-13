-- BlueArkive Supabase Migration 004
-- PiyAPI partner-managed accounts
--
-- Apply after 003. The Edge Functions tolerate this migration being absent
-- (they fall back to the self-registered account of 001–003), but a
-- partner-managed account cannot be stored without it.

-- ═══════════════════════════════════════════════════════════
-- 1. PIYAPI CREDENTIALS — partner-managed users
-- ═══════════════════════════════════════════════════════════
-- Until now each user got a PiyAPI account through the public sign-up route,
-- which always creates a free-plan account (1,000 memories, 1,000 requests a
-- day) whatever the user pays BlueArkive. PiyAPI's partner API creates the
-- account under BlueArkive's partner record instead: it returns an API key
-- (no password, no token refresh) and lets BlueArkive set the account's plan.
--
--   api_key      the managed user's PiyAPI key (sk_live_…)
--   piyapi_tier  the plan last set on the PiyAPI side, so a change of the
--                BlueArkive plan is pushed upstream exactly once
ALTER TABLE public.piyapi_credentials
  ADD COLUMN IF NOT EXISTS api_key     TEXT,
  ADD COLUMN IF NOT EXISTS piyapi_tier TEXT;

-- A managed account has an API key and no login tokens.
ALTER TABLE public.piyapi_credentials
  ALTER COLUMN access_token  DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL;

ALTER TABLE public.piyapi_credentials
  DROP CONSTRAINT IF EXISTS piyapi_credentials_has_auth;
ALTER TABLE public.piyapi_credentials
  ADD CONSTRAINT piyapi_credentials_has_auth
  CHECK (api_key IS NOT NULL OR (access_token IS NOT NULL AND refresh_token IS NOT NULL));

COMMENT ON COLUMN public.piyapi_credentials.api_key IS 'PiyAPI API key of a partner-managed user. NULL for accounts created through public sign-up.';
COMMENT ON COLUMN public.piyapi_credentials.piyapi_tier IS 'Plan last set for this user on the PiyAPI side.';
