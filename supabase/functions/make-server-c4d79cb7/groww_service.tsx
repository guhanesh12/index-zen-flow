// @ts-nocheck
/**
 * 🟢 GROWW TRADE API SERVICE
 *
 * Docs implemented:
 *   https://groww.in/trade-api/docs/curl              (auth / headers)
 *   https://groww.in/trade-api/docs/curl/orders       (create / status / cancel / list)
 *   https://groww.in/trade-api/docs/curl/portfolio    (positions / holdings)
 *   https://groww.in/trade-api/docs/curl/margin       (available margin)
 *   https://groww.in/trade-api/docs/curl/instruments  (CSV dump → groww_instruments.tsx)
 *
 * ADDITIVE ONLY — Dhan stays the default broker and nothing here touches it.
 *
 * Auth model: the user creates a Trade API access token in Groww
 * (Profile → Trading APIs). Every call carries:
 *    Authorization: Bearer <access_token>
 *    X-API-VERSION: 1.0
 */

export const GROWW_API = "https://api.groww.in";

export interface GrowwOrderRequest {
  tradingSymbol: string;
  exchange: "NSE" | "BSE";
  segment: "FNO" | "CASH";
  transactionType: "BUY" | "SELL";
  quantity: number;
  product?: "NRML" | "MIS" | "CNC";
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  validity?: "DAY" | "IOC";
  referenceId?: string;
}

/** Dhan exchange segment → Groww exchange/segment pair */
export function growwExchangeFromSegment(segment?: string): { exchange: "NSE" | "BSE"; segment: "FNO" | "CASH" } {
  const s = String(segment || "").toUpperCase();
  if (s.startsWith("BSE")) return { exchange: "BSE", segment: s.includes("FNO") ? "FNO" : "CASH" };
  return { exchange: "NSE", segment: s.includes("EQ") && !s.includes("FNO") ? "CASH" : "FNO" };
}

/** Dhan productType → Groww product */
export function growwProductFromDhan(productType?: string): "NRML" | "MIS" | "CNC" {
  const p = String(productType || "").toUpperCase();
  if (p === "MIS" || p === "INTRADAY") return "MIS";
  if (p === "CNC" || p === "DELIVERY") return "CNC";
  return "NRML";
}

