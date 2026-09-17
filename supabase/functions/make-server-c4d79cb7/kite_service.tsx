/**
 * 🟠 ZERODHA KITE CONNECT v3 SERVICE
 *
 * Docs implemented:
 *   https://kite.trade/docs/connect/v3/user/       (login flow, session, margins, profile)
 *   https://kite.trade/docs/connect/v3/orders/     (place / status / cancel)
 *   https://kite.trade/docs/connect/v3/portfolio/  (positions / holdings)
 *
 * This module is ADDITIVE — nothing here touches the existing Dhan pipeline.
 *
 * Auth model (different from Dhan):
 *   1) User creates a Kite Connect app → api_key + api_secret
 *   2) Browser opens https://kite.zerodha.com/connect/login?v=3&api_key=...
 *   3) Zerodha redirects to the app's registered redirect URL with ?request_token=...
 *   4) POST /session/token with checksum = SHA256(api_key + request_token + api_secret)
 *      → access_token (valid until ~06:00 IST next day)
 *   5) Every API call: header `Authorization: token api_key:access_token`
 */

const KITE_API = "https://api.kite.trade";
const KITE_LOGIN = "https://kite.zerodha.com/connect/login";

export interface KiteCreds {
  apiKey: string;
  apiSecret?: string;
  accessToken?: string;
}

export interface KiteOrderRequest {
  tradingsymbol: string;
  exchange: "NFO" | "BFO" | "NSE" | "BSE";
  transactionType: "BUY" | "SELL";
  quantity: number;
  product?: "MIS" | "NRML" | "CNC";
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  validity?: "DAY" | "IOC";
  tag?: string;
}

// ─────────────────────────── helpers ───────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildKiteLoginUrl(apiKey: string, state?: string): string {
  const q = new URLSearchParams({ v: "3", api_key: apiKey });
  if (state) q.set("redirect_params", `state=${encodeURIComponent(state)}`);
  return `${KITE_LOGIN}?${q.toString()}`;
}

/** Kite month codes for weekly expiries: Oct=O, Nov=N, Dec=D, else 1-9 */
const MONTH_CODE = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "O", "N", "D"];
const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Build a Zerodha tradingsymbol for an index option.
 *   monthly → NIFTY25AUG25000CE
 *   weekly  → NIFTY25O0725000CE
 */
