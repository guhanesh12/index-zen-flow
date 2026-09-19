# React Native Prompt — Static IP: Buy, Auto-Renewal, Expiry Alerts & Live Availability

Copy everything below into your React Native agent. This is a verified mirror of the IndexPilot
web implementation (`UserDedicatedIPManager.tsx`, `StaticIPManager.tsx`, edge function
`make-server-c4d79cb7` + `ip_auto_renew.tsx`).

Use together with `RN_STATIC_IP_VPS_PURCHASE_FULL_PROMPT.md` (purchase / provisioning flow).
This document adds **auto-renewal consent, wallet debit rules, refunds, push alerts and the
auto-refreshing availability UI**.

---

## 0. Two products (do not mix)

| | Shared Static IP | Dedicated VPS (Static IP) |
|---|---|---|
| Price | ₹59 / month | **₹599 / 30 days** |
| IP | shared `187.127.140.245` | own DigitalOcean droplet IP |
| Payment | wallet auto-debit only | wallet debit **or** Razorpay |
| Auto-renewal | always on (activity based) | **opt-in toggle** (this document) |

Base URL and auth (every call):

```ts
const BASE_URL = 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7';
headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAccessToken}` }
```

---

## 1. API reference — auto-renewal

### `GET /ip-pool/auto-renew`
```json
{
  "success": true,
  "enabled": false,
  "consentAt": null,
  "lastRenewalAt": null,
  "lastFailureReason": null,
  "price": 599,
  "reminderDays": 3,
  "walletBalance": 250,
  "sufficientBalance": false,
  "expiresAt": "2026-10-04T10:00:00.000Z",
  "daysUntilExpiry": 14
}
```

### `POST /ip-pool/auto-renew`
```json
{ "enabled": true }
```
→ `{ success, enabled, consentAt, price: 599, walletBalance, sufficientBalance, message }`
`message` is user-ready text — show it as the toast verbatim.
`400 { error: "enabled (true/false) is required" }` if the body is wrong.

**Consent rule:** nothing is ever debited automatically unless `enabled === true`. The toggle IS
the consent record (user id + timestamp), so the switch must carry explicit text:
*"Auto-renew my dedicated IP for ₹599 every 30 days from my wallet."*

### `GET /ip-pool/my-ip` (availability / status)
```json
{ "success": true, "hasIP": true,
  "assignment": { "ipAddress": "159.65.x.x", "subscriptionStatus": "active",
    "expiresAt": "2026-10-04T10:00:00.000Z", "monthlyFee": 599, "daysRemaining": 14 } }
```
or `{ "success": true, "hasIP": false, "message": "No dedicated IP assigned..." }`

### Shared IP (₹59)
- `GET /wallet/static-ip-status` → `{ subscription: { active, monthlyFee: 59, nextPaymentDue, canConnectBroker }, wallet: { balance, hasSufficientBalance }, activity: { daysSinceLastActive, isInactive } }`
- `POST /wallet/static-ip-subscription-check` — auto-debit engine (inactive 10+ days → no charge; balance < ₹59 → blocked with `shortfall`; paid within 30 days → skip; else debit ₹59)
- `POST /user/update-activity` — call on every app foreground.

### Wallet
- `GET /wallet/balance` → `{ balance, totalProfit, totalDeducted }`
- `POST /wallet/create-recharge-order` `{ amount }` → Razorpay order
- `POST /wallet/verify-payment` `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
- `GET /wallet/transactions` — look for categories `dedicated_ip_auto_renewal` (debit) and
  `dedicated_ip_auto_renewal_refund` (credit).

---

## 2. Server-side daily job (what the app must reflect)

Runs 09:30 IST daily, one push per user per day per kind:

| Condition | Server action | Push |
|---|---|---|
| 3 / 2 / 1 days left, auto-renew ON, balance ≥ ₹599 | nothing | "Dedicated IP expires in N days" — renews automatically |
| 3 / 2 / 1 days left, auto-renew ON, balance < ₹599 | nothing | "Add funds — IP renews in N days" with shortfall |
| 3 / 2 / 1 days left, auto-renew OFF | nothing | "Dedicated IP expires in N days" — renew or enable auto-renewal |
| Expired, auto-renew OFF | nothing | "Dedicated IP subscription expired" |
| Expired, auto-renew ON, balance ≥ ₹599 | debit ₹599 + extend 30 days | "Dedicated IP renewed" |
| Expired, auto-renew ON, balance < ₹599 | nothing debited, `lastFailureReason` set | "Auto-renewal failed — add funds" |
| Expired, debited but renewal failed | **₹599 refunded automatically**, `lastFailureReason` set | "Auto-renewal could not complete — refunded" |

Push data payload: `{ type: 'ip_subscription', kind: 'expiry-3' | 'lowbal-2' | 'expired' | 'lowbal-expired' | 'renew-failed' | 'renewed' }`,
`targetUrl: '/dashboard?tab=dedicated-ip'`.

**RN handling:** on any push with `data.type === 'ip_subscription'`, navigate to `StaticIpScreen`
and immediately re-fetch `/ip-pool/my-ip` + `/ip-pool/auto-renew` + `/wallet/balance`.

---

## 3. Screen spec — `StaticIpScreen`

Single screen, two cards (segmented control: **Shared ₹59** | **Dedicated ₹599**).

