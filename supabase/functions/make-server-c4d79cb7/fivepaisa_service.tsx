// @ts-nocheck
/**
 * 🟡 5PAISA (Xstream Open API) SERVICE
 *
 * Docs implemented:
 *   OAuth login   : https://xstream.5paisa.com/dev-docs/user-authentication-system/oauth-login
 *   Access token  : https://xstream.5paisa.com/dev-docs/user-authentication-system/access-token
 *   Margin/funds  : https://xstream.5paisa.com/dev-docs/funds-management-system/margin
 *   Place order   : https://xstream.5paisa.com/dev-docs/order-management-system/place-order
 *   Cancel order  : https://xstream.5paisa.com/dev-docs/order-management-system/cancel-order
 *   Order status  : https://xstream.5paisa.com/dev-docs/order-tracking-system/order-status
 *   Order book    : https://xstream.5paisa.com/dev-docs/order-tracking-system/order-book
 *   Positions     : https://xstream.5paisa.com/dev-docs/portfolio-management-system/netwise-positions
 *   Scrip master  : https://xstream.5paisa.com/dev-docs/docFundamentals/scrip-master
 *
 * ADDITIVE ONLY — Dhan / Zerodha / Groww / Upstox / Fyers / Angel One / Aliceblue
 * behaviour is untouched.
 *
 * Auth model: OAuth (VendorKey + ResponseURL) → RequestToken on the redirect →
 * GetAccessToken(RequestToken, EncryKey, UserId) → daily Bearer access token.
 * Every request body carries { head: { key: AppKey }, body: { ClientCode, ... } }.
 */

export const FIVEPAISA_API = "https://Openapi.5paisa.com/VendorsAPI/Service1.svc";
export const FIVEPAISA_LOGIN_BASE = "https://dev-openapi.5paisa.com/WebVendorLogin/VLogin/Index";

export interface FivepaisaOrderRequest {
  scripCode: string;                 // numeric ScripCode from the scrip master
  scripData?: string;                // e.g. "BANKNIFTY 29 Mar 2023 CE 41600.00_20230329_CE_41600"
  exchange: "N" | "B";               // N = NSE, B = BSE
  exchangeType: "C" | "D" | "U";     // D = derivatives
  transactionType: "BUY" | "SELL";
  quantity: number;                  // units (lots × lot size), same as Dhan
  isIntraday?: boolean;
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  remoteOrderId?: string;
}

export type BrokerProxy = (r: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; json: any; text: string } | null>;

/** Dhan exchangeSegment → 5paisa exchange code. */
export function fivepaisaExchangeFromSegment(segment?: string): "N" | "B" {
  return String(segment || "").toUpperCase().startsWith("BSE") ? "B" : "N";
}

/** Dhan exchangeSegment → 5paisa exchange type. */
export function fivepaisaExchangeTypeFromSegment(segment?: string): "C" | "D" {
  const s = String(segment || "").toUpperCase();
  return s.includes("EQ") && !s.includes("FNO") ? "C" : "D";
}

/** Dhan productType → 5paisa IsIntraday flag. */
export function fivepaisaIntradayFromDhan(productType?: string): boolean {
  const p = String(productType || "").toUpperCase();
  return p === "MIS" || p === "INTRADAY";
}

/** 5paisa tokens expire daily at 11:59 PM IST. */
export function fivepaisaTokenExpiry(): string {
  const nowIst = new Date(Date.now() + 5.5 * 3600_000);
  const endIst = Date.UTC(
    nowIst.getUTCFullYear(),
    nowIst.getUTCMonth(),
    nowIst.getUTCDate(),
    23,
    59,
    0,
  );
  return new Date(endIst - 5.5 * 3600_000).toISOString();
}

