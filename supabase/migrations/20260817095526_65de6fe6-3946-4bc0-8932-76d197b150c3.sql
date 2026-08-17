CREATE OR REPLACE FUNCTION public.apply_kite_instruments(_rows jsonb)
RETURNS TABLE(updated_count integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  upd int := 0;
  ins int := 0;
BEGIN
  CREATE TEMP TABLE _kite_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_rows) AS x(
    index_name text,
    expiry_date date,
    strike_price numeric,
    option_type text,
    kite_tradingsymbol text,
    kite_instrument_token text,
    kite_exchange text,
    lot_size int,
    tick_size numeric,
    exchange_segment text
  );

  UPDATE public.instrument_master im
     SET kite_tradingsymbol = k.kite_tradingsymbol,
         kite_instrument_token = k.kite_instrument_token,
         kite_exchange = k.kite_exchange,
         kite_synced_at = now()
    FROM _kite_in k
   WHERE im.index_name = k.index_name
     AND im.expiry_date = k.expiry_date
     AND im.strike_price = k.strike_price
     AND im.option_type = k.option_type;
  GET DIAGNOSTICS upd = ROW_COUNT;

  INSERT INTO public.instrument_master (
    symbol, security_id, index_name, strike_price, option_type, expiry_date,
    lot_size, exchange_segment, tick_size,
    kite_tradingsymbol, kite_instrument_token, kite_exchange, kite_synced_at
  )
  SELECT k.kite_tradingsymbol,
         'KITE-' || k.kite_instrument_token,
         k.index_name, k.strike_price, k.option_type, k.expiry_date,
         COALESCE(k.lot_size, 1), COALESCE(k.exchange_segment, 'NSE_FNO'), COALESCE(k.tick_size, 0.05),
         k.kite_tradingsymbol, k.kite_instrument_token, k.kite_exchange, now()
    FROM _kite_in k
   WHERE NOT EXISTS (
     SELECT 1 FROM public.instrument_master im
      WHERE im.index_name = k.index_name
        AND im.expiry_date = k.expiry_date
        AND im.strike_price = k.strike_price
        AND im.option_type = k.option_type
   );
  GET DIAGNOSTICS ins = ROW_COUNT;

  RETURN QUERY SELECT upd, ins;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_kite_instruments(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_kite_instruments(jsonb) TO service_role;