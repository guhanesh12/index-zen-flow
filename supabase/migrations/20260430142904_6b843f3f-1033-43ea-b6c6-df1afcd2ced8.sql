-- ============================================================
-- Lock down trading tables to authenticated owners only
-- Edge functions use SERVICE_ROLE and bypass RLS, so unaffected
-- ============================================================

-- ---------- user_symbols ----------
DROP POLICY IF EXISTS "Anon can read and write symbols" ON public.user_symbols;

CREATE POLICY "Users can view their own symbols"
  ON public.user_symbols FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

CREATE POLICY "Users can insert their own symbols"
  ON public.user_symbols FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can update their own symbols"
  ON public.user_symbols FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY "Users can delete their own symbols"
  ON public.user_symbols FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()::text);

-- ---------- trading_signals ----------
DROP POLICY IF EXISTS "Anon can read signals" ON public.trading_signals;

CREATE POLICY "Users can view their own signals"
  ON public.trading_signals FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

-- ---------- trading_engine_state ----------
DROP POLICY IF EXISTS "Anon can read own engine state" ON public.trading_engine_state;

CREATE POLICY "Users can view their own engine state"
  ON public.trading_engine_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

-- ---------- position_monitor_state ----------
DROP POLICY IF EXISTS "Anon can read position monitor" ON public.position_monitor_state;

CREATE POLICY "Users can view their own positions"
  ON public.position_monitor_state FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

-- ---------- signal_stats ----------
DROP POLICY IF EXISTS "Anon can read signal stats" ON public.signal_stats;

CREATE POLICY "Users can view their own stats"
  ON public.signal_stats FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);

-- ---------- trading_orders ----------
DROP POLICY IF EXISTS "Anon can read orders" ON public.trading_orders;

CREATE POLICY "Users can view their own orders"
  ON public.trading_orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);
