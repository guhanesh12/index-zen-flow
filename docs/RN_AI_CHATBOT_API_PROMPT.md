# IndexPilot AI Chatbot — COMPLETE React Native prompt + API spec (v3)

Everything needed to build the AI bot inside the RN app: every endpoint, every request/response field, every error, all UI behaviour and ready-to-paste TypeScript. The backend is already live — **do not change anything else in the app**.

---

# 0. Connection

```
BASE = https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/ai-chat
```
Every call (GET and POST):
```
Authorization: Bearer <supabase access token>   // supabase.auth.getSession().data.session.access_token
Content-Type: application/json
```
The action is always a **query param**: `?action=chat`, `?action=config`, …
`GET` with no action behaves like `?action=config`.
`401 {"error":"Unauthorized"}` → refresh session / re-login.

---

# 1. What the bot knows (server-side context, automatic)

On every chat question the server loads, for the logged-in user only:

| Group | Data |
|---|---|
| `now_ist`, `market_open` | IST clock, 09:15–15:30 window |
| `engine` | is_running, started_at, stopped_at, last_heartbeat, stopped_reason, auto_resume, selected_symbol_count |
| `broker` | connected, broker, auth_method, dhan_client_id, dhan_client_name, last_status, last_error, access_token_expires_at, access_token_expired |
| `recent_signals` (8), `latest_signal` | symbol, signal_type, index_name, price, strike_price, option_type, confidence, status, created_at |
| `recent_orders` (8) | symbol, order/transaction type, quantity, price, status, error_message, dhan_order_id |
| `positions`, `open_positions` | order_id, symbol, entry_price, current_price, quantity, pnl, target_amount, stop_loss_amount, trailing_enabled, highest_pnl, is_active, exit_reason |
| `auto_slots`, `free_slots` | slot, index_name, moneyness, lot_count, enabled, target_per_lot, stop_loss_per_lot, trailing_enabled, trailing_activation_per_lot, trailing_step_per_lot |
| `wallet` | balance, totalDeducted, totalProfit + last 10 transactions |
| `live_market` (only for analysis questions) | real 5-min Dhan candles per relevant index: LTP, day change %, day high/low, VWAP, EMA9/21/50, RSI14, ADX14, ATR14, trend, momentum, CALL/PUT/WAIT bias, last 6 candles, plus the running option contract's own premium chart |

So the RN app **never** has to send account data — only the question and the last few turns.

---

# 2. `GET ?action=config`

```json
{
  "success": true,
  "enabled": true,
  "pricePerQuery": 0.5,
  "balance": 128.75,
  "billingNote": "Only signal / position / chart analysis questions are charged. General & wallet questions are free."
}
```
`enabled:false` → hide/disable the bot FAB.

---

# 3. `POST ?action=chat` — the main call

Request:
```json
{
  "message": "now call option run but loss — hold or exit?",
  "history": [
    { "role": "user", "content": "next signal?" },
    { "role": "assistant", "content": "<previous answer.summary>" }
  ]
}
```
- `message`: 1–1000 chars (trim; block empty; counter at 1000).
- `history`: last **8** turns max; assistant turns must send `answer.summary` (not the whole card).

Response `200`:
```json
{
  "success": true,
  "reply": "plain-text fallback (markdown)",
  "answer": {
    "title": "Hold — trend still favourable",
    "verdict": "HOLD",
    "summary": "Your NIFTY 24650 CE is -₹420 but EMA9 > EMA21 and price holds above VWAP…",
    "sections": [
      { "heading": "Market Read", "points": ["NIFTY 24,712 (+0.32%)", "RSI 61 · ADX 27 · above VWAP 24,690"] },
      { "heading": "Your Position", "points": ["Entry ₹128.5 · LTP ₹121.2 · 2 lots · P&L -₹420"] },
      { "heading": "Levels", "points": ["Target ₹6,000/lot", "SL ₹3,000/lot", "Trail after ₹2,000"] },
      { "heading": "What Happens Next", "points": ["Above 24,690 the engine keeps the position…"] }
    ],
    "confidence": 72,
    "risk": "Reversal below VWAP invalidates this view.",
    "action": { "type": "none", "label": "", "signalId": "", "orderId": "", "reason": "" }
  },
  "charged": 0.5,
  "billable": true,
  "freeReason": "",
  "balance": 128.25,
  "pricePerQuery": 0.5,
  "freeQueriesLeft": 0
}
```

