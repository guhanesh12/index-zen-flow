// Replay today's 15-min candles through the CURRENT strategy and print results
import { AdvancedAI } from "./advanced_ai.tsx";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Row { index_name: string; raw_data: any; created_at: string; price: number; signal_type: string; }

async function fetchSignals(): Promise<Row[]> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const url = `${SUPABASE_URL}/rest/v1/trading_signals?select=created_at,index_name,signal_type,price,raw_data&created_at=gte.${today.toISOString()}&order=created_at.asc`;
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  return await res.json();
}

function fmtIST(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

Deno.test({
  name: "replay today's candles through current strategy",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const rows = await fetchSignals();
    console.log(`\n=========================================`);
    console.log(`📊 Total signal rows fetched: ${rows.length}`);
    console.log(`=========================================\n`);

    // Group: pick latest OHLC per (index, time) — but easier: dedupe by (index, time-bucket)
    const seen = new Set<string>();
    const unique: Row[] = [];
    for (const r of rows) {
      const t = fmtIST(r.created_at);
      const key = `${r.index_name}-${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (r.raw_data?.ohlcData?.length) unique.push(r);
    }
    console.log(`📈 Unique (index,time) windows with OHLC: ${unique.length}\n`);

    const results: any[] = [];
    for (const r of unique) {
      const ohlc = r.raw_data.ohlcData;
      const sig = AdvancedAI.generateAdvancedSignal(ohlc, 100000);
      const t = fmtIST(r.created_at);
      const lastClose = ohlc[ohlc.length - 1].close;
      console.log(`[${t}] ${r.index_name.padEnd(10)} spot=${lastClose.toFixed(2).padStart(10)} | OLD=${r.signal_type.padEnd(9)} | NEW=${sig.action.padEnd(9)} conf=${sig.confidence}% bias=${sig.bias} regime=${sig.marketRegime.type} confirms=${sig.confirmations.total}/${sig.confirmations.required} RSI=${sig.indicators.rsi.toFixed(1)} ADX=${sig.indicators.adx.toFixed(1)}`);
      results.push({
        time: t,
        index: r.index_name,
        spot: lastClose,
        old_signal: r.signal_type,
        new_action: sig.action,
        new_confidence: sig.confidence,
        bias: sig.bias,
        regime: sig.marketRegime.type,
        confirms: sig.confirmations.total,
        rsi: +sig.indicators.rsi.toFixed(1),
        adx: +sig.indicators.adx.toFixed(1),
        macd_bullish: sig.indicators.macd > sig.indicators.macdSignal,
        suggested_target: sig.riskManagement.suggestedTarget,
        suggested_sl: sig.riskManagement.suggestedStopLoss,
        rr: sig.riskManagement.riskRewardRatio,
      });
    }

    // Summary
    const byAction: Record<string, number> = {};
    const oldByAction: Record<string, number> = {};
    let agree = 0;
    for (const r of results) {
      byAction[r.new_action] = (byAction[r.new_action] || 0) + 1;
      oldByAction[r.old_signal] = (oldByAction[r.old_signal] || 0) + 1;
      if (r.new_action === r.old_signal) agree++;
    }
    console.log(`\n=========================================`);
    console.log(`SUMMARY`);
    console.log(`=========================================`);
    console.log(`OLD signals: ${JSON.stringify(oldByAction)}`);
    console.log(`NEW signals: ${JSON.stringify(byAction)}`);
    console.log(`Agreement (NEW==OLD): ${agree}/${results.length} (${(agree*100/results.length).toFixed(1)}%)`);

    // Output JSON for the report
    console.log(`\n===JSON_RESULTS_BEGIN===`);
    console.log(JSON.stringify(results, null, 2));
    console.log(`===JSON_RESULTS_END===`);
  },
});
