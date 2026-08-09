DO $$
BEGIN
  PERFORM public.notify_push_event(
    'TRAILING_ACTIVATED',
    'ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f',
    '🔥 Trailing Activated — NIFTY 24500 CE (TEST)',
    'Profit ₹1,000 reached | Base Target ₹6,000 / SL ₹5,000 | Trail step +₹500',
    jsonb_build_object('url','/positions','test',true)
  );
  PERFORM public.notify_push_event(
    'TRAILING_STEP',
    'ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f',
    '📈 Trailing Step 1 — NIFTY 24500 CE (TEST)',
    'Profit ₹1,500 | Target ₹6,000 → ₹6,500 | SL ₹5,000 → ₹4,500 (profit locked)',
    jsonb_build_object('url','/positions','step',1,'test',true)
  );
END $$;