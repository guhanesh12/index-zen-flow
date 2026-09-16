// @ts-nocheck
/**
 * Demo API router. Only active in demo mode (`?demo=1`).
 * Every handler returns fake, in-browser data — no request ever leaves the page.
 */
import {
  DEMO_USER,
  DEMO_SESSION_USER,
  DEMO_SIGNALS,
  DEMO_ORDERS,
  DEMO_LOGS,
  DEMO_JOURNAL,
  DEMO_WALLET,
  DEMO_REFERRAL,
  DEMO_BACKTEST,
  DEMO_SUPPORT_TICKETS,
  DEMO_ENGINE,
  demoPositions,
  demoQuotes,
  demoTotalPnl,
} from './demoData';

export const DEMO_ACCESS_TOKEN = buildDemoJwt();

function b64url(obj: any) {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildDemoJwt() {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({
      sub: DEMO_USER.id,
      email: DEMO_USER.email,
      role: 'authenticated',
      aud: 'authenticated',
      iat: now,
      exp: now + 60 * 60 * 24,
      user_metadata: { full_name: DEMO_USER.full_name, demo: true },
    }),
    'demo-signature',
  ].join('.');
}

export function demoSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: DEMO_ACCESS_TOKEN,
    refresh_token: 'demo-refresh-token',
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: now + 86400,
    user: DEMO_SESSION_USER,
  };
}

const DEMO_BROKERS = [
  { id: 'dhan', name: 'Dhan', color: '#f97316', features: ['orders', 'positions', 'live-data'] },
  { id: 'zerodha', name: 'Zerodha', color: '#387ed1', features: ['orders', 'positions'] },
  { id: 'angelone', name: 'Angel One', color: '#e11d48', features: ['orders', 'positions'] },
  { id: 'upstox', name: 'Upstox', color: '#7c3aed', features: ['orders', 'positions'] },
  { id: 'fyers', name: 'Fyers', color: '#0ea5e9', features: ['orders', 'positions'] },
  { id: 'groww', name: 'Groww', color: '#22c55e', features: ['orders', 'positions'] },
];

/** PIN state lives in memory so the demo can show "create PIN" then "unlock". */
const pinState = { hasPin: false, pin: '' };

const ok = (body: any) => ({ status: 200, body: { success: true, ...body } });

type Handler = (ctx: { path: string; url: URL; method: string; body: any }) => { status: number; body: any };

