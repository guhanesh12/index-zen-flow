// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Bot, X, Send, Loader2, Wallet, Sparkles } from "lucide-react";
import { projectId } from "@/utils-ext/supabase/info";

const FN_URL = `https://${projectId}.supabase.co/functions/v1/ai-chat`;

const QUICK = [
  "Next signal எப்போ வரும்?",
  "Why no trade taken today?",
  "My running position direction correct-ah?",
  "Explain my last order status",
  "Why was my wallet debited?",
];

export function AIAssistantBot({ accessToken }: { accessToken: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [price, setPrice] = useState(0.5);
  const [balance, setBalance] = useState<number | null>(null);
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([
    {
      role: "assistant",
      content:
        "Hi 👋 I'm **IndexPilot AI**. Ask me about your signals, orders, running positions, chart direction or wallet debits.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !accessToken) return;
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

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    const history = messages.filter((m) => m.role !== "system").slice(-8);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await fetch(`${FN_URL}?action=chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content:
              data?.error === "INSUFFICIENT_BALANCE"
                ? `⚠️ ${data.message} (Balance ₹${Number(data.balance || 0).toFixed(2)})`
                : `⚠️ ${data?.message || "Something went wrong. Please try again."}`,
          },
        ]);
      } else {
        setBalance(Number(data.balance ?? balance ?? 0));
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "⚠️ Network error. Please retry." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating button */}
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

      {/* Panel */}
      {open && (
        <div className="fixed inset-x-2 bottom-2 top-16 md:inset-auto md:bottom-6 md:right-6 md:w-[400px] md:h-[560px] z-[60] flex flex-col rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-r from-primary/15 to-transparent">
            <div className="size-9 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">IndexPilot AI</p>
              <p className="text-[11px] text-muted-foreground">
                Signals · Orders · Positions · Wallet
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="size-5 text-muted-foreground hover:text-foreground" />
            </button>
          </header>

          <div className="flex items-center justify-between px-4 py-1.5 text-[11px] border-b border-border bg-muted/30">
            <span className="text-muted-foreground">
              ₹{price.toFixed(2)} per question
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Wallet className="size-3" />
              ₹{balance === null ? "--" : balance.toFixed(2)}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                      : "max-w-[92%] text-sm text-foreground whitespace-pre-wrap leading-relaxed"
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Analysing your account…
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
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-end gap-2 p-3 border-t border-border"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
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
