# IndexPilot — React Native "All Brokers" Module — FULL BUILD PROMPT

Paste this whole file into your RN agent. It is a complete, self-contained spec for the
broker module: logos, credential fields, connect buttons, redirect handling, connection
status, broker switching, per-broker funds/positions, and automatic instrument mapping in
the database (the app never downloads any instrument file).

The RN app must mirror the React web app 1:1. Same endpoints, same field names, same flow.

---

## 0. Base config

```ts
export const BASE = 'https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7';
export const SUPABASE_URL = 'https://oklgqelcaujxntgjyuis.supabase.co';
export const SUPABASE_ANON_KEY = '<anon key from web .env: VITE_SUPABASE_PUBLISHABLE_KEY>';
```

Every call is authenticated with the Supabase user session:

```ts
const { data } = await supabase.auth.getSession();
const token = data.session?.access_token;

async function api(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
  return json;
}
```

Rules:
- 401 → refresh the session once (`supabase.auth.refreshSession()`) and retry, then send the user to Login.
- Never store broker secrets in AsyncStorage. They are posted once and stay server-side (encrypted).

---

## 1. Broker catalog (driven by the server — never hardcode the list)

```
GET /brokers          →  { brokers: [ { id, name, short, status, color, website, features[], enabled } ] }
GET /broker/active    →  { activeBroker: 'dhan' | 'zerodha' | 'groww' | 'upstox' | 'fyers' | 'angelone' | 'aliceblue' | '5paisa' | null, ... }
POST /broker/active   body { broker: '<id>' }  →  switches the user's single active broker
```

Only render brokers with `enabled === true`. When admin adds broker #9 tomorrow, the RN app
picks it up automatically — do **not** hardcode an array of 8.

### Logo mapping (bundle these 8 PNGs, key by broker id)

```ts
// src/broker/logos.ts
export const BROKER_LOGOS: Record<string, any> = {
  dhan:      require('../assets/brokers/dhan.png'),
  zerodha:   require('../assets/brokers/zerodha.png'),
  kite:      require('../assets/brokers/zerodha.png'),
  groww:     require('../assets/brokers/groww.png'),
  upstox:    require('../assets/brokers/upstox.png'),
  angelone:  require('../assets/brokers/angelone.png'),
  fyers:     require('../assets/brokers/fyers.png'),
  aliceblue: require('../assets/brokers/aliceblue.png'),
  '5paisa':  require('../assets/brokers/fivepaisa.png'),
  fivepaisa: require('../assets/brokers/fivepaisa.png'),
};

export function BrokerLogo({ id, name, color = '#64748b', size = 40 }) {
  const src = BROKER_LOGOS[String(id || '').toLowerCase()];
  if (!src) {
    return (
      <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: color,
                     alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>
          {(name || id || '?').slice(0, 1).toUpperCase()}
        </Text>
      </View>
    );
  }
  return <Image source={src} style={{ width: size, height: size, borderRadius: 12 }} resizeMode="contain" />;
}
```

Unknown/new broker id → coloured initial fallback using `color` from `/brokers`. Never crash.

---

## 2. Broker card UI (one card per broker)

Each card shows:
1. `BrokerLogo` (48px) + broker name + `short` chip.
2. Status pill from that broker's `/status` endpoint:
   - green **Connected** (+ balance if returned), amber **Keys saved — login pending**,
     red **Token rejected / expired**, grey **Not connected**.
3. `ACTIVE` badge when `id === activeBroker`.
4. Credential inputs (exact fields in §3) — only rendered when expanded.
5. Buttons: **Save Keys** → **Connect / Login** → **Test Connection** → **Disconnect**,
   plus **Use this broker** (calls `POST /broker/active`) when not active.

Rule: one user = one active broker. Saving keys / completing login for a broker
automatically makes it active on the server; the app must refetch funds + positions after.

---

## 3. Per-broker credential fields, endpoints and flow (A → Z)

Every broker exposes the same 5-verb shape:

```
GET  /broker/<id>/status
POST /broker/<id>/save-keys      (or /login for Angel One, /vendor-start for Aliceblue)
GET  /broker/<id>/login-url      (OAuth brokers only)
POST /broker/<id>/verify
POST /broker/<id>/disconnect
GET  /broker/<id>/instruments/status
POST /broker/<id>/instruments/sync
```

### 3.1 Dhan — `dhan` (OAuth, base path is `/broker/oauth/*`)

| Field | Key | Notes |
|---|---|---|
| Dhan Client ID | `dhanClientId` | numeric UCC |
| API Key | `apiKey` | App ID from Dhan |
| API Secret | `apiSecret` | password input, valid 12 months |
| Redirect URL | `redirectUrl` | prefilled + copy button |
| Postback URL | `postbackUrl` | optional |

Default redirect (must match the Dhan portal exactly):
`https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/oauth/callback`

