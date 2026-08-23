# React Native — IndexPilot Multi-Broker Module (ALL 8 BROKERS, FULL SPEC)

Paste this whole file into your RN coding agent. Goal: the RN app renders the broker section,
logos, connect forms, funds and positions **entirely from the server registry**. Adding a 9th
broker later must need **zero RN code changes**.

---

## 0. Hard rules

1. **One user = one active broker.** Switching wipes the other broker's server session.
2. Never hardcode a broker name/colour/logo in a component — read them from the API + logo map.
3. Every broker-dependent screen (Home funds, Positions, Orders, Exit, banner) refetches after a switch.
4. Auth on every call: Supabase user JWT.

---

## 1. Base config

```ts
// src/api/config.ts
export const SUPABASE_URL = "https://oklgqelcaujxntgjyuis.supabase.co";
export const FN = `${SUPABASE_URL}/functions/v1/make-server-c4d79cb7`;
export const ANON_KEY = "<VITE_SUPABASE_PUBLISHABLE_KEY>";

import { supabase } from "./supabase";

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${FN}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${token ?? ANON_KEY}`,
      ...(init.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json as T;
}
```

---

## 2. Broker logos (CDN, same artwork as web)

```ts
// src/broker/brokerLogos.ts
const CDN = "https://indexpilotai.com"; // logos are served from the app origin
export const BROKER_LOGOS: Record<string, string> = {
  dhan:      `${CDN}/__l5e/assets-v1/<dhan-asset-id>/broker-dhan.png`,
  zerodha:   `${CDN}/__l5e/assets-v1/<zerodha-asset-id>/broker-zerodha.png`,
  groww:     `${CDN}/__l5e/assets-v1/<groww-asset-id>/broker-groww.png`,
  upstox:    `${CDN}/__l5e/assets-v1/<upstox-asset-id>/broker-upstox.png`,
  angelone:  `${CDN}/__l5e/assets-v1/<angelone-asset-id>/broker-angelone.png`,
  fyers:     `${CDN}/__l5e/assets-v1/<fyers-asset-id>/broker-fyers.png`,
  aliceblue: `${CDN}/__l5e/assets-v1/<aliceblue-asset-id>/broker-aliceblue.png`,
  "5paisa":  `${CDN}/__l5e/assets-v1/<fivepaisa-asset-id>/broker-fivepaisa.png`,
};
export const getBrokerLogo = (id?: string) => (id ? BROKER_LOGOS[id.toLowerCase()] : undefined);
```
Copy the exact URLs from the web repo files `src/assets/broker-*.png.asset.json` (field `url`,
prefixed with the site origin). Unknown broker → render a coloured circle with `broker.color`
and the first letter of `broker.name` (never crash, never hide the broker).

---

## 3. Registry endpoints (broker-agnostic)

| Purpose | Endpoint |
| --- | --- |
| Public catalog (enabled only) | `GET /brokers` |
| Active broker + connection state | `GET /broker/active` |
| Switch broker | `POST /broker/active` `{ "broker": "<id>" }` |
| Funds (active broker, normalized) | `GET /fund-limits` |
| Positions | `GET /positions`, `GET /live-positions` |
| Engine-managed positions (SL/target/trailing) | `GET /positions/monitor/active` |
| Exit / place order (routes to active broker) | `POST /execute-dhan-order` |
| Admin ON/OFF (admin app only) | `GET/POST /admin/brokers` |

`GET /broker/active` response:
```json
{ "success": true, "activeBroker": "fyers", "activeBrokerName": "Fyers",
  "chosen": true, "connected": false,
  "available": { "dhan": false, "fyers": true },
  "brokers": [ { "id":"fyers","name":"Fyers","short":"Fyers","status":"live",
                 "color":"#0ea5e9","website":"https://fyers.in",
                 "features":["orders","positions","funds","instruments","static-ip","oauth"],
                 "enabled": true } ] }
