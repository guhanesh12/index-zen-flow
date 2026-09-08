#!/usr/bin/env bash
# Auto-deploy Supabase Edge Functions when SUPABASE_ACCESS_TOKEN is available

echo "📦 Checking Supabase deployment configuration..."

if [ -n "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "🚀 Deploying Edge Functions to Supabase project oklgqelcaujxntgjyuis..."
  npx supabase functions deploy make-server-c4d79cb7 --project-ref oklgqelcaujxntgjyuis --no-verify-jwt
  DEPLOY_EXIT_CODE=$?
  if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    echo "✅ Supabase Edge Function make-server-c4d79cb7 deployed successfully!"
  else
    echo "⚠️ Supabase Edge Function deployment exited with code: $DEPLOY_EXIT_CODE"
  fi
else
  echo "ℹ️ [Notice] SUPABASE_ACCESS_TOKEN is not currently set in container environment."
  echo "💡 All broker switching, credentials persistence, and connection testing are actively served live by server.ts (Express + Cloud SQL)."
fi
