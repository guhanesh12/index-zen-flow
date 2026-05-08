INSERT INTO public.profiles (user_id, full_name, email, mobile, profile_completion)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  u.email,
  COALESCE(u.raw_user_meta_data->>'mobile', u.raw_user_meta_data->>'phone', ''),
  20
  + CASE WHEN COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') <> '' THEN 20 ELSE 0 END
  + CASE WHEN COALESCE(u.raw_user_meta_data->>'mobile', u.raw_user_meta_data->>'phone', '') <> '' THEN 20 ELSE 0 END
FROM auth.users u
ON CONFLICT (user_id) DO UPDATE SET
  full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
  email = COALESCE(NULLIF(public.profiles.email, ''), EXCLUDED.email),
  mobile = COALESCE(NULLIF(public.profiles.mobile, ''), EXCLUDED.mobile),
  profile_completion = GREATEST(public.profiles.profile_completion, EXCLUDED.profile_completion),
  updated_at = now();

INSERT INTO public.referral_codes (user_id, code)
SELECT p.user_id, p.client_id
FROM public.profiles p
WHERE p.client_id IS NOT NULL AND p.client_id <> ''
ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code;

INSERT INTO public.referral_earnings (user_id)
SELECT p.user_id
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.referrals (referrer_user_id, referee_user_id, referee_client_id, referrer_client_id, status)
SELECT
  rc.user_id,
  u.id,
  referee.client_id,
  rc.code,
  'registered'
FROM auth.users u
JOIN public.profiles referee ON referee.user_id = u.id
JOIN public.referral_codes rc ON upper(rc.code) = upper(COALESCE(u.raw_user_meta_data->>'referred_by', ''))
WHERE COALESCE(u.raw_user_meta_data->>'referred_by', '') <> ''
  AND rc.user_id <> u.id
ON CONFLICT (referee_user_id) DO NOTHING;

WITH settings AS (
  SELECT COALESCE((SELECT reward_amount FROM public.referral_settings ORDER BY created_at ASC LIMIT 1), 100) AS reward_amount
), referral_counts AS (
  SELECT
    referrer_user_id AS user_id,
    COUNT(*) FILTER (WHERE status = 'rewarded') AS successful_count,
    COUNT(*) FILTER (WHERE status IN ('pending', 'registered')) AS pending_count,
    COALESCE(SUM(reward_amount) FILTER (WHERE status = 'rewarded'), 0) AS total_earned
  FROM public.referrals
  GROUP BY referrer_user_id
)
UPDATE public.referral_earnings e
SET
  successful_count = COALESCE(rc.successful_count, 0),
  pending_count = COALESCE(rc.pending_count, 0),
  total_earned = COALESCE(rc.total_earned, 0),
  total_pending = COALESCE(rc.pending_count, 0) * (SELECT reward_amount FROM settings),
  updated_at = now()
FROM referral_counts rc
WHERE e.user_id = rc.user_id;