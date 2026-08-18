ALTER TABLE public.instrument_master
  ADD COLUMN IF NOT EXISTS upstox_instrument_key text,
  ADD COLUMN IF NOT EXISTS upstox_tradingsymbol text,
  ADD COLUMN IF NOT EXISTS upstox_exchange text,
  ADD COLUMN IF NOT EXISTS upstox_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_instrument_master_upstox_key ON public.instrument_master (upstox_instrument_key);

CREATE OR REPLACE FUNCTION public.apply_upstox_instruments(_rows jsonb)
 RETURNS TABLE(updated_count integer, inserted_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  upd int := 0;
  ins int := 0;
BEGIN
  CREATE TEMP TABLE _upstox_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_rows) AS x(
    index_name text,
    expiry_date date,
    strike_price numeric,
    option_type text,
    upstox_instrument_key text,
    upstox_tradingsymbol text,
    upstox_exchange text,
    lot_size int,
    tick_size numeric,
    exchange_segment text
  );

  UPDATE public.instrument_master im
     SET upstox_instrument_key = u.upstox_instrument_key,
         upstox_tradingsymbol = u.upstox_tradingsymbol,
         upstox_exchange = u.upstox_exchange,
         upstox_synced_at = now()
    FROM _upstox_in u
   WHERE im.index_name = u.index_name
     AND im.expiry_date = u.expiry_date
     AND im.strike_price = u.strike_price
     AND im.option_type = u.option_type;
  GET DIAGNOSTICS upd = ROW_COUNT;

  INSERT INTO public.instrument_master (
    symbol, security_id, index_name, strike_price, option_type, expiry_date,
    lot_size, exchange_segment, tick_size,
    upstox_instrument_key, upstox_tradingsymbol, upstox_exchange, upstox_synced_at
  )
  SELECT u.upstox_tradingsymbol,
         'UPSTOX-' || u.upstox_instrument_key,
         u.index_name, u.strike_price, u.option_type, u.expiry_date,
         COALESCE(u.lot_size, 1), COALESCE(u.exchange_segment, 'NSE_FNO'), COALESCE(u.tick_size, 0.05),
         u.upstox_instrument_key, u.upstox_tradingsymbol, u.upstox_exchange, now()
    FROM _upstox_in u
   WHERE NOT EXISTS (
     SELECT 1 FROM public.instrument_master im
      WHERE im.index_name = u.index_name
        AND im.expiry_date = u.expiry_date
        AND im.strike_price = u.strike_price
        AND im.option_type = u.option_type
   );
  GET DIAGNOSTICS ins = ROW_COUNT;

  RETURN QUERY SELECT upd, ins;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_upstox_instruments(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_upstox_instruments(jsonb) TO service_role;