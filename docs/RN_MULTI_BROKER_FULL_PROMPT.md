# React Native — Universal Multi-Broker Module (Dhan / Zerodha / any future broker)

Paste this whole file into your RN coding agent. Goal: **the RN app must never hardcode a
broker name again**. Everything (Broker screen, Home fund + positions, connect flow,
instruments, labels) is driven by the server broker registry, so when a new broker is added
on the backend it appears in the app automatically with **zero RN code changes**.

---

## 0. Hard rules

1. **One user = one active broker.** Switching brokers wipes the other broker's session server-side.
2. Never render the string "Dhan" or "Zerodha" from constants. Always render `activeBrokerName`
   / `broker.name` coming from the API.
3. All broker-dependent screens (Home fund card, Positions, Orders, Exit button, Banner)
   re-fetch after a broker switch.
4. Auth: every call uses the Supabase user JWT.

---

## 1. Base config

```ts
// src/api/config.ts
export const SUPABASE_URL = "https://oklgqelcaujxntgjyuis.supabase.co";
export const FN = `${SUPABASE_URL}/functions/v1/make-server-c4d79cb7`;
export const ANON_KEY = "<VITE_SUPABASE_PUBLISHABLE_KEY>";

import { supabase } from "./supabase";

export async function api<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
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

## 2. API contract (all endpoints already live)

### 2.1 Broker catalog (public — used by onboarding / landing style list)
`GET /brokers`
```json
{ "success": true, "brokers": [
  { "id":"dhan","name":"Dhan","short":"Dhan","status":"live","color":"#22c55e",
    "website":"https://dhan.co","features":["Orders","Positions","Funds","Static IP"],
    "enabled": true }
]}
```
Only admin-enabled brokers are returned. **Render this list dynamically.**

### 2.2 Active broker + connection state (the single source of truth for the app)
`GET /broker/active`
```json
{
  "success": true,
  "activeBroker": "zerodha",
  "activeBrokerName": "Zerodha Kite",
  "chosen": true,
  "connected": true,
  "available": { "dhan": false, "zerodha": true },
  "brokers": [ /* same shape as /brokers */ ]
}
```
- `chosen=false` → show the broker chooser screen first (no broker picked yet).
- `connected=false` → show banner **“{activeBrokerName} Not Connected”** + Connect CTA.

### 2.3 Switch broker
`POST /broker/active` body `{ "broker": "zerodha" }`
```json
{ "success": true, "activeBroker":"zerodha", "switchedFrom":"dhan",
  "instrumentSync": { "inserted": 1240, "updated": 300 } }
```
Side effects handled by the server:
- other broker's credentials/session cleared (one-broker rule),
- for Zerodha, near-expiry NIFTY / BANKNIFTY / SENSEX **Kite instruments are downloaded &
  the instrument master is updated** (show a "Preparing contracts…" loader while awaiting).
- `403` if admin has switched that broker OFF → hide it from the list.

### 2.4 Funds — broker agnostic
`GET /fund-limits` → normalized for the active broker:
```json
{ "success": true, "broker":"zerodha", "availableBalance": 12500.5,
  "utilizedAmount": 3000, "withdrawableBalance": 9500 }
```

### 2.5 Positions — broker agnostic
`GET /positions` and `GET /live-positions` → already routed through the active broker.
`GET /positions/monitor/active` → engine-managed positions (SL/target/trailing).

### 2.6 Exit / place order — broker agnostic
`POST /execute-dhan-order` (legacy path name, routes to the **active** broker internally)
```json
{ "action":"EXIT", "symbol":"NIFTY24800CE", "quantity":75, "orderId":"..." }
```

### 2.7 Zerodha connect flow
1. `POST /broker/kite/save-keys` `{ apiKey, apiSecret }`
2. `GET /broker/kite/login-url` → `{ url }` → open in in-app browser
3. Redirect hits `/broker/kite/callback` → server consumes `request_token`
4. Poll `GET /broker/kite/status` until `{ access_token_set: true }`
5. `POST /broker/kite/verify` / `POST /broker/kite/disconnect`
6. Instruments: `GET /broker/kite/instruments/status`, `POST /broker/kite/instruments/sync`

### 2.8 Dhan connect flow
- `POST /broker/oauth/save-keys` → `POST /broker/oauth/generate-consent` → open URL →
  `/broker/oauth/callback` → `POST /broker/oauth/consume` → `GET /broker/oauth/status`
- Or manual: save `dhanClientId` + `dhanAccessToken` in the credentials form.
- `POST /broker/oauth/disconnect`

### 2.9 Generic future brokers
Every new broker follows the **same pattern**, and the RN app must derive it from the
catalog entry instead of hardcoding:

```
connect flow  → /broker/<id>/save-keys, /broker/<id>/login-url,
                /broker/<id>/status, /broker/<id>/verify, /broker/<id>/disconnect
