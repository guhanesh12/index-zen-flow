# RN App Fix Prompt — Broker "not connected" popup + `syncInstruments` 404 spam

## What is actually wrong

Logs from the RN app:

```
[BrokerContext] syncInstruments endpoint not available (404), skipping
```

The backend (`make-server-c4d79cb7`) has **no generic `syncInstruments` endpoint**.
There is no `/sync-instruments`, no `/instruments/sync`, no `/broker/instruments/sync`.
Instrument sync is **per broker only**:

```
POST /make-server-c4d79cb7/broker/kite/instruments/sync
POST /make-server-c4d79cb7/broker/groww/instruments/sync
POST /make-server-c4d79cb7/broker/upstox/instruments/sync
POST /make-server-c4d79cb7/broker/fyers/instruments/sync
POST /make-server-c4d79cb7/broker/angelone/instruments/sync
POST /make-server-c4d79cb7/broker/aliceblue/instruments/sync
POST /make-server-c4d79cb7/broker/5paisa/instruments/sync
```

Dhan has **no** instrument-sync route at all (Dhan contracts are resolved on demand
server-side), so for Dhan the RN app must never call any sync route.

Second bug: the RN `BrokerContext` treats the failed/404 sync call as "broker is not
connected" and shows the popup, even though the broker is connected. Connection state
must come **only** from `/broker/active`, never from the instruments call.

## Task for the RN app

1. Delete the generic `syncInstruments()` call and the 404 log spam.
2. Derive connection status only from `GET /make-server-c4d79cb7/broker/active`.
3. Call instrument sync/status only for brokers that support it, and only once
   (manual button or app start), never in a polling loop.
4. Never show the "Broker not connected" popup on a network/HTTP error — only when
   the server explicitly reports `connected: false`.

## Backend API contract (authoritative)

Base URL: value stored in AsyncStorage key `indexpilotai_custom_backend_url`
(fallback to the default Supabase functions URL), then append `/make-server-c4d79cb7/...`.

All calls need:
```
Authorization: Bearer <supabase access_token>
Content-Type: application/json
```

### 1. Connection status — the single source of truth
`GET /broker/active` → 200
```json
{
  "success": true,
  "activeBroker": "dhan",
  "activeBrokerName": "Dhan",
  "chosen": true,
  "connected": true,
  "available": {
    "dhan": true, "zerodha": false, "groww": false, "upstox": false,
    "fyers": false, "angelone": false, "aliceblue": false, "5paisa": false
  },
  "brokers": [ /* admin-enabled broker catalog */ ]
}
```
Rules:
- `connected === true` → connected. Show green state, no popup.
- `connected === false && chosen === false` → user hasn't picked a broker → show
  "Select a broker", not "not connected".
- `connected === false && chosen === true` → show the connect/reconnect CTA.
- `401` → session expired → refresh Supabase session and retry once; do NOT show
  broker popup.
- Any other non-2xx / network error → keep the **last known** status, log once, retry
  with backoff. Never flip UI to "not connected".

### 2. Select active broker
`POST /broker/active` body `{ "broker": "dhan" }`

### 3. Broker catalog (admin-enabled brokers)
`GET /brokers` → `{ success, brokers: [...] }`

### 4. Dhan credentials (Dhan only)
- `GET /api-credentials` → saved Dhan client id / masked token
- `POST /api-credentials` → save `{ dhanClientId, dhanAccessToken }`
- `POST /test-dhan` → validates the credentials against Dhan

### 5. Per-broker status + instrument sync (NOT for Dhan)
For `broker ∈ { kite, groww, upstox, fyers, angelone, aliceblue, 5paisa }`:
- `GET /broker/{broker}/status`  (kite uses `/broker/kite/status`)
- `GET /broker/{broker}/instruments/status` → `{ success, count, updatedAt, ... }`
- `POST /broker/{broker}/instruments/sync` → `{ success, count }`

Notes:
- `zerodha` is the id used in `available`, but its routes use the `kite` segment.
- `5paisa` is used literally in the path.
- Sync is a heavy call: run it at most once per app session, only when
  `instruments/status` reports `count === 0` or a stale `updatedAt` (> 24h),
  and only for the **active** broker.

## Required RN implementation

### `src/api/brokerApi.ts`
```ts
export const SYNC_CAPABLE = ['zerodha','groww','upstox','fyers','angelone','aliceblue','5paisa'] as const;
const SEGMENT: Record<string,string> = { zerodha: 'kite' }; // else same as id

export async function getBrokerActive(): Promise<BrokerActive>            // GET /broker/active
export async function setBrokerActive(broker: string): Promise<void>      // POST /broker/active
export async function getInstrumentStatus(b: string)                      // GET /broker/{seg}/instruments/status
export async function syncInstruments(b: string)                          // POST /broker/{seg}/instruments/sync
```
`syncInstruments` must throw `UnsupportedBrokerError` (no HTTP call) when
`!SYNC_CAPABLE.includes(broker)` — this alone removes the Dhan 404 spam.

### `src/context/BrokerContext.tsx`
State:
```ts
type BrokerState = {
  status: 'unknown' | 'loading' | 'ready';
  activeBroker: string | null;
  connected: boolean;
  chosen: boolean;
  available: Record<string, boolean>;
  lastError: string | null;   // transport error, does NOT mean disconnected
};
```
Behaviour:
- `refresh()` calls `/broker/active`; on success set `connected/chosen/available`,
  `status = 'ready'`, `lastError = null`.
- On failure: set `lastError`, keep previous `connected` value, `status` stays `ready`
  if it was already ready. Log once per error string (dedupe), not per poll tick.
- Poll every 60s while the app is foregrounded, plus on app-resume; stop polling in
  background. No 5s loops.
- Instrument sync runs in a `useEffect` guarded by a `syncedRef` set, keyed by broker,
  so it can fire only once per broker per session, and only when the broker is
  sync-capable and connected.

### Popup rule (the actual user complaint)
Show "Broker not connected" **only** when:
```ts
state.status === 'ready' && state.chosen && !state.connected && !state.lastError
```
Never show it from a `catch` block, never from a 404/500, never while `status !== 'ready'`.
Transport problems show a small non-blocking toast: "Can't reach server, retrying…".

## Acceptance checklist
- [ ] No `syncInstruments endpoint not available (404)` line ever appears again.
- [ ] With Dhan connected, no instrument-sync HTTP request is made at all.
- [ ] Turning off Wi-Fi does not produce the "Broker not connected" popup.
- [ ] Popup appears only after `/broker/active` returns `connected: false`.
- [ ] Instrument sync fires at most once per broker per app session.
- [ ] 401 triggers one silent session refresh + retry before any UI change.
