# RN APP — STRATEGY BACKTEST (USER SIDE) — FULL BUILD PROMPT

Copy-paste this whole file into your React Native agent. It reproduces the web
`StrategyBacktest` feature 1:1 (same API, same flow, same math, same UI blocks).

---

## 0. BACKEND FACTS (do not change)

- Base URL: same value your RN app already uses for every other call
  (`https://<SUPABASE_URL>/functions/v1/make-server-c4d79cb7`, or the custom
  backend URL stored in AsyncStorage key `indexpilotai_custom_backend_url`).
- Auth: every backtest endpoint requires the **user** Supabase access token:
  `Authorization: Bearer <access_token>` + `Content-Type: application/json`.
- Cost: **₹5 per run**, debited from the in-app wallet at `begin` (not at
  finalize). If the run fails, the client MUST call `abort` to get a refund.
- Data source: real 15-minute NIFTY / BANKNIFTY / SENSEX index candles
  (Upstox public historical API on the server). No broker token needed.
- Strategy replayed = the live `IndexPilotAI` engine (`advanced_ai`), including
  the live position-monitor money rules (per-lot ₹6,000 target / ₹3,000 SL,
  ratchet trailing, AI reversal exit, EOD square-off), ATM option premium proxy
  (delta 0.5), and ₹40 per lot round-trip cost (brokerage + taxes + slippage).

### Allowed inputs / server validation

| Field | Type | Rule |
|---|---|---|
| `strategy` | string | only `"indexpilotai"` today |
| `indices` | string[] | subset of `["NIFTY","BANKNIFTY","SENSEX"]`, ≥1 |
| `initialCapital` | number | clamped 10,000 … 50,000,000 |
| `fromDate` / `toDate` | `YYYY-MM-DD` | span **≥ 28 days** and **≤ 370 days** |
| `lots` | `{NIFTY,BANKNIFTY,SENSEX: number}` | each 0…50 (0 = auto risk sizing) |
| `maxTradesPerDay` | number | 0…20 (0 = unlimited) |
| `minConfidence` | number | 0…95 |

Lot sizes (display only): `NIFTY 75`, `BANKNIFTY 35`, `SENSEX 20`.

---

## 1. API ENDPOINTS (exact)

### 1.1 `GET /wallet/balance`
Response: `{ balance: number, ... }` → show wallet chip.

### 1.2 `POST /backtest/strategy/begin`
Body:
```json
{ "strategy":"indexpilotai", "indices":["NIFTY","BANKNIFTY","SENSEX"],
  "initialCapital":1000000, "fromDate":"2025-09-05", "toDate":"2026-09-03",
  "lots":{"NIFTY":1,"BANKNIFTY":1,"SENSEX":1},
  "maxTradesPerDay":2, "minConfidence":70 }
```
Response:
```json
{ "success":true, "runId":"1757..._ab12cd",
  "tasks":[{"index":"NIFTY","from":"2025-09-05","to":"2025-10-20"}, ...],
  "walletBalance": 495, "cost": 5 }
```
Errors: `401` unauthorized, `400` invalid range / no index,
`402` insufficient wallet (`Insufficient wallet balance. Backtest costs ₹5…`).

Server slices the range into 45-day chunks × each selected index → `tasks`.

### 1.3 `POST /backtest/strategy/segment`
Body: `{ runId, index, from, to }` (spread one `task`).
Response: `{ success:true, trades: <count> }`.
`404 Backtest session expired, please run again` → abort + tell user to rerun.
Each segment is one CPU-safe unit; run them with **concurrency 3**.

### 1.4 `POST /backtest/strategy/finalize`
Body: `{ runId }` → `{ success:true, report: BacktestResult, walletBalance }`.
Also persists the run into `strategy_backtests` (history + admin view).

### 1.5 `POST /backtest/strategy/abort`
Body: `{ runId }` → `{ success:true, refunded:true, walletBalance }`.
Idempotent: refunds ₹5 only once. Call on ANY failure after `begin`,
and also on screen unmount / app background while a run is in flight.

### 1.6 `GET /backtest/strategy/history`
→ `{ success:true, runs:[{ id, strategy, indices, initial_capital, from_date,
to_date, cost, summary, by_index, created_at }] }` (latest 30).

### 1.7 `GET /backtest/strategy/run/:id`
→ `{ success:true, run:{ ...row, report:{ daily, weekly, monthly, yearly,
equityCurve, trades } } }` (own runs only for normal users).