Flow: `POST /broker/oauth/save-keys` → `POST /broker/oauth/generate-consent` returns
`{ loginUrl }` → open in in-app browser → Dhan redirects to the callback with `?tokenId=…`
→ deep-link back → `POST /broker/oauth/consume { tokenId }` → response includes
`liveCheck { ok, balance, error, errorCode }`. If `liveCheck.ok === false` show the error —
do **not** claim connected. Status: `GET /broker/oauth/status`, verify:
`POST /broker/oauth/verify`, disconnect: `POST /broker/oauth/disconnect`.

### 3.2 Zerodha Kite — `zerodha` / routes `/broker/kite/*` (OAuth)

Fields: `apiKey`, `apiSecret`, `redirectUrl` (server default returned by
`GET /broker/kite/status` as `defaultRedirect`).

Flow: `POST /broker/kite/save-keys` → `GET /broker/kite/login-url` → open → Kite returns
`request_token` to `/broker/kite/callback` → app receives it via deep link →
`POST /broker/kite/consume { requestToken }` → `POST /broker/kite/verify`.

### 3.3 Groww — `groww` (token paste, no OAuth)

Fields: `accessToken` (Trade API access token, min 20 chars), optional `growwUserId`.
Flow: `POST /broker/groww/save-keys { accessToken }` → server verifies live before saving →
`GET /broker/groww/status`, `POST /broker/groww/verify`, `POST /broker/groww/disconnect`.

### 3.4 Upstox — `upstox` (OAuth)

Fields: `apiKey`, `apiSecret` (an `accessToken` may be pasted instead).
Flow: `POST /broker/upstox/save-keys` → `GET /broker/upstox/login-url` → browser →
`/broker/upstox/callback?code=…` handled server-side → deep link back → poll
`GET /broker/upstox/status` until `connected`.

### 3.5 Fyers — `fyers` (OAuth)

Fields: `appId` (alias `apiKey`), `appSecret` (alias `apiSecret`).
Flow: `POST /broker/fyers/save-keys` → `GET /broker/fyers/login-url` → browser →
`/broker/fyers/callback` → deep link back → `GET /broker/fyers/status` /
`POST /broker/fyers/verify`. Fyers funds come from `/api/v3/funds` (id-based parsing done
server-side; the app just reads `availableBalance`).

### 3.6 Angel One — `angelone` (direct login, no OAuth)

`POST /broker/angelone/login` body:

| Field | Key | Validation |
|---|---|---|
| SmartAPI Trading API Key | `apiKey` | 5–128 chars |
| Client Code | `clientCode` | alphanumeric, uppercased |
| MPIN / password | `password` | secure input |
| TOTP code **or** TOTP secret | `totp` / `totpSecret` | `totp` = exactly 6 digits; `totpSecret` = Base32 (A–Z, 2–7) |

Show one input labelled "6-digit TOTP or Base32 secret" and send it as `totp` when it is
`/^\d{6}$/`, otherwise as `totpSecret`. Extras: `POST /broker/angelone/reconnect`,
`/verify`, `/disconnect`, `GET /broker/angelone/status`.

### 3.7 Aliceblue — `aliceblue` (ANT vendor flow)

`POST /broker/aliceblue/vendor-start` body: `appCode` (required), `apiSecret` (required),
`userId` (optional — Aliceblue returns it on redirect). Response gives the ANT login URL
(`https://ant.aliceblueonline.com/?appcode=…`). Open it → Aliceblue redirects to
`/broker/aliceblue/callback` with `userId` + `authCode` → server finalizes the session and
renders a success page → deep link back → `GET /broker/aliceblue/status`.
Also available: `/broker/aliceblue/login`, `/save-keys`, `/reconnect`, `/verify`, `/disconnect`.

### 3.8 5paisa — `5paisa` (Xstream OAuth)

`POST /broker/5paisa/save-keys` body: `appKey` (alias `vendorKey`), `encryptionKey`
(alias `encryKey`), `userKey` (alias `userId`). Then `GET /broker/5paisa/login-url` → open →
5paisa hits `/broker/5paisa/callback` (GET **or** POST, both supported) → deep link back.
If the user is bounced with a URL instead, accept a pasted full redirect URL and send it to
`POST /broker/5paisa/exchange` — extract `RequestToken` from the URL client-side or paste raw.
Then `/verify`, `/disconnect`.

---

## 4. Redirect / deep-link handling (mandatory)

All broker callbacks land on the **server** (`api.indexpilotai.com/.../broker/<id>/callback`),
which renders a small success page. The RN app must:

1. Open login URLs with `expo-web-browser` `openAuthSessionAsync(loginUrl, 'indexpilot://broker-callback')`
   (or Android Custom Tabs + `Linking`).
2. Register the deep link scheme `indexpilot://broker-callback` in `app.json` / `AndroidManifest` / `Info.plist`.
3. On dismiss **or** deep link, immediately:
   - if a `tokenId` / `requestToken` / `RequestToken` param is present → call the matching
     `consume` / `exchange` endpoint;
   - always re-poll `GET /broker/<id>/status` every 1.5 s for up to 20 s until `connected`.
