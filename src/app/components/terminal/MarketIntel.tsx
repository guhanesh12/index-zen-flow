// @ts-nocheck
/**
 * Market Intel panels — Dhan v2 technical indicators, top movers and live news.
 * Technicals refresh every 1s, movers & news every 60s.
 * Presentation only: all data comes from the central (admin) market-data feed.
 */
import { useEffect, useRef, useState } from "react";
import { fetchWithAuth } from "../../utils/apiClient";
import { Activity, ArrowDownRight, ArrowUpRight, Loader2, Newspaper, TrendingUp } from "lucide-react";

const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"];

const num = (v: any, d = 2) =>
  Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-IN", { maximumFractionDigits: d }) : "—";

const actionClass = (a?: string) => {
  const s = String(a || "").toLowerCase();
  if (s === "bullish") return "text-emerald-400";
  if (s === "bearish") return "text-red-400";
  return "text-zinc-400";
};

/**
 * Silent poller: the panel is rendered once and then updated in place.
 * A refresh never clears the card — the last good payload stays on screen even
 * if a refresh fails, so nothing hides and re-appears.
 */
function useIntel(
  path: string,
  ms: number,
  serverUrl?: string,
  accessToken?: string,
  hasContent?: (d: any) => boolean,
) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const good = useRef(false);
  const check = useRef(hasContent);
  check.current = hasContent;

  useEffect(() => {
    if (!serverUrl || !accessToken) return;
    let alive = true;

    const tick = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const res = await fetchWithAuth(`${serverUrl}${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const json = await res.json();
        if (!alive) return;
        const usable = check.current ? check.current(json) : !!json;
        if (usable) {
          good.current = true;
          setData(json);
          setError(null);
        } else if (!good.current) {
          setError(json?.error ? String(json.error) : null);
        }
      } catch (e: any) {
        if (alive && !good.current) setError(e?.message || "Network error");
      } finally {
        busy.current = false;
        if (alive) setLoading(false);
      }
    };

    tick();
    const t = setInterval(tick, ms);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path, ms, serverUrl, accessToken]);

  return { data, error, loading };
}

const Shell = ({ title, icon, right, children }: any) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-950">
    <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-300">
        {icon}
        {title}
      </div>
      {right}
    </div>
    <div className="p-3">{children}</div>
  </div>
);

/* ─────────────── Technical indicators (1s) ─────────────── */
export function TechnicalPanel({ serverUrl, accessToken, timeframe = "15" }: any) {
  const { data, error, loading } = useIntel(
    `/market-intel/technical?timeframe=${timeframe}`,
    1000,
    serverUrl,
    accessToken,
  );
  const indices = data?.indices || {};

  return (
    <Shell
      title={`Technicals · ${timeframe}m`}
      icon={<Activity className="size-3.5 text-zinc-500" />}
      right={<span className="text-[10px] text-zinc-600">live · 1s</span>}
    >
      {loading && !data ? (
        <div className="flex items-center gap-2 py-4 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" /> Loading indicators…
        </div>
      ) : error ? (
        <div className="py-3 text-xs text-zinc-500">{error}</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {INDICES.map((name) => {
            const t = indices[name];
            return (
              <div key={name} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-100">{name}</span>
                  <span className={`text-xs font-semibold ${actionClass(t?.bias)}`}>{t?.bias || "—"}</span>
                </div>
                {!t?.ok ? (
                  <div className="text-[11px] text-zinc-600">{t?.error || "No data"}</div>
                ) : (
                  <div className="space-y-1 text-[11px]">
                    <Row label={`SMA ${t.sma?.period ?? 20}`} value={num(t.sma?.value)} action={t.sma?.action} />
                    <Row label={`EMA ${t.ema?.period ?? 20}`} value={num(t.ema?.value)} action={t.ema?.action} />
                    <Row label="RSI 14" value={num(t.rsi?.value)} action={t.rsi?.action} />
                    <Row label="MACD hist" value={num(t.macdHist?.value, 4)} action={t.macdHist?.action} />
                    {t.pivot && (
                      <div className="mt-2 border-t border-zinc-800 pt-2 text-[10px] text-zinc-500">
                        <div className="flex justify-between">
                          <span>PP {num(t.pivot.PP)}</span>
                          <span className="text-emerald-400/80">R1 {num(t.pivot.R1)}</span>
                          <span className="text-red-400/80">S1 {num(t.pivot.S1)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

const Row = ({ label, value, action }: any) => (
  <div className="flex items-center justify-between">
    <span className="text-zinc-500">{label}</span>
    <span className="flex items-center gap-2">
      <span className="text-zinc-200">{value}</span>
      <span className={`w-14 text-right ${actionClass(action)}`}>{action || "—"}</span>
    </span>
  </div>
);

/* ─────────────── Top movers (60s) ─────────────── */
export function TopMoversCard({ serverUrl, accessToken }: any) {
  const { data, error, loading } = useIntel("/market-intel/movers?limit=5", 60_000, serverUrl, accessToken);
  const gainers = data?.gainers || [];
  const losers = data?.losers || [];

  const list = (rows: any[], up: boolean) => (
    <div className="space-y-1">
      {rows.length === 0 ? (
        <div className="text-[11px] text-zinc-600">No data</div>
      ) : (
        rows.map((r) => (
          <div key={`${up}-${r.symbol}`} className="flex items-center justify-between text-[11px]">
            <span className="truncate pr-2 text-zinc-300">{r.symbol}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-zinc-400">{num(r.ltp)}</span>
              <span className={up ? "text-emerald-400" : "text-red-400"}>
                {r.changePercent >= 0 ? "+" : ""}
                {num(r.changePercent)}%
              </span>
            </span>
          </div>
        ))
      )}
    </div>
  );

  return (
    <Shell
      title="Top Movers"
      icon={<TrendingUp className="size-3.5 text-zinc-500" />}
      right={<span className="text-[10px] text-zinc-600">1 min</span>}
    >
      {loading && !data ? (
        <div className="flex items-center gap-2 py-3 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="py-2 text-xs text-zinc-500">{error}</div>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase text-emerald-400">
              <ArrowUpRight className="size-3" /> Gainers
            </div>
            {list(gainers, true)}
          </div>
          <div className="border-t border-zinc-800 pt-2">
            <div className="mb-1 flex items-center gap-1 text-[10px] uppercase text-red-400">
              <ArrowDownRight className="size-3" /> Losers
            </div>
            {list(losers, false)}
          </div>
        </div>
      )}
    </Shell>
  );
}

/* ─────────────── Live news (60s) ─────────────── */
export function MarketNewsCard({ serverUrl, accessToken }: any) {
  const { data, error, loading } = useIntel("/market-intel/news?limit=12", 60_000, serverUrl, accessToken);
  const items = data?.items || [];

  return (
    <Shell
      title="Live News"
      icon={<Newspaper className="size-3.5 text-zinc-500" />}
      right={<span className="text-[10px] text-zinc-600">1 min</span>}
    >
      {loading && !data ? (
        <div className="flex items-center gap-2 py-3 text-xs text-zinc-500">
          <Loader2 className="size-3.5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="py-2 text-xs text-zinc-500">{error}</div>
      ) : items.length === 0 ? (
        <div className="py-2 text-xs text-zinc-600">No headlines right now</div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {items.map((n: any, i: number) => (
            <a
              key={i}
              href={n.url || undefined}
              target={n.url ? "_blank" : undefined}
              rel="noreferrer"
              className="block rounded-lg border border-zinc-800/70 bg-zinc-900/40 p-2 hover:border-zinc-700"
            >
              <div className="text-[11px] leading-snug text-zinc-200">{n.headline}</div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-zinc-600">
                {n.source && <span>{n.source}</span>}
                {n.publishedAt && <span>{String(n.publishedAt).replace("T", " ").slice(0, 16)}</span>}
              </div>
            </a>
          ))}
        </div>
      )}
    </Shell>
  );
}
