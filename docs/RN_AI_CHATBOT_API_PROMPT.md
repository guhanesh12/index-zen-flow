# IndexPilot AI Chatbot v2 — React Native prompt & API spec

Advanced structured (card-based) AI answers, action buttons (Place order / Exit position), and **wallet is charged only for analysis questions**. Same backend as the website. Nothing else in the system changed.

Base URL:
```
https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/ai-chat
```
Auth on every call:
```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

---

## 1. `GET /ai-chat?action=config`
```json
{
  "success": true,
  "enabled": true,
  "pricePerQuery": 0.5,
  "balance": 128.75,
  "billingNote": "Only signal / position / chart analysis questions are charged. General & wallet questions are free."
}
```

## 2. `POST /ai-chat?action=chat`
```json
{ "message": "now call option run but loss — hold or exit?", "history": [{"role":"user","content":"..."},{"role":"assistant","content":"..."}] }
```

Success `200`:
```json
{
  "success": true,
  "reply": "plain-text fallback",
  "answer": {
    "title": "Hold — trend still favourable",
    "verdict": "HOLD",              // WAIT | PLACE | HOLD | EXIT | INFO
    "summary": "Your NIFTY 24650 CE is -₹420 ...",
    "sections": [
      { "heading": "Market Read", "points": ["EMA9 > EMA21 ...", "VWAP support ..."] },
      { "heading": "Your Position", "points": ["Entry ₹128.5 · LTP ₹121.2 ..."] },
      { "heading": "Levels", "points": ["Target ₹6,000/lot", "SL ₹3,000/lot", "Trail after ₹2,000"] },
      { "heading": "What Happens Next", "points": ["..."] }
    ],
    "confidence": 72,
    "risk": "Reversal below VWAP invalidates this view.",
    "action": { "type": "none", "label": "", "signalId": "", "orderId": "", "reason": "" }
  },
  "charged": 0.5,
  "billable": true,
  "freeReason": "",
  "balance": 128.25,
  "pricePerQuery": 0.5
}
```

### Billing rule (server-side, cannot be bypassed)
| Question type | Charge |
|---|---|
| Next signal / why no trade / chart direction / hold-or-exit / order analysis | **₹pricePerQuery** (from ₹0.50, admin variable) |
| Greetings, thanks, wallet balance, "why debited", pricing, help | **₹0.00** — response has `charged: 0`, `billable: false`, `freeReason` |
| Place order / exit action calls | **₹0.00 always** |

Show under each answer: `charged > 0 ? "₹X debited" : "Free — " + freeReason`.

### Action buttons (render from `answer.action`)
| `action.type` | Button | Call |
|---|---|---|
| `none` | none (verdict WAIT / HOLD / INFO — text only) | – |
| `place_order` | green **Place order** | `POST ?action=place-order` `{ "signalId": action.signalId }` |
| `exit_position` | red **Exit position** | `POST ?action=exit-position` `{ "orderId": action.orderId }` |
| `start_engine` | green **Start trading engine** | `POST ?action=engine-start` `{}` |
| `stop_engine` | grey **Stop trading engine** | `POST ?action=engine-stop` `{}` |
| `edit_slot` | inline **slot edit form** (prefilled from `action.current`, slot no = `action.slot`) | `POST ?action=update-slot` |
| `connect_broker` | **Open broker settings** (navigate to your Broker tab — no API call) | – |

The server re-validates before showing a button: `place_order` only when market is open, the signal is < 15 min old and an enabled free slot exists; `exit_position` only when that position is actually running; `start_engine` flips to `stop_engine` if the engine is already running. So never render your own buttons — only what `action` says.

`action.current` (for `edit_slot`) is the live `user_symbol_config` row: `{ slot, index_name, moneyness, lot_count, enabled, target_per_lot, stop_loss_per_lot, trailing_enabled, trailing_activation_per_lot, trailing_step_per_lot }`.


## 3. `POST /ai-chat?action=place-order`
```json
{ "signalId": "uuid" }
```
→ `200 { "success": true, "message": "Order placed at market price.", "orderId": "1123...", "charged": 0 }`
Errors: `SIGNAL_NOT_FOUND` 404, `SIGNAL_EXPIRED` 400, `NO_SECURITY_ID` 400, `ORDER_FAILED` 502 (`message` = raw Dhan reason).

## 4. `POST /ai-chat?action=exit-position`
```json
{ "orderId": "1123456789" }
```
→ `200 { "success": true, "message": "Exit order placed at market price.", "orderId": "...", "charged": 0 }`
Errors: `POSITION_NOT_ACTIVE` 400, `NO_SECURITY_ID` 400, `EXIT_FAILED` 502.
On success the position is marked closed (`exit_reason: manual_ai_chat_exit`) and the journal/P&L flow continues as usual.

## 5. Admin only — `POST /ai-chat?action=set-config`
```json
{ "pricePerQuery": 0.75, "enabled": true, "freeQueriesPerDay": 2 }
```

## Chat error table
| Status | body.error | UI action |
|---|---|---|
| 401 | Unauthorized | re-login |
| 400 | message is required / too long | max 1000 chars |
| 402 | INSUFFICIENT_BALANCE | open recharge sheet (`balance`, `pricePerQuery`) |
| 429 | RATE_LIMIT | retry toast |
| 503 | – | assistant disabled by admin |
| 502 | AI_ERROR | service down — charge is **auto-refunded** |

---

## RN implementation prompt (paste into your RN app agent)

> Upgrade the existing IndexPilot AI bot screen. Keep everything else untouched.
>
> **UI:** floating bot FAB on Dashboard (bottom-right above tab bar) → bottom sheet chat (90% height).
> Header: bot avatar, "IndexPilot AI", subtitle "Signals · Orders · Positions · Wallet", close.
> Strip below header: `₹{pricePerQuery} per analysis · general Q free` on the left, live wallet balance with wallet icon on the right.
>
> **Assistant messages are NOT raw text** — render `answer` as a card:
> 1. Header row: verdict pill (WAIT amber / ENTRY READY green / HOLD blue / EXIT NOW red / INFO grey) + `title` + `confidence`%.
> 2. `summary` as markdown (`react-native-markdown-display`) — bold must render bold.
> 3. Each `sections[]` item as its own soft panel: uppercase primary-coloured `heading` + bulleted `points` (markdown).
> 4. `risk` in an amber warning strip with a shield icon.
> 5. Action button from `answer.action` (green Place order / red Exit position), with spinner, disabled after success, and caption "no wallet charge".
> 6. Footer line: `₹X debited from wallet` or `Free — {freeReason}`.
>
> User messages: right-aligned primary bubble. Loading: "Analysing chart, signals & your position…" shimmer.
> Quick chips on first open: next signal, why no trade today, hold or exit my position, last order status, why wallet debited.
>
> **Behaviour:** send last 8 turns as `history` (`{role, content}` where assistant content = `answer.summary`).
> On `402 INSUFFICIENT_BALANCE` open the existing recharge screen.
> Action buttons call `?action=place-order` / `?action=exit-position` with the same access token; on success append a confirmation card and refresh positions/orders lists.
> Never invent buttons — only render what `answer.action.type` returns.
