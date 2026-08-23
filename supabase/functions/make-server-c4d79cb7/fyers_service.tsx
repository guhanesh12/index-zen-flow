// @ts-nocheck
/**
 * 🔵 FYERS API v3 SERVICE
 *
 * Docs implemented:
 *   Auth / request-response : https://myapi.fyers.in/docsv3#tag/Request-and-Response-Structure
 *   Funds / margin          : https://myapi.fyers.in/docsv3#tag/Margin-Calculator
 *   Place order (sync)      : https://myapi.fyers.in/docsv3#tag/Sync-Order-Placement
 *   Order book / cancel     : https://myapi.fyers.in/docsv3#tag/Sync-Order-Placement
 *   Positions               : https://myapi.fyers.in/docsv3#tag/Manage-Positions
 *   Broker config / symbols : https://myapi.fyers.in/docsv3#tag/Broker-Config
 *
 * ADDITIVE ONLY — Dhan / Zerodha / Groww / Upstox behaviour is untouched.
 *
 * Auth model: OAuth2 (app id + secret + redirect URI) → daily access token.
 * Every call carries:  Authorization: <appId>:<access_token>
 */

const FYERS_API = "https://api-t1.fyers.in";

export interface FyersOrderRequest {
  symbol: string;                    // e.g. "NSE:NIFTY25AUG24200CE"
  transactionType: "BUY" | "SELL";
  quantity: number;                  // in units (lot size × lots), same as Dhan
  product?: "INTRADAY" | "MARGIN" | "CNC";
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  validity?: "DAY" | "IOC";
}

/** Dhan exchangeSegment → Fyers exchange prefix used in symbols. */
export function fyersExchangeFromSegment(segment?: string): "NSE" | "BSE" {
  return String(segment || "").toUpperCase().startsWith("BSE") ? "BSE" : "NSE";
}

/** Dhan productType → Fyers product type. */
export function fyersProductFromDhan(productType?: string): "INTRADAY" | "MARGIN" {
  const p = String(productType || "").toUpperCase();
  return p === "MIS" || p === "INTRADAY" ? "INTRADAY" : "MARGIN";
}

export type BrokerProxy = (r: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; json: any; text: string } | null>;

// ── OAuth helpers (no access token needed) ────────────────────

/** SHA-256 of "<appId>:<appSecret>" — Fyers `appIdHash` used at token exchange. */
export async function fyersAppIdHash(appId: string, appSecret: string): Promise<string> {
  const buf = new TextEncoder().encode(`${appId}:${appSecret}`);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** https://myapi.fyers.in/docsv3#tag/Request-and-Response-Structure */
export function buildFyersLoginUrl(appId: string, redirectUri: string, state?: string) {
  const p = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: "code",
    state: state || "indexpilot",
  });
  return `${FYERS_API}/api/v3/generate-authcode?${p.toString()}`;
}

