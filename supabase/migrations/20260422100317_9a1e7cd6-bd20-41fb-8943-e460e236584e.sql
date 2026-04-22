-- 1. Update wallet balances for the 2 users with profit > ₹100 today
UPDATE kv_store_c4d79cb7
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(value, '{balance}', '98450'::jsonb),
      '{totalDeducted}', '3250'::jsonb
    ),
    '{lastDebitDate}', '"2026-04-22"'::jsonb
  ),
  '{lastDebitTier}', '1'::jsonb
)
WHERE key = 'wallet:ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f';

UPDATE kv_store_c4d79cb7
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(value, '{balance}', '114'::jsonb),
      '{totalDeducted}', '686'::jsonb
    ),
    '{lastDebitDate}', '"2026-04-22"'::jsonb
  ),
  '{lastDebitTier}', '1'::jsonb
)
WHERE key = 'wallet:df759bae-703e-4659-babc-d2d1f854666e';

-- 2. Sync signal_stats so backend recognizes today's profit
INSERT INTO signal_stats (user_id, stat_date, total_pnl, successful_orders)
VALUES 
  ('ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f', CURRENT_DATE, 378.63, 2),
  ('df759bae-703e-4659-babc-d2d1f854666e', CURRENT_DATE, 136.50, 2)
ON CONFLICT (user_id, stat_date) DO UPDATE
SET total_pnl = EXCLUDED.total_pnl,
    successful_orders = EXCLUDED.successful_orders,
    updated_at = now();

-- 3. Set daily_profit tracking to mark Tier 1 as already debited (prevents double charge)
INSERT INTO kv_store_c4d79cb7 (key, value) VALUES
('daily_profit:ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f:2026-04-22',
 '{"date":"2026-04-22","profit":378.63,"lastDebitedTier":1,"lastDebitAmount":29,"lastDebitTimestamp":1776852000000}'::jsonb),
('daily_profit:df759bae-703e-4659-babc-d2d1f854666e:2026-04-22',
 '{"date":"2026-04-22","profit":136.50,"lastDebitedTier":1,"lastDebitAmount":29,"lastDebitTimestamp":1776852000000}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 4. Append wallet transactions so they appear in user wallet + admin transactions
UPDATE kv_store_c4d79cb7
SET value = COALESCE(value, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
  'id', 'txn_backfill_' || extract(epoch from now())::bigint || '_ae08130c',
  'userId', 'ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f',
  'type', 'debit',
  'amount', 29,
  'balance', 98450,
  'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'description', 'TIER 1 Fee (Profit: ₹378.63) - Backfill',
  'source', 'auto_debit_tiered_backfill',
  'tier', 1,
  'tierName', 'TIER 1'
))
WHERE key = 'wallet_transactions:ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f';

INSERT INTO kv_store_c4d79cb7 (key, value)
SELECT 'wallet_transactions:ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f',
       jsonb_build_array(jsonb_build_object(
         'id', 'txn_backfill_' || extract(epoch from now())::bigint || '_ae08130c',
         'userId', 'ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f',
         'type', 'debit', 'amount', 29, 'balance', 98450,
         'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'description', 'TIER 1 Fee (Profit: ₹378.63) - Backfill',
         'source', 'auto_debit_tiered_backfill', 'tier', 1, 'tierName', 'TIER 1'
       ))
WHERE NOT EXISTS (SELECT 1 FROM kv_store_c4d79cb7 WHERE key = 'wallet_transactions:ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f');

UPDATE kv_store_c4d79cb7
SET value = COALESCE(value, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
  'id', 'txn_backfill_' || extract(epoch from now())::bigint || '_df759bae',
  'userId', 'df759bae-703e-4659-babc-d2d1f854666e',
  'type', 'debit',
  'amount', 29,
  'balance', 114,
  'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'description', 'TIER 1 Fee (Profit: ₹136.50) - Backfill',
  'source', 'auto_debit_tiered_backfill',
  'tier', 1,
  'tierName', 'TIER 1'
))
WHERE key = 'wallet_transactions:df759bae-703e-4659-babc-d2d1f854666e';

INSERT INTO kv_store_c4d79cb7 (key, value)
SELECT 'wallet_transactions:df759bae-703e-4659-babc-d2d1f854666e',
       jsonb_build_array(jsonb_build_object(
         'id', 'txn_backfill_' || extract(epoch from now())::bigint || '_df759bae',
         'userId', 'df759bae-703e-4659-babc-d2d1f854666e',
         'type', 'debit', 'amount', 29, 'balance', 114,
         'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'description', 'TIER 1 Fee (Profit: ₹136.50) - Backfill',
         'source', 'auto_debit_tiered_backfill', 'tier', 1, 'tierName', 'TIER 1'
       ))
WHERE NOT EXISTS (SELECT 1 FROM kv_store_c4d79cb7 WHERE key = 'wallet_transactions:df759bae-703e-4659-babc-d2d1f854666e');