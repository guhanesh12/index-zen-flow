
-- App role enum (if not exists)
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role full access user_roles" ON public.user_roles;
CREATE POLICY "Service role full access user_roles" ON public.user_roles FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Client ID sequence
CREATE SEQUENCE IF NOT EXISTS public.alg_client_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_client_id()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.alg_client_seq');
  RETURN 'ALG' || lpad(n::text, 4, '0');
END $$;

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  client_id text UNIQUE NOT NULL DEFAULT public.generate_client_id(),
  full_name text,
  email text,
  mobile text,
  photo_url text,
  role text DEFAULT 'user',
  kyc_status text DEFAULT 'pending',
  account_status text DEFAULT 'active',
  trading_level text DEFAULT 'Beginner',
  subscription_plan text DEFAULT 'Free',
  broker_connected boolean DEFAULT false,
  profile_completion integer DEFAULT 20,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role full access profiles" ON public.profiles;
CREATE POLICY "Service role full access profiles" ON public.profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins full access profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Referral codes
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can lookup referral codes" ON public.referral_codes;
CREATE POLICY "Anyone can lookup referral codes" ON public.referral_codes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access referral_codes" ON public.referral_codes;
CREATE POLICY "Service role full access referral_codes" ON public.referral_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins manage referral_codes" ON public.referral_codes;
CREATE POLICY "Admins manage referral_codes" ON public.referral_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referee_user_id uuid NOT NULL UNIQUE,
  referee_client_id text,
  referrer_client_id text,
  status text NOT NULL DEFAULT 'pending',
  reward_amount numeric DEFAULT 0,
  registration_ip text,
  device_fingerprint text,
  fraud_flag boolean DEFAULT false,
  registered_at timestamptz NOT NULL DEFAULT now(),
  first_trade_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own referrals" ON public.referrals;
CREATE POLICY "Users view own referrals" ON public.referrals FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR referee_user_id = auth.uid());
DROP POLICY IF EXISTS "Service role full access referrals" ON public.referrals;
CREATE POLICY "Service role full access referrals" ON public.referrals FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins full access referrals" ON public.referrals;
CREATE POLICY "Admins full access referrals" ON public.referrals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER referrals_updated_at BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Referral settings (singleton)
CREATE TABLE IF NOT EXISTS public.referral_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_amount numeric NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  share_template_whatsapp text DEFAULT '🚀 Join India''s Advanced AI Algo Trading Platform!

📈 Smart AI Signals
🤖 Automated Trading
💰 Live Profit Tracking
🔥 Premium Trading Dashboard

🎁 Register using my referral link and get exclusive benefits!

👇 Join Here:
{REFERRAL_LINK}

🆔 Referral Code: {REFERRAL_CODE}',
  share_template_telegram text DEFAULT '🚀 Try IndexPilot AI Trading! Use my referral code {REFERRAL_CODE} to register: {REFERRAL_LINK}',
  share_template_email text DEFAULT 'Hi! I''m using IndexPilot AI for automated trading. Register with my link to get exclusive benefits: {REFERRAL_LINK}',
  share_template_generic text DEFAULT 'Join IndexPilot AI Trading using my referral code {REFERRAL_CODE}: {REFERRAL_LINK}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read referral settings" ON public.referral_settings;
CREATE POLICY "Anyone can read referral settings" ON public.referral_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access referral_settings" ON public.referral_settings;
CREATE POLICY "Service role full access referral_settings" ON public.referral_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins manage referral_settings" ON public.referral_settings;
CREATE POLICY "Admins manage referral_settings" ON public.referral_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER referral_settings_updated_at BEFORE UPDATE ON public.referral_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.referral_settings (reward_amount, enabled)
SELECT 100, true WHERE NOT EXISTS (SELECT 1 FROM public.referral_settings);

-- Referral earnings
CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  total_earned numeric NOT NULL DEFAULT 0,
  total_pending numeric NOT NULL DEFAULT 0,
  successful_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  last_credited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own earnings" ON public.referral_earnings;
CREATE POLICY "Users view own earnings" ON public.referral_earnings FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role full access referral_earnings" ON public.referral_earnings;
CREATE POLICY "Service role full access referral_earnings" ON public.referral_earnings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins full access referral_earnings" ON public.referral_earnings;
CREATE POLICY "Admins full access referral_earnings" ON public.referral_earnings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER referral_earnings_updated_at BEFORE UPDATE ON public.referral_earnings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wallet transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  amount numeric NOT NULL,
  reference_id text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users view own wallet tx" ON public.wallet_transactions;
CREATE POLICY "Users view own wallet tx" ON public.wallet_transactions FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Service role full access wallet_tx" ON public.wallet_transactions;
CREATE POLICY "Service role full access wallet_tx" ON public.wallet_transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Admins full access wallet_tx" ON public.wallet_transactions;
CREATE POLICY "Admins full access wallet_tx" ON public.wallet_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + referral code + referral row on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_client_id text;
  ref_code text;
  referrer_uid uuid;
  referrer_cid text;
BEGIN
  new_client_id := public.generate_client_id();

  INSERT INTO public.profiles (user_id, client_id, full_name, email, mobile)
  VALUES (
    NEW.id,
    new_client_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'mobile', NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.referral_codes (user_id, code)
  VALUES (NEW.id, new_client_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.referral_earnings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;

  ref_code := NEW.raw_user_meta_data->>'referred_by';
  IF ref_code IS NOT NULL AND length(ref_code) > 0 THEN
    SELECT rc.user_id, rc.code INTO referrer_uid, referrer_cid
    FROM public.referral_codes rc WHERE upper(rc.code) = upper(ref_code) LIMIT 1;
    IF referrer_uid IS NOT NULL AND referrer_uid <> NEW.id THEN
      INSERT INTO public.referrals (referrer_user_id, referee_user_id, referee_client_id, referrer_client_id, status)
      VALUES (referrer_uid, NEW.id, new_client_id, referrer_cid, 'registered')
      ON CONFLICT (referee_user_id) DO NOTHING;

      UPDATE public.referral_earnings
        SET pending_count = pending_count + 1, updated_at = now()
        WHERE user_id = referrer_uid;
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
