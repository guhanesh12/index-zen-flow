# Cost estimate: adding one more broker (full integration)

## What "one broker, fully done" means here

Based on how Zerodha Kite was built, a complete broker means all of this:

1. Broker service module (login/session, profile, funds, place order, order status, cancel, positions, LTP/quotes)
2. Router wiring (order / funds / positions / exit / LTP routed by the user's active broker)
3. Instrument sync (download the broker's contract dump, map NIFTY / BANKNIFTY / SENSEX near expiries into `instrument_master`)
4. Registry entry + admin ON/OFF toggle + landing page auto-listing
5. VPS static-IP order path (broker-specific endpoint or the generic `/broker-request` proxy)
6. UI: broker chooser, login/connect card, connected status, funds/positions on dashboard
7. Testing, error handling, token-expiry alerts, redeploy

## Reference: how big Zerodha actually was

- `kite_service.tsx` — 340 lines
- `broker_router.tsx` — 493 lines (shared, now reusable)
- `kite_instruments.tsx` — 223 lines
- `broker_registry.tsx` — 133 lines (shared, now reusable)
- ~106 Kite-related lines in `index.ts`, plus UI changes in Settings, Dashboard, Admin, Landing

## Credit estimate for the NEXT broker

The heavy shared plumbing (router, registry, VPS proxy, broker-agnostic UI, RN contract) already exists, so broker #3 is cheaper than Zerodha was.

| Phase | Work | Credits |
|---|---|---|
| 1 | Broker service module (auth + funds + orders + positions + quotes) | 8 – 12 |
| 2 | Router + endpoint wiring + registry/catalog entry | 4 – 6 |
| 3 | Instrument sync + DB mapping migration | 5 – 8 |
| 4 | VPS static-IP order path support | 3 – 5 |
| 5 | UI (connect card, status, funds/positions, admin toggle, landing) | 4 – 6 |
| 6 | Live testing, error/token-expiry handling, fixes, redeploys | 6 – 10 |

**Total: roughly 30 – 47 credits, typical ~35.**

Notes on the range:
- Low end (~30): broker has clean REST docs and a Kite/Dhan-style token flow.
- High end (~47+): OAuth quirks, binary/websocket-only feeds, odd tradingsymbol format, or an instrument dump needing custom parsing.
- Debugging against a live broker account during market hours is the least predictable part — it is usually where the extra credits go.
- If the same broker also needs RN app doc updates, add 2 – 3 credits.

## Next step

If you tell me which broker is next (Angel One, Upstox, Fyers, 5paisa, ICICI Direct...), I will read its API docs and give a tighter number plus a build plan for that specific broker.
