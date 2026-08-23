// @ts-nocheck
/**
 * 🔷 ALICEBLUE (ANT API v2) SERVICE
 *
 * Docs implemented:
 *   Authentication : https://v2api.aliceblueonline.com/Authentication/
 *   Funds / limits : https://v2api.aliceblueonline.com/Funds/
 *   Orders         : https://v2api.aliceblueonline.com/orders%20Management/
 *   Positions      : https://v2api.aliceblueonline.com/portfolio/
 *   Contracts      : https://v2api.aliceblueonline.com/Contract%20Master/
 *
 * ADDITIVE ONLY — Dhan / Zerodha / Groww / Upstox / Fyers / Angel One untouched.
 *
 * Auth model: approved App Code + API secret → Aliceblue login → authCode →
 * vendor/getUserDetails → userSession. Every v2 API call carries that session
 * as a standard Bearer token.
 */

export const ALICEBLUE_API = "https://a3.aliceblueonline.com/open-api/od/v1";

/** Vendor / partner (open-api) host used by the App Code + API Secret login flow. */
export const ALICEBLUE_VENDOR_API = "https://a3.aliceblueonline.com/open-api/od/v1";
/** Where the user logs in with their Aliceblue credentials. */
export const ALICEBLUE_LOGIN_BASE = "https://ant.aliceblueonline.com/?appcode=";

export interface AliceblueOrderRequest {
  tradingSymbol: string;             // e.g. "NIFTY28AUG25C24200"
  symbolToken: string;               // Aliceblue instrument token
  exchange: "NFO" | "BFO";
  transactionType: "BUY" | "SELL";
  quantity: number;                  // units (lots × lot size), same as Dhan
  product?: "INTRADAY" | "LONGTERM";
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  validity?: "DAY" | "IOC";
}

export type BrokerProxy = (r: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; json: any; text: string } | null>;

/** Dhan exchangeSegment → Aliceblue F&O exchange. */
export function aliceblueExchangeFromSegment(segment?: string): "NFO" | "BFO" {
  return String(segment || "").toUpperCase().startsWith("BSE") ? "BFO" : "NFO";
}

