# Permanent Instructions for Gemini & AI Studio Coding Agent

## 1. Automatic Supabase Deployment on Server Code Edits (LIFETIME DIRECTIVE)
- **Mandatory Action**: Whenever ANY server code, API route, or edge function is edited (such as in `server.ts` or `supabase/functions/make-server-c4d79cb7/*`), the agent **MUST ALWAYS automatically deploy to Supabase** by running:
  ```bash
  bash ./scripts/deploy-supabase.sh
  ```
- **Execution Rules**:
  - Run this deployment automatically in every turn that touches server-side logic.
  - Do not ask for user confirmation before deploying.
  - Verify that the deployment completes with `✅ Supabase Edge Function make-server-c4d79cb7 deployed successfully!`.
  - Report the Supabase deployment status in the turn summary.
