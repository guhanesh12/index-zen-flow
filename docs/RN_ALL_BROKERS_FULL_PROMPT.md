# React Native — IndexPilot MULTI-BROKER MODULE (ALL 8 BROKERS · COMPLETE SPEC)

Paste this entire file into your RN coding agent. It is the **single source of truth** for the
broker section of the mobile app: broker list, logos, connect forms, credential fields, OAuth
redirects + automatic return to the app, connection status, funds, positions, orders/exit,
instruments and broker switching.

Nothing may be hardcoded per broker inside screens. Adding a 9th broker on the server must need
**zero RN code changes**.

---

## 0. Hard rules

1. **One user = one active broker.** Switching wipes the previous broker's server session.
2. All broker metadata (id, name, colour, website, features, enabled) comes from `GET /brokers`
   and `GET /broker/active`. Only *logos* and *form field definitions* live in RN constants.
3. Every broker-dependent surface (Home funds card, Positions, Orders, Exit button, "Not
   connected" banner, Engine start guard) refetches after connect / disconnect / switch.
4. Auth on **every** call: Supabase user JWT in `Authorization: Bearer <access_token>` + `apikey`.
5. Never send `userId` in the body for financial calls — the server derives it from the JWT.
6. Never store broker secrets in AsyncStorage. They go straight to the server and are returned
   masked only.

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
  if (!res.ok) throw Object.assign(new Error(json?.error || `HTTP ${res.status}`), {
    status: res.status, code: json?.errorCode, payload: json,
  });
  return json as T;
}
```

Production API origin (custom domain, same routes): `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7`.
Use the custom domain for anything a broker portal must whitelist (redirect URIs).

---

## 2. Broker logos

```ts
// src/broker/brokerLogos.ts
const CDN = "https://indexpilotai.com";
export const BROKER_LOGOS: Record<string, string> = {
  dhan:      `${CDN}/__l5e/assets-v1/7a6a87b4-1717-4d17-8da6-2bd953489408/broker-dhan.png`,
  zerodha:   `${CDN}/__l5e/assets-v1/78aaa5e4-ca6e-4363-80ae-797b631b8d89/broker-zerodha.png`,
  groww:     `${CDN}/__l5e/assets-v1/7f811ff6-396c-481b-b3ba-4b3ab1fbcf88/broker-groww.png`,
  upstox:    `${CDN}/__l5e/assets-v1/b7be7fd9-aaef-4f03-8e03-658b2aac826e/broker-upstox.png`,
  angelone:  `${CDN}/__l5e/assets-v1/21ad6bde-7b9d-42c2-9249-f10eac9cb7db/broker-angelone.png`,
  fyers:     `${CDN}/__l5e/assets-v1/8c0627e1-3c89-402e-820b-2a42fc9df41a/broker-fyers.png`,
  aliceblue: `${CDN}/__l5e/assets-v1/8c820387-7ba2-4723-bd4d-0c7ab6302c10/broker-aliceblue.png`,
  "5paisa":  `${CDN}/__l5e/assets-v1/0cb01734-5981-4a98-92a9-5c1788b3a231/broker-fivepaisa.png`,
};
export const getBrokerLogo = (id?: string) => (id ? BROKER_LOGOS[id.toLowerCase()] : undefined);
```

Exact URLs are in the web repo at `src/assets/broker-*.png.asset.json` (`url` field). Unknown
broker id → render a circle filled with `broker.color` containing the first letter of
`broker.name`. Never hide a broker because its logo is missing.

---

## 3. Broker-agnostic endpoints

| Purpose | Endpoint |
| --- | --- |
| Public catalog (admin-enabled only) | `GET /brokers` |
| Active broker + per-broker availability | `GET /broker/active` |
| Switch broker | `POST /broker/active` `{ broker }` |
| Funds (normalized, active broker) | `GET /fund-limits` |
| Broker positions | `GET /positions` |
| Live positions (with LTP/P&L) | `GET /live-positions` |
| Engine-managed positions (SL/target/trailing) | `GET /positions/monitor/active` |
| Place / exit an order (routes to active broker + static IP VPS) | `POST /execute-dhan-order` |
| Simple market order | `POST /place-order` |
| Admin ON/OFF (admin app only) | `GET /admin/brokers`, `POST /admin/brokers` |

### `GET /broker/active`
```json
{
  "success": true,
  "activeBroker": "fyers",
  "activeBrokerName": "Fyers",
  "chosen": true,
  "connected": false,
  "available": { "dhan": false, "zerodha": false, "groww": false, "upstox": false,
                 "fyers": true, "angelone": false, "aliceblue": false, "5paisa": false },
  "brokers": [{ "id": "fyers", "name": "Fyers", "short": "Fyers", "status": "live",
                "color": "#0ea5e9", "website": "https://fyers.in",
                "features": ["orders","positions","funds","instruments","static-ip","oauth"],
                "enabled": true }]
}
```
- `chosen: false` → show the chooser grid (all 8 logos), no banner.
- `connected: false` → red banner `${activeBrokerName} Not Connected` + CTA to the connect screen.
- `available[id]` tells you which brokers already have a saved session (badge "Connected" in the
  switch sheet).

### `POST /broker/active`
Body `{ "broker": "angelone" }`. Allowed ids: `dhan, zerodha, groww, upstox, fyers, angelone,
aliceblue, 5paisa`. Returns
`{ success, activeBroker, switchedFrom, instrumentSync: { inserted, updated } | null }`.
`403` = admin disabled that broker → toast the server message and refetch `/brokers`.
While the call runs show a modal "Preparing {name} contracts…" (instrument download can take
5-30 s on the first switch of the day).

---

## 4. Per-broker credentials, flows, upstream APIs, redirect URIs

Every broker exposes, under its base path: `GET /status`, `POST /verify`, `POST /disconnect`,
`GET /instruments/status`, `POST /instruments/sync`.

Base path resolver (only place aliases exist):

```ts
// src/broker/brokerPaths.ts
export const brokerBase = (id: string) =>
  `/broker/${id === "zerodha" ? "kite" : id === "dhan" ? "oauth" : id}`;
