# React Native — 4-Digit PIN Login (Create / Enter / Forgot / Reset) — FULL A→Z PROMPT

Implement a **4-digit PIN gate** on top of the existing Supabase email+password login.
After a successful email/password sign-in, the app asks the backend whether this user
already has a PIN, and routes to one of three screens.

Backend is **already live and deployed** — do not create any Supabase function, just call it.

---

## 0. How the system works (analysis)

| Layer | What happens |
|-------|--------------|
| `public.user_pins` | one row per user: `pin_hash` (SHA-256 of `salt:pin`), `pin_salt`, `failed_attempts`, `locked_until`, `last_used_at` |
| `public.pin_reset_otps` | forgot-PIN OTPs: `otp_hash`, `expires_at` (10 min), `attempts` (max 5), `verified` |
| Edge function `user-pin` | all 5 routes, authenticated by the user's Supabase JWT (service-role used internally) |
| OTP delivery | **SMS only, via 2Factor to `profiles.mobile`. The OTP is 6 digits.** No email OTP is sent. |
| Lockout | 5 wrong PIN attempts → `locked_until = now + 15 min`, HTTP `423` |
| Raw PIN | never stored, never returned, never logged — only the salted hash |

The web app uses the exact same endpoints (`src/app/components/PinGate.tsx`), so RN and web stay in sync.

---

## 1. Base URL & headers

```
BASE = https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/user-pin
```

Every request MUST send **both** headers:

```
Authorization: Bearer <supabase access_token>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

Anon key (safe to ship in the app):
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0
```

---

## 2. Endpoints

| Method | Path      | Body                        | Purpose |
|--------|-----------|-----------------------------|---------|
| GET    | `/status` | –                           | `{ hasPin, locked, lockedUntil, mobile, email }` (masked contacts) |
| POST   | `/set`    | `{ pin, confirmPin }`       | Create PIN (or overwrite while logged in) |
| POST   | `/verify` | `{ pin }`                   | Unlock. 5 wrong = 15-min lock |
| POST   | `/forgot` | –                           | Sends a **6-digit OTP by SMS** to the registered mobile |
| POST   | `/reset`  | `{ otp, pin, confirmPin }`  | Verify 6-digit OTP + save new PIN |

### Example responses

```jsonc
// GET /status
{ "success": true, "hasPin": true, "locked": false, "lockedUntil": null,
  "mobile": "98****3210", "email": "ra*****@gmail.com" }

// POST /verify (wrong)
{ "success": false, "message": "Incorrect PIN", "attemptsLeft": 3, "lockedUntil": null }

// POST /forgot (both channels ok)
{ "success": true, "message": "OTP sent to your registered mobile number",
  "channels": { "sms": true, "email": false },
  "mobile": "98****3210", "email": null }
```

Status codes: `200` ok · `400` bad input / no registered mobile · `401` unauth, wrong PIN or wrong OTP ·
`404` no PIN set · `423` locked · `429` too many OTP attempts · `502` SMS send failed.

---

## 3. Full flow

```text
[Splash] supabase.auth.getSession()
   ├─ no session → LoginScreen (email + password)
   ▼ (after sign-in)
GET /user-pin/status
   ├─ hasPin === false → CreatePinScreen  → POST /set  → Home
   └─ hasPin === true  → EnterPinScreen
          ├─ POST /verify 200 → Home
          ├─ 401 → show attemptsLeft, clear boxes
          ├─ 404 → jump to CreatePinScreen
          ├─ 423 → disable input, countdown from lockedUntil
          └─ "Forgot PIN?" → ForgotPinScreen
                 └─ POST /forgot → ResetPinScreen (OTP + new PIN + confirm)
                        └─ POST /reset → Home
```

**App resume rule:** if the app was backgrounded > 2 minutes and a PIN exists, force `EnterPinScreen`
again (store `lastActiveAt` in AsyncStorage, compare on `AppState` → `active`).

---

## 4. API helper (`src/lib/pinApi.ts`)

```ts
import { supabase } from "./supabase";

const BASE = "https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/user-pin";
const ANON = "<PASTE ANON KEY ABOVE>";

async function call(path: string, method: "GET" | "POST", body?: any) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const r = await supabase.auth.refreshSession();
    session = r.data.session;
  }
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: ANON,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

export const PinApi = {
  status: () => call("/status", "GET"),
  set:    (pin: string, confirmPin: string) => call("/set", "POST", { pin, confirmPin }),
  verify: (pin: string) => call("/verify", "POST", { pin }),
  forgot: () => call("/forgot", "POST"),
  reset:  (otp: string, pin: string, confirmPin: string) =>
            call("/reset", "POST", { otp, pin, confirmPin }),
};
```

---

## 5. Screens

### CreatePinScreen
- Two 4-box inputs (`keyboardType="number-pad"`, `secureTextEntry`, auto-advance on entry, backspace moves back).
- Disable submit until both are 4 digits. Submit → `PinApi.set(pin, confirm)`.
- On 200 → save `lastActiveAt` and navigate to Home. On 400 → show `message` ("PINs do not match").

### EnterPinScreen
- One 4-box input, autofocus, auto-submit when the 4th digit is typed.
- 401 → show `Incorrect PIN — N attempts left`, clear boxes, re-focus.
- 423 → disable input and run a live countdown from `lockedUntil`.
- 404 → `navigation.replace("CreatePin")`.
- Footer links: **Forgot PIN?** and **Use another account** (`supabase.auth.signOut()`).

### ForgotPinScreen
- Show masked `mobile` from `/status` (OTP goes to SMS only).
- **Send OTP** → `PinApi.forgot()`. On 200 navigate to ResetPinScreen and display
  `response.message` (it already names the channels used).
- On 400 ("No registered mobile number") deep-link to the Profile screen.

### ResetPinScreen
- OTP 6 boxes (visible, 6-digit) + New PIN + Confirm PIN (masked).
- Submit → `PinApi.reset(otp, pin, confirm)`; 200 → Home.
- **Resend OTP** link enabled after a 30-second countdown → `PinApi.forgot()` again.
- 400 "OTP expired" → prompt to resend. 429 → force a resend.

---

## 6. Edge cases

- OTP is valid **10 minutes**, max **5 wrong attempts**, then a new one must be requested.
- Sign-out must **not** delete the PIN row — the PIN is per-user, not per-device.
- Change PIN while logged in → just call `/set` again (it overwrites and clears the lock).
- Never cache `hasPin` — always call `/status` on cold start.
- Never store the raw PIN in AsyncStorage / SecureStore / Keychain.
- Never call any PIN route before `supabase.auth.getSession()` has resolved.

---

## 7. Email delivery (verified working)

OTP emails go out through the `send-email` edge function → Brevo, template `otp`,
sender `IndexPilot AI <noreply@indexpilotai.com>`. Verified live (Brevo message id returned).
If the user has no mobile in `profiles.mobile`, the email channel alone is enough for reset.
