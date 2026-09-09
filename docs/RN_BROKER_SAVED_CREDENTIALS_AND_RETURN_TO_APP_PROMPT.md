# IndexPilot RN — Broker Connect: Return-to-App, Saved Credentials, Auto Re-Auth

Paste this whole file into the React Native agent. It fixes three concrete bugs:

1. After a broker login the browser shows "connection done" but then lands on the **website**
   (and asks the user to log in again) instead of coming back to the mobile app.
2. The app forgets the user session / broker state after logout or app restart.
3. The user is asked to re-enter broker API keys on every login, although the server already
   stores them (encrypted) per user.

---

## 0. Ground rules

- Broker credentials live **only on the server**, encrypted, keyed by the Supabase user id.
  The app posts them **once** via `save-keys`. Never write `apiKey`, `apiSecret`, `password`,
  `totp`, `accessToken` into AsyncStorage / SecureStore / Redux persistence.
- The app never re-asks for keys if `GET /broker/<id>/status` returns `hasKeys: true`.
  In that state the card must show only a **Login / Reconnect** button.
- Every API call carries the Supabase access token:
  `Authorization: Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`.

Base URL: `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7`
(or the value stored under AsyncStorage key `indexpilotai_custom_backend_url`).

---

## 1. Why the redirect ends on the website (root cause)

All broker OAuth callbacks land on the **server**:

```
/broker/oauth/callback        (Dhan)
/broker/kite/callback         (Zerodha)
/broker/upstox/callback
/broker/fyers/callback
/broker/aliceblue/callback
/broker/5paisa/callback       (GET and POST)
/broker/angelone/callback
```

Those routes render a small HTML success page meant for the **web** app (it `postMessage`s
back to the opener window). A React Native WebView / external browser has no opener, so the
page just sits there — and any "continue" link goes to the website, where the mobile session
does not exist, so the user sees the login page again.

The fix is entirely on the app side: open the login URL with an **auth session** that owns a
return scheme, and close it as soon as the callback URL is reached.

---

## 2. Correct open-login implementation

`app.json`:

```json
{ "expo": { "scheme": "indexpilot",
  "ios":     { "bundleIdentifier": "com.indexpilot.app" },
  "android": { "package": "com.indexpilot.app", "intentFilters": [
    { "action": "VIEW", "autoVerify": true,
      "data": [{ "scheme": "indexpilot", "host": "broker-callback" }],
      "category": ["BROWSABLE", "DEFAULT"] }]}}}
```

```ts
// src/broker/openBrokerLogin.ts
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const RETURN_URL = Linking.createURL('broker-callback');   // indexpilot://broker-callback

export async function openBrokerLogin(loginUrl: string) {
  const res = await WebBrowser.openAuthSessionAsync(loginUrl, RETURN_URL, {
    showInRecents: true,
    preferEphemeralSession: false,   // keep broker cookies → fewer re-logins
  });
  // res.type: 'success' (deep link hit) | 'dismiss' | 'cancel'
  const params =
    res.type === 'success' ? Linking.parse(res.url).queryParams ?? {} : {};
  return { type: res.type, params };
}
```

Because the server callback page cannot deep-link by itself, the app must also **watch the
navigated URL**. If you use a `WebView` instead of `openAuthSessionAsync`, close it in
`onNavigationStateChange` the moment `url.includes('/broker/') && url.includes('/callback')`
— grab `tokenId` / `request_token` / `RequestToken` / `authCode` / `code` from the query
string and dismiss immediately. Never let the WebView continue to `indexpilotai.com`.

---

## 3. Finish the connection in the app (never on the web page)

```ts
export async function finishBrokerConnect(brokerId: string, params: Record<string, any>) {
  const tokenId      = params.tokenId ?? params.token_id;
  const requestToken = params.request_token ?? params.requestToken ?? params.RequestToken;
  const authCode     = params.authCode ?? params.auth_code;
  const code         = params.code;

  if (brokerId === 'dhan'    && tokenId)      await api('/broker/oauth/consume',  { method:'POST', body: JSON.stringify({ tokenId }) });
  if (brokerId === 'zerodha' && requestToken) await api('/broker/kite/consume',   { method:'POST', body: JSON.stringify({ requestToken }) });
  if (brokerId === '5paisa'  && requestToken) await api('/broker/5paisa/exchange',{ method:'POST', body: JSON.stringify({ requestToken }) });
  // upstox / fyers / aliceblue finalize server-side on the callback — nothing to consume.

  // Always poll, whatever happened above.
  return pollUntilConnected(brokerId);
}

export async function pollUntilConnected(brokerId: string, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await api(`/broker/${brokerId}/status`).catch(() => null);
    if (s?.connected) return s;
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}
```

