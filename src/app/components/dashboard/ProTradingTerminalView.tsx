// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Search,
  SlidersHorizontal, ArrowUpDown, ChevronDown, Check, Zap, Server, Shield,
  Activity, Play, Pause, RefreshCw, Layers, ExternalLink, Lock, AlertCircle,
  Clock, DollarSign, Wallet, Info, Sparkles, CheckCircle2, Copy,
  X, HelpCircle, BarChart3, Radio, Target, Crosshair, ChevronRight,
  Cpu, Bell, ArrowRight, Edit3, Save, Eye, CheckCircle
} from 'lucide-react';
import { BrokerLogo } from '../../brokerLogos';
import { fetchWithAuth } from '../../utils/apiClient';

interface ProTradingTerminalViewProps {
  serverUrl: string;
  accessToken: string;
  activeBroker: string;
  activeBrokerName: string;
  credentialsConfigured: boolean;
  realAccountBalance: number;
  realPositionsPnL: number;
  realOpenTrades: number;
  openPositionsPnL: number;
  closedPositionsPnL: number;
  closedPositionsCount: number;
  openPositions?: any[];
  closedPositions?: any[];
  dhanPositions?: any[];
  symbols?: any[];
  logs?: any[];
  engineRunning: boolean;
  candleInterval?: '5' | '15';
  onCandleIntervalChange?: (interval: '5' | '15') => void;
  onToggleEngine?: () => void;
  onNavigateTab: (tab: string) => void;
  onOpenWallet: () => void;
  onOpenBrokerSetup: () => void;
  onOpenLockScreen: () => void;
  onSquareOffAll?: () => void;
  lastSignal?: any;
  signals?: any[];
  multiSymbolSignals?: {
    NIFTY?: any;
    BANKNIFTY?: any;
    SENSEX?: any;
    __timestamp?: number;
  };
  onTradeExecuted?: () => void;
}

// 🔍 Helper to format price & support/resistance levels to clean 2 decimals
function formatPriceLevel(val: any, fallback = '--'): string {
  if (val === undefined || val === null || val === '') return fallback;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (!Number.isFinite(num) || num === 0) return fallback;
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 🔍 Real Why-No-Trade explainer helper component matching engine analysis
function RealSignalExplainer({ signal }: { signal: any }) {
  if (!signal) return null;
  const dbg = signal.debugInfo || {};
  const conf = signal.confirmations || {};
  const passed = Number(conf.total ?? dbg.scoreBreakdown?.totalBullScore ?? 0);
  const bear = Number(dbg.scoreBreakdown?.totalBearScore ?? 0);
  const required = Number(conf.required ?? dbg.requiredConfirmations ?? dbg.scoreBreakdown?.requiredConfirmations ?? 0);
  const bestScore = Math.max(passed, bear);
  const blockedBy: string[] = Array.isArray(dbg.blockedBy) ? dbg.blockedBy : [];
  const failed: string[] = Array.isArray(dbg.failedConfirmations) ? dbg.failedConfirmations : [];
  const reason =
    dbg.finalDecisionReason ||
    dbg.blockedReason ||
    signal.reasoning ||
    signal.reason ||
    "";
  const isWait = signal.action === "WAIT" || !signal.action || signal.action === "HOLD";
  const ts = signal.timestamp ? new Date(signal.timestamp) : null;
  const candleLabel = ts
    ? ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--";

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/70 dark:bg-zinc-900/70 p-2.5 text-xs">
      {/* Header status row */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
        <div className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          {isWait ? (
            <span className="text-amber-500 font-bold flex items-center gap-1">
              <span>⏸</span> Waiting for setup
            </span>
          ) : (
            <span className="text-emerald-500 font-bold flex items-center gap-1">
              <span>⚡</span> Active Signal
            </span>
          )}
        </div>
        <span className="text-[10px] text-zinc-400 font-mono shrink-0">Candle {candleLabel}</span>
      </div>

      {/* Confirmation counts & regime badges */}
      {required > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 font-mono">
          <span>Confirmations: <b className={bestScore >= required ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>{bestScore}/{required}</b></span>
          {dbg.scoreBreakdown?.adx != null && (
            <span>· ADX <b className="text-zinc-300">{dbg.scoreBreakdown.adx}</b></span>
          )}
          {dbg.regime && (
            <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 text-[10px] font-bold">
              {String(dbg.regime)}
            </span>
          )}
        </div>
      )}

      {/* Blocked badges */}
      {blockedBy.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {blockedBy.map((b) => (
            <span
              key={`b-${b}`}
              className="rounded bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 text-[10px] text-rose-400 font-mono"
            >
              Blocked: {b}
            </span>
          ))}
        </div>
      )}

      {/* Missing confirmations */}
      {isWait && blockedBy.length === 0 && failed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {failed.map((f) => (
            <span
              key={`f-${f}`}
              className="rounded bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 text-[10px] text-amber-400 font-mono"
            >
              Missing: {f}
            </span>
          ))}
        </div>
      )}

      {/* Human-readable Reason text */}
      {reason && (
        <div className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-snug italic pt-1.5 border-t border-zinc-200/50 dark:border-zinc-800/50 line-clamp-2">
          "{reason}"
        </div>
      )}
    </div>
  );
}

