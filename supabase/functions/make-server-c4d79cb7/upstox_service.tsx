// @ts-nocheck
/**
 * 🟣 UPSTOX API SERVICE (v2 + v3 order placement)
 *
 * Docs implemented:
 *   https://upstox.com/developer/api-documentation/authentication
 *   https://upstox.com/developer/api-documentation/margin
 *   https://upstox.com/developer/api-documentation/v3/place-order
 *   https://upstox.com/developer/api-documentation/orders
 *   https://upstox.com/developer/api-documentation/get-positions
 *   https://upstox.com/developer/api-documentation/instrument
 *
 * ADDITIVE ONLY — Dhan / Zerodha / Groww behaviour is untouched.
 *
 * Auth model: OAuth2 (api key + secret + redirect URI) → daily access token.
 * Every call carries:  Authorization: Bearer <access_token>
 */

export const UPSTOX_API = "https://api.upstox.com";

export interface UpstoxOrderRequest {
  instrumentToken: string; // e.g. "NSE_FO|43812"
  transactionType: "BUY" | "SELL";
  quantity: number;
  product?: "D" | "I"; // D = delivery/NRML carry-forward, I = intraday
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  validity?: "DAY" | "IOC";
  tag?: string;
}

/** Dhan exchangeSegment → Upstox segment prefix used in instrument keys. */
export function upstoxSegmentFromDhan(segment?: string): "NSE_FO" | "BSE_FO" | "NSE_EQ" | "BSE_EQ" {
  const s = String(segment || "").toUpperCase();
  if (s.startsWith("BSE")) return s.includes("FNO") || s.includes("FO") ? "BSE_FO" : "BSE_EQ";
  return s.includes("EQ") && !s.includes("FNO") ? "NSE_EQ" : "NSE_FO";
}

/** Dhan productType → Upstox product code. */
export function upstoxProductFromDhan(productType?: string): "D" | "I" {
  const p = String(productType || "").toUpperCase();
  return p === "MIS" || p === "INTRADAY" ? "I" : "D";
}

export type BrokerProxy = (r: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; json: any; text: string } | null>;

// ── OAuth helpers (no access token needed) ────────────────────
/** https://upstox.com/developer/api-documentation/authentication */
export function buildUpstoxLoginUrl(apiKey: string, redirectUri: string, state?: string) {
  const p = new URLSearchParams({
    client_id: apiKey,
    redirect_uri: redirectUri,
    response_type: "code",
  });
  if (state) p.set("state", state);
  return `${UPSTOX_API}/v2/login/authorization/dialog?${p.toString()}`;
}