Field rules:
| Field | Notes |
|---|---|
| `answer.verdict` | `WAIT` amber · `PLACE` green · `HOLD` blue · `EXIT` red · `INFO` grey |
| `answer.sections` | 0–6 panels, each 1–8 markdown bullet points |
| `answer.confidence` | 0–100; hide the chip when 0 |
| `answer.risk` | may be `""` → hide the amber strip |
| `answer.action` | see §4; **only ever render what this returns** |
| `reply` | plain markdown fallback — use only if you don't render cards |
| `charged` / `freeReason` | footer line |

## Billing rule (server-side, cannot be bypassed)
| Question | Charge |
|---|---|
| Next signal / why no trade / chart direction / hold-or-exit / order or position analysis | `pricePerQuery` (default ₹0.50, admin variable) |
| Greetings, thanks, help, pricing, wallet balance, "why debited" | **₹0** — `charged:0`, `billable:false`, `freeReason` set |
| Free daily quota turns (`freeQueriesLeft`) | ₹0 — `freeReason: "Free daily quota used"` |
| Every action endpoint (place / exit / engine / slot / broker) | **₹0 always** |

Footer text: `charged > 0 ? "₹" + charged.toFixed(2) + " debited from wallet" : "Free — " + freeReason`.
If the AI service fails after a debit, the charge is **auto-refunded** server-side.

---

# 4. Action buttons — render ONLY from `answer.action.type`

| `type` | UI | Call |
|---|---|---|
| `none` | nothing (text-only card) | – |
| `place_order` | green **Place order** (`label`) | `POST ?action=place-order` `{ "signalId": action.signalId }` |
| `exit_position` | red **Exit position** | `POST ?action=exit-position` `{ "orderId": action.orderId }` |
| `start_engine` | green **Start trading engine** | `POST ?action=engine-start` `{}` |
| `stop_engine` | grey **Stop trading engine** | `POST ?action=engine-stop` `{}` |
| `edit_slot` | inline slot form, prefilled from `action.current`, slot no = `action.slot` | `POST ?action=update-slot` |
| `connect_broker` | **Open broker settings** — just navigate to the Broker screen, no API call | – |

The server re-validates before it ever returns a button:
- `place_order` only when market is open, the signal is < 15 min old, and an enabled free slot exists — otherwise the verdict is flipped to `WAIT` and `type` stays `none`.
- `exit_position` only when that position is actually running.
- `start_engine` auto-flips to `stop_engine` when the engine is already running.

`action.current` (edit_slot) = the live `user_symbol_config` row:
`{ slot, index_name, moneyness, lot_count, enabled, target_per_lot, stop_loss_per_lot, trailing_enabled, trailing_activation_per_lot, trailing_step_per_lot }`

Every action button: spinner while running → on success append a confirmation bubble with `message` → disable the button permanently → caption "no wallet charge".

---

# 5. Action endpoints (all free)

### `POST ?action=place-order` `{ "signalId": "uuid" }`
`200 { "success": true, "message": "Order placed at market price.", "orderId": "1123…", "charged": 0 }`
Errors: `SIGNAL_NOT_FOUND` 404 · `SIGNAL_EXPIRED` 400 (older than 15 min) · `NO_SECURITY_ID` 400 · `ORDER_FAILED` 502 (`message` = raw Dhan reason, show it verbatim).

### `POST ?action=exit-position` `{ "orderId": "1123456789" }`
`200 { "success": true, "message": "Exit order placed at market price.", "orderId": "…", "charged": 0 }`
Errors: `POSITION_NOT_ACTIVE` 400 · `NO_SECURITY_ID` 400 · `EXIT_FAILED` 502.
On success the position closes with `exit_reason: manual_ai_chat_exit` and the journal / P&L flow continues as usual → refresh Positions + Journal screens.

### `POST ?action=engine-start` `{}`
Starts VPS + signal engine with the user's saved slots/symbols and candle interval.
`200 { "success": true, "message": "Trading engine started with 3 symbol(s) on 15M candles.", "charged": 0 }`
Errors: `NO_SYMBOLS` 400 · `ENGINE_START_FAILED` 502.

### `POST ?action=engine-stop` `{}`
`200 { "success": true, "message": "Trading engine stopped. VPS is powering off.", "charged": 0 }` · error `ENGINE_STOP_FAILED` 502.

### `POST ?action=slot-details` `{ "slot": 1 }`
`200 { "success": true, "slot": { …user_symbol_config row… } }` (`slot: null` when not configured) · error `Invalid slot` 400.

