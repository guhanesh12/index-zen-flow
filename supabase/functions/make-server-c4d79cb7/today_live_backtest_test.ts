// Real backtest using TODAY'S live NIFTY + BANKNIFTY 15m candles
// (fetched fresh from Yahoo Finance, no DB logs). Walks bar-by-bar
// through the actual deployed AdvancedAI.generateAdvancedSignal engine.
import { AdvancedAI } from "./advanced_ai.tsx";

// Today's actual NIFTY 50 15m candles (2026-05-20 IST)
const NIFTY: any[] = [
  ["09:15",23457.25,23480.90,23403.75,23477.55],["09:30",23476.95,23536.40,23473.50,23524.25],
  ["09:45",23523.25,23548.50,23511.95,23541.90],["10:00",23541.80,23546.65,23486.10,23500.20],
  ["10:15",23500.55,23519.90,23475.65,23519.90],["10:30",23519.90,23576.05,23519.90,23532.75],
  ["10:45",23532.70,23549.35,23503.65,23546.25],["11:00",23546.40,23582.25,23546.40,23562.40],
  ["11:15",23562.20,23602.20,23558.30,23599.10],["11:30",23599.85,23618.05,23588.50,23605.00],
  ["11:45",23605.05,23640.00,23604.90,23608.75],["12:00",23608.15,23613.65,23577.00,23579.95],
  ["12:15",23579.95,23608.45,23579.50,23588.25],["12:30",23588.00,23606.45,23583.05,23603.90],
  ["12:45",23602.80,23615.40,23598.70,23612.65],["13:00",23612.75,23617.05,23588.75,23601.00],
  ["13:15",23601.40,23603.95,23561.85,23566.80],["13:30",23567.10,23620.90,23565.80,23595.10],
  ["13:45",23595.85,23626.90,23588.55,23626.90],["14:00",23628.15,23664.30,23623.25,23651.85],
  ["14:15",23651.95,23678.85,23641.95,23665.90],["14:30",23665.35,23681.55,23652.60,23676.65],
  ["14:45",23677.60,23690.75,23673.65,23679.80],["15:00",23679.15,23680.75,23639.60,23667.75],
  ["15:15",23667.90,23671.05,23651.40,23660.95],
];

const BANKNIFTY: any[] = [
  ["09:15",53013.75,53013.75,52839.40,52955.25],["09:30",52954.90,53041.30,52913.35,52987.15],
  ["09:45",52985.50,53059.60,52942.20,53050.50],["10:00",53049.30,53060.30,52899.75,52968.45],
  ["10:15",52966.85,52992.00,52885.70,52988.70],["10:30",52990.10,53126.15,52984.30,53011.35],
  ["10:45",53012.75,53078.40,52925.50,53070.25],["11:00",53071.55,53254.65,53071.55,53196.75],
  ["11:15",53194.90,53301.85,53185.25,53297.05],["11:30",53297.85,53343.90,53267.70,53283.00],
  ["11:45",53281.80,53410.30,53281.80,53312.80],["12:00",53314.90,53331.10,53228.15,53233.90],
  ["12:15",53236.35,53344.25,53232.90,53263.40],["12:30",53262.95,53301.55,53248.15,53254.40],
  ["12:45",53257.85,53295.35,53225.20,53268.05],["13:00",53264.55,53279.40,53163.60,53210.70],
  ["13:15",53211.10,53221.60,53069.25,53082.35],["13:30",53081.15,53222.40,53074.55,53148.95],
  ["13:45",53150.40,53252.70,53120.40,53252.70],["14:00",53266.55,53432.10,53266.55,53382.30],
  ["14:15",53383.35,53515.30,53366.50,53490.45],["14:30",53487.50,53561.65,53446.45,53520.05],
  ["14:45",53517.65,53606.30,53509.35,53570.50],["15:00",53567.25,53640.70,53461.60,53594.55],
  ["15:15",53594.25,53616.30,53548.55,53605.90],
];

function toCandles(arr: any[]) {
  const baseTs = Math.floor(new Date("2026-05-20T03:45:00Z").getTime() / 1000); // 09:15 IST
  return arr.map((r, i) => ({
    timestamp: baseTs + i * 900,
    open: r[1], high: r[2], low: r[3], close: r[4],
    volume: 100000 + Math.abs(r[4] - r[1]) * 1000,
  }));
}

interface OpenTrade {
  symbol: string; entryBar: number; entryTime: string; action: string;
  entry: number; sl: number; tgt: number; lots: number; premium: number;
}

