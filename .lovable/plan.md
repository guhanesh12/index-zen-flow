## Plan

1. **Fix slot save/load authentication**
   - Change `/auto-symbol/config` GET/POST/DELETE to use the logged-in user from `Authorization` instead of relying on `x-user-id` from the UI.
   - Add validation for `slot`, `index_name`, `moneyness`, and `lot_count` so bad saves return a clear error.
   - Update `AutoSymbolConfig` to use the existing authenticated fetch flow and reload saved slots reliably after tab changes.

2. **Fix auto-symbol order selection behavior**
   - In the engine, treat enabled auto slots as a valid symbol source even when manual symbols are empty.
   - If auto slots exist but a contract cannot be resolved, log a clear auto-symbol/instrument-master error instead of telling the user to add a manual symbol.
   - If manual symbols exist and no auto slots exist, keep current manual-symbol execution behavior.
   - If either auto or manual is active, the signal should not be skipped just because the other mode is empty.

3. **Fix dynamic quantity for Dhan orders**
   - Ensure quantity sent to Dhan is `instrument_master.lot_size × selected lot_count`.
   - Example: NIFTY lot size 75 and user selects 2 lots → Dhan order quantity `150`.
   - Store the same quantity in `trading_orders`, `position_monitor_state`, logs, and notifications.

4. **Add backend safety and diagnostics**
   - Add auto-symbol logs showing selected slot, moneyness, strike, security_id, lot_size, lot_count, and final quantity.
   - Keep order payload as Dhan market order format: `securityId`, `exchangeSegment`, `transactionType`, `productType=INTRADAY`, `orderType=MARKET`, `validity=DAY`, `quantity`.

5. **Validate after changes**
   - Test the deployed edge function save endpoint.
   - Confirm DB has a saved `user_symbol_config` row.
   - Confirm `instrument_master` has NIFTY/BANKNIFTY/SENSEX contracts available.
   - Review recent edge function logs for save/order-path errors.