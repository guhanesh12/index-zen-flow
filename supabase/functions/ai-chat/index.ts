// 🤖 AI TRADING ASSISTANT (IndexPilot Brain v2)
// - Structured JSON answers (sections, verdict, action buttons)
// - Wallet is charged ONLY for signal / position / chart ANALYSIS questions
//   (greetings, balance lookups, how-it-works questions are FREE)
// - Can place an order for an actionable signal, or exit a running position
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const KV = "kv_store_c4d79cb7";
const CONFIG_KEY = "ai_chat_config";
const DEFAULT_PRICE = 0.5;
const MODEL = "google/gemini-3.6-flash";
const ORDER_FN = `${SUPABASE_URL}/functions/v1/make-server-c4d79cb7/execute-dhan-order`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function kvGet(key: string): Promise<any> {
  const { data } = await admin.from(KV).select("value").eq("key", key).maybeSingle();
  return (data as any)?.value ?? null;
}
async function kvSet(key: string, value: any) {
  await admin.from(KV).upsert({ key, value }, { onConflict: "key" });
}

async function getConfig() {
  const cfg = (await kvGet(CONFIG_KEY)) || {};
  return {
    enabled: cfg.enabled !== false,
    pricePerQuery: Number(cfg.pricePerQuery ?? DEFAULT_PRICE),
    freeQueriesPerDay: Number(cfg.freeQueriesPerDay ?? 0),
    systemNote: String(cfg.systemNote || ""),
  };
}

