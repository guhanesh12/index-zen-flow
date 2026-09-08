# Permanent Project Instructions & Workflow Directives

## 1. Supabase Edge Functions Deployment (LIFETIME DIRECTIVE - CRITICAL)
- **Automatic Deployment Trigger**: Whenever any server-side code is edited or modified—including `server.ts`, `supabase/functions/**`, backend services, or API handlers—the agent **MUST AUTOMATICALLY execute the Supabase deployment script**:
  ```bash
  bash ./scripts/deploy-supabase.sh
  ```
- **Execution Rule**:
  - Always run this script automatically before concluding the turn whenever server-side code changes occur.
  - Never wait for the user to ask or remind you to deploy to Supabase.
  - Verify that the deployment completes successfully (`Deployed Functions on project oklgqelcaujxntgjyuis: make-server-c4d79cb7` and `✅ Supabase Edge Function make-server-c4d79cb7 deployed successfully!`).
- **Deployment Credentials**:
  - Project Reference: `oklgqelcaujxntgjyuis`
  - Function Name: `make-server-c4d79cb7`
  - Access Token: Provided in container environment via `SUPABASE_ACCESS_TOKEN`.