4. Also refetch status on `AppState` change → `active` and on screen focus. The web app does
   the same with a window-focus listener; without it users see "connected" only after a manual reload.

---

## 5. Broker switching → funds, positions and instruments must follow

When the user taps **Use this broker**:

```ts
await api('/broker/active', { method: 'POST', body: JSON.stringify({ broker: id }) });
setActiveBroker(id);
clearFunds(); clearPositions();          // never show the previous broker's numbers
await Promise.all([loadFunds(id), loadPositions(id), syncInstruments(id)]);
```

### Funds
```
GET /fund-limits  → { success, broker, availableBalance, ... }
```
### Positions
```
GET /positions    → { success, broker, positions: [...] }
```

Both responses carry `broker`. **Discard any response whose `broker` !== the currently
selected broker** (guards against a slow in-flight request from the old broker). Caches are
namespaced per broker server-side. On error show "Not available" — never fall back to another
broker's balance.

Broker-agnostic readers (all 8 brokers use different field names):

```ts
const posQty = (p: any) => Number(
  p.netQty ?? p.net_quantity ?? p.netQuantity ?? p.quantity ?? p.qty ?? p.netTradedQuantity ?? 0);

const posPnL = (p: any) => {
  const direct = p.pnl ?? p.PnL ?? p.profitAndLoss ?? p.unrealizedProfit ?? p.unrealisedProfit ?? p.unrealised_pnl;
  if (direct !== undefined && direct !== null && direct !== '') return Number(direct) || 0;
  const un = Number(p.unrealizedPnl ?? p.unrealisedPnl ?? 0) || 0;
  const re = Number(p.realizedPnl ?? p.realisedPnl ?? p.realisedProfit ?? 0) || 0;
  return un + re;
};

const open   = positions.filter(p => posQty(p) !== 0);
const closed = positions.filter(p => posQty(p) === 0);
const totalPnL = positions.reduce((s, p) => s + posPnL(p), 0);   // green ≥ 0, red < 0
```

Home header rail (same as web): broker logo + name + Live/Off · Funds ₹ · Positions
(open count) with ±₹ coloured · Engine Running/Stopped (poll `GET /engine/db-status` every 5 s).

---

## 6. Instrument mapping — database only, no downloads in the app

The app must **never** download or parse broker instrument files. Mapping lives in the
`instrument_master` table with per-broker columns (`kite_tradingsymbol`,
`groww_trading_symbol`, `upstox_instrument_key`, `fyers_symbol`, `angelone_symbol_token`,
`aliceblue_token`, `fivepaisa_scrip_code`, …). The RN app only triggers and reads sync:

```
GET  /broker/<id>/instruments/status  → { synced, mappedCount, lastSyncedAt }
POST /broker/<id>/instruments/sync    → server streams the broker's master file, maps
                                        NIFTY / BANKNIFTY / SENSEX near expiries and writes
                                        the broker columns via apply_<broker>_instruments()
```

Call `POST …/instruments/sync` (fire-and-forget, show a small "Mapping instruments…" chip)
right after: (a) a successful connect, and (b) every broker switch. Then poll
`…/instruments/status` until `synced === true`. If sync fails, show a retry chip — orders
cannot be placed with unmapped instruments.

---

## 7. Screens to build

1. **BrokerScreen** — list of enabled brokers as cards (logo, name, status pill, ACTIVE badge),
   sorted: active first, then connected, then rest. Pull-to-refresh reloads
   `/brokers`, `/broker/active` and every `/broker/<id>/status` in parallel.
2. **BrokerDetailSheet** — expands a card: credential inputs from §3, Save / Connect /
   Test / Disconnect buttons, redirect URL with copy button, last error text, instrument
   mapping chip.
3. **Home header rail** — §5.
4. **PositionsScreen** — open and closed sections using `posQty` / `posPnL`, green/red P&L,
   refresh every 5 s while focused.

---

## 8. Error handling contract

- Every endpoint returns `{ error: "message" }` on failure — surface that message verbatim in a toast.
- `403 Broker disabled` → hide the broker and refresh `/brokers`.
- `400` on login → keep the form open with the fields intact so the user can correct one value.
- Token expiry → status returns `token_invalid` / expired; show a red "Reconnect" button that
  restarts the login flow for that broker only.

---

## 9. Acceptance checklist

- [ ] Broker list comes from `/brokers`; a 9th broker appears with zero code changes (logo falls back to initial).
- [ ] Each card shows the right logo and the exact credential fields from §3.
- [ ] Login opens in an in-app browser and returns to the app automatically; status flips to Connected without a manual reload.
- [ ] Switching brokers instantly clears and reloads funds + positions, and responses from the previous broker are ignored.
- [ ] Funds match the broker's own app for every broker.
- [ ] Positions show open vs closed with green/red P&L across all 8 field-name variants.
- [ ] Instrument mapping is triggered server-side after connect and after switch; no file is downloaded in the app.
- [ ] Disconnect clears the card back to "Not connected" and blanks funds/positions.
- [ ] No broker secret is ever persisted on the device.
