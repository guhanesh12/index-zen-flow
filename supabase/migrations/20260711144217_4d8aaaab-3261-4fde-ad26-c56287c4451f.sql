
-- Extend admin_profiles for advanced admin management
ALTER TABLE public.admin_profiles
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS hotkey text,
  ADD COLUMN IF NOT EXISTS url_key text,
  ADD COLUMN IF NOT EXISTS last_login_url text,
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_hotkey_unique
  ON public.admin_profiles (upper(hotkey)) WHERE hotkey IS NOT NULL AND hotkey <> '';
CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_username_unique
  ON public.admin_profiles (lower(username)) WHERE username IS NOT NULL AND username <> '';
CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_employee_code_unique
  ON public.admin_profiles (upper(employee_code)) WHERE employee_code IS NOT NULL AND employee_code <> '';
CREATE UNIQUE INDEX IF NOT EXISTS admin_profiles_url_key_unique
  ON public.admin_profiles (url_key) WHERE url_key IS NOT NULL AND url_key <> '';

-- Extend admin_access_log with URL/session context
ALTER TABLE public.admin_access_log
  ADD COLUMN IF NOT EXISTS admin_user_id uuid,
  ADD COLUMN IF NOT EXISTS admin_email text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS url_key text,
  ADD COLUMN IF NOT EXISTS event text,
  ADD COLUMN IF NOT EXISTS session_id text;

-- Helper: check hotkey availability (case-insensitive), returns true if available
CREATE OR REPLACE FUNCTION public.is_admin_hotkey_available(_hotkey text, _exclude_user uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE upper(hotkey) = upper(_hotkey)
      AND (_exclude_user IS NULL OR user_id <> _exclude_user)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_hotkey_available(text, uuid) TO authenticated, anon;
