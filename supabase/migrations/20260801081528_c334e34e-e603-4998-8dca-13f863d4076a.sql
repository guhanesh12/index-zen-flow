CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

DROP TRIGGER IF EXISTS protect_profile_privileged_columns_trg ON public.profiles;
CREATE TRIGGER protect_profile_privileged_columns_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_columns();

REVOKE EXECUTE ON FUNCTION public.protect_profile_privileged_columns() FROM PUBLIC, anon, authenticated;