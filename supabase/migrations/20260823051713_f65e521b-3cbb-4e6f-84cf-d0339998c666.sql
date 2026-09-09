ALTER TABLE public.instrument_master
  ADD COLUMN IF NOT EXISTS fivepaisa_scrip_code text,
  ADD COLUMN IF NOT EXISTS fivepaisa_scrip_data text,
  ADD COLUMN IF NOT EXISTS fivepaisa_exchange text,
  ADD COLUMN IF NOT EXISTS fivepaisa_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_instrument_master_fivepaisa_scrip_code
  ON public.instrument_master (fivepaisa_scrip_code);

CREATE OR REPLACE FUNCTION public.apply_fivepaisa_instruments(_rows jsonb)
 RETURNS TABLE(updated_count integer, inserted_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  upd int := 0;
  ins int := 0;
BEGIN
  CREATE TEMP TABLE _fivepaisa_in ON COMMIT DROP AS
  SELECT * FROM jsonb_to_recordset(_rows) AS x(
    index_name text,
    expiry_date date,
    strike_price numeric,
    option_type text,
    fivepaisa_scrip_code text,
    fivepaisa_scrip_data text,
    fivepaisa_exchange text,
    lot_size int,
    tick_size numeric,
    exchange_segment text
  );

  UPDATE public.instrument_master im
     SET fivepaisa_scrip_code = f.fivepaisa_scrip_code,
         fivepaisa_scrip_data = f.fivepaisa_scrip_data,
         fivepaisa_exchange = f.fivepaisa_exchange,
         fivepaisa_synced_at = now()
    FROM _fivepaisa_in f
   WHERE im.index_name = f.index_name
     AND im.expiry_date = f.expiry_date
     AND im.strike_price = f.strike_price
     AND im.option_type = f.option_type;
  GET DIAGNOSTICS upd = ROW_COUNT;

  INSERT INTO public.instrument_master (
    symbol, security_id, index_name, strike_price, option_type, expiry_date,
    lot_size, exchange_segment, tick_size,
    fivepaisa_scrip_code, fivepaisa_scrip_data, fivepaisa_exchange, fivepaisa_synced_at
  )
  SELECT COALESCE(f.fivepaisa_scrip_data, f.fivepaisa_scrip_code),
         'FIVEPAISA-' || f.fivepaisa_scrip_code,
         f.index_name, f.strike_price, f.option_type, f.expiry_date,
         COALESCE(f.lot_size, 1), COALESCE(f.exchange_segment, 'NSE_FNO'), COALESCE(f.tick_size, 0.05),
         f.fivepaisa_scrip_code, f.fivepaisa_scrip_data, f.fivepaisa_exchange, now()
    FROM _fivepaisa_in f
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

REVOKE ALL ON FUNCTION public.apply_fivepaisa_instruments(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_fivepaisa_instruments(jsonb) TO service_role;