export type BrokerProxy = (r: {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; json: any; text: string } | null>;

export class GrowwService {
  private accessToken: string;
  /** Optional dedicated static-IP proxy (user's VPS). Falls back to direct calls. */
  private proxy?: BrokerProxy;

  constructor(creds: { accessToken: string; proxy?: BrokerProxy }) {
    this.accessToken = creds.accessToken;
    this.proxy = creds.proxy;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "X-API-VERSION": "1.0",
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
        const resp = await fetch(`${GROWW_API}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
        status = resp.status;
        text = await resp.text();
      }

      let json: any = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (status >= 400 || String(json?.status || "").toUpperCase() === "FAILURE") {
        const err: any = new Error(
          json?.error?.message || json?.message || `Groww ${status}: ${text.slice(0, 250)}`,
        );
        err.status = status;
        err.errorCode = json?.error?.code;
        throw err;
      }
      return json?.payload ?? json;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── MARGIN / FUNDS ──────────────────────────────────────────
  /** https://groww.in/trade-api/docs/curl/margin */
  async getFundLimits(): Promise<any> {
    const d = await this.request("/v1/margins/detail/user");
    const available = Number(d?.clear_cash ?? d?.net_margin_available ?? d?.available_margin ?? 0);
    return {
      availableBalance: available,
      sodLimit: Number(d?.brokerage_and_charges ? available : available),
      collateralAmount: Number(d?.collateral_used ?? d?.collateral_available ?? 0),
      utilizationAmount: Number(d?.net_margin_used ?? d?.margin_used ?? 0),
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
  /** https://groww.in/trade-api/docs/curl/orders */
  async placeOrder(req: GrowwOrderRequest): Promise<{ orderId: string | null; raw: any }> {
    const body: Record<string, any> = {
      trading_symbol: req.tradingSymbol,
      quantity: Math.max(1, Number(req.quantity) || 0),
      validity: req.validity || "DAY",
      exchange: req.exchange,
      segment: req.segment,
      product: req.product || "NRML",
      order_type: req.orderType || "MARKET",
      transaction_type: req.transactionType,
      order_reference_id: (req.referenceId || `IPAI${Date.now()}`).slice(0, 20),
    };
    if ((req.orderType || "MARKET") === "LIMIT") body.price = Number(req.price ?? 0);

    const data = await this.request("/v1/order/create", {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const orderId = data?.groww_order_id || data?.order_id || null;
    return { orderId: orderId ? String(orderId) : null, raw: data };
  }

  async getOrderStatus(orderId: string, segment: "FNO" | "CASH" = "FNO"): Promise<any> {
    return await this.request(
      `/v1/order/status/${encodeURIComponent(orderId)}?segment=${segment}`,
    );
  }

  async cancelOrder(orderId: string, segment: "FNO" | "CASH" = "FNO"): Promise<boolean> {
    try {
      await this.request("/v1/order/cancel", {
        method: "POST",
        headers: this.headers({ "Content-Type": "application/json" }),
        body: JSON.stringify({ groww_order_id: orderId, segment }),
      });
      return true;
    } catch { return false; }
  }

  async getOrders(): Promise<any[]> {
    const d = await this.request("/v1/order/list?segment=FNO&page=0&page_size=50");
    return Array.isArray(d?.order_list) ? d.order_list : Array.isArray(d) ? d : [];
  }

  // ── PORTFOLIO ───────────────────────────────────────────────
  /**
   * https://groww.in/trade-api/docs/curl/portfolio
   * Mapped into the SAME shape the Dhan pipeline (position monitor / UI) expects.
   */
  async getPositions(): Promise<any[]> {
    const d = await this.request("/v1/positions/user?segment=FNO");
    const list: any[] = Array.isArray(d?.positions) ? d.positions : Array.isArray(d) ? d : [];
    return list
      .map((p) => {
        const creditQty = Number(p.credit_quantity ?? p.carry_forward_credit_quantity ?? 0);
        const debitQty = Number(p.debit_quantity ?? p.carry_forward_debit_quantity ?? 0);
        const netQty = Number(p.quantity ?? creditQty - debitQty);
        const buyQty = Number(p.credit_quantity ?? p.buy_quantity ?? 0);
        const sellQty = Number(p.debit_quantity ?? p.sell_quantity ?? 0);
        const avgPrice = Number(p.credit_price ?? p.net_price ?? p.average_price ?? 0);
        const ltp = Number(p.last_price ?? p.ltp ?? 0);
        return {
          securityId: String(p.trading_symbol || ""),
          tradingsymbol: String(p.trading_symbol || ""),
          tradingSymbol: String(p.trading_symbol || ""),
          exchangeSegment: String(p.exchange || "NSE").toUpperCase() === "BSE" ? "BSE_FNO" : "NSE_FNO",
          positionType: netQty > 0 ? "LONG" : netQty < 0 ? "SHORT" : "CLOSED",
          productType: String(p.product || "NRML"),
          netQty,
          buyQty,
          sellQty,
          buyAvg: avgPrice,
          sellAvg: Number(p.debit_price ?? 0),
          costPrice: avgPrice,
          ltp,
          realizedProfit: Number(p.realised_pnl ?? p.realized_pnl ?? 0),
          unrealizedProfit: netQty !== 0 && ltp > 0 ? (ltp - avgPrice) * netQty : 0,
          multiplier: 1,
          broker: "groww",
          raw: p,
        };
      })
      .filter((p) => p.netQty !== 0 || p.buyQty > 0);
  }

  // ── LIVE DATA ───────────────────────────────────────────────
  /** LTP for one contract. exchange+segment+tradingsymbol → NSE_FNO style key */
  async getLastPrice(exchange: string, segment: string, tradingSymbol: string): Promise<number | null> {
    try {
      const key = `${exchange}_${tradingSymbol}`;
      const d = await this.request(
        `/v1/live-data/ltp?segment=${segment}&exchange_symbols=${encodeURIComponent(key)}`,
      );
      const val = d?.[key] ?? Object.values(d || {})[0];
      const n = Number(val);
      return isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }
}
