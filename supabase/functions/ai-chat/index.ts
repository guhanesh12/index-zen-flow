// 🤖 AI TRADING ASSISTANT (IndexPilot Brain)
// Answers ONLY signal / order / position / chart-direction / wallet-billing questions
// Charges the user's wallet per question (default ₹0.50, admin configurable)
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

// ---------------- context builder ----------------
async function buildContext(userId: string) {
  const [signals, orders, positions, slots, wallet, txns] = await Promise.all([
    admin.from("trading_signals").select("symbol,signal_type,index_name,price,strike_price,option_type,confidence,status,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    admin.from("trading_orders").select("symbol,index_name,order_type,transaction_type,quantity,price,status,error_message,dhan_order_id,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8),
    admin.from("position_monitor_state").select("symbol,index_name,entry_price,current_price,quantity,pnl,target_amount,stop_loss_amount,trailing_enabled,highest_pnl,is_active,exit_reason,updated_at")
      .eq("user_id", userId).order("updated_at", { ascending: false }).limit(10),
    admin.from("user_symbol_config").select("slot,index_name,moneyness,lot_count,enabled,target_per_lot,stop_loss_per_lot,trailing_enabled,trailing_activation_per_lot,trailing_step_per_lot")
      .eq("user_id", userId).order("slot"),
    kvGet(`wallet:${userId}`),
    admin.from("wallet_transactions").select("type,amount,description,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);

  return {
    now_ist: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    recent_signals: signals.data || [],
    recent_orders: orders.data || [],
    positions: positions.data || [],
    auto_slots: slots.data || [],
    wallet: {
      balance: Number(wallet?.balance ?? 0),
      totalDeducted: Number(wallet?.totalDeducted ?? 0),
      totalProfit: Number(wallet?.totalProfit ?? 0),
    },
    recent_wallet_transactions: txns.data || [],
  };
}

const SYSTEM_PROMPT = `You are "IndexPilot AI", the in-app trading assistant of an Indian NIFTY/BANKNIFTY options auto-trading platform (Dhan broker execution).

SCOPE — you may ONLY answer questions about:
- Trading SIGNALS (why a signal fired / did not fire, what the next signal depends on, signal confidence, strategy logic: EMA/VWAP/ADX confirmations, market regime)
- ORDERS (status, rejection reasons, Dhan errors, quantity/lots, what happens after an order is placed)
- Running POSITIONS (P&L, target, stop-loss, trailing SL, exit reasons, whether the position direction matches the current market/chart move)
- CHART / MARKET MOVEMENT analysis for the user's traded index & option contracts
- The user's WALLET: balance, debits, why an amount was charged, recharge need

If a question is outside this scope (general chit-chat, other markets, coding, personal advice, etc.), politely refuse in one line and remind the user you only cover signals, orders, positions, charts and wallet billing.

RULES:
- Use ONLY the USER CONTEXT JSON given below for facts about their account. Never invent order ids, prices or P&L.
- If data is missing, say so plainly and tell them where to look in the app.
- Be concise (max ~150 words), use bullet points, INR ₹ formatting, IST times.
- Never give SEBI-style guarantees. Add a short risk note when suggesting direction.
- Reply in the user's language style (English or Tamil/Hindi transliteration) if they write that way.`;

// ---------------- handler ----------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || url.pathname.split("/").pop();

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
    const price = freeLeft > 0 ? 0 : cfg.pricePerQuery;

    // wallet check + debit BEFORE calling the model
    const walletKey = `wallet:${user.id}`;
    const wallet = (await kvGet(walletKey)) || { balance: 0, totalDeducted: 0 };
    let balance = Number(wallet.balance || 0);

    if (price > 0) {
      if (balance < price) {
        return json({
          error: "INSUFFICIENT_BALANCE",
          message: `Low wallet balance. Each question costs ₹${price.toFixed(2)}. Please recharge.`,
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
        description: "AI Assistant query",
      });
    }

    await kvSet(usageKey, {
      count: (usage.count || 0) + 1,
      charged: Number(((usage.charged || 0) + price).toFixed(2)),
    });

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
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.3, max_tokens: 700 }),
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
      }
      if (aiRes.status === 429) return json({ error: "RATE_LIMIT", message: "Too many questions right now. Please retry in a moment." }, 429);
      if (aiRes.status === 402) return json({ error: "AI_CREDITS", message: "AI service temporarily unavailable." }, 402);
      return json({ error: "AI_ERROR", message: "AI assistant is unavailable right now." }, 502);
    }

    const data = await aiRes.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "Sorry, I could not generate an answer.";

    return json({
      success: true,
      reply,
      charged: price,
      balance,
      pricePerQuery: cfg.pricePerQuery,
      freeQueriesLeft: Math.max(0, freeLeft - 1),
    });
  } catch (e: any) {
    console.error("ai-chat error", e);
    return json({ error: "SERVER_ERROR", message: e?.message || "Unexpected error" }, 500);
  }
});