export type Flow = "keys" | "oauth" | "login";
export const brokerFlow = (id: string): Flow =>
  ({ dhan: "oauth", zerodha: "oauth", upstox: "oauth", fyers: "oauth",
     "5paisa": "oauth", aliceblue: "oauth", groww: "keys", angelone: "login" } as any)[id] ?? "keys";
```

### 4.1 Dhan — `dhan` (path `/broker/oauth`) — upstream `https://api.dhan.co`
- **Fields:** Client ID (`dhanClientId`), Access Token (`dhanAccessToken`) — manual mode;
  or App Key + App Secret for the consent flow.
- Manual: `POST /credentials` `{ dhanClientId, dhanAccessToken }` → instantly connected.
- OAuth: `POST /broker/oauth/save-keys` → `POST /broker/oauth/generate-consent` → open URL →
  `GET /broker/oauth/callback` → `POST /broker/oauth/consume` → `GET /broker/oauth/status`.
- Access tokens expire ~24 h / 30 days; server pushes an expiry warning 60 min before.
- `POST /broker/oauth/disconnect`.

### 4.2 Zerodha Kite — `zerodha` (path `/broker/kite`) — upstream `https://api.kite.trade`
- **Fields:** API Key, API Secret (Kite Connect app at developers.kite.trade).
- `POST /broker/kite/save-keys` `{ apiKey, apiSecret }`
- `GET /broker/kite/login-url` → `{ url }` → open in in-app browser
- Redirect → `GET /broker/kite/callback` consumes `request_token`; fallback
  `POST /broker/kite/consume` `{ requestToken }`
- Poll `GET /broker/kite/status` → `{ connected, access_token_set }`
- Redirect URI to register: `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/kite/callback`
- Session dies daily ~07:30 IST → re-login each morning.

### 4.3 Groww — `groww` — upstream `https://api.groww.in`
- **Fields:** API Key, API Secret (optional — enables TOTP auto-renew).
- `POST /broker/groww/save-keys` `{ apiKey, apiSecret? }` → server logs in immediately, **no
  browser step**. Connected in one tap.
- `GET /broker/groww/status`, `POST /broker/groww/verify`, `POST /broker/groww/disconnect`.

### 4.4 Upstox — `upstox` — upstream `https://api.upstox.com` (v3)
- **Fields:** API Key, API Secret, Redirect URI (must match the Upstox portal).
- `POST /broker/upstox/save-keys` → `GET /broker/upstox/login-url` → open →
  `GET /broker/upstox/callback` exchanges `code` → poll `GET /broker/upstox/status`.
- Redirect URI: `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/upstox/callback`
- Token valid until 03:30 IST next day.

### 4.5 Angel One — `angelone` — upstream `https://apiconnect.angelone.in` (SmartAPI)
- **Fields:** Client Code, MPIN, API Key, TOTP — the server accepts **either** the current
  6-digit TOTP code **or** the Base32 TOTP secret (secret enables auto-reconnect).
