# 🔁 Ready-made prompt: add ANY new broker (copy → fill 2 fields → paste in chat)

You only fill **Broker name** and the **documentation URLs**.
Everything else below is already written so nothing has to be explained again.

---

## ✂️ COPY FROM HERE

```
Integrate a new broker into IndexPilot exactly like Dhan / Zerodha / Groww / Upstox.

BROKER NAME: <<BROKER NAME>>
BROKER ID (lowercase, no spaces): <<brokerid>>
BRAND COLOUR (optional): <<#hex>>

DOCUMENTATION URLS
- Authentication / login / token: <<url>>
- Funds / margin / limits:        <<url>>
- Place order:                    <<url>>
- Order book / order status / cancel: <<url>>
- Positions:                      <<url>>
- Instruments / contract master:  <<url>>
- (optional) LTP / quotes:        <<url>>

Follow docs/BROKER_INTEGRATION_PLAYBOOK.md exactly and do ALL of the following,
without changing or breaking any existing broker (Dhan is the default and must stay untouched):

1. DB migration
   - Add <<brokerid>>_* mapping columns to public.instrument_master
     (trading symbol / instrument key / exchange / <<brokerid>>_synced_at).
   - Create public.apply_<<brokerid>>_instruments(_rows jsonb) SECURITY DEFINER merge
     function returning (updated_count, inserted_count), same shape as apply_upstox_instruments.

2. supabase/functions/make-server-c4d79cb7/<<brokerid>>_service.tsx
   - Auth headers / token exchange from the auth doc.
   - getFundLimits() normalized to { availableBalance, sodLimit, collateralAmount, utilizationAmount }.
   - placeOrder() MARKET + DAY, BUY and SELL (exit), product mapped from the Dhan product type.
   - getOrderStatus(), cancelOrder(), getPositions() mapped into the Dhan position shape.
   - getLtp(). Every call must go through makeBrokerProxy(userId, "<<brokerid>>")
     (user's static-IP VPS /broker-request) with direct-API fallback.

3. supabase/functions/make-server-c4d79cb7/<<brokerid>>_instruments.tsx
   - Download the daily contract dump, filter NIFTY / BANKNIFTY / SENSEX options,
     nearest 2 expiries, merge via apply_<<brokerid>>_instruments(), cache once per IST day
     in KV for all users.

4. broker_router.tsx
   - Credentials in KV (<<brokerid>>_credentials:<userId>, never in the DB),
     get<<Broker>>Service(), symbol resolution, and a branch in placeOrderSmart,
     getFundsSmart, getPositionsSmart, getLtpSmart, getOrderStatusSmart, cancelOrderSmart.

5. broker_registry.tsx
   - Add the catalog entry with status: "live", defaultEnabled: true, the brand colour and
     features ["orders","positions","funds","instruments","static-ip", plus "oauth" if used].

6. index.ts endpoints
   /broker/<<brokerid>>/status · save-keys · login-url · callback · verify · disconnect ·
   instruments/status · instruments/sync, plus the <<brokerid>> branch inside
   /fund-limits, /positions, /live-positions and /execute-dhan-order.

7. UI
   - src/app/components/<<Broker>>Connect.tsx — keys / OAuth login / verify / sync contracts /
     disconnect / live balance, same layout as UpstoxConnect.tsx, with the copyable redirect URI
     https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/broker/<<brokerid>>/callback
   - SettingsPanel.tsx — render that card when the broker is active.
   - Landing page (SupportedBrokers), Admin → Broker Control and the React Native app are
     registry-driven: verify they pick the broker up with zero extra code.

8. Rules
   - One user = one active broker; switching wipes the other broker's session and
     downloads this broker's contracts.
   - Dashboard funds, positions, orders, exit button and signal execution must follow the
     active broker automatically.
   - Order latency path (candle watcher, atomic order claim, parallel batches) is shared —
     do not fork it per broker.

9. Deploy the make-server-c4d79cb7 edge function and append a "<<BROKER NAME>> — what is live now"
   section to docs/BROKER_INTEGRATION_PLAYBOOK.md.
```

## ✂️ COPY TO HERE

---

## Example (already done)

```
BROKER NAME: Upstox
BROKER ID: upstox
BRAND COLOUR: #7c3aed
Authentication: https://upstox.com/developer/api-documentation/authentication
Margin:         https://upstox.com/developer/api-documentation/margin
Place order:    https://upstox.com/developer/api-documentation/v3/place-order
Orders:         https://upstox.com/developer/api-documentation/orders
Positions:      https://upstox.com/developer/api-documentation/get-positions
Instruments:    https://upstox.com/developer/api-documentation/instrument
```

Result: see section 2 of `docs/BROKER_INTEGRATION_PLAYBOOK.md`.

## What you never have to ask for again

Landing page, Admin Broker Control, user broker chooser, dashboard fund/position cards,
exit button, signal execution and the React Native app all read the broker registry —
they update automatically for every new broker.
