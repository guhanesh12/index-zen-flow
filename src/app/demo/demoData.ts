// @ts-nocheck
/**
 * Deterministic demo dataset used ONLY when the app is opened in demo mode
 * (`?demo=1`). Nothing here touches the real database, broker or payments.
 * All numbers are illustrative sample data for the product demo video.
 */

const START = Date.now();

export const DEMO_USER = {
  id: 'demo-user-0001',
  email: 'demo@indexpilotai.com',
  full_name: 'Demo User',
  fullName: 'Demo User',
  name: 'Demo User',
  mobile: '+91 90000 00000',
  phone: '+91 90000 00000',
  clientId: 'IPAI-DEMO-1001',
  client_id: 'IPAI-DEMO-1001',
  role: 'user',
  created_at: new Date(START - 86400000 * 42).toISOString(),
  isDemo: true,
};

export const DEMO_SESSION_USER = {
  id: DEMO_USER.id,
  aud: 'authenticated',
  role: 'authenticated',
  email: DEMO_USER.email,
  phone: '',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: DEMO_USER.full_name, mobile: DEMO_USER.mobile, demo: true },
  created_at: DEMO_USER.created_at,
  updated_at: DEMO_USER.created_at,
  email_confirmed_at: DEMO_USER.created_at,
  confirmed_at: DEMO_USER.created_at,
  identities: [],
};

/** seconds since the demo started — drives the "live" feel of P&L */
const elapsed = () => (Date.now() - START) / 1000;

/** smooth, deterministic drift so profits tick without looking random */
function drift(seed: number, amplitude: number, period: number) {
  const t = elapsed();
  return (
    amplitude * (0.55 * Math.sin((t + seed * 7) / period) + 0.45 * Math.sin((t + seed * 3) / (period * 0.37)))
  );
}

export const DEMO_INDICES = [
  { symbol: 'NIFTY', name: 'NIFTY 50', base: 24812.45, lot: 65, seed: 1 },
  { symbol: 'BANKNIFTY', name: 'NIFTY BANK', base: 54260.8, lot: 30, seed: 2 },
  { symbol: 'SENSEX', name: 'BSE SENSEX', base: 81234.2, lot: 20, seed: 3 },
];

export function demoQuotes() {
  return DEMO_INDICES.map((i) => {
    const move = drift(i.seed, i.base * 0.0015, 26) + i.base * 0.0021;
    const ltp = +(i.base + move).toFixed(2);
    const change = +(ltp - i.base).toFixed(2);
    return {
      symbol: i.symbol,
      name: i.name,
      ltp,
      last_price: ltp,
      close: i.base,
      open: +(i.base - i.base * 0.0008).toFixed(2),
      high: +(ltp + i.base * 0.0009).toFixed(2),
      low: +(i.base - i.base * 0.0014).toFixed(2),
      change,
      changePercent: +((change / i.base) * 100).toFixed(2),
      volume: 1284000,
    };
  });
}

/** Open positions that gain money while the video is running. */
export function demoPositions() {
  const rows = [
    { symbol: 'NIFTY 24800 CE', security: '43921', lots: 2, lot: 65, entry: 142.4, seed: 4, amp: 9 },
    { symbol: 'BANKNIFTY 54200 CE', security: '51204', lots: 1, lot: 30, entry: 318.65, seed: 5, amp: 18 },
  ];
  return rows.map((r) => {
    const qty = r.lots * r.lot;
    const ltp = +(r.entry + r.amp * 0.55 + drift(r.seed, r.amp, 19)).toFixed(2);
    const pnl = +((ltp - r.entry) * qty).toFixed(2);
    return {
      tradingSymbol: r.symbol,
      trading_symbol: r.symbol,
      symbol: r.symbol,
      securityId: r.security,
      exchangeSegment: 'NSE_FNO',
      productType: 'INTRADAY',
      positionType: 'LONG',
      netQty: qty,
      quantity: qty,
      lotSize: r.lot,
      lots: r.lots,
      buyAvg: r.entry,
      avgPrice: r.entry,
      entryPrice: r.entry,
      lastTradedPrice: ltp,
      ltp,
      currentPrice: ltp,
      unrealizedProfit: pnl,
      unrealisedProfit: pnl,
      pnl,
      pnlPercent: +(((ltp - r.entry) / r.entry) * 100).toFixed(2),
      stopLoss: +(r.entry - r.amp * 1.6).toFixed(2),
      target: +(r.entry + r.amp * 3).toFixed(2),
      trailingStopLoss: +(r.entry + r.amp * 0.2).toFixed(2),
      status: 'OPEN',
      entryTime: new Date(START - 45 * 60000).toISOString(),
    };
  });
}

