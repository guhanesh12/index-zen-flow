CREATE TABLE IF NOT EXISTS public.strategy_backtests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  strategy TEXT NOT NULL DEFAULT 'indexpilotai',
  indices TEXT[] NOT NULL DEFAULT ARRAY['NIFTY','BANKNIFTY','SENSEX'],
  initial_capital NUMERIC NOT NULL DEFAULT 100000,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  cost NUMERIC NOT NULL DEFAULT 5,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  by_index JSONB NOT NULL DEFAULT '[]'::jsonb,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategy_backtests_user_idx ON public.strategy_backtests(user_id, created_at DESC);

GRANT SELECT, INSERT ON public.strategy_backtests TO authenticated;
GRANT ALL ON public.strategy_backtests TO service_role;

ALTER TABLE public.strategy_backtests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own backtests" ON public.strategy_backtests;
CREATE POLICY "Users read own backtests" ON public.strategy_backtests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users create own backtests" ON public.strategy_backtests;
CREATE POLICY "Users create own backtests" ON public.strategy_backtests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);