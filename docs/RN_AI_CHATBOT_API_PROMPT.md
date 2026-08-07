# IndexPilot AI Chatbot — API for React Native app

Same backend as the website. Nothing else in the system was changed.

Base URL:
```
https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/ai-chat
```
Auth: the logged-in user's Supabase access token.
```
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
```

---

## 1. Get pricing + wallet balance (call when chat opens)

`GET  /ai-chat?action=config`

Response:
```json
{ "success": true, "enabled": true, "pricePerQuery": 0.5, "balance": 128.75 }
```

## 2. Ask a question (this debits the wallet)

`POST /ai-chat?action=chat`
```json
{
  "message": "Why my running NIFTY CE position is in loss?",
  "history": [
    { "role": "user", "content": "next signal when?" },
    { "role": "assistant", "content": "..." }
  ]
}
```
`history` = last few turns (max 8 are used). Optional.

Success `200`:
```json
{
  "success": true,
  "reply": "Your NIFTY 24650 CE ...",
  "charged": 0.5,
  "balance": 128.25,
  "pricePerQuery": 0.5,
  "freeQueriesLeft": 0
}
```

Errors:
| Status | body.error | Meaning / UI action |
|---|---|---|
| 401 | Unauthorized | token missing/expired → re-login |
| 400 | message is required / message too long | validate input (max 1000 chars) |
| 402 | INSUFFICIENT_BALANCE | show "Recharge wallet" sheet (`balance`, `pricePerQuery` returned) |
| 429 | RATE_LIMIT | show retry toast |
| 503 | – | assistant disabled by admin |
| 502 | AI_ERROR | service down — **the charge is auto-refunded** |

## 3. Admin only — change price / enable-disable

`POST /ai-chat?action=set-config` (admin JWT)
```json
{ "pricePerQuery": 0.75, "enabled": true, "freeQueriesPerDay": 2 }
```
Price is fully variable and starts from ₹0.50 (default). `freeQueriesPerDay` gives free questions before charging.

---

## Billing behaviour
- Wallet is debited **before** the model call; a `wallet_transactions` row of type `debit`, description `AI Assistant query` is inserted.
- If the AI service fails, an automatic `credit` refund row is written and the balance restored.
- Free daily quota (if configured) is consumed first (charge = ₹0.00).

## What the bot can answer (scope-locked server-side)
- Signals: why a signal fired / didn't fire, next-signal conditions, confidence, strategy confirmations
- Orders: status, Dhan rejection reasons, quantity/lots, what happens after placement
- Positions: live P&L, target/SL, trailing SL, exit reason, whether the position direction matches current market movement
- Chart/market movement for the traded index & option contract
- Wallet: balance, why an amount was debited, recharge need

Anything else is politely refused.

## Minimal RN client

```ts
const AI_CHAT_URL = "https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/ai-chat";

export async function askAI(token: string, message: string, history: any[] = []) {
  const res = await fetch(`${AI_CHAT_URL}?action=chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, history: history.slice(-8) }),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.message || "AI error"), { code: data.error, data });
  return data; // { reply, charged, balance }
}

export async function aiConfig(token: string) {
  const res = await fetch(`${AI_CHAT_URL}?action=config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json(); // { pricePerQuery, balance, enabled }
}
```

UI in RN: a floating `<Pressable>` bot button on the dashboard (bottom-right, above tab bar) opening a bottom-sheet chat — show `₹{pricePerQuery} per question` and the live wallet balance in the header, quick-question chips, and on `INSUFFICIENT_BALANCE` open the existing recharge screen.