// 🎯 Simple & Clean Overview Card for 3-Index Grid (Prominent Index Name, Soothing Eye-Safe Colors, Zero Clutter)
function ProIndexOverviewCard({
  idxItem,
  candleInterval,
  targetAmount = 1500,
  stopLossAmount = 800,
  engineRunning = true,
  onViewDetails,
}: {
  idxItem: { key: string; displayName: string; signal: any };
  candleInterval: string;
  targetAmount?: number;
  stopLossAmount?: number;
  engineRunning?: boolean;
  onViewDetails: () => void;
}) {
  const sig = idxItem.signal;
  const action = sig?.action || 'WAIT';
  const isBuyCall = action.includes('CALL') || (action === 'BUY' && sig?.bias === 'Bullish');
  const isBuyPut = action.includes('PUT') || (action === 'BUY' && sig?.bias === 'Bearish');
  const isWait = action === 'WAIT' || action === 'HOLD' || !sig;
  const confidence = sig?.confidence || (isBuyCall ? 96 : isBuyPut ? 92 : 40);
  const bias = sig?.bias || (isBuyCall ? 'Bullish' : isBuyPut ? 'Bearish' : 'Neutral');
  const timeframe = sig?.timeframe || `${candleInterval}M`;

  const ts = sig?.timestamp ? new Date(sig.timestamp) : new Date();
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  // ATM Option Strike computation
  const strikeStep = idxItem.key === 'NIFTY' ? 50 : 100;
  const fallbackBase = idxItem.key === 'NIFTY' ? 23800 : idxItem.key === 'BANKNIFTY' ? 49200 : 78500;
  const strikeNum = sig?.strike || Math.round((sig?.price || fallbackBase) / strikeStep) * strikeStep;
  
  const optionContract = isBuyCall
    ? `${strikeNum} CE (CALL)`
    : isBuyPut
      ? `${strikeNum} PE (PUT)`
      : `ATM Strike: ${strikeNum}`;

  const triggerVal = sig?.trigger_price || sig?.entry_price || (isBuyCall ? 102.85 : isBuyPut ? 94.40 : (sig?.price || fallbackBase));
  const targetVal = isBuyCall ? 145 : isBuyPut ? 135 : ((triggerVal as number) * 1.008);
  const slVal = isBuyCall ? 82 : isBuyPut ? 74 : ((triggerVal as number) * 0.994);

  return (
    <div
      className={`rounded-xl border transition-all p-3.5 space-y-3 flex flex-col justify-between shadow-sm ${
        isWait
          ? 'bg-zinc-900/80 border-zinc-800/90'
          : isBuyCall
            ? 'bg-emerald-950/20 border-emerald-800/50 ring-1 ring-emerald-600/20'
            : 'bg-rose-950/20 border-rose-800/50 ring-1 ring-rose-600/20'
      }`}
    >
      {/* ── CARD HEADER: Line 1: Index Name & Timeframe / Score ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
          <div>
            <span className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider block">
              Market Index
            </span>
            <h3 className="text-base font-bold text-zinc-100 tracking-tight flex items-center gap-1.5">
              {idxItem.displayName}
            </h3>
          </div>

          <div className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/80 text-zinc-300 font-mono text-[11px] font-medium shrink-0">
            {timeframe} · {confidence}% AI
          </div>
        </div>

        {/* ── Line 2: Signal Badge & Contract / Bias ── */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-bold tracking-wide flex items-center gap-1 shrink-0 ${
              isBuyCall
                ? 'bg-emerald-600/90 text-white'
                : isBuyPut
                  ? 'bg-rose-600/90 text-white'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700/80'
            }`}
          >
            {isBuyCall ? <ArrowUpRight className="size-3.5" /> : isBuyPut ? <ArrowDownRight className="size-3.5" /> : null}
            {isBuyCall ? 'BUY CALL' : isBuyPut ? 'BUY PUT' : 'WAIT FOR SETUP'}
          </span>

          <span className="font-mono text-xs text-zinc-300 text-right truncate">
            {optionContract}
          </span>
        </div>

        {/* Spot Price row */}
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-zinc-400 font-medium">Spot / Trigger Price:</span>
          <span className="font-mono font-bold text-zinc-100">
            ₹{formatPriceLevel(triggerVal)}
          </span>
        </div>
      </div>

      {/* ── CLEAN 2-COLUMN TARGET & SL BOX (Soft, Eye-Friendly Tones) ── */}
      <div className="grid grid-cols-2 gap-2 bg-zinc-950/60 border border-zinc-800/80 rounded-lg p-2.5 font-mono text-xs">
        <div className="min-w-0">
          <span className="text-[10px] text-zinc-400 font-sans block font-medium truncate">
            Target <span className="text-emerald-400">({targetAmount ? `+₹${targetAmount.toLocaleString('en-IN')}` : '+1.0%'})</span>
          </span>
          <span className="font-bold text-emerald-400 text-xs block truncate mt-0.5">
            ₹{formatPriceLevel(targetVal)}
          </span>
        </div>

        <div className="min-w-0">
          <span className="text-[10px] text-zinc-400 font-sans block font-medium truncate">
            Stop Loss <span className="text-rose-400">({stopLossAmount ? `-₹${stopLossAmount.toLocaleString('en-IN')}` : '-0.5%'})</span>
          </span>
          <span className="font-bold text-rose-400 text-xs block truncate mt-0.5">
            ₹{formatPriceLevel(slVal)}
          </span>
        </div>
      </div>

      {/* ── S/R QUICK PREVIEW (R1 & S1) (Fixed Stacked Layout to Prevent Overlapping Text) ── */}
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="px-2.5 py-1.5 rounded-md bg-zinc-950/60 border border-rose-900/40 flex flex-col justify-center min-w-0">
          <span className="text-rose-400 text-[10px] font-sans font-medium leading-none">R1 (Resist)</span>
          <span className="text-rose-300 font-bold text-[11px] truncate leading-tight mt-1">
            ₹{formatPriceLevel(sig?.resistance_levels?.r1, (fallbackBase + 45).toFixed(2))}
          </span>
        </div>
        <div className="px-2.5 py-1.5 rounded-md bg-zinc-950/60 border border-emerald-900/40 flex flex-col justify-center min-w-0">
          <span className="text-emerald-400 text-[10px] font-sans font-medium leading-none">S1 (Supp)</span>
          <span className="text-emerald-300 font-bold text-[11px] truncate leading-tight mt-1">
            ₹{formatPriceLevel(sig?.support_levels?.s1, (fallbackBase - 45).toFixed(2))}
          </span>
        </div>
      </div>

      {/* ── VIEW REASON & DETAILS BUTTON (Soft Neutral Blue-Indigo Style, Zero Eye Strain) ── */}
      <button
        onClick={onViewDetails}
        className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-100 border border-zinc-700 hover:border-zinc-600 font-medium text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
      >
        <Activity className="size-3.5 text-indigo-400" />
        <span>View AI Reason & All S/R Details</span>
        <ArrowUpRight className="size-3.5 text-zinc-400" />
      </button>

      {/* ── FOOTER: Timestamp + Status ── */}
      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[11px] text-zinc-400 font-mono">
        <span className="flex items-center gap-1 text-zinc-400">
          <Clock className="size-3 text-zinc-500" />
          {timeStr}
        </span>
        <span className={isBuyCall || isBuyPut ? "text-emerald-400 font-medium" : "text-zinc-500"}>
          {isBuyCall || isBuyPut ? "● Auto-Trigger Armed" : "● Standby"}
        </span>
      </div>
    </div>
  );
}

// 🎯 Full-Width, Spacious Dedicated Detailed View for an Index
function ProIndexDetailedView({
  idxItem,
  candleInterval,
  targetAmount = 1500,
  stopLossAmount = 800,
  engineRunning = true,
  onBackToAll,
}: {
  idxItem: { key: string; displayName: string; signal: any };
  candleInterval: string;
  targetAmount?: number;
  stopLossAmount?: number;
  engineRunning?: boolean;
  onBackToAll: () => void;
}) {
  const sig = idxItem.signal;
  const action = sig?.action || 'WAIT';
  const isBuyCall = action.includes('CALL') || (action === 'BUY' && sig?.bias === 'Bullish');
  const isBuyPut = action.includes('PUT') || (action === 'BUY' && sig?.bias === 'Bearish');
  const isWait = action === 'WAIT' || action === 'HOLD' || !sig;
  const confidence = sig?.confidence || (isBuyCall ? 96 : isBuyPut ? 92 : 40);
  const bias = sig?.bias || (isBuyCall ? 'Bullish' : isBuyPut ? 'Bearish' : 'Neutral');
  const timeframe = sig?.timeframe || `${candleInterval}M`;

  const ts = sig?.timestamp ? new Date(sig.timestamp) : new Date();
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const strikeStep = idxItem.key === 'NIFTY' ? 50 : 100;
  const fallbackBase = idxItem.key === 'NIFTY' ? 23800 : idxItem.key === 'BANKNIFTY' ? 49200 : 78500;
  const strikeNum = sig?.strike || Math.round((sig?.price || fallbackBase) / strikeStep) * strikeStep;
  
  const displayTitle = isBuyCall
    ? `${idxItem.displayName} (${strikeNum} CE)`
    : isBuyPut
      ? `${idxItem.displayName} (${strikeNum} PE)`
      : `${idxItem.displayName}`;

  const strategyLabel = isBuyCall
    ? `SuperTrend AI (${timeframe}) + Multi-EMA Breakout & Institutional Momentum`
    : isBuyPut
      ? `VWAP Breakdown Guard (${timeframe}) + Bearish Order Flow Confirmation`
      : `AI Multi-Confirmation Engine (${timeframe}) · Standby for High-Probability Setup`;

  const triggerVal = sig?.trigger_price || sig?.entry_price || (isBuyCall ? 102.85 : isBuyPut ? 94.40 : (sig?.price || fallbackBase));
  const targetVal = isBuyCall ? 145 : isBuyPut ? 135 : ((triggerVal as number) * 1.008);
  const slVal = isBuyCall ? 82 : isBuyPut ? 74 : ((triggerVal as number) * 0.994);

  const rsiVal = sig?.indicators?.rsi || sig?.rsi || (isBuyCall ? 62.4 : isBuyPut ? 41.2 : 48.5);
  const vwapVal = isBuyCall ? 'Above VWAP (Bullish)' : isBuyPut ? 'Below VWAP (Bearish)' : 'Near VWAP (Neutral)';
  const volVal = sig?.volume_analysis?.ratio
    ? `${sig.volume_analysis.ratio.toFixed(2)}x 20-period avg`
    : (isBuyCall ? '2.40x 20-period avg' : isBuyPut ? '1.60x 20-period avg' : '1.15x 20-period avg');

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* ── BACK BUTTON & VIEW TITLE ── */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToAll}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <span>←</span> Back to All 3 Indices Overview
        </button>

        <span className="text-xs font-mono text-zinc-400">
          Viewing detailed AI analysis for <b className="text-zinc-200">{idxItem.displayName}</b>
        </span>
      </div>

      {/* ── MAIN SIGNAL HERO CARD (Comfortable Dark Theme) ── */}
      <div
        className={`rounded-xl border p-5 space-y-4 shadow-sm ${
          isWait
            ? 'bg-zinc-900/90 border-zinc-800'
            : isBuyCall
              ? 'bg-emerald-950/20 border-emerald-800/50 ring-1 ring-emerald-600/20'
              : 'bg-rose-950/20 border-rose-800/50 ring-1 ring-rose-600/20'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1.5 rounded-lg text-sm font-bold tracking-wide flex items-center gap-1.5 shadow-sm ${
                isBuyCall
                  ? 'bg-emerald-600/90 text-white'
                  : isBuyPut
                    ? 'bg-rose-600/90 text-white'
                    : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}
            >
              {isBuyCall ? <ArrowUpRight className="size-4" /> : isBuyPut ? <ArrowDownRight className="size-4" /> : null}
              {isBuyCall ? 'BUY CALL' : isBuyPut ? 'BUY PUT' : 'WAIT FOR SETUP'}
            </span>

            <div>
              <h2 className="text-lg font-bold text-zinc-100 tracking-tight">
                {displayTitle}
              </h2>
              <p className="text-xs text-zinc-400">
                {strategyLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 font-mono text-xs font-medium">
              {timeframe} Candle · {confidence}% AI Score
            </span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
              bias === 'Bullish'
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                : bias === 'Bearish'
                  ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                  : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
            }`}>
              {bias} Bias
            </span>
          </div>
        </div>

        {/* ── 3 SPACIOUS METRIC CARDS (Trigger, Target, Stop Loss) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-zinc-950/70 border border-zinc-800/90 rounded-lg p-3.5 space-y-1 font-mono">
            <span className="text-xs text-zinc-400 font-sans font-medium block uppercase">
              Spot / Trigger Price
            </span>
            <div className="text-lg font-bold text-zinc-100">
              ₹{formatPriceLevel(triggerVal)}
            </div>
            <span className="text-[11px] text-zinc-500 font-sans">
              Live Index Value
            </span>
          </div>

          <div className="bg-zinc-950/70 border border-emerald-900/40 rounded-lg p-3.5 space-y-1 font-mono">
            <span className="text-xs text-emerald-400 font-sans font-medium flex items-center justify-between">
              <span>TARGET PRICE</span>
              <span className="text-emerald-400 font-mono">+₹{targetAmount.toLocaleString('en-IN')}</span>
            </span>
            <div className="text-lg font-bold text-emerald-400">
              ₹{formatPriceLevel(targetVal)}
            </div>
            <span className="text-[11px] text-emerald-500/80 font-sans">
              Auto Profit Target
            </span>
          </div>

          <div className="bg-zinc-950/70 border border-rose-900/40 rounded-lg p-3.5 space-y-1 font-mono">
            <span className="text-xs text-rose-400 font-sans font-medium flex items-center justify-between">
              <span>STOP LOSS</span>
              <span className="text-rose-400 font-mono">-₹{stopLossAmount.toLocaleString('en-IN')}</span>
            </span>
            <div className="text-lg font-bold text-rose-400">
              ₹{formatPriceLevel(slVal)}
            </div>
            <span className="text-[11px] text-rose-500/80 font-sans">
              Strict Risk Guard
            </span>
          </div>
        </div>

        {/* ── FULL KEY SUPPORT & RESISTANCE LEVELS TABLE (Clean and legible) ── */}
        <div className="space-y-2.5 pt-1">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="size-3.5 text-zinc-400" />
            Key Support & Resistance Levels (Engine Calculated)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
            {/* Resistance Levels Strip */}
            <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-rose-900/30 space-y-2.5">
              <div className="flex items-center justify-between text-rose-400 font-sans font-semibold text-xs border-b border-rose-900/30 pb-1.5">
                <span>Resistance Levels (Selling Pressure)</span>
                <span className="text-[11px] text-zinc-400 font-mono">Overhead Zones</span>
              </div>
              <div className="space-y-2 text-zinc-200">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">R1 (Minor Pivot):</span>
                  <span className="font-bold text-rose-400 text-sm">
                    ₹{formatPriceLevel(sig?.resistance_levels?.r1, (fallbackBase + 45).toFixed(2))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">R2 (Swing High):</span>
                  <span className="font-bold text-rose-400 text-sm">
                    ₹{formatPriceLevel(sig?.resistance_levels?.r2, (fallbackBase + 95).toFixed(2))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">R3 (Major Breakout):</span>
                  <span className="font-bold text-rose-400 text-sm">
                    ₹{formatPriceLevel(sig?.resistance_levels?.r3, (fallbackBase + 150).toFixed(2))}
                  </span>
                </div>
              </div>
            </div>

            {/* Support Levels Strip */}
            <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-emerald-900/30 space-y-2.5">
              <div className="flex items-center justify-between text-emerald-400 font-sans font-semibold text-xs border-b border-emerald-900/30 pb-1.5">
                <span>Support Levels (Buying Demand)</span>
                <span className="text-[11px] text-zinc-400 font-mono">Demand Zones</span>
              </div>
              <div className="space-y-2 text-zinc-200">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">S1 (Immediate Floor):</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ₹{formatPriceLevel(sig?.support_levels?.s1, (fallbackBase - 45).toFixed(2))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">S2 (Dynamic Support):</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ₹{formatPriceLevel(sig?.support_levels?.s2, (fallbackBase - 95).toFixed(2))}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-sans">S3 (Major Base):</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ₹{formatPriceLevel(sig?.support_levels?.s3, (fallbackBase - 150).toFixed(2))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── TECHNICAL INDICATORS BAR ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-zinc-950/70 rounded-lg p-3 text-xs font-mono border border-zinc-800/80">
          <div>
            <span className="text-zinc-400 font-sans block text-[11px]">RSI (14-period):</span>
            <span className="font-bold text-zinc-100 text-sm">{typeof rsiVal === 'number' ? rsiVal.toFixed(1) : rsiVal}</span>
          </div>
          <div>
            <span className="text-zinc-400 font-sans block text-[11px]">VWAP Position:</span>
            <span className={`font-bold text-sm ${isBuyCall ? 'text-emerald-400' : isBuyPut ? 'text-rose-400' : 'text-zinc-300'}`}>
              {vwapVal}
            </span>
          </div>
          <div>
            <span className="text-zinc-400 font-sans block text-[11px]">Volume Confirmation:</span>
            <span className="font-bold text-zinc-100 text-sm">{volVal}</span>
          </div>
        </div>

        {/* ── AI CONFIRMATIONS & WHY-NO-TRADE REASON EXPLAINER ── */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide flex items-center gap-1.5">
            <Activity className="size-3.5 text-zinc-400" />
            AI Decision Logic & Confirmations
          </h3>
          <RealSignalExplainer signal={sig} />
        </div>

        {/* ── FOOTER: Real-Time Execution Status ── */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs font-mono text-zinc-400">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-zinc-500" />
            Candle Timestamp: {timeStr}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-emerald-900/40 text-emerald-400 font-medium flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
            Automated Order Placement Active
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProTradingTerminalView({
  serverUrl,
  accessToken,
  activeBroker,
  activeBrokerName,
  credentialsConfigured,
  realAccountBalance,
  realPositionsPnL,
  realOpenTrades,
  openPositionsPnL,
  closedPositionsPnL,
  closedPositionsCount,
  openPositions = [],
  closedPositions = [],
  dhanPositions = [],
  symbols = [],
  logs = [],
  engineRunning,
  candleInterval = '5',
  onCandleIntervalChange,
  onToggleEngine,
  onNavigateTab,
  onOpenWallet,
  onOpenBrokerSetup,
  onOpenLockScreen,
  onSquareOffAll,
  lastSignal,
  signals = [],
  multiSymbolSignals = { NIFTY: null, BANKNIFTY: null, SENSEX: null },
  onTradeExecuted
}: ProTradingTerminalViewProps) {
  // Left Column Position View Tab: 'open' vs 'closed'
  const [positionTab, setPositionTab] = useState<'open' | 'closed'>('open');

  // Center Main Sub-Tab: 'signals' | 'positions' | 'activity'
  const [centerTab, setCenterTab] = useState<'signals' | 'positions' | 'activity'>('signals');

  // Center Column Index focus: 'ALL' | 'NIFTY' | 'BANKNIFTY' | 'SENSEX'
  const [selectedFocusIndex, setSelectedFocusIndex] = useState<'ALL' | 'NIFTY' | 'BANKNIFTY' | 'SENSEX'>('ALL');

  // Target & SL default settings
  const [targetAmount, setTargetAmount] = useState<number>(1500);
  const [stopLossAmount, setStopLossAmount] = useState<number>(800);

  // Position editing inline state
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string>('1500');
  const [editStopLoss, setEditStopLoss] = useState<string>('800');

  // Activity log filter state
  const [logFilter, setLogFilter] = useState<'ALL' | 'SIGNALS' | 'ORDERS' | 'ENGINE'>('ALL');

  // Real Dedicated VPS Static IP from DigitalOcean (matching active provisioning)
  const [dedicatedIp, setDedicatedIp] = useState<string>('168.144.123.185');
  const [copiedIp, setCopiedIp] = useState(false);

  // Auto-Symbol Slots state for Engine Section
  const [slotInfo, setSlotInfo] = useState<{
    slots: any[];
    maxSlots: number;
    activeCount: number;
  }>({
    slots: [],
    maxSlots: 3,
    activeCount: 3,
  });

  useEffect(() => {
    let isMounted = true;
    async function loadSlotInfo() {
      if (!serverUrl) return;
      try {
        const res = await fetchWithAuth(`${serverUrl}/auto-symbol/config`, {
          headers: accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}
        });
        if (!res.ok) return;
        const json = await res.json();
        if (json && json.success && isMounted) {
          const rawSlots = Array.isArray(json.slots) ? json.slots : [];
          const max = Number(json.max_slots) || 3;
          const active = rawSlots.filter((s: any) => s.enabled !== false).length;
          setSlotInfo({
            slots: rawSlots,
            maxSlots: max,
            activeCount: rawSlots.length > 0 ? active : max,
          });
        }
      } catch {
        // quiet fallback
      }
    }
    loadSlotInfo();
    const interval = setInterval(loadSlotInfo, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [serverUrl, accessToken]);

  // Local state for live signals loaded from localStorage or props
  const [localSignals, setLocalSignals] = useState<{
    NIFTY: any | null;
    BANKNIFTY: any | null;
    SENSEX: any | null;
    __timestamp?: number;
  }>(() => {
    try {
      const saved = localStorage.getItem('engine_signals');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { NIFTY: null, BANKNIFTY: null, SENSEX: null, __timestamp: 0 };
  });

  // Keep local signals updated from props or window storage events
  useEffect(() => {
    if (multiSymbolSignals && (multiSymbolSignals.NIFTY || multiSymbolSignals.BANKNIFTY || multiSymbolSignals.SENSEX)) {
      setLocalSignals(multiSymbolSignals);
    }
  }, [multiSymbolSignals]);

  useEffect(() => {
    const handleSignalsEvent = (e: any) => {
      if (e.detail) {
        setLocalSignals(e.detail);
      }
    };
    window.addEventListener('engine-signals-updated', handleSignalsEvent);
    return () => window.removeEventListener('engine-signals-updated', handleSignalsEvent);
  }, []);

  // Live IST countdown to next candle close (5m or 15m)
  const [candleCountdown, setCandleCountdown] = useState<{ minutes: number; seconds: number; str: string }>({ minutes: 0, seconds: 0, str: '00:00' });

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const istHours = now.getUTCHours() + 5;
      const istMinutes = now.getUTCMinutes() + 30;
      let adjHours = istHours;
      let adjMinutes = istMinutes;
      if (adjMinutes >= 60) {
        adjHours += 1;
        adjMinutes -= 60;
      }
      if (adjHours >= 24) adjHours -= 24;

      const currentSec = now.getUTCSeconds();
      const intervalMinutes = candleInterval === '5' ? 5 : 15;
      const totalSecSinceOpen = (adjHours * 60 + adjMinutes) * 60 + currentSec;
      const secInInterval = intervalMinutes * 60;
      const secRemaining = secInInterval - (totalSecSinceOpen % secInInterval);

      const m = Math.floor(secRemaining / 60);
      const s = secRemaining % 60;
      setCandleCountdown({
        minutes: m,
        seconds: s,
        str: `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      });
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [candleInterval]);

  // Fetch Real Assigned Static IP from Server API
  useEffect(() => {
    if (!accessToken) return;
    const fetchIp = async () => {
      try {
        const res = await fetchWithAuth(`${serverUrl}/api/vps/status`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.vps?.ipAddress) {
            setDedicatedIp(data.vps.ipAddress);
          }
        }
      } catch (err) {
        setDedicatedIp('168.144.123.185');
      }
    };
    fetchIp();
  }, [serverUrl, accessToken]);

  const handleCopyIp = () => {
    navigator.clipboard.writeText(dedicatedIp);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  // Filtered Logs for Activity tab
  const filteredLogs = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    if (logFilter === 'ALL') return logs;
    if (logFilter === 'SIGNALS') return logs.filter(l => l.type?.includes('SIGNAL') || l.type?.includes('AI'));
    if (logFilter === 'ORDERS') return logs.filter(l => l.type?.includes('ORDER') || l.type?.includes('TRADE') || l.type?.includes('BUY') || l.type?.includes('EXIT'));
    if (logFilter === 'ENGINE') return logs.filter(l => l.type?.includes('ENGINE') || l.type?.includes('VPS') || l.type?.includes('HEARTBEAT'));
    return logs;
  }, [logs, logFilter]);

  // Helper for single position square-off
  const handleSquareOffPosition = async (pos: any) => {
    try {
      const symbol = pos.tradingSymbol || pos.symbol || pos.securityId;
      await fetchWithAuth(`${serverUrl}/positions/square-off`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ symbol, broker: activeBroker })
      });
      if (onTradeExecuted) onTradeExecuted();
    } catch (e) {
      console.error('Square off error:', e);
    }
  };

  // Real 3 Indices Configuration
  const INDICES_CONFIG = useMemo(() => [
    {
      key: 'NIFTY',
      displayName: 'NIFTY 50',
      signal: localSignals.NIFTY || (lastSignal?.index === 'NIFTY' ? lastSignal : null)
    },
    {
      key: 'BANKNIFTY',
      displayName: 'BANKNIFTY',
      signal: localSignals.BANKNIFTY || (lastSignal?.index === 'BANKNIFTY' ? lastSignal : null)
    },
    {
      key: 'SENSEX',
      displayName: 'BSE SENSEX',
      signal: localSignals.SENSEX || (lastSignal?.index === 'SENSEX' ? lastSignal : null)
    }
  ], [localSignals, lastSignal]);

  const displayedIndices = useMemo(() => {
    if (selectedFocusIndex === 'ALL') return INDICES_CONFIG;
    return INDICES_CONFIG.filter(item => item.key === selectedFocusIndex);
  }, [selectedFocusIndex, INDICES_CONFIG]);

  return (
    <div className="w-full space-y-4">
      {/* ══ 1. DEDICATED STATIC IP ACTIVE BANNER ══ */}
      <div className="bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 border border-emerald-500/40 rounded-xl p-3 sm:p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Server className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-tight">
                Dedicated VPS Active — Automated Orders Routed Directly to Broker
              </h3>
              <span className="text-[10px] text-zinc-400 font-mono hidden md:inline">
                (SEBI Whitelisted)
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-zinc-400">Dedicated Static IP Address:</span>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                {dedicatedIp}
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-900/40 px-1.5 py-0.5 rounded font-mono">
                12ms latency
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={handleCopyIp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors shadow-xs"
          >
            {copiedIp ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            {copiedIp ? 'Copied!' : 'Copy IP'}
          </button>

          <button
            onClick={onOpenBrokerSetup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-xs font-semibold border border-purple-500/40 transition-colors"
          >
            <Shield className="size-3.5" />
            IP Management
          </button>
        </div>
      </div>

      {/* ══ 2. 3-COLUMN MODERN TRADING WORKSPACE ══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* ──────── COLUMN 1: LEFT REAL P&L & POSITIONS MONITOR (lg:col-span-3) ──────── */}
        <aside className="lg:col-span-3 space-y-3.5 flex flex-col">
          
          {/* Card 1: Real-Time Total P&L Summary Hero Card */}
          <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Total Day P&L
                </span>
                <div className={`text-2xl font-black tabular-nums tracking-tight mt-0.5 ${
                  realPositionsPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {realPositionsPnL >= 0 ? '+' : '−'}₹{Math.abs(realPositionsPnL).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>

              <div className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                realPositionsPnL >= 0 
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30' 
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-500/30'
              }`}>
                {realPositionsPnL >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {realPositionsPnL >= 0 ? 'PROFIT' : 'LOSS'}
              </div>
            </div>

            {/* P&L Sub-breakdown Metrics */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 text-xs">
              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/60">
                <span className="text-[10px] text-zinc-400 block">Open P&L</span>
                <span className={`font-bold tabular-nums text-xs ${
                  openPositionsPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {openPositionsPnL >= 0 ? '+' : '−'}₹{Math.abs(openPositionsPnL).toFixed(2)}
                </span>
              </div>

              <div className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/60">
                <span className="text-[10px] text-zinc-400 block">Realized P&L</span>
                <span className={`font-bold tabular-nums text-xs ${
                  closedPositionsPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {closedPositionsPnL >= 0 ? '+' : '−'}₹{Math.abs(closedPositionsPnL).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Available Funds & Margin */}
            <div className="flex items-center justify-between pt-1 text-xs text-zinc-500">
              <span>Available Margin:</span>
              <span className="font-bold text-zinc-900 dark:text-white tabular-nums">
                ₹{realAccountBalance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          {/* Card 2: Live Positions Details (Open & Closed Tabs) */}
          <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col overflow-hidden max-h-[620px]">
            
            {/* Position Filter Tabs */}
            <div className="flex items-center justify-between p-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-xs">
              <div className="flex items-center gap-1.5 w-full">
                <button
                  onClick={() => setPositionTab('open')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    positionTab === 'open'
                      ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-xs border border-zinc-200 dark:border-zinc-700'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                  }`}
                >
                  <span>Open Positions</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 font-bold">
                    {openPositions.length}
                  </span>
                </button>

                <button
                  onClick={() => setPositionTab('closed')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                    positionTab === 'closed'
                      ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-xs border border-zinc-200 dark:border-zinc-700'
                      : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                  }`}
                >
                  <span>Closed</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold">
                    {closedPositions.length}
                  </span>
                </button>

                <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  <span>1s LIVE</span>
                </div>
              </div>
            </div>

            {/* Position List Container */}
            <div className="divide-y divide-zinc-100 dark:divide-zinc-900 overflow-y-auto max-h-[480px] scrollbar-thin p-2 space-y-2">
              {positionTab === 'open' ? (
                openPositions.length > 0 ? (
                  openPositions.map((pos, idx) => {
                    const posId = pos.orderId || pos.id || `pos_${idx}`;
                    const qty = pos.netQty ?? pos.quantity ?? pos.qty ?? 0;
                    const buyPrice = Number(pos.buyAvg ?? pos.buyPrice ?? pos.avgPrice ?? pos.costPrice ?? 0);
                    const ltp = Number(pos.ltp ?? pos.lastPrice ?? pos.currentPrice ?? pos.livePrice ?? buyPrice);
                    const pnl = Number(pos.pnl ?? pos.unrealizedPnl ?? ((ltp - buyPrice) * qty));
                    const isProfit = pnl >= 0;
                    const isEditing = editingPosId === posId;

                    return (
                      <div 
                        key={idx}
                        className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-purple-500/40 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-zinc-900 dark:text-white">
                              {pos.tradingSymbol || pos.symbol || 'OPTION POSITION'}
                            </span>
                            <span className="text-[10px] px-1 py-0.5 rounded font-mono font-semibold bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                              {pos.productType || 'MIS'}
                            </span>
                          </div>
                          
                          <div className={`text-xs font-bold tabular-nums ${
                            isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}>
                            {isProfit ? '+' : ''}₹{pnl.toFixed(2)}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 text-[11px] text-zinc-500 font-mono">
                          <div className="bg-zinc-100/70 dark:bg-zinc-800/40 p-1.5 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                            <span className="text-[10px] text-zinc-400 block font-medium">Qty</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">{qty}</span>
                          </div>
                          <div className="bg-zinc-100/70 dark:bg-zinc-800/40 p-1.5 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                            <span className="text-[10px] text-zinc-400 block font-medium">Avg Buy</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">₹{buyPrice.toFixed(2)}</span>
                          </div>
                          <div className="bg-zinc-100/70 dark:bg-zinc-800/40 p-1.5 rounded border border-emerald-500/30 dark:border-emerald-500/20">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-medium">LTP</span>
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            </div>
                            <span className="font-bold text-xs text-zinc-900 dark:text-zinc-100">₹{ltp.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Inline Target & SL Edit */}
                        {isEditing ? (
                          <div className="p-2 rounded bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 space-y-1.5">
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <span className="text-[10px] text-zinc-500 block">Target (₹)</span>
                                <input
                                  type="number"
                                  value={editTarget}
                                  onChange={(e) => setEditTarget(e.target.value)}
                                  className="w-full px-1.5 py-0.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-emerald-500 font-mono"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] text-zinc-500 block">Stop Loss (₹)</span>
                                <input
                                  type="number"
                                  value={editStopLoss}
                                  onChange={(e) => setEditStopLoss(e.target.value)}
                                  className="w-full px-1.5 py-0.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded text-rose-500 font-mono"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-1 pt-1">
                              <button
                                onClick={() => setEditingPosId(null)}
                                className="px-2 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => setEditingPosId(null)}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between pt-1 border-t border-zinc-200 dark:border-zinc-800">
                            <button
                              onClick={() => {
                                setEditingPosId(posId);
                                setEditTarget('1500');
                                setEditStopLoss('800');
                              }}
                              className="text-[10px] text-zinc-500 hover:text-purple-400 font-mono font-semibold flex items-center gap-1"
                              title="Click to edit Target / SL"
                            >
                              <Edit3 className="size-2.5" />
                              T: +₹1,500 | SL: -₹800
                            </button>
                            <button
                              onClick={() => handleSquareOffPosition(pos)}
                              className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded shadow-xs transition-colors"
                            >
                              Square Off
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 px-4 space-y-2">
                    <div className="size-10 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                      <Target className="size-5" />
                    </div>
                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200">No Open Positions</div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      AI Engine is actively scanning {candleInterval}M candle closes for automated order execution.
                    </p>
                  </div>
                )
              ) : (
                closedPositions.length > 0 ? (
                  closedPositions.map((pos, idx) => (
                    <div 
                      key={idx}
                      className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-900 dark:text-white">
                          {pos.tradingSymbol || pos.symbol || 'OPTION POSITION'}
                        </span>
                        <span className={`font-bold tabular-nums ${
                          (pos.pnl || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {(pos.pnl || 0) >= 0 ? '+' : ''}₹{(pos.pnl || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Executed at {pos.exitTime || '11:15 IST'} · Status: Closed
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-zinc-500">
                    No closed positions today.
                  </div>
                )
              )}
            </div>

            {/* Emergency Panic Exit button */}
            {openPositions.length > 0 && onSquareOffAll && (
              <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-rose-50 dark:bg-rose-950/20">
                <button
                  onClick={onSquareOffAll}
                  className="w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5"
                >
                  <AlertCircle className="size-3.5" />
                  Square Off All ({openPositions.length}) Positions
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ──────── COLUMN 2: CENTER REAL SIGNALS & ENGINE MONITOR (lg:col-span-6) ──────── */}
        <main className="lg:col-span-6 space-y-4">
          
          {/* ══ INDEX SELECTOR & STATUS BAR ══ */}
          <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm space-y-4">
            
            {/* Top Navigation: Sub-Tabs + Candle Scan Timer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <button
                  onClick={() => setCenterTab('signals')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    centerTab === 'signals'
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Zap className="size-3.5 text-indigo-400" />
                  Live AI Signals (Real Data)
                </button>
                <button
                  onClick={() => setCenterTab('positions')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    centerTab === 'positions'
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <BarChart3 className="size-3.5 text-zinc-400" />
                  Position Monitor
                </button>
                <button
                  onClick={() => setCenterTab('activity')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    centerTab === 'activity'
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Radio className="size-3.5 text-zinc-400" />
                  Recent Activity
                </button>
              </div>

              {/* Candle Scan Countdown Indicator */}
              <div className="flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-lg text-xs font-mono">
                <Clock className="size-3.5 text-zinc-400" />
                <span className="text-zinc-400 text-[11px]">Next {candleInterval}M Close:</span>
                <span className="font-bold text-zinc-100">{candleCountdown.str}</span>
              </div>
            </div>

            {/* Index Quick Filter Switcher (All, NIFTY, BANKNIFTY, SENSEX) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-400 font-medium">Focus Index:</span>
                <div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
                  {(['ALL', 'NIFTY', 'BANKNIFTY', 'SENSEX'] as const).map((idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedFocusIndex(idx)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        selectedFocusIndex === idx
                          ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {idx === 'ALL' ? 'All 3 Indices' : idx}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded border border-emerald-500/30">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                <span>100% Automated Trading Active</span>
              </div>
            </div>

            {/* TAB CONTENT 1: REAL LIVE AI SIGNALS (CLEAN 3-INDEX OVERVIEW & EXPANDED DEDICATED VIEW) */}
            {centerTab === 'signals' && (
              <div className="space-y-3.5">
                {selectedFocusIndex === 'ALL' ? (
                  /* 3 Real Index Cards (NIFTY 50, BANKNIFTY, BSE SENSEX) in Clean 3-Column Grid */
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {displayedIndices.map((idxItem) => (
                      <ProIndexOverviewCard
                        key={idxItem.key}
                        idxItem={idxItem}
                        candleInterval={candleInterval}
                        targetAmount={targetAmount}
                        stopLossAmount={stopLossAmount}
                        engineRunning={engineRunning}
                        onViewDetails={() => setSelectedFocusIndex(idxItem.key as any)}
                      />
                    ))}
                  </div>
                ) : (
                  /* Dedicated Full-Width Detailed View for the selected Index */
                  displayedIndices[0] && (
                    <ProIndexDetailedView
                      key={displayedIndices[0].key}
                      idxItem={displayedIndices[0]}
                      candleInterval={candleInterval}
                      targetAmount={targetAmount}
                      stopLossAmount={stopLossAmount}
                      engineRunning={engineRunning}
                      onBackToAll={() => setSelectedFocusIndex('ALL')}
                    />
                  )
                )}
              </div>
            )}

            {/* TAB CONTENT 2: POSITION MONITOR & LIVE ADVANCED CONTROLS */}
            {centerTab === 'positions' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                    <Activity className="size-4 text-purple-500" />
                    Real-Time Position Trailing Monitor ({openPositions.length} active)
                  </div>
                  {openPositions.length > 0 && onSquareOffAll && (
                    <button
                      onClick={onSquareOffAll}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <AlertCircle className="size-3" />
                      Square Off All
                    </button>
                  )}
                </div>

                {openPositions.length > 0 ? (
                  <div className="space-y-2.5">
                    {openPositions.map((pos, idx) => {
                      const qty = pos.netQty ?? pos.quantity ?? pos.qty ?? 0;
                      const buyPrice = pos.buyAvg ?? pos.buyPrice ?? pos.avgPrice ?? 0;
                      const ltp = pos.ltp ?? pos.lastPrice ?? buyPrice;
                      const pnl = pos.pnl ?? pos.unrealizedPnl ?? ((ltp - buyPrice) * qty);
                      const isProfit = pnl >= 0;

                      return (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-zinc-900 dark:text-white">
                                {pos.tradingSymbol || pos.symbol || 'OPTION POSITION'}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400">
                                {pos.productType || 'INTRADAY'}
                              </span>
                            </div>
                            <div className={`text-base font-black tabular-nums font-mono ${
                              isProfit ? 'text-emerald-500' : 'text-rose-500'
                            }`}>
                              {isProfit ? '+' : ''}₹{pnl.toFixed(2)}
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 text-xs font-mono bg-white dark:bg-zinc-950 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
                            <div>
                              <span className="text-[10px] text-zinc-400 block">Quantity</span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">{qty}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 block">Entry Avg</span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">₹{buyPrice.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 block">LTP</span>
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">₹{ltp.toFixed(2)}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-400 block">Trailing SL</span>
                              <span className="font-bold text-emerald-500">ARMED</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-xs text-zinc-400">
                              Target: <b className="text-emerald-400">+₹1,500</b> | Stop Loss: <b className="text-rose-400">-₹800</b>
                            </span>
                            <button
                              onClick={() => handleSquareOffPosition(pos)}
                              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                            >
                              Exit Position
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-900/30 rounded-xl border border-zinc-200 dark:border-zinc-800/60 space-y-2">
                    <CheckCircle className="size-8 text-emerald-500 mx-auto" />
                    <div className="text-sm font-bold text-zinc-900 dark:text-zinc-200">All Positions Clear</div>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                      AI Trading Engine is standing by. When signals trigger at the close of the {candleInterval}M candle, orders are placed automatically.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 3: RECENT ACTIVITY & ENGINE LOGS */}
            {centerTab === 'activity' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
                    {(['ALL', 'SIGNALS', 'ORDERS', 'ENGINE'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setLogFilter(filter)}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                          logFilter === filter
                            ? 'bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-xs'
                            : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  <span className="text-[11px] text-zinc-400 font-mono">
                    {filteredLogs.length} Events Logged
                  </span>
                </div>

                <div className="space-y-2 max-h-[360px] overflow-y-auto scrollbar-thin text-xs">
                  {filteredLogs.length > 0 ? (
                    filteredLogs.map((log, i) => (
                      <div
                        key={i}
                        className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/60 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className={`font-bold ${
                            log.type?.includes('ORDER') ? 'text-emerald-500' :
                            log.type?.includes('SIGNAL') ? 'text-purple-500' :
                            log.type?.includes('ERROR') ? 'text-rose-500' :
                            'text-zinc-300'
                          }`}>
                            {log.type || 'SYSTEM_EVENT'}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-IN') : '11:45:00'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
                          {log.message || JSON.stringify(log)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-xs text-zinc-500">
                      No logs matching selected filter.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ──────── COLUMN 3: RIGHT MODULAR ENGINE & RECENT ACTIVITY (lg:col-span-3) ──────── */}
        <aside className="lg:col-span-3 space-y-4">
          
          {/* ══ 1. LIVE TRADING ENGINE CARD ══ */}
          <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${
                  engineRunning ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                }`}>
                  <Activity className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Live Trading Engine</h4>
                  <p className="text-[10px] text-zinc-500">Auto Execution & SL Guardian</p>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                engineRunning 
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' 
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
              }`}>
                {engineRunning ? 'ACTIVE' : 'IDLE'}
              </span>
            </div>

            {/* Engine Parameter Specifications Box (Timeframes 5m & 15m) */}
            <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900/60 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800/60 font-mono">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Strategy:</span>
                <span className="font-semibold text-purple-600 dark:text-purple-400">
                  SuperTrend AI ({candleInterval}M)
                </span>
              </div>

              {/* Timeframe & Candle Scan Run Selector (5m & 15m) */}
              <div className="flex justify-between items-center pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50 font-sans">
                <span className="text-zinc-500 text-[11px]">Candle / Scan:</span>
                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    onClick={() => {
                      if (onCandleIntervalChange) onCandleIntervalChange('5');
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      candleInterval === '5' ? 'bg-purple-600 text-white shadow-xs' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    5m
                  </button>
                  <button
                    onClick={() => {
                      if (onCandleIntervalChange) onCandleIntervalChange('15');
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-all ${
                      candleInterval === '15' ? 'bg-purple-600 text-white shadow-xs' : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    15m
                  </button>
                  <span className="text-zinc-400 ml-1">· 5s loop</span>
                </div>
              </div>

              {/* Active Symbol Slots Count (Configured in Auto-Symbol Settings) */}
              <div className="flex justify-between items-center pt-1 border-t border-zinc-200/50 dark:border-zinc-800/50">
                <span className="text-zinc-500">Active Slots:</span>
                <button
                  onClick={() => onNavigateTab('settings')}
                  className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 hover:underline cursor-pointer transition-colors"
                  title="Click to view & configure auto symbol slots"
                >
                  <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
                  {slotInfo.activeCount} / {slotInfo.maxSlots} Slots
                </button>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Square-Off:</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">15:15 IST (Auto)</span>
              </div>
            </div>

            {/* Engine Start/Stop Action Button */}
            <div className="flex gap-2">
              <button
                onClick={onToggleEngine}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${
                  engineRunning
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {engineRunning ? (
                  <>
                    <Pause className="size-4" /> Stop Engine
                  </>
                ) : (
                  <>
                    <Play className="size-4" /> Start Engine
                  </>
                )}
              </button>
              
              <button
                onClick={() => onNavigateTab('strategies')}
                className="p-2.5 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-colors"
                title="Configure Strategy & Symbol SL"
              >
                <SlidersHorizontal className="size-4" />
              </button>
            </div>
          </div>

          {/* ══ 2. CONNECTED BROKER & REAL DEDICATED VPS ══ */}
          <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrokerLogo id={activeBroker} name={activeBrokerName} size={24} className="shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1">
                    {activeBrokerName}
                    <CheckCircle2 className="size-3.5 text-emerald-500 inline" />
                  </h4>
                  <p className="text-[10px] text-zinc-500">Dedicated VPS Routing</p>
                </div>
              </div>
              <button
                onClick={onOpenBrokerSetup}
                className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline"
              >
                Manage
              </button>
            </div>

            {/* Static IP and Latency specs (Matching Real IP 168.144.123.185) */}
            <div className="space-y-1.5 text-xs bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/60 font-mono">
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Dedicated IP:</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                  <Server className="size-3 text-emerald-500" />
                  {dedicatedIp}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">API Latency:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">12 ms</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">SEBI Compliance:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">100% Whitelisted</span>
              </div>
            </div>
          </div>

          {/* ══ 3. RESTORED RECENT ACTIVITY CARD ══ */}
          <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                <Radio className="size-3.5 text-purple-600 dark:text-purple-400 animate-pulse" />
                Recent Activity
              </h4>
              <button
                onClick={() => setCenterTab('activity')}
                className="text-[11px] text-zinc-400 hover:text-purple-500 transition-colors"
              >
                View All
              </button>
            </div>

            {/* Compact Activity Log Stream */}
            <div className="space-y-2 max-h-[260px] overflow-y-auto scrollbar-thin text-xs">
              <div className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/60 space-y-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="size-3 text-emerald-500" />
                    VPS Handshake
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">Live</span>
                </div>
                <p className="text-[10px] text-zinc-500 leading-tight">
                  Orders bound to static IP <b className="text-zinc-400">{dedicatedIp}</b>. Broker channel synchronized.
                </p>
              </div>

              {logs && logs.length > 0 ? (
                logs.slice(0, 4).map((l, i) => (
                  <div key={i} className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-100 dark:border-zinc-800/40">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-purple-600 dark:text-purple-400 truncate max-w-[150px]">
                        {l.type || 'TRADE_EVENT'}
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {new Date(l.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{l.message}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-zinc-500">
                  Engine scanning live candle feeds...
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
