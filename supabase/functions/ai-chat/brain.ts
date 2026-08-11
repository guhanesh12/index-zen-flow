// ============================================================================
// IndexPilot OWN AI BRAIN (self-hosted, rule + data driven)
// No external LLM / no third-party AI. 100% our own logic on our own data.
// Returns the same JSON shape the chat UI already renders.
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

const money = (n: any) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const pct = (n: any) => `${Number(n || 0).toFixed(2)}%`;
const has = (m: string, ...w: string[]) => w.some((x) => m.includes(x));

function ist(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  } catch {
    return String(d);
  }
}

function minsAgo(d?: string | null) {
  if (!d) return Infinity;
  return (Date.now() - new Date(d).getTime()) / 60000;
}

function base(title: string, verdict: BrainAnswer["verdict"], summary: string): BrainAnswer {
  return { title, verdict, summary, sections: [], confidence: 70, risk: "", action: { type: "none" } };
}

// ---------------------------------------------------------------- intents
export type Intent =
  | "greeting" | "wallet" | "signal" | "position" | "engine" | "slot"
  | "broker" | "journal" | "logs" | "support" | "profile" | "help" | "market" | "unknown";

export function detectIntent(msgRaw: string): Intent {
  const m = msgRaw.toLowerCase().trim();
  if (/^(hi|hii+|hello|hey|hlo|good\s*(morning|evening|afternoon)|thanks|thank you|ok|okay|bye|namaste)\b/.test(m)) return "greeting";
  if (has(m, "wallet", "balance", "recharge", "debit", "credit", "refund", "charge", "payment", "amount left")) return "wallet";
  if (has(m, "position", "running", "hold", "exit", "square off", "squareoff", "book profit", "loss chal", "my trade")) return "position";
  if (has(m, "signal", "next trade", "entry", "buy call", "buy put", "place order", "kya lena", "trade lena")) return "signal";
  if (has(m, "engine", "start bot", "stop bot", "auto trade", "algo on", "algo off")) return "engine";
  if (has(m, "slot", "lot", "target per", "stoploss per", "sl per", "trailing")) return "slot";
  if (has(m, "broker", "dhan", "access token", "token expire", "connect")) return "broker";
  if (has(m, "journal", "p&l", "pnl", "profit today", "daily report", "statement")) return "journal";
  if (has(m, "log", "activity", "history of action")) return "logs";
  if (has(m, "ticket", "support", "complaint", "help me raise", "issue raise")) return "support";
  if (has(m, "profile", "my name", "kyc", "my account", "referral")) return "profile";
  if (has(m, "market", "nifty", "banknifty", "sensex", "finnifty", "trend", "chart", "view")) return "market";
  if (has(m, "what can you do", "help", "features", "commands")) return "help";
  return "unknown";
}

// billing rule: only real analysis is billable
export function brainIsBillable(msg: string) {
  const i = detectIntent(msg);
  return i === "signal" || i === "position" || i === "market";
}

// ---------------------------------------------------------------- market read helpers
function readsOf(ctx: any) {
  return (ctx?.live_market?.indices || []) as any[];
}

function marketSection(ctx: any) {
  const reads = readsOf(ctx);
  if (!reads.length) {
    return {
      heading: "Live market",
      points: [ctx?.live_market?.reason || "Live chart data not loaded for this question."],
    };
  }
  return {
    heading: "Live index read (5m candles)",
    points: reads.map(
      (r) =>
        `${r.name}: LTP ${r.ltp} (${pct(r.day_change_pct)}) • Trend ${r.trend} • RSI ${r.rsi14} • ADX ${r.adx14} • ${
          r.above_vwap ? "above" : "below"
        } VWAP ${r.vwap} → bias ${r.bias}`,
    ),
  };
}

