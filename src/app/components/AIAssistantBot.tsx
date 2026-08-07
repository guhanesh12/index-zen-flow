// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import {
  Bot, X, Send, Loader2, Wallet, Sparkles, TrendingUp, ShieldAlert,
  Clock, CheckCircle2, LogOut, Gauge, Info, Power, PowerOff, SlidersHorizontal, Link2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { projectId } from "@/utils-ext/supabase/info";

const FN_URL = `https://${projectId}.supabase.co/functions/v1/ai-chat`;

const QUICK = [
  "Next signal எப்போ வரும்?",
  "Why no trade taken today?",
  "My running position hold or exit?",
  "Slot 1 details show pannu",
  "Start my trading engine",
  "Broker token expiry status?",
];


const VERDICT_META = {
  WAIT: { label: "WAIT", icon: Clock, cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  PLACE: { label: "ENTRY READY", icon: TrendingUp, cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  HOLD: { label: "HOLD", icon: CheckCircle2, cls: "bg-sky-500/15 text-sky-500 border-sky-500/30" },
  EXIT: { label: "EXIT NOW", icon: LogOut, cls: "bg-red-500/15 text-red-500 border-red-500/30" },
  INFO: { label: "INFO", icon: Info, cls: "bg-muted text-muted-foreground border-border" },
};

const MD = ({ children }: { children: string }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <span>{children}</span>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      ul: ({ children }) => <ul className="list-disc pl-4 space-y-0.5">{children}</ul>,
      code: ({ children }) => <code className="px-1 rounded bg-muted text-[11px]">{children}</code>,
    }}
  >
    {children}
  </ReactMarkdown>
);

const NUM_FIELDS = [
  { key: "lotCount", label: "Lots", from: "lot_count" },
  { key: "targetPerLot", label: "Target / lot ₹", from: "target_per_lot" },
  { key: "stopLossPerLot", label: "Stop loss / lot ₹", from: "stop_loss_per_lot" },
  { key: "trailingActivationPerLot", label: "Trail activate ₹", from: "trailing_activation_per_lot" },
  { key: "trailingStepPerLot", label: "Trail step ₹", from: "trailing_step_per_lot" },
];

