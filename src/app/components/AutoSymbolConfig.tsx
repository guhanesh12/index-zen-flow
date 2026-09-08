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
import { 
  Loader2, Plus, Trash2, Zap, RefreshCw, Target, Shield, TrendingUp, 
  CheckCircle2, Sparkles, Sliders, ChevronDown, ChevronUp, AlertCircle 
} from "lucide-react";
import { toast } from "sonner";
import { fetchWithAuth, getAccessToken } from "../utils/apiClient";

export interface Slot {
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

const INDICES = [
  { id: "NIFTY", name: "NIFTY 50", lotSize: "25/75" },
  { id: "BANKNIFTY", name: "BANK NIFTY", lotSize: "15/30" },
  { id: "SENSEX", name: "SENSEX", lotSize: "10/20" },
] as const;

const MONEYNESS = [
  { v: "ITM2", l: "ITM-2", desc: "Deep ITM (0.7x Tgt, 1.3x SL)" },
  { v: "ITM1", l: "ITM-1", desc: "In The Money (0.85x Tgt, 1.15x SL)" },
  { v: "ATM",  l: "ATM",   desc: "At The Money (1.0x Tgt, 1.0x SL)" },
  { v: "OTM1", l: "OTM-1", desc: "Out of Money (1.2x Tgt, 0.85x SL)" },
  { v: "OTM2", l: "OTM-2", desc: "Deep OTM (1.5x Tgt, 0.7x SL)" },
];

// Same multipliers as backend engine
const MONEYNESS_MULT: Record<string, { tgt: number; sl: number }> = {
  ITM2: { tgt: 0.70, sl: 1.30 },
  ITM1: { tgt: 0.85, sl: 1.15 },
  ATM:  { tgt: 1.00, sl: 1.00 },
  OTM1: { tgt: 1.20, sl: 0.85 },
  OTM2: { tgt: 1.50, sl: 0.70 },
};

function computeEffective(s: Slot) {
  const mm = MONEYNESS_MULT[s.moneyness] || MONEYNESS_MULT.ATM;
  const target = +((s.target_per_lot || 0) * (s.lot_count || 1) * mm.tgt).toFixed(2);
  const stopLoss = +((s.stop_loss_per_lot || 0) * (s.lot_count || 1) * mm.sl).toFixed(2);
  const trailingAct = +((s.trailing_activation_per_lot || 0) * (s.lot_count || 1) * mm.tgt).toFixed(2);
  const trailingStep = +((s.trailing_step_per_lot || 0) * (s.lot_count || 1)).toFixed(2);
  const rrRatio = stopLoss > 0 ? (target / stopLoss).toFixed(1) : "—";

  return {
    target,
    stopLoss,
    trailingAct,
    trailingStep,
    rrRatio,
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
  const [maxSlots, setMaxSlots] = useState(3);
  const [extraSlots, setExtraSlots] = useState(0);
  const [slotPrice, setSlotPrice] = useState(49);
  const [hardCap, setHardCap] = useState(20);
  const [buying, setBuying] = useState(false);
  const [expandedTrailing, setExpandedTrailing] = useState<Record<number, boolean>>({});

  async function getHeaders(json = true) {
    const token = (await getAccessToken()) || accessToken;
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
    };
  }

  function normalizeRow(r: any): Slot {
    const tgt = Number(r.target_per_lot);
    const sl  = Number(r.stop_loss_per_lot);
    const tAct = Number(r.trailing_activation_per_lot);
    const tStep = Number(r.trailing_step_per_lot);
    const target_per_lot = Number.isFinite(tgt) && tgt > 0 ? tgt : 6000;
    const stop_loss_per_lot = Number.isFinite(sl) && sl > 0 ? sl : 3000;
    return {
      slot: r.slot,
      index_name: r.index_name || "NIFTY",
      moneyness: r.moneyness || "ATM",
      lot_count: Number(r.lot_count) || 1,
      enabled: r.enabled === undefined ? true : !!r.enabled,
      target_per_lot,
      stop_loss_per_lot,
      trailing_enabled: r.trailing_enabled === undefined ? true : !!r.trailing_enabled,
      trailing_activation_per_lot: Number.isFinite(tAct) && tAct > 0 ? tAct : Math.round(target_per_lot * 0.66),
      trailing_step_per_lot: Number.isFinite(tStep) && tStep > 0 ? tStep : Math.round(stop_loss_per_lot * 0.33),
    };
  }

  async function load() {
    setLoading(true);
    try {
      const uId = userId || "default-user";
      const r = await fetchWithAuth(`${serverUrl}/auto-symbol/config?userId=${encodeURIComponent(uId)}`, { headers: await getHeaders(false) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      setSlots((j.slots || []).map(normalizeRow));
      if (Number.isFinite(j.max_slots)) setMaxSlots(j.max_slots);
      if (Number.isFinite(j.extra_slots)) setExtraSlots(j.extra_slots);
      if (Number.isFinite(j.slot_price)) setSlotPrice(j.slot_price);
      if (Number.isFinite(j.hard_cap)) setHardCap(j.hard_cap);
    } catch (e: any) {
      toast.error(`Failed to load auto symbol config: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { 
    load(); 
  }, [accessToken, userId]);

  function nextSlotNumber(): number {
    const used = new Set(slots.map(s => s.slot));
    for (let i = 1; i <= maxSlots; i++) if (!used.has(i)) return i;
    return 0;
  }

  async function saveSlot(slot: Slot) {
    setSaving(slot.slot);
    try {
      const r = await fetchWithAuth(`${serverUrl}/auto-symbol/config`, {
        method: "POST", 
        headers: await getHeaders(), 
        body: JSON.stringify(slot),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || `HTTP ${r.status}`);
      toast.success(`Slot ${slot.slot} (${slot.index_name} ${slot.moneyness}) saved!`);
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
        method: "DELETE", 
        headers: await getHeaders(false),
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

  async function buyExtraSlot() {
    if (!confirm(`Buy 1 extra symbol slot for ₹${slotPrice}?\n\nAmount will be debited from your wallet.`)) return;
    setBuying(true);
    try {
      const url = `${serverUrl}/auto-symbol/purchase-slot`;
      const r = await fetchWithAuth(url, {
        method: "POST", 
        headers: await getHeaders(),
      });
      const text = await r.text();
      let j: any = {};
      try { j = JSON.parse(text); } catch { /* non-json */ }

      if (!r.ok || !j.success) {
        if (j?.need_recharge) {
          toast.error(j.error || "Insufficient wallet balance. Please recharge your wallet.");
          window.dispatchEvent(new Event("open-wallet-recharge"));
          return;
        }
        throw new Error(j?.error || text || `HTTP ${r.status}`);
      }

      toast.success(`✅ Slot ${j.new_slot} unlocked! ₹${slotPrice} debited. Wallet balance: ₹${Number(j.wallet_balance).toFixed(2)}`);
      window.dispatchEvent(new Event("wallet-balance-updated"));

      await load();
      const newSlotNumber = Number(j.new_slot);
      const preset = SLOT_PRESETS[(newSlotNumber - 1) % SLOT_PRESETS.length] || SLOT_PRESETS[0];
      const newSlot: Slot = {
        slot: newSlotNumber,
        index_name: preset.index_name,
        moneyness: preset.moneyness,
        ...DEFAULT_SLOT,
      };
      
      try {
        const sr = await fetchWithAuth(`${serverUrl}/auto-symbol/config`, {
          method: "POST", 
          headers: await getHeaders(), 
          body: JSON.stringify(newSlot),
        });
        const sj = await sr.json();
        if (sr.ok && sj.success) {
          window.dispatchEvent(new Event("auto-symbol-config-updated"));
          await load();
        } else {
          setSlots(prev => [...prev.filter(s => s.slot !== newSlotNumber), newSlot].sort((a, b) => a.slot - b.slot));
        }
      } catch {
        setSlots(prev => [...prev.filter(s => s.slot !== newSlotNumber), newSlot].sort((a, b) => a.slot - b.slot));
      }
    } catch (e: any) {
      console.error("[buyExtraSlot] failed", e);
      toast.error(`Purchase failed: ${e.message}`);
    } finally {
      setBuying(false);
    }
  }

  const DEFAULT_SLOT = {
    lot_count: 1,
    enabled: true,
    target_per_lot: 6000,
    stop_loss_per_lot: 3000,
    trailing_enabled: true,
    trailing_activation_per_lot: 4000,
    trailing_step_per_lot: 1000,
  } as const;

  const SLOT_PRESETS: Array<Pick<Slot, "index_name" | "moneyness">> = [
    { index_name: "NIFTY",     moneyness: "ATM" },
    { index_name: "BANKNIFTY", moneyness: "ATM" },
    { index_name: "SENSEX",    moneyness: "ATM" },
  ];

  function addSlot() {
    const n = nextSlotNumber();
    if (!n) { 
      toast.warning(`All ${maxSlots} slots are in use. Buy an extra slot to add more.`); 
      return; 
    }
    const preset = SLOT_PRESETS[(n - 1) % SLOT_PRESETS.length] || SLOT_PRESETS[0];
    const newSlotItem: Slot = {
      slot: n,
      index_name: preset.index_name,
      moneyness: preset.moneyness,
      ...DEFAULT_SLOT,
    };
    setSlots(prev => [...prev, newSlotItem].sort((a, b) => a.slot - b.slot));
  }

  function updateLocal(idx: number, patch: Partial<Slot>) {
    setSlots(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const next = { ...s, ...patch };
      // Auto-update trailing values when target or SL changes proportionally
      if (patch.target_per_lot !== undefined) {
        next.trailing_activation_per_lot = Math.round((patch.target_per_lot as number) * 0.66);
      }
      if (patch.stop_loss_per_lot !== undefined) {
        next.trailing_step_per_lot = Math.round((patch.stop_loss_per_lot as number) * 0.33);
      }
      return next;
    }));
  }

  const activeSlotsCount = slots.filter(s => s.enabled).length;

  return (
    <Card className="border-zinc-800 bg-zinc-950/90 text-zinc-100 shadow-xl overflow-hidden">
      {/* ── COMPACT HEADER ── */}
      <CardHeader className="p-4 pb-3 border-b border-zinc-800/80 bg-zinc-900/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-xs">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                Auto Symbol Selection
                <Badge variant="outline" className="text-[10px] font-mono px-2 py-0 border-amber-500/30 bg-amber-500/10 text-amber-300">
                  ATM • ITM • OTM
                </Badge>
              </CardTitle>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Target, SL & Trailing enter <strong>per lot</strong>. Engine dynamically picks CE/PE strikes & scales parameters.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 font-mono">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active: <strong className="text-emerald-400">{activeSlotsCount}</strong>/{maxSlots}
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={load} 
              disabled={loading}
              className="h-8 w-8 p-0 border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800"
              title="Refresh Slots"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3.5 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-8 text-zinc-400 text-xs">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-amber-500" /> Synchronizing Auto-Symbol Slots…
          </div>
        )}

        {!loading && slots.length === 0 && (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 text-xs text-zinc-400 space-y-2">
            <div className="size-10 rounded-full bg-zinc-800/80 mx-auto flex items-center justify-center text-zinc-400">
              <Sliders className="size-5" />
            </div>
            <p className="font-medium text-zinc-300">No Auto-Symbol Slots Configured</p>
            <p className="text-[11px] text-zinc-500 max-w-sm mx-auto">
              Configure slots to let the AI automatically select the optimal strike and place CE/PE trades.
            </p>
            <Button size="sm" onClick={addSlot} className="mt-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs">
              <Plus className="size-3.5 mr-1.5" /> Add First Symbol Slot
            </Button>
          </div>
        )}

        {/* ── COMPACT MODULAR SLOT CARDS ── */}
        {slots.map((s, i) => {
          const eff = computeEffective(s);
          const isTrailingExpanded = expandedTrailing[s.slot] ?? s.trailing_enabled;

          return (
            <div
              key={s.slot}
              className={`rounded-xl border transition-all duration-200 shadow-sm ${
                s.enabled 
                  ? "bg-zinc-900/80 border-zinc-700/80 shadow-zinc-950/40" 
                  : "bg-zinc-950 border-zinc-800/60 opacity-75"
              }`}
            >
              {/* ── CARD HEADER ROW (COMPACT) ── */}
              <div className="flex items-center justify-between p-3 pb-2.5 border-b border-zinc-800/60 bg-zinc-900/40">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-zinc-800 text-zinc-200 border-zinc-700 text-[11px] font-bold px-2 py-0.5">
                    Slot {s.slot}
                  </Badge>

                  {/* Dynamic Symbol Name & Strike Badge */}
                  <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-800/90 border border-zinc-700 text-white font-mono text-xs font-bold shadow-xs">
                    <span className="text-amber-400">{s.index_name}</span>
                    <span className="text-zinc-500">•</span>
                    <span className="text-purple-400">{s.moneyness}</span>
                    <span className="text-zinc-500">•</span>
                    <span className="text-[10px] text-zinc-300 font-sans">{s.lot_count} Lot{s.lot_count > 1 ? "s" : ""}</span>
                  </div>
                </div>

                {/* Slot Master Switch (Distinct Emerald Green) */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateLocal(i, { enabled: !s.enabled })}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border ${
                      s.enabled 
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-xs shadow-emerald-950" 
                        : "bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:bg-zinc-750"
                    }`}
                  >
                    <span className={`size-2 rounded-full ${s.enabled ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
                    <span>{s.enabled ? "SLOT ON" : "SLOT OFF"}</span>
                  </button>

                  <Switch
                    id={`switch-slot-${s.slot}`}
                    checked={s.enabled}
                    onCheckedChange={(v) => updateLocal(i, { enabled: v })}
                    className="data-[state=checked]:!bg-emerald-500 data-[state=unchecked]:!bg-zinc-700 border border-zinc-600"
                  />

                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => deleteSlot(s.slot)}
                    className="h-7 w-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 ml-1"
                    title="Delete Slot"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* ── CARD BODY GRID ── */}
              <div className="p-3 space-y-2.5">
                {/* ROW 1: Index Selection & Moneyness Chips (Fast Symbol Change) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {/* Index Switcher */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                      <span>Index Symbol</span>
                      <span className="text-[10px] text-zinc-500">Lot size {INDICES.find(x => x.id === s.index_name)?.lotSize}</span>
                    </Label>
                    <div className="grid grid-cols-3 gap-1">
                      {INDICES.map((idx) => {
                        const active = s.index_name === idx.id;
                        return (
                          <button
                            key={idx.id}
                            type="button"
                            onClick={() => updateLocal(i, { index_name: idx.id as any })}
                            className={`px-2 py-1.5 rounded-md text-xs font-bold transition-all text-center ${
                              active
                                ? "bg-indigo-600 text-white shadow-xs border border-indigo-500"
                                : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 hover:text-white border border-zinc-750"
                            }`}
                          >
                            {idx.id}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Moneyness Quick Selection */}
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-zinc-400">Strike Moneyness</Label>
                    <div className="grid grid-cols-5 gap-1">
                      {MONEYNESS.map((m) => {
                        const active = s.moneyness === m.v;
                        return (
                          <button
                            key={m.v}
                            type="button"
                            onClick={() => updateLocal(i, { moneyness: m.v as any })}
                            title={m.desc}
                            className={`py-1.5 rounded-md text-[11px] font-bold transition-all text-center ${
                              active
                                ? "bg-purple-600 text-white shadow-xs border border-purple-500"
                                : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700/80 hover:text-white border border-zinc-750"
                            }`}
                          >
                            {m.l}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Lot Count Stepper */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <Label className="text-[11px] font-semibold text-zinc-400">Lot Count</Label>
                      <span className="text-[10px] text-zinc-500">Auto-multiplies Risk</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700"
                        onClick={() => updateLocal(i, { lot_count: Math.max(1, s.lot_count - 1) })}
                      >
                        −
                      </Button>
                      <div className="flex-1 text-center font-mono text-xs font-bold bg-zinc-900 rounded-md h-8 flex items-center justify-center border border-zinc-750 text-white">
                        {s.lot_count} {s.lot_count === 1 ? "Lot" : "Lots"}
                      </div>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-8 w-8 bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700"
                        onClick={() => updateLocal(i, { lot_count: Math.min(50, s.lot_count + 1) })}
                      >
                        +
                      </Button>
                      {/* Quick preset lot pills */}
                      <button
                        type="button"
                        onClick={() => updateLocal(i, { lot_count: 2 })}
                        className={`px-1.5 h-8 rounded text-[10px] font-bold border transition-colors ${
                          s.lot_count === 2 ? "bg-amber-500 text-black border-amber-400" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                        }`}
                      >
                        2L
                      </button>
                      <button
                        type="button"
                        onClick={() => updateLocal(i, { lot_count: 5 })}
                        className={`px-1.5 h-8 rounded text-[10px] font-bold border transition-colors ${
                          s.lot_count === 5 ? "bg-amber-500 text-black border-amber-400" : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                        }`}
                      >
                        5L
                      </button>
                    </div>
                  </div>
                </div>

                {/* ROW 2: Target & Stop-Loss per lot (Compact Inputs) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {/* Target per lot */}
                  <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5" /> Target ₹ / lot
                      </Label>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">
                        Total: ₹{eff.target}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">₹</span>
                      <Input 
                        type="number" 
                        min={0} 
                        step={100}
                        className="h-8 pl-6 text-xs font-mono bg-zinc-950 border-zinc-700/80 text-white font-semibold focus:border-emerald-500" 
                        value={s.target_per_lot}
                        onChange={(e) => updateLocal(i, { target_per_lot: Number(e.target.value) || 0 })} 
                      />
                    </div>
                    {/* Quick adder presets */}
                    <div className="flex gap-1 pt-0.5">
                      {[3000, 5000, 6000, 10000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => updateLocal(i, { target_per_lot: val })}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                            s.target_per_lot === val 
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" 
                              : "bg-zinc-800 text-zinc-400 hover:text-white"
                          }`}
                        >
                          ₹{val}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stop Loss per lot */}
                  <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5" /> Stop-Loss ₹ / lot
                      </Label>
                      <span className="text-[10px] font-mono text-rose-400 font-bold">
                        Total: ₹{eff.stopLoss}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">₹</span>
                      <Input 
                        type="number" 
                        min={0} 
                        step={100}
                        className="h-8 pl-6 text-xs font-mono bg-zinc-950 border-zinc-700/80 text-white font-semibold focus:border-rose-500" 
                        value={s.stop_loss_per_lot}
                        onChange={(e) => updateLocal(i, { stop_loss_per_lot: Number(e.target.value) || 0 })} 
                      />
                    </div>
                    {/* Quick adder presets */}
                    <div className="flex gap-1 pt-0.5">
                      {[1500, 2000, 3000, 5000].map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => updateLocal(i, { stop_loss_per_lot: val })}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                            s.stop_loss_per_lot === val 
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" 
                              : "bg-zinc-800 text-zinc-400 hover:text-white"
                          }`}
                        >
                          ₹{val}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ROW 3: Trailing Stop-Loss (Compact Collapsible) */}
                <div className={`rounded-lg border p-2.5 space-y-2 transition-all duration-200 ${
                  s.trailing_enabled 
                    ? "border-amber-500/30 bg-amber-950/20 shadow-xs shadow-amber-950/40" 
                    : "border-zinc-800 bg-zinc-900/40"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-md ${s.trailing_enabled ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-500"}`}>
                        <TrendingUp className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-zinc-200">Trailing Stop-Loss Guardian</Label>
                        <p className="text-[10px] text-zinc-500">Locks in profits automatically as trade moves</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !s.trailing_enabled;
                          updateLocal(i, { trailing_enabled: next });
                          setExpandedTrailing(prev => ({ ...prev, [s.slot]: next }));
                        }}
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-all border ${
                          s.trailing_enabled
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-xs shadow-amber-950"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        <TrendingUp className={`size-3 ${s.trailing_enabled ? "text-amber-400" : "text-zinc-500"}`} />
                        <span>{s.trailing_enabled ? "TRAIL ON" : "TRAIL OFF"}</span>
                      </button>

                      <Switch 
                        checked={s.trailing_enabled}
                        onCheckedChange={(v) => {
                          updateLocal(i, { trailing_enabled: v });
                          setExpandedTrailing(prev => ({ ...prev, [s.slot]: v }));
                        }} 
                        className="data-[state=checked]:!bg-amber-500 data-[state=unchecked]:!bg-zinc-700 border border-zinc-600"
                      />
                    </div>
                  </div>

                  {s.trailing_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-zinc-800/60 animate-in fade-in-50 duration-200">
                      <div>
                        <Label className="text-[10px] text-zinc-400 flex items-center justify-between">
                          <span>Activate at ₹ / lot</span>
                          <span className="font-mono text-amber-400 font-semibold">Tot: ₹{eff.trailingAct}</span>
                        </Label>
                        <div className="relative mt-0.5">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">₹</span>
                          <Input 
                            type="number" 
                            min={0} 
                            className="h-7 pl-6 text-xs font-mono bg-zinc-950 border-zinc-700/80 text-white" 
                            value={s.trailing_activation_per_lot}
                            onChange={(e) => updateLocal(i, { trailing_activation_per_lot: Number(e.target.value) || 0 })} 
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-zinc-400 flex items-center justify-between">
                          <span>Step Trail ₹ / lot</span>
                          <span className="font-mono text-amber-400 font-semibold">Tot: ₹{eff.trailingStep}</span>
                        </Label>
                        <div className="relative mt-0.5">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-xs font-mono">₹</span>
                          <Input 
                            type="number" 
                            min={0} 
                            className="h-7 pl-6 text-xs font-mono bg-zinc-950 border-zinc-700/80 text-white" 
                            value={s.trailing_step_per_lot}
                            onChange={(e) => updateLocal(i, { trailing_step_per_lot: Number(e.target.value) || 0 })} 
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ROW 4: Live Computed HUD Strip & Save Action */}
                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono w-full sm:w-auto">
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">🎯 Tgt:</span>
                      <span className="text-emerald-400 font-bold">₹{eff.target}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">🛡️ SL:</span>
                      <span className="text-rose-400 font-bold">₹{eff.stopLoss}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">🔥 Trail:</span>
                      <span className="text-amber-400 font-bold">₹{eff.trailingAct}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-500">⚖️ R:R:</span>
                      <span className="text-indigo-400 font-bold">{eff.rrRatio} : 1</span>
                    </div>
                  </div>

                  <Button 
                    size="sm" 
                    onClick={() => saveSlot(s)} 
                    disabled={saving === s.slot}
                    className="w-full sm:w-auto h-8 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 rounded-lg shadow-md active:scale-95 transition-all"
                  >
                    {saving === s.slot ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Save Slot {s.slot}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {/* ── BOTTOM ACTIONS: ADD & BUY EXTRA SLOTS ── */}
        {!loading && (
          <div className="space-y-2 pt-1">
            {slots.length < maxSlots && (
              <Button 
                variant="outline" 
                className="w-full h-9 border-dashed border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold"
                onClick={addSlot}
              >
                <Plus className="mr-2 h-4 w-4 text-amber-400" /> Add Symbol Slot ({slots.length} of {maxSlots} active)
              </Button>
            )}

            {maxSlots < hardCap && (
              <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-zinc-900 to-zinc-900 p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-xs space-y-0.5">
                  <div className="font-bold text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="size-3.5" /> Need More Symbol Slots?
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    You have <strong className="text-white">{maxSlots}</strong> slots ({3} free + {extraSlots} paid). Unlock Slot {maxSlots + 1} for only <strong className="text-amber-300">₹{slotPrice}</strong>.
                  </div>
                </div>
                <Button 
                  size="sm" 
                  onClick={buyExtraSlot} 
                  disabled={buying} 
                  className="w-full sm:w-auto shrink-0 h-8 bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs shadow-md"
                >
                  {buying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                  Buy Slot ₹{slotPrice}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
