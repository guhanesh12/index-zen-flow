ALTER TABLE public.instrument_master
  ADD COLUMN IF NOT EXISTS groww_trading_symbol text,
  ADD COLUMN IF NOT EXISTS groww_exchange text,
  ADD COLUMN IF NOT EXISTS groww_segment text,
  ADD COLUMN IF NOT EXISTS groww_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_instrument_master_groww_symbol
  ON public.instrument_master (groww_trading_symbol);

CREATE OR REPLACE FUNCTION public.apply_groww_instruments(_rows jsonb)
 RETURNS TABLE(updated_count integer, inserted_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  upd int := 0;
  ins int := 0;
BEGIN
  CREATE TEMP TABLE _groww_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_rows) AS x(
    index_name text,
    expiry_date date,
    strike_price numeric,
    option_type text,
    groww_trading_symbol text,
    groww_exchange text,
    groww_segment text,
    lot_size int,
    tick_size numeric,
    exchange_segment text
  );

  UPDATE public.instrument_master im
     SET groww_trading_symbol = g.groww_trading_symbol,
         groww_exchange = g.groww_exchange,
         groww_segment = g.groww_segment,
         groww_synced_at = now()
    FROM _groww_in g
   WHERE im.index_name = g.index_name
     AND im.expiry_date = g.expiry_date
     AND im.strike_price = g.strike_price
     AND im.option_type = g.option_type;
  GET DIAGNOSTICS upd = ROW_COUNT;

  INSERT INTO public.instrument_master (
    symbol, security_id, index_name, strike_price, option_type, expiry_date,
    lot_size, exchange_segment, tick_size,
    groww_trading_symbol, groww_exchange, groww_segment, groww_synced_at
  )
  SELECT g.groww_trading_symbol,
         'GROWW-' || g.groww_trading_symbol,
         g.index_name, g.strike_price, g.option_type, g.expiry_date,
         COALESCE(g.lot_size, 1), COALESCE(g.exchange_segment, 'NSE_FNO'), COALESCE(g.tick_size, 0.05),
         g.groww_trading_symbol, g.groww_exchange, g.groww_segment, now()
    FROM _groww_in g
   WHERE NOT EXISTS (
     SELECT 1 FROM public.instrument_master im
      WHERE im.index_name = g.index_name
        AND im.expiry_date = g.expiry_date
        AND im.strike_price = g.strike_price
        AND im.option_type = g.option_type
   );
  GET DIAGNOSTICS ins = ROW_COUNT;

  RETURN QUERY SELECT upd, ins;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_groww_instruments(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_groww_instruments(jsonb) TO service_role;