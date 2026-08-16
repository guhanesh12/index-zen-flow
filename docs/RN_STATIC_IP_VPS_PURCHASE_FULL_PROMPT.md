# React Native Prompt — Static IP / Dedicated VPS Purchase, Provisioning, Wallet & Razorpay

Copy everything below into your React Native agent. It is a complete, verified mirror of the
IndexPilot web implementation (`UserDedicatedIPManager.tsx`, `StaticIPManager.tsx` +
`make-server-c4d79cb7` edge function).

---

## 0. System overview (how it really works)

There are **two different products**. Do not mix them up.

| | Shared Static IP | Dedicated VPS (Static IP) |
|---|---|---|
| Price | **₹59 / month** | **₹599 / month** |
| IP | Fixed shared IP `187.127.140.245` | Own DigitalOcean droplet IP |
| Payment | Wallet auto-debit only | Wallet debit **or** Razorpay checkout |
| Creation | Instant (nothing provisioned) | DigitalOcean droplet + order server deploy (~8–15 min) |
| Screen | Info + copy IP + whitelist steps | Full purchase → provisioning → live status flow |

Flow for the dedicated VPS:

```text
User taps Buy (₹599)
      |
      +--> Wallet path:   POST /ip-pool/subscribe  { autoProvision: true }
      |                     - checks wallet balance >= 599
      |                     - debits wallet, logs transaction
      |                     - starts provisioning job
      |
      +--> Razorpay path: POST /ip-pool/create-payment-order      -> { orderId, keyId, amount }
                          Razorpay Checkout (native SDK)
                          POST /ip-pool/verify-payment-and-provision
                            { razorpay_order_id, razorpay_payment_id, razorpay_signature }
                            - HMAC-SHA256 signature verified server-side
                            - replay-protected (order status created -> processing -> paid)
                            - starts provisioning job
      |
      v
Poll every 3s: GET /ip-pool/provisioning-status
   status: pending -> creating -> deploying -> ready  (or failed)
      |
      v
GET /ip-pool/my-ip  -> { hasIP: true, assignment: { ipAddress, expiresAt, ... } }
      |
      v
User copies IP -> whitelists in Dhan -> orders execute from that IP
```

Renewal: if the user already has an assignment, **both** payment paths detect it and renew
(`isRenewal: true`) — **no new VPS is created and the IP is preserved**.

---

## 1. Base URL & auth

```ts
const BASE_URL = `https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7`;
// every call:
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${supabaseAccessToken}`,   // Supabase session access_token
}
```
All endpoints below are relative to `BASE_URL`. A `401 { code: 401, message: 'Unauthorized' }`
means the session expired — refresh the Supabase session and retry once, then force re-login.

---

## 2. API reference (exact contracts)

### 2.1 Dedicated VPS

**`GET /ip-pool/my-ip`** — current assignment
```json
{ "success": true, "hasIP": false, "message": "No dedicated IP assigned. Subscribe to get your own static IP." }
```
```json
{ "success": true, "hasIP": true,
  "assignment": { "ipAddress": "159.65.x.x", "provider": "digitalocean",
    "assignedAt": "2026-07-01T10:00:00.000Z", "subscriptionStatus": "active",
    "expiresAt": "2026-07-31T10:00:00.000Z", "monthlyFee": 599, "daysRemaining": 14 } }