async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function isAdmin(userId: string) {
  const { data } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

// ---------------- billing classifier ----------------
// Charge ONLY when the user asks for real analysis of signals / positions / chart
// direction / order decisions. Everything else (greetings, balance, help, thanks,
// how-does-it-work, plan/pricing) stays FREE.
const ANALYSIS_RE =
  /(signal|sinal|சிக்னல்|position|posit|holding|running|trade|entry|exit|எக்ஸிட்|square\s*off|squareoff|target|stop\s*loss|stoploss|\bsl\b|trail|call\b|\bce\b|\bpe\b|put\b|buy\b|sell\b|chart|trend|market\s*(move|direction|condition)|breakout|reversal|profit|loss|\bp&?l\b|nifty|banknifty|bank\s*nifty|sensex|finnifty|strike|premium|order\s*(status|reject|place)|லாபம்|நஷ்டம்|மார்க்கெட்)/i;
const FREE_RE =
  /^(hi|hii|hello|hey|thanks|thank you|ok|okay|bye|vanakkam|வணக்கம்|நன்றி)\b/i;
const BALANCE_ONLY_RE =
  /^(?!.*(signal|position|trade|chart)).*(balance|wallet|recharge|debit|debited|charge|refund|credit|price\s*per|how\s*much\s*cost)/i;

function isBillable(msg: string) {
  const m = msg.trim();
  if (m.length < 6) return false;
  if (FREE_RE.test(m)) return false;
  if (BALANCE_ONLY_RE.test(m)) return false;
  return ANALYSIS_RE.test(m);
}

// ---------------- context builder ----------------
function tokenExpiry(row: any): { expires_at: string | null; expired: boolean | null } {
  const raw = row?.access_token_expiry;
  if (!raw) return { expires_at: null, expired: null };
  const t = new Date(raw).getTime();
  return { expires_at: new Date(t).toISOString(), expired: t < Date.now() };
}

async function buildContext(userId: string) {
  const [signals, orders, positions, slots, wallet, txns, engine, broker] = await Promise.all([
    admin.from("trading_signals").select("id,symbol,signal_type,index_name,price,strike_price,option_type,confidence,status,created_at,raw_data")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    admin.from("trading_orders").select("symbol,index_name,order_type,transaction_type,quantity,price,status,error_message,dhan_order_id,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    admin.from("position_monitor_state").select("order_id,symbol,index_name,entry_price,current_price,quantity,pnl,target_amount,stop_loss_amount,trailing_enabled,highest_pnl,is_active,exit_reason,updated_at")
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(10),
    admin.from("user_symbol_config").select("slot,index_name,moneyness,lot_count,enabled,target_per_lot,stop_loss_per_lot,trailing_enabled,trailing_activation_per_lot,trailing_step_per_lot")
      .eq("user_id", userId).order("slot"),
    kvGet(`wallet:${userId}`),
    admin.from("wallet_transactions").select("type,amount,description,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    admin.from("trading_engine_state").select("is_running,started_at,stopped_at,last_heartbeat,stopped_reason,auto_resume,selected_symbols,strategy_settings")
      .eq("user_id", userId).maybeSingle(),
    admin.from("broker_credentials").select("broker,auth_method,dhan_client_id,dhan_client_name,last_status,last_error,access_token_expiry,updated_at")
      .eq("user_id", userId).maybeSingle(),
  ]);

  const sigs = (signals.data || []).map((s: any) => ({ ...s, raw_data: undefined }));
  const openPositions = (positions.data || []).filter((p: any) => p.is_active);

  const nowIst = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const istHm = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }).slice(0, 5);
  const marketOpen = istHm >= "09:15" && istHm <= "15:30";
  const b: any = broker.data || null;
  const exp = tokenExpiry(b);

  return {
    now_ist: nowIst,
    market_open: marketOpen,
    engine: {
      is_running: !!engine.data?.is_running,
      started_at: engine.data?.started_at || null,
      stopped_at: engine.data?.stopped_at || null,
      last_heartbeat: engine.data?.last_heartbeat || null,
      stopped_reason: engine.data?.stopped_reason || null,
      auto_resume: !!engine.data?.auto_resume,
      selected_symbol_count: Array.isArray(engine.data?.selected_symbols) ? engine.data.selected_symbols.length : 0,
    },
    broker: {
      connected: !!b?.dhan_client_id,
      broker: b?.broker || null,
      auth_method: b?.auth_method || null,
      dhan_client_id: b?.dhan_client_id || null,
      dhan_client_name: b?.dhan_client_name || null,
      last_status: b?.last_status || null,
      last_error: b?.last_error || null,
      access_token_expires_at: exp.expires_at,
      access_token_expired: exp.expired,
    },
    recent_signals: sigs,
    latest_signal: (signals.data || [])[0] || null,
    recent_orders: orders.data || [],
    positions: positions.data || [],
    open_positions: openPositions,
    auto_slots: slots.data || [],
    free_slots: (slots.data || []).filter((s: any) => s.enabled).length,
    wallet: {
      balance: Number(wallet?.balance ?? 0),
      totalDeducted: Number(wallet?.totalDeducted ?? 0),
      totalProfit: Number(wallet?.totalProfit ?? 0),
    },
    recent_wallet_transactions: txns.data || [],
  };
}


const SYSTEM_PROMPT = `You are "IndexPilot AI" — a national-level, institutional-grade Indian index-options trading brain (NIFTY / BANKNIFTY / SENSEX / FINNIFTY, Dhan broker auto-execution).

SCOPE — answer ONLY: trading signals (why fired / not fired, what the next signal needs), orders (status, Dhan rejections, lots), running positions (P&L, target, SL, trailing, hold vs exit), chart/market direction for the traded index & option contract, and wallet/billing. Politely refuse anything else in ONE line.

You MUST reply with STRICT JSON ONLY (no markdown fences), in this schema:
{
  "title": "short headline (max 8 words)",
  "verdict": "WAIT" | "PLACE" | "HOLD" | "EXIT" | "INFO",
  "summary": "2-3 line plain answer in the user's language style",
  "sections": [
    { "heading": "Market Read", "points": ["...", "..."] },
    { "heading": "Your Position / Signal", "points": ["..."] },
    { "heading": "Levels", "points": ["Target ₹...", "SL ₹...", "Trail ..."] },
    { "heading": "What Happens Next", "points": ["..."] }
  ],
  "confidence": 0-100,
  "risk": "one-line risk note",
  "action": { "type": "none" | "place_order" | "exit_position", "label": "...", "signalId": "...", "orderId": "...", "reason": "..." }
}

VERDICT / ACTION RULES:
- No live actionable signal or market closed → verdict "WAIT", action.type "none" (do NOT show a place button).
- A fresh CALL/PUT signal exists and a free enabled slot is available → verdict "PLACE", action.type "place_order" with that signal's id.
- Position running and analysis says keep it (even if temporarily in loss but market is favourable) → verdict "HOLD", action.type "none". Explain WHY holding is right (trend, VWAP/EMA, time decay, target distance).
- Position running and analysis says cut it → verdict "EXIT", action.type "exit_position" with that position's order_id.
- Use ONLY the USER CONTEXT JSON for facts. Never invent order ids, prices, P&L. Missing data → say so.
- Max 4 sections and max 4 SHORT bullets per section (each bullet under 140 characters). Keep the whole JSON under 300 words so it is never truncated.
- Mirror the user's language (English / Tamil / Hindi transliteration).`;

// ---------------- JSON salvage (model output may be truncated) ----------------
function stripFences(s: string) {
  return s.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
}

// Repairs a truncated JSON object: closes open strings/arrays/objects.
function repairJson(src: string): string {
  let s = src.trim();
  const start = s.indexOf("{");
  if (start > 0) s = s.slice(start);
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (inStr) { if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") { stack.pop(); lastSafe = i; }
    else if (c === "," && stack.length <= 2) lastSafe = i - 1;
  }
  let out = s;
  if (inStr) out += '"';
  // drop a dangling ", partial" tail
  if (!inStr && lastSafe > 0 && /[,\s]$/.test(out.slice(-1))) out = out.slice(0, lastSafe + 1);
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop();
  return out;
}

function parseAiJson(raw: string): any {
  const cleaned = stripFences(raw);
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  try { return JSON.parse(repairJson(cleaned)); } catch { /* continue */ }
  return null;
}

// Last resort: turn any leftover text into readable prose (never show raw JSON).
function humanizeRaw(raw: string): string {
  let t = stripFences(raw);
  if (!/[{[]/.test(t)) return t.trim();
  const lines: string[] = [];
  const summary = t.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (summary) lines.push(summary[1].replace(/\\"/g, '"'));
  const points = [...t.matchAll(/"points"\s*:\s*\[([^\]]*)/g)];
  for (const p of points) {
    for (const m of p[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) lines.push("• " + m[1].replace(/\\"/g, '"'));
  }
  if (lines.length) return lines.join("\n");
  // strip all json punctuation as a final fallback
  return t.replace(/[{}\[\]"]/g, " ").replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
}

// ---------------- order helpers ----------------
async function forwardOrder(authHeader: string, payload: Record<string, unknown>) {
  const res = await fetch(ORDER_FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function pick(obj: any, ...keys: string[]) {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

// ---------------- handler ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || url.pathname.split("/").pop();
    const authHeader = req.headers.get("Authorization") || "";

    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    // ---- GET pricing/config (any logged-in user) ----
    if (req.method === "GET" || action === "config") {
      const cfg = await getConfig();
      const wallet = await kvGet(`wallet:${user.id}`);
      return json({
        success: true,
        enabled: cfg.enabled,
        pricePerQuery: cfg.pricePerQuery,
        balance: Number(wallet?.balance ?? 0),
        billingNote: "Only signal / position / chart analysis questions are charged. General & wallet questions are free.",
      });
    }

    const body = await req.json().catch(() => ({}));

    // ---- admin: update pricing ----
    if (action === "set-config") {
      if (!(await isAdmin(user.id))) return json({ error: "Forbidden" }, 403);
      const cur = await getConfig();
      const next = {
        enabled: typeof body.enabled === "boolean" ? body.enabled : cur.enabled,
        pricePerQuery: body.pricePerQuery !== undefined
          ? Math.max(0, Number(body.pricePerQuery))
          : cur.pricePerQuery,
        freeQueriesPerDay: body.freeQueriesPerDay !== undefined
          ? Math.max(0, parseInt(body.freeQueriesPerDay))
          : cur.freeQueriesPerDay,
        systemNote: body.systemNote ?? cur.systemNote,
      };
      await kvSet(CONFIG_KEY, next);
      return json({ success: true, config: next });
    }

    // ---- EXIT a running position (free, no wallet charge) ----
    if (action === "exit-position") {
      const orderId = String(body.orderId || "").trim();
      if (!orderId) return json({ error: "orderId is required" }, 400);
      const { data: pos } = await admin
        .from("position_monitor_state")
        .select("*")
        .eq("user_id", user.id)
        .eq("order_id", orderId)
        .maybeSingle();
      if (!pos || pos.is_active === false) return json({ error: "POSITION_NOT_ACTIVE", message: "This position is not running anymore." }, 400);

      const raw: any = pos.raw_position || {};
      const securityId = pick(raw, "securityId", "security_id", "securityid");
      const dhanClientId = pick(raw, "dhanClientId", "dhan_client_id");
      if (!securityId) return json({ error: "NO_SECURITY_ID", message: "Exit not possible from chat for this position. Use the Exit button on the positions screen." }, 400);

      const out = await forwardOrder(authHeader, {
        dhanClientId,
        correlationId: `AIEXIT_${Date.now()}`,
        transactionType: "SELL",
        exchangeSegment: pos.exchange_segment || "NSE_FNO",
        productType: pick(raw, "productType") || "INTRADAY",
        orderType: "MARKET",
        validity: "DAY",
        securityId,
        quantity: pos.quantity,
        disclosedQuantity: 0,
        price: 0,
        triggerPrice: 0,
        afterMarketOrder: false,
        amoTime: "",
        boProfitValue: 0,
        boStopLossValue: 0,
      });

      if (!out.ok || out.data?.success === false) {
        return json({ error: "EXIT_FAILED", message: out.data?.error || out.data?.message || "Broker rejected the exit order." }, 502);
      }
      await admin.from("position_monitor_state").update({
        is_active: false,
        exit_reason: "manual_ai_chat_exit",
        exited_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("order_id", orderId);

      return json({ success: true, message: "Exit order placed at market price.", orderId: out.data?.orderId ?? null, charged: 0 });
    }

    // ---- PLACE order for an actionable signal (free, no wallet charge) ----
    if (action === "place-order") {
      const signalId = String(body.signalId || "").trim();
      if (!signalId) return json({ error: "signalId is required" }, 400);
      const { data: sig } = await admin
        .from("trading_signals")
        .select("*")
        .eq("user_id", user.id)
        .eq("id", signalId)
        .maybeSingle();
      if (!sig) return json({ error: "SIGNAL_NOT_FOUND" }, 404);

      const ageMin = (Date.now() - new Date(sig.created_at).getTime()) / 60000;
      if (ageMin > 15) return json({ error: "SIGNAL_EXPIRED", message: "This signal is older than 15 minutes — wait for the next one." }, 400);

      const raw: any = sig.raw_data || {};
      const securityId = pick(raw, "securityId", "security_id");
      const quantity = Number(pick(raw, "quantity", "qty") || 0);
      if (!securityId || !quantity) {
        return json({ error: "NO_SECURITY_ID", message: "Order can't be placed from chat for this signal. Use the Symbols screen." }, 400);
      }

      const out = await forwardOrder(authHeader, {
        dhanClientId: pick(raw, "dhanClientId", "dhan_client_id"),
        correlationId: `AIBUY_${Date.now()}`,
        transactionType: "BUY",
        exchangeSegment: pick(raw, "exchangeSegment") || "NSE_FNO",
        productType: pick(raw, "productType") || "INTRADAY",
        orderType: "MARKET",
        validity: "DAY",
        securityId,
        quantity,
        disclosedQuantity: 0,
        price: 0,
        triggerPrice: 0,
        afterMarketOrder: false,
        amoTime: "",
        boProfitValue: 0,
        boStopLossValue: 0,
      });

      if (!out.ok || out.data?.success === false) {
        return json({ error: "ORDER_FAILED", message: out.data?.error || out.data?.message || "Broker rejected the order." }, 502);
      }
      return json({ success: true, message: "Order placed at market price.", orderId: out.data?.orderId ?? null, charged: 0 });
    }

    // ---- chat ----
    const message = String(body.message || "").trim();
    if (!message) return json({ error: "message is required" }, 400);
    if (message.length > 1000) return json({ error: "message too long" }, 400);

    const cfg = await getConfig();
    if (!cfg.enabled) return json({ error: "AI assistant is currently disabled" }, 503);

    // free daily quota
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const usageKey = `ai_chat_usage:${user.id}:${today}`;
    const usage = (await kvGet(usageKey)) || { count: 0, charged: 0 };
    const freeLeft = Math.max(0, cfg.freeQueriesPerDay - usage.count);

    const billable = isBillable(message);
    const price = !billable || freeLeft > 0 ? 0 : cfg.pricePerQuery;
    const freeReason = !billable
      ? "General question — no wallet charge"
      : freeLeft > 0
      ? "Free daily quota used"
      : "";

    // wallet check + debit BEFORE calling the model
    const walletKey = `wallet:${user.id}`;
    const wallet = (await kvGet(walletKey)) || { balance: 0, totalDeducted: 0 };
    let balance = Number(wallet.balance || 0);

    if (price > 0) {
      if (balance < price) {
        return json({
          error: "INSUFFICIENT_BALANCE",
          message: `Low wallet balance. Analysis questions cost ₹${price.toFixed(2)}. Please recharge.`,
          balance,
          pricePerQuery: price,
        }, 402);
      }
      balance = Number((balance - price).toFixed(2));
      await kvSet(walletKey, {
        ...wallet,
        balance,
        totalDeducted: Number((Number(wallet.totalDeducted || 0) + price).toFixed(2)),
        updatedAt: Date.now(),
      });
      await admin.from("wallet_transactions").insert({
        user_id: user.id,
        type: "debit",
        amount: price,
        reference_id: `aichat_${Date.now()}`,
        description: "AI Assistant analysis",
      });
    }

    if (billable) {
      await kvSet(usageKey, {
        count: (usage.count || 0) + 1,
        charged: Number(((usage.charged || 0) + price).toFixed(2)),
      });
    }

    // build context + history
    const context = await buildContext(user.id);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n${cfg.systemNote}` },
      {
        role: "system",
        content: `USER CONTEXT JSON (live account data):\n${JSON.stringify(context)}`,
      },
      ...history
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && m.content)
        .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) })),
      { role: "user", content: message },
    ];

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 2400,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      // refund on failure
      if (price > 0) {
        const w = (await kvGet(walletKey)) || {};
        await kvSet(walletKey, {
          ...w,
          balance: Number((Number(w.balance || 0) + price).toFixed(2)),
          totalDeducted: Number(Math.max(0, Number(w.totalDeducted || 0) - price).toFixed(2)),
        });
        await admin.from("wallet_transactions").insert({
          user_id: user.id,
          type: "credit",
          amount: price,
          reference_id: `aichat_refund_${Date.now()}`,
          description: "AI Assistant refund (service error)",
        });
        balance = Number((balance + price).toFixed(2));
      }
      if (aiRes.status === 429) return json({ error: "RATE_LIMIT", message: "Too many questions right now. Please retry in a moment." }, 429);
      if (aiRes.status === 402) return json({ error: "AI_CREDITS", message: "AI service temporarily unavailable." }, 402);
      return json({ error: "AI_ERROR", message: "AI assistant is unavailable right now." }, 502);
    }

    const data = await aiRes.json();
    const rawReply = data?.choices?.[0]?.message?.content?.trim() || "";

    const parsed: any = parseAiJson(rawReply);
    if (!parsed) console.warn("ai-chat: could not parse model JSON", rawReply.slice(0, 400));

    const fallbackText = parsed ? "" : humanizeRaw(rawReply);
    const fallbackLines = fallbackText.split("\n").map((l) => l.replace(/^•\s*/, "").trim()).filter(Boolean);

    const answer = {
      title: String(parsed?.title || "IndexPilot AI"),
      verdict: ["WAIT", "PLACE", "HOLD", "EXIT", "INFO"].includes(parsed?.verdict) ? parsed.verdict : "INFO",
      summary: String(
        parsed?.summary ||
          fallbackLines[0] ||
          "I couldn't format a full answer this time. Please ask again in a shorter question.",
      ).slice(0, 900),
      sections: Array.isArray(parsed?.sections)
        ? parsed.sections
            .filter((s: any) => s && s.heading && Array.isArray(s.points))
            .slice(0, 6)
            .map((s: any) => ({
              heading: String(s.heading).slice(0, 60),
              points: s.points.map((p: any) => String(p).slice(0, 300)).filter(Boolean).slice(0, 8),
            }))
            .filter((s: any) => s.points.length > 0)
        : fallbackLines.length > 1
        ? [{ heading: "Details", points: fallbackLines.slice(1, 9) }]
        : [],
      confidence: Math.max(0, Math.min(100, Number(parsed?.confidence ?? 0))),
      risk: String(parsed?.risk || ""),
      action: { type: "none", label: "", signalId: "", orderId: "", reason: "" } as any,
    };


    // ---- validate the suggested action against real data ----
    const a = parsed?.action || {};
    if (a?.type === "place_order") {
      const sig: any = context.latest_signal;
      const fresh = sig && (Date.now() - new Date(sig.created_at).getTime()) / 60000 <= 15;
      const hasFreeSlot = (context.auto_slots || []).some((s: any) => s.enabled);
      if (context.market_open && fresh && hasFreeSlot && context.open_positions.length < (context.auto_slots || []).filter((s: any) => s.enabled).length) {
        answer.action = {
          type: "place_order",
          label: `Place ${sig.option_type || ""} order — ${sig.symbol}`,
          signalId: String(a.signalId || sig.id),
          orderId: "",
          reason: String(a.reason || "Fresh actionable signal"),
        };
      } else {
        answer.verdict = "WAIT";
      }
    } else if (a?.type === "exit_position") {
      const oid = String(a.orderId || "");
      const pos = (context.open_positions || []).find((p: any) => p.order_id === oid) || context.open_positions[0];
      if (pos) {
        answer.action = {
          type: "exit_position",
          label: `Exit ${pos.symbol} now`,
          signalId: "",
          orderId: String(pos.order_id),
          reason: String(a.reason || "Exit recommended"),
        };
      } else {
        answer.verdict = "INFO";
      }
    }

    // plain-text fallback for older clients (RN v1)
    const replyText = [
      answer.summary,
      ...answer.sections.map((s: any) => `\n**${s.heading}**\n` + s.points.map((p: string) => `• ${p}`).join("\n")),
      answer.risk ? `\n⚠️ ${answer.risk}` : "",
    ].join("\n").trim();

    return json({
      success: true,
      reply: replyText,
      answer,
      charged: price,
      billable,
      freeReason,
      balance,
      pricePerQuery: cfg.pricePerQuery,
      freeQueriesLeft: billable ? Math.max(0, freeLeft - 1) : freeLeft,
    });
  } catch (e: any) {
    console.error("ai-chat error", e);
    return json({ error: "SERVER_ERROR", message: e?.message || "Unexpected error" }, 500);
  }
});
