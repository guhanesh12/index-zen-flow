/**
 * 📈 MARKET INTEL — Dhan v2 data APIs (technical indicators, market movers, news)
 *
 * All three feeds use the ADMIN central Dhan data subscription (same credentials
 * as central_market_data), so every user sees identical data and no user broker
 * token / rate limit is consumed.
 *
 * Caching:
 *   technical → 2s   (UI polls every 1s)
 *   movers    → 55s  (UI polls every 60s)
 *   news      → 55s  (UI polls every 60s)
 */

import { getCentralCredentials } from "./central_market_data.tsx";

const DHAN = "https://api.dhan.co/v2";

export const INTEL_INDICES: Array<{ name: string; securityId: string }> = [
  { name: "NIFTY", securityId: "13" },
  { name: "BANKNIFTY", securityId: "25" },
  { name: "SENSEX", securityId: "51" },
];

const DEFAULT_INDICATORS = [
  "SMA_20",
  "EMA_20",
  "RSI_14",
  "MACD_HIST",
  "PIVOT",
];

/** Everything refreshes upstream once per 15 minutes (one closed candle). */
export const INTEL_TTL_MS = 15 * 60 * 1000;

type CacheEntry = { at: number; value: any };
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();

/**
 * Cache-first with stale fallback: a failed upstream call (rate limit, token
 * hiccup) never blanks the UI — the last good payload is served again.
 */
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  // cross-isolate copy so a cold start does not hammer Dhan
  if (!hit) {
    const stored = await kv.get(`market_intel:${key}`).catch(() => null);
    if (stored?.at && Date.now() - stored.at < ttlMs) {
      cache.set(key, { at: stored.at, value: stored.value });
      return stored.value as T;
    }
    if (stored?.value) cache.set(key, { at: 0, value: stored.value });
  }

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const task = (async () => {
    try {
      const value = await fn();
      const at = Date.now();
      cache.set(key, { at, value });
      await kv.set(`market_intel:${key}`, { at, value }).catch(() => {});
      return value;
    } catch (e) {
      const stale = cache.get(key);
      if (stale?.value) return stale.value as T;
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, task);
  return task as Promise<T>;
}

async function dhanPost(path: string, body: any, accessToken: string) {
  const res = await fetch(`${DHAN}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "access-token": accessToken,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const msg = json?.errorMessage || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`[${res.status}] ${msg}`);
  }
  return json;
}

async function creds() {
  const c = await getCentralCredentials();
  if (!c) throw new Error("Central market data credentials not configured or disabled");
  return c;
}

/* ─────────────────── technical indicators ─────────────────── */

function shapeTechnical(raw: any) {
  const d = raw?.data || {};
  const sma = Array.isArray(d.SMA) ? d.SMA[0] : d.SMA;
  const ema = Array.isArray(d.EMA) ? d.EMA[0] : d.EMA;
  const rsi = d.RSI || null;
  const macd = d.MACD_HIST || null;
  const pivot = d.PIVOT?.Classic || null;

  const votes = [sma?.action, ema?.action, rsi?.action, macd?.action].filter(Boolean);
  const bull = votes.filter((v: string) => String(v).toLowerCase() === "bullish").length;
  const bear = votes.filter((v: string) => String(v).toLowerCase() === "bearish").length;
  const bias = bull > bear ? "Bullish" : bear > bull ? "Bearish" : "Neutral";

  return {
    sma: sma ? { period: sma.period ?? 20, value: sma.value, action: sma.action } : null,
    ema: ema ? { period: ema.period ?? 20, value: ema.value, action: ema.action } : null,
    rsi: rsi ? { value: rsi.value, action: rsi.action } : null,
    macdHist: macd ? { value: macd.value, action: macd.action } : null,
    pivot,
    bias,
    bullish: bull,
    bearish: bear,
  };
}

export async function getTechnicalAll(timeframe = "15", indicators = DEFAULT_INDICATORS) {
  const tf = ["1", "5", "15", "D"].includes(String(timeframe)) ? String(timeframe) : "15";
  return cached(`tech:${tf}:${indicators.join(",")}`, 2000, async () => {
    const { accessToken } = await creds();
    const out: Record<string, any> = {};
    await Promise.all(
      INTEL_INDICES.map(async (idx) => {
        try {
          const raw = await dhanPost(
            "/data/technical",
            {
              securityId: idx.securityId,
              exchangeSegment: "IDX_I",
              instrument: "INDEX",
              timeframe: tf,
              indicators,
            },
            accessToken,
          );
          out[idx.name] = { ok: true, ...shapeTechnical(raw) };
        } catch (e: any) {
          out[idx.name] = { ok: false, error: e?.message || String(e) };
        }
      }),
    );
    return { timeframe: tf, fetchedAt: Date.now(), indices: out };
  });
}

/* ─────────────────── market movers ─────────────────── */

export async function getMarketMovers(limit = 5) {
  const lim = Math.min(20, Math.max(1, Number(limit) || 5));
  return cached(`movers:${lim}`, 55_000, async () => {
    const { accessToken } = await creds();

    const pull = async (category: "PRICE_GAINERS" | "PRICE_LOSERS") => {
      try {
        const raw = await dhanPost(
          "/data/marketmovers",
          {
            exchangeSegment: "NSE_EQ",
            instrument: ["EQUITY"],
            category,
            universe: "FNO_STOCKS",
            limit: lim,
          },
          accessToken,
        );
        return (raw?.data || []).map((r: any) => ({
          symbol: r.tradingSymbol || r.displayName || r.securityId,
          name: r.displayName || r.tradingSymbol,
          ltp: Number(r.ltp) || 0,
          change: Number(r.change) || 0,
          changePercent: Number(r.changePercent) || 0,
          volume: Number(r.volume) || 0,
        }));
      } catch (e: any) {
        return { error: e?.message || String(e) } as any;
      }
    };

    const [gainers, losers] = await Promise.all([pull("PRICE_GAINERS"), pull("PRICE_LOSERS")]);
    const err = (gainers as any)?.error || (losers as any)?.error || null;
    return {
      fetchedAt: Date.now(),
      gainers: Array.isArray(gainers) ? gainers : [],
      losers: Array.isArray(losers) ? losers : [],
      error: err,
    };
  });
}

/* ─────────────────── live news headlines ─────────────────── */

export async function getMarketNews(limit = 12) {
  const lim = Math.min(50, Math.max(1, Number(limit) || 12));
  return cached(`news:${lim}`, 55_000, async () => {
    const { clientId, accessToken } = await creds();
    const raw = await dhanPost(
      "/data/newsheadline",
      { dhanClientId: clientId, categories: ["ALL"], limit: lim, stockList: [] },
      accessToken,
    );
    const list = [...(raw?.data?.latestNews || []), ...(raw?.data?.nextNews || [])];
    return {
      fetchedAt: Date.now(),
      items: list.slice(0, lim).map((n: any) => ({
        headline: n.headline || n.title || n.newsHeadline || "",
        source: n.source || n.publisher || "",
        category: n.category || "",
        publishedAt: n.publishedAt || n.date || n.dateTime || n.time || null,
        url: n.url || n.link || null,
      })),
    };
  });
}