### `POST ?action=update-slot`
```json
{
  "slot": 1,
  "indexName": "NIFTY",
  "moneyness": "ATM",
  "lotCount": 2,
  "enabled": true,
  "targetPerLot": 6000,
  "stopLossPerLot": 3000,
  "trailingEnabled": true,
  "trailingActivationPerLot": 2000,
  "trailingStepPerLot": 1000
}
```
Only `slot` is required; omitted fields keep their current value.
`200 { "success": true, "message": "Slot 1 updated — NIFTY ATM, 2 lot(s), Target ₹6000/lot, SL ₹3000/lot.", "slot": {…}, "charged": 0 }`
Errors: `Invalid slot` 400 · `SLOT_UPDATE_FAILED` 502.
Index options: `NIFTY | BANKNIFTY | FINNIFTY | MIDCPNIFTY | SENSEX`. Moneyness: `ITM2 | ITM1 | ATM | OTM1 | OTM2`.

### `POST ?action=broker-status` `{}`
```json
{ "success": true, "connected": true, "broker": "dhan", "dhanClientId": "…", "dhanClientName": "…",
  "lastStatus": "…", "lastError": null, "accessTokenExpiresAt": "2026-08-09T05:00:00.000Z",
  "accessTokenExpired": false, "charged": 0 }
```

---

# 6. History

### `GET ?action=history`
`200 { "success": true, "messages": [ { "id", "role": "user"|"assistant", "content", "answer", "charged", "created_at" } ] }`
Oldest first, max 100. Load this when the sheet opens so the conversation survives app restarts. `answer` is null for old rows → fall back to `content` markdown.
**Do not add any local-only chat storage** that diverges from this (admins see the same server log).

---

# 7. Admin only (403 for non-admins)

- `POST ?action=set-config` `{ "pricePerQuery": 0.75, "enabled": true, "freeQueriesPerDay": 2 }`
- `GET ?action=admin-chat-users` → `{ users: [{ user_id, messages, charged, last_message, last_at, profile }] }`
- `GET ?action=admin-chat-history&userId=<uuid>` → `{ profile, messages: [{ role, content, answer, verdict, action_type, charged, created_at }] }`

---

# 8. Error table

| Status | `body.error` | UI |
|---|---|---|
| 401 | Unauthorized | refresh session → re-login |
| 400 | message is required / message too long | client-side guard, max 1000 chars |
| 402 | INSUFFICIENT_BALANCE | open recharge sheet; body has `balance`, `pricePerQuery` |
| 429 | RATE_LIMIT | retry toast |
| 402 | AI_CREDITS | "AI temporarily unavailable" |
| 503 | AI assistant is currently disabled | admin turned it off — hide the FAB |
| 502 | AI_ERROR | service down — the charge is auto-refunded |
| 500 | SERVER_ERROR | generic toast with `message` |

---

# 9. TypeScript client (paste into `src/api/aiChat.ts`)

```ts
import { supabase } from "../lib/supabase";

const BASE = "https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/ai-chat";

export type Verdict = "WAIT" | "PLACE" | "HOLD" | "EXIT" | "INFO";
export type ActionType =
  | "none" | "place_order" | "exit_position"
  | "start_engine" | "stop_engine" | "edit_slot" | "connect_broker";

export interface SlotRow {
  slot: number; index_name: string; moneyness: string; lot_count: number; enabled: boolean;
  target_per_lot: number; stop_loss_per_lot: number; trailing_enabled: boolean;
  trailing_activation_per_lot: number; trailing_step_per_lot: number;
}
export interface AiAction {
  type: ActionType; label: string; signalId?: string; orderId?: string;
  slot?: number; current?: SlotRow; reason?: string;
}
export interface AiAnswer {
  title: string; verdict: Verdict; summary: string;
  sections: { heading: string; points: string[] }[];
  confidence: number; risk: string; action: AiAction;
}
export interface ChatResponse {
  success: true; reply: string; answer: AiAnswer;
  charged: number; billable: boolean; freeReason: string;
  balance: number; pricePerQuery: number; freeQueriesLeft: number;
}

async function call<T>(action: string, method: "GET" | "POST" = "GET", body?: any, qs = ""): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw Object.assign(new Error("Unauthorized"), { code: "Unauthorized", status: 401 });

  const res = await fetch(`${BASE}?action=${action}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(json.message || json.error || `HTTP ${res.status}`), {
      code: json.error, status: res.status, payload: json,
    });
  }
  return json as T;
}