const routes: Array<[RegExp, Handler]> = [
  // ── Supabase auth ────────────────────────────────────────────────
  [/\/auth\/v1\/(token|signup|verify|otp|magiclink)/, () => ({ status: 200, body: demoSession() })],
  [/\/auth\/v1\/user/, () => ({ status: 200, body: DEMO_SESSION_USER })],
  [/\/auth\/v1\/logout/, () => ({ status: 204, body: {} })],
  [/\/rest\/v1\//, () => ({ status: 200, body: [] })],

  // ── PIN ─────────────────────────────────────────────────────────
  [/\/user-pin\/status/, () => ({ status: 200, body: { success: true, hasPin: pinState.hasPin, pinSet: pinState.hasPin, locked: false } })],
  [/\/user-pin\/set/, ({ body }) => {
    pinState.hasPin = true;
    pinState.pin = String(body?.pin || '');
    return { status: 200, body: { success: true, message: 'PIN created', hasPin: true } };
  }],
  [/\/user-pin\/verify/, ({ body }) => {
    const good = !pinState.hasPin || String(body?.pin || '') === pinState.pin;
    return good
      ? { status: 200, body: { success: true, verified: true } }
      : { status: 401, body: { success: false, message: 'Incorrect PIN', attemptsLeft: 4 } };
  }],
  [/\/user-pin\/(forgot|reset)/, () => ({ status: 200, body: { success: true, message: 'OTP sent to your registered mobile and email' } })],

  // ── Signup / login / OTP on the app server ──────────────────────
  [/\/(auth\/)?send-otp/, () => ok({ message: 'OTP sent successfully', otpSent: true, demoOtp: '123456' })],
  [/\/(auth\/)?verify-otp/, () => ok({ verified: true, message: 'OTP verified', token: DEMO_ACCESS_TOKEN, user: DEMO_USER })],
  [/\/auth\/(register|signup|login)/, () => ok({ token: DEMO_ACCESS_TOKEN, accessToken: DEMO_ACCESS_TOKEN, user: DEMO_USER, session: demoSession() })],
  [/\/auth\/check-email/, () => ok({ exists: false, available: true })],

  // ── Profile / referral / notifications ──────────────────────────
  [/\/profile\/me|\/user\/profile|\/auth\/me/, () => ok({ user: DEMO_USER, profile: DEMO_USER, data: DEMO_USER })],
  [/\/referral\/(my|settings|validate)/, () => ok({ ...DEMO_REFERRAL, referral: DEMO_REFERRAL, valid: true })],
  [/\/notification|\/push\/history/, () => ok({ notifications: [], unreadCount: 0, count: 0 })],

  // ── Wallet ───────────────────────────────────────────────────────
  [/\/wallet\/balance/, () => ok({ balance: DEMO_WALLET.balance, wallet: DEMO_WALLET })],
  [/\/wallet\/transactions/, () => ok({ transactions: DEMO_WALLET.transactions })],
  [/\/wallet\/daily-stats/, () => ok({ stats: { spentToday: 60, signalsToday: 2 } })],
  [/\/wallet\/(create-recharge-order|initialize)/, ({ body }) => {
    const amount = Number(body?.amount || 5000);
    return ok({ orderId: 'order_demo_recharge', amount, currency: 'INR', demo: true, key: 'rzp_test_demo' });
  }],
  [/\/wallet\/verify-payment/, ({ body }) => {
    const amount = Number(body?.amount || 5000);
    DEMO_WALLET.balance += amount;
    DEMO_WALLET.transactions.unshift({
      id: `tx-${Date.now()}`, type: 'CREDIT', amount, status: 'SUCCESS',
      description: 'Wallet recharge (UPI)', createdAt: new Date().toISOString(),
    });
    return ok({ balance: DEMO_WALLET.balance, message: 'Recharge successful' });
  }],

  // ── Broker ───────────────────────────────────────────────────────
  [/\/broker\/active/, () => ok({
    activeBroker: 'dhan',
    activeBrokerName: 'Dhan',
    chosen: true,
    connected: true,
    status: 'CONNECTED',
    available: { dhan: true, zerodha: false, upstox: false, fyers: false, angelone: false, groww: false, aliceblue: false, '5paisa': false },
    brokers: DEMO_BROKERS,
  })],
  [/\/broker\/(list|connections|slots|registry)/, () => ok({ brokers: DEMO_BROKERS })],
  [/\/api-credentials/, () => ok({
    isConfigured: true,
    status: 'CONFIGURED',
    credentials: { dhanClientId: 'DEMO1001', dhanAccessToken: 'demo-token-****' },
  })],
  [/\/(test-api-connection|test-connection|test-dhan|update-access-token|broker\/.*\/(connect|consume|callback))/, () =>
    ok({ connected: true, message: 'Broker connected successfully (demo)' })],
  [/\/fund-limits/, () => ok({
    funds: { availableBalance: 248500, sodLimit: 250000, utilizationAmount: 21400, collateralAmount: 0, blockedPayinAmount: 0, blockedPayoutAmount: 0 },
  })],

  // ── Market data & signals ───────────────────────────────────────
  [/\/market-quote|\/quotes/, ({ body }: any) => {
    const quotes = demoQuotes();
    const want = String(body?.securityId ?? body?.symbol ?? '').toUpperCase();
    const hit =
      quotes.find((q) => q.symbol.toUpperCase() === want || String(q.securityId) === want) || quotes[0];
    return ok({ quotes, quote: hit, ltp: hit.ltp });
  }],
  [/\/intraday-ohlc|\/ohlc-data/, ({ body }: any) => {
    const key = String(body?.securityId ?? body?.symbol ?? '').toUpperCase();
    const map: any = { '13': 'NIFTY', '25': 'BANKNIFTY', '51': 'SENSEX' };
    return ok({ candles: demoCandles(map[key] || key || 'NIFTY') });
  }],
  [/\/market-intel\/technical/, () => ok({ indices: demoTechnicals() })],
  [/\/market-intel\/movers/, () => ok({
    gainers: [
      { symbol: 'RELIANCE', ltp: 1462.3, changePercent: 2.4 },
      { symbol: 'HDFCBANK', ltp: 1721.05, changePercent: 1.9 },
      { symbol: 'INFY', ltp: 1548.6, changePercent: 1.4 },
    ],
    losers: [
      { symbol: 'TATASTEEL', ltp: 158.4, changePercent: -1.8 },
      { symbol: 'ITC', ltp: 408.15, changePercent: -1.1 },
    ],
  })],
  [/\/market-intel\/news/, () => ok({
    items: [
      { headline: 'Indices hold gains as banking stocks lead the session', source: 'Market Desk', publishedAt: new Date().toISOString() },
      { headline: 'FIIs turn net buyers in the index futures segment', source: 'Market Desk', publishedAt: new Date().toISOString() },
      { headline: 'IT pack recovers on steady global cues', source: 'Market Desk', publishedAt: new Date().toISOString() },
      { headline: 'Volatility index cools, supporting intraday trend trades', source: 'Market Desk', publishedAt: new Date().toISOString() },
    ],
  })],
  [/\/(advanced-ai-signal|ai-trading-signal|signals|signal-history|central-market)/, () => ok({
    signals: DEMO_SIGNALS, signal: DEMO_SIGNALS[0], history: DEMO_SIGNALS,
  })],
  [/\/analyze-symbol|\/search-option|\/search-dhan-instruments|\/instruments/, () => ok({
    instruments: [
      { symbol: 'NIFTY 24800 CE', securityId: '43921', lotSize: 65 },
      { symbol: 'BANKNIFTY 54200 CE', securityId: '51204', lotSize: 30 },
    ],
  })],
  [/\/symbols|\/auto-symbol\/config|\/sync-user-symbol/, () => ok({
    symbols: [
      { symbol: 'NIFTY', enabled: true, lotSize: 65, lots: 2 },
      { symbol: 'BANKNIFTY', enabled: true, lotSize: 30, lots: 1 },
      { symbol: 'SENSEX', enabled: true, lotSize: 20, lots: 1 },
    ],
    config: { autoSelect: true, maxLots: 2 },
    saved: true,
  })],

  // ── Engine, positions, orders ───────────────────────────────────
  [/\/engine\/db-status|\/engine\/status/, () => ok({ ...DEMO_ENGINE, engine: DEMO_ENGINE })],
  [/\/engine\/(start|stop|toggle)/, ({ path }) => ok({ ...DEMO_ENGINE, running: !path.includes('stop'), message: path.includes('stop') ? 'Engine stopped' : 'Engine started' })],
  [/\/(live-)?positions/, () => ok({ broker: 'dhan', positions: demoPositions(), data: demoPositions(), totalPnl: demoTotalPnl() })],
  [/\/position-monitor\/(list|update)|\/monitor-position/, () => ok({ positions: demoMonitorRows() })],
  [/\/(place-order|execute-trade|execute-dhan-order|test-dhan-order)/, ({ body }) => ok({
    orderId: `ORD-DEMO-${Math.floor(Math.random() * 900000 + 100000)}`,
    brokerOrderId: `11250913${Math.floor(Math.random() * 90000 + 10000)}`,
    status: 'COMPLETE',
    orderType: 'MARKET',
    transactionType: body?.transactionType || 'BUY',
    quantity: body?.quantity || 65,
    message: 'Order placed successfully (demo)',
  })],
  [/\/orders|\/order-logs|\/trading\/trades/, () => ok({ orders: DEMO_ORDERS, data: DEMO_ORDERS, logs: DEMO_ORDERS })],
  [/\/logs/, ({ method }) => (method === 'POST' ? ok({ saved: true }) : ok({ logs: DEMO_LOGS, data: DEMO_LOGS }))],

  // ── Journal, strategy, backtest, support ────────────────────────
  [/\/get-journal-entries|\/journal/, () => ok({ entries: DEMO_JOURNAL, journal: DEMO_JOURNAL, data: DEMO_JOURNAL })],
  [/\/(backtest|strategy-backtest|run-backtest)/, () => ({ status: 200, body: { ...DEMO_BACKTEST, results: DEMO_BACKTEST.summary, result: DEMO_BACKTEST.summary } })],
  [/\/user\/custom-strategies|\/strategy/, () => ok({
    strategies: [{ id: 'STG-IPAI-V3', name: 'IndexPilot V3', enabled: true, minConfidence: 75, maxTradesPerIndex: 1, entryStart: '09:30', entryEnd: '15:00' }],
    strategy: { id: 'STG-IPAI-V3', name: 'IndexPilot V3', enabled: true },
  })],
  [/\/support\/(tickets|create|mark-read)/, ({ method }) =>
    ok(method === 'POST'
      ? { ticketId: 'TCK-DEMO-15', message: 'Ticket created, our team will reply shortly' }
      : { tickets: DEMO_SUPPORT_TICKETS, data: DEMO_SUPPORT_TICKETS })],
  [/\/pnl\/save|\/sync-manual-trades/, () => ok({ saved: true })],
  [/\/landing\//, () => ok({ content: {}, pages: [], links: [] })],
  [/\/analytics\//, () => ok({ tracked: true })],
  [/\/health/, () => ok({ status: 'ok', demo: true })],
];

function demoTechnicals() {
  const out: any = {};
  const conf: any = {
    NIFTY: { base: 24812.45, rsi: 61.4 },
    BANKNIFTY: { base: 54260.8, rsi: 58.9 },
    SENSEX: { base: 81234.2, rsi: 63.1 },
  };
  for (const name of Object.keys(conf)) {
    const { base, rsi } = conf[name];
    out[name] = {
      ok: true,
      bias: 'Bullish',
      sma: { period: 20, value: +(base * 0.997).toFixed(2), action: 'Buy' },
      ema: { period: 20, value: +(base * 0.998).toFixed(2), action: 'Buy' },
      rsi: { value: rsi, action: 'Buy' },
      macdHist: { value: 12.4, action: 'Buy' },
      pivot: {
        PP: +(base * 0.999).toFixed(2),
        R1: +(base * 1.004).toFixed(2),
        S1: +(base * 0.994).toFixed(2),
      },
    };
  }
  return out;
}

function demoMonitorRows() {
  return demoPositions().map((p, i) => {
    const target = Math.round(Math.abs(p.target - p.entryPrice) * p.netQty);
    const stop = Math.round(Math.abs(p.entryPrice - p.stopLoss) * p.netQty);
    return {
      id: `mon-demo-${i + 1}`,
      order_id: `ORD-DEMO-00024${i + 1}`,
      symbol: p.tradingSymbol,
      index_name: p.tradingSymbol.split(' ')[0],
      entry_price: p.entryPrice,
      current_price: p.ltp,
      quantity: p.netQty,
      pnl: p.pnl,
      highest_pnl: Math.max(p.pnl, Math.round(p.pnl * 1.18)),
      target_amount: target,
      stop_loss_amount: stop,
      trailing_enabled: true,
      trailing_step: 250,
      created_at: p.entryTime,
      updated_at: new Date().toISOString(),
      raw_position: {
        ...p,
        index: p.tradingSymbol.split(' ')[0],
        lotSize: p.lotSize,
        monitorDecision: 'HOLD',
        marketFavorable: true,
        momentumScore: 68,
        giveBackPct: 12,
        heldMinutes: 45,
        currentTargetAmount: target,
        currentStopLossAmount: Math.round(stop * 0.4),
        trailingActive: true,
        trailingEnabled: true,
        profitLocked: true,
      },
    };
  });
}

function demoCandles(index = 'NIFTY') {
  const bases: any = { NIFTY: 24680, BANKNIFTY: 54010, SENSEX: 80890 };
  const base = bases[index] || bases.NIFTY;
  const out = [];
  let price = base;
  const now = Date.now();
  for (let i = 0; i < 60; i++) {
    const step = (Math.sin(i / 4) * 18 + i * 2.1) * (base / 24680);
    const open = price;
    const close = base + step;
    const high = Math.max(open, close) + 9;
    const low = Math.min(open, close) - 9;
    out.push({
      timestamp: now - (60 - i) * 15 * 60000,
      open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2),
      volume: 120000 + i * 900,
    });
    price = close;
  }
  return out;
}

export function handleDemoRequest(url: string, init: RequestInit = {}) {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.origin);
  } catch {
    return null;
  }
  const path = parsed.pathname;
  const method = (init.method || 'GET').toUpperCase();
  let body: any = {};
  try {
    body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
  } catch {
    body = {};
  }

  for (const [pattern, handler] of routes) {
    if (pattern.test(path)) {
      const res = handler({ path, url: parsed, method, body });
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Unknown API call in demo mode: never fail the UI, answer with an empty success.
  return new Response(JSON.stringify({ success: true, demo: true, data: [], items: [], results: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
