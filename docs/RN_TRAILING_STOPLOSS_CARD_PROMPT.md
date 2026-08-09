# React Native — Trailing Stop-Loss Card + Notifications (IndexPilot)

Add a **Trailing Stop-Loss** card to the RN app Home/Dashboard screen and handle the two new push
notification types. Do not change any existing screen logic — this is additive.

---

## 1. Data source

`GET {SERVER_URL}/position-monitor/list`
Header: `Authorization: Bearer <supabase_access_token>`

```json
{
  "success": true,
  "positions": [
    {
      "id": "uuid",
      "order_id": "1234567",
      "symbol": "NIFTY 25000 CE",
      "index_name": "NIFTY",
      "entry_price": 120.5,
      "current_price": 138.2,
      "quantity": 75,
      "pnl": 1327.5,
      "highest_pnl": 1520,
      "target_amount": 6000,
      "stop_loss_amount": 3000,
      "trailing_enabled": true,
      "trailing_step": 500,
      "raw_position": {
        "trailingEnabled": true,
        "trailingActive": true,
        "trailingActivationAmount": 1000,
        "targetJumpAmount": 500,
        "stopLossJumpAmount": 500,
        "trailingStepCount": 1,
        "trailingActivatedAt": 1786100000000,
        "baseTargetAmount": 6000,
        "baseStopLossAmount": 5000,
        "currentTargetAmount": 6500,
        "currentStopLossAmount": 4500,
        "profitLocked": false
      }
    }
  ]
}
```

Poll every 2–3 seconds while the screen is focused.

### Field meaning

| Field | Meaning |
|---|---|
| `trailingActivationAmount` | Profit (peak P&L) at which trailing turns ON |
| `targetJumpAmount` | How much Target moves up per step |
| `stopLossJumpAmount` | How much SL moves up (in your favour) per step |
| `trailingStepCount` | How many steps have fired so far |
| `baseTargetAmount` / `baseStopLossAmount` | Original values before trailing |
| `currentTargetAmount` / `currentStopLossAmount` | Live values after trailing |
| `profitLocked` | `currentStopLossAmount <= 0` → exit can no longer be a loss |

**Worked example** (activation ₹1000, trail step ₹500, SL ₹5000, Target ₹6000):
peak profit crosses ₹1000 → Step 1 → SL ₹5000 → ₹4500, Target ₹6000 → ₹6500.
Step 2 (peak ≥ ₹1500) → SL ₹4000, Target ₹7000. And so on.

---

## 2. Card UI (Home screen, separate card, shown only after trailing exists)

Render **one card per active position** where `raw_position.trailingEnabled === true`.
Place it directly under the existing P&L / positions block.

- Header: ⚡ `Trailing Stop-Loss` + badge
  - `trailingActive` → orange badge `ACTIVE · STEP {trailingStepCount}`
  - else → grey badge `Waiting · activates at ₹{trailingActivationAmount}`
- 4 stat tiles: `Activation`, `Trail Step` (`stopLossJumpAmount`), `Target Step` (`targetJumpAmount`), `Steps Done`
- 2 comparison tiles:
  - **Target**: base struck-through → current in green
  - **Stop-Loss**: base struck-through → current in red; if `profitLocked`, show green `Locked +₹{abs(currentStopLossAmount)}`
- Footer helper line:
  - active: `Every ₹{targetJumpAmount} of extra profit moves Target +₹{targetJumpAmount} and SL +₹{stopLossJumpAmount}.`
  - waiting: `Trailing starts once peak profit reaches ₹{activation} (peak now ₹{highest_pnl}).`
- Animate the card in (fade + slide) the first time `trailingActive` flips to true; pulse the badge on `trailingStepCount` change.

---

## 3. Push notifications (already sent by the backend — just handle them)

Both arrive via FCM and are also stored in the notification center.

### A. `data.type === "TRAILING_ACTIVATED"`
```
title: "🔥 Trailing Activated — NIFTY 25000 CE"
body:  "Profit hit ₹1,020.00 (activation ₹1000). Trailing is now ON for NIFTY 25000 CE.
        Base Target ₹6000 / Base SL ₹5000. Each step moves Target +₹500 and SL +₹500 in your favour."
data:  { type, symbol, orderId, pnl, peak, activation, targetJump, slJump, baseTarget, baseStopLoss }
```

### B. `data.type === "TRAILING_STEP"`
```
title: "⚡ Trailing Step 1 — NIFTY 25000 CE"
body:  "Step 1 • Current profit ₹1,120.00 (peak ₹1,520.00). Target ₹6000 → ₹6500. SL ₹5000 → ₹4500."
data:  { type, symbol, orderId, step, pnl, peak, oldTarget, newTarget, oldStopLoss, newStopLoss, profitLocked }
```
When `profitLocked === "true"`, the SL line reads `SL ₹X → PROFIT LOCK ₹Y (no loss possible now)`.

Handling:
- Tap → navigate to Home/Dashboard and scroll to the trailing card for `data.orderId`.
- Show an in-app toast/banner while foregrounded.
- Trigger an immediate `position-monitor/list` refetch on receipt.
- Notification-center list: orange icon for `TRAILING_STEP`, flame icon for `TRAILING_ACTIVATED`.

No wallet debit and no extra API call is required for these notifications.
