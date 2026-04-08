import React, { useState } from 'react';
import { getBaseUrl } from '../utils/apiService';
import { Download, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';

interface BacktestPanelProps {
  userId: string;
}

export function BacktestPanel({ userId }: BacktestPanelProps) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [testResult, setTestResult] = useState<any>(null);
  
  const [initialCapital, setInitialCapital] = useState(100000);
  const [quantity, setQuantity] = useState(75);
  
  // Manual candle data input
  const [candleData, setCandleData] = useState<string>('');
  const [manualResult, setManualResult] = useState<any>(null);

  const testManualCandles = async () => {
    console.log('🧪 TESTING MANUAL CANDLE DATA...');
    setLoading(true);
    setError('');
    setManualResult(null);
    
    try {
      // Parse the pasted JSON data
      const parsedData = JSON.parse(candleData);
      
      console.log('✅ Parsed candle data:', {
        open: parsedData.open?.length || 0,
        high: parsedData.high?.length || 0,
        low: parsedData.low?.length || 0,
        close: parsedData.close?.length || 0,
        volume: parsedData.volume?.length || 0,
        timestamp: parsedData.timestamp?.length || 0
      });
      
      // Validate data
      if (!parsedData.open || !parsedData.high || !parsedData.low || !parsedData.close || !parsedData.timestamp) {
        throw new Error('Invalid data format. Need: open, high, low, close, timestamp arrays');
      }
      
      const url = `${getBaseUrl()}/backtest/manual-test`;
      console.log('📡 Calling manual strategy test:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(parsedData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('🧪 Manual strategy result:', data);
      
      setManualResult(data);
      
      if (data.success) {
        // Show detailed results
        alert(
          `✅ STRATEGY TEST COMPLETE!\n\n` +
          `📊 Candles Analyzed: ${data.candles}\n` +
          `📅 Period: ${data.dateRange.start} → ${data.dateRange.end}\n\n` +
          `🎯 SIGNALS:\n` +
          `  • BUY CALL: ${data.signalSummary.buyCallSignals}\n` +
          `  • BUY PUT: ${data.signalSummary.buyPutSignals}\n` +
          `  • WAIT: ${data.signalSummary.waitSignals}\n` +
          `  • Avg Confidence: ${data.signalSummary.avgConfidence.toFixed(1)}%\n\n` +
          `💰 TRADES:\n` +
          `  • Total: ${data.tradeSummary.totalTrades}\n` +
          `  • Winners: ${data.tradeSummary.winningTrades}\n` +
          `  • Losers: ${data.tradeSummary.losingTrades}\n` +
          `  • Win Rate: ${data.tradeSummary.winRate.toFixed(1)}%\n` +
          `  • Total P&L: ₹${data.tradeSummary.totalPnL.toFixed(2)}\n` +
          `  • Avg Win: ₹${data.tradeSummary.avgWin.toFixed(2)}\n` +
          `  • Avg Loss: ₹${data.tradeSummary.avgLoss.toFixed(2)}`
        );
      } else {
        throw new Error(data.error || 'Test failed');
      }
      
    } catch (err: any) {
      console.error('❌ Manual test error:', err);
      setError(err.message);
      alert(`❌ Test failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testDhanAPI = async () => {
    console.log('🧪 TESTING DHAN API...');
    setLoading(true);
    setError('');
    setTestResult(null);
    
    try {
      const url = `${getBaseUrl()}/backtest/test-dhan`;
      console.log('📡 Calling test endpoint:', url);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ userId })
      });
      
      const data = await response.json();
      console.log('🧪 Test result:', data);
      
      setTestResult(data);
      
      if (data.success && data.openLength > 0) {
        alert(`✅ Dhan API Working! Got ${data.openLength} candles`);
      } else {
        alert(`❌ Dhan API Issue: ${JSON.stringify(data, null, 2)}`);
      }
      
    } catch (err: any) {
      console.error('❌ Test error:', err);
      setError(err.message);
      alert(`❌ Test failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = async () => {
    console.log('🔥🔥🔥 FRONTEND: Starting backtest... 🔥🔥🔥');
    console.log('User ID:', userId);
    console.log('Initial Capital:', initialCapital);
    console.log('Quantity:', quantity);
    
    setLoading(true);
    setError('');
    setReport(null);
    
    try {
      const url = `${getBaseUrl()}/backtest/run`;
      console.log('📡 Fetching:', url);
      
      const requestBody = {
        userId,
        initialCapital,
        quantity
      };
      console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log('📥 Response status:', response.status);
      console.log('📥 Response ok:', response.ok);
      
      const data = await response.json();
      console.log('📥 Response data:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Backtest failed');
      }
      
      console.log('✅ Backtest successful!');
      console.log('📊 Summary:', data.summary);
      
      setReport(data);
      
      // Download markdown report
      if (data.markdownReport) {
        console.log('📥 Downloading markdown report...');
        const blob = new Blob([data.markdownReport], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NIFTY_Backtest_Report_${new Date().toISOString().split('T')[0]}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('✅ Report downloaded');
      }
      
    } catch (err: any) {
      console.error('❌❌❌ FRONTEND BACKTEST ERROR ❌❌❌');
      console.error('Error:', err);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);
      
      setError(err.message || 'Failed to run backtest');
    } finally {
      setLoading(false);
      console.log('🏁 Backtest complete (loading=false)');
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-6 h-6 text-blue-500" />
        <h2 className="text-xl text-white">📊 Strategy Backtesting (1 Month)</h2>
      </div>
      
      {/* Configuration */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm text-gray-400 mb-2">Initial Capital (₹)</label>
          <input
            type="number"
            value={initialCapital}
            onChange={(e) => setInitialCapital(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            disabled={loading}
          />
        </div>
        
        <div>
          <label className="block text-sm text-gray-400 mb-2">Quantity</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
            disabled={loading}
          />
        </div>
      </div>
      
      {/* Run Button */}
      <div className="space-y-3">
        {/* Test Dhan API Button */}
        <button
          onClick={testDhanAPI}
          disabled={loading}
          className={`w-full py-2 px-4 rounded-lg font-medium transition-all border ${
            loading
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed border-gray-600'
              : 'bg-gray-800 hover:bg-gray-700 text-yellow-400 border-yellow-500/50 hover:border-yellow-500'
          }`}
        >
          🧪 Test Dhan API (7 days data)
        </button>
        
        {/* Main Backtest Button */}
        <button
          onClick={runBacktest}
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
            loading
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Running Backtest...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Download className="w-5 h-5" />
              Run 1 Week Backtest (5-min candles)
            </span>
          )}
        </button>
      </div>
      
      {/* MANUAL CANDLE DATA INPUT SECTION */}
      <div className="mt-8 p-4 bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-500/30 rounded-lg">
        <div className="text-green-400 font-medium mb-3 flex items-center gap-2">
          📋 Manual Candle Data Input (Copy from Dhan Website)
        </div>
        
        <div className="text-gray-400 text-sm mb-3">
          Paste JSON data with: <code className="text-yellow-400">open, high, low, close, volume, timestamp</code> arrays
        </div>
        
        <textarea
          value={candleData}
          onChange={(e) => setCandleData(e.target.value)}
          placeholder='{"open": [24140.85, ...], "high": [...], "low": [...], "close": [...], "volume": [...], "timestamp": [1733077800, ...]}'
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white font-mono text-xs h-32 mb-3"
          disabled={loading}
        />
        
        <button
          onClick={testManualCandles}
          disabled={loading || !candleData.trim()}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-all ${
            loading || !candleData.trim()
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white'
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              Analyzing...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              🚀 Run Strategy Analysis on Pasted Data
            </span>
          )}
        </button>
      </div>
      
      {/* Manual Test Results */}
      {manualResult && manualResult.success && (
        <div className="mt-6 p-4 bg-green-900/20 border border-green-500/50 rounded-lg">
          <div className="text-green-400 font-medium mb-4">✅ Strategy Analysis Complete!</div>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-800 rounded p-3">
              <div className="text-gray-400 text-xs mb-1">Candles</div>
              <div className="text-white font-bold">{manualResult.candles}</div>
            </div>
            <div className="bg-gray-800 rounded p-3">
              <div className="text-gray-400 text-xs mb-1">Trades</div>
              <div className="text-white font-bold">{manualResult.tradeSummary.totalTrades}</div>
            </div>
            <div className="bg-gray-800 rounded p-3">
              <div className="text-gray-400 text-xs mb-1">Win Rate</div>
              <div className="text-green-400 font-bold">{manualResult.tradeSummary.winRate.toFixed(1)}%</div>
            </div>
            <div className="bg-gray-800 rounded p-3">
              <div className="text-gray-400 text-xs mb-1">Total P&L</div>
              <div className={manualResult.tradeSummary.totalPnL >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                ₹{manualResult.tradeSummary.totalPnL.toFixed(2)}
              </div>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded p-3 mb-3">
            <div className="text-gray-400 text-xs mb-2">Signal Summary:</div>
            <div className="text-sm text-white space-y-1">
              <div>📈 BUY CALL: <span className="text-green-400">{manualResult.signalSummary.buyCallSignals}</span></div>
              <div>📉 BUY PUT: <span className="text-red-400">{manualResult.signalSummary.buyPutSignals}</span></div>
              <div>⏸️ WAIT: <span className="text-gray-400">{manualResult.signalSummary.waitSignals}</span></div>
              <div>🎯 Avg Confidence: <span className="text-yellow-400">{manualResult.signalSummary.avgConfidence.toFixed(1)}%</span></div>
            </div>
          </div>
          
          <details className="bg-gray-800 rounded p-3">
            <summary className="text-yellow-400 cursor-pointer text-sm">📋 View All Trades ({manualResult.allTrades.length})</summary>
            <div className="mt-3 max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-gray-400">
                  <tr>
                    <th className="text-left p-1">Entry</th>
                    <th className="text-left p-1">Exit</th>
                    <th className="text-left p-1">Action</th>
                    <th className="text-right p-1">P&L</th>
                  </tr>
                </thead>
                <tbody className="text-white">
                  {manualResult.allTrades.map((trade: any, idx: number) => (
                    <tr key={idx} className="border-t border-gray-700">
                      <td className="p-1">{trade.entryTime}</td>
                      <td className="p-1">{trade.exitTime}</td>
                      <td className="p-1">
                        <span className={trade.entry === 'BUY_CALL' ? 'text-green-400' : 'text-red-400'}>
                          {trade.entry}
                        </span>
                      </td>
                      <td className={`p-1 text-right ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ₹{trade.pnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
      
      {/* Test Result Debug */}
      {testResult && (
        <div className="mt-4 p-4 bg-gray-800 border border-gray-700 rounded-lg">
          <div className="text-white text-sm mb-2">🧪 Test Result:</div>
          <pre className="text-xs text-gray-300 overflow-auto max-h-48">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        </div>
      )}
      
      {/* Error */}
      {error && (
        <div className="mt-4 p-4 bg-red-900/30 border border-red-500/50 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
      
      {/* Results Summary */}
      {report && report.summary && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2 text-green-400">
            <Download className="w-5 h-5" />
            <span>Report downloaded successfully!</span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Total Trades */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">Total Trades</div>
              <div className="text-white text-2xl font-bold">{report.summary.trades}</div>
            </div>
            
            {/* Win Rate */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">Win Rate</div>
              <div className="text-white text-2xl font-bold">{report.summary.winRate.toFixed(1)}%</div>
            </div>
            
            {/* Net P&L */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">Net P&L</div>
              <div className={`text-2xl font-bold flex items-center gap-2 ${
                report.summary.netPnL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {report.summary.netPnL >= 0 ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
                ₹{Math.abs(report.summary.netPnL).toLocaleString('en-IN')}
              </div>
            </div>
            
            {/* ROI */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <div className="text-gray-400 text-sm mb-1">ROI</div>
              <div className={`text-2xl font-bold ${
                report.summary.roi >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {report.summary.roi >= 0 ? '+' : ''}{report.summary.roi.toFixed(2)}%
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg">
            <p className="text-blue-300 text-sm">
              ✅ Full detailed report has been downloaded as a Markdown file. 
              Open it to see daily/weekly/monthly breakdowns, all trades, and options comparison!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}