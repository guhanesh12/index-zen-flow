// ============================================================================
// IndexPilot OWN AI BRAIN v4 — self-hosted reasoning engine
// No external LLM, no API keys, no credits. 100% our own logic on our own data.
//
// Pipeline:  normalize → tokenize → intent scoring (multi-intent) → entity
//            extraction → analytics engine → reasoning model (weighted factors)
//            → structured answer (verdict + sections + action + follow-ups)
// ============================================================================

export type BrainAnswer = {
  title: string;
  verdict: "WAIT" | "PLACE" | "HOLD" | "EXIT" | "INFO";
  summary: string;
  sections: { heading: string; points: string[] }[];
  confidence: number;
  risk: string;
  action: any;
};

// ------------------------------------------------------------------ helpers
const money = (n: any) => {
  const v = Number(n || 0);
  const s = Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}₹${s}`;
};
const signed = (n: any) => `${Number(n || 0) >= 0 ? "+" : ""}${money(n)}`;
const pct = (n: any) => `${Number(n || 0).toFixed(2)}%`;
const num = (n: any, d = 2) => Number(Number(n || 0).toFixed(d));
const has = (m: string, ...w: string[]) => w.some((x) => m.includes(x));
const bar = (value: number, max: number, width = 10) => {
  if (!(max > 0)) return "─".repeat(width);
  const filled = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
};

function ist(d?: string | number | null) {
  if (!d && d !== 0) return "—";
  try {
    return new Date(d as any).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(d);
  }
}
function minsAgo(d?: string | number | null) {
  if (!d && d !== 0) return Infinity;
  const t = new Date(d as any).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / 60000;
}
function ago(d?: string | number | null) {
  const m = minsAgo(d);
  if (!Number.isFinite(m)) return "—";
  if (m < 1) return "just now";
  if (m < 60) return `${Math.round(m)} min ago`;
  if (m < 1440) return `${(m / 60).toFixed(1)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

function base(title: string, verdict: BrainAnswer["verdict"], summary: string): BrainAnswer {
  return { title, verdict, summary, sections: [], confidence: 70, risk: "", action: { type: "none" } };
}

// ---------------------------------------------------------------- intents
export type Intent =
  | "greeting" | "wallet" | "signal" | "position" | "pnl" | "engine" | "slot"
  | "broker" | "journal" | "logs" | "support" | "profile" | "help" | "market"
  | "trailing" | "risk" | "overview" | "why_no_trade" | "unknown";

const INTENT_KEYWORDS: Record<Exclude<Intent, "unknown">, string[]> = {
  greeting: ["hi", "hii", "hello", "hey", "hlo", "namaste", "good morning", "good evening", "good afternoon", "thanks", "thank you", "bye"],
  overview: ["overview", "full status", "everything", "summary", "report", "dashboard", "sab kuch", "all details", "status"],
  wallet: ["wallet", "balance", "recharge", "debit", "credit", "refund", "charge", "payment", "amount left", "paisa", "fund"],
  pnl: ["p&l", "pnl", "profit", "loss", "today profit", "kitna profit", "net pnl", "earning", "made money", "how much"],
  position: ["position", "running", "hold", "exit", "square off", "squareoff", "book profit", "my trade", "open trade", "chal raha"],
  signal: ["signal", "next trade", "entry", "buy call", "buy put", "place order", "kya lena", "trade lena", "should i buy", "kaunsa"],
  market: ["market", "nifty", "banknifty", "bank nifty", "sensex", "finnifty", "trend", "chart", "view", "bias", "momentum"],
  trailing: ["trailing", "trail", "ratchet", "step", "lock", "sl move", "trailing sl", "trailing stoploss", "trailing stop"],
  risk: ["risk", "exposure", "drawdown", "how much can i lose", "safe", "max loss", "capital"],
  engine: ["engine", "start bot", "stop bot", "auto trade", "algo on", "algo off", "bot", "vps"],
  slot: ["slot", "lot", "target per", "stoploss per", "sl per", "moneyness", "atm", "otm", "itm"],
  broker: ["broker", "dhan", "access token", "token expire", "connect", "api key"],
  journal: ["journal", "daily report", "statement", "trade history", "history", "past trades"],
  logs: ["log", "activity", "what happened", "event"],
  support: ["ticket", "support", "complaint", "help me raise", "issue raise", "problem raise"],
  profile: ["profile", "my name", "kyc", "my account", "referral", "client id"],
  why_no_trade: ["why no trade", "trade nahi", "order nahi", "why not taken", "no entry", "kyu nahi", "why order not"],
  help: ["what can you do", "help", "features", "commands", "how to use"],
};

function scoreIntents(m: string): { intent: Intent; score: number }[] {
  const out: { intent: Intent; score: number }[] = [];
  for (const [k, words] of Object.entries(INTENT_KEYWORDS)) {
    let s = 0;
    for (const w of words) {
      if (m.includes(w)) s += w.includes(" ") ? 3 : 2;
    }
    if (s > 0) out.push({ intent: k as Intent, score: s });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function detectIntent(msgRaw: string): Intent {
  const m = (msgRaw || "").toLowerCase().trim();
  if (/^(hi|hii+|hello|hey|hlo|good\s*(morning|evening|afternoon)|thanks|thank you|ok|okay|bye|namaste)\b/.test(m)) return "greeting";
  if (/why.*(no|not).*(trade|order|entry)/.test(m) || /(trade|order).*(nahi|not).*(liya|taken|placed)/.test(m)) return "why_no_trade";
  const ranked = scoreIntents(m);
  return ranked[0]?.intent ?? "unknown";
}

// billing rule: only real market/trade analysis is billable
export function brainIsBillable(msg: string) {
  const i = detectIntent(msg);
  return i === "signal" || i === "position" || i === "market" || i === "why_no_trade";
}

// ---------------------------------------------------------------- entities
// Resolve which index a signal/order row belongs to (BANKNIFTY must win over NIFTY)
export function signalIndexOf(sig: any): string | null {
  const raw = String(sig?.index_name || sig?.symbol || "").toUpperCase().replace(/\s+/g, "");
  if (!raw) return null;
  if (raw.includes("BANKNIFTY")) return "BANKNIFTY";
  if (raw.includes("FINNIFTY")) return "FINNIFTY";
  if (raw.includes("MIDCPNIFTY")) return "MIDCPNIFTY";
  if (raw.includes("SENSEX")) return "SENSEX";
  if (raw.includes("NIFTY")) return "NIFTY";
  return null;
}

function extractEntities(m: string) {

  const idx = /bank\s*nifty|banknifty/.test(m)
    ? "BANKNIFTY"
    : /fin\s*nifty|finnifty/.test(m)
      ? "FINNIFTY"
      : /sensex/.test(m)
        ? "SENSEX"
        : /nifty/.test(m)
          ? "NIFTY"
          : null;
  const slot = parseInt((m.match(/slot\s*(\d+)/) || [])[1] || "", 10);
  const amount = Number((m.match(/(?:₹|rs\.?\s*)(\d[\d,]*)/) || [])[1]?.replace(/,/g, "") || NaN);
  return { index: idx, slot: Number.isFinite(slot) ? slot : null, amount: Number.isFinite(amount) ? amount : null };
}

// ---------------------------------------------------------------- market read
function readsOf(ctx: any) {
  return (ctx?.live_market?.indices || []) as any[];
}

function regimeOf(r: any): string {
  const adx = Number(r?.adx14 || 0);
  const rsi = Number(r?.rsi14 || 50);
  if (adx >= 30) return rsi >= 55 ? "STRONG TRENDING UP" : rsi <= 45 ? "STRONG TRENDING DOWN" : "STRONG TREND";
  if (adx >= 20) return rsi >= 55 ? "TRENDING UP" : rsi <= 45 ? "TRENDING DOWN" : "EMERGING TREND";
  if (adx >= 14) return "CHOPPY / RANGE";
  return "DEAD RANGE (avoid)";
}

// Confluence score 0-100 from our own indicator stack.
function confluence(r: any): { score: number; factors: string[] } {
  if (!r) return { score: 0, factors: ["No live chart data"] };
  const factors: string[] = [];
  let score = 0;
  const adx = Number(r.adx14 || 0);
  const rsi = Number(r.rsi14 || 50);
  const bull = r.bias === "CALL";

  if (adx >= 30) { score += 30; factors.push(`ADX ${adx} — strong trend (+30)`); }
  else if (adx >= 22) { score += 22; factors.push(`ADX ${adx} — healthy trend (+22)`); }
  else if (adx >= 18) { score += 12; factors.push(`ADX ${adx} — weak trend (+12)`); }
  else { factors.push(`ADX ${adx} — no trend (0)`); }

  if (bull ? rsi >= 60 : rsi <= 40) { score += 22; factors.push(`RSI ${rsi} — momentum with direction (+22)`); }
  else if (bull ? rsi >= 52 : rsi <= 48) { score += 12; factors.push(`RSI ${rsi} — mild momentum (+12)`); }
  else { factors.push(`RSI ${rsi} — momentum not confirming (0)`); }

  if ((bull && r.above_vwap) || (!bull && !r.above_vwap)) { score += 20; factors.push(`Price ${r.above_vwap ? "above" : "below"} VWAP ${r.vwap} — intraday control (+20)`); }
  else { factors.push(`VWAP ${r.vwap} against the ${bull ? "CALL" : "PUT"} side (0)`); }

  if (r.trend && String(r.trend).toUpperCase().includes(bull ? "UP" : "DOWN")) { score += 18; factors.push(`Structure ${r.trend} aligned (+18)`); }
  else { factors.push(`Structure ${r.trend || "—"} not aligned (0)`); }

  const chg = Math.abs(Number(r.day_change_pct || 0));
  if (chg >= 0.35) { score += 10; factors.push(`Day move ${pct(r.day_change_pct)} — participation (+10)`); }
  else { factors.push(`Day move ${pct(r.day_change_pct)} — thin participation (0)`); }

  return { score: Math.min(100, score), factors };
}

function marketSection(ctx: any) {
  const reads = readsOf(ctx);
  if (!reads.length) {
    return {
      heading: "Live market",
      points: [ctx?.live_market?.reason || "Live chart data is not loaded for this question (Dhan token / market closed)."],
    };
  }
  return {
    heading: `Live index read · ${ctx?.live_market?.interval || "5m candles"}`,
    points: reads.map((r) => {
      const c = confluence(r);
      return `${r.name}  ${r.ltp} (${pct(r.day_change_pct)}) · ${regimeOf(r)} · RSI ${r.rsi14} · ADX ${r.adx14} · ${r.above_vwap ? "▲ above" : "▼ below"} VWAP ${r.vwap} → bias ${r.bias} · score ${c.score}/100 ${bar(c.score, 100)}`;
    }),
  };
}

function bestRead(ctx: any, preferIndex?: string | null) {
  const reads = readsOf(ctx);
  if (!reads.length) return null;
  if (preferIndex) {
    const hit = reads.find((r) => String(r.name).toUpperCase() === preferIndex);
    if (hit) return hit;
  }
  return reads
    .map((r) => ({ r, s: confluence(r).score * (r.bias === "WAIT" ? 0.4 : 1) }))
    .sort((a, b) => b.s - a.s)[0].r;
}

// ---------------------------------------------------------------- analytics
function positionView(p: any) {
  const raw = p?.raw_position || {};
  const baseTgt = Number(raw.baseTargetAmount ?? p.target_amount ?? 0);
  const baseSL = Number(raw.baseStopLossAmount ?? p.stop_loss_amount ?? 0);
  const curTgt = Number(raw.currentTargetAmount ?? p.target_amount ?? 0);
  const curSL = Number(raw.currentStopLossAmount ?? p.stop_loss_amount ?? 0);
  const pnl = Number(p.pnl || 0);
  const peak = Number(p.highest_pnl || raw.highestPnl || 0);
  const entry = Number(p.entry_price || 0);
  const ltp = Number(p.current_price || 0);
  const qty = Number(p.quantity || 0);
  return {
    raw, baseTgt, baseSL, curTgt, curSL, pnl, peak, entry, ltp, qty,
    symbol: p.symbol || "—",
    index: p.index_name || "—",
    orderId: p.order_id,
    isCall: /CE|CALL/i.test(p.symbol || raw.optionType || ""),
    movePct: entry > 0 ? ((ltp - entry) / entry) * 100 : 0,
    invested: entry * qty,
    trailingEnabled: !!(raw.trailingEnabled ?? p.trailing_enabled),
    trailingActive: !!raw.trailingActive || !!raw.trailingActivatedAt,
    activation: Number(raw.trailingActivationAmount || 0),
    stepSize: Number(raw.stopLossJumpAmount || p.trailing_step || 0),
    tgtStep: Number(raw.targetJumpAmount || raw.stopLossJumpAmount || p.trailing_step || 0),
    steps: Number(raw.trailingStepCount || 0),
    activatedAt: raw.trailingActivatedAt || null,
    profitLocked: curSL <= 0 && !!raw.trailingActivatedAt,
    lockedAmount: curSL <= 0 ? Math.abs(curSL) : 0,
    giveBackPct: Number(raw.giveBackPct || (peak > 0 ? ((peak - pnl) / peak) * 100 : 0)),
    momentum: Number(raw.momentumScore || 0),
    heldMinutes: Number(raw.heldMinutes || 0),
    monitorDecision: raw.monitorDecision || null,
    distToTarget: curTgt - pnl,
    distToSL: pnl + curSL,
    updatedAt: p.updated_at,
  };
}

function pnlAnalytics(ctx: any) {
  const open = (ctx?.open_positions || []).map(positionView);
  const closed = (ctx?.positions || []).filter((p: any) => p.is_active === false);
  const openPnl = open.reduce((a: number, p: any) => a + p.pnl, 0);
  const closedPnl = closed.reduce((a: number, p: any) => a + Number(p.pnl || 0), 0);
  const wins = closed.filter((p: any) => Number(p.pnl || 0) > 0);
  const losses = closed.filter((p: any) => Number(p.pnl || 0) < 0);
  const avgWin = wins.length ? wins.reduce((a: number, p: any) => a + Number(p.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((a: number, p: any) => a + Number(p.pnl), 0) / losses.length) : 0;
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const expectancy = closed.length ? (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss : 0;
  const best = closed.slice().sort((a: any, b: any) => Number(b.pnl || 0) - Number(a.pnl || 0))[0];
  const worst = closed.slice().sort((a: any, b: any) => Number(a.pnl || 0) - Number(b.pnl || 0))[0];
  return {
    open, closed, openPnl, closedPnl, net: openPnl + closedPnl,
    trades: closed.length, wins: wins.length, losses: losses.length,
    winRate, avgWin, avgLoss, expectancy, best, worst,
    rr: avgLoss > 0 ? avgWin / avgLoss : 0,
  };
}

function positionsSection(a: ReturnType<typeof pnlAnalytics>) {
  if (!a.open.length) return null;
  return {
    heading: `Open positions (${a.open.length})`,
    points: a.open.map(
      (p) =>
        `${p.symbol} · Qty ${p.qty} · Entry ${p.entry} → LTP ${p.ltp} (${pct(p.movePct)}) · P&L ${signed(p.pnl)} · Peak ${money(p.peak)} · Tgt ${money(p.curTgt)} / SL ${p.curSL <= 0 ? `LOCK ${money(Math.abs(p.curSL))}` : money(p.curSL)}${p.trailingActive ? ` · TRAIL step ${p.steps}` : ""}`,
    ),
  };
}

function trailingSection(p: ReturnType<typeof positionView>) {
  const pts: string[] = [];
  if (!p.trailingEnabled) {
    pts.push("Trailing is OFF for this slot — enable it so profit is protected automatically.");
    return { heading: "Trailing stop-loss", points: pts };
  }
  pts.push(`Status: ${p.trailingActive ? `🔥 ACTIVE (since ${ist(p.activatedAt)})` : `Waiting — activates when peak profit reaches ${money(p.activation)}`}`);
  pts.push(`Ladder: every ${money(p.tgtStep)} of extra profit → Target +${money(p.tgtStep)}, SL tightens by ${money(p.stepSize)}`);
  pts.push(`Steps completed: ${p.steps} · Peak profit ${money(p.peak)} ${bar(p.peak, Math.max(p.curTgt, p.activation))}`);
  pts.push(`Base Target ${money(p.baseTgt)} → now ${money(p.curTgt)}  |  Base SL ${money(p.baseSL)} → now ${p.curSL <= 0 ? `PROFIT LOCK ${money(Math.abs(p.curSL))}` : money(p.curSL)}`);
  if (p.profitLocked) pts.push(`🟢 Profit locked: worst case you still book ${money(p.lockedAmount)} on this trade.`);
  if (!p.trailingActive && p.activation > 0) {
    pts.push(`Distance to activation: ${money(Math.max(0, p.activation - p.peak))} more peak profit needed.`);
  }
  return { heading: "Trailing stop-loss", points: pts };
}

// ---------------------------------------------------------------- reasoning
function holdExitModel(p: ReturnType<typeof positionView>, idx: any) {
  const factors: { label: string; weight: number; exit: boolean }[] = [];
  const dirOk = idx ? (p.isCall ? idx.bias === "CALL" : idx.bias === "PUT") : null;

  if (p.curTgt > 0 && p.pnl >= p.curTgt) factors.push({ label: `Target reached (${money(p.pnl)} ≥ ${money(p.curTgt)})`, weight: 60, exit: true });
  if (p.curSL > 0 && p.pnl <= -p.curSL) factors.push({ label: `Stop-loss breached (${money(p.pnl)} ≤ ${money(-p.curSL)})`, weight: 60, exit: true });
  if (p.profitLocked && p.pnl <= p.lockedAmount) factors.push({ label: `Trailing profit lock hit (${money(p.lockedAmount)})`, weight: 55, exit: true });
  if (p.peak > 0 && p.giveBackPct >= 60) factors.push({ label: `Gave back ${p.giveBackPct.toFixed(0)}% of peak ${money(p.peak)}`, weight: 30, exit: true });
  if (dirOk === false && Number(idx?.adx14 || 0) >= 22) factors.push({ label: `${idx.name} structure reversed against your ${p.isCall ? "CALL" : "PUT"} (ADX ${idx.adx14})`, weight: 28, exit: true });
  if (p.momentum < 0) factors.push({ label: `Short-term momentum fading (${p.momentum})`, weight: 10, exit: true });

  if (dirOk === true) factors.push({ label: `${idx.name} bias ${idx.bias} supports the position`, weight: 25, exit: false });
  if (p.momentum > 0) factors.push({ label: `Momentum improving (${p.momentum})`, weight: 12, exit: false });
  if (p.trailingActive) factors.push({ label: `Trailing active at step ${p.steps} — downside already managed`, weight: 18, exit: false });
  if (p.curTgt > 0 && p.pnl > 0 && p.pnl < p.curTgt) factors.push({ label: `${money(p.distToTarget)} left to target`, weight: 10, exit: false });
  if (p.curSL > 0 && p.distToSL > p.curSL * 0.5) factors.push({ label: `SL is still ${money(p.distToSL)} away — room to breathe`, weight: 10, exit: false });

  const exitScore = factors.filter((f) => f.exit).reduce((a, f) => a + f.weight, 0);
  const holdScore = factors.filter((f) => !f.exit).reduce((a, f) => a + f.weight, 0);
  const total = exitScore + holdScore || 1;
  const verdict: BrainAnswer["verdict"] = exitScore >= 50 || exitScore > holdScore * 1.5 ? "EXIT" : "HOLD";
  const confidence = Math.round(Math.max(55, Math.min(96, (Math.max(exitScore, holdScore) / total) * 100)));
  return { verdict, confidence, factors, exitScore, holdScore, dirOk };
}

// ---------------------------------------------------------------- brain
export function ownBrain(message: string, ctx: any): BrainAnswer {
  const m = (message || "").toLowerCase().trim();
  const intent = detectIntent(message);
  const ent = extractEntities(m);
  const ranked = scoreIntents(m);
  const secondary = ranked[1]?.intent;

  const w = ctx?.wallet || {};
  const eng = ctx?.engine || {};
  const br = ctx?.broker || {};
  const slots = ctx?.auto_slots || [];
  const enabledSlots = slots.filter((s: any) => s.enabled);
  const sig = ctx?.latest_signal;
  const an = pnlAnalytics(ctx);
  const pos = an.open[0];

  const statusStrip = [
    `Market ${ctx?.market_open ? "🟢 OPEN" : "🔴 CLOSED"} · ${ctx?.now_ist || "—"}`,
    `Engine ${eng.is_running ? "▶️ RUNNING" : "⏹️ STOPPED"}${eng.stopped_reason ? ` (${eng.stopped_reason})` : ""} · Broker ${br.connected ? (br.access_token_expired ? "⚠️ token expired" : "✅ connected") : "❌ not connected"}`,
    `Open ${an.open.length} · Slots ${enabledSlots.length}/${slots.length} · Wallet ${money(w.balance)} · Live P&L ${signed(an.openPnl)}`,
  ];

  const followUps = (...items: string[]) => ({ heading: "Ask me next", points: items });

  switch (intent) {
    // ------------------------------------------------------------ greeting
    case "greeting": {
      const a = base("IndexPilot AI", "INFO", `Hello${ctx?.profile?.full_name ? ` ${ctx.profile.full_name.split(" ")[0]}` : ""}! Your trading brain is live. Market is ${ctx?.market_open ? "OPEN" : "CLOSED"} (${ctx?.now_ist}).`);
      a.sections = [
        { heading: "Live status", points: statusStrip },
        positionsSection(an) || { heading: "Positions", points: ["No running position right now."] },
        followUps(
          '"Next signal kya hai?" — full market + entry verdict',
          '"Hold or exit my position?" — live trade analysis with trailing state',
          '"Today P&L" · "Trailing status" · "Risk report" · "Full overview"',
        ),
      ];
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ overview
    case "overview": {
      const a = base("Full Account Overview", "INFO", `Net P&L ${signed(an.net)} (open ${signed(an.openPnl)}, closed ${signed(an.closedPnl)}) across ${an.open.length} running and ${an.trades} closed trade(s). Wallet ${money(w.balance)}.`);
      a.sections = [
        { heading: "Live status", points: statusStrip },
        positionsSection(an) || { heading: "Positions", points: ["No running position."] },
        {
          heading: "Performance",
          points: [
            `Closed trades ${an.trades} · Win rate ${an.winRate.toFixed(1)}% ${bar(an.winRate, 100)}`,
            `Avg win ${money(an.avgWin)} · Avg loss ${money(an.avgLoss)} · R:R ${an.rr.toFixed(2)}`,
            `Expectancy per trade ${signed(an.expectancy)}`,
            an.best ? `Best ${an.best.symbol} ${signed(an.best.pnl)} · Worst ${an.worst?.symbol} ${signed(an.worst?.pnl)}` : "No closed trades yet.",
          ],
        },
        {
          heading: "Automation",
          points: [
            `Engine ${eng.is_running ? "RUNNING" : "STOPPED"} · Auto-resume ${eng.auto_resume ? "ON" : "OFF (manual start only)"} · Heartbeat ${ago(eng.last_heartbeat)}`,
            `Slots enabled ${enabledSlots.length}/${slots.length} · Free capacity ${Math.max(0, enabledSlots.length - an.open.length)}`,
            `Last signal ${sig ? `${sig.symbol} ${sig.option_type || ""} ${ago(sig.created_at)}` : "none today"}`,
          ],
        },
        marketSection(ctx),
      ];
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ wallet
    case "wallet": {
      const a = base("Wallet & Billing", "INFO", `Balance ${money(w.balance)}. Spent so far ${money(w.totalDeducted)}, profit credited ${money(w.totalProfit)}.`);
      a.sections = [
        {
          heading: "Balance",
          points: [
            `Available ${money(w.balance)} ${bar(Number(w.balance || 0), Math.max(1000, Number(w.balance || 0)))}`,
            `Total debited ${money(w.totalDeducted)} · Total profit credited ${money(w.totalProfit)}`,
            `AI analysis costs ₹0.50 per market/position question — general questions are free.`,
          ],
        },
        {
          heading: "Recent transactions",
          points: (ctx?.recent_wallet_transactions || []).slice(0, 8).map(
            (t: any) => `${["credit", "bonus", "profit", "referral", "refund"].includes(t.type) ? "＋" : "－"} ${money(t.amount)} · ${t.description || t.type} · ${ist(t.created_at)}`,
          ),
        },
      ].filter((s) => s.points.length);
      if (Number(w.balance) < 100) a.risk = "Balance below ₹100 — recharge to keep auto-trading, notifications and AI analysis active.";
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ P&L
    case "pnl":
    case "journal": {
      const st = ctx?.journal_stats || {};
      const a = base(intent === "pnl" ? "Profit & Loss" : "Trading Journal", "INFO",
        `Net P&L ${signed(an.net)} — running ${signed(an.openPnl)} from ${an.open.length} open trade(s) and ${signed(an.closedPnl)} booked from ${an.trades} closed trade(s).`);
      a.sections = [
        {
          heading: "P&L breakdown",
          points: [
            `Open (unrealised) ${signed(an.openPnl)}`,
            `Closed (realised) ${signed(an.closedPnl)}`,
            `NET ${signed(an.net)}`,
            `Win rate ${an.winRate.toFixed(1)}% (${an.wins}W / ${an.losses}L) ${bar(an.winRate, 100)}`,
            `Avg win ${money(an.avgWin)} vs avg loss ${money(an.avgLoss)} → R:R ${an.rr.toFixed(2)} · expectancy ${signed(an.expectancy)}`,
          ],
        },
        positionsSection(an) || { heading: "Positions", points: ["No running position."] },
        {
          heading: "Closed trades",
          points: an.closed.slice(0, 8).map(
            (p: any) => `${ist(p.exited_at || p.updated_at)} · ${p.symbol} · Qty ${p.quantity} · ${signed(p.pnl)} · ${p.exit_reason || "closed"}`,
          ),
        },
        Object.keys(st).length
          ? { heading: "Journal stats", points: Object.entries(st).slice(0, 6).map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "number" && k.includes("pnl") ? money(v) : String(v)}`) }
          : { heading: "", points: [] },
      ].filter((s) => s.heading && s.points.length);
      if (an.net < 0) a.risk = "You are net negative — reduce lots and only take A-grade setups (ADX ≥ 22 with VWAP alignment).";
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ trailing
    case "trailing": {
      if (!pos) {
        const a = base("Trailing Stop-Loss", "INFO", "No running position, so no live trailing ladder. Here is how your slots are configured.");
        a.sections = [
          {
            heading: "Slot trailing configuration",
            points: slots.map((s: any) =>
              `Slot ${s.slot} · ${s.index_name} ${s.moneyness} · ${s.lot_count} lot · Trail ${s.trailing_enabled ? `ON — activates at ${money(Number(s.trailing_activation_per_lot) * Number(s.lot_count || 1))}, step ${money(Number(s.trailing_step_per_lot) * Number(s.lot_count || 1))}` : "OFF"}`,
            ),
          },
          {
            heading: "How the ladder works",
            points: [
              "Step 1 fires the moment peak profit touches the activation amount: Target moves UP by one step and SL tightens by one step.",
              "Every further full step of profit repeats it, so SL keeps chasing price.",
              "Once SL crosses break-even it becomes a PROFIT LOCK — the trade cannot end in a loss after that.",
            ],
          },
        ].filter((s) => s.points.length);
        a.confidence = 100;
        return a;
      }
      const a = base(`Trailing — ${pos.symbol}`, "INFO",
        pos.trailingActive
          ? `Trailing is ACTIVE at step ${pos.steps}. Target ${money(pos.baseTgt)} → ${money(pos.curTgt)} and SL ${money(pos.baseSL)} → ${pos.curSL <= 0 ? `PROFIT LOCK ${money(Math.abs(pos.curSL))}` : money(pos.curSL)}.`
          : `Trailing is armed but not activated yet — peak profit ${money(pos.peak)} of ${money(pos.activation)} needed.`);
      a.sections = [
        trailingSection(pos),
        {
          heading: "Live numbers",
          points: [
            `P&L now ${signed(pos.pnl)} · Peak ${money(pos.peak)} · Give-back ${pos.giveBackPct.toFixed(0)}%`,
            `Distance to target ${money(pos.distToTarget)} · Distance to stop ${money(pos.distToSL)}`,
            `Held ${pos.heldMinutes.toFixed(0)} min · Last engine update ${ago(pos.updatedAt)}`,
          ],
        },
      ];
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ signal / market
    case "signal":
    case "market": {
      const read = bestRead(ctx, ent.index);
      const conf = confluence(read);
      const sigIndex = signalIndexOf(sig);
      // the pending signal must belong to the SAME index we are analysing,
      // otherwise a SENSEX signal would offer an order button on a BANKNIFTY question
      const sigMatches = !!read && !!sigIndex && sigIndex === String(read.name).toUpperCase();
      const fresh = !!sig && minsAgo(sig.created_at) <= 15 && sigMatches;
      const slotFree = enabledSlots.length > an.open.length;
      const a = base(intent === "market" ? "Market Analysis" : "Signal Analysis", "WAIT", "");

      a.sections = [
        marketSection(ctx),
        {
          heading: read ? `Why — ${read.name} factor breakdown` : "Why",
          points: read ? [...conf.factors, `Confluence ${conf.score}/100 ${bar(conf.score, 100)} · Regime ${regimeOf(read)}`] : ["No live chart data available to reason with."],
        },
        {
          heading: "Signal & capacity",
          points: [
            sig
              ? `Last signal ${sig.symbol || "—"} ${sig.option_type || ""} @ ${sig.price ?? "—"} · confidence ${sig.confidence ?? "—"} · ${ago(sig.created_at)} (${minsAgo(sig.created_at) <= 15 ? "FRESH" : "stale > 15 min"})${read && sigIndex && !sigMatches ? ` · belongs to ${sigIndex}, not ${read.name}` : ""}`
              : "No signal generated for your account yet today.",
            `Slots ${enabledSlots.length} enabled · ${an.open.length} in use · ${Math.max(0, enabledSlots.length - an.open.length)} free`,
            `Engine ${eng.is_running ? "RUNNING" : "STOPPED — it will not auto-place orders"} · Broker ${br.connected && !br.access_token_expired ? "ready" : "NOT ready"}`,
          ],
        },
      ];

      if (!ctx?.market_open) {
        a.verdict = "WAIT";
        a.summary = `Market is closed (${ctx?.now_ist}). No fresh entry is possible — next session opens 09:15 IST. I'll re-analyse then.`;
        a.confidence = 100;
        a.risk = "Do not chase after-hours moves; option premiums gap at open.";
        return a;
      }

      if (read && read.bias !== "WAIT" && conf.score >= 55) {
        a.verdict = fresh && slotFree && eng.is_running ? "PLACE" : "WAIT";
        a.summary = `${read.name} favours ${read.bias} — ${regimeOf(read)}, confluence ${conf.score}/100 (RSI ${read.rsi14}, ADX ${read.adx14}, ${read.above_vwap ? "above" : "below"} VWAP ${read.vwap}). ${a.verdict === "PLACE" ? "Setup is tradable now." : "Direction is clear, but entry conditions are not all met."}`;
        a.confidence = Math.min(95, 50 + Math.round(conf.score * 0.45));
        a.risk = conf.score >= 75 ? "Strong setup — still respect the slot SL, no averaging." : "Moderate setup — keep a strict SL and single lot exposure.";
        if (a.verdict === "PLACE" && sig) {
          a.action = { type: "place_order", signalId: sig.id, index: read.name, reason: `Fresh ${sig.option_type || read.bias} aligned with ${read.name} ${read.trend} (confluence ${conf.score})` };
        } else if (!eng.is_running) a.risk = "Engine is STOPPED — start it (or place manually) before this setup expires.";
        else if (!slotFree) a.risk = "All enabled slots are busy — free a slot or enable another to take this trade.";
        else if (sig && sigIndex && !sigMatches) a.risk = `No ${read.name} signal yet — the last engine signal was on ${sigIndex}, so there is nothing to execute on ${read.name}.`;
        else if (!fresh) a.risk = `No fresh (<15 min) ${read.name} signal — wait for the engine's next confirmed entry rather than chasing.`;
      } else {

        a.verdict = "WAIT";
        a.summary = read
          ? `${read.name} is not tradable right now — ${regimeOf(read)} with confluence only ${conf.score}/100 (ADX ${read.adx14}, RSI ${read.rsi14}). A clean break with ADX ≥ 22 and VWAP alignment is needed.`
          : "Live chart data isn't available, so I will not guess a direction. Refresh the Dhan token for live analysis.";
        a.confidence = read ? 75 : 40;
        a.risk = "Sideways / weak trend — option premium decays fast, staying out is the trade.";
      }
      return a;
    }

    // ------------------------------------------------------------ why no trade
    case "why_no_trade": {
      const read = bestRead(ctx, ent.index);
      const conf = confluence(read);
      const a = base("Why no trade was taken", "INFO", "");
      const blockers: string[] = [];
      if (!ctx?.market_open) blockers.push("Market is closed — entries only 09:15–15:30 IST on trading days.");
      if (!eng.is_running) blockers.push(`Engine is STOPPED${eng.stopped_reason ? ` (${eng.stopped_reason})` : ""} — no auto entries.`);
      if (!br.connected) blockers.push("Broker not connected — orders cannot be sent.");
      if (br.access_token_expired) blockers.push("Dhan access token expired — order API rejects requests.");
      if (!enabledSlots.length) blockers.push("No slot is enabled — enable at least one slot in the Auto tab.");
      if (enabledSlots.length && an.open.length >= enabledSlots.length) blockers.push(`All ${enabledSlots.length} enabled slot(s) already hold positions.`);
      if (read && conf.score < 55) blockers.push(`Setup quality too low — ${read.name} confluence ${conf.score}/100 (${regimeOf(read)}). Strategy needs ADX ≥ 22 + VWAP alignment.`);
      if (!sig || minsAgo(sig?.created_at) > 15) blockers.push("No fresh confirmed signal in the last 15 minutes.");
      if (Number(w.balance) <= 0) blockers.push("Wallet balance is empty — auto-execution is paused.");

      a.summary = blockers.length
        ? `${blockers.length} condition(s) blocked entry. The biggest one: ${blockers[0]}`
        : "No blocker found — conditions look tradable; the engine will enter on the next confirmed candle close.";
      a.sections = [
        { heading: "Blockers", points: blockers.length ? blockers : ["None — waiting on the next candle confirmation."] },
        marketSection(ctx),
        { heading: "Recent orders", points: (ctx?.recent_orders || []).slice(0, 5).map((o: any) => `${ist(o.created_at)} · ${o.symbol} ${o.transaction_type} x${o.quantity} · ${o.status}${o.error_message ? ` · ${o.error_message}` : ""}`) },
      ].filter((s) => s.points.length);
      a.confidence = 92;
      return a;
    }

    // ------------------------------------------------------------ position
    case "position": {
      if (!pos) {
        const a = base("Positions", "INFO", `You have no running position. Booked P&L so far ${signed(an.closedPnl)} across ${an.trades} trade(s).`);
        a.sections = [
          { heading: "Recent orders", points: (ctx?.recent_orders || []).slice(0, 6).map((o: any) => `${ist(o.created_at)} · ${o.symbol} ${o.transaction_type} x${o.quantity} · ${o.status}${o.error_message ? ` · ${o.error_message}` : ""}`) },
          marketSection(ctx),
          followUps('"Next signal?" to check for a new entry', '"Today P&L" for the full performance report'),
        ].filter((s) => s.points.length);
        a.confidence = 100;
        return a;
      }

      const idx = bestRead(ctx, (pos.index || "").toUpperCase() || ent.index);
      const model = holdExitModel(pos, idx);
      const a = base(`Running position — ${pos.symbol}`, model.verdict, "");

      a.sections = [
        {
          heading: "Position",
          points: [
            `Entry ${pos.entry} → LTP ${pos.ltp} (${pct(pos.movePct)}) · Qty ${pos.qty} · Invested ≈ ${money(pos.invested)}`,
            `P&L ${signed(pos.pnl)} · Peak ${money(pos.peak)} · Give-back ${pos.giveBackPct.toFixed(0)}%`,
            `Target ${money(pos.curTgt)} (${money(pos.distToTarget)} away) · SL ${pos.curSL <= 0 ? `LOCK ${money(Math.abs(pos.curSL))}` : `${money(pos.curSL)} (${money(pos.distToSL)} away)`}`,
            `Held ${pos.heldMinutes.toFixed(0)} min · Engine view ${pos.monitorDecision || "—"} · Updated ${ago(pos.updatedAt)}`,
          ],
        },
        trailingSection(pos),
        marketSection(ctx),
        {
          heading: "Decision factors",
          points: [
            ...model.factors.map((f) => `${f.exit ? "🔻" : "🟢"} ${f.label} (weight ${f.weight})`),
            `Score — EXIT ${model.exitScore} vs HOLD ${model.holdScore}`,
          ],
        },
      ];

      if (model.verdict === "EXIT") {
        const top = model.factors.filter((f) => f.exit).sort((x, y) => y.weight - x.weight)[0];
        a.summary = `EXIT ${pos.symbol} — ${top?.label || "risk conditions met"}. P&L ${signed(pos.pnl)}${pos.profitLocked ? `, profit lock ${money(pos.lockedAmount)} already secured` : ""}. Book it instead of hoping.`;
        a.action = { type: "exit_position", orderId: pos.orderId, reason: top?.label || "Exit conditions met" };
        a.risk = "Once out, wait for a fresh confirmed signal — do not re-enter the same move emotionally.";
      } else {
        a.summary = pos.pnl >= 0
          ? `HOLD ${pos.symbol} — P&L ${signed(pos.pnl)}, structure ${model.dirOk === true ? "supports" : "is neutral for"} your ${pos.isCall ? "CALL" : "PUT"}. Target ${money(pos.curTgt)} not hit and stop is ${money(pos.distToSL)} away.`
          : `HOLD with care — drawdown ${signed(pos.pnl)}, but the stop at ${money(pos.curSL)} is not breached and the structure has not reversed. Let the system's SL do the work.`;
        a.risk = pos.trailingActive
          ? `Trailing is live at step ${pos.steps} — SL keeps tightening automatically as profit grows.`
          : pos.trailingEnabled
            ? `Trailing arms at ${money(pos.activation)} peak profit (${money(Math.max(0, pos.activation - pos.peak))} to go).`
            : "Trailing is OFF for this slot — enable it to protect profit automatically.";
      }
      a.confidence = model.confidence;
      return a;
    }

    // ------------------------------------------------------------ risk
    case "risk": {
      const maxLoss = an.open.reduce((s: number, p: any) => s + Math.max(0, p.curSL), 0);
      const maxGain = an.open.reduce((s: number, p: any) => s + Math.max(0, p.curTgt), 0);
      const locked = an.open.reduce((s: number, p: any) => s + p.lockedAmount, 0);
      const a = base("Risk Report", "INFO", `Worst case from here ${money(-maxLoss)}, best case ${money(maxGain)}${locked > 0 ? `, with ${money(locked)} already locked by trailing` : ""}.`);
      a.sections = [
        {
          heading: "Live exposure",
          points: an.open.length
            ? an.open.map((p: any) => `${p.symbol} · invested ≈ ${money(p.invested)} · risk ${p.curSL <= 0 ? `NONE (locked ${money(Math.abs(p.curSL))})` : money(p.curSL)} · reward ${money(p.curTgt)} · R:R ${(p.curSL > 0 ? p.curTgt / p.curSL : 99).toFixed(2)}`)
            : ["No open exposure."],
        },
        {
          heading: "Statistical edge",
          points: [
            `Win rate ${an.winRate.toFixed(1)}% · R:R ${an.rr.toFixed(2)} · expectancy ${signed(an.expectancy)} per trade`,
            `Realised ${signed(an.closedPnl)} · Unrealised ${signed(an.openPnl)}`,
            an.expectancy >= 0 ? "Edge is positive — keep sizing consistent." : "Edge is negative — cut lot size until win rate or R:R improves.",
          ],
        },
        {
          heading: "Slot risk configuration",
          points: slots.map((s: any) => `Slot ${s.slot} ${s.index_name} ${s.moneyness} · ${s.lot_count} lot · Tgt ${money(s.target_per_lot)}/lot · SL ${money(s.stop_loss_per_lot)}/lot · Trail ${s.trailing_enabled ? "ON" : "OFF"} · ${s.enabled ? "ENABLED" : "off"}`),
        },
      ].filter((s) => s.points.length);
      a.risk = maxLoss > Number(w.balance || 0) * 5 ? "Open risk is large versus wallet — consider reducing lots." : "Exposure is within a normal intraday band.";
      a.confidence = 95;
      return a;
    }

    // ------------------------------------------------------------ engine
    case "engine": {
      const wantStart = has(m, "start", " on", "chalu", "resume");
      const wantStop = has(m, "stop", " off", "band", "pause");
      const a = base("Trading Engine", "INFO", `Engine is ${eng.is_running ? "RUNNING" : "STOPPED"}${eng.stopped_reason ? ` — ${eng.stopped_reason}` : ""}. Heartbeat ${ago(eng.last_heartbeat)}.`);
      a.sections = [
        {
          heading: "Engine state",
          points: [
            `Status ${eng.is_running ? "RUNNING" : "STOPPED"} · Auto-resume ${eng.auto_resume ? "ON" : "OFF (manual start only)"}`,
            `Started ${ist(eng.started_at)} · Stopped ${ist(eng.stopped_at)}`,
            `Symbols selected ${eng.selected_symbol_count} · Slots enabled ${enabledSlots.length}/${slots.length}`,
            `Broker ${br.connected ? (br.access_token_expired ? "connected but TOKEN EXPIRED" : "connected") : "not connected"}`,
          ],
        },
        positionsSection(an) || { heading: "Positions", points: ["No running position."] },
      ];
      if (wantStart && !eng.is_running) a.action = { type: "start_engine", reason: "User asked to start the engine" };
      else if (wantStop && eng.is_running) a.action = { type: "stop_engine", reason: "User asked to stop the engine" };
      if (!br.connected) a.risk = "Broker is not connected — the engine cannot place live orders.";
      else if (br.access_token_expired) a.risk = "Dhan access token expired — update it before starting the engine.";
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ slot
    case "slot": {
      const row = slots.find((s: any) => s.slot === ent.slot) || enabledSlots[0] || slots[0];
      const a = base("Slot Configuration", "INFO",
        row
          ? `Slot ${row.slot} — ${row.index_name} ${row.moneyness}, ${row.lot_count} lot(s), Target ${money(Number(row.target_per_lot) * Number(row.lot_count || 1))} / SL ${money(Number(row.stop_loss_per_lot) * Number(row.lot_count || 1))}, ${row.enabled ? "ENABLED" : "disabled"}.`
          : "No slots configured yet.");
      a.sections = [
        {
          heading: "All slots",
          points: slots.map((s: any) => {
            const lots = Number(s.lot_count || 1);
            return `Slot ${s.slot}: ${s.index_name} ${s.moneyness} · ${lots} lot · TGT ${money(s.target_per_lot)}/lot (${money(Number(s.target_per_lot) * lots)}) · SL ${money(s.stop_loss_per_lot)}/lot (${money(Number(s.stop_loss_per_lot) * lots)}) · Trail ${s.trailing_enabled ? `ON act ${money(Number(s.trailing_activation_per_lot) * lots)} step ${money(Number(s.trailing_step_per_lot) * lots)}` : "OFF"} · ${s.enabled ? "ENABLED" : "off"}`;
          }),
        },
        {
          heading: "Effect of these settings",
          points: [
            "Target/SL are per-lot values multiplied by lot count and moneyness — bigger lots automatically scale the rupee risk.",
            "Trailing activation is when the ladder starts; each step then raises Target and tightens SL by the step amount.",
            "Once SL crosses break-even the trade becomes risk-free (profit lock).",
          ],
        },
      ].filter((s) => s.points.length);
      if (row) a.action = { type: "edit_slot", slot: row.slot, reason: "Slot settings" };
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ broker
    case "broker": {
      const a = base("Broker (Dhan)", "INFO", br.connected ? `Dhan connected — client ${br.dhan_client_id}${br.dhan_client_name ? ` (${br.dhan_client_name})` : ""}${br.access_token_expired ? ", but the access token is EXPIRED" : ""}.` : "Dhan broker is not connected.");
      a.sections = [
        {
          heading: "Connection",
          points: [
            `Status ${br.connected ? "CONNECTED" : "NOT CONNECTED"} · ${br.last_status || "—"}`,
            `Auth method ${br.auth_method || "—"}`,
            `Token expires ${ist(br.access_token_expires_at)}${br.access_token_expired ? " — EXPIRED" : ""}`,
            br.last_error ? `Last error: ${br.last_error}` : "No recent broker error.",
          ],
        },
        { heading: "Impact right now", points: [
          `Order placement ${br.connected && !br.access_token_expired ? "✅ available" : "❌ blocked"}`,
          `Live chart analysis ${br.connected && !br.access_token_expired ? "✅ live data" : "❌ falls back to no-data mode"}`,
        ] },
      ];
      if (!br.connected || br.access_token_expired) {
        a.action = { type: "connect_broker", reason: br.connected ? "Token expired" : "Broker not connected" };
        a.risk = "Orders and live analysis fail until the Dhan token is valid.";
      }
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ logs
    case "logs": {
      const a = base("Activity Logs", "INFO", "Latest system activity on your account.");
      a.sections = [
        { heading: "Recent logs", points: (ctx?.recent_logs || []).slice(0, 10).map((l: any) => `${ist(l.created_at || l.time || l.timestamp)} · ${l.type || l.event || "log"} · ${l.message || l.description || ""}`) },
        { heading: "Recent orders", points: (ctx?.recent_orders || []).slice(0, 5).map((o: any) => `${ist(o.created_at)} · ${o.symbol} ${o.transaction_type} · ${o.status}`) },
      ].filter((s) => s.points.length);
      if (!a.sections.length) a.summary = "No recent activity logs found yet.";
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ support
    case "support": {
      const a = base("Support", "INFO", "I can raise a support ticket for you right now with your live account context attached.");
      a.sections = [
        { heading: "Your tickets", points: (ctx?.support_tickets || []).slice(0, 5).map((t: any) => `#${t.id || "—"} · ${t.subject || "—"} · ${t.status || "OPEN"} · ${t.urgency || "NORMAL"} · ${ist(t.created_at)}`) },
        { heading: "Context that will be attached", points: statusStrip },
      ].filter((s) => s.points.length);
      a.action = {
        type: "create_ticket",
        ticket: { subject: message.slice(0, 90), message, urgency: /urgent|immediately|asap/i.test(message) ? "URGENT" : "NORMAL", category: "TECHNICAL" },
        reason: "User asked for support",
      };
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ profile
    case "profile": {
      const p = ctx?.profile || {};
      const a = base("My Profile", "INFO", p.full_name ? `${p.full_name} — ${p.account_status || "active"} account, client ID ${p.client_id || "—"}.` : "Profile details below.");
      a.sections = [
        {
          heading: "Account",
          points: [
            `Name ${p.full_name || "—"} · Mobile ${p.mobile || "—"}`,
            `Email ${p.email || "—"} · Client ID ${p.client_id || "—"}`,
            `KYC ${p.kyc_status || "—"} · Plan ${p.subscription_plan || "—"} · Broker ${p.broker_connected ? "linked" : "not linked"}`,
            `Profile completion ${p.profile_completion ?? "—"}% ${bar(Number(p.profile_completion || 0), 100)} · Joined ${ist(p.joined_at)}`,
          ],
        },
        { heading: "Referral", points: [`Code ${ctx?.referral?.code || "—"} · Earnings ${money(ctx?.referral?.earnings ?? 0)}`] },
      ];
      a.action = { type: "edit_profile", reason: "Profile details" };
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ help / unknown
    default: {
      const a = base("IndexPilot AI", "INFO", "I'm your in-house trading brain — every answer is computed from your live account data and live Dhan candles, never guessed.");
      a.sections = [
        { heading: "Live status", points: statusStrip },
        {
          heading: "What I can analyse",
          points: [
            "Entries — \"next signal\", \"nifty trend\", \"should I buy call now\" (full factor breakdown + confluence score)",
            "Trades — \"hold or exit my position\", \"trailing status\", \"why no trade taken\"",
            "Money — \"today P&L\", \"risk report\", \"wallet balance\"",
            "Control — \"start/stop engine\", \"slot 2 details\", \"broker status\", \"raise support ticket\", \"my profile\"",
          ],
        },
        positionsSection(an) || { heading: "Positions", points: ["No running position."] },
        secondary ? followUps(`Did you mean something about ${secondary}? Ask directly, e.g. "${secondary} details".`) : { heading: "", points: [] },
      ].filter((s) => s.heading && s.points.length);
      a.confidence = 100;
      return a;
    }
  }
}