- `POST /broker/angelone/login` `{ clientCode, mpin, apiKey, totp }` → server-side session.
- `POST /broker/angelone/reconnect` re-runs login with stored credentials.
- `GET /broker/angelone/status`, `/verify`, `/disconnect`, `/instruments/{status|sync}`.
- **No browser step** — form → submit → connected.
- Instrument master is large (~37 MB); the server streams it, so allow up to 60 s on first sync.

### 4.6 Fyers — `fyers` — upstream `https://api-t1.fyers.in` (v3 OAuth)
- **Fields:** App ID / client_id, Secret ID.
- `POST /broker/fyers/save-keys` `{ appId, appSecret }` → `GET /broker/fyers/login-url` → open →
  `GET /broker/fyers/callback` exchanges `auth_code` and renders "Fyers connected ✅" →
  poll `GET /broker/fyers/status`.
- Status supports `?quick=1` (skip the live probe, instant answer from the saved token).
  Live probe has a 6 s timeout; a saved unexpired token already means connected.
- Redirect URI: `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/fyers/callback`

### 4.7 Aliceblue — `aliceblue` — upstream `https://ant.aliceblueonline.com` (ANT v2)
- **Fields (vendor flow, recommended):** App Code, API Secret. **User ID is optional** — it is
  captured from the redirect.
- `POST /broker/aliceblue/vendor-start` `{ appCode, apiSecret, userId? }` → `{ url }` → open →
  redirect hits `GET /broker/aliceblue/callback?authCode=…&userId=…`; the server computes
  `SHA-256(userId + authCode + apiSecret)` and calls `/vendor/getUserDetails`.
- Fallback: `POST /broker/aliceblue/exchange` `{ authCode, userId }`.
- Retail-key mode: `POST /broker/aliceblue/login` `{ userId, apiKey }`.
- `POST /broker/aliceblue/reconnect | verify | disconnect`.
- Redirect URI: `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/aliceblue/callback`

### 4.8 5paisa — `5paisa` — upstream `https://xstream.5paisa.com`
- **Fields:** App Key (App Name key), Encryption Key, User Key.
- `POST /broker/5paisa/save-keys` `{ appKey, encKey, userKey }` → status `keys_saved`
- `GET /broker/5paisa/login-url` → open → login (client code + PIN/TOTP) →
  `GET|POST /broker/5paisa/callback?RequestToken=…` finalises the session.
- Fallback: `POST /broker/5paisa/exchange` `{ requestToken }`. If the user pastes the full
  redirect URL, extract `RequestToken` client-side (`/[?&]RequestToken=([^&]+)/i`).
- Redirect URI: `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/5paisa/callback`

### 4.9 Declarative form schema (the ONLY per-broker RN constant)

```ts
// src/broker/brokerForms.ts
export type Field = { key: string; label: string; secret?: boolean; optional?: boolean;
                      keyboard?: "default" | "number-pad"; hint?: string };

export const BROKER_FORMS: Record<string, { save: string; fields: Field[]; cta: string }> = {
  dhan:      { save: "/credentials", cta: "Save & Connect", fields: [
                { key: "dhanClientId", label: "Client ID" },
                { key: "dhanAccessToken", label: "Access Token", secret: true } ] },
  zerodha:   { save: "/broker/kite/save-keys", cta: "Login with Zerodha", fields: [
                { key: "apiKey", label: "API Key" },
                { key: "apiSecret", label: "API Secret", secret: true } ] },
  groww:     { save: "/broker/groww/save-keys", cta: "Connect Groww", fields: [
                { key: "apiKey", label: "API Key", secret: true },
                { key: "apiSecret", label: "API Secret", secret: true, optional: true,
                  hint: "Optional — enables auto re-login" } ] },
  upstox:    { save: "/broker/upstox/save-keys", cta: "Login with Upstox", fields: [
                { key: "apiKey", label: "API Key" },
                { key: "apiSecret", label: "API Secret", secret: true },
                { key: "redirectUri", label: "Redirect URI", optional: true } ] },
  fyers:     { save: "/broker/fyers/save-keys", cta: "Login with Fyers", fields: [
                { key: "appId", label: "App ID (client_id)" },
                { key: "appSecret", label: "Secret ID", secret: true } ] },
  angelone:  { save: "/broker/angelone/login", cta: "Login to Angel One", fields: [
                { key: "clientCode", label: "Client Code" },
                { key: "mpin", label: "MPIN", secret: true, keyboard: "number-pad" },
                { key: "apiKey", label: "API Key", secret: true },
                { key: "totp", label: "TOTP code or secret",
                  hint: "6-digit code, or the Base32 secret for auto-reconnect" } ] },
  aliceblue: { save: "/broker/aliceblue/vendor-start", cta: "Login with Aliceblue", fields: [
                { key: "appCode", label: "App Code" },
                { key: "apiSecret", label: "API Secret", secret: true },
                { key: "userId", label: "User ID", optional: true,
                  hint: "Optional — filled automatically after login" } ] },
  "5paisa":  { save: "/broker/5paisa/save-keys", cta: "Login with 5paisa", fields: [
                { key: "appKey", label: "App Key" },
                { key: "encKey", label: "Encryption Key", secret: true },
                { key: "userKey", label: "User Key" } ] },
};
```
Unknown broker id → generic `{ apiKey, apiSecret }` form posting to `${brokerBase(id)}/save-keys`.

