## Goal
Redesign the existing trading dashboard into a modern, institutional-grade fintech UI that's beginner-friendly and easy to scan in 3 seconds. Pure UI/UX work — no changes to backend, signal logic, position monitor, or strategy engines.

## Scope (UI only)
- Keep all existing data sources, API calls, and business logic untouched
- Rebuild layout, visual hierarchy, components, color tokens, spacing, animations
- Wire new components to the same hooks/endpoints currently used

## Design System Updates
- Update `src/index.css` + `tailwind.config.ts` with fintech tokens:
  - Semantic colors: `--profit` (green), `--loss` (red), `--warning` (orange), `--info` (blue), `--ai` (purple), `--muted-status` (grey)
  - Glass surface tokens: `--glass-bg`, `--glass-border`, backdrop blur utilities
  - Gradients: `--gradient-profit`, `--gradient-loss`, `--gradient-ai`, `--gradient-hero`
  - Glow shadows: `--glow-profit`, `--glow-loss`, `--glow-ai`
  - Dark-mode tuned HSL values throughout
- Add animation keyframes: `pulse-glow`, `count-up`, `shimmer`, `signal-pop`, `live-dot`

## New Layout Architecture

```
┌─────────────────────────────────────────────────────────┐
│ TopBar: Logo │ Market OPEN/CLOSED │ Indices ticker │   │
│              Global P&L │ Bell │ Quick Trade │ Profile  │
├──────┬──────────────────────────────────────────────────┤
│ Side │ MAIN                                             │
│ Nav  │ ── Quick Status Cards (8 KPI tiles) ──           │
│      │ ── Live Market Overview (index widgets) ──       │
│ icons│ ── AI Signal Center (glowing signal cards) ──    │
│ +    │ ── Live Positions Panel ──                       │
│ label│ ── Strategy Performance (charts) ──              │
│      │ ── Broker Connection │ Risk Center ──            │
│      │ ── Trade Journal preview ──                      │
└──────┴──────────────────────────────────────────────────┘
```

Mobile: collapsed sidebar → bottom tab bar (Dashboard / Signals / Positions / Journal / Menu) + floating quick-trade FAB.

## New Components (under `src/app/components/dashboard/`)
1. `DashboardShell.tsx` — TopBar + Sidebar + content slot, responsive
2. `TopBar.tsx` — market status pill, indices ticker, global P&L, notifications, quick trade
3. `SideNav.tsx` — collapsible icon+label nav (uses shadcn sidebar)
4. `MobileBottomNav.tsx`
5. `KpiCard.tsx` — icon, animated counter, sparkline (recharts), delta %, status dot
6. `KpiGrid.tsx` — renders the 8 status cards
7. `MarketWidget.tsx` + `MarketOverview.tsx` — index card with mini chart, strength bar
8. `SignalCard.tsx` — glowing border by direction, confidence ring, indicator chips (EMA/RSI/MACD/VWAP/Vol), entry/SL/target, big action button
9. `SignalCenter.tsx` — grid of SignalCards with filter tabs
10. `PositionsTable.tsx` — live MTM, ROI, trailing SL, exit button, expandable rows
11. `StrategyPerformance.tsx` — equity curve, daily P&L bars, win/loss donut, heatmap
12. `BrokerPanel.tsx` — broker cards with status, latency, auto-trade toggle
13. `RiskCenter.tsx` — circular progress for daily loss, drawdown, exposure, margin
14. `JournalPreview.tsx` — recent trades with tags
15. `QuickTradeFab.tsx` — floating button + sheet
16. `CommandPalette.tsx` — ⌘K global search
17. `AiPulse.tsx` — small reusable AI confidence pulse/gauge

Reuse existing logic by importing the current data hooks/calls from `TradingDashboard.tsx`, `AdvancedPositionMonitor.tsx`, `ProfitDashboard.tsx`, `StrategyManager.tsx`, `BrokerRequest.tsx`, `TradingJournal.tsx`. No backend edits.

## Integration
- Replace the body of `src/app/components/TradingDashboard.tsx` to render `<DashboardShell>` with the new sections.
- Existing route `/dashboard` keeps working (no router changes).
- All existing screens (Settings, Symbols, Wallet, Support, etc.) become routes inside the new SideNav, mounting the **existing** components unchanged.

## Visual / UX Details
- Glassmorphism: `bg-card/60 backdrop-blur-xl border border-white/10`
- Rounded-2xl cards, soft shadow, hover lift (`hover-scale`)
- Live dot animation on "OPEN" market badge
- Animated number counters on KPIs
- Toast (sonner) for new signals
- Loading skeletons + empty states for every section
- Keyboard shortcuts: `⌘K` palette, `g d` dashboard, `g s` signals, `g p` positions

## Out of Scope
- No strategy/AI/engine logic changes
- No new endpoints or DB migrations
- No TradingView paid widgets — use recharts for all charts
- No changes to auth, admin, or landing pages

## Deliverable
A redesigned `/dashboard` matching the institutional fintech brief, fully responsive, dark-mode first, wired to the existing data layer.