```

**`POST /ip-pool/my-ip`** (no body) — *Recover / link an existing VPS* that was created but never
linked (used when a payment succeeded but linking failed).
→ `{ success, alreadyLinked, ipAddress, assignment }` or `404 { success:false, error, provisioningStatus, ipAddress }`.

**`POST /ip-pool/subscribe`** — wallet purchase / renewal
```json
// request
{ "autoProvision": true }
```
Responses:
- new purchase → `{ success:true, provisioning:true, jobId, estimatedMinutes, message, wallet:{balance,deducted:599} }`
- already had IP → `{ success:true, isRenewal:true, provisioning:false, assignment, wallet:{balance,deducted:599} }`
- recovered existing VPS → `{ success:true, isRecovered:true, provisioning:false, assignment, wallet:{deducted:0} }`
- job already running → `{ success:true, provisioning:true, alreadyProvisioning:true, jobId, estimatedMinutes }`
- low balance → `400 { success:false, error:"Insufficient balance. Need ₹599, you have ₹120" }`

**`POST /ip-pool/create-payment-order`** (no body) — Razorpay order
```json
{ "success": true, "orderId": "order_XXXX", "amount": 599, "currency": "INR",
  "keyId": "rzp_live_xxx", "isRenewal": false, "existingIpAddress": null,
  "notes": { "userId": "...", "type": "dedicated_ip_subscription", "email": "..." } }
```
May instead return `{ success:true, recovered:true, message, assignment }` — in that case **do not
open checkout**, just refresh status.
> `amount` here is in **rupees (599)**. Razorpay Checkout needs **paise** → pass `599 * 100`.

**`POST /ip-pool/verify-payment-and-provision`**
```json
{ "razorpay_order_id": "order_X", "razorpay_payment_id": "pay_X", "razorpay_signature": "hex" }
```
→ new: `{ success:true, provisioning:true, jobId, estimatedMinutes, paymentId, message }`
→ renewal: `{ success:true, isRenewal:true, provisioning:false, assignment, paymentId }`
→ `400 { error:"Payment verification failed" }` (bad signature) · `409 { error:"This payment has already been processed", alreadyProcessed:true }`
→ `500 { success:false, error:"Payment successful but VPS provisioning failed. Support team notified." }` — money is safe, tell the user support is notified and show a Retry that calls `POST /ip-pool/provisioning-restart`.

**`GET /ip-pool/provisioning-status`**
```json
{ "success": true, "provisioning": true,
  "job": { "status": "deploying", "ipAddress": "159.65.x.x",
           "startedAt": "...", "completedAt": null, "estimatedMinutes": 8, "error": null } }
```
or `{ success:true, provisioning:false, message:"Dedicated VPS is already active", assignment:{...} }`
or `{ success:true, provisioning:false, message:"No provisioning in progress" }`.

**`POST /ip-pool/provisioning-cancel`** — clear a stuck job (no refund needed, no charge).
**`POST /ip-pool/provisioning-restart`** — cancel stuck job + start a fresh droplet, **no re-charge**.
**`POST /ip-pool/recreate`** — destroy droplet & create a brand-new one, **expiry preserved, no payment**. Warn: the IP changes and must be re-whitelisted in Dhan.
**`POST /ip-pool/cancel`** — cancel subscription, deletes the DigitalOcean droplet and purges all state; Buy option reappears.

**`GET /vps-power/my-status`** → `{ success:true, state:'on'|'off'|..., scheduleEnabled, specialSessionToday, at }`
(VPS is auto-powered on 08:55 IST and off 15:31 IST on trading days — show as an info banner.)

**`GET /check-vps-connectivity`** → health probe of the user's order server; use for a "Test connection" button.

### 2.2 Wallet + Razorpay recharge

- **`GET /wallet/balance`** → `{ success, balance, totalProfit, totalDeducted }`
- **`POST /wallet/create-recharge-order`** `{ amount }` (₹100–₹50,000) → `{ success, order: {id, amount(paise), currency}, razorpayKeyId }`
- **`POST /wallet/verify-payment`** `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` → `{ success, newBalance, amount }`; `409` if already processed
- **`GET /wallet/transactions`** → transaction list (types: `credit`, `debit`, category `static_ip_subscription`, etc.)

### 2.3 Shared static IP (₹59/month)

- **`GET /wallet/static-ip-status`**
```json
{ "success": true,
  "subscription": { "active": true, "monthlyFee": 59, "lastPaymentDate": 0,
                    "daysSinceLastPayment": 3, "nextPaymentDue": 27, "canConnectBroker": true },
  "wallet": { "balance": 250, "hasSufficientBalance": true },
  "activity": { "lastActive": 1723800000000, "daysSinceLastActive": "0.2", "isInactive": false } }
