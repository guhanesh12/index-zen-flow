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
 * Auth model (NOT OAuth): User ID + API key →
 *   1. POST /api/customer/getAPIEncpkey  { userId }          → encKey
 *   2. userData = SHA256(userId + apiKey + encKey)
 *   3. POST /api/customer/getUserSID     { userId, userData } → sessionID (daily)
 * Every call carries:  Authorization: Bearer <userId> <sessionID>
 */

export const ALICEBLUE_API = "https://ant.aliceblueonline.com/rest/AliceBlueAPIService";

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
  product?: "MIS" | "NRML";
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
export function aliceblueProductFromDhan(productType?: string): "MIS" | "NRML" {
  const p = String(productType || "").toUpperCase();
  return p === "MIS" || p === "INTRADAY" ? "MIS" : "NRML";
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Daily session login. Returns the sessionID used as the bearer token.
 * https://v2api.aliceblueonline.com/Authentication/
 */
export async function aliceblueLogin(opts: {
  userId: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<{ sessionId: string; raw: any }> {
  const userId = String(opts.userId || "").trim().toUpperCase();
  const apiKey = String(opts.apiKey || "").trim();
  if (!userId || !apiKey) throw new Error("Aliceblue User ID and API key are required");

  const timeoutMs = opts.timeoutMs ?? 12000;
  const post = async (path: string, body: any) => {
    const resp = await fetch(`${ALICEBLUE_API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await resp.text();
    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: resp.status, json, text };
  };

  const enc = await post("/api/customer/getAPIEncpkey", { userId });
  const encKey = enc.json?.encKey;
  if (!encKey) {
    throw new Error(enc.json?.emsg || `Aliceblue rejected this User ID (${enc.status}). Check the ID from the ANT web terminal.`);
  }

  const userData = await sha256Hex(`${userId}${apiKey}${encKey}`);
  const sid = await post("/api/customer/getUserSID", { userId, userData });
  const sessionId = sid.json?.sessionID || sid.json?.sessionId;
  if (!sessionId || String(sid.json?.stat || "Ok").toLowerCase() === "not_ok") {
    throw new Error(sid.json?.emsg || `Aliceblue login failed (${sid.status}). Regenerate the API key in ANT → Apps and try again.`);
  }
  return { sessionId: String(sessionId), raw: sid.json };
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
  const resp = await fetch(`${ALICEBLUE_VENDOR_API}/vendor/getUserDetails`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ checkSum }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  const text = await resp.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  const sessionId = json?.userSession || json?.sessionID;
  if (!sessionId || String(json?.stat || "Ok").toLowerCase() === "not_ok") {
    throw new Error(json?.emsg || `Aliceblue session exchange failed (${resp.status}). Login again from the Aliceblue page.`);
  }
  return { sessionId: String(sessionId), clientId: String(json?.clientId || userId), raw: json };
}



export class AliceblueService {
  private userId: string;
  private sessionId: string;
  private proxy?: BrokerProxy;

  constructor(creds: { userId: string; sessionId: string; proxy?: BrokerProxy }) {
    this.userId = String(creds.userId || "").toUpperCase();
    this.sessionId = creds.sessionId;
    this.proxy = creds.proxy;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.userId} ${this.sessionId}`,
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
    const notOk = String(first?.stat || "").toLowerCase() === "not_ok";
    if (status >= 400 || notOk) {
      const err: any = new Error(first?.emsg || `Aliceblue ${status}: ${text.slice(0, 250)}`);
      err.status = status;
      throw err;
    }
    return json;
  }

  // ── FUNDS ───────────────────────────────────────────────────
  /** https://v2api.aliceblueonline.com/Funds/ (GET /api/limits/getRmsLimits) */
  async getFundLimits(): Promise<any> {
    const d = await this.request("/api/limits/getRmsLimits");
    const rows: any[] = Array.isArray(d) ? d : [d];
    const r = rows[0] || {};
    const num = (...keys: string[]) => {
      for (const k of keys) {
        const n = Number(r?.[k]);
        if (isFinite(n) && n !== 0) return n;
      }
      return 0;
    };
    const available = num("net", "cashmarginavailable", "netcashavailable", "payinamt");
    return {
      availableBalance: available,
      sodLimit: num("branchAdhoc", "adhocMargin", "payinamt") || available,
      collateralAmount: num("collateralvalue", "directcollateralvalue"),
      utilizationAmount: num("debits", "marginused", "grexpo"),
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
  /** https://v2api.aliceblueonline.com/orders%20Management/ (POST /api/placeOrder/executePlaceOrder) */
  async placeOrder(req: AliceblueOrderRequest): Promise<{ orderId: string | null; raw: any }> {
    const payload = [{
      complexty: "regular",
      discqty: "0",
      exch: req.exchange,
      pCode: req.product || "NRML",
      prctyp: req.orderType === "LIMIT" ? "L" : "MKT",
      price: req.orderType === "LIMIT" ? String(Number(req.price ?? 0)) : "0",
      qty: Math.max(1, Number(req.quantity) || 0),
      ret: req.validity || "DAY",
      symbol_id: String(req.symbolToken),
      trading_symbol: req.tradingSymbol,
      transtype: String(req.transactionType).toUpperCase() === "SELL" ? "SELL" : "BUY",
      trigPrice: "0",
      orderTag: "indexpilot",
      deviceNumber: "indexpilot",
    }];

    const data = await this.request("/api/placeOrder/executePlaceOrder", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    const first = Array.isArray(data) ? data[0] : data;
    const orderId = first?.NOrdNo || first?.nestOrderNumber || first?.orderNumber || null;
    return { orderId: orderId ? String(orderId) : null, raw: data };
  }

  /** POST /api/placeOrder/orderHistory { nestOrderNumber } */
  async getOrderStatus(orderId: string): Promise<any> {
    const d = await this.request("/api/placeOrder/orderHistory", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ nestOrderNumber: String(orderId) }),
    });
    const list: any[] = Array.isArray(d) ? d : [d];
    return list[list.length - 1] || d;
  }

  async cancelOrder(orderId: string, extra: { exchange?: string; tradingSymbol?: string } = {}): Promise<boolean> {
    try {
      await this.request("/api/placeOrder/cancelOrder", {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          exch: extra.exchange || "NFO",
          nestOrderNumber: String(orderId),
          trading_symbol: extra.tradingSymbol || "",
        }),
      });
      return true;
    } catch { return false; }
  }

  async getOrders(): Promise<any[]> {
    const d = await this.request("/api/placeOrder/fetchOrderBook");
    return Array.isArray(d) ? d : [];
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * https://v2api.aliceblueonline.com/portfolio/ (POST /api/positionAndHoldings/positionBook)
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const d = await this.request("/api/positionAndHoldings/positionBook", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ ret: "NET" }),
    });
    const list: any[] = Array.isArray(d) ? d : [];
    return list
      .map((p) => {
        const netQty = Number(p.Netqty ?? p.netQty ?? 0);
        const buyQty = Number(p.Buyqty ?? (netQty > 0 ? netQty : 0));
        const sellQty = Number(p.Sellqty ?? (netQty < 0 ? -netQty : 0));
        const buyAvg = Number(p.NetBuyavgprc ?? p.Buyavgprc ?? 0);
        const sellAvg = Number(p.NetSellavgprc ?? p.Sellavgprc ?? 0);
        const avgPrice = netQty >= 0 ? buyAvg || sellAvg : sellAvg || buyAvg;
        const ltp = Number(p.LTP ?? p.Ltp ?? 0);
        const exch = String(p.Exchange || p.Exchangeseg || "NFO").toUpperCase();
        const tsym = String(p.Tsym || p.Symbol || p.Tradsym || "");
        return {
          securityId: String(p.Token || p.token || tsym),
          instrumentKey: String(p.Token || tsym),
          tradingsymbol: tsym,
          tradingSymbol: tsym,
          aliceblueToken: String(p.Token || ""),
          exchangeSegment: exch.startsWith("B") ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: String(p.Pcode || "NRML"),
          netQty,
          buyQty,
          sellQty,
          buyAvg,
          sellAvg,
          costPrice: avgPrice,
          ltp,
          realizedProfit: Number(p.realisedprofitloss ?? p.realisedPNL ?? 0),
          unrealizedProfit: Number(
            p.unrealisedprofitloss ?? (netQty !== 0 && ltp > 0 ? (ltp - avgPrice) * netQty : 0),
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