```
`chosen:false` → chooser grid. `connected:false` → red banner `${activeBrokerName} Not Connected`.
`POST /broker/active` returns `403` if admin disabled that broker, and may return
`instrumentSync: { inserted, updated }` — show a "Preparing {name} contracts…" loader.

---

## 4. Per-broker connect flows, credentials and upstream APIs

All paths below are relative to `FN`. Every broker also exposes
`/broker/<x>/status`, `/verify`, `/disconnect`, `/instruments/status`, `/instruments/sync`.

### 4.1 Dhan — `id: dhan` (path alias `oauth`) — upstream `https://api.dhan.co`
- Credentials: **Client ID + Access Token** (manual), or OAuth consent.
- Manual: save `dhanClientId` + `dhanAccessToken` via the credentials form endpoint.
- OAuth: `POST /broker/oauth/save-keys` → `POST /broker/oauth/generate-consent` → open URL →
  `GET /broker/oauth/callback` → `POST /broker/oauth/consume` → `GET /broker/oauth/status`.
- Disconnect: `POST /broker/oauth/disconnect`.

### 4.2 Zerodha Kite — `id: zerodha` (path alias `kite`) — upstream `https://api.kite.trade`
- Credentials: **API Key + API Secret** (Kite Connect app).
- `POST /broker/kite/save-keys` `{ apiKey, apiSecret }`
- `GET /broker/kite/login-url` → `{ url }` → open in in-app browser
- Redirect → `GET /broker/kite/callback` (server consumes `request_token`), or
  `POST /broker/kite/consume` `{ requestToken }` as fallback
- Poll `GET /broker/kite/status` until `{ access_token_set: true }`
- Instruments: `GET|POST /broker/kite/instruments/{status|sync}`

### 4.3 Groww — `id: groww` — upstream `https://api.groww.in`
- Credentials: **API Key (+ API Secret for TOTP flow)**.
- `POST /broker/groww/save-keys` `{ apiKey, apiSecret? }` → server logs in immediately.
- `GET /broker/groww/status`, `POST /broker/groww/verify`, `POST /broker/groww/disconnect`.
- No browser redirect — pure key based, connect is instant.

### 4.4 Upstox — `id: upstox` — upstream `https://api.upstox.com` (v3)
- Credentials: **API Key + API Secret + Redirect URI** registered in the Upstox portal.
- `POST /broker/upstox/save-keys` → `GET /broker/upstox/login-url` → open →
  `GET /broker/upstox/callback` (server exchanges `code`) → poll `GET /broker/upstox/status`.

### 4.5 Angel One — `id: angelone` — upstream `https://apiconnect.angelone.in` (SmartAPI)
- Credentials: **Client Code + MPIN + API Key + TOTP** (either the current 6-digit code or the
  Base32 TOTP secret — the server accepts both).
- `POST /broker/angelone/login` `{ clientCode, mpin, apiKey, totp }` → session created server-side.
- `POST /broker/angelone/reconnect` re-runs login with stored credentials (used by auto-renew).
- `GET /broker/angelone/status`, `/verify`, `/disconnect`, `/instruments/{status|sync}`.
- No browser step: show a form, submit, done.

### 4.6 Fyers — `id: fyers` — upstream `https://api-t1.fyers.in` (v3 OAuth)
- Credentials: **App ID (client_id) + Secret ID**, redirect URI registered at Fyers.
- `POST /broker/fyers/save-keys` → `GET /broker/fyers/login-url` → open →
  `GET /broker/fyers/callback` (server exchanges `auth_code`, page shows "Fyers connected") →
  poll `GET /broker/fyers/status` (also refresh on app focus; status may take ~2-6s).

### 4.7 Aliceblue — `id: aliceblue` — upstream `https://ant.aliceblueonline.com` (ANT v2)
- Credentials: **App Code + API Secret** (User ID is optional — captured from the redirect).
- `POST /broker/aliceblue/vendor-start` `{ appCode, apiSecret, userId? }` → returns login URL
- Open URL → login on Aliceblue → redirect hits `GET /broker/aliceblue/callback` with
  `authCode` + `userId`; the server computes `SHA-256(userId + authCode + apiSecret)` and calls
  `/vendor/getUserDetails`.
- Fallback: `POST /broker/aliceblue/exchange` `{ authCode, userId }`.
- Retail key mode: `POST /broker/aliceblue/login` `{ userId, apiKey }`.
- `POST /broker/aliceblue/reconnect|verify|disconnect`.

### 4.8 5paisa — `id: 5paisa` — upstream `https://xstream.5paisa.com`
- Credentials: **App Key (App Name key) + Encryption Key + User Key**.
- `POST /broker/5paisa/save-keys` `{ appKey, encKey, userKey }`
- `GET /broker/5paisa/login-url` → open → login (client code + PIN/TOTP) →
  `GET|POST /broker/5paisa/callback?RequestToken=…` finalises the session.