### 3.1 Availability block (auto-refreshing, no manual reload)
```ts
const load = async () => {
  const [ip, renew, wallet] = await Promise.all([
    api('/ip-pool/my-ip'), api('/ip-pool/auto-renew'), api('/wallet/balance'),
  ]);
  setState({ ip, renew, wallet });
};
useEffect(() => {
  load();
  const t = setInterval(load, 60_000);                       // every 60s while visible
  const s = AppState.addEventListener('change', a => a === 'active' && load());
  const un = messaging().onMessage(m =>
    m?.data?.type === 'ip_subscription' && load());
  return () => { clearInterval(t); s.remove(); un(); };
}, []);
```
While provisioning is running, poll `/ip-pool/provisioning-status` every **3s** instead (stop on
`ready` / `failed` / blur).

### 3.2 Status badge (derive from `expiresAt`)
```ts
const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
const status  = daysLeft > 7 ? 'active' : daysLeft > 0 ? 'expiring' : 'expired';
const canConnectBroker = daysLeft > 0;
```
- `active` — green "Active · expires DD MMM"
- `expiring` — amber "Expires in N days"
- `expired` — red "Expired — broker orders blocked"

### 3.3 Auto-renewal card (the new part)
- Title **Auto-renewal from wallet**, subtitle `₹599 every 30 days · charged on expiry day`.
- `Switch` bound to `renew.enabled`; on change → `POST /ip-pool/auto-renew { enabled }`,
  optimistic update, revert + toast on error, toast `res.message` on success.
- Row: `Wallet balance ₹{walletBalance}` — red when `sufficientBalance === false` with
  "Add ₹{599 - balance}" button → wallet recharge sheet.
- When `enabled` and `daysUntilExpiry <= 3`: amber line
  "Renews automatically on DD MMM — keep at least ₹599 in the wallet."
- When `lastFailureReason`: red banner with that text verbatim + "Retry renewal" → `/ip-pool/subscribe`.
- When `lastRenewalAt`: grey line "Last renewed on DD MMM, ₹599".
- When auto-renew is OFF and `daysUntilExpiry <= 7`: primary CTA "Renew now — ₹599".

### 3.4 Ready state
IP in mono + Copy button, expiry date, Dhan whitelist steps (Copy IP → Dhan login → Settings →
API Management → IP Whitelisting → paste & save), VPS power banner from `/vps-power/my-status`
(auto on 08:55 IST, off 15:31 IST on trading days), "Test connection" → `/check-vps-connectivity`.
Danger zone behind confirmation: **Recreate IP** (`/ip-pool/recreate`, IP changes — re-whitelist)
and **Cancel subscription** (`/ip-pool/cancel`).

### 3.5 No-IP state
Feature list + "Buy Dedicated IP — ₹599/month" → payment sheet (Pay with Wallet, disabled with
"Insufficient balance (₹X / ₹599)"; Pay with Razorpay), secondary "I already have a VPS — recover it"
→ `POST /ip-pool/my-ip`. **Pre-tick nothing** — offer the auto-renewal switch right after a
successful purchase with the consent text.

### 3.6 Shared ₹59 tab
Amber card (auto-debit ₹59/month, activity based, no debit after 10 idle days, blocked broker
connect when balance short), red low-balance card, mono `187.127.140.245` + Copy (3s "Copied!"),
whitelist steps. On mount `GET /wallet/static-ip-status`; before broker connect
`POST /wallet/static-ip-subscription-check` and block with a recharge CTA when
`canConnectBroker === false`.

---

## 4. Push registration

Register the FCM token through the existing subscribe flow, and handle:
```ts
messaging().onNotificationOpenedApp(m => {
  if (m?.data?.type === 'ip_subscription') navigate('StaticIp');
});
messaging().getInitialNotification().then(m => { /* same */ });
```
Foreground messages must not just toast — always refresh the screen data.

---

## 5. Error map (show verbatim)

| HTTP / field | UI |
|---|---|
| `401` | refresh Supabase session, retry once, else force login |
| `400 Insufficient balance. Need ₹599, you have ₹X` | Recharge CTA prefilled with the shortfall |
| `400 enabled (true/false) is required` | developer bug — revert the switch silently |
| `400 Payment verification failed` | "Payment could not be verified. If money was debited it will auto-refund in 5–7 days. Contact support with the payment ID." |
| `409 alreadyProcessed` | treat as success, refresh state |
| `500 Payment successful but VPS provisioning failed` | "Payment received. Server creation failed — support has been notified." + Retry → `/ip-pool/provisioning-restart` |
| `lastFailureReason` contains "refunded" | "₹599 was returned to your wallet" + Retry |

---

## 6. Acceptance checklist

- [ ] Auto-renewal switch reads `GET /ip-pool/auto-renew` and writes `POST /ip-pool/auto-renew`.
- [ ] Switch shows explicit ₹599/30-day consent text; never pre-enabled.
- [ ] Wallet balance shown next to the switch; shortfall gives an "Add ₹X" recharge CTA.
- [ ] `lastFailureReason` surfaces as a red banner with a Retry action.
- [ ] Availability refreshes on mount, every 60s, on app foreground and on `ip_subscription` push.
- [ ] Provisioning polls every 3s and stops on ready/failed/blur.
- [ ] Expiry badge: active / expiring (≤7d) / expired; expired blocks broker connect.
- [ ] Push taps deep-link to the static IP screen and refresh data.
- [ ] Shared-IP tab shows ₹59 rules, live status, copyable `187.127.140.245`.
- [ ] `POST /user/update-activity` fires on every app foreground.
- [ ] Renewal never creates a second VPS — IP is preserved.
