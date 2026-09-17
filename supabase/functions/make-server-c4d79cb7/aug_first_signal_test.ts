// August 2026 backtest — first signal of each day only, NIFTY, 5 lots, ₹1,00,000 capital.
import { AdvancedAI } from "./advanced_ai.tsx";
import { NIFTY_ALL } from "./aug_data.ts";

const LOT = 65, LOTS = 5, QTY = LOT * LOTS, DELTA = 0.5;

Deno.test("AUGUST 2026 — first signal per day, NIFTY 5 lots", () => {
  const candles = NIFTY_ALL.map((r: any) => ({
    timestamp: r[0], date: r[1], open: r[2], high: r[3], low: r[4], close: r[5],
    volume: 100000 + Math.abs(r[5] - r[2]) * 1000,
  }));
  const days = [...new Set(candles.filter(c => c.date.startsWith("2026-08")).map(c => c.date.slice(0, 10)))].sort();

  let capital = 100000, wins = 0, losses = 0;
  const rows: string[] = [];

  for (const day of days) {
    const idxs = candles.map((c, i) => [c, i] as const).filter(([c]) => c.date.startsWith(day)).map(([, i]) => i);
    if (!idxs.length) continue;
    let taken = false;
    for (const i of idxs) {
      if (taken) break;
      const sig = AdvancedAI.generateAdvancedSignal(candles.slice(0, i + 1), capital);
      if (sig.action === "WAIT") continue;
      taken = true;
      const isCall = sig.action === "BUY_CALL";
      const entry = candles[i].close;
      const sl = sig.riskManagement.suggestedStopLoss;
      const tgt = sig.riskManagement.suggestedTarget;
      let exit = entry, reason = "EOD", exitTime = candles[idxs[idxs.length - 1]].date;
      for (const k of idxs.filter(k => k > i)) {
        const b = candles[k];
        if (isCall) {
          if (b.low <= sl) { exit = sl; reason = "SL"; exitTime = b.date; break; }
          if (b.high >= tgt) { exit = tgt; reason = "TGT"; exitTime = b.date; break; }
        } else {
          if (b.high >= sl) { exit = sl; reason = "SL"; exitTime = b.date; break; }
          if (b.low <= tgt) { exit = tgt; reason = "TGT"; exitTime = b.date; break; }
        }
        exit = b.close; exitTime = b.date;
      }
      const move = isCall ? exit - entry : entry - exit;
      const pnl = move * DELTA * QTY;
      capital += pnl;
      pnl >= 0 ? wins++ : losses++;
      rows.push(`${day}  ${candles[i].date.slice(11)}  ${sig.action.padEnd(8)} conf=${String(sig.confidence).padStart(3)}%  entry=${entry.toFixed(0)} exit=${exit.toFixed(0)} [${reason} @${exitTime.slice(11)}]  idxMove=${move.toFixed(1)}  P&L=₹${Math.round(pnl)}  cap=₹${Math.round(capital)}`);
    }
    if (!taken) rows.push(`${day}  — no signal —`);
  }

  console.log("\n" + "=".repeat(96));
  console.log("AUGUST 2026 BACKTEST — NIFTY only | first signal of each day | 5 lots (325 qty) | ₹1,00,000");
  console.log("=".repeat(96));
  rows.forEach(r => console.log(r));
  const total = capital - 100000;
  console.log("-".repeat(96));
  console.log(`Trades: ${wins + losses} | Wins: ${wins} | Losses: ${losses} | Win rate: ${wins + losses ? Math.round(wins * 100 / (wins + losses)) : 0}%`);
  console.log(`Total P&L: ₹${Math.round(total)}  | Return: ${(total / 1000).toFixed(2)}%  | Ending capital: ₹${Math.round(capital)}`);
  console.log("=".repeat(96) + "\n");
});
