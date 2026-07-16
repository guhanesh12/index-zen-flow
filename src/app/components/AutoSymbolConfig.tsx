// @ts-nocheck
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import { Label } from "@/app/components/ui/label";
import { Input } from "@/app/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { Loader2, Plus, Trash2, Zap, RefreshCw, Target, Shield, TrendingUp, Info, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { toast } from "sonner";
import { fetchWithAuth, getAccessToken } from "../utils/apiClient";

interface Slot {
  slot: number;
  index_name: "NIFTY" | "BANKNIFTY" | "SENSEX";
  moneyness: "ATM" | "ITM1" | "ITM2" | "OTM1" | "OTM2";
  lot_count: number;
  enabled: boolean;
  target_per_lot: number;
  stop_loss_per_lot: number;
  trailing_enabled: boolean;
  trailing_activation_per_lot: number;
  trailing_step_per_lot: number;
}

const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"] as const;
const MONEYNESS = [
  { v: "ITM2", l: "ITM-2 (deep ITM)" },
  { v: "ITM1", l: "ITM-1" },
  { v: "ATM",  l: "ATM" },
  { v: "OTM1", l: "OTM-1" },
  { v: "OTM2", l: "OTM-2 (deep OTM)" },
];

// Same multipliers as the backend engine — keep in sync.
const MONEYNESS_MULT: Record<string, { tgt: number; sl: number }> = {
  ITM2: { tgt: 0.70, sl: 1.30 },
  ITM1: { tgt: 0.85, sl: 1.15 },
  ATM:  { tgt: 1.00, sl: 1.00 },
  OTM1: { tgt: 1.20, sl: 0.85 },
  OTM2: { tgt: 1.50, sl: 0.70 },
};

function computeEffective(s: Slot) {
  const mm = MONEYNESS_MULT[s.moneyness] || MONEYNESS_MULT.ATM;
  return {
    target: +((s.target_per_lot || 0) * s.lot_count * mm.tgt).toFixed(2),
    stopLoss: +((s.stop_loss_per_lot || 0) * s.lot_count * mm.sl).toFixed(2),
    trailingAct: +((s.trailing_activation_per_lot || 0) * s.lot_count * mm.tgt).toFixed(2),
    trailingStep: +((s.trailing_step_per_lot || 0) * s.lot_count).toFixed(2),
    mm,
  };
}

