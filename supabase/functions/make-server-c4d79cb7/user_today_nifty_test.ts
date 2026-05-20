// Backtest USER-PROVIDED NIFTY today candles through the real AdvancedAI engine.
import { AdvancedAI } from "./advanced_ai.tsx";
import { NIFTY_5D } from "./today_data.ts";

const USER = {
  open:[23457.25,23477.55,23523.25,23541.8,23500.3,23519.9,23532.95,23546.75,23561.75,23599.95,23605.3,23609.1,23580,23588.6,23603.4,23612.45,23601.5,23567.5,23596.4,23628.05,23652.25,23665.45,23677.75,23680.1,23668.05,23659],
  high:[23481.95,23536.9,23548.6,23546.65,23519.9,23576.15,23549.35,23582.6,23602.75,23618.15,23640.25,23613.65,23608.45,23606.45,23615.4,23617.05,23603.95,23620.9,23628.15,23664.4,23678.95,23681.55,23690.9,23680.75,23672.35,23659],
  low:[23397.3,23473.5,23511.95,23486.1,23475.65,23519.9,23503.65,23546.75,23558.3,23588.5,23604.9,23577,23579.5,23583.05,23598.7,23588.75,23561.85,23565.8,23588.55,23623.25,23641.95,23652.6,23673.65,23639.6,23651.4,23659],
  close:[23476.95,23524.25,23541.9,23500.55,23519.9,23532.7,23546.4,23562.2,23599.85,23605.05,23608.15,23579.95,23588,23602.8,23612.75,23601.4,23567.1,23595.85,23628.15,23651.95,23665.35,23677.6,23679.15,23667.9,23664.15,23659],
  volume:[33756047,17835910,12810051,14295901,10176039,13745671,12972932,13849041,9955630,11032129,9332510,10175403,7826445,9225047,8108365,10643144,11813047,11061024,8323952,14013345,11745938,12843613,12390782,24049362,28389421,0],
  timestamp:[1779248700,1779249600,1779250500,1779251400,1779252300,1779253200,1779254100,1779255000,1779255900,1779256800,1779257700,1779258600,1779259500,1779260400,1779261300,1779262200,1779263100,1779264000,1779264900,1779265800,1779266700,1779267600,1779268500,1779269400,1779270300,1779271200],
};

function fmtIST(ts:number){
  const d=new Date(ts*1000);
  const h=String((d.getUTCHours()+5+Math.floor((d.getUTCMinutes()+30)/60))%24).padStart(2,"0");
  const m=String((d.getUTCMinutes()+30)%60).padStart(2,"0");
  return `${h}:${m}`;
}

// Build warmup from prior days in NIFTY_5D (exclude today 2026-05-20 if present)
const warmup = NIFTY_5D
  .filter(r => !String(r[1]).startsWith("2026-05-20"))
  .map(r => ({ timestamp: r[0] as number, open: r[2] as number, high: r[3] as number, low: r[4] as number, close: r[5] as number, volume: 200000 }));

const todayCandles = USER.timestamp.map((ts,i)=>({
  timestamp: ts, open: USER.open[i], high: USER.high[i], low: USER.low[i],
  close: USER.close[i], volume: USER.volume[i] || 100000,
}));

const all = [...warmup, ...todayCandles];
const todayStart = warmup.length;

