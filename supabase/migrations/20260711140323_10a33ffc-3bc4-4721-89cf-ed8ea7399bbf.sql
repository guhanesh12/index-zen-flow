-- =========================================================
-- SUPER ADMIN, ROLES, PERMISSIONS, 2FA, MOBILE APP CONFIG
-- (no enum change — is_super_admin boolean is source of truth)
-- =========================================================

-- 1. admin_profiles ----------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT '',
  mobile text DEFAULT '',
  role_label text NOT NULL DEFAULT 'admin',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','suspended')),
  is_super_admin boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  last_login_at timestamptz,
  last_login_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_profiles TO authenticated;
GRANT ALL ON public.admin_profiles TO service_role;
ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

-- 2. helper: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE user_id = _user_id AND is_super_admin = true AND status = 'active'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

-- 3. admin_permissions -------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, module)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_permissions TO authenticated;
GRANT ALL ON public.admin_permissions TO service_role;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- 4. helper: has_permission (dynamic action name)
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ok boolean := false;
BEGIN
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF _action NOT IN ('view','create','edit','delete','export','approve') THEN
    RETURN false;
  END IF;
  EXECUTE format(
    'SELECT COALESCE((SELECT can_%I FROM public.admin_permissions WHERE admin_user_id=$1 AND module=$2), false)',
    _action
  ) INTO ok USING _user_id, _module;
  RETURN COALESCE(ok, false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END $$;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;

-- 5. admin_totp_secrets ------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_totp_secrets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_encrypted bytea NOT NULL,
  otpauth_url_encrypted bytea,
  enrolled_at timestamptz,
  verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_totp_secrets TO service_role;
ALTER TABLE public.admin_totp_secrets ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies for anon/authenticated → only service role can touch.

-- 6. admin_audit_events ------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  module text,
  target_user_id uuid,
  target_resource text,
  ip_address text,
  user_agent text,
  device text,
  browser text,
  status text NOT NULL DEFAULT 'success',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.admin_audit_events TO authenticated;
GRANT ALL ON public.admin_audit_events TO service_role;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created ON public.admin_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor ON public.admin_audit_events(actor_user_id);

-- 7. mobile_app_config -------------------------------------
CREATE TABLE IF NOT EXISTS public.mobile_app_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  android_current_version text NOT NULL DEFAULT '1.0.0',
  android_minimum_version text NOT NULL DEFAULT '1.0.0',
  android_store_url text NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.indexpilotai',
  ios_current_version text NOT NULL DEFAULT '1.0.0',
  ios_minimum_version text NOT NULL DEFAULT '1.0.0',
  ios_store_url text NOT NULL DEFAULT 'https://apps.apple.com/app/idxxxxxxxx',
  force_update boolean NOT NULL DEFAULT false,
  update_title text NOT NULL DEFAULT 'New Update Available',
  update_message text NOT NULL DEFAULT 'Please update to continue using the app.',
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.mobile_app_config TO anon, authenticated;
GRANT INSERT, UPDATE ON public.mobile_app_config TO authenticated;
GRANT ALL ON public.mobile_app_config TO service_role;
ALTER TABLE public.mobile_app_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.mobile_app_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 8. Super admin protection triggers -----------------------
CREATE OR REPLACE FUNCTION public.protect_super_admin()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_super_admin THEN
      RAISE EXCEPTION 'Cannot delete the super admin account';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_super_admin THEN
      IF NEW.is_super_admin = false THEN RAISE EXCEPTION 'Cannot demote the super admin'; END IF;
      IF NEW.status <> 'active' THEN RAISE EXCEPTION 'Cannot disable or suspend the super admin'; END IF;
      IF NEW.user_id <> OLD.user_id THEN RAISE EXCEPTION 'Cannot reassign the super admin user_id'; END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_super_admin_upd ON public.admin_profiles;
CREATE TRIGGER trg_protect_super_admin_upd
BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin();

DROP TRIGGER IF EXISTS trg_protect_super_admin_del ON public.admin_profiles;
CREATE TRIGGER trg_protect_super_admin_del
BEFORE DELETE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin();

CREATE OR REPLACE FUNCTION public.protect_super_admin_permissions()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE target_uid uuid;
BEGIN
  target_uid := COALESCE(NEW.admin_user_id, OLD.admin_user_id);
  IF public.is_super_admin(target_uid) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Cannot remove super admin permissions'; END IF;
    NEW.can_view := true; NEW.can_create := true; NEW.can_edit := true;
    NEW.can_delete := true; NEW.can_export := true; NEW.can_approve := true;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_super_admin_permissions() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_super_admin_perms ON public.admin_permissions;
CREATE TRIGGER trg_protect_super_admin_perms
BEFORE UPDATE OR DELETE ON public.admin_permissions
FOR EACH ROW EXECUTE FUNCTION public.protect_super_admin_permissions();

-- 9. updated_at triggers -----------------------------------
DROP TRIGGER IF EXISTS trg_admin_profiles_updated ON public.admin_profiles;
CREATE TRIGGER trg_admin_profiles_updated BEFORE UPDATE ON public.admin_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_admin_permissions_updated ON public.admin_permissions;
CREATE TRIGGER trg_admin_permissions_updated BEFORE UPDATE ON public.admin_permissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_admin_totp_updated ON public.admin_totp_secrets;
CREATE TRIGGER trg_admin_totp_updated BEFORE UPDATE ON public.admin_totp_secrets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_mobile_app_config_updated ON public.mobile_app_config;
CREATE TRIGGER trg_mobile_app_config_updated BEFORE UPDATE ON public.mobile_app_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. RLS policies -----------------------------------------
DROP POLICY IF EXISTS "Admins can read admin profiles" ON public.admin_profiles;
CREATE POLICY "Admins can read admin profiles" ON public.admin_profiles
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin manages admin profiles" ON public.admin_profiles;
CREATE POLICY "Super admin manages admin profiles" ON public.admin_profiles
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read own permissions" ON public.admin_permissions;
CREATE POLICY "Admins can read own permissions" ON public.admin_permissions
FOR SELECT TO authenticated
USING (admin_user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin manages permissions" ON public.admin_permissions;
CREATE POLICY "Super admin manages permissions" ON public.admin_permissions
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can read audit events" ON public.admin_audit_events;
CREATE POLICY "Admins can read audit events" ON public.admin_audit_events
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert audit events" ON public.admin_audit_events;
CREATE POLICY "Authenticated can insert audit events" ON public.admin_audit_events
FOR INSERT TO authenticated
WITH CHECK (actor_user_id = auth.uid() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can read mobile app config" ON public.mobile_app_config;
CREATE POLICY "Anyone can read mobile app config" ON public.mobile_app_config
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Super admin manages mobile app config" ON public.mobile_app_config;
CREATE POLICY "Super admin manages mobile app config" ON public.mobile_app_config
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- 11. Reserve super admin email (marker used by seed function)
INSERT INTO public.kv_store_c4d79cb7 (key, value)
VALUES ('super_admin:reserved_email', to_jsonb('airoboengin@smilykart.com'::text))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
