ALTER TABLE public.instrument_master
  ADD COLUMN IF NOT EXISTS angelone_tradingsymbol text,
  ADD COLUMN IF NOT EXISTS angelone_symbol_token text,
  ADD COLUMN IF NOT EXISTS angelone_exchange text,
  ADD COLUMN IF NOT EXISTS angelone_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_instrument_master_angelone_symbol
  ON public.instrument_master (angelone_tradingsymbol);

CREATE OR REPLACE FUNCTION public.apply_angelone_instruments(_rows jsonb)
RETURNS TABLE(updated_count integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  upd int := 0;
  ins int := 0;
BEGIN
  CREATE TEMP TABLE _angelone_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_rows) AS x(
    index_name text,
    expiry_date date,
    strike_price numeric,
    option_type text,
    angelone_tradingsymbol text,
    angelone_symbol_token text,
    angelone_exchange text,
    lot_size int,
    tick_size numeric,
    exchange_segment text
  );

  UPDATE public.instrument_master im
     SET angelone_tradingsymbol = a.angelone_tradingsymbol,
         angelone_symbol_token = a.angelone_symbol_token,
         angelone_exchange = a.angelone_exchange,
         angelone_synced_at = now()
    FROM _angelone_in a
   WHERE im.index_name = a.index_name
     AND im.expiry_date = a.expiry_date
     AND im.strike_price = a.strike_price
     AND im.option_type = a.option_type;
  GET DIAGNOSTICS upd = ROW_COUNT;

  INSERT INTO public.instrument_master (
    symbol, security_id, index_name, strike_price, option_type, expiry_date,
    lot_size, exchange_segment, tick_size,
    angelone_tradingsymbol, angelone_symbol_token, angelone_exchange, angelone_synced_at
  )
  SELECT a.angelone_tradingsymbol,
         'ANGELONE-' || a.angelone_symbol_token,
         a.index_name, a.strike_price, a.option_type, a.expiry_date,
         COALESCE(a.lot_size, 1), COALESCE(a.exchange_segment, 'NSE_FNO'), COALESCE(a.tick_size, 0.05),
         a.angelone_tradingsymbol, a.angelone_symbol_token, a.angelone_exchange, now()
    FROM _angelone_in a
   WHERE NOT EXISTS (
     SELECT 1 FROM public.instrument_master im
      WHERE im.index_name = a.index_name
        AND im.expiry_date = a.expiry_date
        AND im.strike_price = a.strike_price
        AND im.option_type = a.option_type
   );
  GET DIAGNOSTICS ins = ROW_COUNT;

  RETURN QUERY SELECT upd, ins;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_angelone_instruments(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_angelone_instruments(jsonb) TO service_role;