```
- **`POST /wallet/static-ip-subscription-check`** — the auto-debit engine. Rules implemented server-side:
  - inactive for **10+ days** → no charge, `canConnectBroker:false`
  - balance `< ₹59` → no charge, returns `requiredAmount / currentBalance / shortfall`, `canConnectBroker:false`
  - already paid within **30 days** → `subscriptionActive:true`, returns `nextPaymentDue`
  - else debits ₹59, writes a `wallet_transactions` row "Static IP Monthly Subscription (₹59/month)" and returns `newBalance`, `validUntil`
- **`POST /user/update-activity`** — call on app foreground; it feeds the 10-day inactivity rule.
- Shared IP constant to display/copy: **`187.127.140.245`**.

---

## 3. Screens to build

### A. `StaticIpScreen` (shared ₹59 plan — mirror of `StaticIPManager.tsx`)
- Header: "Static IP Whitelisting" + badge "SEBI Mandatory".
- Amber card: Auto-Debit ₹59/month · activity-based (no debit if unused 10+ days) · sufficient balance required or broker connection is blocked · auto-renews monthly.
- Red card: "If wallet balance is below ₹59, broker connections will be blocked."
- Green card: what the subscription includes.
- Big mono IP `187.127.140.245` + **Copy IP** button (`Clipboard.setStringAsync`, 3s "Copied!" state).
- Numbered Dhan whitelist steps: Copy IP → login to Dhan → Settings → API Management → IP Whitelisting → paste & save.
- On mount: `GET /wallet/static-ip-status`; on broker-connect attempt: `POST /wallet/static-ip-subscription-check` and block with a recharge CTA when `canConnectBroker === false`.

### B. `DedicatedVpsScreen` (₹599 plan — mirror of `UserDedicatedIPManager.tsx`)

States and required UI:

1. **No VPS** — feature list + "Buy Dedicated IP — ₹599/month" → opens a payment sheet with two options:
   - **Pay with Wallet** (disabled with "Insufficient balance (₹X / ₹599)" when `balance < 599`)
   - **Pay with Razorpay**
   Also a secondary "I already have a VPS — recover it" → `POST /ip-pool/my-ip`.
2. **Provisioning** — progress bar + 3 step chips:
   - `1. Creating VPS` (status `creating`) · `2. Deploying Server` (`deploying`) · `3. Ready!` (`ready`/`active`)
   - Status copy: `pending` → "Payment confirmed, initializing server…", `creating` → "Please wait, server is being created on DigitalOcean…", `deploying` → "Deployment in progress. Installing order execution server…", `failed` → "Provisioning failed".
   - Progress formula (identical to web): ready→100, failed→0, else
     `base = min(elapsed/(estimatedMinutes*60000)*90, 90)`; `creating → min(base,45)`;
     `deploying → min(45 + base*0.6, 92)`; otherwise `min(base,10)`.
   - Poll `GET /ip-pool/provisioning-status` **every 3s**; stop polling on `ready`/`failed`; stop on unmount/background.
3. **Ready / Active** — IP with Copy button, subscription badge (`active` / `Expires in Nd` / `expired`),
   expiry date, "Renew Subscription (₹599)" when `daysUntilExpiry <= 7`, Dhan whitelist steps,
   VPS power banner from `/vps-power/my-status`, and a Test-connection button (`/check-vps-connectivity`).
   Danger zone: **Recreate IP** (`/ip-pool/recreate`) and **Cancel subscription** (`/ip-pool/cancel`), both behind a confirm dialog.
4. **Failed** — error text + "Restart provisioning (free)" → `/ip-pool/provisioning-restart`, plus "Reset" → `/ip-pool/provisioning-cancel`.

Subscription status derivation from `assignment.expiresAt`:
```ts
const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
const status = daysLeft > 7 ? 'active' : daysLeft > 0 ? 'expiring' : 'expired';
const canConnect = daysLeft > 0;
```

---

## 4. Razorpay in React Native

```bash
npm i react-native-razorpay   # iOS: cd ios && pod install
```

```ts
import RazorpayCheckout from 'react-native-razorpay';

