// 📈 LIVE MARKET ANALYSIS FOR THE AI CHAT BRAIN
// Standalone helper — it does NOT touch the trading strategy files.
// Pulls real intraday candles from Dhan for each index (and for a running
// option position) and converts them into a compact, model-friendly read.

export interface DhanCreds {
  dhanClientId: string;
  dhanAccessToken: string;
}

export const INDEX_META: Record<string, { securityId: string; segment: string }> = {
  NIFTY: { securityId: "13", segment: "IDX_I" },
  BANKNIFTY: { securityId: "25", segment: "IDX_I" },
  FINNIFTY: { securityId: "27", segment: "IDX_I" },
  MIDCPNIFTY: { securityId: "442", segment: "IDX_I" },
  SENSEX: { securityId: "51", segment: "IDX_I" },
};

export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number }

// ---------- tiny in-isolate cache so repeat questions don't re-hit Dhan ----------
const cache = new Map<string, { at: number; data: any }>();
const CACHE_MS = 45_000;

function fromCache(key: string) {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_MS ? hit.data : null;
}
function toCache(key: string, data: any) {
  cache.set(key, { at: Date.now(), data });
}

// ---------- indicators ----------
function ema(vals: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = vals[0];
  vals.forEach((v, i) => {
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return Math.round(100 - 100 / (1 + rs));
}

function atr(c: Candle[], period = 14): number {
  if (c.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    trs.push(Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / (slice.length || 1);
}

// Wilder ADX (trend strength only — read-only, independent of the strategy file)
function adx(c: Candle[], period = 14): number {
  if (c.length < period * 2) return 0;
  let plus = 0, minus = 0, tr = 0;
  for (let i = c.length - period; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h;
    const dn = c[i - 1].l - c[i].l;
    plus += up > dn && up > 0 ? up : 0;
    minus += dn > up && dn > 0 ? dn : 0;
    tr += Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
  }
  if (tr === 0) return 0;
  const pdi = (plus / tr) * 100;
  const mdi = (minus / tr) * 100;
  const sum = pdi + mdi;
  return sum === 0 ? 0 : Math.round((Math.abs(pdi - mdi) / sum) * 100);
}

function vwapToday(c: Candle[]): number {
  const day = todayCandles(c);
  let pv = 0, vol = 0;
  for (const k of day) {
    const tp = (k.h + k.l + k.c) / 3;
    const v = k.v || 1;
    pv += tp * v;
    vol += v;
  }
  return vol ? pv / vol : day.length ? day[day.length - 1].c : 0;
}

function istDateKey(ms: number) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function todayCandles(c: Candle[]): Candle[] {
  if (!c.length) return [];
  const last = istDateKey(c[c.length - 1].t);
  return c.filter((k) => istDateKey(k.t) === last);
}

// ---------- Dhan fetch ----------
function fmt(d: Date, time: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return `${p} ${time}`;
}

export async function fetchCandles(
  creds: DhanCreds,
  securityId: string,
  segment: string,
  instrument: string,
  interval = 5,
): Promise<Candle[]> {
  const key = `c:${securityId}:${interval}`;
  const hit = fromCache(key);
  if (hit) return hit;

  const to = new Date();
  const from = new Date(Date.now() - 5 * 864e5);
  const res = await fetch("https://api.dhan.co/v2/charts/intraday", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "access-token": creds.dhanAccessToken,
      "client-id": creds.dhanClientId,
    },
    body: JSON.stringify({
      securityId,
      exchangeSegment: segment,
      instrument,
      interval,
      fromDate: fmt(from, "09:15:00"),
      toDate: fmt(to, "15:30:00"),
      oi: false,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Dhan ${res.status}: ${txt.slice(0, 160)}`);
  }
  const d = await res.json();
  const ts: any[] = d.timestamp || d.start_Time || d.start_time || [];
  const out: Candle[] = ts.map((t: any, i: number) => ({
    t: Number(t) < 1e12 ? Number(t) * 1000 : Number(t),
    o: Number(d.open?.[i] ?? 0),
    h: Number(d.high?.[i] ?? 0),
    l: Number(d.low?.[i] ?? 0),
    c: Number(d.close?.[i] ?? 0),
    v: Number(d.volume?.[i] ?? 0),
  })).filter((k) => k.c > 0);

  toCache(key, out);
  return out;
}

// ---------- read builder ----------
export interface MarketRead {
  name: string;
  ltp: number;
  day_change_pct: number;
  day_high: number;
  day_low: number;
  vwap: number;
  above_vwap: boolean;
  ema9: number;
  ema21: number;
  ema50: number;
  rsi14: number;
  adx14: number;
  atr14: number;
  trend: "STRONG_UP" | "UP" | "SIDEWAYS" | "DOWN" | "STRONG_DOWN";
  momentum: "BULLISH" | "BEARISH" | "NEUTRAL";
  bias: "CALL" | "PUT" | "WAIT";
  last_candles: { t: string; o: number; h: number; l: number; c: number }[];
  note: string;
}

export function buildRead(name: string, c: Candle[]): MarketRead | null {
  if (c.length < 20) return null;
  const closes = c.map((k) => k.c);
  const e9 = ema(closes, 9).at(-1)!;
  const e21 = ema(closes, 21).at(-1)!;
  const e50 = ema(closes, 50).at(-1)!;
  const ltp = closes.at(-1)!;
  const day = todayCandles(c);
  const open = day[0]?.o ?? closes[0];
  const vw = vwapToday(c);
  const r = rsi(closes);
  const ax = adx(c);
  const at = atr(c);

  const up = ltp > e9 && e9 > e21 && ltp > vw;
  const dn = ltp < e9 && e9 < e21 && ltp < vw;
  const trend: MarketRead["trend"] = up ? (ax >= 25 ? "STRONG_UP" : "UP")
    : dn ? (ax >= 25 ? "STRONG_DOWN" : "DOWN")
    : "SIDEWAYS";
  const momentum: MarketRead["momentum"] = r >= 60 ? "BULLISH" : r <= 40 ? "BEARISH" : "NEUTRAL";
  const bias: MarketRead["bias"] =
    trend === "STRONG_UP" || (trend === "UP" && momentum === "BULLISH") ? "CALL"
    : trend === "STRONG_DOWN" || (trend === "DOWN" && momentum === "BEARISH") ? "PUT"
    : "WAIT";

  return {
    name,
    ltp: +ltp.toFixed(2),
    day_change_pct: +(((ltp - open) / (open || 1)) * 100).toFixed(2),
    day_high: +Math.max(...day.map((k) => k.h), ltp).toFixed(2),
    day_low: +Math.min(...day.map((k) => k.l), ltp).toFixed(2),
    vwap: +vw.toFixed(2),
    above_vwap: ltp > vw,
    ema9: +e9.toFixed(2),
    ema21: +e21.toFixed(2),
    ema50: +e50.toFixed(2),
    rsi14: r,
    adx14: ax,
    atr14: +at.toFixed(2),
    trend,
    momentum,
    bias,
    last_candles: c.slice(-6).map((k) => ({
      t: new Date(k.t).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }).slice(0, 5),
      o: +k.o.toFixed(2), h: +k.h.toFixed(2), l: +k.l.toFixed(2), c: +k.c.toFixed(2),
    })),
    note:
      bias === "WAIT"
        ? `${name} is choppy (ADX ${ax}) — no clean directional edge right now.`
        : `${name} favours ${bias} — trend ${trend}, RSI ${r}, ${ltp > vw ? "above" : "below"} VWAP.`,
  };
}

// ---------- public API ----------
export async function analyseIndices(creds: DhanCreds, names: string[]): Promise<{
  reads: MarketRead[];
  errors: string[];
}> {
  const uniq = [...new Set(names.map((n) => String(n || "").toUpperCase()))].filter((n) => INDEX_META[n]).slice(0, 5);
  const reads: MarketRead[] = [];
  const errors: string[] = [];
  await Promise.all(
    uniq.map(async (n) => {
      try {
        const meta = INDEX_META[n];
        const candles = await fetchCandles(creds, meta.securityId, meta.segment, "INDEX", 5);
        const read = buildRead(n, candles);
        if (read) reads.push(read);
        else errors.push(`${n}: not enough candles`);
      } catch (e) {
        errors.push(`${n}: ${(e as Error).message}`);
      }
    }),
  );
  reads.sort((a, b) => a.name.localeCompare(b.name));
  return { reads, errors };
}

// Analyse the option contract of a running position (premium behaviour itself)
export async function analysePositionOption(
  creds: DhanCreds,
  securityId: string,
  segment = "NSE_FNO",
): Promise<MarketRead | null> {
  try {
    const candles = await fetchCandles(creds, String(securityId), segment, "OPTIDX", 5);
    return buildRead("OPTION", candles);
  } catch {
    return null;
  }
}
