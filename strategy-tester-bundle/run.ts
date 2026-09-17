/**
 * Strategy tester runner.
 *
 *   deno run -A run.ts
 *   FROM=2026-01-01 TO=2026-09-10 CAP=1000000 INDICES=NIFTY,BANKNIFTY deno run -A run.ts
 *
 * Downloads real 15-minute candles and replays the production strategy.
 */
import { runStrategyBacktest, type IndexName } from "./src/strategy_backtest.tsx";
import { STRATEGY_RULES } from "./src/strategy_rules.ts";

const env = (k: string, d: string) =>
  (typeof process !== "undefined" ? process.env?.[k] : (globalThis as any).Deno?.env.get(k)) || d;

const fromDate = env("FROM", "2026-08-01");
const toDate = env("TO", "2026-09-10");
const initialCapital = Number(env("CAP", "1000000"));
const indices = env("INDICES", "NIFTY,BANKNIFTY,SENSEX").split(",") as IndexName[];

console.log("Rules:", STRATEGY_RULES);
console.log(`Running ${indices.join(", ")}  ${fromDate} → ${toDate}  ₹${initialCapital}\n`);

const r: any = await runStrategyBacktest({ indices, initialCapital, fromDate, toDate });

const s: any = r.summary ?? r;
console.log("Trades       :", s.totalTrades ?? 0);
console.log("Win rate     :", `${(s.winRate ?? 0).toFixed(1)}%`);
console.log("Profit factor:", (s.profitFactor ?? 0).toFixed(2));
console.log("Net P&L      :", `₹${Math.round(s.netPnL ?? s.netPnl ?? 0).toLocaleString("en-IN")}`);
console.log("Max drawdown :", `₹${Math.round(s.maxDrawdown ?? 0).toLocaleString("en-IN")}`);
console.log("\nMonthly:");
for (const m of r.monthly ?? []) {
  console.log(" ", m.period ?? m.month, "→", `₹${Math.round(m.pnl).toLocaleString("en-IN")}`, `(${m.trades} trades)`);
}
