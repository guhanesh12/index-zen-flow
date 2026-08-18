# Broker Integration Playbook (used for Upstox — reuse for any next broker)

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
   `https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/broker/upstox/callback`
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