---

## 5. OAuth: opening the broker and coming back to the app automatically

The server's callback renders an HTML success page and self-closes. In RN use
`expo-web-browser`'s **auth session** so dismissing the sheet returns control to the app, then
poll status until connected.

```ts
// src/broker/connectOAuth.ts
import * as WebBrowser from "expo-web-browser";
import { api } from "../api/config";
import { brokerBase } from "./brokerPaths";

export async function connectOAuth(id: string, payload: Record<string, string>) {
  const form = BROKER_FORMS[id];
  await api(form.save, { method: "POST", body: JSON.stringify(payload) });

  const start = id === "aliceblue"
    ? await api(`${brokerBase(id)}/vendor-start`, { method: "POST", body: JSON.stringify(payload) })
    : await api(`${brokerBase(id)}/login-url`);
  const url: string = start.url || start.loginUrl;
  if (!url) throw new Error("Login URL unavailable");

  // returnUrl = our own callback origin → the sheet closes as soon as the server page loads
  await WebBrowser.openAuthSessionAsync(url, "indexpilot://broker-callback");
  WebBrowser.dismissBrowser();

  return pollConnected(id);           // §5.1
}

export async function pollConnected(id: string, tries = 15) {
  for (let i = 0; i < tries; i++) {
    const s = await api(`${brokerBase(id)}/status`).catch(() => null);
    if (s?.connected || s?.access_token_set || s?.tokenValid) return true;
    await new Promise(r => setTimeout(r, 1200));
  }
  return false;
}
```

Also register the deep link `indexpilot://broker-callback` in `app.json`
(`"scheme": "indexpilot"`), and add an `AppState` listener: whenever the app returns to
`active` while a connect flow is pending, re-run `pollConnected` + `refresh()`. This is what
makes the app "automatically move back" and flip to Connected without a manual refresh.

**Manual fallback (always render it, collapsed):** a text box "Paste the redirect URL" →
extract the token and POST it:
- Zerodha `request_token` → `POST /broker/kite/consume { requestToken }`
- 5paisa `RequestToken` → `POST /broker/5paisa/exchange { requestToken }`
- Aliceblue `authCode` + `userId` → `POST /broker/aliceblue/exchange { authCode, userId }`

---

## 6. RN implementation

### 6.1 BrokerContext (global)

```tsx
// src/broker/BrokerContext.tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { api } from "../api/config";

export type BrokerDef = { id: string; name: string; short: string; status: "live" | "planned";
  color: string; website: string; features: string[]; enabled: boolean };

const Ctx = createContext<any>({});
export const useBroker = () => useContext(Ctx);

export function BrokerProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<any>({ loading: true, brokers: [], available: {} });

  const refresh = useCallback(async () => {
    try { setS({ ...(await api("/broker/active")), loading: false }); }
    catch { setS((p: any) => ({ ...p, loading: false })); }
  }, []);

  const switchBroker = useCallback(async (id: string) => {
    setS((p: any) => ({ ...p, switching: true }));
    try { await api("/broker/active", { method: "POST", body: JSON.stringify({ broker: id }) }); }
    finally { setS((p: any) => ({ ...p, switching: false })); await refresh(); }
  }, [refresh]);

  const disconnect = useCallback(async (id: string) => {
    await api(`${brokerBase(id)}/disconnect`, { method: "POST" }); await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 20000);
    const sub = AppState.addEventListener("change", st => st === "active" && refresh());
    return () => { clearInterval(t); sub.remove(); };
  }, [refresh]);

  return <Ctx.Provider value={{ ...s, refresh, switchBroker, disconnect }}>{children}</Ctx.Provider>;
}
```

### 6.2 Screens to build
1. **BrokerChooser** — 2-column grid of `brokers` with logo, name, colour dot, feature chips.
   Shown when `chosen === false`. Tap → `switchBroker(id)` → ConnectScreen.
2. **ActiveBrokerCard** — logo, name, `Connected / Not connected` pill, masked credentials,
   buttons: Reconnect · Verify · Disconnect · **Switch broker**.