### 1.8 (single-shot, optional) `POST /backtest/strategy/run`
Same body as `begin` minus lots/filters; runs everything in one request and
returns `{ report }`. **Do not use in RN** — long ranges hit the CPU limit.
Use begin → segment → finalize.

---

## 2. RESPONSE SHAPES

```ts
type IndexName = "NIFTY" | "BANKNIFTY" | "SENSEX";

interface BTTrade {
  index: IndexName;
  direction: "BUY_CALL" | "BUY_PUT";
  date: string;        // IST YYYY-MM-DD
  entryTime: string; exitTime: string;
  entryPrice: number; exitPrice: number;
  lots: number; qty: number;
  premiumEntry: number; premiumExit: number;
  pnl: number;         // net ₹ after costs
  confidence: number;  // 0-100
  reason: string;      // TARGET | STOP_LOSS | TRAIL | AI_REVERSAL | EOD | OPEN_AT_END
}

interface BacktestResult {
  strategy: string; indices: IndexName[];
  fromDate: string; toDate: string;
  initialCapital: number; finalCapital: number;
  summary: {
    totalTrades, wins, losses, winRate,
    netPnL, roi, profitFactor, maxDrawdown,
    avgWin, avgLoss, bestTrade, worstTrade,
    tradingDays, profitDays, lossDays, flatDays, dayWinRate,
    avgDaily, avgWeekly, avgMonthly, projectedYearly
  };
  daily:   { period: string; pnl: number; trades: number }[];
  weekly:  same shape (period = Monday of the week);
  monthly: same shape (period = "YYYY-MM");
  yearly:  same shape (period = "YYYY");
  byIndex: { index: IndexName; trades: number; wins: number; winRate: number; pnl: number }[];
  equityCurve: { date: string; equity: number }[];
  trades: BTTrade[];   // last 500
}
```
Notes: `avgWeekly = avgDaily×5`, `avgMonthly = avgDaily×21`,
`projectedYearly = avgDaily×250` (server computed — never recompute on client).

---

## 3. RUN FLOW (implement exactly)

```
user taps "Run Backtest — ₹5"
 ├─ validate: ≥1 index selected, capital ≥ 10,000
 ├─ POST /backtest/strategy/begin       → runId, tasks[], walletBalance
 ├─ setWallet(walletBalance); progress = 0
 ├─ 3 parallel workers pull from tasks queue:
 │     POST /backtest/strategy/segment { runId, ...task }
 │     done++ ; progress = round(done / tasks.length * 100)
 ├─ POST /backtest/strategy/finalize { runId } → report, walletBalance
 ├─ setReport(report); refresh history
 └─ on ANY throw after begin:
        POST /backtest/strategy/abort { runId }
        if refunded → append " — ₹5 refunded to your wallet." to the error
```

Date defaults from the duration chips:
`fromDate = todayMinus(durationDays)`, `toDate = todayMinus(1)`
(`new Date(Date.now() - d*86400000).toISOString().slice(0,10)`).

Error handling helper (mirror of web):
```ts
const post = async (path: string, payload: any) => {
  const res = await fetch(`${baseUrl}${path}`, { method:'POST', headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let data: any = {}; try { data = JSON.parse(text); } catch {}
  if (!res.ok || !data.success) throw new Error(data.error || `Backtest failed (HTTP ${res.status})`);
  return data;
};
```
Keep the screen awake (`expo-keep-awake`) while running; a 1-year × 3-index run
is ~24 segments and can take ~30–60 s.

---

## 4. SCREEN / UI SPEC (dark theme, zinc-900/950 surfaces, emerald + blue accents)

### 4.1 Config card — "Strategy Backtest"
- Header: flask icon + title, subtitle "Replay the live IndexPilotAI strategy on
  real NIFTY, BANKNIFTY & SENSEX market data."
- Right chips: amber `₹5 per run` + wallet chip `₹<balance>`.
- **Strategy selector**: one card `IndexPilotAI Strategy` (badge `DEFAULT`,
  desc "Default multi-confirmation AI engine (live strategy)"), selected style
  emerald border + emerald/10 bg.
- **Investment Amount (₹)**: numeric input (min 10000, step 10000) + quick
  chips `₹1,00,000 / ₹5,00,000 / ₹10,00,000 / ₹25,00,000`. Default 1,000,000.
- **Duration** (min 1 month · max 1 year): 2×2 chips
  `1 Month(30) / 3 Months(91) / 6 Months(182) / 1 Year(365)`. Default 365.
