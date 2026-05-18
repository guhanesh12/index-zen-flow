// Real backtest using the actual AdvancedAI engine on user-provided NIFTY 15m OHLCV
import { AdvancedAI, OHLCCandle } from "./advanced_ai.tsx";

const DATA = {
  open: [23482.2,23373.15,23370.75,23340.8,23362.3,23379.75,23417.8,23464.9,23470.2,23495.8,23534.55,23474.75,23524.15,23553.5,23585,23637.15,23615.5,23618.35,23622.05,23641.25,23624.9,23613.5,23603.35,23591],
  high: [23494.6,23394.95,23372.2,23366.5,23389.45,23439.7,23465.95,23477.75,23519.9,23562.75,23538.25,23525.65,23558.15,23610,23637.9,23661.65,23634.25,23633.5,23659.4,23652,23624.9,23624.25,23607.9,23695.65],
  low: [23363.05,23347.35,23317.1,23339.5,23353.9,23355.55,23389.6,23452.6,23465.85,23494.4,23473.7,23468.35,23513.15,23553.5,23572.65,23592.25,23596.45,23599.15,23604.05,23606.7,23583.85,23582,23581.95,23590.25],
  close: [23373.1,23371.05,23341.15,23362.4,23379.85,23417.2,23465.1,23470.1,23495.8,23534.25,23474.7,23524.75,23553.45,23584.75,23636.9,23615.9,23618.95,23622.4,23640.9,23624.85,23614.35,23602.95,23591.5,23636.3],
  volume: [41501090,19793144,16258854,15506028,13869327,11999214,10324255,10394761,11086546,11690013,9785812,12461159,14152772,14737254,12901425,14794363,10888980,10977321,11572428,11528262,11430589,11912715,13333269,30773511],
};

// Build candles with synthetic 15m IST timestamps starting 09:15
const N = DATA.close.length;
const startTs = Math.floor(new Date("2025-05-15T03:45:00Z").getTime() / 1000); // 09:15 IST
const candles: OHLCCandle[] = [];
for (let i = 0; i < N; i++) {
  candles.push({
    open: DATA.open[i], high: DATA.high[i], low: DATA.low[i],
    close: DATA.close[i], volume: DATA.volume[i],
    timestamp: startTs + i * 900,
  });
}

function fmt(ts: number) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts * 1000));
}

