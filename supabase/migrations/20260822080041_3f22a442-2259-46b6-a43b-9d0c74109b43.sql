ALTER TABLE public.instrument_master
  ADD COLUMN IF NOT EXISTS aliceblue_token text,
  ADD COLUMN IF NOT EXISTS aliceblue_tradingsymbol text,
  ADD COLUMN IF NOT EXISTS aliceblue_exchange text,
  ADD COLUMN IF NOT EXISTS aliceblue_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_instrument_master_aliceblue_token
  ON public.instrument_master (aliceblue_token);

CREATE OR REPLACE FUNCTION public.apply_aliceblue_instruments(_rows jsonb)
 RETURNS TABLE(updated_count integer, inserted_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  upd int := 0;
  ins int := 0;
BEGIN
  CREATE TEMP TABLE _aliceblue_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_rows) AS x(
    index_name text,
    expiry_date date,
    strike_price numeric,
    option_type text,
    aliceblue_token text,
    aliceblue_tradingsymbol text,
    aliceblue_exchange text,
    lot_size int,
    tick_size numeric,
    exchange_segment text
  );

  UPDATE public.instrument_master im
     SET aliceblue_token = f.aliceblue_token,
         aliceblue_tradingsymbol = f.aliceblue_tradingsymbol,
         aliceblue_exchange = f.aliceblue_exchange,
         aliceblue_synced_at = now()
    FROM _aliceblue_in f
   WHERE im.index_name = f.index_name
     AND im.expiry_date = f.expiry_date
     AND im.strike_price = f.strike_price
     AND im.option_type = f.option_type;
  GET DIAGNOSTICS upd = ROW_COUNT;

  INSERT INTO public.instrument_master (
    symbol, security_id, index_name, strike_price, option_type, expiry_date,
    lot_size, exchange_segment, tick_size,
    aliceblue_token, aliceblue_tradingsymbol, aliceblue_exchange, aliceblue_synced_at
  )
  SELECT f.aliceblue_tradingsymbol,
         'ALICEBLUE-' || f.aliceblue_token,
         f.index_name, f.strike_price, f.option_type, f.expiry_date,
         COALESCE(f.lot_size, 1), COALESCE(f.exchange_segment, 'NSE_FNO'), COALESCE(f.tick_size, 0.05),
         f.aliceblue_token, f.aliceblue_tradingsymbol, f.aliceblue_exchange, now()
    FROM _aliceblue_in f
   WHERE NOT EXISTS (
     SELECT 1 FROM public.instrument_master im
      WHERE im.index_name = f.index_name
        AND im.expiry_date = f.expiry_date
        AND im.strike_price = f.strike_price
        AND im.option_type = f.option_type
   );
  GET DIAGNOSTICS ins = ROW_COUNT;

  RETURN QUERY SELECT upd, ins;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_aliceblue_instruments(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_aliceblue_instruments(jsonb) TO service_role;