```
So build one generic connect screen:

```ts
const base = `/broker/${broker.id === "zerodha" ? "kite" : broker.id === "dhan" ? "oauth" : broker.id}`;
```
Keep this mapping in ONE file (`brokerPaths.ts`). New broker = add nothing (id path is
already the default); the two legacy aliases stay.

---

## 3. RN implementation

### 3.1 Broker context (global)
```tsx
// src/broker/BrokerContext.tsx
import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { api } from "../api/config";

export type BrokerDef = {
  id: string; name: string; short: string; status: "live" | "planned";
  color: string; website: string; features: string[]; enabled: boolean;
};
type State = {
  loading: boolean;
  activeBroker: string;
  activeBrokerName: string;
  chosen: boolean;
  connected: boolean;
  available: Record<string, boolean>;
  brokers: BrokerDef[];
  refresh: () => Promise<void>;
  switchBroker: (id: string) => Promise<void>;
};

const Ctx = createContext<State>({} as State);
export const useBroker = () => useContext(Ctx);

export function BrokerProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<any>({ loading: true, brokers: [], available: {} });

  const refresh = useCallback(async () => {
    try {
      const r = await api("/broker/active");
      setS({ ...r, loading: false });
    } catch {
      setS((p: any) => ({ ...p, loading: false }));
    }
  }, []);

  const switchBroker = useCallback(async (id: string) => {
    setS((p: any) => ({ ...p, loading: true }));
    await api("/broker/active", { method: "POST", body: JSON.stringify({ broker: id }) });
    await refresh();                       // funds/positions listeners react to activeBroker
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ ...s, refresh, switchBroker }}>{children}</Ctx.Provider>;
}
```
Wrap `<App/>` in `BrokerProvider` above the navigator.

### 3.2 Broker screen (fully dynamic)
```tsx
const { brokers, activeBroker, activeBrokerName, connected, chosen, switchBroker } = useBroker();

// 1. no broker chosen yet → chooser grid from `brokers`
// 2. chosen → show ONE card for the active broker:
//    - name + brand color dot + features chips
//    - status pill: connected ? "Connected" : "Not Connected"
//    - Funds row (from /fund-limits), Client ID, token expiry
//    - [Connect] / [Verify] / [Disconnect] buttons → generic broker paths
//    - [Change Broker] shown ONLY when brokers.filter(b => b.status==="live" && b.enabled).length > 1
// 3. Change Broker → confirm modal:
//    "Switching to {name} will disconnect {current}. Continue?"
//    → switchBroker(id) → show "Preparing {name} contracts…" while the promise resolves
```
Never map broker id → hardcoded UI. Icons/colors come from `broker.color`, labels from
`broker.name`, capability chips from `broker.features`.

### 3.3 Home screen
```tsx
const { activeBroker, activeBrokerName, connected } = useBroker();
const funds = useQuery(["funds", activeBroker], () => api("/fund-limits"));
const positions = useQuery(["positions", activeBroker], () => api("/live-positions"));
```
- Put `activeBroker` in every react-query key → a broker switch auto-refetches funds,
  positions, orders, instruments.
- Fund card title: `` `${activeBrokerName} Balance` ``.
- If `!connected`: red banner `` `${activeBrokerName} Not Connected` `` + "Connect now" →
  Broker screen. **Do not show a Dhan-specific warning when Zerodha is active.**
- Positions list rows keep a small `activeBrokerName` chip.

### 3.4 Exit button
Unchanged endpoint (`/execute-dhan-order`) — it is broker-routed server side. Just refetch
positions + funds on success.

### 3.5 Adding a NEW broker later — RN checklist
Nothing. Confirm only:
- catalog item shows up in `/brokers` (admin toggled ON, `status: "live"`),
- generic connect screen resolves `/broker/<id>/*`,
- react-query keys include `activeBroker`.

---

## 4. QA checklist
- [ ] Fresh user → chooser appears (`chosen:false`).
- [ ] Pick Zerodha → login webview → status connected → Home shows Zerodha funds/positions.
- [ ] Switch to Dhan → Zerodha session cleared, banner + funds update without app restart.
- [ ] Admin turns a broker OFF → it disappears from chooser; switching returns 403.
- [ ] Zerodha switch shows instrument-sync loader and orders place with Kite tradingsymbols.
- [ ] No literal "Dhan"/"Zerodha" strings in RN components (grep).
