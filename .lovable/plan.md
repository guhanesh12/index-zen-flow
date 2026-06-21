
# Plan: Notifications fix + ₹100 signup bonus + new-user tour + RN app prompt

This is a big request. I want to confirm scope before I touch anything, because each piece touches different parts of the system.

---

## 1. Notification system fix (web + RN app)

**Web / backend (what I will do here):**
- Audit `supabase/functions/make-server-c4d79cb7/push_notifications.tsx` and `src/app/utils/pushNotifications.ts` for FCM token registration, topic subscription, and dispatch.
- Add automatic push triggers for these events (server-side, inside the engine + order + wallet code paths):
  - New signal generated (per user, per symbol)
  - Order placed / filled / rejected
  - Live P&L crossed target/SL (already partially in `position-monitor`)
  - Wallet credit (bonus, recharge, refund)
  - Wallet debit (signal cost, order cost)
- Add an admin "Send Test Notification to All Users" button in `AdminPushNotifications.tsx` that loops over all FCM tokens and sends a test payload, with success/failure count.
- Keep existing admin manual/promotional notification flow; verify it still works.

**RN app (I cannot edit it from here):**
- I will hand you a ready-to-paste prompt for Blackbox AI / VS Code that explains: FCM setup in RN, `google-services.json` placement, `@react-native-firebase/app` + `messaging` install, background handler in `index.js`, notification channel for Android 13+, runtime `POST_NOTIFICATIONS` permission, token upload to `/push/register-token` endpoint, and foreground display via `notifee`. Delivered as a single message at the end.

**Question:** Is your RN app using `@react-native-firebase/messaging` already, or `expo-notifications`, or something else? This changes the prompt.

---

## 2. ₹100 signup bonus + 1-week expiry + welcome popup

**Database (migration):**
- Add columns to `wallet_transactions` or create `wallet_bonuses` table:
  - `bonus_amount numeric`, `expires_at timestamptz`, `is_bonus boolean`, `bonus_type text` (`'signup'`)
- Add `signup_bonus_credited_at` + `signup_bonus_expires_at` to `profiles`.
- Update `handle_new_user()` trigger to insert a ₹100 bonus row with `expires_at = now() + interval '7 days'` and bump wallet balance.
- Add a scheduled job (pg_cron) that runs daily to expire unused signup bonuses (debit the unused portion, log to `wallet_transactions`).

**Frontend:**
- New `WelcomeBonusDialog.tsx` shown once on first dashboard load after signup:
  - Confetti animation, "Congratulations! ₹100 added to your wallet"
  - Shows expiry date, what it can be used for, CTA "Start Trading"
  - Persists "seen" flag in `profiles.welcome_popup_seen`.
- Show bonus + expiry badge in `WalletManagement.tsx`.

---

## 3. New-user guided tour (dashboard)

- Use `driver.js` or `react-joyride` (lightweight, ~15kb).
- Tour steps:
  1. Welcome → overview
  2. Broker connection tab (how to connect Dhan)
  3. Static IP setup
  4. Symbol selection (auto-select demo)
  5. Engine start/stop
  6. Signals + P&L panel
  7. Wallet + bonus
- Skip button always visible. Tour auto-starts only once (flag in `profiles.tour_completed`). "Restart tour" button in Settings.
- Each step has a short "How to use" description + optional doc link.

---

## 4. RN app prompt (delivered last)

A single copy-paste prompt for Blackbox AI / Cursor / VS Code that will make your RN app:
- Register FCM token on login → POST to your existing endpoint
- Handle foreground / background / killed-state notifications
- Show notifications for: signals, orders, P&L, wallet
- Deep-link tap → correct screen
No tour code in the RN prompt (per your instruction).

---

## Order of execution

1. DB migration (bonus + expiry + tour flag + welcome flag) — needs your approval
2. Update `handle_new_user` trigger
3. Backend: hook push notifications into signal/order/wallet code paths
4. Frontend: WelcomeBonusDialog + tour + admin test-notification button
5. Verify with Playwright (login as test user, see popup, walk tour)
6. Deliver RN prompt

---

## Before I start, please confirm:

1. **RN app push library** — `@react-native-firebase/messaging`, `expo-notifications`, or other?
2. **₹100 bonus usage** — usable for everything (signal cost + order cost + recharge top-up offset), or only for signal cost?
3. **Bonus expiry behavior** — on expiry, do unused rupees vanish silently, or show user a "your bonus expired" notification?
4. **Tour library** — OK with `react-joyride` (most popular, themeable), or do you want a fully custom one?

Reply with answers (even short: "1) firebase 2) all 3) notify 4) joyride") and I'll execute the full plan.
