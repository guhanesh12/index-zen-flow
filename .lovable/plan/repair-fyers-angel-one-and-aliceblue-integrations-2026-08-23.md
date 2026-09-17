# Repair Fyers, Angel One, and Aliceblue integrations

## Goal
Make each broker authenticate through its supported official flow and provide the same core experience as Dhan: connection status, funds, positions, instrument mapping, order placement, exits, and active-broker routing. Existing Dhan behavior will remain unchanged.

## Implementation

1. **Fyers OAuth v3**
   - Correct the authorize URL, callback parameter handling, app ID formatting, token exchange payload, redirect URI matching, and popup completion messaging.
   - Validate the token against the profile/funds API before marking the broker connected.
   - Handle daily token expiry clearly and preserve saved app credentials for the next login.
   - Verify funds, positions, instrument symbols, order placement/status/cancel, and static-IP proxy routing use the correct Fyers v3 host and authorization format.

2. **Angel One SmartAPI**
   - Correct Client Code + MPIN + TOTP authentication, including normalized Base32 TOTP secrets, broker error parsing, and required SmartAPI headers.
   - Derive token validity from the returned JWT rather than assuming a fixed lifetime; refresh/re-login only when needed.
   - Verify funds, positions, orders, instrument tokens, and static-IP routing against the SmartAPI endpoints.
   - Improve UI validation and display exact actionable errors without exposing secrets.

3. **Aliceblue ANT API**
   - Restore the normal retail User ID + API Key login as the primary path.
   - Keep vendor App Code authentication as a separate optional flow so retail API keys are never sent as vendor keys.
   - Correct session creation, authorization headers, status persistence, funds, positions, order payloads, and static-IP routing.
   - Update the broker card to clearly separate Retail API Key and Vendor App login modes.

4. **Shared broker behavior**
   - Ensure selecting any of the three brokers does not destroy credentials needed to finish its login flow.
   - Mark a broker connected only after a live broker API check succeeds.
   - Keep active broker, dashboard funds/positions, instrument sync, engine order placement, manual exits, and disconnect state consistent.
   - Add safe callback/popup notifications and useful status errors for all three integrations.

5. **Verification**
   - Run focused tests for URL generation, auth exchanges/error parsing, token validity, broker routing, and order payload mapping using mocked broker responses.
   - Check the build, edge-function tests, and browser UI for all three connection cards.
   - No real order will be placed during verification; live credential acceptance still requires valid credentials and matching redirect/static-IP settings in each broker portal.

## Technical notes
- Credentials and tokens remain server-side in the existing encrypted/project credential store; the browser only sends them to authenticated edge routes.
- Official authentication flows differ: Fyers uses OAuth authorization code, Angel One uses MPIN plus TOTP, and Aliceblue retail uses User ID plus API Key while its vendor flow requires an approved vendor App Code.
- Changes are limited to these three broker integrations and shared routing needed for them; Dhan and other broker implementations will not be refactored.