3. **SwitchBrokerSheet** — bottom sheet listing all enabled brokers with a "Connected" badge from
   `available[id]`; confirm dialog: *"Switching to {name} will sign you out of {current}."*
4. **ConnectScreen** — renders `BROKER_FORMS[id]` generically; `brokerFlow(id)`:
   - `keys` → POST save → poll status
   - `login` → POST login → poll status
   - `oauth` → `connectOAuth(id, values)`
   Show inline error text from the server verbatim, plus the paste-redirect fallback.
5. **Home** — funds card + positions summary + `Not connected` banner, all keyed on `activeBroker`.
6. **Positions** — list + Exit buttons.

Every react-query key must include `activeBroker`, e.g.
`["funds", activeBroker]`, `["positions", activeBroker]` → a switch auto-invalidates them.

---

## 7. Funds

`GET /fund-limits` → normalized across all 8 brokers:
```json
{ "success": true, "funds": { "availableBalance": 12500.45, "sodLimit": 15000,
  "collateralAmount": 0, "utilizationAmount": 2499.55, "blockedPayinAmount": 0,
  "withdrawableBalance": 12500.45 } }
```
`400 { error: "<Broker> not connected" }` → show the connect CTA instead of ₹0.
Refresh: on focus, after a switch, after every order, and every 30 s while Home is visible.

## 8. Positions & exit

- `GET /positions` → `{ success, positions: [...], warning? }`. A `warning` means the session
  expired — show an amber strip "Reconnect {broker}".
- `GET /live-positions` → same rows enriched with LTP and unrealised P&L (use on the Positions tab
  with a 3 s refresh during market hours 09:15-15:30 IST, Mon-Fri).
- `GET /positions/monitor/active` → engine-managed rows with `target`, `stopLoss`,
  `trailingStep`, `trailingSl`, `trailingTarget`, `entryPrice`, `quantity`, `lots`.
- **Exit / place order:** `POST /execute-dhan-order`
```json
{ "securityId": "45678", "transactionType": "SELL", "exchangeSegment": "NSE_FNO",
  "quantity": 75, "afterMarketOrder": false }
```
  The server routes it through `BrokerRouter.placeOrderSmart` → the user's static-IP VPS → the
  **active broker's** API. Response `{ success, orderId, status, message }`.
  Use one shared `ExitButton` — never branch on broker in the UI.
- Error codes to handle explicitly (field `errorCode`):
  | code | UI |
  | --- | --- |
  | `TOKEN_EXPIRED` | "Broker session expired — reconnect {name}" + button to ConnectScreen |
  | `IP_WHITELIST_PENDING` | show `vpsIP`, "Whitelist this IP in your broker portal" |
  | `OUTDATED_VPS_SERVER` | "Your VPS needs an update — contact support" |
  | `403` on switch | "This broker is temporarily disabled by admin" |

## 9. Instruments

- `GET ${brokerBase(id)}/instruments/status` → `{ mapped, date, stale }` → footer "Contracts
  mapped: 3308".
- `POST ${brokerBase(id)}/instruments/sync` → manual re-sync button (spinner, may take 30-60 s).
- Auto-sync already runs when switching brokers and daily before market open — the app only
  displays state and offers a manual retry when `mapped === 0`.

## 10. Adding a 9th broker later — RN work required

None. Verify only: it appears in `/brokers`, `brokerBase`/`brokerFlow` defaults resolve, a logo
URL exists (else the coloured fallback renders), and if it needs unusual fields add one entry to
`BROKER_FORMS`.

---

## 11. QA checklist
- [ ] Fresh user → chooser grid with all 8 logos, no banner.
- [ ] Each broker connects with the exact fields in §4 and flips to Connected within 15 s.
- [ ] OAuth brokers (Dhan, Zerodha, Upstox, Fyers, Aliceblue, 5paisa): the browser sheet closes
      by itself and the app shows Connected without a manual refresh.
- [ ] Paste-redirect fallback works for Zerodha, Aliceblue and 5paisa.
- [ ] Groww and Angel One connect with no browser step.
- [ ] Switching wipes the previous session; banner + funds + positions + engine guard update
      without an app restart.
- [ ] Admin disables a broker → it disappears from the chooser; switching returns 403.
- [ ] Instrument-sync loader appears on switch when `instrumentSync` is returned.
- [ ] Exit works on every broker through the single `/execute-dhan-order` call.
- [ ] `TOKEN_EXPIRED` / `IP_WHITELIST_PENDING` render actionable messages, not raw JSON.
- [ ] `grep -ri "zerodha\|fyers\|aliceblue" src/screens` finds nothing.
