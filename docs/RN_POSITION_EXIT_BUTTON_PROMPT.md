# React Native Position Exit Button — Correct Endpoint + Logic

Use this prompt/code spec in the RN app to make the manual **Exit** button behave exactly like the website.

## Root Cause

The website closes a position by calling:

`POST https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7/execute-dhan-order`

The RN app must use the same authenticated endpoint. Do **not** call VPS URLs directly and do **not** send `userId` from the app. The edge function derives the user from the Supabase JWT, loads saved Dhan credentials, and routes the SELL market order through the user's dedicated VPS/static IP automatically.

## Required Headers

Every request must include:

```ts
{
  "Content-Type": "application/json",
  "Authorization": `Bearer ${session.access_token}`,
  "apikey": SUPABASE_ANON_KEY
}
```

If `session` is missing, expired, or `authReady === false`, do not show the Exit button as active. Refresh the session first.

## Load Active Positions

```ts
const API_BASE = "https://api.indexpilotai.com/functions/v1/make-server-c4d79cb7";

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("Login session expired. Please login again.");

  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${data.session.access_token}`,
    "apikey": SUPABASE_ANON_KEY,
  };
}

export async function getActivePositions() {
  const res = await fetch(`${API_BASE}/positions/monitor/active`, {
    method: "GET",
    headers: await authHeaders(),
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || json.message || "Failed to load active positions");
  return json.positions || [];
}
```

## Exit Button Function

Use a MARKET SELL order. Map DB snake_case fields to the website payload.

```ts
export async function exitPosition(position: any) {
  if (!position?.order_id) throw new Error("Missing position order id");
  if (!position?.symbol_id) throw new Error("Missing security id for exit order");
  if (!Number(position?.quantity)) throw new Error("Missing quantity for exit order");

  const correlationId = `RN_EXIT_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const payload = {
    correlationId,
    transactionType: "SELL",
    exchangeSegment: position.exchange_segment || "NSE_FNO",
    productType: "INTRADAY",
    orderType: "MARKET",
    validity: "DAY",
    securityId: String(position.symbol_id),
    quantity: Math.max(1, Number(position.quantity)),
    disclosedQuantity: 0,
    price: 0,
    triggerPrice: 0,
    afterMarketOrder: false,
    amoTime: "",
    boProfitValue: 0,
    boStopLossValue: 0,
    symbolName: position.symbol,
    index: position.index_name,
  };

  const res = await fetch(`${API_BASE}/execute-dhan-order`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (!res.ok || !json.success || !json.orderId) {
    const message = json.error || json.message || "Exit order failed";
    throw new Error(message);
  }

  return json;
}
```

## UI Workflow

1. On screen open, wait for `authReady === true`.
2. Call `getActivePositions()`.
3. For each active row, show an **Exit** button.
4. On click:
   - Disable only that button.
   - Show `Exiting...`.
   - Call `exitPosition(position)`.
   - On success, show `Exit order placed` and refresh `getActivePositions()`.
   - On failure, show the exact backend error.

## Error Messages to Show

- `Dhan credentials not configured` → User must connect Dhan first.
- `IP_WHITELIST_PENDING` → Show the VPS IP from response and tell user to whitelist it in Dhan.
- `TOKEN_EXPIRED` → User must reconnect/refresh Dhan access token.
- `OUTDATED_VPS_SERVER` → Dedicated VPS order server needs update/restart.
- `Unauthorized` → Supabase session expired; login again.

## Do Not Do This

- Do not call `/broker/oauth/verify` on position screen load.
- Do not call the VPS IP directly from RN.
- Do not send `userId` in the body.
- Do not use `POST /place-order` for manual exit; use `/execute-dhan-order`.
- Do not use `BUY` for exit; manual close must send `transactionType: "SELL"` for open BUY option positions.

## Expected Success Response

```json
{
  "success": true,
  "orderId": "...",
  "status": "PLACED",
  "message": "Order placed successfully"
}
```