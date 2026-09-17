update public.user_pins
set pin_hash = '0993b8f77a4a0f5dbea20f37486f4cd15791396e9388cf50c3706cf8624afff3',
    pin_salt = '499d996f617347d607df04db75a46147',
    failed_attempts = 0,
    locked_until = null,
    updated_at = now()
where user_id = 'ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f';