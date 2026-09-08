# RN APP PROMPT — Broker Redirect URLs (with Copy button) + Dhan Client ID / Access Token Login

Copy everything below into your React Native agent. It is derived from the live
IndexPilot backend (`make-server-c4d79cb7`), so every URL and endpoint here is exact.

---

## 0. Constants

```ts
export const API_BASE =
  "https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7";

// Every OAuth broker callback follows ONE pattern:
export const redirectUrlFor = (brokerId: string) =>
  `${API_BASE}/broker/${brokerId}/callback`;
```

Auth header on every authenticated call:
`Authorization: Bearer <supabase access_token>` (+ `apikey: <SUPABASE_ANON_KEY>`).

---

## 1. Redirect URL table (exact strings — must match the broker portal char-for-char)

| Broker | broker_id | Needs redirect URL? | Redirect URL to paste in broker portal |
|---|---|---|---|
| Dhan (OAuth mode) | `dhan` | Yes | `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/oauth/callback` |
| Dhan (Client ID + Access Token mode) | `dhan` | **No** | — not used, see §4 |
| Zerodha Kite | `zerodha` | Yes | `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/kite/callback` |
| Upstox | `upstox` | Yes | `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/upstox/callback` |
| Fyers | `fyers` | Yes | `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/fyers/callback` |
| 5paisa | `5paisa` | Yes | `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/5paisa/callback` |
| Aliceblue | `aliceblue` | Yes (vendor app) | `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/aliceblue/callback` |
| Angel One | `angelone` | Portal requires a value | `https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/broker/angelone/callback` |
| Groww | `groww` | **No** (API key + secret only) | — |

Rules the app must enforce:
- Never build a redirect URL from the Supabase `*.supabase.co` host. Only
  `api.indexpilotai.com` is accepted by the brokers.
- Never show a deep link (`indexpilot://…`) as the broker redirect URL. The broker
  always redirects to the server, and the server closes the loop.
- The authoritative value is whatever the broker `…/status` endpoint returns in
  `redirect_uri` / `redirect_url`. Show that when present, fall back to the table.

---

## 2. Redirect URL card UI + copy function (required in every broker connect screen)

Render directly above the credential inputs:

```tsx
import * as Clipboard from "expo-clipboard"; // or @react-native-clipboard/clipboard
import * as Haptics from "expo-haptics";

function RedirectUrlCard({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(url);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    Toast.show("Redirect URL copied");
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <View style={s.card}>
      <Text style={s.label}>REDIRECT URL — paste this in the broker portal</Text>
      <Text selectable numberOfLines={2} style={s.url}>{url}</Text>
      <Pressable onPress={copy} style={s.btn} accessibilityLabel="Copy redirect URL">
        <Icon name={copied ? "check" : "copy"} />
        <Text>{copied ? "Copied" : "Copy"}</Text>
      </Pressable>
    </View>
  );
}
```

Behaviour spec:
- `selectable` text + long-press also copies.
- Button flips to a green "Copied" state for 2s, with haptic feedback.
- Card is hidden for brokers whose `needsRedirect` is false (Groww, Dhan token mode).
- Also add a "?" link that opens the broker portal page where the URL must be pasted.

Portal locations to mention in helper text:
- Dhan: web.dhan.co → My Profile → Access DhanHQ APIs → API Key tab
- Zerodha: developers.kite.trade → app → Redirect URL
- Upstox: Upstox Developer Console → App → Redirect URI
- Fyers: myapi.fyers.in → Create App → Redirect URL
- 5paisa: Xstream API dashboard → App → Redirect URL
- Aliceblue: ANT Web → Create App → Redirect URL (+ static IP)
- Angel One: smartapi.angelone.in → My Apps → Redirect URL / Postback URL

---

## 3. Fetching the redirect URL from the server (preferred over hardcoding)

| Broker | Status endpoint (GET) | Field holding the redirect URL |
|---|---|---|
| Dhan OAuth | `/broker/oauth/status` | `credentials.redirect_url` |
| Zerodha | `/broker/kite/status` | `redirect_url` |
| Upstox | `/broker/upstox/status` | `redirect_uri` |
| Fyers | `/broker/fyers/status` | `redirect_uri` |
| 5paisa | `/broker/5paisa/status` | `redirect_uri` |
| Aliceblue | `/broker/aliceblue/status` | `redirectUri` |
| Angel One | `/broker/angelone/status` | `redirectUri` |

