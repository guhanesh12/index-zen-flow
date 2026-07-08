# Push notifications: full automation + RN app integration

## Goal
- Every user (web + RN) is auto-subscribed on login/app-open — no manual opt-in step.
- Backend automatically fires an FCM push for these events:
  - Order placed
  - Signal generated
  - Wallet credit / debit
  - VPS on / off
  - Engine on / off
  - Position closed (profit / loss)
- Admin "Send with image" broadcast keeps working via `admin-push-send`.
- Deliver a ready-to-paste RN integration prompt (for Blackbox AI in VS Code) that plugs into the existing `google-services.json` / iOS `GoogleService-Info.plist`.

## What I will build

### 1. Standalone `push-notify` edge function (new)
Single internal endpoint any code path can call to broadcast a notification.

Payload:
```
{
  event: "ORDER_PLACED" | "SIGNAL_GENERATED" | "WALLET_CREDIT" | "WALLET_DEBIT"
       | "VPS_ON" | "VPS_OFF" | "ENGINE_ON" | "ENGINE_OFF"
       | "POSITION_CLOSED_PROFIT" | "POSITION_CLOSED_LOSS",
  userId?: string,          // if present → send only to that user's tokens
  title: string,
  body: string,
  imageUrl?: string,
  data?: Record<string,string>
}
```
- Loads FCM tokens from `kv_store_c4d79cb7` (`push_subscriber:*`), filters by `userId` when provided, else broadcasts.
- Uses the same FCM HTTP v1 + service-account JWT path as `admin-push-send`.
- Cleans up `UNREGISTERED` / `NOT_FOUND` tokens automatically.
- Protected by `INTERNAL_SYNC_KEY` header so only server code / triggers can call it.

### 2. Auto-fire hooks in existing edge functions
Add a `notifyEvent(...)` helper call at these emission points inside `make-server-c4d79cb7`:
- Order create / fill → `ORDER_PLACED`
- Signal generation loop → `SIGNAL_GENERATED`
- Wallet transaction insert (credit) → `WALLET_CREDIT`
- Wallet transaction insert (debit) → `WALLET_DEBIT`
- VPS power on/off endpoints → `VPS_ON` / `VPS_OFF`
- Engine start/stop endpoints → `ENGINE_ON` / `ENGINE_OFF`
- Position close (persistent engine) → `POSITION_CLOSED_PROFIT` / `POSITION_CLOSED_LOSS`

Helper is a fire-and-forget `fetch` to `push-notify` with `INTERNAL_SYNC_KEY` — failures are logged, never block the event.

### 3. Automatic subscription
- **Web:** on every successful sign-in / session load, silently call the FCM getToken flow and POST to `push-subscribe` (already deployed). Store `push_subscriber:*` keyed by userId.
- **RN app:** the integration prompt below will do the same on app launch after login.

### 4. RN app integration prompt (Blackbox AI, VS Code)
I'll output a copy-paste prompt that tells Blackbox AI to:
- Wire `@react-native-firebase/app` + `@react-native-firebase/messaging`
- Request permission + read the FCM token on login
- POST to `https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/push-subscribe` with `{ userId, deviceToken, browser, device, platform }`
- Handle foreground messages, background/quit taps (deep link via `data.url`)
- Show notification with image (`notification.image` on Android, `fcm_options.image` on iOS)
- Use existing `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)

Provided in the final chat message along with:
- Subscribe URL: `POST https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/push-subscribe`
- Anon key (public) header
- Sample request/response
- FCM project id: `indexpilotai-e1106`
- Android channel id: `indexpilot_default`

## Files to change
- **new** `supabase/functions/push-notify/index.ts`
- **edit** `supabase/config.toml` — add `[functions.push-notify] verify_jwt = false`
- **edit** `supabase/functions/make-server-c4d79cb7/index.ts` — add `notifyEvent()` helper + call at emission points
- **edit** `supabase/functions/make-server-c4d79cb7/persistent_engine.tsx` — fire on position close
- **edit** `src/app/utils/pushNotifications.ts` — auto-subscribe on session load (no UI prompt)
- **edit** one auth/session hook (e.g. `src/hooks/useAuth` or existing session provider) — trigger auto-subscribe post-login

## Secrets needed
- `INTERNAL_SYNC_KEY` — already exists in secrets list. Reused.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — already correct (`indexpilotai-e1106`).

## Out of scope
- iOS APNs key upload in Firebase console (user must have already done this for RN app; if pushes don't arrive on iOS but do on Android, that's the fix).
- Changing the RN app repo directly (user is building it in VS Code with Blackbox AI — I provide the prompt).

## After implementation
- Trigger a test event (e.g. small wallet credit) and verify `push-notify` logs show delivery.
- Provide the RN prompt + URLs in chat.
