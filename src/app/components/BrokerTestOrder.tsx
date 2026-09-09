// @ts-nocheck
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { CheckCircle2, XCircle, FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BrokerTestOrderProps {
  serverUrl: string;
  accessToken: string;
}

export function BrokerTestOrder({ serverUrl, accessToken }: BrokerTestOrderProps) {
  const [allowed, setAllowed] = useState(false);
  const [symbols, setSymbols] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [slotResults, setSlotResults] = useState<any[]>([]);


  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${serverUrl}/broker/test-order/eligibility`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json().catch(() => ({}));
        setAllowed(!!data?.allowed);
        if (data?.allowed) {
          const s = await fetch(`${serverUrl}/symbols`, { headers: { Authorization: `Bearer ${accessToken}` } });
          const sd = await s.json().catch(() => ({}));
          const list = (sd?.symbols || []).filter((x: any) => x?.securityId || x?.symbolId || x?.symbol_id);
          setSymbols(list);
          if (list.length) setSelected(String(list[0].securityId || list[0].symbolId || list[0].symbol_id));
        }
      } catch {
        setAllowed(false);
      }
    })();
  }, [serverUrl, accessToken]);

  if (!allowed) return null;

  const current = symbols.find(
    (x: any) => String(x.securityId || x.symbolId || x.symbol_id) === selected,
  );

  async function run(placeReal: boolean) {
    if (placeReal && !confirm("Place a REAL market order with your active broker?\n\nThis uses real money. Square it off in your broker app afterwards.")) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`${serverUrl}/broker/test-order`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          placeReal,
          dryRun: !placeReal,
          securityId: current ? String(current.securityId || current.symbolId || current.symbol_id) : undefined,
          exchangeSegment: current?.exchangeSegment || current?.exchange_segment || "NSE_FNO",
          symbolName: current?.symbol || current?.tradingSymbol || current?.name,
          index: current?.index || current?.indexName,
          quantity,
          transactionType: "BUY",
        }),
      });
      const data = await res.json().catch(() => ({}));
      setResult(data);
      if (data?.success) toast.success(data.message || "Test passed");
      else toast.error(data.message || data.error || "Test failed");
    } catch (err: any) {
      toast.error(err.message || "Test failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSignalFlow(placeReal: boolean) {
    if (
      placeReal &&
      !confirm(
        "Place a REAL order using your auto slot (same path a live signal uses)?\n\nThis uses real money. Square it off in your broker app afterwards.",
      )
    )
      return;
    setBusy(true);
    setResult(null);
    setSlotResults([]);
    try {
      const res = await fetch(`${serverUrl}/broker/test-order/signal-flow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ placeReal }),
      });
      const data = await res.json().catch(() => ({}));
      setResult(data);
      setSlotResults(Array.isArray(data?.slots) ? data.slots : []);
      if (data?.success) toast.success(data.message || "Auto signal flow OK");
      else toast.error(data.message || data.error || "Auto signal flow check failed");
    } catch (err: any) {
      toast.error(err.message || "Auto signal flow check failed");
    } finally {
      setBusy(false);
    }
  }



  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4 text-fuchsia-400" />
          Broker Test Order
          <Badge variant="outline" className="ml-auto text-[10px] border-fuchsia-500/30 text-fuchsia-300 bg-fuchsia-500/10">
            Test account only
          </Badge>
        </CardTitle>
        <CardDescription className="text-zinc-400 text-xs">
          Verifies your active broker end-to-end: connection → static IP VPS → live order placement.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            aria-label="Test symbol"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="sm:col-span-2 bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-xs text-zinc-200"
          >
            {symbols.length === 0 && <option value="">No symbols available</option>}
            {symbols.map((s: any) => {
              const id = String(s.securityId || s.symbolId || s.symbol_id);
              return (
                <option key={id} value={id}>
                  {s.symbol || s.tradingSymbol || s.name || id}
                </option>
              );
            })}
          </select>
          <input
            aria-label="Test quantity"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-xs text-zinc-200"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run(false)} disabled={busy} size="sm" variant="outline" className="border-zinc-700 text-zinc-200 text-xs">
            {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} Run connection test
          </Button>
          <Button onClick={() => runSignalFlow(false)} disabled={busy} size="sm" variant="outline" className="border-cyan-700 text-cyan-200 text-xs">
            {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} Check auto signal flow
          </Button>
          <Button onClick={() => run(true)} disabled={busy || !selected} size="sm" className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-xs">
            {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} Place real test order
          </Button>
          <Button onClick={() => runSignalFlow(true)} disabled={busy} size="sm" className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs">
            {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null} Real order via auto slot
          </Button>
        </div>

        {slotResults.length > 0 && (
          <div className="space-y-2">
            {slotResults.map((r: any) => (
              <div key={r.slot} className="rounded border border-zinc-800 bg-zinc-950 p-2">
                <div className="flex items-center gap-2 text-[11px] text-zinc-200">
                  {r.ok ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <span className="font-semibold">
                    Slot {r.slot} · {r.index} {r.moneyness} · {r.action}
                  </span>
                  <span className="text-zinc-400">
                    {r.symbol ? `${r.symbol} · qty ${r.quantity}` : "not resolved"}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 pl-5">
                  {(r.steps || []).map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-1.5 text-[10.5px]">
                      {s.ok ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                      )}
                      <span className="text-zinc-300 font-medium">{s.step}:</span>
                      <span className="text-zinc-400">{s.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}


        {result && (
          <div className="space-y-2">
            <div
              className={`rounded border px-3 py-2 text-xs ${
                result.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-red-500/10 border-red-500/30 text-red-300"
              }`}
            >
              {result.message || result.error}
            </div>
            {(result.steps || []).map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[11px] text-zinc-300">
                {s.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                )}
                <span className="font-medium">{s.step}:</span>
                <span className="text-zinc-400">{s.detail}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
