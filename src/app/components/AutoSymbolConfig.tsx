// @ts-nocheck
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Button } from "@/app/components/ui/button";
import { Switch } from "@/app/components/ui/switch";
import { Label } from "@/app/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";
import { Loader2, Plus, Trash2, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Slot {
  slot: number;
  index_name: "NIFTY" | "BANKNIFTY" | "SENSEX";
  moneyness: "ATM" | "ITM1" | "ITM2" | "OTM1" | "OTM2";
  lot_count: number;
  enabled: boolean;
}

const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"] as const;
const MONEYNESS = [
  { v: "ITM2", l: "ITM-2 (deep in-the-money)" },
  { v: "ITM1", l: "ITM-1 (in-the-money)" },
  { v: "ATM",  l: "ATM (at-the-money)" },
  { v: "OTM1", l: "OTM-1 (out-of-the-money)" },
  { v: "OTM2", l: "OTM-2 (deep out-of-the-money)" },
];

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

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "x-user-id": userId,
  };

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`${serverUrl}/auto-symbol/config`, { headers });
      const j = await r.json();
      if (j.success) setSlots(j.slots || []);
    } catch (e: any) {
      toast.error("Failed to load auto symbol config");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  function nextSlotNumber(): number {
    const used = new Set(slots.map(s => s.slot));
    for (let i = 1; i <= 3; i++) if (!used.has(i)) return i;
    return 0;
  }

  async function saveSlot(slot: Slot) {
    setSaving(slot.slot);
    try {
      const r = await fetch(`${serverUrl}/auto-symbol/config`, {
        method: "POST", headers, body: JSON.stringify(slot),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      toast.success(`Slot ${slot.slot} saved`);
      load();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  async function deleteSlot(slot: number) {
    if (!confirm(`Remove slot ${slot}?`)) return;
    try {
      const r = await fetch(`${serverUrl}/auto-symbol/config/${slot}`, {
        method: "DELETE", headers,
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error);
      toast.success(`Slot ${slot} removed`);
      load();
    } catch (e: any) {
      toast.error(`Delete failed: ${e.message}`);
    }
  }

  function addSlot() {
    const n = nextSlotNumber();
    if (!n) { toast.warning("Maximum 3 slots"); return; }
    setSlots(prev => [...prev, {
      slot: n, index_name: "NIFTY", moneyness: "ATM", lot_count: 1, enabled: true,
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
          Configure up to 3 slots. When the AI fires <Badge variant="outline" className="mx-1">BUY_CALL</Badge>
          or <Badge variant="outline" className="mx-1">BUY_PUT</Badge> for the matching index, the engine
          auto-picks the correct option contract from today's instrument master and places the order in milliseconds.
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

        {slots.map((s, i) => (
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
                <Select
                  value={s.index_name}
                  onValueChange={(v) => updateLocal(i, { index_name: v as any })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INDICES.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Moneyness</Label>
                <Select
                  value={s.moneyness}
                  onValueChange={(v) => updateLocal(i, { moneyness: v as any })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONEYNESS.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Lot Count</Label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => updateLocal(i, { lot_count: Math.max(1, s.lot_count - 1) })}
                  >−</Button>
                  <div className="flex-1 text-center font-mono text-sm bg-background rounded h-9 flex items-center justify-center border">
                    {s.lot_count}
                  </div>
                  <Button
                    variant="outline" size="icon" className="h-9 w-9"
                    onClick={() => updateLocal(i, { lot_count: Math.min(50, s.lot_count + 1) })}
                  >+</Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => saveSlot(s)} disabled={saving === s.slot}>
                {saving === s.slot ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Slot {s.slot}
              </Button>
            </div>
          </div>
        ))}

        {slots.length < 3 && !loading && (
          <Button variant="outline" className="w-full" onClick={addSlot}>
            <Plus className="mr-2 h-4 w-4" /> Add Symbol (slot {nextSlotNumber()} of 3)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