function runBacktest(symbol: string, raw: any[], capital: number) {
  const allCandles = toCandles(raw);
  let cash = capital;
  let openTrade: OpenTrade | null = null;
  const trades: any[] = [];
  const signals: any[] = [];
  const lotSize = symbol === "NIFTY" ? 75 : 35;

  for (let i = 25; i < allCandles.length; i++) {
    const window = allCandles.slice(0, i + 1);
    const bar = allCandles[i];
    const barTime = raw[i][0];

    // 1) Manage open position - exit on SL/TP touch within this bar
    if (openTrade) {
      let exitPrice: number | null = null, exitReason = "";
      const isCall = openTrade.action === "BUY_CALL";
      if (isCall) {
        if (bar.low <= openTrade.sl) { exitPrice = openTrade.sl; exitReason = "SL"; }
        else if (bar.high >= openTrade.tgt) { exitPrice = openTrade.tgt; exitReason = "TGT"; }
      } else {
        if (bar.high >= openTrade.sl) { exitPrice = openTrade.sl; exitReason = "SL"; }
        else if (bar.low <= openTrade.tgt) { exitPrice = openTrade.tgt; exitReason = "TGT"; }
      }
      // Force exit at 15:15
      if (!exitPrice && i === allCandles.length - 1) {
        exitPrice = bar.close; exitReason = "EOD";
      }
      if (exitPrice !== null) {
        // Approx option premium move ≈ underlying move * delta (0.5 ATM)
        const underlyingMove = isCall ? exitPrice - openTrade.entry : openTrade.entry - exitPrice;
        const premiumMove = underlyingMove * 0.5;
        const pnl = premiumMove * openTrade.lots * lotSize;
        cash += pnl;
        trades.push({
          symbol, action: openTrade.action,
          entryTime: openTrade.entryTime, exitTime: barTime,
          entry: openTrade.entry.toFixed(2), exit: exitPrice.toFixed(2),
          sl: openTrade.sl.toFixed(2), tgt: openTrade.tgt.toFixed(2),
          underlyingMove: underlyingMove.toFixed(2),
          premiumMove: premiumMove.toFixed(2),
          lots: openTrade.lots, exitReason,
          pnl: Math.round(pnl), cashAfter: Math.round(cash),
        });
        openTrade = null;
      }
    }

    // 2) Get fresh signal
    const sig = AdvancedAI.generateAdvancedSignal(window, cash);
    signals.push({ time: barTime, action: sig.action, conf: sig.confidence, regime: sig.marketRegime?.type });

    // 3) Open new position if signal + no open trade + before 15:00
    if (!openTrade && sig.action !== "WAIT" && i < allCandles.length - 1) {
      const rm = sig.riskManagement;
      const entry = bar.close;
      // Assume option premium ≈ 1% of spot for ATM 0-DTE-ish weekly
      const premium = entry * 0.012;
      // Risk per trade: 2% of cash
      const riskRupees = cash * 0.02;
      const slDistanceUnderlying = Math.abs(entry - rm.suggestedStopLoss);
      const slPremiumLoss = slDistanceUnderlying * 0.5; // per unit
      const qty = Math.floor(riskRupees / Math.max(slPremiumLoss, 1));
      const lots = Math.max(1, Math.floor(qty / lotSize));
      const cost = lots * lotSize * premium;
      if (cost > cash * 0.5) continue; // safety
      openTrade = {
        symbol, entryBar: i, entryTime: barTime, action: sig.action,
        entry, sl: rm.suggestedStopLoss, tgt: rm.suggestedTarget,
        lots, premium,
      };
    }
  }

  return { trades, signals, finalCash: cash, pnl: cash - capital };
}

Deno.test("BACKTEST TODAY 2026-05-20 — NIFTY + BANKNIFTY with ₹100000", () => {
  const CAPITAL_PER_SYMBOL = 50000; // split 100000 across 2 symbols
  console.log("\n" + "=".repeat(72));
  console.log("📊 REAL BACKTEST — Today's Live 15m Candles (Yahoo Finance)");
  console.log("💰 Capital: ₹100,000 (₹50,000 NIFTY + ₹50,000 BANKNIFTY)");
  console.log("=".repeat(72));

  const results: any[] = [];
  for (const [sym, data] of [["NIFTY", NIFTY], ["BANKNIFTY", BANKNIFTY]] as const) {
    const r = runBacktest(sym, data, CAPITAL_PER_SYMBOL);
    console.log(`\n━━━━━━━━━━━━━━━━━━ ${sym} ━━━━━━━━━━━━━━━━━━`);
    console.log(`Signals fired per bar (after 25-bar warmup):`);
    for (const s of r.signals) {
      if (s.action !== "WAIT") console.log(`  ${s.time}  ${s.action}  conf=${s.conf}%  regime=${s.regime}`);
    }
    const waitCount = r.signals.filter((s: any) => s.action === "WAIT").length;
    console.log(`  (+ ${waitCount} WAIT bars)`);
    console.log(`\nTrades executed: ${r.trades.length}`);
    for (const t of r.trades) {
      console.log(`  ${t.entryTime}→${t.exitTime}  ${t.action}  entry=${t.entry} sl=${t.sl} tgt=${t.tgt} → exit=${t.exit} (${t.exitReason})  underMove=${t.underlyingMove}  P&L=₹${t.pnl}`);
    }
    console.log(`\n💼 ${sym} Final: ₹${Math.round(r.finalCash)} | P&L: ₹${Math.round(r.pnl)}`);
    results.push({ sym, ...r });
  }

  const totalPnL = results.reduce((s, r) => s + r.pnl, 0);
  const totalFinal = results.reduce((s, r) => s + r.finalCash, 0);
  const totalTrades = results.reduce((s, r) => s + r.trades.length, 0);
  const wins = results.flatMap(r => r.trades).filter((t: any) => t.pnl > 0).length;

  console.log("\n" + "=".repeat(72));
  console.log("📈 FINAL REPORT — Today's Trading Day (2026-05-20)");
  console.log("=".repeat(72));
  console.log(`💰 Starting Capital:  ₹100,000`);
  console.log(`💰 Ending Capital:    ₹${Math.round(totalFinal)}`);
  console.log(`📊 Total P&L:         ₹${Math.round(totalPnL)} (${(totalPnL/1000).toFixed(2)}%)`);
  console.log(`📊 Trades Taken:      ${totalTrades}`);
  console.log(`📊 Wins / Losses:     ${wins} / ${totalTrades - wins}`);
  console.log(`📊 Win Rate:          ${totalTrades ? Math.round(wins*100/totalTrades) : 0}%`);
  console.log("=".repeat(72) + "\n");
});