- **Indices & Lots per trade**: 3 tiles. Tap name toggles selection
  (`✓ NIFTY`); each tile has a Lots input (1–50, disabled when unselected) and
  caption `× 75 qty` / `× 35 qty` / `× 20 qty`. Default all selected, 1 lot each.
- **Max trades per day (per index)**: chips `1 / 2 / 3 / 5 / Unlimited(0)`,
  default 2. Helper: "Fewer trades per day = less churn. Total daily trades ≈
  selected indices × this limit."
- **Minimum signal confidence — {n}%**: slider 0…90 step 5, default 70. Helper:
  "Higher = only the strongest setups are traded (fewer trades, usually better
  win rate)."
- **Run button**: full width gradient emerald→blue, label
  `Run Backtest — ₹5`; while loading `Running backtest… {progress}%` + spinner,
  disabled, plus a gradient progress bar (min width 4%) and caption
  "Fetching 15-minute candles and replaying every signal. Longer durations can
  take up to a minute."
- **Error banner**: red/10 bg, red/30 border, red text.

### 4.2 Results (render only when `report.summary` exists)
1. **4 stat cards**: Net Profit (`₹netPnL`, sub `ROI x%`, green/red),
   Win Rate (`x%`, sub `W/L`), Profit Days (sub `dayWinRate% of tradingDays days`),
   Loss Days (sub `Flat n`).
2. **Earnings Projection on ₹<initialCapital>**: Daily / Weekly / Monthly /
   Yearly (projected) averages.
3. **P&L Breakdown** card with segmented switch `daily | weekly | monthly | yearly`
   (default `monthly`): horizontal bar rows, newest first, bar width =
   `max(3, |pnl| / maxAbs * 100)%`, green for ≥0 else red. Empty →
   "No trades in this period."
4. **Index Performance** card: per index `pnl`, `trades · winRate%`, plus mini
   stats grid: Profit Factor, Max Drawdown, Avg Win, Avg Loss, Best Trade,
   Worst Trade.
5. **Recent Trades (n)** table, newest first: Index | Side (CALL green /
   PUT red) | Entry | Exit | Lots | P&L. Add a **CSV** export button.
6. Disclaimer: "Backtests simulate ATM option trades from real index candles
   including brokerage, taxes and slippage. Past performance does not guarantee
   future returns."

### 4.3 My Backtest History (when `runs.length > 0`)
Row: `from_date → to_date`, sub `₹capital · indices · n trades`;
right: `₹summary.netPnL` (green/red) + `summary.winRate% win`.
Tap → open detail using `GET /backtest/strategy/run/:id`.

---

## 5. RN IMPLEMENTATION NOTES

- Charts: use `react-native-svg` / `victory-native` for the equity curve; the
  P&L breakdown can stay as simple `View` bars (no chart lib needed).
- CSV export: build the same rows
  `["Index","Direction","Entry","Exit","Lots","P&L","Reason"]`, write with
  `expo-file-system` to
  `IndexPilotAI_Backtest_<fromDate>_<toDate>.csv`, then `expo-sharing`.
- Currency format: `₹${Math.round(n).toLocaleString("en-IN")}`.
- Store nothing about the run locally except the in-flight `runId` (needed for
  abort after a crash/relaunch); clear it after finalize or abort.
- Suggested file layout:
  `src/api/backtestApi.ts` (all 7 calls), `src/hooks/useBacktestRun.ts`
  (begin/segment/finalize/abort state machine + progress),
  `src/screens/BacktestScreen.tsx`, `src/screens/BacktestDetailScreen.tsx`,
  `src/components/backtest/*` (StatCard, Projection, MiniStat, PnLBars,
  IndexPerformance, TradesTable, HistoryList).

### Hook contract
```ts
useBacktestRun() => {
  loading: boolean; progress: number; error: string;
  report: BacktestResult | null; wallet: number | null;
  history: HistoryRow[];
  run(config): Promise<void>;   // begin → segments(3x) → finalize, abort on error
  cancel(): Promise<void>;      // abort + refund
  loadHistory(): Promise<void>;
}
```

### Acceptance checklist
- [ ] ₹5 debited once at begin; wallet chip updates immediately.
- [ ] Progress reaches 100% before finalize is called.
- [ ] Any failure triggers abort → ₹5 refunded → error text mentions the refund.
- [ ] Leaving the screen mid-run aborts and refunds.
- [ ] Range < 1 month or > 1 year shows the server error, no debit.
- [ ] Report numbers are shown as returned (no client recomputation).
- [ ] History reloads after every successful run.