/** OAuth dialog the user must open (5paisa redirects back with ?RequestToken=). */
export function buildFivepaisaLoginUrl(vendorKey: string, redirectUri: string, state?: string) {
  const p = new URLSearchParams({
    VendorKey: String(vendorKey || "").trim(),
    ResponseURL: redirectUri,
  });
  if (state) p.set("State", state);
  return `${FIVEPAISA_LOGIN_BASE}?${p.toString()}`;
}

/** "/Date(1637433000000+0530)/" → ISO string (5paisa wraps every timestamp like this). */
export function fivepaisaDate(value: any): string | null {
  const m = /\/Date\((-?\d+)/.exec(String(value || ""));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}

/**
 * Exchange the RequestToken from the OAuth redirect for a daily access token.
 * POST /GetAccessToken  { head:{ Key: appKey }, body:{ RequestToken, EncryKey, UserId } }
 */
export async function exchangeFivepaisaRequestToken(opts: {
  appKey: string;
  encryptionKey: string;
  userKey: string;         // "UserId" from the 5paisa API credentials (NOT the client code)
  requestToken: string;
  timeoutMs?: number;
}): Promise<{
  accessToken: string;
  clientCode: string;
  clientName?: string;
  segments: Record<string, string>;
  raw: any;
}> {
  const appKey = String(opts.appKey || "").trim();
  const encryptionKey = String(opts.encryptionKey || "").trim();
  const userKey = String(opts.userKey || "").trim();
  const requestToken = String(opts.requestToken || "").trim();
  if (!appKey || !encryptionKey || !userKey || !requestToken) {
    throw new Error("5paisa App Key, Encryption Key, User Key and RequestToken are all required");
  }

  const resp = await fetch(`${FIVEPAISA_API}/GetAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      head: { Key: appKey },
      body: { RequestToken: requestToken, EncryKey: encryptionKey, UserId: userKey },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  const text = await resp.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  const b = json?.body || {};
  const accessToken = b?.AccessToken;
  if (!resp.ok || !accessToken) {
    throw new Error(
      b?.Message ||
        json?.head?.statusDescription ||
        `5paisa token exchange failed (${resp.status}). Re-check the App Key / Encryption Key / User Key and the registered redirect URL.`,
    );
  }
  const segments: Record<string, string> = {};
  for (const k of Object.keys(b)) if (k.startsWith("Allow")) segments[k] = String(b[k]);

  return {
    accessToken: String(accessToken),
    clientCode: String(b?.ClientCode || ""),
    clientName: b?.ClientName ? String(b.ClientName) : undefined,
    segments,
    raw: b,
  };
}

export class FivepaisaService {
  private accessToken: string;
  private appKey: string;
  private clientCode: string;
  private proxy?: BrokerProxy;

  constructor(creds: {
    accessToken: string;
    appKey: string;
    clientCode: string;
    proxy?: BrokerProxy;
  }) {
    this.accessToken = creds.accessToken;
    this.appKey = creds.appKey;
    this.clientCode = creds.clientCode;
    this.proxy = creds.proxy;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extra,
    };
  }

  /** Every Xstream call is a POST with the { head, body } envelope. */
  private async post(path: string, payloadBody: Record<string, any>, timeoutMs = 8000): Promise<any> {
    const headers = this.headers();
    const body = JSON.stringify({
      head: { key: this.appKey, Key: this.appKey },
      body: { ClientCode: this.clientCode, ...payloadBody },
    });

    let status = 0;
    let text = "";

    // 1️⃣ Preferred: user's dedicated static-IP VPS.
    if (this.proxy) {
      const proxied = await Promise.race([
        this.proxy({ method: "POST", path, headers, body }),
        new Promise<null>((r) => setTimeout(() => r(null), timeoutMs + 2000)),
      ]);
      if (proxied) {
        status = proxied.status;
        text = proxied.text;
      }
    }

    // 2️⃣ Fallback: direct API from the edge.
    if (!status) {
      const resp = await fetch(`${FIVEPAISA_API}${path}`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = resp.status;
      text = await resp.text();
    }

    let json: any = {};
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    const headStatus = String(json?.head?.status ?? "0");
    const bodyStatus = Number(json?.body?.Status ?? 0);
    if (status >= 400 || (headStatus !== "0" && headStatus !== "") || bodyStatus === 9) {
      const err: any = new Error(
        json?.body?.Message ||
          json?.head?.statusDescription ||
          `5paisa ${status}: ${text.slice(0, 250)}`,
      );
      err.status = status;
      if (bodyStatus === 9) err.code = "TOKEN_EXPIRED";
      throw err;
    }
    return json?.body ?? json;
  }

  // ── FUNDS ───────────────────────────────────────────────────
  /** POST /V4/Margin */
  async getFundLimits(): Promise<any> {
    const d = await this.post("/V4/Margin", {});
    const m = Array.isArray(d?.EquityMargin) ? (d.EquityMargin[0] || {}) : (d?.EquityMargin || {});
    const num = (...keys: string[]) => {
      for (const k of keys) {
        const n = Number(m?.[k]);
        if (Number.isFinite(n) && n !== 0) return n;
      }
      return 0;
    };
    const available = num("NetAvailableMargin", "AvailableMargin", "Cash");
    return {
      availableBalance: available,
      sodLimit: num("Cash", "FundsPayIn") || available,
      collateralAmount: num("Collateral", "CollateralValueAfterHairCut"),
      utilizationAmount: num("MarginUtilized", "MarginUsedForOpenPosition"),
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
  /** POST /V1/PlaceOrderRequest — MARKET + DAY by default. */
  async placeOrder(req: FivepaisaOrderRequest): Promise<{
    orderId: string | null;
    exchangeOrderId: string | null;
    remoteOrderId: string;
    raw: any;
  }> {
    const remoteOrderId = String(req.remoteOrderId || `IP${Date.now()}${Math.floor(Math.random() * 1000)}`);
    const isLimit = req.orderType === "LIMIT";
    const payload: Record<string, any> = {
      Exchange: req.exchange,
      ExchangeType: req.exchangeType,
      ScripCode: String(req.scripCode),
      Price: isLimit ? Number(req.price ?? 0) : 0,
      StopLossPrice: 0,
      OrderType: String(req.transactionType).toUpperCase() === "SELL" ? "S" : "B",
      Qty: Math.max(1, Number(req.quantity) || 0),
      DisQty: 0,
      IsIntraday: !!req.isIntraday,
      AHPlaced: "N",
      iOrderValidity: 0,          // 0 = DAY
      RemoteOrderID: remoteOrderId,
      AlgoID: 0,
    };
    if (req.scripData) payload.ScripData = req.scripData;

    const d = await this.post("/V1/PlaceOrderRequest", payload);
    const rms = Number(d?.Status ?? 0);
    if (rms !== 0 && !d?.BrokerOrderID) {
      throw new Error(d?.Message || "5paisa rejected the order");
    }
    return {
      orderId: d?.BrokerOrderID ? String(d.BrokerOrderID) : null,
      exchangeOrderId: d?.ExchOrderID && String(d.ExchOrderID) !== "0" ? String(d.ExchOrderID) : null,
      remoteOrderId,
      raw: d,
    };
  }

  /** POST /V3/OrderStatus (by RemoteOrderID) with an order-book fallback. */
  async getOrderStatus(orderId: string, opts: { remoteOrderId?: string; exchange?: "N" | "B" } = {}): Promise<any> {
    if (opts.remoteOrderId) {
      try {
        const d = await this.post("/V3/OrderStatus", {
          OrdStatusReqList: [{ Exch: opts.exchange || "N", RemoteOrderID: String(opts.remoteOrderId) }],
        });
        const row = (d?.OrdStatusResLst || [])[0];
        if (row) return row;
      } catch { /* fall through to order book */ }
    }
    const orders = await this.getOrders();
    return (
      orders.find(
        (o: any) =>
          String(o?.BrokerOrderId ?? o?.BrokerOrderID ?? "") === String(orderId) ||
          String(o?.RemoteOrderID ?? "") === String(opts.remoteOrderId || ""),
      ) || null
    );
  }

  /** POST /V3/OrderBook */
  async getOrders(): Promise<any[]> {
    const d = await this.post("/V3/OrderBook", {});
    return Array.isArray(d?.OrderBookDetail) ? d.OrderBookDetail : [];
  }

  /** POST /V1/CancelOrderRequest — 5paisa cancels by ExchOrderID. */
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      let exchOrderId = String(orderId);
      if (!/^\d{10,}$/.test(exchOrderId)) {
        const orders = await this.getOrders();
        const row = orders.find(
          (o: any) => String(o?.BrokerOrderId ?? o?.BrokerOrderID ?? "") === String(orderId),
        );
        if (row?.ExchOrderID) exchOrderId = String(row.ExchOrderID);
      }
      const d = await this.post("/V1/CancelOrderRequest", { ExchOrderID: exchOrderId, ExchOrderId: exchOrderId });
      return Number(d?.Status ?? 0) === 0;
    } catch {
      return false;
    }
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * POST /V3/NetPositionNetWise
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const d = await this.post("/V3/NetPositionNetWise", {});
    const list: any[] = Array.isArray(d?.NetPositionDetail) ? d.NetPositionDetail : [];
    return list
      .map((p) => {
        const buyQty = Number(p.BuyQty ?? 0);
        const sellQty = Number(p.SellQty ?? 0);
        const netQty = Number(p.NetQty ?? buyQty - sellQty);
        const buyAvg = Number(p.BuyAvgRate ?? 0);
        const sellAvg = Number(p.SellAvgRate ?? 0);
        const avgPrice = netQty >= 0 ? buyAvg || sellAvg : sellAvg || buyAvg;
        const ltp = Number(p.LTP ?? p.LastRate ?? 0);
        const exch = String(p.Exch || "N").toUpperCase();
        const tsym = String(p.ScripName || p.Symbol || "");
        return {
          securityId: String(p.ScripCode || tsym),
          instrumentKey: String(p.ScripCode || tsym),
          tradingsymbol: tsym,
          tradingSymbol: tsym,
          fivepaisaScripCode: String(p.ScripCode || ""),
          fivepaisaScripData: String(p.ScripData || ""),
          exchangeSegment: exch === "B" ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: String(p.OrderFor || p.DelvIntra || "D") === "I" ? "INTRADAY" : "MARGIN",
          netQty,
          buyQty,
          sellQty,
          buyAvg,
          sellAvg,
          costPrice: avgPrice,
          ltp,
          realizedProfit: Number(p.BookedPL ?? 0),
          unrealizedProfit: Number(
            p.MTOM ?? (netQty !== 0 && ltp > 0 ? (ltp - avgPrice) * netQty : 0),
          ),
          multiplier: Number(p.Multiplier ?? 1) || 1,
          broker: "5paisa",
          raw: p,
        };
      })
      .filter((p) => p.netQty !== 0 || p.buyQty > 0);
  }

  /** POST /MarketFeed — used only as a fallback; IndexPilot's central feed is preferred. */
  async getLastPrice(exchange: "N" | "B", exchangeType: "C" | "D", scripCode: string): Promise<number | null> {
    try {
      const d = await this.post("/MarketFeed", {
        MarketFeedData: [{ Exch: exchange, ExchType: exchangeType, ScripCode: Number(scripCode) }],
        ClientLoginType: 0,
        LastRequestTime: "/Date(0)/",
        RefreshRate: "H",
      });
      const row = (d?.Data || [])[0];
      const ltp = Number(row?.LastRate ?? row?.LastTradedPrice);
      return Number.isFinite(ltp) && ltp > 0 ? ltp : null;
    } catch {
      return null;
    }
  }
}
