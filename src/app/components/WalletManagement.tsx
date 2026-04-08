import React, { useState, useEffect } from 'react';
import { getBaseUrl } from '../utils/apiService';
import { Wallet, CreditCard, TrendingUp, AlertCircle, ArrowUpRight, CheckCircle, X, Server } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { supabase } from '../../../utils/supabase/client';
import { getVpsBackendUrl } from '../../../utils/config/apiConfig';

interface WalletManagementProps {
  onClose: () => void;
}

export default function WalletManagement({ onClose }: WalletManagementProps) {
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recharging, setRecharging] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [error, setError] = useState('');

  const serverUrl = getBaseUrl();

  useEffect(() => {
    fetchWalletData();
  }, []);

  const fetchWalletData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Please login to view wallet');
        return;
      }

      console.log('💰 [WALLET] Fetching wallet data...');

      // Fetch wallet balance
      const balanceResponse = await fetch(`${serverUrl}/wallet/balance`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const balanceData = await balanceResponse.json();
      console.log('💰 [WALLET] Balance response:', balanceData);
      if (balanceData.success) {
        setWalletBalance(balanceData.balance);
      }

      // Fetch transaction history
      const txnResponse = await fetch(`${serverUrl}/wallet/transactions`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const txnData = await txnResponse.json();
      console.log('💰 [WALLET] Transactions response:', txnData);
      console.log('💰 [WALLET] Transactions count:', txnData.transactions?.length || 0);
      console.log('💰 [WALLET] Transactions data:', JSON.stringify(txnData.transactions, null, 2));
      
      let walletTxns: any[] = [];
      if (txnData.success) {
        walletTxns = txnData.transactions || [];
        console.log('✅ [WALLET] Transactions loaded:', walletTxns.length);
      }

      // Fetch VPS transactions and merge
      try {
        const vpsTxnRes = await fetch(`${getVpsBackendUrl()}/vps/transactions`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'x-user-id': session.user.id,
            'x-user-email': session.user.email || '',
          },
        });
        if (vpsTxnRes.ok) {
          const vpsTxnData = await vpsTxnRes.json();
          const vpsTxns = (vpsTxnData.transactions || []).map((t: any) => ({ ...t, source: 'vps' }));
          const merged = [...walletTxns, ...vpsTxns].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setTransactions(merged);
        } else {
          setTransactions(walletTxns);
        }
      } catch {
        setTransactions(walletTxns);
      }
    } catch (err: any) {
      console.error('Failed to fetch wallet data:', err);
      setError('Failed to load wallet data');
    } finally {
      setLoading(false);
    }
  };

  const handleRecharge = async () => {
    const amount = parseFloat(rechargeAmount);
    
    if (!amount || amount < 100) {
      setError('Minimum recharge amount is ₹100');
      return;
    }

    if (amount > 50000) {
      setError('Maximum recharge amount is ₹50,000');
      return;
    }

    setRecharging(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please login to recharge');
      }

      // Create Razorpay order
      const orderResponse = await fetch(`${serverUrl}/wallet/create-recharge-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });

      const orderData = await orderResponse.json();
      
      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to create order');
      }

      // Load Razorpay SDK
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);

      script.onload = () => {
        const options = {
          key: orderData.razorpayKeyId,
          amount: orderData.order.amount,
          currency: 'INR',
          name: 'IndexpilotAI',
          description: 'Wallet Recharge',
          order_id: orderData.order.id,
          handler: async (response: any) => {
            // Verify payment
            const verifyResponse = await fetch(`${serverUrl}/wallet/verify-payment`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyResponse.json();
            
            if (verifyData.success) {
              setRechargeAmount('');
              await fetchWalletData();
              alert('Wallet recharged successfully!');
            } else {
              setError('Payment verification failed');
            }
            setRecharging(false);
          },
          prefill: {
            name: session.user.user_metadata?.name || '',
            email: session.user.email || '',
            contact: session.user.user_metadata?.phone || '',
          },
          theme: {
            color: '#3B82F6',
          },
          modal: {
            ondismiss: () => {
              setRecharging(false);
            },
          },
        };

        const razorpay = new (window as any).Razorpay(options);
        razorpay.open();
      };
    } catch (err: any) {
      console.error('Recharge error:', err);
      setError(err.message || 'Failed to process recharge');
      setRecharging(false);
    }
  };

  const quickAmounts = [500, 1000, 2000, 5000];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-800 border-b border-slate-700 p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Wallet Management</h2>
              <p className="text-sm text-slate-400">Recharge & track transactions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center space-x-2 text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Transaction History - MOVED TO TOP */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span>Recent Transactions</span>
            </h3>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {loading ? (
                <div className="text-center py-8 text-slate-400">Loading transactions...</div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Wallet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No transactions yet</p>
                  <p className="text-xs mt-1">Recharge your wallet to get started</p>
                </div>
              ) : (
                transactions.slice(0, 15).map((txn, index) => (
                  <div
                    key={txn.id || index}
                    className={`p-3 rounded-lg border flex items-center justify-between transition-all hover:shadow-md ${
                      txn.source === 'vps'
                        ? 'bg-indigo-500/5 border-indigo-500/20 hover:bg-indigo-500/10'
                        : txn.type === 'credit' 
                        ? 'bg-green-500/5 border-green-500/20 hover:bg-green-500/10' 
                        : 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                    }`}
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        txn.source === 'vps' ? 'bg-indigo-500/20' : txn.type === 'credit' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {txn.source === 'vps' ? (
                          <Server className="w-5 h-5 text-indigo-400" />
                        ) : (
                          <ArrowUpRight className={`w-5 h-5 ${
                            txn.type === 'credit' ? 'text-green-400' : 'text-red-400 rotate-180'
                          }`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium text-sm truncate">
                            {txn.description || (txn.type === 'credit' ? 'Wallet Recharge' : 'Tier Fee Deduction')}
                          </p>
                          {txn.source === 'vps' && (
                            <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded shrink-0">Static IP</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {txn.timestamp ? new Date(txn.timestamp).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'N/A'}
                        </p>
                        {txn.tier && (
                          <p className="text-xs text-amber-400 mt-0.5">Tier: {txn.tier}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <div className={`text-lg font-bold ${
                        txn.source === 'vps' ? 'text-indigo-400' : txn.type === 'credit' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {txn.type === 'credit' ? '+' : '-'}₹{Math.abs(txn.amount || 0).toFixed(2)}
                      </div>
                      {typeof txn.balance !== 'undefined' && (
                        <p className="text-xs text-slate-500">Bal: ₹{txn.balance.toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Wallet Balance Card */}
          <div className="bg-gradient-to-br from-blue-600 to-purple-700 p-6 rounded-xl shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-blue-100 text-sm mb-1">Current Balance</p>
                <p className="text-4xl font-bold text-white">
                  ₹{loading ? '...' : walletBalance.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <Wallet className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="flex items-center space-x-2 text-blue-100 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>Tiered pricing active (₹0-89 based on profit)</span>
            </div>
          </div>

          {/* Recharge Section */}
          <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <CreditCard className="w-5 h-5 text-blue-400" />
              <span>Recharge Wallet</span>
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">Amount (₹)</label>
                <input
                  type="number"
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="Enter amount"
                  min="100"
                  max="50000"
                />
                <p className="text-xs text-slate-500 mt-1">Min: ₹100 | Max: ₹50,000</p>
              </div>

              {/* Quick Amount Buttons */}
              <div>
                <p className="text-sm text-slate-400 mb-2">Quick select:</p>
                <div className="grid grid-cols-4 gap-2">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setRechargeAmount(amt.toString())}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-blue-500 rounded-lg text-white transition-all text-sm font-medium"
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleRecharge}
                disabled={recharging || !rechargeAmount}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/30 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <CreditCard className="w-5 h-5" />
                <span>{recharging ? 'Processing...' : 'Recharge via Razorpay'}</span>
              </button>

              <div className="flex items-center justify-center space-x-4 text-xs text-slate-500">
                <span>UPI</span>
                <span>•</span>
                <span>Cards</span>
                <span>•</span>
                <span>Net Banking</span>
                <span>•</span>
                <span>Wallets</span>
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-semibold mb-1">Tiered Pricing Model:</p>
                <ul className="space-y-1 text-blue-200">
                  <li>• ₹0-100: <strong className="text-green-400">FREE</strong></li>
                  <li>• ₹101-500: <strong>₹29</strong> auto-deducted</li>
                  <li>• ₹501-1K: <strong>₹49</strong> auto-deducted</li>
                  <li>• ₹1K-2K: <strong>₹69</strong> auto-deducted</li>
                  <li>• ₹2K+: <strong>₹89</strong> auto-deducted</li>
                  <li className="text-xs text-blue-300 mt-2">✓ Pay only the difference as you move up tiers</li>
                  <li className="text-xs text-blue-300">✓ Resets daily - Only charged on profitable days!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}