// Backtest user-provided NIFTY 22-May 15m candles through real engine to see why no trade fired.
import { AdvancedAI } from "./advanced_ai.tsx";
import { NIFTY_5D } from "./today_data.ts";

const U = {
  open:[23671.2,23738.6,23753.3,23778.6,23791.65,23761.35,23793,23781.2,23772.45,23758.2,23807.7,23804.9,23798.4,23774.85,23792.95,23828.25,23819.3,23809.1,23801.2,23792.2,23778.25,23739.4,23709.45,23724.65,23718.2,23719.3],
  high:[23756.65,23778.6,23788.8,23800.15,23795.4,23795.15,23797.85,23782.55,23789.3,23808.9,23828.5,23808.35,23802.45,23798.5,23835.65,23833.25,23822.65,23818.2,23822.7,23795.6,23781.7,23752.5,23733.65,23727.6,23751.9,23719.3],
  low:[23671,23729.55,23739.2,23759.4,23759.65,23761.35,23775.1,23765.95,23750.7,23750.05,23800.7,23789.8,23771.45,23758.85,23789.25,23812.95,23803.6,23800.8,23782.5,23744.8,23739.1,23707.45,23706.9,23698.95,23718.2,23719.3],
  close:[23738.6,23752.95,23779.65,23791.7,23761.45,23792.7,23780.75,23771.6,23758.9,23808.25,23804.85,23798.6,23774.75,23792.6,23827.45,23819.1,23809.4,23801.25,23792.15,23778.2,23739.3,23709.05,23724.45,23718.15,23748.85,23719.3],
  volume:[24683977,14497513,11511970,13765523,15298753,11514004,10964506,10375124,12024800,12277818,9679904,9938875,10161794,9957290,9867401,9246183,10541345,7841633,10270570,12127137,10123093,13056736,14473209,27817984,32374586,0],
  timestamp:[1779421500,1779422400,1779423300,1779424200,1779425100,1779426000,1779426900,1779427800,1779428700,1779429600,1779430500,1779431400,1779432300,1779433200,1779434100,1779435000,1779435900,1779436800,1779437700,1779438600,1779439500,1779440400,1779441300,1779442200,1779443100,1779460200],
};

function ist(ts:number){const d=new Date(ts*1000);const h=String((d.getUTCHours()+5+Math.floor((d.getUTCMinutes()+30)/60))%24).padStart(2,"0");const m=String((d.getUTCMinutes()+30)%60).padStart(2,"0");return `${h}:${m}`;}

const warmup = NIFTY_5D
  .filter(r => !String(r[1]).startsWith("2026-05-22"))
  .map(r => ({ timestamp: r[0] as number, open: r[2] as number, high: r[3] as number, low: r[4] as number, close: r[5] as number, volume: 200000 }));

const today = U.timestamp.map((ts,i)=>({timestamp:ts,open:U.open[i],high:U.high[i],low:U.low[i],close:U.close[i],volume:U.volume[i]||100000}));
const all = [...warmup, ...today];

Deno.test("WHY NO TRADE — NIFTY 22-May full analysis", () => {
  console.log("\n" + "=".repeat(90));
  console.log("🔬 DIAGNOSTIC — Why engine did NOT fire on 22-May NIFTY 15m candles");
  console.log(`📊 Today bars: ${today.length}  |  Warmup: ${warmup.length}  |  Range: ${U.low.reduce((a,b)=>Math.min(a,b))} - ${U.high.reduce((a,b)=>Math.max(a,b))}  (${(U.high.reduce((a,b)=>Math.max(a,b))-U.low.reduce((a,b)=>Math.min(a,b))).toFixed(2)} pts swing)`);
  console.log("=".repeat(90));

  const reasons: Record<string,number> = {};
  for (let i = warmup.length; i < all.length; i++) {
    const win = all.slice(0, i+1);
    const sig = AdvancedAI.generateAdvancedSignal(win, 100000);
    const t = ist(all[i].timestamp);
    const adx = sig.indicators?.adx?.toFixed(1) ?? "-";
    const rsi = sig.indicators?.rsi?.toFixed(1) ?? "-";
    const ema9 = sig.indicators?.ema9?.toFixed(1) ?? "-";
    const ema21 = sig.indicators?.ema21?.toFixed(1) ?? "-";
    const reg = sig.marketRegime?.type ?? "?";
    const reason = (sig.reasoning?.[0] || sig.action) as string;
    const key = sig.action === "WAIT" ? (reason.slice(0,60)) : sig.action;
    reasons[key] = (reasons[key]||0)+1;
    console.log(`  ${t}  close=${all[i].close.toFixed(2).padStart(9)}  ${sig.action.padEnd(9)} conf=${String(sig.confidence).padStart(3)}%  ADX=${adx.padStart(5)} RSI=${rsi.padStart(5)} EMA9=${ema9} EMA21=${ema21}  reg=${reg.padEnd(10)} ${reason.slice(0,70)}`);
  }

  console.log("\n━━━ WAIT REASON BREAKDOWN ━━━");
  for (const [k,v] of Object.entries(reasons).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(2)}×  ${k}`);
  console.log("=".repeat(90)+"\n");
});