export const aiChat = {
  config: () => call<{ enabled: boolean; pricePerQuery: number; balance: number; billingNote: string }>("config"),
  history: () => call<{ messages: any[] }>("history"),
  send: (message: string, history: { role: "user" | "assistant"; content: string }[]) =>
    call<ChatResponse>("chat", "POST", { message, history: history.slice(-8) }),
  placeOrder: (signalId: string) => call<any>("place-order", "POST", { signalId }),
  exitPosition: (orderId: string) => call<any>("exit-position", "POST", { orderId }),
  engineStart: () => call<any>("engine-start", "POST", {}),
  engineStop: () => call<any>("engine-stop", "POST", {}),
  slotDetails: (slot: number) => call<{ slot: SlotRow | null }>("slot-details", "POST", { slot }),
  updateSlot: (p: Partial<{
    slot: number; indexName: string; moneyness: string; lotCount: number; enabled: boolean;
    targetPerLot: number; stopLossPerLot: number; trailingEnabled: boolean;
    trailingActivationPerLot: number; trailingStepPerLot: number;
  }>) => call<any>("update-slot", "POST", p),
  brokerStatus: () => call<any>("broker-status", "POST", {}),
};
```

---

# 10. RN implementation prompt (paste into your RN app agent)

> Build/upgrade the IndexPilot AI bot screen. **Do not change anything else in the app.** Use the API client in §9 exactly as written; never invent endpoints, never render buttons the API didn't return, never store chat locally.
>
> **Entry point:** floating bot FAB on the Dashboard (bottom-right, above the tab bar, pulse animation, hidden when `config.enabled === false`) → opens a bottom sheet at 90% height with `KeyboardAvoidingView`.
>
> **Header:** bot avatar, title "IndexPilot AI", subtitle "Signals · Orders · Positions · Slots · Engine · Wallet", close button.
> **Strip under header:** left `₹{pricePerQuery} per analysis · general Q free`, right live wallet balance with a wallet icon (update from every response's `balance`).
>
> **On open:** `GET ?action=history` → hydrate transcript (render `answer` when present, else `content` as markdown), then `GET ?action=config` for price/balance/enabled. Scroll to bottom.
>
> **Sending:** append the user bubble optimistically, show a shimmer "Analysing chart, signals & your position…", call `aiChat.send(message, last8Turns)` where assistant turns pass `answer.summary`. Disable the composer while in flight.
>
> **Assistant messages are cards, never raw text:**
> 1. Header row: verdict pill (WAIT amber / PLACE green "ENTRY READY" / HOLD blue / EXIT red "EXIT NOW" / INFO grey) + `title` + `confidence`% chip (hide when 0).
> 2. `summary` via `react-native-markdown-display` — bold must render bold.
> 3. Each `sections[]` item as its own soft panel: uppercase primary-coloured `heading` + bulleted `points` (markdown).
> 4. `risk` in an amber strip with a shield icon (skip when empty).
> 5. Action UI strictly from `answer.action.type` (see §4):
>    - `place_order` → green button → `aiChat.placeOrder(action.signalId)`
>    - `exit_position` → red button → `aiChat.exitPosition(action.orderId)`
>    - `start_engine` → green **Start trading engine** → `aiChat.engineStart()`
>    - `stop_engine` → grey **Stop trading engine** → `aiChat.engineStop()`
>    - `edit_slot` → inline form INSIDE the card, prefilled from `action.current`: Index picker (NIFTY/BANKNIFTY/FINNIFTY/MIDCPNIFTY/SENSEX), Moneyness picker (ITM2/ITM1/ATM/OTM1/OTM2), numeric inputs Lots, Target/lot, SL/lot, Trail activate, Trail step, switches "Slot enabled" and "Trailing SL", Save → `aiChat.updateSlot({ slot: action.slot, ...fields })`
>    - `connect_broker` → button that closes the sheet and navigates to the existing Broker screen (no API call)
>    Each action: spinner → on success append a confirmation bubble with the returned `message`, disable the button, caption "no wallet charge" → then refresh the relevant screen (Positions/Journal after order or exit, Engine status after start/stop, Symbols after slot save).
> 6. Footer line: `₹X debited from wallet` or `Free — {freeReason}`.
>
> **User messages:** right-aligned primary bubble with time.
> **Quick chips on first open:** "next signal", "why no trade today", "hold or exit my position", "slot 1 details", "start my trading engine", "broker token expiry status", "why was my wallet debited".
>
> **Errors (§8):** 402 `INSUFFICIENT_BALANCE` → open the existing recharge screen prefilled with `pricePerQuery`; 401 → refresh session then retry once, else route to login; 429 → retry toast; 502/503/500 → inline error bubble with a Retry button (no charge — refunds are automatic). Action-endpoint failures show `message` verbatim (it carries the raw Dhan rejection reason).
>
> **Constraints:** message max 1000 chars; only the last 8 turns go in `history`; everything is logged server-side and visible to admins; do not add mock replies, local persistence, or extra buttons.
