CREATE TABLE IF NOT EXISTS public.nse_holidays (
  holiday_date date PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nse_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read holidays" ON public.nse_holidays;
CREATE POLICY "Anyone can read holidays" ON public.nse_holidays FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role manages holidays" ON public.nse_holidays;
CREATE POLICY "Service role manages holidays" ON public.nse_holidays FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.nse_holidays (holiday_date, name) VALUES
  ('2026-01-26','Republic Day'),
  ('2026-02-19','Mahashivratri'),
  ('2026-03-04','Holi'),
  ('2026-03-21','Eid-ul-Fitr'),
  ('2026-04-03','Good Friday'),
  ('2026-04-14','Dr. Ambedkar Jayanti'),
  ('2026-05-01','Maharashtra Day'),
  ('2026-05-27','Eid-ul-Adha'),
  ('2026-08-15','Independence Day'),
  ('2026-08-26','Ganesh Chaturthi'),
  ('2026-10-02','Gandhi Jayanti'),
  ('2026-11-09','Diwali Laxmi Pujan'),
  ('2026-11-25','Guru Nanak Jayanti'),
  ('2026-12-25','Christmas')
ON CONFLICT (holiday_date) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_trading_day(d date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXTRACT(DOW FROM d) NOT IN (0,6)
     AND NOT EXISTS (SELECT 1 FROM public.nse_holidays WHERE holiday_date = d);
$$;