function bestBias(ctx: any) {
  const reads = readsOf(ctx);
  const scored = reads
    .map((r) => ({ r, score: (r.bias === "WAIT" ? 0 : 1) * (Number(r.adx14) || 0) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.r || null;
}

// ---------------------------------------------------------------- brain
export function ownBrain(message: string, ctx: any): BrainAnswer {
  const intent = detectIntent(message);
  const w = ctx?.wallet || {};
  const eng = ctx?.engine || {};
  const br = ctx?.broker || {};
  const pos = (ctx?.open_positions || [])[0];
  const slots = ctx?.auto_slots || [];
  const enabledSlots = slots.filter((s: any) => s.enabled);
  const sig = ctx?.latest_signal;

  switch (intent) {
    // ------------------------------------------------------------ greeting
    case "greeting": {
      const a = base("IndexPilot AI", "INFO", `Hello! I'm your IndexPilot trading brain. Market is currently ${ctx?.market_open ? "OPEN" : "CLOSED"} (${ctx?.now_ist}).`);
      a.sections = [
        {
          heading: "Quick status",
          points: [
            `Engine: ${eng.is_running ? "RUNNING" : "STOPPED"}${eng.stopped_reason ? ` (${eng.stopped_reason})` : ""}`,
            `Broker: ${br.connected ? `Dhan connected (${br.dhan_client_id})` : "not connected"}${br.access_token_expired ? " — token EXPIRED" : ""}`,
            `Open positions: ${(ctx?.open_positions || []).length} • Active slots: ${enabledSlots.length}/${slots.length}`,
            `Wallet: ${money(w.balance)}`,
          ],
        },
        {
          heading: "Ask me",
          points: [
            "\"Next signal kya hai?\" — live market + signal verdict",
            "\"My running position hold or exit?\" — live analysis of your trade",
            "\"Slot 1 details\" / \"Start engine\" / \"Broker status\"",
            "\"Today P&L\" / \"Create support ticket\" / \"My profile\"",
          ],
        },
      ];
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ wallet
    case "wallet": {
      const a = base("Wallet & Billing", "INFO", `Your wallet balance is ${money(w.balance)}. Total spent so far ${money(w.totalDeducted)}.`);
      a.sections = [
        {
          heading: "Balance",
          points: [
            `Available: ${money(w.balance)}`,
            `Total debited: ${money(w.totalDeducted)}`,
            `Total profit credited: ${money(w.totalProfit)}`,
          ],
        },
        {
          heading: "Recent transactions",
          points: (ctx?.recent_wallet_transactions || []).slice(0, 6).map(
            (t: any) => `${t.type === "credit" ? "＋" : "－"} ${money(t.amount)} · ${t.description || "—"} · ${ist(t.created_at)}`,
          ),
        },
      ].filter((s) => s.points.length);
      if (Number(w.balance) < 100) a.risk = "Balance below ₹100 — please recharge to keep auto-trading and analysis active.";
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ signal / market
    case "signal":
    case "market": {
      const read = bestBias(ctx);
      const fresh = sig && minsAgo(sig.created_at) <= 15;
      const slotFree = enabledSlots.length > (ctx?.open_positions || []).length;
      const a = base("Signal Analysis", "WAIT", "");

      const pts: string[] = [];
      if (sig) {
        pts.push(
          `Last signal: ${sig.symbol || "—"} ${sig.option_type || ""} @ ${sig.price ?? "—"} · confidence ${sig.confidence ?? "—"} · ${ist(sig.created_at)} (${
            fresh ? "FRESH" : "stale >15 min"
          })`,
        );
      } else pts.push("No signal generated yet for your account today.");

      a.sections = [marketSection(ctx), { heading: "Signal status", points: pts }];

      if (!ctx?.market_open) {
        a.verdict = "WAIT";
        a.summary = `Market is closed right now (${ctx?.now_ist}). No fresh entry possible — next session opens 09:15 IST.`;
        a.confidence = 100;
        return a;
      }

      if (read && read.bias !== "WAIT" && Number(read.adx14) >= 20) {
        a.verdict = fresh && slotFree ? "PLACE" : "WAIT";
        a.summary = `${read.name} is favouring ${read.bias} — trend ${read.trend}, ADX ${read.adx14}, RSI ${read.rsi14}, price ${read.above_vwap ? "above" : "below"} VWAP ${read.vwap}.`;
        a.confidence = Math.min(95, 55 + Number(read.adx14));
        a.risk = read.adx14 < 25 ? "Trend strength is moderate — keep strict SL." : "Trend strong, but respect SL/target of your slot.";
        if (a.verdict === "PLACE" && sig) {
          a.action = { type: "place_order", signalId: sig.id, reason: `Fresh ${sig.option_type || read.bias} signal aligned with ${read.name} ${read.trend}` };
        } else if (!slotFree) {
          a.risk = "All enabled slots are already used by running positions — free a slot or enable another.";
        } else if (!fresh) {
          a.risk = "Direction is clear but there is no fresh (<15 min) signal — wait for the engine's next confirmed entry.";
        }
      } else {
        a.verdict = "WAIT";
        a.summary = read
          ? `${read.name} is choppy — trend ${read.trend}, ADX ${read.adx14} (weak), RSI ${read.rsi14}. No high-probability entry; wait for a clean break with ADX ≥ 20.`
          : "Live chart data is not available right now, so I won't guess a direction. Connect/refresh Dhan token for live analysis.";
        a.confidence = read ? 70 : 40;
        a.risk = "Sideways market — avoid entries, option premium decays fast.";
      }
      return a;
    }

    // ------------------------------------------------------------ position
    case "position": {
      if (!pos) {
        const a = base("Positions", "INFO", "You have no running position right now.");
        a.sections = [
          {
            heading: "Recent orders",
            points: (ctx?.recent_orders || []).slice(0, 5).map(
              (o: any) => `${o.symbol} ${o.transaction_type} x${o.quantity} · ${o.status}${o.error_message ? ` · ${o.error_message}` : ""} · ${ist(o.created_at)}`,
            ),
          },
        ].filter((s) => s.points.length);
        a.confidence = 100;
        return a;
      }

      const pnl = Number(pos.pnl || 0);
      const tgt = Number(pos.target_amount || 0);
      const sl = Number(pos.stop_loss_amount || 0);
      const peak = Number(pos.highest_pnl || 0);
      const opt = ctx?.live_market?.running_option_chart;
      const idx = readsOf(ctx).find((r: any) => (pos.index_name || "").toUpperCase().includes(r.name)) || bestBias(ctx);
      const isCall = /CE|CALL/i.test(pos.symbol || "");
      const dirOk = idx ? (isCall ? idx.bias === "CALL" : idx.bias === "PUT") : null;

      const a = base(`Running position — ${pos.symbol}`, "HOLD", "");
      a.sections = [
        {
          heading: "Position",
          points: [
            `Entry ${pos.entry_price} → LTP ${pos.current_price} · Qty ${pos.quantity}`,
            `P&L now ${money(pnl)} · Peak ${money(peak)}`,
            `Target ${money(tgt)} · Stop-loss ${money(-Math.abs(sl))} · Trailing ${pos.trailing_enabled ? "ON" : "OFF"}`,
            `Updated ${ist(pos.updated_at)}`,
          ],
        },
        marketSection(ctx),
      ];
      if (opt) {
        a.sections.push({
          heading: "Option premium behaviour",
          points: [
            `Premium trend ${opt.trend || "—"} · RSI ${opt.rsi14 ?? "—"} · ${opt.above_vwap ? "above" : "below"} VWAP ${opt.vwap ?? "—"}`,
          ],
        });
      }

      // decision rules (own logic)
      if (tgt > 0 && pnl >= tgt) {
        a.verdict = "EXIT";
        a.summary = `Target achieved — P&L ${money(pnl)} ≥ target ${money(tgt)}. Book it.`;
        a.confidence = 95;
        a.action = { type: "exit_position", orderId: pos.order_id, reason: "Target hit" };
      } else if (sl > 0 && pnl <= -Math.abs(sl)) {
        a.verdict = "EXIT";
        a.summary = `Stop-loss breached — P&L ${money(pnl)} against SL ${money(-Math.abs(sl))}. Exit immediately, do not average.`;
        a.confidence = 96;
        a.action = { type: "exit_position", orderId: pos.order_id, reason: "Stop-loss hit" };
      } else if (peak > 0 && pnl <= peak * 0.4 && peak >= tgt * 0.5 && tgt > 0) {
        a.verdict = "EXIT";
        a.summary = `Profit giveback — peak was ${money(peak)}, now ${money(pnl)} (over 60% given back). Protect the remaining profit.`;
        a.confidence = 88;
        a.action = { type: "exit_position", orderId: pos.order_id, reason: "Profit protection" };
      } else if (dirOk === false && idx && Number(idx.adx14) >= 22) {
        a.verdict = "EXIT";
        a.summary = `Structure turned against you — ${idx.name} bias is ${idx.bias} with ADX ${idx.adx14} while you hold a ${isCall ? "CALL" : "PUT"}. P&L ${money(pnl)}. Exit rather than hope.`;
        a.confidence = 85;
        a.action = { type: "exit_position", orderId: pos.order_id, reason: "Trend reversed against position" };
      } else {
        a.verdict = "HOLD";
        a.summary =
          pnl >= 0
            ? `Hold — P&L ${money(pnl)}, market structure still ${dirOk === true ? "supporting" : "neutral for"} your ${isCall ? "CALL" : "PUT"}. Target ${money(tgt)} not reached, SL ${money(-Math.abs(sl))} safe.`
            : `Hold with care — temporary drawdown ${money(pnl)}, but SL ${money(-Math.abs(sl))} is not breached and structure has not reversed. Let the system's SL/trailing do the work.`;
        a.confidence = dirOk === true ? 82 : 68;
        a.risk = pos.trailing_enabled
          ? "Trailing SL is active — it will lock profit automatically as price moves in your favour."
          : "Trailing SL is OFF for this slot — enable it to protect profit automatically.";
      }
      return a;
    }

    // ------------------------------------------------------------ engine
    case "engine": {
      const wantStart = has(message.toLowerCase(), "start", "on", "chalu", "resume");
      const wantStop = has(message.toLowerCase(), "stop", "off", "band", "pause");
      const a = base("Trading Engine", "INFO", `Engine is currently ${eng.is_running ? "RUNNING" : "STOPPED"}.`);
      a.sections = [
        {
          heading: "Engine state",
          points: [
            `Status: ${eng.is_running ? "RUNNING" : "STOPPED"}`,
            `Started: ${ist(eng.started_at)} · Stopped: ${ist(eng.stopped_at)}`,
            `Last heartbeat: ${ist(eng.last_heartbeat)}`,
            `Stop reason: ${eng.stopped_reason || "—"} · Auto-resume: ${eng.auto_resume ? "ON" : "OFF (manual start only)"}`,
            `Symbols selected: ${eng.selected_symbol_count}`,
          ],
        },
      ];
      if (wantStart && !eng.is_running) a.action = { type: "start_engine", reason: "User asked to start the engine" };
      else if (wantStop && eng.is_running) a.action = { type: "stop_engine", reason: "User asked to stop the engine" };
      if (!br.connected) a.risk = "Broker is not connected — engine cannot place live orders.";
      else if (br.access_token_expired) a.risk = "Dhan access token expired — update it before starting the engine.";
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ slot
    case "slot": {
      const num = parseInt((message.match(/slot\s*(\d+)/i) || [])[1] || "");
      const row = slots.find((s: any) => s.slot === num) || enabledSlots[0] || slots[0];
      const a = base("Slot Configuration", "INFO", row ? `Slot ${row.slot} — ${row.index_name} ${row.moneyness}, ${row.lot_count} lot(s), ${row.enabled ? "ENABLED" : "disabled"}.` : "No slots configured yet.");
      a.sections = [
        {
          heading: "All slots",
          points: slots.map(
            (s: any) =>
              `Slot ${s.slot}: ${s.index_name} ${s.moneyness} · ${s.lot_count} lot · TGT ${money(s.target_per_lot)}/lot · SL ${money(s.stop_loss_per_lot)}/lot · Trail ${
                s.trailing_enabled ? `ON (act ${money(s.trailing_activation_per_lot)}, step ${money(s.trailing_step_per_lot)})` : "OFF"
              } · ${s.enabled ? "ENABLED" : "off"}`,
          ),
        },
      ].filter((s) => s.points.length);
      if (row) a.action = { type: "edit_slot", slot: row.slot, reason: "Slot settings" };
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ broker
    case "broker": {
      const a = base("Broker (Dhan)", "INFO", br.connected ? `Dhan connected — client ${br.dhan_client_id}${br.dhan_client_name ? ` (${br.dhan_client_name})` : ""}.` : "Dhan broker is not connected.");
      a.sections = [
        {
          heading: "Connection",
          points: [
            `Status: ${br.connected ? "CONNECTED" : "NOT CONNECTED"} · ${br.last_status || "—"}`,
            `Auth method: ${br.auth_method || "—"}`,
            `Token expires: ${ist(br.access_token_expires_at)}${br.access_token_expired ? " — EXPIRED" : ""}`,
            br.last_error ? `Last error: ${br.last_error}` : "No recent broker error.",
          ],
        },
      ];
      if (!br.connected || br.access_token_expired) {
        a.action = { type: "connect_broker", reason: br.connected ? "Token expired" : "Broker not connected" };
        a.risk = "Orders and live analysis will fail until the Dhan token is valid.";
      }
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ journal
    case "journal": {
      const st = ctx?.journal_stats || {};
      const a = base("Trading Journal", "INFO", `Journal summary: ${st.total_trades ?? 0} trades, net P&L ${money(st.net_pnl ?? st.total_pnl ?? 0)}.`);
      a.sections = [
        {
          heading: "Stats",
          points: Object.entries(st).slice(0, 8).map(([k, v]) => `${k.replace(/_/g, " ")}: ${typeof v === "number" ? (k.includes("pnl") ? money(v) : v) : String(v)}`),
        },
        {
          heading: "Recent entries",
          points: (ctx?.recent_journal || []).slice(0, 8).map(
            (j: any) => `${j.date || ist(j.created_at)} · ${j.symbol || "—"} · P&L ${money(j.pnl ?? j.net_pnl ?? 0)}`,
          ),
        },
      ].filter((s) => s.points.length);
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ logs
    case "logs": {
      const a = base("Activity Logs", "INFO", "Here are your most recent system activities.");
      a.sections = [
        {
          heading: "Recent logs",
          points: (ctx?.recent_logs || []).slice(0, 10).map((l: any) => `${ist(l.created_at || l.time)} · ${l.type || l.event || "log"} · ${l.message || l.description || ""}`),
        },
      ].filter((s) => s.points.length);
      if (!a.sections.length) a.summary = "No recent activity logs found. Ask again after some trading activity.";
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ support
    case "support": {
      const a = base("Support", "INFO", "I can raise a support ticket for you right now.");
      a.sections = [
        {
          heading: "Your tickets",
          points: (ctx?.support_tickets || []).slice(0, 5).map((t: any) => `#${t.id || t.ticket_id || "—"} · ${t.subject || "—"} · ${t.status || "OPEN"} · ${ist(t.created_at)}`),
        },
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
      const a = base("My Profile", "INFO", p.full_name ? `${p.full_name} — ${p.account_status || "active"} account.` : "Profile details below.");
      a.sections = [
        {
          heading: "Account",
          points: [
            `Name: ${p.full_name || "—"} · Mobile: ${p.mobile || "—"}`,
            `Email: ${p.email || "—"} · Client ID: ${p.client_id || "—"}`,
            `KYC: ${p.kyc_status || "—"} · Plan: ${p.subscription_plan || "—"}`,
            `Profile completion: ${p.profile_completion ?? "—"}% · Joined ${ist(p.joined_at)}`,
          ],
        },
        {
          heading: "Referral",
          points: [`Code: ${ctx?.referral?.code || "—"} · Earnings: ${money(ctx?.referral?.earnings ?? 0)}`],
        },
      ];
      a.confidence = 100;
      return a;
    }

    // ------------------------------------------------------------ help / unknown
    default: {
      const a = base("IndexPilot AI", "INFO", "I'm your own in-house trading brain — I answer only from your live account and market data.");
      a.sections = [
        {
          heading: "What I can do",
          points: [
            "Signals & market: \"next signal\", \"nifty trend\", \"should I buy call now\"",
            "Positions: \"hold or exit my position\", \"my running trade\"",
            "Engine: \"start engine\", \"stop engine\", \"engine status\"",
            "Slots: \"slot 2 details\", \"change target of slot 1\"",
            "Broker: \"broker status\", \"token expiry\"",
            "Account: \"wallet balance\", \"today P&L\", \"my profile\", \"raise support ticket\"",
          ],
        },
        {
          heading: "Live snapshot",
          points: [
            `Market ${ctx?.market_open ? "OPEN" : "CLOSED"} · Engine ${eng.is_running ? "RUNNING" : "STOPPED"}`,
            `Open positions ${(ctx?.open_positions || []).length} · Slots ${enabledSlots.length}/${slots.length} enabled`,
            `Wallet ${money(w.balance)}`,
          ],
        },
      ];
      a.confidence = 100;
      return a;
    }
  }
}
