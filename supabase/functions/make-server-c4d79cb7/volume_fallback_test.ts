import { AdvancedAI } from "./advanced_ai.tsx";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function mkCandles(n: number, withVol = true) {
  const out: any[] = [];
  let price = 54000;
  for (let i = 0; i < n; i++) {
    const o = price;
    const c = price + (Math.random() - 0.5) * 50;
    const h = Math.max(o, c) + 10;
    const l = Math.min(o, c) - 10;
    out.push({ open: o, high: h, low: l, close: c, volume: withVol ? 12_000_000 + Math.random() * 500_000 : 0, timestamp: 1700000000 + i * 900 });
    price = c;
  }
  return out;
}

Deno.test("partial last bar (vol=0, range=0) falls back to previous closed candle", () => {
  const candles = mkCandles(60, true);
  // Replace last candle with partial (vol=0, range=0)
  const prev = candles[candles.length - 2];
  candles[candles.length - 1] = { open: prev.close, high: prev.close, low: prev.close, close: prev.close, volume: 0, timestamp: prev.timestamp + 900 };
  const sig = AdvancedAI.generateAdvancedSignal(candles, 100000);
  const va: any = sig.volumeAnalysis;
  console.log("VA:", JSON.stringify(va, null, 2));
  assert(va.has_data, "should still report has_data via prev candle");
  assert(va.feed_reliable, "should still report feed_reliable");
  assert(va.current_volume > 0, "should fall back to prev candle volume");
  assert(va.body_percent > 0 || va.body_percent === 0, "body_percent should be a number, not NaN");
  assert(isFinite(va.ratio) && va.ratio > 0, "ratio should be > 0");
});

Deno.test("real index feed with no volume falls back to candle strength", () => {
  const candles = mkCandles(60, false);
  const sig = AdvancedAI.generateAdvancedSignal(candles, 100000);
  const va: any = sig.volumeAnalysis;
  assertEquals(va.has_data, false);
  assertEquals(va.feed_reliable, false);
  assert(typeof va.candle_strength === "string");
});
