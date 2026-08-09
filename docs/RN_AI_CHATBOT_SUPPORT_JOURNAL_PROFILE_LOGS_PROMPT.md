# RN App Prompt — AI Chat Bot: Support Ticket + Journal + Profile + Logs (ADD-ON ONLY)

This is an **add-on** to the existing AI Chat Bot screen (`docs/RN_AI_CHATBOT_API_PROMPT.md`).
Do **not** change any existing chat behaviour, billing, signal / position / engine / slot / broker
actions. Only add the 4 new capabilities below.

Base URL: `https://<PROJECT_REF>.supabase.co/functions/v1/ai-chat`
Auth header on **every** call: `Authorization: Bearer <supabase user access_token>`
All endpoints below are **FREE** (`charged: 0`) — never debit the wallet for them.

---

## 1. New API endpoints

### 1.1 Create support ticket
`POST /ai-chat?action=create-ticket`
```json
{ "subject": "Order rejected today", "message": "9:46 signal order failed with DH-901", "urgency": "URGENT", "category": "TECHNICAL" }
```
- `urgency`: `URGENT | NORMAL | LOW` (default `NORMAL`)
- `category`: `TECHNICAL | REFUND | WEBSITE | OTHER` (default `TECHNICAL`)

Response: `{ "success": true, "ticketId": "ticket_...", "message": "Support ticket created...", "charged": 0 }`
Errors: `400` missing subject/message, `502` `{ "error": "TICKET_FAILED", "message": "..." }`

### 1.2 My support tickets
`POST /ai-chat?action=support-tickets` → `{ "success": true, "tickets": [{ id, subject, status, urgency, category, createdAt, hasReply }] }`

### 1.3 Journal entries + stats
`POST /ai-chat?action=journal` body `{ "limit": 50 }`
```json
{
  "success": true,
  "entries": [{ "id": "journal:<uid>:2026-08-07:...", "date": "2026-08-07", "symbol": "NIFTY 24500 CE", "side": "BUY", "pnl": 1250.5, "quantity": 75, "strategy": "auto" }],
  "stats": { "total_trades": 42, "total_pnl": 18240.25, "wins": 27, "losses": 15, "win_rate": 64.3 },
  "charged": 0
}
```

### 1.4 Profile — read
`POST /ai-chat?action=profile` →
`{ "success": true, "profile": { full_name, email, mobile, photo_url, client_id, kyc_status, account_status, subscription_plan, broker_connected, profile_completion, joined_at }, "referralCode": "ALG0007", "earnings": {...} }`

### 1.5 Profile — update (only these 3 fields)
`POST /ai-chat?action=update-profile`
```json
{ "full_name": "Guhan R", "mobile": "9876543210", "photo_url": "https://..." }
```
Response `{ "success": true, "profile": {...}, "message": "Profile updated." }`
Errors: `400 Nothing to update` / `400 Invalid mobile number` / `502 PROFILE_UPDATE_FAILED`.

### 1.6 System logs
`POST /ai-chat?action=logs` body `{ "limit": 50 }` → `{ "success": true, "logs": [{ timestamp, message, type }] }` (latest first)

---

## 2. New chat action types (in `?action=chat` response `answer.action`)

The bot now returns these extra `action.type` values. Render an inline card for each:

| `action.type`   | Extra payload                                   | RN UI to render |
|-----------------|-------------------------------------------------|-----------------|
| `create_ticket` | `ticket: { subject, message, urgency, category }` | Pre-filled form (subject input, message textarea, urgency + category pickers) and a **"Create support ticket"** button → `?action=create-ticket` with the edited values |
| `edit_profile`  | `current: { full_name, mobile, photo_url, client_id, email, ... }` | Inline form for name / mobile / photo URL + **"Save profile"** → `?action=update-profile` |
| `view_journal`  | `stats: {...}`, `entries: [...10]`               | 3 stat chips (Trades, P&L, Win %) + last 6 rows (`date · symbol` left, coloured `₹pnl` right) + **"Open full journal"** → navigate to Journal screen |
| `view_logs`     | `logs: [...10]`                                  | Last 6 log lines (`HH:mm · message`) + **"Open logs"** → navigate to Logs screen |

Rules:
- These action cards are FREE. Never show a wallet-debit note on them.
- After a successful `create-ticket` / `update-profile` call, append a new assistant bubble
  ("Support ticket created" / "Profile updated") and disable the button (`done` state).
- Show `message` from an error response in red under the card; keep the form values.

---

## 3. What the bot already knows (server side)

When the user's question mentions journal / P&L / profile / account / referral / logs / activity /
support / ticket / complaint, the server automatically injects into the AI context:
`journal_stats`, `recent_journal` (10), `recent_logs` (15), `support_tickets` (5),
`profile` and `referral`. So the bot answers with **real** values — the app must not send them.

Example user prompts to support:
- "இந்த மாசம் என்ன P&L?" / "show my journal" → `view_journal`
- "my profile details" / "mobile number change pannu" → `edit_profile`
- "order fail aachu, complaint pannu" / "raise a ticket" → `create_ticket`
- "today logs show" / "what happened at 9:46" → `view_logs`

---

## 4. Implementation prompt for the RN agent

> Extend the existing AI Chat Bot screen only. Add four inline action cards — `create_ticket`,
> `edit_profile`, `view_journal`, `view_logs` — matching the table above, and add these methods to
> `src/api/aiChat.ts`: `createTicket(payload)`, `getSupportTickets()`, `getJournal(limit)`,
> `getProfile()`, `updateProfile(payload)`, `getLogs(limit)`, each doing
> `POST ${AI_CHAT_URL}?action=<name>` with the Supabase access token and JSON body, returning
> `res.json()` and throwing `data.message || data.error` when `res.ok === false`.
> All six are free — do not touch the wallet balance UI except to keep showing the current balance.
> Do not modify any existing action handling, billing logic, or the signal / position / engine /
> slot / broker cards.
