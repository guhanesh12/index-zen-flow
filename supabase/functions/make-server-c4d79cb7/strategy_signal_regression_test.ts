import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AdvancedAI, type OHLCCandle } from "./advanced_ai.tsx";

function candles(direction: "bull" | "bear" | "chop"): OHLCCandle[] {
  const out: OHLCCandle[] = [];
  let price = 24000;
  for (let i = 0; i < 70; i++) {
    const drift = direction === "chop" ? Math.sin(i) * 2 : 0;
    const open = price;
    const close = price + drift;
    out.push({ timestamp: 1788407100000 + i * 900000, open, high: Math.max(open, close) + 5, low: Math.min(open, close) - 5, close, volume: 100000 });
    price = close;
  }
  if (direction === "bull") {
    out.push({ timestamp: out.at(-1)?.timestamp as number + 900000, open: 23920, high: 23928, low: 23900, close: 23910, volume: 100000 });
    out.push({ timestamp: out.at(-1)?.timestamp as number + 900000, open: 23909, high: 23918, low: 23896, close: 23912, volume: 100000 });
    out.push({ timestamp: out.at(-1)?.timestamp as number + 900000, open: 23913, high: 23955, low: 23911, close: 23949, volume: 150000 });
  } else if (direction === "bear") {
    out.push({ timestamp: out.at(-1)?.timestamp as number + 900000, open: 24080, high: 24100, low: 24072, close: 24090, volume: 100000 });
    out.push({ timestamp: out.at(-1)?.timestamp as number + 900000, open: 24091, high: 24104, low: 24082, close: 24088, volume: 100000 });
    out.push({ timestamp: out.at(-1)?.timestamp as number + 900000, open: 24087, high: 24089, low: 24045, close: 24051, volume: 150000 });
  }
  return out;
}

Deno.test("signal: confirmed support reclaim emits CALL before trend ADX catches up", () => {
  const signal = AdvancedAI.generateAdvancedSignal(candles("bull"), 100000, { timeframeMinutes: 15, enforceClosedCandle: false });
  assertEquals(signal.action, "BUY_CALL", signal.reasoning);
});

Deno.test("signal: confirmed resistance rejection emits PUT symmetrically", () => {
  const signal = AdvancedAI.generateAdvancedSignal(candles("bear"), 100000, { timeframeMinutes: 15, enforceClosedCandle: false });
  assertEquals(signal.action, "BUY_PUT", signal.reasoning);
});

Deno.test("signal: low-volatility chop remains WAIT", () => {
  const signal = AdvancedAI.generateAdvancedSignal(candles("chop"), 100000, { timeframeMinutes: 15, enforceClosedCandle: false });
  assertEquals(signal.action, "WAIT");
});