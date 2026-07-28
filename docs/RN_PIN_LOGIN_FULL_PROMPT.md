# React Native — PIN Login (Set / Verify / Forgot) Full Implementation Prompt

Implement a **4-digit PIN gate** on top of the existing Supabase email/password login. After a user signs in successfully with email+password, the app decides between three screens:

1. **CreatePinScreen** — user has no PIN saved → set one (PIN + confirm PIN)
2. **EnterPinScreen** — user has a PIN saved → must enter it to unlock the app
3. **ForgotPinScreen → OtpScreen → CreatePinScreen** — OTP sent to registered mobile, then set new PIN

The PIN is stored **hashed with a per-user salt** in Supabase (`public.user_pins`). All calls are authenticated by the user's Supabase JWT.

---

## 1. Base URL & headers

```
BASE = https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/user-pin
```

Every request MUST send:

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

| Method | Path                | Body                                   | Purpose |
|--------|---------------------|----------------------------------------|---------|
| GET    | `/status`           | –                                      | Does the logged-in user have a PIN? Returns `{ hasPin, locked, lockedUntil }` |
| POST   | `/set`              | `{ pin, confirmPin }`                  | First-time PIN create (or overwrite while logged in) |
| POST   | `/verify`           | `{ pin }`                              | Verify PIN → unlock app. 5 wrong attempts = 15-min lock |
| POST   | `/forgot`           | –                                      | Send 4-digit OTP to the user's registered `profiles.mobile` via 2Factor |
| POST   | `/reset`            | `{ otp, pin, confirmPin }`             | Verify OTP + save new PIN. OTP valid 10 minutes, 5 attempts |

### Response shape
Every response is JSON. Always inspect HTTP status AND `success`:
```json
{ "success": true,  "message": "PIN verified" }
{ "success": false, "message": "Incorrect PIN", "attemptsLeft": 3, "lockedUntil": null }
```

Codes: `200` ok · `400` bad input · `401` unauth / wrong pin or otp · `404` no pin · `423` locked · `429` too many attempts · `502` OTP provider failed.

---

## 3. Full login flow (post email/password)

```text
[SplashScreen]
   │  supabase.auth.getSession() → session?
   │
   ├─ no session → LoginScreen (email + password) → on success ↴
   │
   ▼
GET /user-pin/status
   │
   ├─ hasPin === false → CreatePinScreen (mandatory)
   │       └── POST /user-pin/set  → HomeScreen
   │
   └─ hasPin === true  → EnterPinScreen
           ├── POST /user-pin/verify OK  → HomeScreen
           ├── wrong pin → show attemptsLeft
           ├── locked (423) → show lockedUntil timer
           └── "Forgot PIN?" tap → ForgotPinScreen
                    └── POST /user-pin/forgot → OtpScreen
                           └── POST /user-pin/reset (otp+newPin) → HomeScreen
```

Also handle **app resume**: if the app has been in the background > 2 minutes and a PIN exists, force `EnterPinScreen` again.

---

## 4. API helper

```ts
// src/lib/pinApi.ts
import { supabase } from "./supabase";

const BASE = "https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/user-pin";
const ANON = "<PASTE ANON KEY>";

async function call(path: string, method: "GET" | "POST", body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
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

## 5. Screens (minimal spec)

### CreatePinScreen
- Two 4-digit inputs (use `react-native-otp-entry` or 4 `TextInput` boxes, `keyboardType="number-pad"`, `secureTextEntry`).
- Submit → `PinApi.set(pin, confirm)`. On success navigate to Home.

### EnterPinScreen
- One 4-digit input, autofocus.
- Submit → `PinApi.verify(pin)`.
- Show `attemptsLeft` on `401`. On `423`, show countdown from `lockedUntil` and disable input.
- Bottom link **"Forgot PIN?"** → ForgotPinScreen.
- Optional: "Use password instead" → `supabase.auth.signOut()` then back to email login.

### ForgotPinScreen
- Read `profiles.mobile` (masked) from `/status` flow or from profile cache.
- Button **"Send OTP"** → `PinApi.forgot()`. On success go to OtpScreen with masked mobile from response.

### OtpScreen (+ new PIN)
- 4-digit OTP input + two 4-digit PIN inputs.
- Resend OTP link after 30 s countdown → `PinApi.forgot()` again.
- Submit → `PinApi.reset(otp, pin, confirm)`. On success go to Home.

---

## 6. Edge cases

- **No registered mobile** on `/forgot` → shows `"No registered mobile. Update profile first."` — deep-link user to Profile screen.
- **OTP expired** (10 min) → prompt user to request again.
- **Locked** — do NOT hide the timer; countdown from `lockedUntil`.
- **Signing out** should NOT delete the PIN row — it stays for the next login on the same device / another device (PIN is per-user, not per-device).
- **Changing PIN while logged in**: reuse `/set` (overwrites).
- On backgrounding for > 2 minutes, re-lock and require PIN again (store `lastActiveAt` in AsyncStorage).

---

## 7. Never do

- Do NOT store the raw PIN in AsyncStorage / SecureStore.
- Do NOT skip the `apikey` header — Supabase Edge Functions reject without it.
- Do NOT call `/verify` before `session` is loaded — always await `supabase.auth.getSession()` first.
- Do NOT trust `hasPin` from cache — always call `/status` on cold start.
