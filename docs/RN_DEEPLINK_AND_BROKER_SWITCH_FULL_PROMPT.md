# RN App Prompt — Deep Links + Broker Connect / Switch (IndexPilotAI)

Paste this whole file into your React Native app agent. It contains the exact backend
contract (verified against the live server), the root cause of the "broker connected on
server but app still shows old broker / not connected" bug, and the full deep-link spec.

---

## 0. Constants

```ts
export const WEB_ORIGIN = 'https://indexpilotai.com';
export const API_BASE   = 'https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7';
// user-overridable, AsyncStorage key: indexpilotai_custom_backend_url
export const APP_SCHEME = 'indexpilotai';           // indexpilotai://...
export const ANDROID_PKG = 'app.lovable.53074c3b4efc45559d5055b7d0bc2930';
export const PLAY_URL   = `https://play.google.com/store/apps/details?id=${ANDROID_PKG}`;
export const IOS_URL    = 'https://apps.apple.com/app/idXXXXXXXX'; // fill when live
```

Every API call needs `Authorization: Bearer <supabase access_token>` except the ones
marked **public**.

---

## PART A — DEEP LINKING

### A1. Link map (custom scheme + Universal / App Links)

| Purpose | Web URL (universal link) | App scheme URL | In-app screen |
|---|---|---|---|
| Home | `https://indexpilotai.com/` | `indexpilotai://home` | Home / Landing |
| Login | `https://indexpilotai.com/login` | `indexpilotai://login` | Login |
| Register | `https://indexpilotai.com/register` | `indexpilotai://register` | Register |
| Register with referral | `https://indexpilotai.com/register?ref=ALG0001` | `indexpilotai://register?ref=ALG0001` | Register, code prefilled + validated |
| Dashboard | `https://indexpilotai.com/dashboard` | `indexpilotai://dashboard` | Dashboard tab |
| Broker setup | `https://indexpilotai.com/dashboard?tab=broker` | `indexpilotai://broker` | Broker screen |
| Broker connected return | `https://indexpilotai.com/dashboard?broker=fyers&connected=1` | `indexpilotai://broker/callback?broker=fyers&connected=1` | Broker screen, force refresh |
| Backtest | — | `indexpilotai://backtest` | Backtest |
| Referral / invite | — | `indexpilotai://referral` | Profile → Referral |
| CMS page | `https://indexpilotai.com/page/:slug` | `indexpilotai://page/:slug` | WebView page |
| Play Store | `PLAY_URL` | — | external |

The referral link the web app generates is exactly:
`${origin}/register?ref=<referralCode>` — the RN app **must** produce the same string so
web and app referrals are interchangeable. Validate with the public endpoint:

```
GET  {API_BASE}/referral/validate?code=ALG0001        (public, anon key)
GET  {API_BASE}/referral/settings                     (public — copy text, bonus amounts)
GET  {API_BASE}/referral/my                           (auth — my code, my invitees, earnings)
```

Pass the code on signup in the existing signup payload field `referralCode`.

### A2. Native configuration

**Android** — `android/app/src/main/AndroidManifest.xml`, inside the main activity:

```xml
<!-- custom scheme -->
<intent-filter>
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="indexpilotai"/>
</intent-filter>
<!-- App Links (verified) -->
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW"/>
  <category android:name="android.intent.category.DEFAULT"/>
  <category android:name="android.intent.category.BROWSABLE"/>
  <data android:scheme="https" android:host="indexpilotai.com"/>
  <data android:scheme="https" android:host="www.indexpilotai.com"/>
</intent-filter>
```

Host `https://indexpilotai.com/.well-known/assetlinks.json` (put it in the web project's
`public/.well-known/`) with the release SHA-256 fingerprint.

**iOS** — add `indexpilotai` to `CFBundleURLSchemes`, enable Associated Domains with
`applinks:indexpilotai.com`, and host `/.well-known/apple-app-site-association`.

### A3. RN linking implementation

```ts
// src/navigation/linking.ts
export const linking = {
  prefixes: ['indexpilotai://', 'https://indexpilotai.com', 'https://www.indexpilotai.com'],
  config: {
    screens: {
      Home: 'home',
      Login: 'login',
      Register: 'register',           // ?ref= arrives as route.params.ref
      Dashboard: 'dashboard',
      Broker: 'broker',
      BrokerCallback: 'broker/callback',
      Backtest: 'backtest',
      Referral: 'referral',
      CmsPage: 'page/:slug',
      NotFound: '*',
    },
  },
};
```

