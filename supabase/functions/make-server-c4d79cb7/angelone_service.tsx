// @ts-nocheck
/**
 * 🔴 ANGEL ONE (SmartAPI) SERVICE
 *
 * Docs implemented:
 *   Auth / login / token   : https://smartapi.angelbroking.com/docs/User
 *   Funds / RMS limits     : https://smartapi.angelbroking.com/docs/User
 *   Place / cancel / book  : https://smartapi.angelbroking.com/docs/Orders
 *   Positions              : https://smartapi.angelbroking.com/docs/Portfolio
 *   Instruments            : https://smartapi.angelbroking.com/docs/Instruments
 *
 * ADDITIVE ONLY — Dhan / Zerodha / Groww / Upstox / Fyers behaviour is untouched.
 *
 * Auth model: SmartAPI login by client code + MPIN/password + TOTP → daily JWT.
 * Every secure call carries `Authorization: Bearer <jwtToken>` and `X-PrivateKey: <apiKey>`.
 */

export const ANGELONE_API = "https://apiconnect.angelone.in";

export interface AngelOneOrderRequest {
  tradingSymbol: string;             // e.g. "NIFTY28AUG2524200CE"
  symbolToken: string;               // SmartAPI numeric token
  exchange: "NFO" | "BFO";
  transactionType: "BUY" | "SELL";
  quantity: number;                  // units (lot size × lots), same as Dhan
  product?: "INTRADAY" | "CARRYFORWARD";
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  duration?: "DAY" | "IOC";
}

/** Dhan exchangeSegment → Angel One F&O exchange. */
export function angeloneExchangeFromSegment(segment?: string): "NFO" | "BFO" {
  return String(segment || "").toUpperCase().startsWith("BSE") ? "BFO" : "NFO";
}

/** Dhan productType → Angel One product type. */
export function angeloneProductFromDhan(productType?: string): "INTRADAY" | "CARRYFORWARD" {
  const p = String(productType || "").toUpperCase();
  return p === "MIS" || p === "INTRADAY" ? "INTRADAY" : "CARRYFORWARD";
}

export type BrokerProxy = (r: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; json: any; text: string } | null>;

// ── TOTP (RFC 6238) — SmartAPI login needs the 6-digit code ───────────────

function base32Decode(secret: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = String(secret || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** 6-digit TOTP for a base32 secret (30s step, SHA-1) — same as Google Authenticator. */
export async function angeloneTotp(secretBase32: string, atMs = Date.now()): Promise<string> {
  const key = base32Decode(secretBase32);
  if (!key.length) throw new Error("Invalid Angel One TOTP secret");
  const counter = Math.floor(atMs / 1000 / 30);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, buf));
  const offset = sig[sig.length - 1] & 0x0f;
  const bin =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

function baseHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": apiKey,
  };
}

/**
 * SmartAPI login (https://smartapi.angelbroking.com/docs/User).
 * `password` is the 4-digit MPIN (or the login password on older accounts).
 */