export function demoTotalPnl() {
  return demoPositions().reduce((s, p) => s + p.pnl, 0);
}

const istTime = (minsAgo: number) =>
  new Date(START - minsAgo * 60000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export const DEMO_SIGNALS = [
  {
    signalId: 'SIG-DEMO-0913-0945-NIFTY',
    signal_code: 'SIG-DEMO-0913-0945-NIFTY',
    index: 'NIFTY',
    symbol: 'NIFTY',
    action: 'BUY_CALL',
    direction: 'BUY_CALL',
    signal: 'BUY CALL',
    strike: 24800,
    optionType: 'CE',
    confidence: 86,
    adx: 27.4,
    marketState: 'Trending',
    bias: 'Bullish',
    entry: 142.4,
    stopLoss: 128.0,
    target: 178.5,
    time: istTime(48),
    timestamp: START - 48 * 60000,
    status: 'EXECUTED',
    note: 'Trend + momentum confirmed on the closed 15-minute candle.',
  },
  {
    signalId: 'SIG-DEMO-0913-1015-BANKNIFTY',
    signal_code: 'SIG-DEMO-0913-1015-BANKNIFTY',
    index: 'BANKNIFTY',
    symbol: 'BANKNIFTY',
    action: 'BUY_CALL',
    direction: 'BUY_CALL',
    signal: 'BUY CALL',
    strike: 54200,
    optionType: 'CE',
    confidence: 81,
    adx: 24.1,
    marketState: 'Trending',
    bias: 'Bullish',
    entry: 318.65,
    stopLoss: 289.0,
    target: 378.0,
    time: istTime(22),
    timestamp: START - 22 * 60000,
    status: 'EXECUTED',
    note: 'Breakout confirmed with rising volume and positive DI spread.',
  },
  {
    signalId: 'SIG-DEMO-0913-1100-SENSEX',
    signal_code: 'SIG-DEMO-0913-1100-SENSEX',
    index: 'SENSEX',
    symbol: 'SENSEX',
    action: 'WAIT',
    direction: 'WAIT',
    signal: 'WAIT',
    confidence: 62,
    adx: 17.2,
    marketState: 'Range',
    bias: 'Neutral',
    time: istTime(6),
    timestamp: START - 6 * 60000,
    status: 'WAIT',
    note: 'Sideways structure — below the minimum confidence, no trade taken.',
  },
];

export const DEMO_ORDERS = [
  {
    orderId: 'ORD-DEMO-000241',
    order_code: 'ORD-DEMO-000241',
    brokerOrderId: '1125091300241',
    dhan_order_id: '1125091300241',
    signalId: DEMO_SIGNALS[0].signalId,
    signal_code: DEMO_SIGNALS[0].signalId,
    strategy_id: 'STG-IPAI-V3',
    algo_id: 'ALGO-IPAI-DEMO-1001',
    symbol: 'NIFTY 24800 CE',
    tradingSymbol: 'NIFTY 24800 CE',
    transactionType: 'BUY',
    side: 'BUY',
    orderType: 'MARKET',
    quantity: 130,
    average_price: 142.4,
    averagePrice: 142.4,
    price: 142.4,
    status: 'COMPLETE',
    broker: 'dhan',
    createdAt: new Date(START - 48 * 60000).toISOString(),
    time: istTime(48),
  },
  {
    orderId: 'ORD-DEMO-000242',
    order_code: 'ORD-DEMO-000242',
    brokerOrderId: '1125091300242',
    dhan_order_id: '1125091300242',
    signalId: DEMO_SIGNALS[1].signalId,
    signal_code: DEMO_SIGNALS[1].signalId,
    strategy_id: 'STG-IPAI-V3',
    algo_id: 'ALGO-IPAI-DEMO-1001',
    symbol: 'BANKNIFTY 54200 CE',
    tradingSymbol: 'BANKNIFTY 54200 CE',
    transactionType: 'BUY',
    side: 'BUY',
    orderType: 'MARKET',
    quantity: 30,
    average_price: 318.65,
    averagePrice: 318.65,
    price: 318.65,
    status: 'COMPLETE',
    broker: 'dhan',
    createdAt: new Date(START - 22 * 60000).toISOString(),
    time: istTime(22),
  },
  {
    orderId: 'ORD-DEMO-000240',
    order_code: 'ORD-DEMO-000240',
    brokerOrderId: '1125091300240',
    dhan_order_id: '1125091300240',
    signalId: 'SIG-DEMO-0912-1345-NIFTY',
    signal_code: 'SIG-DEMO-0912-1345-NIFTY',
    strategy_id: 'STG-IPAI-V3',
    algo_id: 'ALGO-IPAI-DEMO-1001',
    symbol: 'NIFTY 24750 PE',
    tradingSymbol: 'NIFTY 24750 PE',
    transactionType: 'SELL',
    side: 'SELL',
    orderType: 'MARKET',
    quantity: 65,
    average_price: 164.2,
    averagePrice: 164.2,
    price: 164.2,
    status: 'COMPLETE',
    broker: 'dhan',
    createdAt: new Date(START - 26 * 3600000).toISOString(),
    time: '13:45',
  },
];

export const DEMO_LOGS = [
  { timestamp: START - 49 * 60000, type: 'ENGINE', message: 'Engine started · 15m slot · NIFTY, BANKNIFTY, SENSEX' },
  { timestamp: START - 48 * 60000, type: 'SIGNAL', message: 'NIFTY BUY CALL 24800 · confidence 86% · ADX 27.4' },
  { timestamp: START - 48 * 60000, type: 'ORDER', message: 'Market BUY 130 qty NIFTY 24800 CE @ 142.40 · order 1125091300241' },
  { timestamp: START - 30 * 60000, type: 'MONITOR', message: 'NIFTY position moved to break-even, trailing stop armed' },
  { timestamp: START - 22 * 60000, type: 'SIGNAL', message: 'BANKNIFTY BUY CALL 54200 · confidence 81% · ADX 24.1' },
  { timestamp: START - 22 * 60000, type: 'ORDER', message: 'Market BUY 30 qty BANKNIFTY 54200 CE @ 318.65 · order 1125091300242' },
  { timestamp: START - 6 * 60000, type: 'SIGNAL', message: 'SENSEX WAIT · sideways structure, trade skipped' },
];

export const DEMO_JOURNAL = [
  {
    id: 'jr-1',
    date: new Date(START).toISOString().slice(0, 10),
    symbol: 'NIFTY 24800 CE',
    direction: 'BUY',
    quantity: 130,
    entryPrice: 142.4,
    exitPrice: 0,
    pnl: demoPositions()[0]?.pnl ?? 0,
    status: 'OPEN',
    notes: 'Trend entry after 09:45, trailing stop active.',
  },
  {
    id: 'jr-2',
    date: new Date(START - 86400000).toISOString().slice(0, 10),
    symbol: 'BANKNIFTY 54000 CE',
    direction: 'BUY',
    quantity: 30,
    entryPrice: 288.1,
    exitPrice: 341.5,
    pnl: 1602,
    status: 'CLOSED',
    notes: 'Target hit, exited on the 2R level.',
  },
  {
    id: 'jr-3',
    date: new Date(START - 2 * 86400000).toISOString().slice(0, 10),
    symbol: 'NIFTY 24650 PE',
    direction: 'BUY',
    quantity: 65,
    entryPrice: 151.0,
    exitPrice: 136.2,
    pnl: -962,
    status: 'CLOSED',
    notes: 'Stop loss hit, risk contained to one R.',
  },
];

export const DEMO_WALLET = {
  balance: 12500,
  currency: 'INR',
  transactions: [
    { id: 'tx-3', type: 'CREDIT', amount: 5000, status: 'SUCCESS', description: 'Wallet recharge (UPI)', createdAt: new Date(START - 3600000).toISOString() },
    { id: 'tx-2', type: 'DEBIT', amount: 60, status: 'SUCCESS', description: 'Trade charges · 2 signals', createdAt: new Date(START - 86400000).toISOString() },
    { id: 'tx-1', type: 'CREDIT', amount: 10000, status: 'SUCCESS', description: 'Wallet recharge (UPI)', createdAt: new Date(START - 7 * 86400000).toISOString() },
  ],
};

export const DEMO_REFERRAL = {
  code: 'DEMO1001',
  referralCode: 'DEMO1001',
  link: 'https://indexpilotai.com/register?ref=DEMO1001',
  totalReferrals: 14,
  activeReferrals: 9,
  totalEarnings: 4200,
  pendingEarnings: 900,
  referrals: [
    { name: 'A. Sharma', joinedAt: new Date(START - 5 * 86400000).toISOString(), status: 'ACTIVE', reward: 300 },
    { name: 'R. Iyer', joinedAt: new Date(START - 12 * 86400000).toISOString(), status: 'ACTIVE', reward: 300 },
    { name: 'K. Patel', joinedAt: new Date(START - 19 * 86400000).toISOString(), status: 'PENDING', reward: 0 },
  ],
};

export const DEMO_BACKTEST = {
  success: true,
  summary: {
    totalTrades: 128,
    wins: 81,
    losses: 47,
    winRate: 63.3,
    profitFactor: 1.62,
    netPnl: 184250,
    maxDrawdown: 42300,
    capital: 1000000,
    period: '1 Year',
  },
  trades: DEMO_SIGNALS.map((s, i) => ({
    date: new Date(START - (i + 1) * 86400000).toISOString().slice(0, 10),
    index: s.index,
    direction: s.action,
    entry: s.entry ?? 0,
    exit: (s.entry ?? 0) + (i % 2 === 0 ? 34 : -14),
    pnl: i % 2 === 0 ? 2210 : -910,
  })),
  equityCurve: Array.from({ length: 24 }, (_, i) => ({
    x: i,
    date: new Date(START - (24 - i) * 7 * 86400000).toISOString().slice(0, 10),
    equity: 1000000 + i * 7600 + Math.round(Math.sin(i / 2) * 5200),
  })),
};

export const DEMO_SUPPORT_TICKETS = [
  {
    id: 'TCK-DEMO-14',
    ticketId: 'TCK-DEMO-14',
    subject: 'How is the trailing stop loss calculated?',
    status: 'RESOLVED',
    priority: 'NORMAL',
    createdAt: new Date(START - 3 * 86400000).toISOString(),
    messages: [
      { from: 'user', message: 'How is the trailing stop loss calculated?', createdAt: new Date(START - 3 * 86400000).toISOString() },
      { from: 'support', message: 'It arms at 0.5R profit and then trails the price by the ATR stop distance.', createdAt: new Date(START - 3 * 86400000 + 3600000).toISOString() },
    ],
  },
];

export const DEMO_ENGINE = {
  running: true,
  status: 'RUNNING',
  interval: '15m',
  slot: '09:30 - 15:00 IST',
  strategyId: 'STG-IPAI-V3',
  algoId: 'ALGO-IPAI-DEMO-1001',
  indices: ['NIFTY', 'BANKNIFTY', 'SENSEX'],
  minConfidence: 75,
  maxTradesPerIndex: 1,
  lastRunAt: new Date(START - 60000).toISOString(),
};