async function buyVpsWithRazorpay() {
  const order = await api('/ip-pool/create-payment-order', { method: 'POST' });
  if (order.recovered) { await refreshStatus(); return; }           // VPS linked, no payment

  const result = await RazorpayCheckout.open({
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount * 100,           // rupees -> paise
    currency: order.currency || 'INR',
    name: 'IndexpilotAI',
    description: order.isRenewal
      ? 'VPS Subscription Renewal (₹599/month)'
      : 'Dedicated VPS — Static IP for Broker (₹599/month)',
    theme: { color: '#06b6d4' },
    prefill: { email: userEmail, contact: userMobile },
  });                                      // throws { code, description } on cancel

  const verify = await api('/ip-pool/verify-payment-and-provision', {
    method: 'POST',
    body: {
      razorpay_order_id: result.razorpay_order_id,
      razorpay_payment_id: result.razorpay_payment_id,
      razorpay_signature: result.razorpay_signature,
    },
  });

  if (verify.isRenewal) toast('Subscription renewed — your IP is unchanged.');
  else startProvisioningPolling(verify.jobId);
}
```
Wallet recharge uses the same pattern with `/wallet/create-recharge-order` (order.amount is already
in paise there) and `/wallet/verify-payment`.

**Non-negotiable rules**
- Never compute or trust the signature on-device — always POST it to the verify endpoint.
- Never call verify twice for one payment: the server returns `409 alreadyProcessed` — treat that as success and just refresh state.
- If checkout is dismissed, do **not** call verify; show "Payment cancelled".
- Persist `razorpay_order_id`/`payment_id` locally until verification succeeds so an app crash can retry verification once on next launch.

---

## 5. Error map (show these messages verbatim)

| HTTP / field | Meaning | UI |
|---|---|---|
| `401` | Session expired | refresh session, else force login |
| `400 Insufficient balance. Need ₹599, you have ₹X` | wallet too low | show Recharge CTA prefilled with the shortfall |
| `400 Payment verification failed` | bad signature | "Payment could not be verified. If money was debited it will auto-refund in 5–7 days. Contact support with the payment ID." |
| `409 alreadyProcessed` | duplicate verify | silently refresh status |
| `500 Payment successful but VPS provisioning failed` | paid, provisioning broke | "Payment received. Server creation failed — support has been notified." + Retry (`provisioning-restart`) |
| `job.status === 'failed'` | droplet/deploy failed | error + free Restart button |
| `alreadyProvisioning: true` | job already running | jump straight to the progress UI, never charge again |

---

## 6. Acceptance checklist

- [ ] Wallet purchase debits exactly ₹599 once and starts provisioning.
- [ ] Razorpay purchase verifies server-side and starts provisioning; cancel path charges nothing.
- [ ] Existing-IP user always gets **renewal** (IP preserved), never a second droplet.
- [ ] Polling every 3s, stops on ready/failed and on screen blur; progress matches the web curve.
- [ ] Ready screen shows IP + Copy + expiry + Dhan whitelist steps + power banner.
- [ ] Renew CTA appears at `daysUntilExpiry <= 7`; expired state blocks broker connect.
- [ ] Recreate / Cancel / Restart all behind confirmations and wired to their endpoints.
- [ ] Shared-IP screen shows ₹59 auto-debit rules, live status, copyable `187.127.140.245`.
- [ ] `POST /user/update-activity` fires on every app foreground.
- [ ] Duplicate verify returns 409 and is handled as success.
