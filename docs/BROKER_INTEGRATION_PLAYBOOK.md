# Broker Integration Playbook (used for Upstox — reuse for any next broker)

➡️ Ready-made fill-in prompt: **`docs/NEW_BROKER_INTEGRATION_PROMPT.md`** — paste the broker
name + documentation URLs into it and send; the whole integration below is generated.

Give me only two things for a new broker and I repeat this exact process:

1. Broker name (e.g. "Upstox")
2. Documentation URLs for: authentication, margin/funds, place order, orders, positions, instruments

Everything below is what gets built — no other change is ever needed in the web app,
admin panel, landing page or React Native app.

---

## 1. Files touched per broker

| File | What it holds |
| --- | --- |
| `supabase/functions/make-server-c4d79cb7/<broker>_service.tsx` | Auth headers, funds, place/cancel/status order, positions, LTP — all normalized to the Dhan response shape |
| `supabase/functions/make-server-c4d79cb7/<broker>_instruments.tsx` | Daily contract dump → `instrument_master` merge (NIFTY / BANKNIFTY / SENSEX, nearest 2 expiries), cached once per IST day for all users |
| `broker_router.tsx` | Credentials in KV, `getXService()`, symbol resolution, branch inside `placeOrderSmart` / `getFundsSmart` / `getPositionsSmart` / `getLtpSmart` / `getOrderStatusSmart` / `cancelOrderSmart` |
| `broker_registry.tsx` | Catalog entry → `status: "live"` (drives landing page + admin toggle + user chooser) |
| `index.ts` | `/broker/<id>/status · save-keys · login-url · callback · verify · disconnect · instruments/status · instruments/sync` plus the `/fund-limits` and `/positions` branch |
| DB migration | `<broker>_*` mapping columns on `instrument_master` + `apply_<broker>_instruments(jsonb)` merge function |
| `src/app/components/<Broker>Connect.tsx` | Connect card (keys / OAuth login / verify / sync / disconnect / live balance) |
| `SettingsPanel.tsx` | One line to render the card when that broker is active |

Landing page (`SupportedBrokers.tsx`), Admin Broker Control and the RN app read the registry —
they pick the new broker up automatically with **zero** extra code.

---

## 2. Upstox integration — what is live now

**Registry:** `upstox` is `status: "live"`, `defaultEnabled: true`, colour `#7c3aed`,
features: orders · positions · funds · instruments · static-ip · oauth.

