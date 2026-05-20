// Real backtest using TODAY'S live 15m candles fetched fresh from Yahoo Finance.
// Walks bar-by-bar through the actual AdvancedAI.generateAdvancedSignal engine.
// Includes 4 prior trading days so the 30-bar warmup is satisfied before today's open.
import { AdvancedAI } from "./advanced_ai.tsx";
import { NIFTY_5D, BANKNIFTY_5D } from "./today_data.ts";

const TODAY = "2026-05-20";

function toCandles(raw: any[]) {
  return raw.map((r) => ({
    timestamp: r[0],
    open: r[2], high: r[3], low: r[4], close: r[5],
    volume: 100000 + Math.abs(r[5] - r[2]) * 1000, // synth volume (Yahoo gives 0 for indices)
  }));
}
const isToday = (raw: any[], i: number) => String(raw[i][1]).startsWith(TODAY);

interface OpenTrade {
  entryBar: number; entryTime: string; action: string;
  entry: number; sl: number; tgt: number; lots: number; premium: number;
}

function runBacktest(symbol: string, raw: any[], capital: number) {
  const allCandles = toCandles(raw);
  let cash = capital;
  let open: OpenTrade | null = null;
  const trades: any[] = [];
  const signals: any[] = [];
  const lotSize = symbol === "NIFTY" ? 75 : 35;

  for (let i = 30; i < allCandles.length; i++) {
    if (!isToday(raw, i)) continue;
    const window = allCandles.slice(0, i + 1);
    const bar = allCandles[i];
    const barTime = String(raw[i][1]).slice(11);

    // 1) Manage open trade
    if (open) {
      let exitPrice: number | null = null, reason = "";
      const isCall = open.action === "BUY_CALL";
      if (isCall) {
        if (bar.low <= open.sl) { exitPrice = open.sl; reason = "SL"; }
        else if (bar.high >= open.tgt) { exitPrice = open.tgt; reason = "TGT"; }
      } else {
        if (bar.high >= open.sl) { exitPrice = open.sl; reason = "SL"; }
        else if (bar.low <= open.tgt) { exitPrice = open.tgt; reason = "TGT"; }
      }
      // EOD force exit on last bar of today
      const lastTodayIdx = (() => { for (let k = allCandles.length - 1; k >= 0; k--) if (isToday(raw, k)) return k; return -1; })();
      if (!exitPrice && i === lastTodayIdx) { exitPrice = bar.close; reason = "EOD"; }
      if (exitPrice !== null) {
        const underMove = isCall ? exitPrice - open.entry : open.entry - exitPrice;
        const premMove = underMove * 0.5; // 0.5 delta ATM approx
        const pnl = premMove * open.lots * lotSize;
        cash += pnl;
        trades.push({
          entryTime: open.entryTime, exitTime: barTime, action: open.action,
          entry: open.entry.toFixed(2), exit: exitPrice.toFixed(2),
          sl: open.sl.toFixed(2), tgt: open.tgt.toFixed(2),
          underMove: underMove.toFixed(2), reason,
          lots: open.lots, pnl: Math.round(pnl), cashAfter: Math.round(cash),
        });
        open = null;
      }
    }

    // 2) Get fresh signal
    const sig = AdvancedAI.generateAdvancedSignal(window, cash);
    if (sig.action !== "WAIT") {
      signals.push({ time: barTime, action: sig.action, conf: sig.confidence,
        regime: sig.marketRegime?.type, entry: sig.riskManagement.suggestedEntry.toFixed(2),
        sl: sig.riskManagement.suggestedStopLoss.toFixed(2),
        tgt: sig.riskManagement.suggestedTarget.toFixed(2) });
    }

    // 3) Open new position (block after 15:00, no overlap)
    const hh = parseInt(barTime.split(":")[0]);
    if (!open && sig.action !== "WAIT" && hh < 15) {
      const rm = sig.riskManagement;
      const entry = bar.close;
      const premium = entry * 0.012;
      const riskRupees = cash * 0.02;
      const slDist = Math.abs(entry - rm.suggestedStopLoss) * 0.5;
      const qty = Math.floor(riskRupees / Math.max(slDist, 1));
      const lots = Math.max(1, Math.floor(qty / lotSize));
      if (lots * lotSize * premium > cash * 0.5) continue;
      open = { entryBar: i, entryTime: barTime, action: sig.action,
        entry, sl: rm.suggestedStopLoss, tgt: rm.suggestedTarget, lots, premium };
    }
  }

  return { trades, signals, finalCash: cash, pnl: cash - capital };
}

Deno.test("BACKTEST TODAY 2026-05-20 — NIFTY + BANKNIFTY with ₹100000", () => {
  const CAP = 50000;
  console.log("\n" + "=".repeat(74));
  console.log("📊 REAL BACKTEST — Today's Live 15m Candles (Yahoo, fresh fetch)");
  console.log("💰 Capital: ₹100,000 split (₹50k NIFTY + ₹50k BANKNIFTY)");
  console.log("🔧 Engine: actual deployed AdvancedAI.generateAdvancedSignal");
  console.log("=".repeat(74));

  const out: any[] = [];
  for (const [sym, data] of [["NIFTY", NIFTY_5D], ["BANKNIFTY", BANKNIFTY_5D]] as const) {
    const r = runBacktest(sym, data as any, CAP);
    console.log(`\n━━━━━━━━━━━━━━━━━━ ${sym} ━━━━━━━━━━━━━━━━━━`);
    console.log(`Non-WAIT signals fired today (${r.signals.length}):`);
    for (const s of r.signals) {
      console.log(`  ${s.time}  ${s.action.padEnd(8)} conf=${s.conf}%  regime=${s.regime}  entry=${s.entry} SL=${s.sl} TGT=${s.tgt}`);
    }
    console.log(`\nExecuted trades (${r.trades.length}):`);
    for (const t of r.trades) {
      console.log(`  ${t.entryTime}→${t.exitTime}  ${t.action}  entry=${t.entry} → exit=${t.exit} [${t.reason}]  underMove=${t.underMove}  lots=${t.lots}  P&L=₹${t.pnl}`);
    }
    console.log(`💼 ${sym}: ₹${CAP} → ₹${Math.round(r.finalCash)}  |  P&L: ₹${Math.round(r.pnl)}`);
    out.push({ sym, ...r });
  }

  const tot = out.reduce((s, r) => s + r.pnl, 0);
  const totFinal = out.reduce((s, r) => s + r.finalCash, 0);
  const tt = out.reduce((s, r) => s + r.trades.length, 0);
  const wins = out.flatMap(r => r.trades).filter((t: any) => t.pnl > 0).length;

  console.log("\n" + "=".repeat(74));
  console.log("📈 FINAL REPORT — Trading Day " + TODAY);
  console.log("=".repeat(74));
  console.log(`💰 Starting Capital:  ₹100,000`);
  console.log(`💰 Ending Capital:    ₹${Math.round(totFinal)}`);
  console.log(`📊 Total P&L:         ₹${Math.round(tot)}  (${(tot/1000).toFixed(2)}%)`);
  console.log(`📊 Trades Taken:      ${tt}`);
  console.log(`📊 Wins / Losses:     ${wins} / ${tt - wins}`);
  console.log(`📊 Win Rate:          ${tt ? Math.round(wins*100/tt) : 0}%`);
  console.log("=".repeat(74) + "\n");
});
