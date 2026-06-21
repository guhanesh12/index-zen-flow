
-- 1. Profile flags
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_popup_seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tour_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_bonus_credited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signup_bonus_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_remaining numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signup_bonus_expires_at timestamptz;

-- 2. Updated signup handler: profile + referral + ₹100 wallet bonus
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_client_id text;
  ref_code text;
  referrer_uid uuid;
  referrer_cid text;
  bonus_amt numeric := 100;
  bonus_expiry timestamptz := now() + interval '7 days';
  wallet_key text;
  existing_wallet jsonb;
  current_balance numeric;
BEGIN
  new_client_id := public.generate_client_id();

  INSERT INTO public.profiles (
    user_id, client_id, full_name, email, mobile,
    signup_bonus_credited, signup_bonus_amount, signup_bonus_remaining, signup_bonus_expires_at
  )
  VALUES (
    NEW.id,
    new_client_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'mobile', NEW.raw_user_meta_data->>'phone', ''),
    true, bonus_amt, bonus_amt, bonus_expiry
  )
  ON CONFLICT (user_id) DO UPDATE SET
    signup_bonus_credited = true,
    signup_bonus_amount = bonus_amt,
    signup_bonus_remaining = bonus_amt,
    signup_bonus_expires_at = bonus_expiry;

  INSERT INTO public.referral_codes (user_id, code)
  VALUES (NEW.id, new_client_id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.referral_earnings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;

  -- Credit ₹100 to KV wallet
  wallet_key := 'wallet:' || NEW.id::text;
  SELECT value INTO existing_wallet FROM public.kv_store_c4d79cb7 WHERE key = wallet_key;
  current_balance := COALESCE((existing_wallet->>'balance')::numeric, 0);

  INSERT INTO public.kv_store_c4d79cb7 (key, value)
  VALUES (
    wallet_key,
    jsonb_build_object(
      'balance', current_balance + bonus_amt,
      'totalProfit', 0,
      'totalDeducted', 0,
      'createdAt', extract(epoch from now()) * 1000,
      'lastUpdated', extract(epoch from now()) * 1000
    )
  )
  ON CONFLICT (key) DO UPDATE SET
    value = jsonb_set(
      COALESCE(public.kv_store_c4d79cb7.value, '{}'::jsonb),
      '{balance}',
      to_jsonb(COALESCE((public.kv_store_c4d79cb7.value->>'balance')::numeric, 0) + bonus_amt)
    );

  -- Log transaction
  INSERT INTO public.wallet_transactions (user_id, type, amount, reference_id, description)
  VALUES (NEW.id, 'bonus', bonus_amt, 'signup_bonus', 'Welcome bonus - expires in 7 days');

  -- Referral handling
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
END $function$;

-- 3. Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Expiry function
CREATE OR REPLACE FUNCTION public.expire_signup_bonuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  wallet_key text;
  current_balance numeric;
  deduct numeric;
  affected int := 0;
BEGIN
  FOR r IN
    SELECT user_id, signup_bonus_remaining
    FROM public.profiles
    WHERE signup_bonus_credited = true
      AND signup_bonus_remaining > 0
      AND signup_bonus_expires_at IS NOT NULL
      AND signup_bonus_expires_at < now()
  LOOP
    wallet_key := 'wallet:' || r.user_id::text;
    SELECT COALESCE((value->>'balance')::numeric, 0) INTO current_balance
      FROM public.kv_store_c4d79cb7 WHERE key = wallet_key;
    deduct := LEAST(r.signup_bonus_remaining, COALESCE(current_balance, 0));

    IF deduct > 0 THEN
      UPDATE public.kv_store_c4d79cb7
        SET value = jsonb_set(value, '{balance}', to_jsonb(GREATEST(current_balance - deduct, 0)))
        WHERE key = wallet_key;

      INSERT INTO public.wallet_transactions (user_id, type, amount, reference_id, description)
      VALUES (r.user_id, 'bonus_expired', deduct, 'signup_bonus_expired',
              'Welcome bonus expired (7 days)');
    END IF;

    UPDATE public.profiles
      SET signup_bonus_remaining = 0
      WHERE user_id = r.user_id;

    affected := affected + 1;
  END LOOP;
  RETURN affected;
END $$;

-- 5. Schedule daily expiry at 03:00 IST (= 21:30 UTC)
DO $$
BEGIN
  PERFORM cron.unschedule('expire-signup-bonuses-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'expire-signup-bonuses-daily',
  '30 21 * * *',
  $$ SELECT public.expire_signup_bonuses(); $$
);
