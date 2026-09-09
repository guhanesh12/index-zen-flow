# IndexPilot RN — Fyers connect (auth page + consume) fix

Server change already shipped: there is now a real endpoint

```
POST /broker/fyers/consume     body: { authCode, state? }   -> { success, connected, broker }
```

Previously the app called a Fyers "consume" route that did not exist → `404` → the card stayed
`connected=false` forever. Zerodha worked because `/broker/kite/consume` existed.

Base URL: `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7`
(or AsyncStorage key `indexpilotai_custom_backend_url`).
Every call: `Authorization: Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`.

---

## 1. Fyers flow (exact order)

1. `POST /broker/fyers/save-keys` — body `{ appId, appSecret }`.
   **Important:** the log shows the app sending `apiKey` / `apiSecret`. Fyers expects
   `appId` / `appSecret`. Map the form fields before posting, or the server saves nothing
   and the login URL step fails.
2. `GET /broker/fyers/login-url` → `{ url, redirectUri }`.
3. Open `url` in the in-app WebView / auth session.
4. Intercept any navigation whose URL contains `/broker/fyers/callback`.
   Stop the load (`return false` from `onShouldStartLoadWithRequest`), parse the query:
   `auth_code` (or `code`) and `state`.
5. `POST /broker/fyers/consume` with `{ authCode, state }`.
6. Poll `GET /broker/fyers/status` until `connected: true` (max ~20 s, 1.5 s interval).
7. `POST /broker/active` with `{ broker: 'fyers' }`, then refresh all broker statuses,
   funds and positions.

Show the green toast only after step 6 returns `connected: true`.

```ts
const FYERS_CB = '/broker/fyers/callback';

function onNav(req: { url: string }) {
  if (!req.url.includes(FYERS_CB)) return true;
  const q = Object.fromEntries(new URL(req.url).searchParams);
  closeWebView();
  finishFyers(q.auth_code || q.code, q.state);
  return false;                       // never let the server HTML page load
}

async function finishFyers(authCode?: string, state?: string) {
  if (!authCode) return toast.error('Fyers did not return an authorization code');
  const r = await api('/broker/fyers/consume', {
    method: 'POST', body: JSON.stringify({ authCode, state }),
  });
  if (!r?.success) return toast.error(r?.error || 'Fyers login failed');
  const s = await pollUntilConnected('fyers');
  if (!s) return toast.error('Fyers login did not complete');
  await api('/broker/active', { method: 'POST', body: JSON.stringify({ broker: 'fyers' }) });
  await refreshAllBrokerStatuses();
  toast.success('Fyers connected');
}
```

Guard against the duplicate interception seen in the log (the callback fired twice):
keep a `consumedRef` boolean per login attempt and ignore the second hit.

---

## 2. "Auth page does not open"

The login URL is `https://api-t1.fyers.in/api/v3/generate-authcode?...`. It only renders in a
WebView that has:

- `javaScriptEnabled`, `domStorageEnabled`, `sharedCookiesEnabled`, `thirdPartyCookiesEnabled`
- a desktop-ish `userAgent` is **not** needed; the default RN UA works
- `setSupportMultipleWindows(false)` on Android — Fyers opens a popup for the OTP step and
  without this the page appears blank
- `originWhitelist={['*']}` so the redirect to `api.indexpilotai.com` is not blocked

If you use `expo-web-browser` instead, use `openAuthSessionAsync(url, Linking.createURL('broker-callback'))`
— but you still must intercept the callback URL, because the server callback page is HTML for
the web opener and will otherwise dump the user on the website login page.

---

## 3. The redirect URI must match

The server builds:
`https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/fyers/callback`

That exact string must be registered in myapi.fyers.in → My Apps. `GET /broker/fyers/status`
returns it as `redirectUri` — show it in the card with a copy button.

---

## 4. State handling

`consume` accepts the `state` when present and rejects it if it belongs to another account.
If the WebView strips the query, sending only `{ authCode }` still works — the caller's JWT
identifies the user.

---

## 5. Acceptance checklist

- [ ] Save keys posts `appId` / `appSecret` (not `apiKey` / `apiSecret`).
- [ ] The Fyers auth page renders inside the app (no blank screen, OTP step works).
- [ ] The callback is intercepted once; the server HTML page and the website never appear.
- [ ] `POST /broker/fyers/consume` returns `success: true`.
- [ ] `GET /broker/fyers/status` flips to `connected: true` and the card turns green.
- [ ] `POST /broker/active` runs; the previously active broker card updates; funds/positions reload for Fyers.
- [ ] After logout and login the card shows "Keys saved — login pending", never the key form.