- Fallback: `POST /broker/5paisa/exchange` `{ requestToken }` — the app may paste the full
  redirect URL; extract `RequestToken` client-side before sending.
- Redirect URI to register:
  `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/5paisa/callback`

### 4.9 Generic path resolver (keep in ONE file)

```ts
// src/broker/brokerPaths.ts
export const brokerBase = (id: string) =>
  `/broker/${id === "zerodha" ? "kite" : id === "dhan" ? "oauth" : id}`;
export const brokerFlow = (id: string): "keys" | "oauth" | "login" =>
  ({ dhan: "oauth", zerodha: "oauth", upstox: "oauth", fyers: "oauth",
     "5paisa": "oauth", aliceblue: "oauth", groww: "keys", angelone: "login" }[id] ?? "keys");
```
A new broker defaults to `/broker/<id>/*` + `keys` flow — nothing to add.

---

## 5. RN implementation

### 5.1 BrokerContext (global)

```tsx
// src/broker/BrokerContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/config";

export type BrokerDef = {
  id: string; name: string; short: string; status: "live" | "planned";
  color: string; website: string; features: string[]; enabled: boolean;
};

const Ctx = createContext<any>({});
export const useBroker = () => useContext(Ctx);

export function BrokerProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<any>({ loading: true, brokers: [], available: {} });

  const refresh = useCallback(async () => {
    try { setS({ ...(await api("/broker/active")), loading: false }); }
    catch { setS((p: any) => ({ ...p, loading: false })); }
  }, []);

  const switchBroker = useCallback(async (id: string) => {
    setS((p: any) => ({ ...p, loading: true }));
    await api("/broker/active", { method: "POST", body: JSON.stringify({ broker: id }) });
    await refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ ...s, refresh, switchBroker }}>{children}</Ctx.Provider>;
}
```
Wrap `<App/>` in `BrokerProvider` above the navigator.

### 5.2 Broker screen (fully dynamic + logos)

- No broker chosen → 2-column chooser grid from `brokers`: 44px logo (`getBrokerLogo`),
  name, feature chips from `broker.features`, tap → `switchBroker(id)`.
- Chosen → one active card: 48px logo, "Your broker", name, status pill
  (`connected ? "Connected" : "Not connected yet"`), funds row from `/fund-limits`,
  client id, token expiry, and buttons `Connect / Verify / Disconnect` built from
  `brokerBase(id)` + `brokerFlow(id)`.
- `Change broker` visible only when more than one live+enabled broker exists → confirm sheet:
  “Switching to {name} will disconnect {current} and remove its session. Close open positions first.”
- Connect form fields per `brokerFlow`:
  - `oauth`: key fields (see §4) → save-keys → open `login-url` in in-app browser →
    poll `status` every 2s for 60s, and also on app-focus.
  - `login` (Angel One): Client Code, MPIN, API Key, TOTP → single POST.
  - `keys` (Groww): API Key (+ Secret) → single POST.

### 5.3 Home screen

```tsx
const { activeBroker, activeBrokerName, connected } = useBroker();
const funds = useQuery(["funds", activeBroker], () => api("/fund-limits"));
const positions = useQuery(["positions", activeBroker], () => api("/live-positions"));
```
- `activeBroker` in **every** react-query key.
- Fund card title `${activeBrokerName} Balance`, with the broker logo as a 20px leading icon.
- `!connected` → red banner `${activeBrokerName} Not Connected` + "Connect now".
- Position rows carry a small logo + `activeBrokerName` chip.

### 5.4 Exit button
`POST /execute-dhan-order` `{ action: "EXIT", symbol, quantity, orderId }` — broker-routed
server side. On success refetch positions + funds.

### 5.5 Adding a NEW broker later — RN checklist
Nothing to code. Verify only: it appears in `/brokers`, `brokerBase`/`brokerFlow` defaults work,
a logo URL exists (else the coloured fallback renders), and query keys include `activeBroker`.

---

## 6. QA checklist
- [ ] Fresh user → chooser with all 8 logos.
- [ ] Each broker connects with the credentials listed in §4 and flips to Connected.
- [ ] Switching wipes the previous session, banner + funds + positions update without restart.
- [ ] Admin disables a broker → it disappears; switching returns 403.
- [ ] Instrument-sync loader shows on switch where the server returns `instrumentSync`.
- [ ] `grep` finds no literal broker names inside components.