export async function angeloneLogin(opts: {
  apiKey: string;
  clientCode: string;
  password: string;
  totpSecret?: string;
  totp?: string;
}): Promise<{ jwtToken: string; refreshToken?: string; feedToken?: string; raw: any }> {
  const totp = opts.totp || (opts.totpSecret ? await angeloneTotp(opts.totpSecret) : "");
  if (!totp) throw new Error("Angel One TOTP is required (add the TOTP secret from SmartAPI → TOTP)");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  let resp: Response;
  try {
    resp = await fetch(`${ANGELONE_API}/rest/auth/angelbroking/user/v1/loginByPassword`, {
      method: "POST",
      headers: baseHeaders(opts.apiKey),
      signal: ctrl.signal,
      body: JSON.stringify({
        clientcode: String(opts.clientCode).toUpperCase(),
        password: String(opts.password),
        totp,
        state: "indexpilot",
      }),
    });
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("Angel One login timed out. Check SmartAPI availability and try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const text = await resp.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  const jwt = json?.data?.jwtToken;
  if (!resp.ok || json?.status === false || !jwt) {
    throw new Error(json?.message || `Angel One login failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  return {
    jwtToken: String(jwt).replace(/^Bearer\s+/i, ""),
    refreshToken: json?.data?.refreshToken ? String(json.data.refreshToken) : undefined,
    feedToken: json?.data?.feedToken ? String(json.data.feedToken) : undefined,
    raw: json,
  };
}

export class AngelOneService {
  private apiKey: string;
  private jwtToken: string;
  private proxy?: BrokerProxy;

  constructor(creds: { apiKey: string; jwtToken: string; proxy?: BrokerProxy }) {
    this.apiKey = creds.apiKey;
    this.jwtToken = creds.jwtToken;
    this.proxy = creds.proxy;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      ...baseHeaders(this.apiKey),
      Authorization: `Bearer ${this.jwtToken}`,
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
        const proxied = await Promise.race([
          this.proxy({
            method: String(init.method || "GET").toUpperCase(),
            path,
            headers,
            body: typeof init.body === "string" ? init.body : undefined,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.min(timeoutMs, 5_000))),
        ]);
        if (proxied) {
          status = proxied.status;
          text = proxied.text;
        }
      }
      // 2️⃣ Fallback: direct API from the edge.
      if (!status) {
        const resp = await fetch(`${ANGELONE_API}${path}`, { ...init, headers, signal: ctrl.signal });
        status = resp.status;
        text = await resp.text();
      }

      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }

      if (status >= 400 || json?.status === false) {
        const err: any = new Error(
          json?.message || `Angel One ${status}: ${text.slice(0, 250)}`,
        );
        err.status = status;
        err.errorCode = json?.errorcode;
        throw err;
      }
      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── FUNDS / RMS ─────────────────────────────────────────────
  /** https://smartapi.angelbroking.com/docs/User (GET getRMS) */
  async getFundLimits(): Promise<any> {
    const d = await this.request("/rest/secure/angelbroking/user/v1/getRMS");
    const r = d?.data || {};
    const num = (v: any) => {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    };
    const available = num(r.availablecash ?? r.net);
    return {
      availableBalance: available,
      sodLimit: num(r.net) || available,
      collateralAmount: num(r.collateral),
      utilizationAmount: num(r.utiliseddebits ?? r.utilisedpayout),
      blockedPayinAmount: 0,
      blockedPayoutAmount: 0,
      raw: r,
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

  async getProfile(): Promise<any> {
    const d = await this.request("/rest/secure/angelbroking/user/v1/getProfile");
    return d?.data || null;
  }

  // ── ORDERS ──────────────────────────────────────────────────
  /** https://smartapi.angelbroking.com/docs/Orders (POST placeOrder) */
  async placeOrder(req: AngelOneOrderRequest): Promise<{ orderId: string | null; raw: any }> {
    const body = {
      variety: "NORMAL",
      tradingsymbol: req.tradingSymbol,
      symboltoken: String(req.symbolToken),
      transactiontype: String(req.transactionType).toUpperCase(),
      exchange: req.exchange,
      ordertype: req.orderType === "LIMIT" ? "LIMIT" : "MARKET",
      producttype: req.product || "CARRYFORWARD",
      duration: req.duration || "DAY",
      price: req.orderType === "LIMIT" ? String(Number(req.price ?? 0)) : "0",
      squareoff: "0",
      stoploss: "0",
      quantity: String(Math.max(1, Number(req.quantity) || 0)),
    };

    const data = await this.request("/rest/secure/angelbroking/order/v1/placeOrder", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const orderId = data?.data?.orderid || data?.data?.uniqueorderid || null;
    return { orderId: orderId ? String(orderId) : null, raw: data };
  }

  /** Order status from the order book. */
  async getOrderStatus(orderId: string): Promise<any> {
    const book = await this.getOrders();
    return (
      book.find(
        (o: any) =>
          String(o?.orderid) === String(orderId) || String(o?.uniqueorderid) === String(orderId),
      ) || null
    );
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await this.request("/rest/secure/angelbroking/order/v1/cancelOrder", {
        method: "POST",
        body: JSON.stringify({ variety: "NORMAL", orderid: String(orderId) }),
      });
      return true;
    } catch { return false; }
  }

  async getOrders(): Promise<any[]> {
    const d = await this.request("/rest/secure/angelbroking/order/v1/getOrderBook");
    return Array.isArray(d?.data) ? d.data : [];
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * https://smartapi.angelbroking.com/docs/Portfolio (GET getPosition)
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const d = await this.request("/rest/secure/angelbroking/order/v1/getPosition");
    const list: any[] = Array.isArray(d?.data) ? d.data : [];
    return list
      .map((p) => {
        const netQty = Number(p.netqty ?? p.netQty ?? 0);
        const buyQty = Number(p.buyqty ?? (netQty > 0 ? netQty : 0));
        const sellQty = Number(p.sellqty ?? (netQty < 0 ? -netQty : 0));
        const avgPrice = Number(p.netprice ?? p.avgnetprice ?? p.buyavgprice ?? 0);
        const ltp = Number(p.ltp ?? p.lastTradedPrice ?? 0);
        const tradingSymbol = String(p.tradingsymbol || p.symbolname || "");
        const exch = String(p.exchange || "NFO").toUpperCase();
        return {
          securityId: String(p.symboltoken || tradingSymbol),
          instrumentKey: String(p.symboltoken || tradingSymbol),
          tradingsymbol: tradingSymbol,
          tradingSymbol,
          angeloneSymbolToken: String(p.symboltoken || ""),
          exchangeSegment: exch === "BFO" || exch === "BSE" ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: String(p.producttype || "CARRYFORWARD"),
          netQty,
          buyQty,
          sellQty,
          buyAvg: Number(p.buyavgprice ?? avgPrice),
          sellAvg: Number(p.sellavgprice ?? 0),
          costPrice: avgPrice,
          ltp,
          realizedProfit: Number(p.realised ?? p.realisedprofit ?? 0),
          unrealizedProfit: Number(
            p.unrealised ?? (netQty !== 0 && ltp > 0 ? (ltp - avgPrice) * netQty : 0),
          ),
          multiplier: 1,
          broker: "angelone",
          raw: p,
        };
      })
      .filter((p) => p.netQty !== 0 || p.buyQty > 0);
  }

  // ── LIVE DATA ───────────────────────────────────────────────
  /** LTP for one contract (POST getLtpData). */
  async getLastPrice(exchange: string, tradingSymbol: string, symbolToken: string): Promise<number | null> {
    try {
      const d = await this.request("/rest/secure/angelbroking/order/v1/getLtpData", {
        method: "POST",
        body: JSON.stringify({
          exchange: String(exchange || "NFO").toUpperCase(),
          tradingsymbol: tradingSymbol,
          symboltoken: String(symbolToken),
        }),
      });
      const n = Number(d?.data?.ltp);
      return isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }
}