/** Exchange the ?code= returned on the redirect URI for a daily access token. */
export async function exchangeUpstoxCode(opts: {
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; userId?: string; userName?: string; raw: any }> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.apiKey,
    client_secret: opts.apiSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await fetch(`${UPSTOX_API}/v2/login/authorization/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await resp.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok || !json?.access_token) {
    throw new Error(
      json?.errors?.[0]?.message || json?.message || `Upstox token exchange failed (${resp.status})`,
    );
  }
  return {
    accessToken: String(json.access_token),
    userId: json?.user_id ? String(json.user_id) : undefined,
    userName: json?.user_name ? String(json.user_name) : undefined,
    raw: json,
  };
}

export class UpstoxService {
  private accessToken: string;
  private proxy?: BrokerProxy;

  constructor(creds: { accessToken: string; proxy?: BrokerProxy }) {
    this.accessToken = creds.accessToken;
    this.proxy = creds.proxy;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
      ...extra,
    };
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers = { ...this.headers(), ...((init.headers as Record<string, string>) || {}) };

      let status = 0;
      let text = "";
      if (this.proxy) {
        const proxied = await this.proxy({
          method: String(init.method || "GET").toUpperCase(),
          path,
          headers,
          body: typeof init.body === "string" ? init.body : undefined,
        });
        if (proxied) {
          status = proxied.status;
          text = proxied.text;
        }
      }
      if (!status) {
        const resp = await fetch(`${UPSTOX_API}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
        status = resp.status;
        text = await resp.text();
      }

      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (status >= 400 || String(json?.status || "").toLowerCase() === "error") {
        const err: any = new Error(
          json?.errors?.[0]?.message || json?.message || `Upstox ${status}: ${text.slice(0, 250)}`,
        );
        err.status = status;
        err.errorCode = json?.errors?.[0]?.error_code;
        throw err;
      }
      return json?.data ?? json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── MARGIN / FUNDS ──────────────────────────────────────────
  /** https://upstox.com/developer/api-documentation/margin */
  async getFundLimits(): Promise<any> {
    const d = await this.request("/v2/user/get-funds-and-margin?segment=SEC");
    const eq = d?.equity || d?.commodity || d || {};
    const available = Number(eq?.available_margin ?? 0);
    return {
      availableBalance: available,
      sodLimit: Number(eq?.payin_amount ?? available),
      collateralAmount: Number(eq?.span_margin ?? 0),
      utilizationAmount: Number(eq?.used_margin ?? 0),
      blockedPayinAmount: 0,
      blockedPayoutAmount: 0,
      raw: d,
    };
  }

  /** Cheap credential check for the UI status card. */
  async verify(): Promise<{ ok: boolean; balance?: number; error?: string }> {
    try {
      const funds = await this.getFundLimits();
      return { ok: true, balance: funds.availableBalance };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // ── ORDERS ──────────────────────────────────────────────────
  /** https://upstox.com/developer/api-documentation/v3/place-order */
  async placeOrder(req: UpstoxOrderRequest): Promise<{ orderId: string | null; raw: any }> {
    const body: Record<string, any> = {
      quantity: Math.max(1, Number(req.quantity) || 0),
      product: req.product || "D",
      validity: req.validity || "DAY",
      price: req.orderType === "LIMIT" ? Number(req.price ?? 0) : 0,
      tag: (req.tag || "indexpilot").slice(0, 20),
      instrument_token: req.instrumentToken,
      order_type: req.orderType || "MARKET",
      transaction_type: req.transactionType,
      disclosed_quantity: 0,
      trigger_price: 0,
      is_amo: false,
      slice: true,
    };

    const data = await this.request("/v3/order/place", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const orderId = data?.order_ids?.[0] || data?.order_id || null;
    return { orderId: orderId ? String(orderId) : null, raw: data };
  }

  /** https://upstox.com/developer/api-documentation/orders */
  async getOrderStatus(orderId: string): Promise<any> {
    return await this.request(`/v2/order/details?order_id=${encodeURIComponent(orderId)}`);
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.request(`/v2/order/cancel?order_id=${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      return true;
    } catch { return false; }
  }

  async getOrders(): Promise<any[]> {
    const d = await this.request("/v2/order/retrieve-all");
    return Array.isArray(d) ? d : [];
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * https://upstox.com/developer/api-documentation/get-positions
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const d = await this.request("/v2/portfolio/short-term-positions");
    const list: any[] = Array.isArray(d) ? d : Array.isArray(d?.positions) ? d.positions : [];
    return list
      .map((p) => {
        const netQty = Number(p.quantity ?? 0);
        const buyQty = Number(p.day_buy_quantity ?? p.buy_quantity ?? (netQty > 0 ? netQty : 0));
        const sellQty = Number(p.day_sell_quantity ?? p.sell_quantity ?? (netQty < 0 ? -netQty : 0));
        const avgPrice = Number(p.average_price ?? p.buy_price ?? 0);
        const ltp = Number(p.last_price ?? p.ltp ?? 0);
        const exch = String(p.exchange || "NSE").toUpperCase();
        return {
          securityId: String(p.instrument_token || p.instrument_key || ""),
          instrumentKey: String(p.instrument_token || p.instrument_key || ""),
          tradingsymbol: String(p.tradingsymbol || p.trading_symbol || ""),
          tradingSymbol: String(p.tradingsymbol || p.trading_symbol || ""),
          exchangeSegment: exch.startsWith("BSE") ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: String(p.product || "D"),
          netQty,
          buyQty,
          sellQty,
          buyAvg: Number(p.buy_price ?? avgPrice),
          sellAvg: Number(p.sell_price ?? 0),
          costPrice: avgPrice,
          ltp,
          realizedProfit: Number(p.realised ?? p.realized ?? 0),
          unrealizedProfit: Number(p.unrealised ?? (netQty !== 0 && ltp > 0 ? (ltp - avgPrice) * netQty : 0)),
          multiplier: Number(p.multiplier ?? 1),
          broker: "upstox",
          raw: p,
        };
      })
      .filter((p) => p.netQty !== 0 || p.buyQty > 0);
  }

  // ── LIVE DATA ───────────────────────────────────────────────
  /** LTP for one instrument key (e.g. "NSE_FO|43812"). */
  async getLastPrice(instrumentKey: string): Promise<number | null> {
    try {
      const d = await this.request(
        `/v2/market-quote/ltp?instrument_key=${encodeURIComponent(instrumentKey)}`,
      );
      const first: any = Object.values(d || {})[0];
      const n = Number(first?.last_price ?? first?.ltp);
      return isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }
}
