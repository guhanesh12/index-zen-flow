# Profile + Client ID + Referral System

This is a large feature. I'll deliver it in 4 phases. Confirm and I'll execute end-to-end.

## Phase 1 — Database (Supabase migration)

New tables:
- `profiles` — user_id, client_id (unique, ALG0001…), full_name, email, mobile, photo_url, role, kyc_status, account_status, trading_level, joined_at, profile_completion
- `referral_codes` — user_id, code (unique, e.g. `ALG0001`), created_at
- `referrals` — referrer_id, referee_id, referee_client_id, status (pending / registered / first_trade_done / rewarded), reward_amount, registered_at, first_trade_at, rewarded_at
- `referral_settings` — singleton: reward_amount, enabled, share_template_whatsapp/telegram/email/generic
- `referral_earnings` — user_id, total_earned, total_pending, last_credited_at
- `wallet_transactions` — user_id, type (referral_reward, etc.), amount, ref_id, created_at

Logic:
- Auto-generate `client_id` (ALG + zero-padded sequence) via trigger on profile insert
- Auto-generate referral code = client_id
- RLS: user reads own rows; admin role full access; service role full access
- Trigger on signup → create profile + referral code; if `referred_by` metadata → insert pending referral row
- Trigger / edge function on first successful trade → mark referral `first_trade_done`, credit referrer wallet, log transaction, send notification

## Phase 2 — Edge functions

- `referral-process` — called after first trade; credits referrer wallet, updates status, sends notifications
- `referral-stats` — analytics (totals, leaderboard, monthly growth)
- `admin-referral-config` — admin updates reward amount / enable-disable / templates

## Phase 3 — User UI

- **Registration page**: `?ref=ALGxxxx` auto-fills referral code field (read-only when via link, otherwise editable). Validates code on submit.
- **Profile page (`/profile`)**:
  - Glassmorphism profile card with animated gradient border
  - Photo, name, email, mobile, **Client ID (copy button)**, role, VIP/verified badges, trading level
  - Stats grid: wallet balance, total P&L, referral earnings, subscription, broker status, KYC status, join date
  - Profile completion progress bar
  - Editable fields (name, mobile, photo)
- **Referral page / tab**:
  - Hero banner (generated marketing image) with reward amount
  - Referral code + link (one-click copy)
  - QR code (qrcode.react)
  - Share buttons: WhatsApp, Telegram, Instagram, Facebook, X, Email, Copy
  - Editable share message preview with emoji template
  - Stats: total / successful / pending referrals, earnings chart, leaderboard position
  - Referral history table

## Phase 4 — Admin UI (`AdminReferrals.tsx` + extend `AdminUserManagement`)

- New "Referrals" tab in admin dashboard
- Settings card: reward amount input, enable/disable toggle, editable share templates per platform
- Stats cards: total referrals, successful, pending, total payouts
- Leaderboard table
- Transaction history with filters (date, user, status, first-trade status)
- Fraud flags column (duplicate device/IP)
- Extended user list: client ID search, referral count, wallet balance, total trades, P&L, registration date, first trade date, referral earnings, status controls

## Technical notes

- Client ID format: `ALG` + 4-digit padded sequence from a Postgres sequence (`alg_client_seq`)
- Referral link: `https://indexpilotai.com/register?ref={CLIENT_ID}`
- QR code lib: `qrcode.react`
- Charts: existing `recharts`
- Marketing banner: generated via imagegen (premium, 1200x630)
- Notifications: reuse existing `NotificationCenter` + push notification infra
- Anti-fraud: store registration IP + device fingerprint on referral row; flag duplicates server-side
- Wallet credit: insert into existing wallet KV / new `wallet_transactions` table; reuse existing wallet UI

## Out of scope (confirm if needed)
- Real KYC provider integration (status field only, manual admin update)
- Real subscription billing (display-only, admin-set)
- Email/SMS delivery infra (uses existing notification system)

Reply "go" to execute all 4 phases, or tell me which to skip / change.