Rules:
1. Handle **cold start** (`Linking.getInitialURL()`) and **warm** (`Linking.addEventListener('url')`).
2. If a link needs auth and there is no session → store the pending URL, send the user to
   Login, and replay the URL after login succeeds. Never drop it.
3. `?ref=` must be persisted to AsyncStorage (`pending_referral_code`) on first open, even
   if the user registers 2 days later.
4. Never open `indexpilotai://` from inside a WebView — intercept it in `onShouldStartLoadWithRequest`.

---

## PART B — BROKER CONNECT / SWITCH (the actual bug)

### B1. Verified backend contract

```
GET  {API_BASE}/broker/active            (auth)
→ {
    success: true,
    activeBroker: "dhan" | "zerodha" | "groww" | "upstox" | "fyers" | "angelone" | "aliceblue" | "5paisa",
    activeBrokerName: "Dhan",
    chosen: boolean,                      // has the user ever explicitly picked a broker
    connected: boolean,                   // is the ACTIVE broker's session valid right now
    available: { dhan:boolean, zerodha:boolean, ... },   // per-broker session validity
    brokers: [...]                        // only brokers the admin enabled
  }

POST {API_BASE}/broker/active   body { broker: "<id>" }      (auth)
→ { success:true, activeBroker, switchedFrom, instrumentSync }
```

**Critical server behaviour: ONE USER = ONE BROKER.** When `broker !== current`, the server
calls `selectBroker()` which sets `active_broker` **and wipes the previous broker's session**
(`broker_connected: false`). So after every switch the app is deliberately in a
"not connected" state until the new broker's login completes. That is correct, not a bug.

Instrument sync is **per broker only** — there is **no generic `syncInstruments` route**:
```
POST {API_BASE}/broker/{kite|groww|upstox|fyers|angelone|aliceblue|5paisa}/instruments/sync
```
Dhan has none. Calling a generic one returns 404 forever.

### B2. Root causes of "connected on server, old broker in app"

1. **OAuth callbacks are HTML pages, not deep links.** After a successful login the server
   returns an HTML success page that signals the caller via
   `window.opener.postMessage` (web popup) or, for Dhan/Zerodha only,
   `window.ReactNativeWebView.postMessage`. Upstox, Fyers, Aliceblue, 5paisa and Angel One
   pages do **not** post to `ReactNativeWebView`. If RN waits for a postMessage it waits
   forever → app keeps showing the old broker.
2. **Redirect URIs are locked to `https://api.indexpilotai.com/...`** because brokers only
   accept a pre-registered https host. They can never be changed to `indexpilotai://`.
   So the app must not expect an app-scheme return from the broker.
3. **Cached broker state.** The app renders from a context value fetched once at mount and
   never refetched after the browser closes.
4. **404 treated as disconnected.** A failed/absent endpoint must never be interpreted as
   `connected: false`; only an explicit `connected: false` in a 200 response counts.

### B3. Correct RN flow — poll, don't wait for a message

```ts
async function connectBroker(brokerId: string) {
  // 1. make it the active broker FIRST (server wipes the old session here)
  await api.post('/broker/active', { broker: brokerId });
  await refreshBrokerState();              // UI immediately shows new broker, disconnected

  // 2. get the broker login URL
  const { url } = await api.get(`/broker/${brokerId}/login-url`);

  // 3. open in an in-app browser (NOT a bare WebView)
  const before = Date.now();
  await InAppBrowser.open(url, { showTitle: true, enableUrlBarHiding: true });
  // resolves when the user closes it OR the success page auto-closes

  // 4. poll /broker/active until connected (browser gave us no reliable signal)
  const ok = await pollUntilConnected(brokerId, { timeoutMs: 120_000, intervalMs: 2_000 });

  if (ok) {
    toast.success(`${labelOf(brokerId)} connected successfully`);
    await syncInstrumentsFor(brokerId);    // per-broker route, once, best-effort
  } else {
    toast.error(`Could not confirm ${labelOf(brokerId)} login. Tap Retry.`);
  }
  await refreshBrokerState();
}

async function pollUntilConnected(brokerId, { timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const s = await api.get('/broker/active');           // no cache
      if (s?.success && s.activeBroker === brokerId && s.connected === true) return true;
    } catch { /* network error → keep polling, do NOT mark disconnected */ }
    await sleep(intervalMs);
  }
  return false;
}
```