Deno.test("REAL backtest — NIFTY 15m", () => {
  console.log(`\n=========== REAL ENGINE BACKTEST ===========`);
  console.log(`Candles: ${N}  |  Range: ${fmt(candles[0].timestamp)} → ${fmt(candles[N-1].timestamp)}`);
  console.log(`Price: ${candles[0].open} → ${candles[N-1].close} (${(candles[N-1].close - candles[0].open).toFixed(2)} pts)\n`);

  const MIN_WARMUP = 14; // engine needs ~14 for ADX; gracefully skips early
  const rows: any[] = [];
  let lastSignalTs = 0, lastDir: any = 'WAIT';
  for (let i = MIN_WARMUP; i < N; i++) {
    const window = candles.slice(0, i + 1);
    const sig = AdvancedAI.generateAdvancedSignal(window, 100000, {
      timeframeMinutes: 15,
      lastSignalTimestamp: lastSignalTs,
      lastSignalDirection: lastDir,
      minimumBarsBetweenSignals: 2,
      enforceClosedCandle: false,
    });
    if (sig.action !== 'WAIT') { lastSignalTs = candles[i].timestamp; lastDir = sig.action; }
    rows.push({ i, ts: candles[i].timestamp, c: candles[i].close, sig });
  }

  // Print per-bar table
  console.log(`Time   | Close    | Action    | Conf | Regime         | ADX  | RSI  | MACD>Sig | BBpos       | Conf-detail`);
  console.log('-'.repeat(160));
  for (const r of rows) {
    const ind = r.sig.indicators;
    const bb = ind.priceNearUpperBand ? 'NEAR_UPPER' : ind.priceNearLowerBand ? 'NEAR_LOWER' : 'MID';
    const macdUp = ind.macd > ind.macdSignal ? 'BULL' : 'BEAR';
    const conf = r.sig.confirmations;
    console.log(
      `${fmt(r.ts)}  | ${r.c.toFixed(2).padStart(8)} | ${r.sig.action.padEnd(9)} | ${String(r.sig.confidence).padStart(3)}% | ${r.sig.marketRegime.type.padEnd(14)} | ${ind.adx.toFixed(1).padStart(4)} | ${ind.rsi.toFixed(1).padStart(4)} | ${macdUp.padEnd(8)} | ${bb.padEnd(11)} | ${conf.total}/${conf.required}`
    );
  }

  // Per-signal details
  const signals = rows.filter(r => r.sig.action !== 'WAIT');
  console.log(`\n=========== SIGNAL DETAILS (${signals.length}) ===========`);
  for (const r of signals) {
    const rm = r.sig.riskManagement;
    console.log(`\n[${fmt(r.ts)}] ${r.sig.action} @ ${r.c.toFixed(2)}  conf=${r.sig.confidence}%`);
    console.log(`  SL=${rm.suggestedStopLoss}  TP=${rm.suggestedTarget}  RR=${rm.riskRewardRatio}  pos=${rm.positionSize}`);
    console.log(`  Regime: ${r.sig.marketRegime.type}  |  Bias: ${r.sig.bias}  |  EntryQuality: ${r.sig.debugInfo?.entryQualityTier} (${r.sig.debugInfo?.entryQualityScore})`);
    console.log(`  Breakout: ${r.sig.debugInfo?.breakoutQuality}  |  Continuation: ${r.sig.debugInfo?.continuationBull ? 'BULL' : r.sig.debugInfo?.continuationBear ? 'BEAR' : 'NO'}`);
    console.log(`  Confirmations matched: ${r.sig.confirmations.details.join(' | ')}`);
    console.log(`  Reasoning: ${r.sig.reasoning}`);
  }

  // WAIT reasons
  const waits = rows.filter(r => r.sig.action === 'WAIT');
  const blockReasons: Record<string, number> = {};
  for (const r of waits) {
    const blocks: string[] = r.sig.debugInfo?.blockedBy ?? [];
    if (blocks.length === 0) blockReasons['no-block-reason'] = (blockReasons['no-block-reason'] || 0) + 1;
    for (const b of blocks) blockReasons[b] = (blockReasons[b] || 0) + 1;
  }
  console.log(`\n=========== WAIT BLOCK REASONS ===========`);
  for (const [k, v] of Object.entries(blockReasons).sort((a,b)=>b[1]-a[1])) console.log(`  ${k.padEnd(30)} ${v}`);

  // Trade simulation: walk forward intra-candle SL/TP detection on SPOT
  console.log(`\n=========== TRADE SIMULATION (NIFTY options proxy) ===========`);
  const trades: any[] = [];
  let i = 0;
  while (i < signals.length) {
    const e = signals[i];
    const isLong = e.sig.action === 'BUY_CALL';
    const entryIdx = e.i;
    const sl = e.sig.riskManagement.suggestedStopLoss;
    const tp = e.sig.riskManagement.suggestedTarget;
    let exit = e.c, exitIdx = entryIdx, reason = 'EOD';
    for (let k = entryIdx + 1; k < N; k++) {
      const c = candles[k];
      if (isLong) {
        if (c.low <= sl) { exit = sl; reason = 'SL'; exitIdx = k; break; }
        if (c.high >= tp) { exit = tp; reason = 'TP'; exitIdx = k; break; }
      } else {
        if (c.high >= sl) { exit = sl; reason = 'SL'; exitIdx = k; break; }
        if (c.low <= tp) { exit = tp; reason = 'TP'; exitIdx = k; break; }
      }
    }
    const spotPts = isLong ? (exit - e.c) : (e.c - exit);
    // Option proxy: ATM delta ≈ 0.5, 5 lots * 75 = 375 qty
    const premiumMove = spotPts * 0.5;
    const qty = 75 * 5;
    const slippage = 1.5 * qty; // ~1.5 pts premium slippage round-trip
    const pnl = premiumMove * qty - slippage;
    trades.push({
      time: fmt(e.ts), action: e.sig.action, entry: e.c, exit, sl, tp,
      reason, spotPts: +spotPts.toFixed(2), premiumMove: +premiumMove.toFixed(2),
      pnl: +pnl.toFixed(2), exitTime: fmt(candles[exitIdx].timestamp), conf: e.sig.confidence,
    });
    // Skip forward past this trade
    while (i < signals.length && signals[i].i <= exitIdx) i++;
  }

  let capital = 100000, peak = 100000, maxDD = 0;
  let wins = 0, losses = 0, totalPnL = 0, grossWin = 0, grossLoss = 0;
  for (const t of trades) {
    capital += t.pnl;
    if (capital > peak) peak = capital;
    const dd = peak - capital; if (dd > maxDD) maxDD = dd;
    totalPnL += t.pnl;
    if (t.pnl > 0) { wins++; grossWin += t.pnl; } else { losses++; grossLoss += Math.abs(t.pnl); }
    console.log(`  ${t.time} ${t.action} entry=${t.entry} exit=${t.exit} (${t.reason}) spotΔ=${t.spotPts} premΔ=${t.premiumMove}  P&L=₹${t.pnl}  exit@${t.exitTime}`);
  }

  const total = trades.length;
  const winRate = total ? (wins / total) * 100 : 0;
  const avgWin = wins ? grossWin / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;
  const expectancy = total ? (totalPnL / total) : 0;
  const rrRealised = avgLoss > 0 ? avgWin / avgLoss : 0;
  const best = trades.reduce((b, t) => (!b || t.pnl > b.pnl) ? t : b, null as any);
  const worst = trades.reduce((b, t) => (!b || t.pnl < b.pnl) ? t : b, null as any);

  const actionCounts: Record<string, number> = { BUY_CALL: 0, BUY_PUT: 0, WAIT: 0 };
  for (const r of rows) actionCounts[r.sig.action]++;

  console.log(`\n=========== FINAL REPORT ===========`);
  console.log(`Bars analyzed:      ${rows.length}`);
  console.log(`BUY_CALL signals:   ${actionCounts.BUY_CALL}`);
  console.log(`BUY_PUT  signals:   ${actionCounts.BUY_PUT}`);
  console.log(`WAIT signals:       ${actionCounts.WAIT}`);
  console.log(`Trades executed:    ${total}`);
  console.log(`Wins / Losses:      ${wins} / ${losses}`);
  console.log(`Win rate:           ${winRate.toFixed(1)}%`);
  console.log(`Total P&L:          ₹${totalPnL.toFixed(2)}`);
  console.log(`Final capital:      ₹${capital.toFixed(2)}  (start ₹100000)`);
  console.log(`Return:             ${((capital - 100000) / 1000).toFixed(2)}%`);
  console.log(`Max drawdown:       ₹${maxDD.toFixed(2)}`);
  console.log(`Avg win / loss:     ₹${avgWin.toFixed(2)} / ₹${avgLoss.toFixed(2)}`);
  console.log(`Realised RR:        ${rrRealised.toFixed(2)}`);
  console.log(`Expectancy:         ₹${expectancy.toFixed(2)} per trade`);
  if (best) console.log(`Best trade:         ${best.time} ${best.action} ₹${best.pnl}`);
  if (worst) console.log(`Worst trade:        ${worst.time} ${worst.action} ₹${worst.pnl}`);
});
