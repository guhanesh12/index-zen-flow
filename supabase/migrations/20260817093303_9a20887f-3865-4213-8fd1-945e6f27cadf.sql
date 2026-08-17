ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_broker text NOT NULL DEFAULT 'dhan';
ALTER TABLE public.broker_credentials ADD COLUMN IF NOT EXISTS kite_user_id text;
ALTER TABLE public.broker_credentials ADD COLUMN IF NOT EXISTS kite_user_name text;