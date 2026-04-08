import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  FileText, 
  Search, 
  Eye,
  Download,
  Filter,
  Calendar,
  User,
  TrendingUp,
  TrendingDown,
  BookOpen
} from 'lucide-react';
import { motion } from 'motion/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { api, API_ENDPOINTS } from '../utils/apiService';

interface JournalEntry {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
  symbol: string;
  action: string;
  pnl: number;
  notes: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

interface AdminJournalsProps {
  accessToken: string;
}

export function AdminJournals({ accessToken }: AdminJournalsProps) {
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [filterUser, setFilterUser] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    loadJournals();
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadJournals, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadJournals = async () => {
    try {
      // Fetch from server using centralized API
      const data = await api.get(API_ENDPOINTS.ADMIN.JOURNALS, accessToken);
      setJournals(data.journals || []);
    } catch (err: any) {
      console.error('Error loading journals from server:', err);
      // Fallback to localStorage
      loadLocalJournals();
    }
  };

  const loadLocalJournals = () => {
    const storedJournals = JSON.parse(localStorage.getItem('user_journals') || '[]');
    console.log('📔 [ADMIN JOURNALS] Loading from localStorage...');
    console.log('📔 [ADMIN JOURNALS] Raw data:', localStorage.getItem('user_journals'));
    console.log('📔 [ADMIN JOURNALS] Parsed journals:', storedJournals);
    console.log('📔 [ADMIN JOURNALS] Count:', storedJournals.length);
    setJournals(storedJournals);
  };

  const getFilteredJournals = () => {
    let filtered = journals;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(j =>
        j.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        j.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        j.notes.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // User filter
    if (filterUser !== 'all') {
      filtered = filtered.filter(j => j.userId === filterUser);
    }

    // Date filter
    const now = Date.now();
    switch (dateFilter) {
      case 'today':
        filtered = filtered.filter(j => 
          new Date(j.timestamp).toDateString() === new Date().toDateString()
        );
        break;
      case 'week':
        filtered = filtered.filter(j => 
          now - new Date(j.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
        );
        break;
      case 'month':
        filtered = filtered.filter(j => 
          now - new Date(j.timestamp).getTime() < 30 * 24 * 60 * 60 * 1000
        );
        break;
    }

    return filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  const exportToCSV = () => {
    const filtered = getFilteredJournals();
    const csv = [
      ['User', 'Timestamp', 'Symbol', 'Action', 'P&L', 'Sentiment', 'Notes'].join(','),
      ...filtered.map(j => [
        j.userName,
        new Date(j.timestamp).toLocaleString(),
        j.symbol,
        j.action,
        j.pnl,
        j.sentiment,
        `"${j.notes}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `journals_${Date.now()}.csv`;
    a.click();
  };

  const uniqueUsers = Array.from(new Set(journals.map(j => j.userId)));
  const filteredJournals = getFilteredJournals();

  const stats = {
    total: journals.length,
    today: journals.filter(j => 
      new Date(j.timestamp).toDateString() === new Date().toDateString()
    ).length,
    positive: journals.filter(j => j.sentiment === 'positive').length,
    negative: journals.filter(j => j.sentiment === 'negative').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="size-6 text-blue-400" />
            Trading Journals
          </h2>
          <p className="text-slate-400">Total: {journals.length} entries</p>
        </div>
        <Button onClick={exportToCSV} className="bg-blue-600 hover:bg-blue-700">
          <Download className="size-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-blue-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <FileText className="size-8 text-blue-400" />
                <Badge className="bg-blue-500/10 text-blue-400">Total</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Total Entries</p>
              <p className="text-2xl font-bold text-white">{stats.total}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-purple-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <Calendar className="size-8 text-purple-400" />
                <Badge className="bg-purple-500/10 text-purple-400">Today</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Today's Entries</p>
              <p className="text-2xl font-bold text-white">{stats.today}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-green-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="size-8 text-green-400" />
                <Badge className="bg-green-500/10 text-green-400">Positive</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Positive Sentiment</p>
              <p className="text-2xl font-bold text-white">{stats.positive}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-red-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingDown className="size-8 text-red-400" />
                <Badge className="bg-red-500/10 text-red-400">Negative</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Negative Sentiment</p>
              <p className="text-2xl font-bold text-white">{stats.negative}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters */}
      <Card className="border-blue-500/20 bg-slate-900/50">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search journals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>

            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map(userId => {
                  const user = journals.find(j => j.userId === userId);
                  return (
                    <SelectItem key={userId} value={userId}>
                      {user?.userName || userId}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select value={dateFilter} onValueChange={(v: any) => setDateFilter(v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Journals List */}
      <Card className="border-blue-500/20 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <FileText className="size-5 text-blue-400" />
            Journal Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredJournals.map((journal, index) => (
              <motion.div
                key={journal.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-all cursor-pointer"
                onClick={() => {
                  setSelectedJournal(journal);
                  setShowJournalDialog(true);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-3 rounded-lg ${
                      journal.sentiment === 'positive' ? 'bg-green-500/10' :
                      journal.sentiment === 'negative' ? 'bg-red-500/10' :
                      'bg-gray-500/10'
                    }`}>
                      {journal.sentiment === 'positive' ? (
                        <TrendingUp className="size-6 text-green-400" />
                      ) : journal.sentiment === 'negative' ? (
                        <TrendingDown className="size-6 text-red-400" />
                      ) : (
                        <FileText className="size-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white">{journal.userName}</p>
                        <Badge variant="outline" className="text-xs">
                          {journal.symbol}
                        </Badge>
                        <Badge 
                          variant="secondary"
                          className={
                            journal.sentiment === 'positive' ? 'bg-green-500/10 text-green-400' :
                            journal.sentiment === 'negative' ? 'bg-red-500/10 text-red-400' :
                            'bg-gray-500/10 text-gray-400'
                          }
                        >
                          {journal.sentiment}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400">{journal.action}</p>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-1">{journal.notes}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${journal.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {journal.pnl >= 0 ? '+' : ''}₹{journal.pnl.toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(journal.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}

            {filteredJournals.length === 0 && (
              <div className="text-center py-12">
                <FileText className="size-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No journal entries found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Journal Details Dialog */}
      <Dialog open={showJournalDialog} onOpenChange={setShowJournalDialog}>
        <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-5 text-blue-400" />
              Journal Details
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Detailed view of trading journal entry and analysis
            </DialogDescription>
          </DialogHeader>

          {selectedJournal && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">User</p>
                  <p className="text-white font-semibold">{selectedJournal.userName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Symbol</p>
                  <Badge variant="outline">{selectedJournal.symbol}</Badge>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Action</p>
                  <p className="text-white">{selectedJournal.action}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">P&L</p>
                  <p className={`font-bold ${selectedJournal.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedJournal.pnl >= 0 ? '+' : ''}₹{selectedJournal.pnl.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Sentiment</p>
                  <Badge 
                    className={
                      selectedJournal.sentiment === 'positive' ? 'bg-green-500' :
                      selectedJournal.sentiment === 'negative' ? 'bg-red-500' :
                      'bg-gray-500'
                    }
                  >
                    {selectedJournal.sentiment}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Timestamp</p>
                  <p className="text-white text-sm">
                    {new Date(selectedJournal.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-slate-400 mb-2">Notes</p>
                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-4">
                    <p className="text-white whitespace-pre-wrap">{selectedJournal.notes}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}