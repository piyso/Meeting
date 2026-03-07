-- BlueArkive Backend Schema
-- Phase 1: profiles, piyapi_credentials, billing_events, license_keys

-- ═══════════════════════════════════════════════════════════
-- 1. PROFILES — linked to Supabase Auth
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier            TEXT NOT NULL DEFAULT 'free'
                  CHECK (tier IN ('free', 'starter', 'pro', 'team', 'enterprise')),
  billing_status  TEXT NOT NULL DEFAULT 'active'
                  CHECK (billing_status IN ('active', 'past_due', 'cancelled', 'paused')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to Supabase Auth. Stores BlueArkive tier and billing status.';

-- RLS: users can only read their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_read_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.create_profile_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_profile_on_signup();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 2. PIYAPI CREDENTIALS — per-user PiyAPI accounts
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.piyapi_credentials (
  user_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  piyapi_user_id  TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.piyapi_credentials IS 'PiyAPI credentials per user. Only accessible by Edge Functions via service_role key. Never exposed to clients.';

-- NO RLS — only Edge Functions (service_role) can access
-- Explicitly revoke from client roles
ALTER TABLE public.piyapi_credentials ENABLE ROW LEVEL SECURITY;
-- No policies = no access for anon/authenticated

CREATE TRIGGER piyapi_credentials_updated_at
  BEFORE UPDATE ON public.piyapi_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 3. BILLING EVENTS — webhook audit log
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.billing_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  provider    TEXT NOT NULL CHECK (provider IN ('razorpay', 'lemon', 'manual', 'license')),
  payload     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.billing_events IS 'Audit log for billing events from payment providers.';

-- RLS: users can read their own billing events
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_events_read_own"
  ON public.billing_events FOR SELECT
  USING (auth.uid() = user_id);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_billing_events_user_id
  ON public.billing_events(user_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_created_at
  ON public.billing_events(created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 4. LICENSE KEYS — redeemable upgrade codes
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.license_keys (
  key         TEXT PRIMARY KEY,
  tier        TEXT NOT NULL CHECK (tier IN ('starter', 'pro', 'team', 'enterprise')),
  redeemed_by UUID REFERENCES public.profiles(id),
  redeemed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.license_keys IS 'Redeemable license keys for tier upgrades.';

-- RLS: no client access (Edge Functions only)
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;
