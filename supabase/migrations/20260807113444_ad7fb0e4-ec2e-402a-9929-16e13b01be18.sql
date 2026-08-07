CREATE TABLE public.ai_chat_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  answer jsonb,
  verdict text,
  action_type text,
  charged numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX ai_chat_logs_user_created_idx ON public.ai_chat_logs (user_id, created_at DESC);

GRANT SELECT ON public.ai_chat_logs TO authenticated;
GRANT ALL ON public.ai_chat_logs TO service_role;

ALTER TABLE public.ai_chat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ai chat logs"
  ON public.ai_chat_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all ai chat logs"
  ON public.ai_chat_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));