/** Dhan productType → Aliceblue product code. */
export function aliceblueProductFromDhan(productType?: string): "INTRADAY" | "LONGTERM" {
  const p = String(productType || "").toUpperCase();
  return p === "MIS" || p === "INTRADAY" ? "INTRADAY" : "LONGTERM";
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Login URL the user must visit: https://ant.aliceblueonline.com/?appcode=<APP_CODE> */
export function aliceblueAuthUrl(appCode: string): string {
  return `${ALICEBLUE_LOGIN_BASE}${encodeURIComponent(String(appCode || "").trim())}`;
}

/**
 * Vendor (App Code) session exchange.
 *   checkSum = SHA256(userId + authCode + apiSecret)
 *   POST https://a3.aliceblueonline.com/open-api/od/v1/vendor/getUserDetails
 * Returns the long-lived `userSession` used as the bearer token for all APIs.
 */
export async function aliceblueVendorSession(opts: {
  userId: string;
  authCode: string;
  apiSecret: string;
  timeoutMs?: number;
}): Promise<{ sessionId: string; clientId: string; raw: any }> {
  const userId = String(opts.userId || "").trim().toUpperCase();
  const authCode = String(opts.authCode || "").trim();
  const apiSecret = String(opts.apiSecret || "").trim();
  if (!userId || !authCode || !apiSecret) {
    throw new Error("Aliceblue User ID, authCode and API secret are required");
  }

  const checkSum = await sha256Hex(`${userId}${authCode}${apiSecret}`);
  const body = JSON.stringify({ checkSum });
  const endpoints = [
    `${ALICEBLUE_VENDOR_API}/vendor/getUserDetails`,
    "https://ant.aliceblueonline.com/rest/AliceBlueAPIService/sso/getUserDetails",
  ];
  let resp: Response | null = null;
  let text = "";
  let json: any = {};
  for (const endpoint of endpoints) {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    text = await resp.text();
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (resp.ok && (json?.userSession || json?.sessionID)) break;
  }

  const sessionId = json?.userSession || json?.sessionID;
  if (!sessionId || String(json?.stat || "Ok").toLowerCase() === "not_ok") {
    throw new Error(json?.emsg || json?.message || `Aliceblue session exchange failed (${resp?.status || 0}). Confirm that App Code vendor access and the IndexPilot redirect URL are enabled by Aliceblue.`);
  }
  return { sessionId: String(sessionId), clientId: String(json?.clientId || userId), raw: json };
}



export class AliceblueService {
  private sessionId: string;
  private proxy?: BrokerProxy;

  constructor(creds: { userId: string; sessionId: string; proxy?: BrokerProxy }) {
    this.sessionId = creds.sessionId;
    this.proxy = creds.proxy;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.sessionId}`,
      Accept: "application/json",
      ...extra,
    };
  }

  private async request(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<any> {
    const headers = { ...this.headers(), ...((init.headers as Record<string, string>) || {}) };
    let status = 0;
    let text = "";

    // 1️⃣ Preferred: user's dedicated static-IP VPS.
    if (this.proxy) {
      const proxied = await Promise.race([
        this.proxy({
          method: String(init.method || "GET").toUpperCase(),
          path,
          headers,
          body: typeof init.body === "string" ? init.body : undefined,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), timeoutMs + 2000)),
      ]);
      if (proxied) {
        status = proxied.status;
        text = proxied.text;
      }
    }

    // 2️⃣ Fallback: direct API from the edge.
    if (!status) {
      const resp = await fetch(`${ALICEBLUE_API}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = resp.status;
      text = await resp.text();
    }

    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    const first = Array.isArray(json) ? json[0] : json;
    const notOk = String(first?.stat || first?.status || "").toLowerCase() === "not_ok" || first?.status === false;
    if (status >= 400 || notOk) {
      const err: any = new Error(first?.emsg || first?.message || `Aliceblue ${status}: ${text.slice(0, 250)}`);
      err.status = status;
      throw err;
    }
    return json;
  }

  // ── FUNDS ───────────────────────────────────────────────────
  /** Current ANT v2 funds endpoint. */
  async getFundLimits(): Promise<any> {
    const d = await this.request("/limits/");
    const rows: any[] = Array.isArray(d?.result) ? d.result : [];
    const r = rows[0] || {};
    const num = (...keys: string[]) => {
      for (const k of keys) {
        const n = Number(r?.[k]);
        if (isFinite(n) && n !== 0) return n;
      }
      return 0;
    };
    const available = num("tradingLimit", "availableCash", "availableBalance");
    return {
      availableBalance: available,
      sodLimit: num("openingCashLimit") || available,
      collateralAmount: num("collateralValue", "collateralAmount"),
      utilizationAmount: num("utilizedAmount", "marginUsed"),
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
  /** Current ANT v2 order placement endpoint. */
  async placeOrder(req: AliceblueOrderRequest): Promise<{ orderId: string | null; raw: any }> {
    const payload = {
      instrumentId: String(req.symbolToken),
      exchange: req.exchange,
      transactionType: String(req.transactionType).toUpperCase() === "SELL" ? "SELL" : "BUY",
      product: req.product || "LONGTERM",
      orderComplexity: "REGULAR",
      orderType: req.orderType === "LIMIT" ? "LIMIT" : "MARKET",
      quantity: Math.max(1, Number(req.quantity) || 0),
      price: req.orderType === "LIMIT" ? Number(req.price ?? 0) : 0,
      triggerPrice: 0,
      validity: req.validity || "DAY",
      tradingSymbol: req.tradingSymbol,
    };

    const data = await this.request("/orders/placeorder", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const first = Array.isArray(data?.result) ? data.result[0] : data?.result || data;
    const orderId = first?.brokerOrderId || first?.orderId || null;
    return { orderId: orderId ? String(orderId) : null, raw: data };
  }

  async getOrderStatus(orderId: string): Promise<any> {
    const orders = await this.getOrders();
    return orders.find((row: any) => String(row?.brokerOrderId || row?.orderId) === String(orderId)) || null;
  }

  async cancelOrder(orderId: string, extra: { exchange?: string; tradingSymbol?: string } = {}): Promise<boolean> {
    try {
      await this.request("/orders/cancel", {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ brokerOrderId: String(orderId) }),
      });
      return true;
    } catch { return false; }
  }

  async getOrders(): Promise<any[]> {
    const d = await this.request("/orders/book");
    return Array.isArray(d?.result) ? d.result : [];
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * https://v2api.aliceblueonline.com/portfolio/ (POST /api/positionAndHoldings/positionBook)
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const d = await this.request("/orders/positions");
    const list: any[] = Array.isArray(d?.result) ? d.result : [];
    return list
      .map((p) => {
        const netQty = Number(p.netQuantity ?? 0);
        const buyQty = Number(p.buyQuantity ?? (netQty > 0 ? netQty : 0));
        const sellQty = Number(p.sellQuantity ?? (netQty < 0 ? -netQty : 0));
        const buyAvg = Number(p.buyAveragePrice ?? p.netAveragePrice ?? 0);
        const sellAvg = Number(p.sellAveragePrice ?? p.netAveragePrice ?? 0);
        const avgPrice = netQty >= 0 ? buyAvg || sellAvg : sellAvg || buyAvg;
        const ltp = Number(p.lastTradedPrice ?? p.ltp ?? 0);
        const exch = String(p.exchange || "NFO").toUpperCase();
        const tsym = String(p.tradingSymbol || p.symbol || "");
        return {
          securityId: String(p.instrumentId || tsym),
          instrumentKey: String(p.instrumentId || tsym),
          tradingsymbol: tsym,
          tradingSymbol: tsym,
          aliceblueToken: String(p.instrumentId || ""),
          exchangeSegment: exch.startsWith("B") ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: String(p.product || "LONGTERM"),
          netQty,
          buyQty,
          sellQty,
          buyAvg,
          sellAvg,
          costPrice: avgPrice,
          ltp,
          realizedProfit: Number(p.realizedProfitLoss ?? p.realizedPnl ?? 0),
          unrealizedProfit: Number(
            p.unrealizedProfitLoss ?? p.unrealizedPnl ?? (netQty !== 0 && ltp > 0 ? (ltp - avgPrice) * netQty : 0),
          ),
          multiplier: 1,
          broker: "aliceblue",
          raw: p,
        };
      })
      .filter((p) => p.netQty !== 0 || p.buyQty > 0);
  }

  // ── LIVE DATA ───────────────────────────────────────────────
  /** LTP for one contract token (POST /api/ScripDetails/getScripQuoteDetails). */
  async getLastPrice(exchange: string, symbolToken: string): Promise<number | null> {
    try {
      const d = await this.request("/api/ScripDetails/getScripQuoteDetails", {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ exch: exchange || "NFO", symbol: String(symbolToken) }),
      });
      const row = Array.isArray(d) ? d[0] : d;
      const n = Number(row?.LTP ?? row?.Ltp ?? row?.ltp);
      return isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }
}
