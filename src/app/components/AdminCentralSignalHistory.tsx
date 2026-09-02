// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { History, RefreshCw, CalendarDays } from 'lucide-react';

interface Props {
  serverUrl: string;
  accessToken: string;
}

const INDEXES = ['NIFTY', 'BANKNIFTY', 'SENSEX'];

const istToday = () => {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const tone = (action?: string) => {
  if (action === 'BUY_CALL') return 'bg-emerald-600 text-primary-foreground';
  if (action === 'BUY_PUT') return 'bg-rose-600 text-primary-foreground';
  if (action === 'EXIT') return 'bg-orange-600 text-primary-foreground';
  if (action === 'HOLD') return 'bg-sky-600 text-primary-foreground';
  if (action === 'WAIT') return 'bg-amber-500 text-background';
  return 'bg-muted text-muted-foreground';
};

export function AdminCentralSignalHistory({ serverUrl, accessToken }: Props) {
  const [date, setDate] = useState(istToday());
  const [dates, setDates] = useState<string[]>([]);
  const [tf, setTf] = useState<'all' | '5' | '15'>('all');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: string) => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`${serverUrl}/admin/market-data/signal-history?date=${encodeURIComponent(d)}`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || `HTTP ${r.status}`);
      setRows(j.signals || []);
      if (Array.isArray(j.dates) && j.dates.length) setDates(j.dates);
    } catch (e: any) {
      setRows([]);
      setError(e.message || 'Failed to load signal history');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, accessToken]);

  useEffect(() => { load(date); }, [date, load]);

  const filtered = rows.filter((r) => tf === 'all' || String(r.tf) === tf);
  const times = Array.from(new Set(filtered.map((r) => r.candleStamp))).sort().reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-5" />
          Central Signal History
          <Badge variant="secondary">{filtered.length} signals</Badge>
        </CardTitle>
        <CardDescription>
          Every shared 5M and 15M signal published from the admin data subscription, date wise and time wise —
          exactly what each user engine consumed on that candle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="sig-date" className="flex items-center gap-1 text-xs">
              <CalendarDays className="size-3" /> Date
            </Label>
            <Input
              id="sig-date"
              type="date"
              value={date}
              max={istToday()}
              onChange={(e) => setDate(e.target.value)}
              className="w-[170px]"
            />
          </div>

          <div className="flex gap-1">
            {(['all', '5', '15'] as const).map((t) => (
              <Button key={t} size="sm" variant={tf === t ? 'default' : 'outline'} onClick={() => setTf(t)}>
                {t === 'all' ? 'All' : `${t}M`}
              </Button>
            ))}
          </div>

          <Button size="sm" variant="ghost" onClick={() => load(date)} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {!!dates.length && (
          <div className="flex flex-wrap gap-1">
            {dates.slice(0, 14).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={d === date ? 'secondary' : 'ghost'}
                className="h-7 text-[11px]"
                onClick={() => setDate(d)}
              >
                {d}
              </Button>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!loading && !filtered.length && !error && (
          <p className="text-sm text-muted-foreground">No signals recorded for {date}.</p>
        )}

        <div className="space-y-3">
          {times.map((time) => (
            <div key={time} className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                <span className="font-semibold">{time} IST</span>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
              <div className="grid gap-2 p-3 md:grid-cols-3">
                {INDEXES.map((idx) => {
                  const cells = filtered.filter((r) => r.candleStamp === time && r.index === idx);
                  return (
                    <div key={idx} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">{idx}</div>
                      {cells.length ? (
                        cells
                          .sort((a, b) => a.tf - b.tf)
                          .map((s) => (
                            <div key={`${s.index}-${s.tf}`} className="rounded-md border p-2 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <Badge variant="outline" className="text-[10px]">{s.timeframe}</Badge>
                                <Badge className={`${tone(s.action)} text-[10px]`}>{s.action}</Badge>
                                <span className="font-medium">{s.confidence}%</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                                {s.barOpen && s.barClose && (
                                  <Badge variant="secondary" className="text-[10px] font-normal">
                                    candle {s.barOpen} → {s.barClose}
                                  </Badge>
                                )}
                                {s.publishedIst && <span>published {s.publishedIst}</span>}
                                {typeof s.delaySec === 'number' && s.delaySec > 90 && (
                                  <Badge variant="destructive" className="text-[10px]">+{s.delaySec}s late</Badge>
                                )}
                                {s.stale && (
                                  <Badge variant="destructive" className="text-[10px]">stale candle</Badge>
                                )}
                              </div>
                              <div className="text-muted-foreground">
                                {s.bias ? `${s.bias} · ` : ''}
                                {s.marketState || '—'}
                                {s.confirmations?.required
                                  ? ` · ${s.confirmations.total}/${s.confirmations.required}`
                                  : ''}
                              </div>
                              {s.reason && <p className="text-[11px] leading-snug">{s.reason}</p>}
                            </div>

                          ))
                      ) : (
                        <div className="rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
                          No signal
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminCentralSignalHistory;