/** Exchange the ?auth_code= returned on the redirect URI for a daily access token. */
export async function exchangeFyersAuthCode(opts: {
  appId: string;
  appSecret: string;
  authCode: string;
}): Promise<{ accessToken: string; refreshToken?: string; raw: any }> {
  const appIdHash = await fyersAppIdHash(opts.appId, opts.appSecret);
  const resp = await fetch(`${FYERS_API}/api/v3/validate-authcode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      appIdHash,
      code: opts.authCode,
    }),
  });
  const text = await resp.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!resp.ok || !json?.access_token) {
    throw new Error(json?.message || `Fyers token exchange failed (${resp.status})`);
  }
  return {
    accessToken: String(json.access_token),
    refreshToken: json?.refresh_token ? String(json.refresh_token) : undefined,
    raw: json,
  };
}

/** Decode a JWT expiry without trusting any claims beyond the timestamp. */
export function fyersTokenExpiry(accessToken: string): string | null {
  try {
    const payload = String(accessToken).split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    const exp = Number(decoded?.exp);
    return Number.isFinite(exp) ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

export class FyersService {
  private appId: string;
  private accessToken: string;
  private proxy?: BrokerProxy;

  constructor(creds: { appId: string; accessToken: string; proxy?: BrokerProxy }) {
    this.appId = creds.appId;
    this.accessToken = creds.accessToken;
    this.proxy = creds.proxy;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `${this.appId}:${this.accessToken}`,
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
      // 1️⃣ Preferred: user's dedicated static-IP VPS.
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
      // 2️⃣ Fallback: direct API from the edge.
      if (!status) {
        const resp = await fetch(`${FYERS_API}${path}`, { ...init, headers, signal: ctrl.signal });
        status = resp.status;
        text = await resp.text();
      }

      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      const failed =
        status >= 400 ||
        String(json?.s || "").toLowerCase() === "error" ||
        (json?.code !== undefined && Number(json.code) < 0);
      if (failed) {
        const err: any = new Error(json?.message || `Fyers ${status}: ${text.slice(0, 250)}`);
        err.status = status;
        err.errorCode = json?.code;
        throw err;
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── MARGIN / FUNDS ──────────────────────────────────────────
  /** https://myapi.fyers.in/docsv3#tag/Margin-Calculator (GET /api/v3/funds) */
  async getFundLimits(): Promise<any> {
    const d = await this.request("/api/v3/funds");
    const rows: any[] = Array.isArray(d?.fund_limit) ? d.fund_limit : [];
    const pick = (needle: string) =>
      Number(
        rows.find((r) => String(r?.title || "").toLowerCase().includes(needle))?.equityAmount ?? 0,
      );

    const available = pick("available balance") || pick("clear balance") || pick("total balance") || pick("balance");
    return {
      availableBalance: available,
      sodLimit: pick("total balance") || available,
      collateralAmount: pick("collaterals"),
      utilizationAmount: pick("utilized"),
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
  /** https://myapi.fyers.in/docsv3#tag/Sync-Order-Placement (POST /api/v3/orders/sync) */
  async placeOrder(req: FyersOrderRequest): Promise<{ orderId: string | null; raw: any }> {
    const body = {
      symbol: req.symbol,
      qty: Math.max(1, Number(req.quantity) || 0),
      type: req.orderType === "LIMIT" ? 1 : 2,       // 1 = LIMIT, 2 = MARKET
      side: String(req.transactionType).toUpperCase() === "SELL" ? -1 : 1,
      productType: req.product || "MARGIN",
      limitPrice: req.orderType === "LIMIT" ? Number(req.price ?? 0) : 0,
      stopPrice: 0,
      validity: req.validity || "DAY",
      disclosedQty: 0,
      offlineOrder: false,
      orderTag: "indexpilot",
    };

    const data = await this.request("/api/v3/orders/sync", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const orderId = data?.id || data?.orderNumStatus?.split(":")?.[0] || null;
    return { orderId: orderId ? String(orderId) : null, raw: data };
  }

  /** Order status by id (GET /api/v3/orders?id=). */
  async getOrderStatus(orderId: string): Promise<any> {
    const d = await this.request(`/api/v3/orders?id=${encodeURIComponent(orderId)}`);
    const book: any[] = Array.isArray(d?.orderBook) ? d.orderBook : [];
    return book.find((o) => String(o?.id) === String(orderId)) || book[0] || d;
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.request("/api/v3/orders/sync", {
        method: "DELETE",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: String(orderId) }),
      });
      return true;
    } catch { return false; }
  }

  async getOrders(): Promise<any[]> {
    const d = await this.request("/api/v3/orders");
    return Array.isArray(d?.orderBook) ? d.orderBook : [];
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * https://myapi.fyers.in/docsv3#tag/Manage-Positions (GET /api/v3/positions)
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const d = await this.request("/api/v3/positions");
    const list: any[] = Array.isArray(d?.netPositions) ? d.netPositions : [];
    return list
      .map((p) => {
        const netQty = Number(p.netQty ?? p.qty ?? 0);
        const buyQty = Number(p.buyQty ?? (netQty > 0 ? netQty : 0));
        const sellQty = Number(p.sellQty ?? (netQty < 0 ? -netQty : 0));
        const avgPrice = Number(p.netAvg ?? p.avgPrice ?? p.buyAvg ?? 0);
        const ltp = Number(p.ltp ?? 0);
        const symbol = String(p.symbol || p.fySymbol || "");
        const isBse = symbol.toUpperCase().startsWith("BSE");
        return {
          securityId: symbol,
          instrumentKey: symbol,
          tradingsymbol: symbol.split(":").pop() || symbol,
          tradingSymbol: symbol.split(":").pop() || symbol,
          fyersSymbol: symbol,
          exchangeSegment: isBse ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: String(p.productType || "MARGIN"),
          netQty,
          buyQty,
          sellQty,
          buyAvg: Number(p.buyAvg ?? avgPrice),
          sellAvg: Number(p.sellAvg ?? 0),
          costPrice: avgPrice,
          ltp,
          realizedProfit: Number(p.realized_profit ?? p.realizedProfit ?? 0),
          unrealizedProfit: Number(
            p.unrealized_profit ?? (netQty !== 0 && ltp > 0 ? (ltp - avgPrice) * netQty : 0),
          ),
          multiplier: 1,
          broker: "fyers",
          raw: p,
        };
      })
      .filter((p) => p.netQty !== 0 || p.buyQty > 0);
  }

  // ── LIVE DATA ───────────────────────────────────────────────
  /** LTP for one Fyers symbol (e.g. "NSE:NIFTY25AUG24200CE"). */
  async getLastPrice(symbol: string): Promise<number | null> {
    try {
      const d = await this.request(`/data/quotes?symbols=${encodeURIComponent(symbol)}`);
      const first: any = Array.isArray(d?.d) ? d.d[0] : null;
      const n = Number(first?.v?.lp ?? first?.v?.ltp);
      return isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }
}