Also poll for **10 seconds after `AppState` returns to `active`** — that catches the case
where the user switches back to the app manually instead of the page auto-closing.

If you do use a WebView, additionally listen for `onMessage` (Dhan/Zerodha post
`{source, ok, tokenId}` as a JSON string) and treat it as an early success — but polling
must still be the fallback, because the other five brokers never post.

### B4. Broker state rules (fix the false "not connected" popup)

```ts
type BrokerState = {
  status: 'unknown' | 'loading' | 'ready' | 'error';
  activeBroker?: string;
  activeBrokerName?: string;
  connected: boolean;
  chosen: boolean;
  available: Record<string, boolean>;
  brokers: Array<{ id: string; label: string }>;
};
```

1. Initial status is `'unknown'`, **never** `connected:false`.
2. Only a `200` response with `success:true` may set `connected`. Any network error, 404,
   5xx or timeout → keep the last known state and set `status:'error'`. Never show the
   "broker not connected" popup from an error path.
3. The popup may fire **only** when `status === 'ready' && chosen === true && connected === false`,
   and at most once per app session (guard with a ref).
4. Refetch `/broker/active` on: app foreground, Broker screen focus, after `POST /broker/active`,
   after a connect attempt, and every 60 s while the Broker screen is visible.
5. Render the broker name from `activeBrokerName` returned by the **last** response — never
   from a locally stored "selected broker" value, otherwise the old broker sticks.
6. On switch, clear all broker-derived caches: funds, positions, orders, instruments,
   holdings. They are keyed per broker on the server (`broker_funds:{broker}:{userId}`),
   so stale client caches are the only source of cross-broker leakage.

### B5. Per-broker login entry points

| Broker | Type | Start call | Finish |
|---|---|---|---|
| Dhan | OAuth (consent) | `POST /broker/oauth/save-keys` → `GET /broker/oauth/login-url` | callback page posts to `ReactNativeWebView`; still poll |
| Zerodha (kite) | OAuth | `POST /broker/kite/save-keys` → `GET /broker/kite/login-url` | posts to `ReactNativeWebView`; still poll |
| Upstox | OAuth | `POST /broker/upstox/save-keys` → `GET /broker/upstox/login-url` | HTML page only → **poll** |
| Fyers | OAuth | `POST /broker/fyers/save-keys` → `GET /broker/fyers/login-url` | HTML page only → **poll** |
| 5paisa | OAuth | `POST /broker/5paisa/save-keys` → `GET /broker/5paisa/login-url` | HTML page, or manual RequestToken paste → **poll** |
| Aliceblue | userId + apiKey | `POST /broker/aliceblue/save-keys` then login | authCode may arrive on redirect; manual paste supported → **poll** |
| Angel One | clientCode + MPIN + TOTP | `POST /broker/angelone/login` | direct JSON response, no browser |
| Groww | access token | `POST /broker/groww/save-keys` | direct JSON response, no browser |

Show a "Paste token manually" fallback for 5paisa and Aliceblue — the backend already
accepts it and it rescues users whose in-app browser blocked the redirect.

### B6. Success / failure messaging (required UX)

- Immediately on `POST /broker/active` success: `"Switched to <Name>. Please log in to <Name>."`
- On poll success: green toast `"<Name> connected successfully"` + the Broker card flips to
  a green "Connected · <clientId>" state, and the Dashboard header broker chip updates.
- On poll timeout: amber card `"Login not confirmed"` with **Retry** and **Paste token** buttons —
  do **not** show the red "broker not connected" popup here.
- Never show two different broker names anywhere on screen at the same time.

---

## PART C — ACCEPTANCE CHECKLIST

- [ ] `indexpilotai://register?ref=CODE` opens Register with the code prefilled and validated.
- [ ] `https://indexpilotai.com/register?ref=CODE` opens the app directly (App Link verified).
- [ ] Referral code survives app kill → install-day signup.
- [ ] Deep link to an auth-only screen while logged out lands on Login and replays after login.
- [ ] Switch broker Dhan → Fyers: header, Broker card, funds, positions all show Fyers within 1 s.
- [ ] After Fyers login completes in the in-app browser, the app shows
      "Fyers connected successfully" within 4 s without the user pressing anything.
- [ ] Killing the in-app browser mid-login shows the amber Retry card, not the red popup.
- [ ] Airplane mode on the Broker screen never triggers the "broker not connected" popup.
- [ ] No call is ever made to a generic `syncInstruments` route.
- [ ] Old broker's funds/positions never appear after a switch.
