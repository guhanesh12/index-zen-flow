# Plan: Add Dhan OAuth (API Key + Secret) Broker Connection

Add a second authentication method to the Broker Setup page so users can connect Dhan via the OAuth (API Key + Secret) flow in addition to the existing direct Access Token method. API Key + Secret are valid for 12 months and will be persisted in the database; the resulting Access Token is auto-refreshed on demand.

## 1. Database

New table `broker_credentials` (per user, one row per broker):

- `user_id` (text, unique)
- `broker` (text, default `dhan`)
- `auth_method` (text: `access_token` | `api_key`)
- `dhan_client_id` (text)
- `api_key` (text, nullable)
- `api_secret` (text, nullable)             ← stored encrypted via pgcrypto
- `access_token` (text, nullable)
- `access_token_expiry` (timestamptz)
- `api_key_expiry` (timestamptz, +12 months)
- `redirect_url` (text)
- `postback_url` (text, nullable)
- `last_consent_app_id` (text)
- `last_token_id` (text)
- `created_at`, `updated_at`

RLS: user can read/update their own row; service role full access.

## 2. Backend (edge function `make-server-c4d79cb7`)

New routes mounted under `/broker/oauth`:

```text
POST /broker/oauth/save-keys          body { dhanClientId, apiKey, apiSecret, redirectUrl, postbackUrl? }
POST /broker/oauth/generate-consent   → calls https://auth.dhan.co/app/generate-consent
GET  /broker/oauth/callback           ← Dhan 302-redirect lands here, captures tokenId, auto-runs consume, then redirects user back to app
POST /broker/oauth/consume            body { tokenId } → calls https://auth.dhan.co/app/consumeApp-consent
GET  /broker/oauth/status             returns connection + expiry info
POST /broker/oauth/refresh            re-runs consent flow link generation when access token < 1 hour
POST /broker/oauth/disconnect
```

Each handler validates the JWT, loads `broker_credentials`, talks to Dhan, stores results, returns sanitised data (never returns `api_secret`).

`callback` page returns minimal HTML that posts a `window.opener` message + closes the popup.

## 3. Frontend

In `SettingsPanel.tsx` (Broker → Connect tab), add a tab switcher:

- **Tab A — Access Token** (existing UI, unchanged)
- **Tab B — API Key & Secret (12 months)** (new)

New Tab B fields:
- Dhan Client ID
- API Key
- API Secret (masked)
- Redirect URL (prefilled with our `/broker/oauth/callback`)
- Postback URL (optional)
- **Save Keys** button → `POST /broker/oauth/save-keys`
- **Connect with Dhan** button → calls `generate-consent`, opens `https://auth.dhan.co/login/consentApp-login?consentAppId=...` in a popup, listens for `postMessage` from callback, then refreshes status
- Status card: shows Access Token expiry countdown + API Key expiry (12 mo) + Reconnect button

All copy stays in the same dark theme/semantic-token style as the existing panel.

## 4. After build — React Native prompt deliverable

Once shipped, return a single ready-to-paste prompt containing:
- All real backend URLs (`https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/broker/oauth/...`)
- All Dhan endpoints used
- Step-by-step flow (save-keys → generate-consent → in-app browser opens consent URL → deep-link back with `tokenId` → consume → store → use access token in headers)
- Required headers, request bodies, response shapes
- Suggested screens & components for the React Native app

## Technical notes

- `api_secret` encrypted with `pgp_sym_encrypt(secret, current_setting('app.broker_key'))` on insert and `pgp_sym_decrypt(...)` on read inside the edge function only. The symmetric key is stored as a Supabase secret `BROKER_ENC_KEY`.
- Access Token expiry is parsed from Dhan response (`expiryTime`, IST). A daily cron (already exists: `execute_backend_engine`) gets a sibling cron to call `/broker/oauth/refresh-all` for users whose token expires < 2 h.
- Existing `/api-credentials` endpoint stays for backward compat; new endpoints live alongside.
- No change to trading engine — it just reads `access_token` from `broker_credentials` if present, otherwise falls back to the legacy KV store.