export function buildKiteTradingSymbol(params: {
  indexName: string;
  expiryDate: string; // YYYY-MM-DD
  strike: number;
  optionType: "CE" | "PE";
  isMonthly: boolean;
}): string {
  const { indexName, expiryDate, strike, optionType, isMonthly } = params;
  const root = String(indexName || "").toUpperCase().replace(/[^A-Z]/g, "");
  const d = new Date(`${expiryDate}T00:00:00Z`);
  const yy = String(d.getUTCFullYear()).slice(-2);
  const strikeStr = Number.isInteger(strike) ? String(strike) : String(Number(strike));
  if (isMonthly) {
    return `${root}${yy}${MONTH_ABBR[d.getUTCMonth()]}${strikeStr}${optionType}`;
  }
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${root}${yy}${MONTH_CODE[d.getUTCMonth()]}${dd}${strikeStr}${optionType}`;
}

/** Dhan exchange segment → Kite exchange */
export function kiteExchangeFromSegment(segment?: string): "NFO" | "BFO" {
  return String(segment || "").toUpperCase().startsWith("BSE") ? "BFO" : "NFO";
}

/** Dhan productType (INTRADAY / MARGIN / CNC) → Kite product (MIS / NRML / CNC) */
export function kiteProductFromDhan(productType?: string): "MIS" | "NRML" | "CNC" {
  const p = String(productType || "").toUpperCase();
  if (p === "MIS" || p === "NRML" || p === "CNC") return p as any;
  if (p === "MARGIN" || p === "NORMAL" || p === "CARRYFORWARD") return "NRML";
  if (p === "CNC" || p === "DELIVERY") return "CNC";
  return "MIS";
}

// ─────────────────────────── service ───────────────────────────

export class KiteService {
  private apiKey: string;
  private accessToken: string;

  constructor(creds: { apiKey: string; accessToken: string }) {
    this.apiKey = creds.apiKey;
    this.accessToken = creds.accessToken;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      "X-Kite-Version": "3",
      Authorization: `token ${this.apiKey}:${this.accessToken}`,
      ...extra,
    };
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // Auth header is ALWAYS attached — a missing one makes Kite reply 403 TokenException.
      const headers = { ...this.headers(), ...((init.headers as Record<string, string>) || {}) };
      const resp = await fetch(`${KITE_API}${path}`, { ...init, headers, signal: ctrl.signal });
      const text = await resp.text();
      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!resp.ok || json?.status === "error") {
        const err: any = new Error(json?.message || `Kite ${resp.status}: ${text.slice(0, 250)}`);
        err.status = resp.status;
        err.errorType = json?.error_type;
        throw err;
      }
      return json?.data ?? json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── USER ────────────────────────────────────────────────────
  /** https://kite.trade/docs/connect/v3/user/#user-profile */
  async getProfile(): Promise<any> {
    return await this.request("/user/profile");
  }

  /** https://kite.trade/docs/connect/v3/user/#funds-and-margins */
  async getFundLimits(): Promise<any> {
    const data = await this.request("/user/margins");
    const eq = data?.equity || {};
    return {
      availableBalance: Number(eq?.available?.live_balance ?? eq?.net ?? 0),
      sodLimit: Number(eq?.available?.opening_balance ?? 0),
      collateralAmount: Number(eq?.available?.collateral ?? 0),
      utilizationAmount: Number(eq?.utilised?.debits ?? 0),
      blockedPayinAmount: Number(eq?.utilised?.payout ?? 0),
      blockedPayoutAmount: 0,
      raw: data,
    };
  }

  /** Live credential check — cheap call used by the UI status card. */
  async verify(): Promise<{ ok: boolean; balance?: number; userId?: string; error?: string }> {
    try {
      const profile = await this.getProfile();
      let balance: number | undefined;
      try { balance = (await this.getFundLimits()).availableBalance; } catch { /* non fatal */ }
      return { ok: true, balance, userId: profile?.user_id };
    } catch (e: any) {
      return { ok: false, error: e?.message || String(e) };
    }
  }

  // ── ORDERS ──────────────────────────────────────────────────
  /** https://kite.trade/docs/connect/v3/orders/#placing-orders */
  async placeOrder(req: KiteOrderRequest): Promise<{ orderId: string | null; raw: any }> {
    const form = new URLSearchParams({
      tradingsymbol: req.tradingsymbol,
      exchange: req.exchange,
      transaction_type: req.transactionType,
      order_type: req.orderType || "MARKET",
      quantity: String(Math.max(1, Number(req.quantity) || 0)),
      product: req.product || "MIS",
      validity: req.validity || "DAY",
    });
    if ((req.orderType || "MARKET") === "LIMIT") form.set("price", String(req.price ?? 0));
    if (req.tag) form.set("tag", req.tag.slice(0, 20));

    const data = await this.request("/orders/regular", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/x-www-form-urlencoded" }),
      body: form.toString(),
    });
    return { orderId: data?.order_id ? String(data.order_id) : null, raw: data };
  }

  /** https://kite.trade/docs/connect/v3/orders/#retrieving-order-history */
  async getOrderStatus(orderId: string): Promise<any> {
    const data = await this.request(`/orders/${encodeURIComponent(orderId)}`, { headers: this.headers() });
    return Array.isArray(data) ? data[data.length - 1] : data;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.request(`/orders/regular/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
        headers: this.headers(),
      });
      return true;
    } catch { return false; }
  }

  async getOrders(): Promise<any[]> {
    const data = await this.request("/orders", { headers: this.headers() });
    return Array.isArray(data) ? data : [];
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * https://kite.trade/docs/connect/v3/portfolio/#positions
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const data = await this.request("/portfolio/positions", { headers: this.headers() });
    const net: any[] = Array.isArray(data?.net) ? data.net : [];
    return net
      .filter((p) => Number(p.quantity) !== 0 || Number(p.day_buy_quantity) > 0)
      .map((p) => {
        const netQty = Number(p.quantity || 0);
        const avgPrice = Number(p.average_price || p.buy_price || 0);
        const ltp = Number(p.last_price || 0);
        return {
          securityId: String(p.instrument_token || ""),
          tradingsymbol: String(p.tradingsymbol || ""),
          tradingSymbol: String(p.tradingsymbol || ""),
          exchangeSegment: p.exchange === "BFO" ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: p.product || "MIS",
          netQty,
          buyQty: Number(p.buy_quantity || 0),
          sellQty: Number(p.sell_quantity || 0),
          avgPrice,
          costPrice: avgPrice,
          lastPrice: ltp,
          ltp,
          realizedProfit: Number(p.realised || 0),
          unrealizedProfit: Number(p.unrealised ?? p.pnl ?? 0),
          pnl: Number(p.pnl ?? ((Number(p.last_price || 0) - Number(p.average_price || 0)) * Number(p.quantity || 0))),
          multiplier: Number(p.multiplier || 1),
          broker: "zerodha",
          raw: p,
        };
      });
  }

  async getHoldings(): Promise<any[]> {
    const data = await this.request("/portfolio/holdings", { headers: this.headers() });
    return Array.isArray(data) ? data : [];
  }

  // ── MARKET QUOTES ───────────────────────────────────────────
  // https://kite.trade/docs/connect/v3/market-quotes/
  private static qs(instruments: string[]): string {
    return instruments.map((i) => `i=${encodeURIComponent(i)}`).join("&");
  }

  /** Full quote (depth, OHLC, OI). instruments = ["NFO:NIFTY25AUG25000CE"] */
  async getQuote(instruments: string[]): Promise<Record<string, any>> {
    if (!instruments.length) return {};
    return await this.request(`/quote?${KiteService.qs(instruments)}`);
  }

  /** OHLC + last price only (lighter than /quote). */
  async getOHLC(instruments: string[]): Promise<Record<string, any>> {
    if (!instruments.length) return {};
    return await this.request(`/quote/ohlc?${KiteService.qs(instruments)}`);
  }

  /** Last traded price only (cheapest call). */
  async getLTP(instruments: string[]): Promise<Record<string, any>> {
    if (!instruments.length) return {};
    return await this.request(`/quote/ltp?${KiteService.qs(instruments)}`);
  }

  /** LTP for a single tradingsymbol, normalised to a plain number. */
  async getLastPrice(exchange: string, tradingsymbol: string): Promise<number | null> {
    const key = `${exchange}:${tradingsymbol}`;
    try {
      const data = await this.getLTP([key]);
      const v = data?.[key]?.last_price;
      return typeof v === "number" ? v : null;
    } catch {
      return null;
    }
  }
}


