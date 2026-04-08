import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity,
  ChevronLeft,
  ChevronRight,
  Target,
  Zap,
  User,
  BarChart3,
  Award,
  Flame,
  Trash2
} from 'lucide-react';

interface JournalEntry {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  symbol: string;
  strategy: string; // 'AI_ENHANCED_ENGINE' for AI trades, anything else shows as Manual
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  orderId?: string;
  notes?: string;
}

interface DailyStats {
  date: string;
  totalPnL: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgPnL: number;
}

interface TradingJournalProps {
  accessToken: string;
  serverUrl: string;
  userId: string;
}

export function TradingJournal({ accessToken, serverUrl, userId }: TradingJournalProps) {
  const [viewMode, setViewMode] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Yearly'>('Monthly');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [dailyStats, setDailyStats] = useState<Map<string, DailyStats>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [testing, setTesting] = useState(false);

  // Fetch journal entries from backend
  const fetchJournalEntries = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/get-journal-entries`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();
      if (data.success && data.entries) {
        setJournalEntries(data.entries);
        calculateDailyStats(data.entries);
      }
    } catch (error) {
      console.error('Failed to fetch journal entries:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournalEntries();
    // Refresh every 5 minutes
    const interval = setInterval(fetchJournalEntries, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate daily statistics
  const calculateDailyStats = (entries: JournalEntry[]) => {
    const statsMap = new Map<string, DailyStats>();

    entries.forEach(entry => {
      const existing = statsMap.get(entry.date) || {
        date: entry.date,
        totalPnL: 0,
        tradeCount: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        avgPnL: 0
      };

      existing.totalPnL += entry.pnl;
      existing.tradeCount += 1;
      if (entry.pnl > 0) existing.winCount += 1;
      if (entry.pnl < 0) existing.lossCount += 1;

      statsMap.set(entry.date, existing);
    });

    // Calculate averages and win rates
    statsMap.forEach((stats, date) => {
      stats.avgPnL = stats.totalPnL / stats.tradeCount;
      stats.winRate = (stats.winCount / stats.tradeCount) * 100;
    });

    setDailyStats(statsMap);
  };

  // Get current month/year stats
  const getCurrentPeriodStats = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    let periodEntries = journalEntries;

    if (viewMode === 'Monthly') {
      periodEntries = journalEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.getFullYear() === year && entryDate.getMonth() === month;
      });
    } else if (viewMode === 'Yearly') {
      periodEntries = journalEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.getFullYear() === year;
      });
    } else if (viewMode === 'Weekly') {
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      periodEntries = journalEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate >= weekStart && entryDate <= weekEnd;
      });
    }

    const totalPnL = periodEntries.reduce((sum, e) => sum + e.pnl, 0);
    const tradingDays = new Set(periodEntries.map(e => e.date)).size;
    const tradedOn = periodEntries.length;
    const profitDays = Array.from(dailyStats.values()).filter(s => {
      const sDate = new Date(s.date);
      if (viewMode === 'Monthly') {
        return sDate.getFullYear() === year && sDate.getMonth() === month && s.totalPnL > 0;
      } else if (viewMode === 'Yearly') {
        return sDate.getFullYear() === year && s.totalPnL > 0;
      }
      return s.totalPnL > 0;
    }).length;

    // Find most profitable day
    let mostProfitable = { date: '', amount: 0 };
    dailyStats.forEach((stats, date) => {
      const sDate = new Date(date);
      let isInPeriod = false;
      
      if (viewMode === 'Monthly') {
        isInPeriod = sDate.getFullYear() === year && sDate.getMonth() === month;
      } else if (viewMode === 'Yearly') {
        isInPeriod = sDate.getFullYear() === year;
      }
      
      if (isInPeriod && stats.totalPnL > mostProfitable.amount) {
        mostProfitable = { date, amount: stats.totalPnL };
      }
    });

    // Calculate winning streak
    const sortedDates = Array.from(dailyStats.keys()).sort();
    let winningStreak = 0;
    let currentStreak = 0;
    let maxStreak = 0;

    sortedDates.forEach(date => {
      const stats = dailyStats.get(date)!;
      if (stats.totalPnL > 0) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    });

    // Current streak (from most recent date)
    const today = new Date().toISOString().split('T')[0];
    const recentDates = sortedDates.filter(d => d <= today).reverse();
    let streak = 0;
    for (const date of recentDates) {
      const stats = dailyStats.get(date)!;
      if (stats.totalPnL > 0) {
        streak++;
      } else {
        break;
      }
    }

    return {
      totalPnL,
      tradingDays,
      tradedOn,
      profitDays,
      mostProfitable,
      winningStreak: maxStreak,
      currentStreak: streak
    };
  };

  const stats = getCurrentPeriodStats();

  // Sync real trades from Dhan API
  const handleSyncRealTrades = async () => {
    setSyncing(true);
    try {
      console.log('🔄 Starting Dhan sync...');
      
      const response = await fetch(`${serverUrl}/sync-manual-trades`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📡 Response status:', response.status);
      
      const data = await response.json();
      console.log('📊 Response data:', data);
      
      if (data.success) {
        console.log(`✅ ${data.message}`);
        alert(`✅ ${data.message}\nSynced: ${data.syncedCount} trades\nTotal P&L: ₹${data.totalPnL?.toFixed(2) || '0.00'}`);
        // Refresh journal entries
        await fetchJournalEntries();
        setLastSyncTime(new Date().toLocaleTimeString());
      } else if (data.error) {
        console.error('❌ Sync error:', data.error);
        alert(`❌ Sync failed: ${data.error}`);
      }
    } catch (error) {
      console.error('❌ Failed to sync real trades:', error);
      alert(`❌ Network error: ${error}`);
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync at 3:30 PM daily (market close)
  useEffect(() => {
    const checkAndSync = () => {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      
      // Sync at 3:30 PM (15:30)
      if (hours === 15 && minutes === 30) {
        console.log('🕒 Market closed! Auto-syncing trades to journal...');
        handleSyncRealTrades();
      }
    };

    // Check every minute
    const interval = setInterval(checkAndSync, 60 * 1000);
    
    // Also check immediately on mount
    checkAndSync();
    
    return () => clearInterval(interval);
  }, []);

  // Clear all journal data (remove sample data)
  const handleClearAllData = async () => {
    if (!confirm('⚠️ This will DELETE ALL journal data! Are you sure?')) {
      return;
    }
    
    setClearing(true);
    try {
      const response = await fetch(`${serverUrl}/clear-journal-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (data.success) {
        console.log(`🗑️ ${data.message}`);
        // Refresh journal entries
        await fetchJournalEntries();
      }
    } catch (error) {
      console.error('Failed to clear journal data:', error);
    } finally {
      setClearing(false);
    }
  };

  // Render calendar for current month
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Fill initial empty days
    for (let i = 0; i < startingDayOfWeek; i++) {
      currentWeek.push(null);
    }

    // Fill days of month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill remaining days
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <div className="space-y-3">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
            variant="outline"
            size="sm"
            className="bg-zinc-800 border-zinc-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <h3 className="text-xl font-bold text-zinc-100">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          
          <Button
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
            variant="outline"
            size="sm"
            className="bg-zinc-800 border-zinc-700"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs font-semibold text-zinc-400 p-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="space-y-2">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 gap-2">
              {week.map((day, dayIdx) => {
                if (!day) {
                  return <div key={dayIdx} className="aspect-square" />;
                }

                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayStats = dailyStats.get(dateStr);
                const hasTrades = dayStats && dayStats.tradeCount > 0;
                const isProfit = dayStats && dayStats.totalPnL > 0;
                const isLoss = dayStats && dayStats.totalPnL < 0;
                const isSelected = selectedDate === dateStr;

                return (
                  <button
                    key={dayIdx}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`
                      aspect-square rounded-lg p-2 text-center transition-all
                      ${!hasTrades ? 'bg-zinc-800/30 text-zinc-600' : ''}
                      ${isProfit ? 'bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-400 font-bold hover:bg-emerald-500/30' : ''}
                      ${isLoss ? 'bg-red-500/20 border-2 border-red-500/50 text-red-400 font-bold hover:bg-red-500/30' : ''}
                      ${isSelected ? 'ring-2 ring-blue-500' : ''}
                      ${!hasTrades ? 'hover:bg-zinc-800/50' : ''}
                    `}
                  >
                    <div className="text-sm">{day}</div>
                    {hasTrades && (
                      <div className="text-xs mt-1">
                        ₹{Math.abs(dayStats.totalPnL).toFixed(0)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Profit/Loss indicator */}
        <div className="flex items-center gap-2 text-xs text-zinc-400 mt-4">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/50" />
            <span>Profit Day</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-red-500/20 border border-red-500/50" />
            <span>Loss Day</span>
          </div>
        </div>

        <p className="text-sm text-amber-400 flex items-center gap-2">
          <Flame className="w-4 h-4" />
          Total Number of days you are profitable for: 
          <span className="font-bold text-amber-300">
            {stats.profitDays}/{stats.tradingDays} Traded days
          </span>
        </p>
      </div>
    );
  };

  // Render selected day details
  const renderDayDetails = () => {
    if (!selectedDate) {
      return (
        <div className="flex items-center justify-center h-64 text-zinc-500">
          <div className="text-center">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Click on a day to view trades</p>
          </div>
        </div>
      );
    }

    const dayEntries = journalEntries.filter(e => e.date === selectedDate);
    const dayStats = dailyStats.get(selectedDate);

    if (!dayStats || dayEntries.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-zinc-500">
          <div className="text-center">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No trades on {selectedDate}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-bold text-zinc-100">
            {new Date(selectedDate).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </h4>
          <Button
            onClick={() => setSelectedDate(null)}
            variant="outline"
            size="sm"
            className="bg-zinc-800 border-zinc-700"
          >
            Close
          </Button>
        </div>

        {/* Day Stats Summary */}
        <div className="grid grid-cols-4 gap-3">
          <Card className="bg-zinc-800/50 border-zinc-700">
            <CardContent className="p-3">
              <div className="text-xs text-zinc-400 mb-1">Total P&L</div>
              <div className={`text-lg font-bold ${dayStats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {dayStats.totalPnL >= 0 ? '+' : ''}₹{dayStats.totalPnL.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-800/50 border-zinc-700">
            <CardContent className="p-3">
              <div className="text-xs text-zinc-400 mb-1">Trades</div>
              <div className="text-lg font-bold text-blue-400">{dayStats.tradeCount}</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-800/50 border-zinc-700">
            <CardContent className="p-3">
              <div className="text-xs text-zinc-400 mb-1">Win Rate</div>
              <div className="text-lg font-bold text-purple-400">{dayStats.winRate.toFixed(0)}%</div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-800/50 border-zinc-700">
            <CardContent className="p-3">
              <div className="text-xs text-zinc-400 mb-1">Avg P&L</div>
              <div className={`text-lg font-bold ${dayStats.avgPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                ₹{dayStats.avgPnL.toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trade List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {dayEntries.map((entry, idx) => (
            <Card key={idx} className="bg-zinc-800/30 border-zinc-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {entry.strategy === 'AI_ENHANCED_ENGINE' ? (
                        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50">
                          <Zap className="w-3 h-3 mr-1" />
                          AI Trade
                        </Badge>
                      ) : (
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50">
                          <User className="w-3 h-3 mr-1" />
                          Manual
                        </Badge>
                      )}
                      <Badge variant="outline" className={entry.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>
                        {entry.side}
                      </Badge>
                      <span className="text-sm font-semibold text-zinc-300">{entry.symbol}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-zinc-500">Entry:</span>
                        <span className="text-zinc-300 ml-1">₹{entry.entryPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Exit:</span>
                        <span className="text-zinc-300 ml-1">₹{entry.exitPrice.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Qty:</span>
                        <span className="text-zinc-300 ml-1">{entry.quantity}</span>
                      </div>
                    </div>

                    {entry.notes && (
                      <p className="text-xs text-zinc-400 mt-2 italic">{entry.notes}</p>
                    )}
                  </div>

                  <div className="text-right">
                    <div className={`text-lg font-bold ${entry.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {entry.pnl >= 0 ? '+' : ''}₹{entry.pnl.toFixed(2)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-yellow-500 rounded-lg">
            <BarChart3 className="w-6 h-6 text-zinc-900" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">Trader's Diary</h2>
            <p className="text-sm text-zinc-400">Track your trading journey</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Clear All Data Button */}
          <Button
            onClick={handleClearAllData}
            disabled={clearing}
            variant="outline"
            size="sm"
            className="bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {clearing ? 'Clearing...' : 'Clear All'}
          </Button>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            {(['Daily', 'Weekly', 'Monthly', 'Yearly'] as const).map(mode => (
              <Button
                key={mode}
                onClick={() => setViewMode(mode)}
                variant={viewMode === mode ? 'default' : 'outline'}
                className={
                  viewMode === mode
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                }
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Net Realized P&L */}
        <Card className="bg-gradient-to-br from-zinc-800 to-zinc-900 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
                  <TrendingUp className="w-4 h-4" />
                  Net Realized P&L:
                </div>
                <div className={`text-3xl font-bold ${stats.totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stats.totalPnL >= 0 ? '+ ' : '- '}₹{Math.abs(stats.totalPnL).toFixed(2)}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  for {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Most Profitable */}
        <Card className="bg-gradient-to-br from-zinc-800 to-zinc-900 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
              <Award className="w-4 h-4 text-yellow-500" />
              Most Profitable in this period:
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              ₹{stats.mostProfitable.amount.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              on {stats.mostProfitable.date ? new Date(stats.mostProfitable.date).toLocaleDateString() : 'N/A'}
            </div>
          </CardContent>
        </Card>

        {/* Most Profitable All Time */}
        <Card className="bg-gradient-to-br from-zinc-800 to-zinc-900 border-zinc-700">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-1">
              <Award className="w-4 h-4 text-emerald-500" />
              Most Profitable of all time:
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              ₹{stats.mostProfitable.amount.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              on {stats.mostProfitable.date ? new Date(stats.mostProfitable.date).toLocaleDateString() : 'N/A'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Pills */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-purple-400 mb-1">{stats.tradingDays}</div>
            <div className="text-xs text-zinc-400">Trading Days</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-orange-400 mb-1">{stats.tradedOn}</div>
            <div className="text-xs text-zinc-400">Traded On</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-emerald-400 mb-1">{stats.profitDays}</div>
            <div className="text-xs text-zinc-400">In-Profit Days</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-400 mb-1">{stats.winningStreak}</div>
            <div className="text-xs text-zinc-400">Winning Streak</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-800/50 border-zinc-700">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-1">{stats.currentStreak}</div>
            <div className="text-xs text-zinc-400">Current Streak</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-2 gap-6">
        {/* Calendar View */}
        <Card className="bg-zinc-900/50 border-zinc-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">View {viewMode} Trades</CardTitle>
              <div className="flex items-center gap-2">
                {lastSyncTime && (
                  <span className="text-xs text-zinc-500">
                    Last sync: {lastSyncTime}
                  </span>
                )}
                <Button
                  onClick={handleSyncRealTrades}
                  disabled={syncing}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Activity className="w-4 h-4 mr-1" />
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {renderCalendar()}
          </CardContent>
        </Card>

        {/* Day Details */}
        <Card className="bg-zinc-900/50 border-zinc-700">
          <CardHeader>
            <CardTitle className="text-lg">Trade Details</CardTitle>
          </CardHeader>
          <CardContent>
            {renderDayDetails()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}