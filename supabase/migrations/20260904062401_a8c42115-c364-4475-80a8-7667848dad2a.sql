INSERT INTO public.kv_store_c4d79cb7 (key, value)
VALUES ('engine_running:ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;