export function AutoSymbolConfig({
  serverUrl,
  accessToken,
  userId,
}: {
  serverUrl: string;
  accessToken: string;
  userId: string;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  async function getHeaders(json = true) {
    const token = (await getAccessToken()) || accessToken;
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
    };
  }

  function normalizeRow(r: any): Slot {
    return {
      slot: r.slot,
      index_name: r.index_name,
      moneyness: r.moneyness,
      lot_count: Number(r.lot_count) || 1,
      enabled: !!r.enabled,
      target_per_lot: Number(r.target_per_lot) || 0,
      stop_loss_per_lot: Number(r.stop_loss_per_lot) || 0,
      trailing_enabled: !!r.trailing_enabled,
      trailing_activation_per_lot: Number(r.trailing_activation_per_lot) || 0,
      trailing_step_per_lot: Number(r.trailing_step_per_lot) || 0,
    };
  }

  async function load() {
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await fetchWithAuth(`${serverUrl}/auto-symbol/config`, { headers: await getHeaders(false) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      setSlots((j.slots || []).map(normalizeRow));
    } catch (e: any) {
      toast.error(`Failed to load auto symbol config: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [accessToken, userId]);

  function nextSlotNumber(): number {
    const used = new Set(slots.map(s => s.slot));
    for (let i = 1; i <= 3; i++) if (!used.has(i)) return i;
    return 0;
  }

  async function saveSlot(slot: Slot) {
    setSaving(slot.slot);
    try {
      const r = await fetchWithAuth(`${serverUrl}/auto-symbol/config`, {
        method: "POST", headers: await getHeaders(), body: JSON.stringify(slot),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      toast.success(`Slot ${slot.slot} saved`);
      window.dispatchEvent(new Event("auto-symbol-config-updated"));
      await load();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  async function deleteSlot(slot: number) {
    if (!confirm(`Remove slot ${slot}?`)) return;
    try {
      const r = await fetchWithAuth(`${serverUrl}/auto-symbol/config/${slot}`, {
        method: "DELETE", headers: await getHeaders(false),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      toast.success(`Slot ${slot} removed`);
      window.dispatchEvent(new Event("auto-symbol-config-updated"));
      await load();
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message}`);
    }
  }

  function addSlot() {
    const n = nextSlotNumber();
    if (!n) { toast.warning("Maximum 3 slots"); return; }
    setSlots(prev => [...prev, {
      slot: n, index_name: "NIFTY", moneyness: "ATM", lot_count: 1, enabled: true,
      target_per_lot: 500, stop_loss_per_lot: 300,
      trailing_enabled: false, trailing_activation_per_lot: 400, trailing_step_per_lot: 100,
    }].sort((a, b) => a.slot - b.slot));
  }

  function updateLocal(idx: number, patch: Partial<Slot>) {
    setSlots(prev => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="h-5 w-5 text-primary" />
            Auto Symbol Selection (ATM / ITM / OTM)
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          3 slots — one per index. Target / SL / Trailing are entered <strong>per lot</strong> and the
          engine auto-scales them by <strong>lot count</strong> and <strong>ATM/ITM/OTM</strong>. Works for both CE and PE.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!loading && slots.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No auto-symbol slots configured. Click <strong>Add Symbol</strong> to start.
          </div>
        )}

        {slots.map((s, i) => {
          const eff = computeEffective(s);
          return (
            <div
              key={s.slot}
              className="rounded-lg border border-border bg-muted/30 p-3 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Slot {s.slot}</Badge>
                  <Switch
                    checked={s.enabled}
                    onCheckedChange={(v) => updateLocal(i, { enabled: v })}
                  />
                  <span className="text-xs text-muted-foreground">{s.enabled ? "Enabled" : "Disabled"}</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => deleteSlot(s.slot)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Index</Label>
                  <Select value={s.index_name} onValueChange={(v) => updateLocal(i, { index_name: v as any })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INDICES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Moneyness</Label>
                  <Select value={s.moneyness} onValueChange={(v) => updateLocal(i, { moneyness: v as any })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONEYNESS.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Lot Count</Label>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-9 w-9"
                      onClick={() => updateLocal(i, { lot_count: Math.max(1, s.lot_count - 1) })}>−</Button>
                    <div className="flex-1 text-center font-mono text-sm bg-background rounded h-9 flex items-center justify-center border">
                      {s.lot_count}
                    </div>
                    <Button variant="outline" size="icon" className="h-9 w-9"
                      onClick={() => updateLocal(i, { lot_count: Math.min(50, s.lot_count + 1) })}>+</Button>
                  </div>
                </div>
              </div>

              {/* Per-lot risk inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs flex items-center gap-1"><Target className="h-3 w-3 text-green-500" /> Target ₹ / lot</Label>
                  <Input type="number" min={0} className="h-9" value={s.target_per_lot}
                    onChange={(e) => updateLocal(i, { target_per_lot: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><Shield className="h-3 w-3 text-red-500" /> Stop-Loss ₹ / lot</Label>
                  <Input type="number" min={0} className="h-9" value={s.stop_loss_per_lot}
                    onChange={(e) => updateLocal(i, { stop_loss_per_lot: Number(e.target.value) || 0 })} />
                </div>
              </div>

              {/* Trailing */}
              <div className="rounded-md border border-border bg-background/60 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  <Label className="text-xs flex-1">Trailing Stop-Loss</Label>
                  <Switch checked={s.trailing_enabled}
                    onCheckedChange={(v) => updateLocal(i, { trailing_enabled: v })} />
                </div>
                {s.trailing_enabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Activate at ₹ / lot</Label>
                      <Input type="number" min={0} className="h-8" value={s.trailing_activation_per_lot}
                        onChange={(e) => updateLocal(i, { trailing_activation_per_lot: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Step ₹ / lot</Label>
                      <Input type="number" min={0} className="h-8" value={s.trailing_step_per_lot}
                        onChange={(e) => updateLocal(i, { trailing_step_per_lot: Number(e.target.value) || 0 })} />
                    </div>
                  </div>
                )}
              </div>

              {/* Live computed preview */}
              <div className="rounded-md bg-primary/5 border border-primary/20 p-2 text-[11px] font-mono grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>🎯 Target: <span className="text-green-500 font-bold">₹{eff.target}</span></div>
                <div>🛡️ SL: <span className="text-red-500 font-bold">₹{eff.stopLoss}</span></div>
                <div>🔥 Trail act: <span className="text-amber-500 font-bold">₹{eff.trailingAct}</span></div>
                <div>📈 Trail step: <span className="text-amber-500 font-bold">₹{eff.trailingStep}</span></div>
                <div className="col-span-2 sm:col-span-4 text-muted-foreground">
                  {s.moneyness} mult → tgt ×{eff.mm.tgt} · sl ×{eff.mm.sl} · lots ×{s.lot_count} · applies to CE &amp; PE
                </div>
              </div>

              <div className="flex justify-end">
                <Button size="sm" onClick={() => saveSlot(s)} disabled={saving === s.slot}>
                  {saving === s.slot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Save Slot {s.slot}
                </Button>
              </div>
            </div>
          );
        })}

        {slots.length < 3 && !loading && (
          <Button variant="outline" className="w-full" onClick={addSlot}>
            <Plus className="mr-2 h-4 w-4" /> Add Symbol (slot {nextSlotNumber()} of 3)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