// ─────────────────── session (login) exchange ───────────────────

/** https://kite.trade/docs/connect/v3/user/#login-flow */
export async function exchangeKiteRequestToken(params: {
  apiKey: string;
  apiSecret: string;
  requestToken: string;
}): Promise<{ accessToken: string; userId: string; userName?: string; raw: any }> {
  const checksum = await sha256Hex(`${params.apiKey}${params.requestToken}${params.apiSecret}`);
  const body = new URLSearchParams({
    api_key: params.apiKey,
    request_token: params.requestToken,
    checksum,
  });
  const resp = await fetch(`${KITE_API}/session/token`, {
    method: "POST",
    headers: {
      "X-Kite-Version": "3",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const text = await resp.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok || json?.status === "error" || !json?.data?.access_token) {
    throw new Error(json?.message || `Kite session exchange failed (${resp.status})`);
  }
  return {
    accessToken: String(json.data.access_token),
    userId: String(json.data.user_id || ""),
    userName: json.data.user_name ? String(json.data.user_name) : undefined,
    raw: json.data,
  };
}

/** Kite access tokens die at ~06:00 IST the next morning. */
export function kiteTokenExpiryIso(from: Date = new Date()): string {
  const ist = new Date(from.getTime() + 5.5 * 3600_000);
  ist.setUTCHours(6, 0, 0, 0);
  let expiry = new Date(ist.getTime() - 5.5 * 3600_000);
  if (expiry.getTime() <= from.getTime()) expiry = new Date(expiry.getTime() + 24 * 3600_000);
  return expiry.toISOString();
}