```ts
const url = status?.redirect_uri ?? status?.redirect_url ?? status?.redirectUri
         ?? redirectUrlFor(brokerId);
```

---

## 4. Dhan connection — Client ID + Access Token mode (NO OAuth)

This is the mode the user asked for. The backend already supports it fully; it is a
different path from `/broker/oauth/*` and must be offered as the **default** Dhan tab.

### 4.1 Screen layout — "Dhan" broker card, two tabs

```
[ Access Token (recommended) ] [ OAuth (API Key & Secret) ]
```

Tab 1 "Access Token" fields:
1. **Dhan Client ID** — numeric only, keyboard `number-pad`, strip non-digits.
2. **Access Token** — multiline, `autoCapitalize="none"`, `autoCorrect={false}`,
   paste-friendly, trimmed of all whitespace/newlines before send.
3. Helper: "Generate from web.dhan.co → My Profile → Access DhanHQ APIs →
   Access Token tab. Valid for 24 hours — repaste daily."
4. No redirect URL card in this tab.

### 4.2 Endpoints (exact)

**a) Save the permanent Client ID**
```
POST /api-credentials
Authorization: Bearer <jwt>
Body: { "dhanClientId": "1000000001" }
→ { "success": true, "message": "Permanent credentials saved successfully" }
```
Notes: the server strips non-digits, preserves any existing access token, and never
overwrites the token from this route.

**b) Save / refresh the 24-hour Access Token**
```
POST /update-access-token
Authorization: Bearer <jwt>
Body: { "dhanAccessToken": "<JWT from Dhan>" }
→ { "success": true, ... }
Errors: 400 "Please save Client ID first in Settings"  → send step (a) first
```
On success the server also mirrors the row into `broker_credentials` with
`auth_method: "access_token"` and a +24h expiry, so the unified broker status card,
the dashboard chip and the RN app all read "connected" instantly.

**c) Read current state**
```
GET /api-credentials
→ { dhanClientId, hasAccessToken, tokenUpdatedAt, ... }
```
Use it to prefill Client ID (never prefill the token — show `•••• saved`).

**d) Verify the token is really live**
```
POST /test-dhan          → runs a real Dhan funds call with the saved token
GET  /fund-limits        → { broker: "dhan", availableBalance, ... }
```
Treat the connection as **connected only when (d) returns ok**. A saved token that
Dhan rejects must show red "Token rejected — repaste".

**e) Make Dhan the executing broker**
```
POST /broker/active   Body: { "broker": "dhan" }
GET  /broker/active   → { broker: "dhan" }
```
Call this right after a successful verify, then refresh funds/positions/instruments.

### 4.3 Client-side flow

```
enter Client ID + Access Token
  → POST /api-credentials  ({dhanClientId})
  → POST /update-access-token ({dhanAccessToken})
  → POST /test-dhan  (live check)
      ok    → POST /broker/active {broker:"dhan"} → refresh funds+positions → green "Connected · ₹<balance>"
      fail  → red banner with the server error text, keep the fields filled
```

### 4.4 Token expiry UX
- Store `tokenUpdatedAt`; token dies ~24h later (and at the broker's daily cutoff).
- Show a countdown chip: "Token valid · 7h 12m left".
- Under 60 minutes → amber chip + push reminder "Dhan token expires soon — repaste".
- Expired → block engine start, deep-link the user to the Dhan token screen.

### 4.5 Do NOT
- Do not require API Key / API Secret / redirect URL in this tab.
- Do not call `/broker/oauth/*` in this tab.
- Do not log or persist the token in AsyncStorage — server only.

---

## 5. Deep-link return after OAuth brokers (unchanged, for completeness)

The server callback page renders a success tick and, for RN, posts
`{ type: "DHAN_OAUTH_TOKEN" | "<broker>_AUTH", ... }`. In RN open the login URL with
`WebBrowser.openAuthSessionAsync(loginUrl, "indexpilot://broker-callback")`, close the
sheet when the server page reaches `…/callback`, then re-poll the broker `…/status`
endpoint and refresh funds/positions.

---

## 6. Acceptance checklist

- [ ] Every OAuth broker screen shows a Redirect URL card with a working Copy button.
- [ ] Copied string is byte-identical to the table / `status` response.
- [ ] Groww and Dhan-token mode show no redirect card.
- [ ] Dhan default tab = Client ID + Access Token; connects with the three calls in §4.3.
- [ ] Connected state is proven by a live funds call, never by "saved".
- [ ] Switching brokers re-fetches funds, positions and instrument mapping.
