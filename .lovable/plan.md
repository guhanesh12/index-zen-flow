# Premium Email System — Complete Plan

## Goal
Send beautifully designed, branded transactional emails for every important user event in IndexPilot AI, with full user details (name, client ID, etc.) populated correctly.

## 1. Fix existing template data
- `welcome` template currently shows empty name/client ID for test sends.
- Update `send-email` edge function to auto-fetch user profile (`full_name`, `client_id`, `email`) from `profiles` table when only `to` (email) or `userId` is provided.
- All templates accept `{ name, clientId, email, ...customData }` automatically.

## 2. Build premium HTML email templates (React-Email style, branded)
Design: dark navy header + IndexPilot AI logo, gold accent (#F4B400), white content card, footer with disclaimer + unsubscribe.

Templates to create / upgrade:

| Key | Trigger | Content |
|---|---|---|
| `welcome` | After signup | Name, Client ID, dashboard CTA |
| `otp_register` | Registration OTP | 6-digit OTP, 10-min expiry |
| `wallet_credit` | Wallet recharge / credit | Amount, new balance, txn ID, date |
| `wallet_debit` | Wallet debit | Amount, balance, reason, txn ID |
| `signal_buy_call` | Engine fires BUY_CALL | Symbol, strike, LTP, confidence, reasoning |
| `signal_buy_put` | Engine fires BUY_PUT | Same as above |
| `order_market_closed` | Pre-market signal blocked | "Market is closed" notice with next session time |
| `position_closed_profit` | Position exits in profit | Symbol, entry/exit, P&L, % return |
| `position_closed_loss` | Position exits in loss | Same fields, red accent |
| `support_ticket_user` | User submits ticket | Ticket #, subject, body, "we'll respond soon" |
| `support_ticket_admin_reply` | Admin replies on ticket | Ticket #, admin reply, link to view |
| `daily_premarket_open` | 9:08 IST trading days only | "Markets opening soon, engine ready" |

WAIT signals do NOT send mail (only BUY_CALL / BUY_PUT — as requested).

## 3. Engine + holiday/weekend gating
- Add `nse_holidays` table (seed 2026 NSE holiday list) + helper `isTradingDay(date)`.
- Cron job for 9:08 IST premarket email runs daily but skips on weekends + holidays.
- Engine auto-trigger checks `isTradingDay()` before processing signals.

## 4. Wire triggers
- Razorpay webhook → wallet_credit/debit emails.
- `advanced_ai` engine, when `action ∈ {BUY_CALL, BUY_PUT}` → signal email.
- Position monitor exit → position_closed_profit/loss email.
- Support ticket create → user confirmation; admin reply → user notification.
- Registration OTP flow → otp_register mail.

## 5. Database
- `nse_holidays(date PK, name)`
- `support_tickets(id, user_id, subject, body, status, created_at)`
- `support_ticket_replies(id, ticket_id, author_id, is_admin, body, created_at)`
- (Skip if any already exist — verify first.)

## Technical notes
- Templates rendered via shared HTML builder in `_shared/email-templates.ts` (single design system; one render function per template key).
- Profile auto-fetch in `send-email` makes any caller able to just pass `{ userId, template, data }`.
- All sends logged to existing `email_logs` table.
- Honors `notification_preferences.email_enabled`.

## Out of scope (confirm if needed later)
- WhatsApp / SMS for same events (templates exist but channels are toggled off).
- Marketing newsletters (rejected — transactional only).

---

This is ~3-4 hours of focused work. Approve and I'll build it end-to-end.
