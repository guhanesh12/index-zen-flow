import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  DollarSign, 
  Search, 
  ArrowUpCircle, 
  ArrowDownCircle,
  Calendar,
  Filter,
  Download,
  TrendingUp,
  Server
} from 'lucide-react';
import { motion } from 'motion/react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { getVpsBackendUrl } from '../../../utils/config/apiConfig';

interface Transaction {
  id: string;
  userId: string;
  userName: string;
  type: 'credit' | 'debit';
  amount: number;
  balance: number;
  timestamp: string;
  description: string;
  razorpayOrderId?: string;
}

interface AdminTransactionsProps {
  serverUrl: string;
  accessToken: string;
}

export function AdminTransactions({ serverUrl, accessToken }: AdminTransactionsProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalCredit: 0,
    totalDebit: 0,
    netRevenue: 0,
    transactionCount: 0,
  });

  useEffect(() => {
    loadTransactions();
    // Auto-refresh every 5 seconds
    const interval = setInterval(loadTransactions, 5000);
    return () => clearInterval(interval);
  }, [dateFilter]);

  useEffect(() => {
    calculateStats();
  }, [transactions]);

  const loadTransactions = async () => {
    try {
      console.log('💰 [ADMIN TRANSACTIONS] Starting to load transactions...');
      console.log('💰 [ADMIN TRANSACTIONS] Server URL:', serverUrl);
      console.log('💰 [ADMIN TRANSACTIONS] Date Filter:', dateFilter);
      
      // ⚡ CRITICAL FIX: Don't duplicate /make-server-c4d79cb7 in URL
      // serverUrl already includes it, so just append /admin/transactions
      const url = `${serverUrl}/admin/transactions?period=${dateFilter}`;
      console.log('💰 [ADMIN TRANSACTIONS] Fetching from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('💰 [ADMIN TRANSACTIONS] Response status:', response.status);
      console.log('💰 [ADMIN TRANSACTIONS] Response ok:', response.ok);

      let mainTxns: any[] = [];
      if (response.ok) {
        const data = await response.json();
        console.log('💰 [ADMIN TRANSACTIONS] Transactions count:', data.transactions?.length || 0);
        mainTxns = data.transactions || [];
      } else {
        const errorText = await response.text();
        console.error('💰 [ADMIN TRANSACTIONS] Response not OK:', errorText);
        loadLocalTransactions();
        return;
      }

      // Merge VPS transactions
      try {
        const vpsRes = await fetch(`${getVpsBackendUrl()}/vps/admin/transactions`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (vpsRes.ok) {
          const vpsData = await vpsRes.json();
          const vpsTxns = (vpsData.transactions || []).map((t: any) => ({ ...t, source: 'vps' }));
          const merged = [...mainTxns, ...vpsTxns].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setTransactions(merged);
        } else {
          setTransactions(mainTxns);
        }
      } catch {
        setTransactions(mainTxns);
      }
    } catch (err: any) {
      console.error('💰 [ADMIN TRANSACTIONS] Error loading transactions from server:', err);
      // Fallback to localStorage
      loadLocalTransactions();
    }
  };

  const loadLocalTransactions = () => {
    const storedTransactions = JSON.parse(localStorage.getItem('wallet_transactions') || '[]');
    console.log('💰 [ADMIN TRANSACTIONS] Loading from localStorage...');
    console.log('💰 [ADMIN TRANSACTIONS] Raw data:', localStorage.getItem('wallet_transactions'));
    console.log('💰 [ADMIN TRANSACTIONS] Parsed transactions:', storedTransactions);
    console.log('💰 [ADMIN TRANSACTIONS] Count:', storedTransactions.length);
    setTransactions(storedTransactions);
  };

  const calculateStats = () => {
    let filtered = [...transactions];

    // Apply date filter
    const now = Date.now();
    switch (dateFilter) {
      case 'today':
        filtered = filtered.filter(t => 
          new Date(t.timestamp).toDateString() === new Date().toDateString()
        );
        break;
      case 'week':
        filtered = filtered.filter(t => 
          now - new Date(t.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
        );
        break;
      case 'month':
        filtered = filtered.filter(t => 
          now - new Date(t.timestamp).getTime() < 30 * 24 * 60 * 60 * 1000
        );
        break;
    }

    const totalCredit = filtered
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalDebit = filtered
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0);

    setStats({
      totalCredit,
      totalDebit,
      netRevenue: totalDebit, // Revenue from fees
      transactionCount: filtered.length,
    });
  };

  const getFilteredTransactions = () => {
    let filtered = transactions;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(t =>
        t.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(t => t.type === filterType);
    }

    // Date filter
    const now = Date.now();
    switch (dateFilter) {
      case 'today':
        filtered = filtered.filter(t => 
          new Date(t.timestamp).toDateString() === new Date().toDateString()
        );
        break;
      case 'week':
        filtered = filtered.filter(t => 
          now - new Date(t.timestamp).getTime() < 7 * 24 * 60 * 60 * 1000
        );
        break;
      case 'month':
        filtered = filtered.filter(t => 
          now - new Date(t.timestamp).getTime() < 30 * 24 * 60 * 60 * 1000
        );
        break;
    }

    return filtered.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  };

  const exportToCSV = () => {
    const filtered = getFilteredTransactions();
    const csv = [
      ['Transaction ID', 'User', 'Type', 'Amount', 'Balance', 'Timestamp', 'Description'].join(','),
      ...filtered.map(t => [
        t.id,
        t.userName,
        t.type.toUpperCase(),
        t.amount,
        t.balance,
        new Date(t.timestamp).toLocaleString(),
        t.description
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${Date.now()}.csv`;
    a.click();
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  // ⚡ TEST HELPER: Create sample transactions for testing
  const createTestTransaction = async () => {
    try {
      console.log('🧪 [TEST] Creating test transaction...');
      
      // Get first user from database
      const usersResponse = await fetch(`${serverUrl}/admin/users`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (!usersResponse.ok) {
        console.error('🧪 [TEST] Failed to fetch users');
        return;
      }
      
      const usersData = await usersResponse.json();
      const users = usersData.users || [];
      
      if (users.length === 0) {
        console.error('🧪 [TEST] No users found in database');
        alert('No users found. Please create a user first.');
        return;
      }
      
      const testUser = users[0];
      console.log('🧪 [TEST] Using user:', testUser.email);
      
      // Create test credit transaction
      const creditResponse = await fetch(`${serverUrl}/admin/users/${testUser.id}/wallet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          action: 'add',
          amount: 500
        })
      });
      
      if (creditResponse.ok) {
        console.log('🧪 [TEST] Credit transaction created successfully!');
        
        // Create test debit transaction
        const debitResponse = await fetch(`${serverUrl}/admin/users/${testUser.id}/wallet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            action: 'subtract',
            amount: 89
          })
        });
        
        if (debitResponse.ok) {
          console.log('🧪 [TEST] Debit transaction created successfully!');
          alert('Test transactions created! Refreshing...');
          loadTransactions();
        }
      } else {
        const errorText = await creditResponse.text();
        console.error('🧪 [TEST] Failed to create transaction:', errorText);
        alert(`Failed to create transaction: ${errorText}`);
      }
    } catch (error) {
      console.error('🧪 [TEST] Error:', error);
      alert(`Error: ${error}`);
    }
  };

  const filteredTransactions = getFilteredTransactions();

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-green-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <ArrowUpCircle className="size-8 text-green-400" />
                <Badge className="bg-green-500/10 text-green-400">Credits</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Total Credits</p>
              <p className="text-2xl font-bold text-white">₹{stats.totalCredit.toLocaleString()}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-red-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <ArrowDownCircle className="size-8 text-red-400" />
                <Badge className="bg-red-500/10 text-red-400">Debits</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Total Debits</p>
              <p className="text-2xl font-bold text-white">₹{stats.totalDebit.toLocaleString()}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-blue-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="size-8 text-blue-400" />
                <Badge className="bg-blue-500/10 text-blue-400">Revenue</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Net Revenue</p>
              <p className="text-2xl font-bold text-white">₹{stats.netRevenue.toLocaleString()}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-purple-500/20 bg-slate-900/50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <DollarSign className="size-8 text-purple-400" />
                <Badge className="bg-purple-500/10 text-purple-400">Count</Badge>
              </div>
              <p className="text-sm text-slate-400 mb-1">Transactions</p>
              <p className="text-2xl font-bold text-white">{stats.transactionCount}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters */}
      <Card className="border-blue-500/20 bg-slate-900/50">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>

            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="credit">Credits Only</SelectItem>
                <SelectItem value="debit">Debits Only</SelectItem>
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

            <Button onClick={exportToCSV} className="bg-blue-600 hover:bg-blue-700">
              <Download className="size-4 mr-2" />
              Export CSV
            </Button>
            
            {/* 🧪 TEST BUTTON - Create sample transactions */}
            <Button onClick={createTestTransaction} className="bg-green-600 hover:bg-green-700">
              <DollarSign className="size-4 mr-2" />
              Create Test Txn
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card className="border-blue-500/20 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <DollarSign className="size-5 text-blue-400" />
            Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredTransactions.map((txn, index) => (
              <motion.div
                key={txn.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-2 rounded-lg ${txn.source === 'vps' ? 'bg-indigo-500/10' : txn.type === 'credit' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {txn.source === 'vps' ? (
                        <Server className="size-5 text-indigo-400" />
                      ) : txn.type === 'credit' ? (
                        <ArrowUpCircle className="size-5 text-green-400" />
                      ) : (
                        <ArrowDownCircle className="size-5 text-red-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white">{txn.userName || txn.userEmail || txn.userId}</p>
                        {txn.source === 'vps' && (
                          <Badge className="text-xs bg-indigo-500/20 text-indigo-300 border-indigo-500/40">Static IP</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {txn.id}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400">{txn.description}</p>
                      {txn.razorpayOrderId && (
                        <p className="text-xs text-blue-400 mt-1">Razorpay: {txn.razorpayOrderId}</p>
                      )}
                      {txn.paymentId && txn.source === 'vps' && (
                        <p className="text-xs text-indigo-400 mt-1">Payment: {txn.paymentId}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${txn.source === 'vps' ? 'text-indigo-400' : txn.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                      {txn.type === 'credit' ? '+' : '-'}₹{txn.amount.toLocaleString()}
                    </p>
                    {typeof txn.balance !== 'undefined' && (
                      <p className="text-sm text-slate-400">Balance: ₹{txn.balance.toLocaleString()}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">{formatDate(txn.timestamp)}</p>
                  </div>
                </div>
              </motion.div>
            ))}

            {filteredTransactions.length === 0 && (
              <div className="text-center py-12">
                <DollarSign className="size-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No transactions found</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}