Success rule: show the green "Broker connected" toast **only** when
`status.connected === true`. Never show it just because the browser closed.
On failure show the server's `error` text verbatim and keep the card open.

---

## 4. Make the broker switch actually stick

The bug "connection succeeded but the old broker is still shown" happens when the app never
tells the server which broker is active, or reads a cached status.

```ts
export async function activateBroker(id: string) {
  await api('/broker/active', { method: 'POST', body: JSON.stringify({ broker: id }) });
  setActiveBroker(id);
  clearFunds(); clearPositions();
  await Promise.all([refreshAllBrokerStatuses(), loadFunds(id), loadPositions(id)]);
}
```

- Call `activateBroker(id)` immediately after `pollUntilConnected` returns connected.
- Refetch **all** broker statuses (not just the new one) so the previous card flips to
  "Not connected / keys saved".
- Discard any `/fund-limits` or `/positions` response whose `broker` field differs from the
  currently selected broker.
- Refresh on `AppState → 'active'` and on screen focus:

```ts
useFocusEffect(useCallback(() => { refreshAllBrokerStatuses(); }, []));
useEffect(() => {
  const sub = AppState.addEventListener('change', s => { if (s === 'active') refreshAllBrokerStatuses(); });
  return () => sub.remove();
}, []);
```

---

## 5. Saved credentials — three-state card

`GET /broker/<id>/status` drives the whole card. Map it to exactly one of three states:

| Server state | Card shows | Buttons |
|---|---|---|
| `connected: true` | green **Connected** + balance | Test · Disconnect · (Use this broker) |
| `hasKeys: true, connected: false` | amber **Keys saved — login pending** | **Login / Reconnect** (no input fields) · Edit keys · Disconnect |
| no keys | grey **Not connected** | credential form + **Save keys** |

```ts
const brokerState = (s: any) =>
  s?.connected ? 'connected'
  : (s?.hasKeys || s?.keysSaved || s?.hasCredentials) ? 'keys_saved'
  : 'new';
```

Rules:
- In `keys_saved` the credential inputs are **collapsed behind "Edit keys"**. The user must
  never be forced to retype secrets after a logout or reinstall.
- "Login / Reconnect" calls `GET /broker/<id>/login-url` (or `POST /broker/angelone/reconnect`,
  `POST /broker/aliceblue/vendor-start`) directly — no fields needed.
- Only `Disconnect` clears the stored keys server-side; make it a confirm dialog that says so.

Save function (single place, used by every broker form):

```ts
const SAVE_PATH: Record<string,string> = {
  dhan:'/broker/oauth/save-keys', zerodha:'/broker/kite/save-keys',
  groww:'/broker/groww/save-keys', upstox:'/broker/upstox/save-keys',
  fyers:'/broker/fyers/save-keys', angelone:'/broker/angelone/login',
  aliceblue:'/broker/aliceblue/vendor-start', '5paisa':'/broker/5paisa/save-keys',
};

export async function saveBrokerKeys(id: string, fields: Record<string,string>) {
  const res = await api(SAVE_PATH[id], { method:'POST', body: JSON.stringify(fields) });
  await refreshBrokerStatus(id);        // card must flip to "keys saved" without a reload
  return res;                            // may contain { loginUrl } → open it right away
}
```

Wipe the local form state (`setFields({})`) right after a successful save.

---

## 6. App login / logout must not lose the broker

- Persist the Supabase session (`persistSession: true` with an AsyncStorage adapter) so an
  app restart does not force a re-login.
- On app start: `supabase.auth.getSession()` → if valid, go straight to Home and load broker
  status. On 401 from any API call: `supabase.auth.refreshSession()` once, retry, and only
  then send the user to Login.
- On **logout**: clear only app state. Do **not** call any broker `disconnect` endpoint.
  When the same user logs back in, `/broker/<id>/status` returns `hasKeys: true` (and often
  `connected: true`), so the card comes back already configured.
- Broker access tokens expire daily for most brokers. When status returns
  `token_invalid` / `expired`, show a red **Reconnect** chip that runs §2–§4 for that broker
  only — never a full credential form.

---

## 7. Acceptance checklist

- [ ] Broker login opens in an in-app auth session and closes automatically at the callback URL — the website never appears.
- [ ] The success toast appears only after `/broker/<id>/status` returns `connected: true`.
- [ ] After connecting, `POST /broker/active` runs and the newly connected broker shows the ACTIVE badge; the old one flips to its correct state.
- [ ] Funds and positions reload for the new broker and stale responses from the old broker are ignored.
- [ ] Logging out and back in never asks for broker API keys again; the card shows "Keys saved — login pending" with a single Login button.
- [ ] No broker secret is present anywhere on the device (grep AsyncStorage dumps).
- [ ] Killing and reopening the app keeps both the user session and the broker connection.
- [ ] Daily token expiry shows Reconnect, not the credential form.