function SlotEditor({ action, onAction, actionState }) {
  const cur = action.current || {};
  const [form, setForm] = useState(() => {
    const f: any = {
      indexName: cur.index_name || "NIFTY",
      moneyness: cur.moneyness || "ATM",
      enabled: cur.enabled !== false,
      trailingEnabled: cur.trailing_enabled !== false,
    };
    NUM_FIELDS.forEach((n) => { f[n.key] = String(cur[n.from] ?? ""); });
    return f;
  });

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="p-3 pt-0 space-y-2">
      <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-primary flex items-center gap-1">
          <SlidersHorizontal className="size-3" /> Edit Slot {action.slot}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted-foreground">
            Index
            <select
              value={form.indexName}
              onChange={(e) => set("indexName", e.target.value)}
              className="mt-0.5 w-full h-8 rounded-lg bg-background border border-border px-2 text-xs text-foreground"
            >
              {["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground">
            Moneyness
            <select
              value={form.moneyness}
              onChange={(e) => set("moneyness", e.target.value)}
              className="mt-0.5 w-full h-8 rounded-lg bg-background border border-border px-2 text-xs text-foreground"
            >
              {["ITM2", "ITM1", "ATM", "OTM1", "OTM2"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>

          {NUM_FIELDS.map((n) => (
            <label key={n.key} className="text-[11px] text-muted-foreground">
              {n.label}
              <input
                type="number"
                inputMode="numeric"
                value={form[n.key]}
                onChange={(e) => set(n.key, e.target.value)}
                className="mt-0.5 w-full h-8 rounded-lg bg-background border border-border px-2 text-xs text-foreground"
              />
            </label>
          ))}
        </div>

        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            Slot enabled
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input type="checkbox" checked={form.trailingEnabled} onChange={(e) => set("trailingEnabled", e.target.checked)} />
            Trailing SL
          </label>
        </div>
      </div>

      <button
        onClick={() => onAction("update-slot", { slot: action.slot, ...form })}
        disabled={!!actionState.busy || actionState.done}
        className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {actionState.busy ? <Loader2 className="size-4 animate-spin" /> : <SlidersHorizontal className="size-4" />}
        {actionState.done ? "Slot updated ✓" : `Save Slot ${action.slot}`}
      </button>
      <p className="text-[10px] text-center text-muted-foreground">Saved instantly to your account · no wallet charge</p>
    </div>
  );
}

function AnswerCard({ answer, onAction, actionState }) {

  const meta = VERDICT_META[answer.verdict] || VERDICT_META.INFO;
  const VIcon = meta.icon;
  return (
    <div className="rounded-2xl border border-border bg-background/60 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>
          <VIcon className="size-3" /> {meta.label}
        </span>
        <p className="text-xs font-semibold truncate flex-1">{answer.title}</p>
        {answer.confidence > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Gauge className="size-3" />{answer.confidence}%
          </span>
        )}
      </div>

      <div className="px-3 py-2 text-sm leading-relaxed text-foreground">
        <MD>{answer.summary}</MD>
      </div>

      {answer.sections?.length > 0 && (
        <div className="px-3 pb-2 space-y-2">
          {answer.sections.map((s, i) => (
            <div key={i} className="rounded-xl bg-muted/40 border border-border/60 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-primary mb-1">{s.heading}</p>
              <ul className="space-y-1">
                {s.points.map((p, j) => (
                  <li key={j} className="text-[12.5px] text-muted-foreground flex gap-1.5 leading-snug">
                    <span className="text-primary mt-[3px]">•</span>
                    <span className="flex-1"><MD>{p}</MD></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {answer.risk && (
        <div className="mx-3 mb-2 flex items-start gap-1.5 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">
          <ShieldAlert className="size-3.5 shrink-0 mt-[1px]" />
          <span>{answer.risk}</span>
        </div>
      )}

      {answer.action?.type === "place_order" && (
        <div className="p-3 pt-0">
          <button
            onClick={() => onAction("place-order", { signalId: answer.action.signalId })}
            disabled={!!actionState.busy || actionState.done}
            className="w-full h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-emerald-500 transition-colors"
          >
            {actionState.busy ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
            {actionState.done ? "Order placed ✓" : answer.action.label || "Place order"}
          </button>
          <p className="text-[10px] text-center text-muted-foreground mt-1">Market order · uses your enabled slot · no wallet charge</p>
        </div>
      )}

      {answer.action?.type === "exit_position" && (
        <div className="p-3 pt-0">
          <button
            onClick={() => onAction("exit-position", { orderId: answer.action.orderId })}
            disabled={!!actionState.busy || actionState.done}
            className="w-full h-10 rounded-xl bg-red-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-red-500 transition-colors"
          >
            {actionState.busy ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            {actionState.done ? "Exit order sent ✓" : answer.action.label || "Exit position"}
          </button>
          <p className="text-[10px] text-center text-muted-foreground mt-1">Instant MARKET exit · no wallet charge</p>
        </div>
      )}

      {answer.action?.type === "start_engine" && (
        <div className="p-3 pt-0">
          <button
            onClick={() => onAction("engine-start", {})}
            disabled={!!actionState.busy || actionState.done}
            className="w-full h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-emerald-500 transition-colors"
          >
            {actionState.busy ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
            {actionState.done ? "Engine started ✓" : answer.action.label || "Start trading engine"}
          </button>
          <p className="text-[10px] text-center text-muted-foreground mt-1">Starts VPS + signal engine · no wallet charge</p>
        </div>
      )}

      {answer.action?.type === "stop_engine" && (
        <div className="p-3 pt-0">
          <button
            onClick={() => onAction("engine-stop", {})}
            disabled={!!actionState.busy || actionState.done}
            className="w-full h-10 rounded-xl bg-slate-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-slate-600 transition-colors"
          >
            {actionState.busy ? <Loader2 className="size-4 animate-spin" /> : <PowerOff className="size-4" />}
            {actionState.done ? "Engine stopped ✓" : answer.action.label || "Stop trading engine"}
          </button>
          <p className="text-[10px] text-center text-muted-foreground mt-1">Stops signal engine · no wallet charge</p>
        </div>
      )}

      {answer.action?.type === "edit_slot" && (
        <SlotEditor action={answer.action} onAction={onAction} actionState={actionState} />
      )}

      {answer.action?.type === "connect_broker" && (
        <div className="p-3 pt-0">
          <button
            onClick={() => onAction("open-broker", {})}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Link2 className="size-4" />
            {answer.action.label || "Open broker settings"}
          </button>
          <p className="text-[10px] text-center text-muted-foreground mt-1">Opens the Broker tab to add/refresh your Dhan access token</p>
        </div>
      )}



      {actionState.error && (
        <p className="px-3 pb-3 text-[11px] text-red-500">{actionState.error}</p>
      )}
    </div>
  );
}

export function AIAssistantBot({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(0.5);
  const [balance, setBalance] = useState<number | null>(null);
  const [actionStates, setActionStates] = useState<Record<number, any>>({});
  const [messages, setMessages] = useState<any[]>([
    {
      role: "assistant",
      answer: {
        title: "IndexPilot AI ready",
        verdict: "INFO",
        summary:
          "Hi 👋 Ask me about **next signal**, your **running position** (hold or exit), **order status**, **chart direction** or **wallet debits**.",
        sections: [
          {
            heading: "Billing",
            points: [
              "Signal / position / chart **analysis** questions are charged from wallet.",
              "General, help & wallet questions are **free** — no debit.",
            ],
          },
        ],
        confidence: 0,
        risk: "",
        action: { type: "none" },
      },
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open || !accessToken) return;
    inputRef.current?.focus();
    fetch(`${FN_URL}?action=config`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.pricePerQuery !== undefined) setPrice(Number(d.pricePerQuery));
        if (d?.balance !== undefined) setBalance(Number(d.balance));
      })
      .catch(() => {});
  }, [open, accessToken]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const ACTION_TITLE = {
    "exit-position": { title: "Exit order sent", verdict: "EXIT" },
    "place-order": { title: "Order placed", verdict: "PLACE" },
    "engine-start": { title: "Trading engine started", verdict: "INFO" },
    "engine-stop": { title: "Trading engine stopped", verdict: "INFO" },
    "update-slot": { title: "Slot updated", verdict: "INFO" },
  };

  const runAction = async (idx: number, act: string, payload: any) => {
    if (act === "open-broker") {
      window.dispatchEvent(new CustomEvent("indexpilot:navigate", { detail: { tab: "broker" } }));
      setOpen(false);
      return;
    }
    setActionStates((s) => ({ ...s, [idx]: { busy: true } }));
    try {
      const res = await fetch(`${FN_URL}?action=${act}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data?.success === false) {
        setActionStates((s) => ({ ...s, [idx]: { error: data?.message || "Action failed." } }));
      } else {
        setActionStates((s) => ({ ...s, [idx]: { done: true } }));
        const meta = ACTION_TITLE[act] || { title: "Done", verdict: "INFO" };
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            answer: {
              title: meta.title,
              verdict: meta.verdict,
              summary: `${data.message}${data.orderId ? ` (Order ID: ${data.orderId})` : ""}`,
              sections: [],
              confidence: 0,
              risk: "",
              action: { type: "none" },
            },
          },
        ]);
      }
    } catch {
      setActionStates((s) => ({ ...s, [idx]: { error: "Network error." } }));

    }
  };

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const history = messages
      .filter((m) => m.role === "user" || m.answer)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content ?? m.answer?.summary ?? "" }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch(`${FN_URL}?action=chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            error:
              data?.error === "INSUFFICIENT_BALANCE"
                ? `⚠️ ${data.message} (Balance ₹${Number(data.balance || 0).toFixed(2)})`
                : `⚠️ ${data?.message || "Something went wrong. Please try again."}`,
          },
        ]);
      } else {
        setBalance(Number(data.balance ?? balance ?? 0));
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            answer: data.answer,
            charged: Number(data.charged || 0),
            freeReason: data.freeReason,
          },
        ]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", error: "⚠️ Network error. Please retry." }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI trading assistant"
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[60] size-14 rounded-full bg-gradient-to-br from-primary to-blue-600 text-primary-foreground shadow-2xl shadow-primary/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <Bot className="size-7" />
          <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-400 animate-pulse" />
        </button>
      )}

      {open && (
        <div className="fixed inset-x-2 bottom-2 top-16 md:inset-auto md:bottom-6 md:right-6 md:w-[420px] md:h-[600px] z-[60] flex flex-col rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/15 to-transparent">
            <div className="size-9 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">IndexPilot AI</p>
              <p className="text-[11px] text-muted-foreground">Signals · Orders · Positions · Wallet</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="size-5 text-muted-foreground hover:text-foreground" />
            </button>
          </header>

          <div className="flex items-center justify-between px-4 py-1.5 text-[11px] border-b border-border bg-muted/30">
            <span className="text-muted-foreground">₹{price.toFixed(2)} per analysis · general Q free</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Wallet className="size-3" />₹{balance === null ? "--" : balance.toFixed(2)}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                </div>
              ) : m.error ? (
                <div key={i} className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {m.error}
                </div>
              ) : (
                <div key={i} className="space-y-1">
                  <AnswerCard
                    answer={m.answer}
                    actionState={actionStates[i] || {}}
                    onAction={(act, payload) => runAction(i, act, payload)}
                  />
                  {m.charged !== undefined && (
                    <p className="text-[10px] text-muted-foreground pl-1">
                      {m.charged > 0
                        ? `₹${m.charged.toFixed(2)} debited from wallet`
                        : `Free — ${m.freeReason || "no wallet debit"}`}
                    </p>
                  )}
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Analysing chart, signals & your position…
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-end gap-2 p-3 border-t border-border"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              placeholder="Ask about signal, order, position…"
              className="flex-1 resize-none max-h-24 rounded-xl bg-muted/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="size-9 shrink-0 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default AIAssistantBot;
