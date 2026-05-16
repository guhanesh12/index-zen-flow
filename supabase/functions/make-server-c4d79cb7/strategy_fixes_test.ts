// Validates that the 10 strategy fixes compile and run without errors,
// and that MACD/ADX/Stochastic produce sane numeric output.
import { AdvancedAI } from "./advanced_ai.tsx";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function makeCandles(n: number, startPrice = 50000, trend: 'up' | 'down' | 'flat' = 'up'): any[] {
  const out: any[] = [];
  let p = startPrice;
  for (let i = 0; i < n; i++) {
    const drift = trend === 'up' ? 5 : trend === 'down' ? -5 : 0;
    const noise = (Math.sin(i * 0.7) + Math.cos(i * 0.3)) * 20;
    const open = p;
    const close = p + drift + noise;
    const high = Math.max(open, close) + Math.abs(noise) * 0.5 + 5;
    const low = Math.min(open, close) - Math.abs(noise) * 0.5 - 5;
    out.push({ open, high, low, close, volume: 10000 + Math.abs(noise) * 100, timestamp: 1700000000 + i * 900 });
    p = close;
  }
  return out;
}

Deno.test("strategy: uptrend produces sane indicators + no crash", () => {
  const candles = makeCandles(120, 50000, 'up');
  const sig = AdvancedAI.generateAdvancedSignal(candles, 100000);
  console.log("Action:", sig.action, "Confidence:", sig.confidence, "Bias:", sig.bias);
  console.log("ADX:", sig.indicators.adx.toFixed(2), "MACD:", sig.indicators.macd.toFixed(2), "Signal:", sig.indicators.macdSignal.toFixed(2));
  console.log("Stoch K:", sig.indicators.stochK.toFixed(2), "D:", sig.indicators.stochD.toFixed(2));
  console.log("RR:", sig.riskManagement.riskRewardRatio, "Reasoning:", sig.reasoning);
  assert(isFinite(sig.indicators.macd));
  assert(isFinite(sig.indicators.macdSignal));
  assert(isFinite(sig.indicators.adx));
  assert(sig.indicators.adx >= 0 && sig.indicators.adx <= 100);
  assert(sig.indicators.stochK >= 0 && sig.indicators.stochK <= 100);
  assert(sig.indicators.stochD >= 0 && sig.indicators.stochD <= 100);
  assert([1.5, 2.0, 3.0].includes(sig.riskManagement.riskRewardRatio));
});

Deno.test("strategy: downtrend & flat market do not crash", () => {
  for (const trend of ['down', 'flat'] as const) {
    const candles = makeCandles(120, 50000, trend);
    const sig = AdvancedAI.generateAdvancedSignal(candles, 100000);
    console.log(`[${trend}] action=${sig.action} adx=${sig.indicators.adx.toFixed(2)} rr=${sig.riskManagement.riskRewardRatio}`);
    assert(isFinite(sig.indicators.adx));
  }
});