**Authentication** (https://upstox.com/developer/api-documentation/authentication)
1. User creates an app at account.upstox.com → Developer → Apps.
2. Redirect URI to register (shown + copyable in the UI):
   `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/upstox/callback`
3. `POST /broker/upstox/save-keys` `{ apiKey, apiSecret }` (also accepts a ready `accessToken`).
4. `GET /broker/upstox/login-url` → opens `…/v2/login/authorization/dialog` with a one-time `state`.
5. Upstox redirects to `/broker/upstox/callback?code=&state=` → server exchanges the code at
   `POST /v2/login/authorization/token` and stores the daily access token in KV
   (`upstox_credentials:<userId>` — never in the database).
6. `POST /broker/upstox/verify` re-checks the session; `POST /broker/upstox/disconnect` clears it.

**Funds** — `GET /v2/user/get-funds-and-margin?segment=SEC` → normalized to
`{ availableBalance, sodLimit, collateralAmount, utilizationAmount }`, same card as Dhan.

**Orders** — `POST /v3/order/place` (MARKET, DAY, `slice: true`, product `D`/`I` mapped from the
Dhan product type). Exit/SELL uses the identical path, so the existing exit button works unchanged.
Status: `GET /v2/order/details`, cancel: `DELETE /v2/order/cancel`.

**Positions** — `GET /v2/portfolio/short-term-positions`, mapped into the Dhan position shape used
by the monitor, journal and dashboard.

**Instruments** — `NSE.json.gz` + `BSE.json.gz` from assets.upstox.com, gunzipped in the edge
function, filtered to NIFTY / BANKNIFTY / SENSEX options for the nearest 2 expiries and merged into
`instrument_master` via `apply_upstox_instruments()`. One download per day for all users; triggered
automatically on broker switch and connect, or manually with **Sync contracts**.

**Order routing / static IP** — all Upstox calls go through `makeBrokerProxy(userId, "upstox")`,
i.e. the user's own VPS `/broker-request` (v1.4.0 knows Upstox), with automatic direct-API fallback
if the VPS is older or unreachable. Same dedicated IP already purchased for Dhan.

---

## 3. Where the user sees it

- **Landing page** → Supported Brokers section lists Upstox automatically.
- **Admin → Broker Control** → Upstox toggle ON/OFF for every user (OFF hides it everywhere).
- **User → Broker Setup** → chooser shows Upstox; picking it wipes the other broker's session
  (one user = one broker), downloads Upstox contracts, and shows the Upstox connect card.
- **Dashboard** → fund card, positions, orders, exit button and signal execution all read the
  active broker, so they flip to Upstox the moment it is connected.
- **React Native app** → nothing to change; `/brokers` and `/broker/active` already return Upstox
  (see `docs/RN_MULTI_BROKER_FULL_PROMPT.md`).

---

## 4. API quick reference (identical shape for every broker)

```
GET  /brokers                                   public catalog (enabled only)
GET  /broker/active                             activeBroker, connected, available{}, brokers[]
POST /broker/active            { broker }       switch (wipes other sessions, syncs contracts)
GET  /broker/upstox/status
POST /broker/upstox/save-keys  { apiKey, apiSecret }
GET  /broker/upstox/login-url                   → { url, redirectUri }
GET  /broker/upstox/callback?code=&state=       (browser redirect, public)
POST /broker/upstox/verify
POST /broker/upstox/disconnect
GET  /broker/upstox/instruments/status
POST /broker/upstox/instruments/sync
GET  /fund-limits                               broker-agnostic funds
GET  /positions | /live-positions               broker-agnostic positions
POST /execute-dhan-order       { action, symbol, quantity, orderId }   broker-agnostic entry/exit
```

## ⚠️ Known pitfall: engine must be broker-aware (fixed)

**Symptom:** user selects Zerodha / Groww / Upstox, dashboard shows "connected",
but the engine never trades and open positions stop being monitored.

**Cause:** `selectBroker()` deletes the Dhan KV session (`api_credentials:<userId>`),
while `persistent_engine.tsx` gated every tick on Dhan credentials
(`if (!credentials?.dhanClientId || !credentials?.dhanAccessToken) return;`).

**Fix now in place:**
- `loadEngineCredentials(userId)` — own Dhan creds first; for a non-Dhan active broker
  with a live session it falls back to the **central market-data** Dhan credentials,
  used only for candles/LTP.
- Used by the cron engine loop, the orphan-position monitor and
  `startPositionMonitorLoops`.
- Position reads go through `BrokerRouter.getPositionsSmart(userId, dhanFetch)`;
  orders/exits already use `placeOrderSmart`.

**Rule for every new broker:** no raw `DhanService` call and no Dhan-credential guard
may decide whether a user's engine runs.

---

## 5. Fyers — what is live now

**Registry:** `fyers` is `status: "live"`, `defaultEnabled: true`, colour `#0ea5e9`,
features: orders · positions · funds · instruments · static-ip · oauth.

**Authentication** (https://myapi.fyers.in/docsv3)
1. User creates an app at myapi.fyers.in → My Apps (App ID looks like `XXXXXXXXXX-100`).
2. Redirect URI to register (shown + copyable in the UI):
   `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/fyers/callback`
3. `POST /broker/fyers/save-keys` `{ appId, appSecret }` (also accepts a ready `accessToken`).
4. `GET /broker/fyers/login-url` → `…/api/v3/generate-authcode` with a one-time `state`.
5. Fyers redirects to `/broker/fyers/callback?auth_code=&state=` → server exchanges it at
   `POST /api/v3/validate-authcode` using `appIdHash = SHA256(appId:appSecret)` and stores the
   daily token in KV (`fyers_credentials:<userId>` — never in the database).
6. `POST /broker/fyers/verify` re-checks the session; `POST /broker/fyers/disconnect` clears it.
   Auth header on every call: `Authorization: <appId>:<accessToken>`.

**Funds** — `GET /api/v3/funds` → normalized to
`{ availableBalance, sodLimit, collateralAmount, utilizationAmount }`.

**Orders** — `POST /api/v3/orders/sync` (MARKET type 2, DAY, product `INTRADAY`/`MARGIN` mapped from
the Dhan product type). Status: `GET /api/v3/orders`, cancel: `DELETE /api/v3/orders/sync`.

**Positions** — `GET /api/v3/positions`, mapped into the Dhan position shape.

**Instruments** — `https://public.fyers.in/sym_details/{NSE_FO,BSE_FO}_sym_master.json`, filtered to
NIFTY / BANKNIFTY / SENSEX options for the nearest 2 expiries and merged into `instrument_master`
via `apply_fyers_instruments()`, cached once per IST day.

**Routing** — all Fyers calls go through `makeBrokerProxy(userId, "fyers")` (static-IP VPS
`/broker-request`) with direct-API fallback. Engine stays broker-aware via
`loadEngineCredentials()` + `getPositionsSmart()` / `placeOrderSmart()`.

## 6. Angel One (SmartAPI) — what is live now

**Auth is NOT OAuth.** Angel One logs in with API Key + Client Code + MPIN/password + a 6-digit
TOTP. IndexPilot stores the user's base32 TOTP secret and generates the code itself
(`angeloneTotp()`, RFC 6238 / HMAC-SHA1), so there is no redirect URI to whitelist.

1. User enters keys in `AngelOneConnect.tsx` → `POST /broker/angelone/login`.
2. Server calls `/rest/auth/angelbroking/user/v1/loginByPassword` and stores
   `jwtToken` / `refreshToken` / `feedToken` in KV (`angelone_credentials:{userId}`).
3. `selectBroker(userId, "angelone")` enforces ONE USER = ONE BROKER and wipes other sessions.
4. Sessions expire daily — the status endpoint reports `token_invalid` and the UI prompts re-login.

**Endpoints** — `/broker/angelone/{status,login,verify,disconnect,instruments/status,instruments/sync}`.

**Instruments** — daily `OpenAPIScripMaster.json`, filtered to NIFTY / BANKNIFTY / SENSEX options
for the nearest expiries, merged via `apply_angelone_instruments()`. Note: strike price arrives in
paise (divide by 100) and expiry is formatted `28AUG2025`.

**Routing** — all calls go through `makeBrokerProxy(userId, "angelone", ANGELONE_API)` for
static-IP execution. Orders/positions/funds/LTP/cancel all have `angelone` branches in
`broker_router.tsx`, and `loadEngineCredentials()` falls back to central market-data credentials so
the trading engine keeps running for Angel One users.
