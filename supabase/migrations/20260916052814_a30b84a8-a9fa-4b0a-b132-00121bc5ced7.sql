-- Defense-in-depth: enforce column-level privileges so authenticated users
-- cannot modify privileged/sensitive profile columns even if a bug ever
-- bypasses the protect_profile_privileged_columns() trigger.

REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

-- Users may only update their own non-sensitive profile fields
GRANT UPDATE (full_name, email, mobile, photo_url, welcome_popup_seen, tour_completed, active_broker, profile_completion, updated_at) ON public.profiles TO authenticated;

-- Service role keeps full access (admin tools, KYC approval, plan upgrades, bonuses)
GRANT ALL ON public.profiles TO service_role;

-- Harden the existing protection trigger: also cover active_broker changes are fine,
-- but ensure the full sensitive set stays reverted for non-admin, non-service callers.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role / backend bypass (no auth.uid() context) and admins may change anything
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.user_id                 := OLD.user_id;
  NEW.client_id               := OLD.client_id;
  NEW.role                    := OLD.role;
  NEW.account_status          := OLD.account_status;
  NEW.kyc_status              := OLD.kyc_status;
  NEW.trading_level           := OLD.trading_level;
  NEW.subscription_plan       := OLD.subscription_plan;
  NEW.broker_connected        := OLD.broker_connected;
  NEW.signup_bonus_credited   := OLD.signup_bonus_credited;
  NEW.signup_bonus_amount     := OLD.signup_bonus_amount;
  NEW.signup_bonus_remaining  := OLD.signup_bonus_remaining;
  NEW.signup_bonus_expires_at := OLD.signup_bonus_expires_at;
  NEW.joined_at               := OLD.joined_at;

  RETURN NEW;
END;
$$;