Deno.test("USER NIFTY TODAY — real AdvancedAI backtest", () => {
  const CAP = 100000;
  let cash = CAP;
  const lot = 75;
  type Open = { i:number; t:string; action:string; entry:number; sl:number; tgt:number; lots:number };
  let open: Open | null = null;
  const trades:any[]=[], sigs:any[]=[];

  console.log("\n" + "=".repeat(78));
  console.log("📊 REAL BACKTEST — User-provided NIFTY 15m candles for TODAY");
  console.log(`💰 Capital ₹${CAP}  |  Lot ${lot}  |  Engine: AdvancedAI.generateAdvancedSignal`);
  console.log(`📅 Today bars: ${todayCandles.length}  |  Warmup bars: ${warmup.length}`);
  console.log("=".repeat(78));

  const lastTodayIdx = all.length - 1;

  for (let i = todayStart; i < all.length; i++) {
    const bar = all[i];
    const t = fmtIST(bar.timestamp);

    // manage open
    if (open) {
      let ex:number|null=null, why="";
      const isCall = open.action === "BUY_CALL";
      if (isCall) {
        if (bar.low <= open.sl) { ex=open.sl; why="SL"; }
        else if (bar.high >= open.tgt) { ex=open.tgt; why="TGT"; }
      } else {
        if (bar.high >= open.sl) { ex=open.sl; why="SL"; }
        else if (bar.low <= open.tgt) { ex=open.tgt; why="TGT"; }
      }
      if (ex===null && i===lastTodayIdx) { ex=bar.close; why="EOD"; }
      if (ex!==null) {
        const move = isCall ? ex-open.entry : open.entry-ex;
        const pnl = Math.round(move * 0.5 * open.lots * lot);
        cash += pnl;
        trades.push({ in:open.t, out:t, act:open.action, entry:open.entry.toFixed(2), exit:ex.toFixed(2), sl:open.sl.toFixed(2), tgt:open.tgt.toFixed(2), why, move:move.toFixed(2), lots:open.lots, pnl, cash:Math.round(cash) });
        open = null;
      }
    }

    const window = all.slice(0, i+1);
    const sig = AdvancedAI.generateAdvancedSignal(window, cash);
    const adx = sig.indicators?.adx?.toFixed(1) ?? "-";
    const rsi = sig.indicators?.rsi?.toFixed(1) ?? "-";
    if (sig.action !== "WAIT") {
      sigs.push({ t, action: sig.action, conf: sig.confidence, regime: sig.marketRegime?.type, entry: sig.riskManagement.suggestedEntry, sl: sig.riskManagement.suggestedStopLoss, tgt: sig.riskManagement.suggestedTarget, adx, rsi });
    }

    const hh = parseInt(t.split(":")[0]);
    if (!open && sig.action !== "WAIT" && hh < 15) {
      const rm = sig.riskManagement;
      const entry = bar.close;
      const slDist = Math.max(1, Math.abs(entry - rm.suggestedStopLoss) * 0.5);
      const riskRupees = cash * 0.02;
      const qty = Math.floor(riskRupees / slDist);
      const lots = Math.max(1, Math.floor(qty / lot));
      open = { i, t, action: sig.action, entry, sl: rm.suggestedStopLoss, tgt: rm.suggestedTarget, lots };
    }
  }

  console.log(`\n━━━ NON-WAIT SIGNALS (${sigs.length}) ━━━`);
  for (const s of sigs) {
    console.log(`  ${s.t}  ${s.action.padEnd(9)} conf=${String(s.conf).padStart(3)}%  ADX=${s.adx} RSI=${s.rsi}  regime=${s.regime}  entry=${s.entry?.toFixed?.(2)} SL=${s.sl?.toFixed?.(2)} TGT=${s.tgt?.toFixed?.(2)}`);
  }
  if (!sigs.length) console.log("  (none — engine WAITed every bar)");

  console.log(`\n━━━ EXECUTED TRADES (${trades.length}) ━━━`);
  for (const t of trades) {
    console.log(`  ${t.in}→${t.out}  ${t.act}  entry=${t.entry} exit=${t.exit} [${t.why}] SL=${t.sl} TGT=${t.tgt} underMove=${t.move} lots=${t.lots}  P&L=₹${t.pnl}  cash=₹${t.cash}`);
  }

  const wins = trades.filter(t=>t.pnl>0).length;
  const pnl = cash - CAP;
  console.log("\n" + "=".repeat(78));
  console.log("📈 FINAL REPORT");
  console.log("=".repeat(78));
  console.log(`Starting:  ₹${CAP}`);
  console.log(`Ending:    ₹${Math.round(cash)}`);
  console.log(`P&L:       ₹${Math.round(pnl)}  (${(pnl/CAP*100).toFixed(2)}%)`);
  console.log(`Trades:    ${trades.length}  |  Wins ${wins} / Losses ${trades.length-wins}  |  WinRate ${trades.length?Math.round(wins*100/trades.length):0}%`);
  console.log("=".repeat(78) + "\n");
});
