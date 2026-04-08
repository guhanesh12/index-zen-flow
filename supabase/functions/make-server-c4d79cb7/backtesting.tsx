/**
 * 📊 BACKTESTING MODULE - NIFTY 1 YEAR ANALYSIS
 * 
 * Fetches real historical data and tests the Advanced AI strategy
 * Generates detailed performance reports without disrupting live trading
 */

import { AdvancedAI, OHLCCandle, AdvancedSignal } from './advanced_ai.tsx';

export interface BacktestTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  action: 'BUY_CALL' | 'BUY_PUT';
  quantity: number;
  profitLoss: number;
  confidence: number;
  reasoning: string;
  holdingPeriod: number; // minutes
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  netPnL: number;
  averageWin: number;
  averageLoss: number;
  largestWin: number;
  largestLoss: number;
  profitFactor: number; // Total profit / Total loss
  expectancy: number; // Average profit per trade
  returnOnInvestment: number; // Percentage
}

export interface PeriodPerformance {
  period: string; // "Daily", "Weekly", "Monthly", "Yearly"
  date: string;
  trades: BacktestTrade[];
  metrics: BacktestMetrics;
  startingCapital: number;
  endingCapital: number;
}

export interface BacktestReport {
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  
  // Overall metrics
  overall: BacktestMetrics;
  
  // Period breakdown
  daily: PeriodPerformance[];
  weekly: PeriodPerformance[];
  monthly: PeriodPerformance[];
  yearly: PeriodPerformance[];
  
  // Index futures vs Options comparison
  futuresAnalysis: {
    quantity: number;
    totalPnL: number;
    roi: number;
  };
  
  optionsAnalysis: {
    estimatedPremium: number; // Estimated option premium per point
    estimatedPnL: number;
    estimatedROI: number;
    notes: string;
  };
  
  // All trades
  allTrades: BacktestTrade[];
  
  executionTime: number;
}

export class BacktestEngine {
  
  /**
   * Fetch 1 year of NIFTY data from Dhan API
   */
  static async fetchNiftyData(
    accessToken: string,
    clientId: string
  ): Promise<OHLCCandle[]> {
    console.log('📊 Fetching NIFTY FUTURES data from Dhan API...');
    
    // NIFTY 50 FUTURES (Current month contract)
    // Security ID for NIFTY futures - this changes monthly, so we use NSE_FNO segment
    const NIFTY_SECURITY_ID = '25';  // NIFTY 50 index for futures
    const EXCHANGE_SEGMENT = 'NSE_FNO'; // Futures & Options segment
    
    // Calculate date range (7 DAYS for 5-minute candles)
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7); // 7 days back
    
    // Format as YYYY-MM-DD
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const fromDateStr = formatDate(fromDate);
    const toDateStr = formatDate(toDate);
    
    console.log(`📅 Date range: ${fromDateStr} to ${toDateStr}`);
    console.log('🔄 Trying NIFTY FUTURES for 5-minute intraday data...');
    
    // Request body for Dhan API
    const requestBody = {
      securityId: NIFTY_SECURITY_ID,
      exchangeSegment: EXCHANGE_SEGMENT,
      instrument: 'FUTIDX', // Futures Index
      interval: '5', // 5-minute candles
      fromDate: fromDateStr,
      toDate: toDateStr
    };
    
    console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
    console.log('📤 Headers:', {
      'Content-Type': 'application/json',
      'access-token': accessToken ? `${accessToken.substring(0, 10)}...` : 'missing'
    });
    
    try {
      // Fetch historical data
      console.log('🌐 Calling Dhan API: https://api.dhan.co/v2/charts/historical');
      const response = await fetch('https://api.dhan.co/v2/charts/historical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access-token': accessToken
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log(`📥 Dhan API Response Status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error Response:', errorText);
        throw new Error(`Dhan API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('📥 Response structure:', JSON.stringify(data, null, 2).substring(0, 500) + '...');
      
      // Debug: Check response structure
      if (!data) {
        throw new Error('No data received from Dhan API');
      }
      
      console.log('📊 Response keys:', Object.keys(data));
      console.log('📊 Data field:', data.data ? 'exists' : 'missing');
      
      // Check all possible timestamp field names
      const timestampFields = ['timestamp', 'start_time', 'time', 'date', 'datetime'];
      let foundTimestampField = '';
      for (const field of timestampFields) {
        if (data[field]) {
          foundTimestampField = field;
          console.log(`✅ Found timestamp field: "${field}"`);
          if (Array.isArray(data[field])) {
            console.log(`📊 First timestamp value: ${data[field][0]}`);
            console.log(`📊 Last timestamp value: ${data[field][data[field].length - 1]}`);
          }
          break;
        }
      }
      
      if (!foundTimestampField) {
        console.log('⚠️ No timestamp field found in response. Will estimate timestamps.');
      }
      
      // Dhan API returns columnar data format
      // Response has: { open: [], high: [], low: [], close: [], volume: [], timestamp: [] }
      let candles: OHLCCandle[] = [];
      
      // Check if data has the columnar format
      if (data.open && data.high && data.low && data.close && Array.isArray(data.open)) {
        console.log('✅ Found columnar data format');
        console.log(`📊 Number of candles: ${data.open.length}`);
        
        const length = data.open.length;
        
        // Start from the fromDate and add 5 minutes for each candle
        const startTimestamp = new Date(fromDateStr + 'T09:15:00+05:30').getTime(); // Market opens at 9:15 AM IST
        console.log(`📅 Starting from: ${new Date(startTimestamp).toLocaleString('en-IN')}`);
        
        // Convert columnar format to array of candles
        for (let i = 0; i < length; i++) {
          // Try to get timestamp from response
          let timestamp: number;
          
          if (foundTimestampField && data[foundTimestampField][i]) {
            const tsValue = data[foundTimestampField][i];
            
            // Check if it's already a number (Unix timestamp)
            if (typeof tsValue === 'number') {
              // If it's in seconds, convert to milliseconds
              timestamp = tsValue > 10000000000 ? tsValue : tsValue * 1000;
            } else {
              // Parse as date string
              timestamp = new Date(tsValue).getTime();
            }
          } else {
            // Estimate timestamp based on 5-minute intervals
            // Skip weekends and non-trading hours
            timestamp = startTimestamp + (i * 5 * 60 * 1000); // 5 minutes per candle
          }
          
          candles.push({
            timestamp,
            open: data.open[i],
            high: data.high[i],
            low: data.low[i],
            close: data.close[i],
            volume: data.volume ? data.volume[i] : 0
          });
        }
        
        console.log(`✅ Converted ${candles.length} candles from columnar format`);
        console.log(`📅 First candle timestamp: ${candles[0].timestamp} = ${new Date(candles[0].timestamp).toLocaleString('en-IN')}`);
        console.log(`📅 Last candle timestamp: ${candles[candles.length - 1].timestamp} = ${new Date(candles[candles.length - 1].timestamp).toLocaleString('en-IN')}`);
      } else if (data.data && data.data.candles) {
        console.log('✅ Found candles in data.data.candles');
        candles = data.data.candles;
      } else if (data.candles) {
        console.log('✅ Found candles in data.candles');
        candles = data.candles;
      } else if (Array.isArray(data.data)) {
        console.log('✅ Found candles as data array');
        candles = data.data;
      } else if (Array.isArray(data)) {
        console.log('✅ Found candles as root array');
        candles = data;
      } else {
        console.error('❌ Unexpected response format:', JSON.stringify(data, null, 2).substring(0, 500));
        throw new Error('No candle data received from Dhan API');
      }
      
      if (!candles || candles.length === 0) {
        console.error('❌ Empty candles array');
        throw new Error('No candle data received from Dhan API');
      }
      
      // Convert Dhan format to OHLCCandle format (if not already done)
      const convertedCandles: OHLCCandle[] = candles.map((candle: any, index: number) => {
        // If already in correct format (from columnar conversion)
        if (candle.timestamp && candle.open && candle.high && candle.low && candle.close) {
          return candle as OHLCCandle;
        }
        
        // Otherwise convert from object format
        return {
          timestamp: new Date(candle.timestamp || candle.time || candle.date).getTime(),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume || 0
        };
      });
      
      console.log(`✅ Fetched ${convertedCandles.length} candles`);
      console.log(`📅 First candle: ${new Date(convertedCandles[0].timestamp).toLocaleString('en-IN')}`);
      console.log(`📅 Last candle: ${new Date(convertedCandles[convertedCandles.length - 1].timestamp).toLocaleString('en-IN')}`);
      
      return convertedCandles;
      
    } catch (error) {
      console.error('❌ Error fetching Dhan data:', error);
      throw error;
    }
  }
  
  /**
   * Calculate metrics from trades
   */
  static calculateMetrics(trades: BacktestTrade[], initialCapital: number): BacktestMetrics {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalProfit: 0,
        totalLoss: 0,
        netPnL: 0,
        averageWin: 0,
        averageLoss: 0,
        largestWin: 0,
        largestLoss: 0,
        profitFactor: 0,
        expectancy: 0,
        returnOnInvestment: 0
      };
    }
    
    const winningTrades = trades.filter(t => t.profitLoss > 0);
    const losingTrades = trades.filter(t => t.profitLoss < 0);
    
    const totalProfit = winningTrades.reduce((sum, t) => sum + t.profitLoss, 0);
    const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.profitLoss, 0));
    const netPnL = totalProfit - totalLoss;
    
    const averageWin = winningTrades.length > 0 ? totalProfit / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? totalLoss / losingTrades.length : 0;
    
    const largestWin = winningTrades.length > 0 ? Math.max(...winningTrades.map(t => t.profitLoss)) : 0;
    const largestLoss = losingTrades.length > 0 ? Math.min(...losingTrades.map(t => t.profitLoss)) : 0;
    
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 0;
    const expectancy = netPnL / trades.length;
    const roi = (netPnL / initialCapital) * 100;
    
    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: (winningTrades.length / trades.length) * 100,
      totalProfit,
      totalLoss,
      netPnL,
      averageWin,
      averageLoss,
      largestWin,
      largestLoss,
      profitFactor,
      expectancy,
      returnOnInvestment: roi
    };
  }
  
  /**
   * Group trades by period
   */
  static groupTradesByPeriod(
    trades: BacktestTrade[],
    period: 'daily' | 'weekly' | 'monthly' | 'yearly',
    initialCapital: number
  ): PeriodPerformance[] {
    const groups = new Map<string, BacktestTrade[]>();
    
    for (const trade of trades) {
      const date = new Date(trade.entryTime);
      let key: string;
      
      switch (period) {
        case 'daily':
          key = date.toISOString().split('T')[0]; // YYYY-MM-DD
          break;
        case 'weekly':
          const weekNum = this.getWeekNumber(date);
          key = `${date.getFullYear()}-W${weekNum}`;
          break;
        case 'monthly':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        case 'yearly':
          key = `${date.getFullYear()}`;
          break;
      }
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(trade);
    }
    
    // Convert to PeriodPerformance array
    const performances: PeriodPerformance[] = [];
    let runningCapital = initialCapital;
    
    for (const [key, periodTrades] of Array.from(groups.entries()).sort()) {
      const metrics = this.calculateMetrics(periodTrades, runningCapital);
      const startingCapital = runningCapital;
      const endingCapital = runningCapital + metrics.netPnL;
      
      performances.push({
        period: period.charAt(0).toUpperCase() + period.slice(1),
        date: key,
        trades: periodTrades,
        metrics,
        startingCapital,
        endingCapital
      });
      
      runningCapital = endingCapital;
    }
    
    return performances;
  }
  
  /**
   * Get ISO week number
   */
  static getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
  
  /**
   * Run full backtest
   */
  static async runBacktest(
    accessToken: string,
    clientId: string,
    initialCapital: number = 100000,
    quantity: number = 75
  ): Promise<BacktestReport> {
    const startTime = performance.now();
    
    console.log('🚀🚀🚀 BACKTEST ENGINE START 🚀🚀🚀');
    console.log(`💰 Capital: ₹${initialCapital}, Quantity: ${quantity}`);
    
    try {
      // Fetch NIFTY data
      console.log('📊 Step 1: Fetching NIFTY data...');
      const candles = await this.fetchNiftyData(accessToken, clientId);
      
      console.log(`✅ Fetched ${candles.length} candles from Dhan API`);
      
      if (candles.length === 0) {
        console.error('❌❌❌ NO CANDLES FETCHED! ❌❌❌');
        throw new Error('No candle data received from Dhan API. Please check your connection and try again.');
      }
      
      console.log(`📅 Date range: ${new Date(candles[0].timestamp).toLocaleString('en-IN')} to ${new Date(candles[candles.length - 1].timestamp).toLocaleString('en-IN')}`);
      
      // Step 2: Run strategy on historical data
      const trades: BacktestTrade[] = [];
      let currentPosition: BacktestTrade | null = null;
      
      // We need at least 200 candles for EMA200
      const minCandles = 200;
      
      console.log(`🔍 Starting analysis from candle ${minCandles} to ${candles.length}...`);
      
      // Test first few candles to see what signals are generated
      console.log('\n🧪 Testing first few signals:');
      for (let testIdx = minCandles; testIdx < Math.min(minCandles + 5, candles.length); testIdx++) {
        const testWindow = candles.slice(Math.max(0, testIdx - 200), testIdx + 1);
        const testSignal = AdvancedAI.generateAdvancedSignal(testWindow, initialCapital);
        const testCandle = candles[testIdx];
        console.log(`Candle ${testIdx}: Date=${new Date(testCandle.timestamp).toLocaleString('en-IN')}, Close=${testCandle.close}, Signal=${testSignal.action}, Confidence=${testSignal.confidence}%, Bias=${testSignal.bias}`);
      }
      console.log('');
      
      let signalCount = { BUY_CALL: 0, BUY_PUT: 0, WAIT: 0 };
      
      for (let i = minCandles; i < candles.length; i++) {
        // Get candle window for analysis
        const candleWindow = candles.slice(Math.max(0, i - 200), i + 1);
        
        // Validate candle window has proper data
        if (candleWindow.length < 50) {
          console.warn(`⚠️ Candle window too small at index ${i}: ${candleWindow.length} candles`);
          continue;
        }
        
        // Check if candles have valid data
        const lastCandle = candleWindow[candleWindow.length - 1];
        if (!lastCandle || !lastCandle.open || !lastCandle.close) {
          console.warn(`⚠️ Invalid candle data at index ${i}`);
          continue;
        }
        
        // Generate signal
        const signal: AdvancedSignal = AdvancedAI.generateAdvancedSignal(candleWindow, initialCapital);
        
        // Count signals for debugging
        signalCount[signal.action]++;
        
        // Log first BUY signal we find
        if ((signal.action === 'BUY_CALL' || signal.action === 'BUY_PUT') && trades.length === 0 && !currentPosition) {
          console.log(`\n🎯 First BUY signal found at candle ${i}:`);
          console.log(`   Date: ${new Date(lastCandle.timestamp).toLocaleString('en-IN')}`);
          console.log(`   Action: ${signal.action}`);
          console.log(`   Confidence: ${signal.confidence}%`);
          console.log(`   Market Bias: ${signal.bias}`);
          console.log(`   Reasoning: ${signal.reasoning}`);
          console.log(`   Price: ${lastCandle.close}\n`);
        }
        
        // Log every 1000 candles
        if (i % 1000 === 0) {
          console.log(`📊 Processed ${i}/${candles.length} candles | Signals: ${JSON.stringify(signalCount)} | Trades: ${trades.length} | Current Position: ${currentPosition ? 'YES' : 'NO'}`);
        }
        
        const currentCandle = candles[i];
        
        // If we have a position, check for exit
        if (currentPosition) {
          // Exit conditions:
          // 1. Opposite signal
          // 2. Stop loss hit
          // 3. Target hit
          // 4. Hold for max 5 candles (25 minutes for 5min candles)
          
          const holdingPeriod = i - trades.indexOf(currentPosition);
          const currentPnL = currentPosition.action === 'BUY_CALL'
            ? (currentCandle.close - currentPosition.entryPrice) * quantity
            : (currentPosition.entryPrice - currentCandle.close) * quantity;
          
          const shouldExit = 
            (signal.action === 'BUY_PUT' && currentPosition.action === 'BUY_CALL') ||
            (signal.action === 'BUY_CALL' && currentPosition.action === 'BUY_PUT') ||
            holdingPeriod >= 5; // Exit after 5 candles
          
          if (shouldExit) {
            // Close position
            currentPosition.exitTime = currentCandle.timestamp;
            currentPosition.exitPrice = currentCandle.close;
            currentPosition.profitLoss = currentPnL;
            currentPosition.holdingPeriod = holdingPeriod * 5; // 5 minutes per candle
            
            trades.push(currentPosition);
            currentPosition = null;
          }
        }
        
        // If no position and we have a BUY signal, open position
        if (!currentPosition && (signal.action === 'BUY_CALL' || signal.action === 'BUY_PUT')) {
          currentPosition = {
            entryTime: currentCandle.timestamp,
            entryPrice: currentCandle.close,
            exitTime: 0,
            exitPrice: 0,
            action: signal.action,
            quantity,
            profitLoss: 0,
            confidence: signal.confidence,
            reasoning: signal.reasoning,
            holdingPeriod: 0
          };
        }
      }
      
      // Close any open position at the end
      if (currentPosition) {
        const lastCandle = candles[candles.length - 1];
        const finalPnL = currentPosition.action === 'BUY_CALL'
          ? (lastCandle.close - currentPosition.entryPrice) * quantity
          : (currentPosition.entryPrice - lastCandle.close) * quantity;
        
        currentPosition.exitTime = lastCandle.timestamp;
        currentPosition.exitPrice = lastCandle.close;
        currentPosition.profitLoss = finalPnL;
        currentPosition.holdingPeriod = 5 * 5; // Estimate
        
        trades.push(currentPosition);
      }
      
      console.log(`✅ Backtest complete!`);
      console.log(`📊 Final Signal Counts: ${JSON.stringify(signalCount)}`);
      console.log(`📊 Total Trades Generated: ${trades.length}`);
      
      // Step 3: Calculate metrics
      const overallMetrics = this.calculateMetrics(trades, initialCapital);
      const finalCapital = initialCapital + overallMetrics.netPnL;
      
      // Step 4: Group by periods
      const dailyPerformance = this.groupTradesByPeriod(trades, 'daily', initialCapital);
      const weeklyPerformance = this.groupTradesByPeriod(trades, 'weekly', initialCapital);
      const monthlyPerformance = this.groupTradesByPeriod(trades, 'monthly', initialCapital);
      const yearlyPerformance = this.groupTradesByPeriod(trades, 'yearly', initialCapital);
      
      // Step 5: Options analysis (estimated)
      // For index options, approximate premium multiplier based on ATR
      // Typical NIFTY option: ₹50-150 premium for ATM
      // Each point movement = ₹1 in futures, but ₹75-100 in options (lot size)
      const avgProfitPerTrade = overallMetrics.expectancy;
      const optionMultiplier = 50; // Conservative estimate for NIFTY options
      const estimatedOptionPnL = overallMetrics.netPnL * (optionMultiplier / quantity);
      const estimatedOptionROI = (estimatedOptionPnL / initialCapital) * 100;
      
      const executionTime = performance.now() - startTime;
      
      const report: BacktestReport = {
        startDate: new Date(candles[0].timestamp).toISOString(),
        endDate: new Date(candles[candles.length - 1].timestamp).toISOString(),
        initialCapital,
        finalCapital,
        
        overall: overallMetrics,
        
        daily: dailyPerformance,
        weekly: weeklyPerformance,
        monthly: monthlyPerformance,
        yearly: yearlyPerformance,
        
        futuresAnalysis: {
          quantity,
          totalPnL: overallMetrics.netPnL,
          roi: overallMetrics.returnOnInvestment
        },
        
        optionsAnalysis: {
          estimatedPremium: optionMultiplier,
          estimatedPnL: estimatedOptionPnL,
          estimatedROI: estimatedOptionROI,
          notes: 'Options P&L is estimated. Actual results depend on strike selection, IV, and time decay.'
        },
        
        allTrades: trades,
        executionTime
      };
      
      return report;
      
    } catch (error) {
      console.error('❌❌❌ BACKTEST FAILED ❌❌❌:', error);
      throw error;
    }
  }
  
  /**
   * Generate Markdown report
   */
  static generateMarkdownReport(report: BacktestReport): string {
    const md: string[] = [];
    
    md.push('# 📊 NIFTY BACKTEST REPORT - 1 YEAR ANALYSIS');
    md.push('## Advanced AI Strategy Performance\n');
    md.push('---\n');
    
    // Summary
    md.push('## 🎯 EXECUTIVE SUMMARY\n');
    md.push(`- **Period:** ${new Date(report.startDate).toLocaleDateString('en-IN')} to ${new Date(report.endDate).toLocaleDateString('en-IN')}`);
    md.push(`- **Initial Capital:** ₹${report.initialCapital.toLocaleString('en-IN')}`);
    md.push(`- **Final Capital:** ₹${report.finalCapital.toLocaleString('en-IN')}`);
    md.push(`- **Net P&L:** ₹${report.overall.netPnL.toLocaleString('en-IN')} (${report.overall.netPnL >= 0 ? '✅ Profit' : '❌ Loss'})`);
    md.push(`- **ROI:** ${report.overall.returnOnInvestment.toFixed(2)}%`);
    md.push(`- **Total Trades:** ${report.overall.totalTrades}`);
    md.push(`- **Win Rate:** ${report.overall.winRate.toFixed(2)}%\n`);
    md.push('---\n');
    
    // Overall Performance
    md.push('## 📈 OVERALL PERFORMANCE\n');
    md.push('| Metric | Value |');
    md.push('|--------|-------|');
    md.push(`| Total Trades | ${report.overall.totalTrades} |`);
    md.push(`| Winning Trades | ${report.overall.winningTrades} (${report.overall.winRate.toFixed(1)}%) |`);
    md.push(`| Losing Trades | ${report.overall.losingTrades} (${(100 - report.overall.winRate).toFixed(1)}%) |`);
    md.push(`| Total Profit | ₹${report.overall.totalProfit.toLocaleString('en-IN')} |`);
    md.push(`| Total Loss | ₹${report.overall.totalLoss.toLocaleString('en-IN')} |`);
    md.push(`| Net P&L | ₹${report.overall.netPnL.toLocaleString('en-IN')} |`);
    md.push(`| Average Win | ₹${report.overall.averageWin.toLocaleString('en-IN')} |`);
    md.push(`| Average Loss | ₹${report.overall.averageLoss.toLocaleString('en-IN')} |`);
    md.push(`| Largest Win | ₹${report.overall.largestWin.toLocaleString('en-IN')} |`);
    md.push(`| Largest Loss | ₹${report.overall.largestLoss.toLocaleString('en-IN')} |`);
    md.push(`| Profit Factor | ${report.overall.profitFactor.toFixed(2)} |`);
    md.push(`| Expectancy | ₹${report.overall.expectancy.toLocaleString('en-IN')} per trade |`);
    md.push(`| ROI | ${report.overall.returnOnInvestment.toFixed(2)}% |\n`);
    md.push('---\n');
    
    // Yearly breakdown
    md.push('## 📅 YEARLY PERFORMANCE\n');
    md.push('| Year | Trades | Win Rate | Net P&L | ROI | Starting Capital | Ending Capital |');
    md.push('|------|--------|----------|---------|-----|------------------|----------------|');
    for (const year of report.yearly) {
      md.push(`| ${year.date} | ${year.metrics.totalTrades} | ${year.metrics.winRate.toFixed(1)}% | ₹${year.metrics.netPnL.toLocaleString('en-IN')} | ${year.metrics.returnOnInvestment.toFixed(2)}% | ₹${year.startingCapital.toLocaleString('en-IN')} | ₹${year.endingCapital.toLocaleString('en-IN')} |`);
    }
    md.push('\n---\n');
    
    // Monthly breakdown
    md.push('## 📅 MONTHLY PERFORMANCE\n');
    md.push('| Month | Trades | Win Rate | Net P&L | ROI |');
    md.push('|-------|--------|----------|---------|-----|');
    for (const month of report.monthly) {
      md.push(`| ${month.date} | ${month.metrics.totalTrades} | ${month.metrics.winRate.toFixed(1)}% | ₹${month.metrics.netPnL.toLocaleString('en-IN')} | ${month.metrics.returnOnInvestment.toFixed(2)}% |`);
    }
    md.push('\n---\n');
    
    // Weekly summary (top 5 best and worst)
    md.push('## 📅 WEEKLY PERFORMANCE (Sample)\n');
    md.push('### Top 5 Best Weeks:\n');
    md.push('| Week | Trades | Win Rate | Net P&L |');
    md.push('|------|--------|----------|---------|');
    const sortedWeeks = [...report.weekly].sort((a, b) => b.metrics.netPnL - a.metrics.netPnL);
    for (const week of sortedWeeks.slice(0, 5)) {
      md.push(`| ${week.date} | ${week.metrics.totalTrades} | ${week.metrics.winRate.toFixed(1)}% | ₹${week.metrics.netPnL.toLocaleString('en-IN')} |`);
    }
    
    md.push('\n### Top 5 Worst Weeks:\n');
    md.push('| Week | Trades | Win Rate | Net P&L |');
    md.push('|------|--------|----------|---------|');
    for (const week of sortedWeeks.slice(-5).reverse()) {
      md.push(`| ${week.date} | ${week.metrics.totalTrades} | ${week.metrics.winRate.toFixed(1)}% | ₹${week.metrics.netPnL.toLocaleString('en-IN')} |`);
    }
    md.push('\n---\n');
    
    // Daily summary (top 10 best and worst)
    md.push('## 📅 DAILY PERFORMANCE (Sample)\n');
    md.push('### Top 10 Best Days:\n');
    md.push('| Date | Trades | Win Rate | Net P&L |');
    md.push('|------|--------|----------|---------|');
    const sortedDays = [...report.daily].sort((a, b) => b.metrics.netPnL - a.metrics.netPnL);
    for (const day of sortedDays.slice(0, 10)) {
      md.push(`| ${day.date} | ${day.metrics.totalTrades} | ${day.metrics.winRate.toFixed(1)}% | ₹${day.metrics.netPnL.toLocaleString('en-IN')} |`);
    }
    
    md.push('\n### Top 10 Worst Days:\n');
    md.push('| Date | Trades | Win Rate | Net P&L |');
    md.push('|------|--------|----------|---------|');
    for (const day of sortedDays.slice(-10).reverse()) {
      md.push(`| ${day.date} | ${day.metrics.totalTrades} | ${day.metrics.winRate.toFixed(1)}% | ₹${day.metrics.netPnL.toLocaleString('en-IN')} |`);
    }
    md.push('\n---\n');
    
    // Futures vs Options comparison
    md.push('## 💰 INDEX FUTURES vs OPTIONS COMPARISON\n');
    md.push('### Index Futures (Actual Backtest Results):\n');
    md.push(`- **Quantity:** ${report.futuresAnalysis.quantity}`);
    md.push(`- **Total P&L:** ₹${report.futuresAnalysis.totalPnL.toLocaleString('en-IN')}`);
    md.push(`- **ROI:** ${report.futuresAnalysis.roi.toFixed(2)}%\n`);
    
    md.push('### Options (Estimated):\n');
    md.push(`- **Estimated Premium Multiplier:** ${report.optionsAnalysis.estimatedPremium}x`);
    md.push(`- **Estimated Total P&L:** ₹${report.optionsAnalysis.estimatedPnL.toLocaleString('en-IN')}`);
    md.push(`- **Estimated ROI:** ${report.optionsAnalysis.estimatedROI.toFixed(2)}%`);
    md.push(`- **Note:** ${report.optionsAnalysis.notes}\n`);
    md.push('---\n');
    
    // Sample trades
    md.push('## 📋 SAMPLE TRADES (Last 20)\n');
    md.push('| Entry Time | Action | Entry | Exit | P&L | Holding (min) | Confidence |');
    md.push('|------------|--------|-------|------|-----|---------------|------------|');
    const lastTrades = report.allTrades.slice(-20);
    for (const trade of lastTrades) {
      const entryTime = new Date(trade.entryTime).toLocaleString('en-IN');
      const pnlStr = trade.profitLoss >= 0 ? `+₹${trade.profitLoss.toLocaleString('en-IN')}` : `-₹${Math.abs(trade.profitLoss).toLocaleString('en-IN')}`;
      md.push(`| ${entryTime} | ${trade.action} | ${trade.entryPrice.toFixed(2)} | ${trade.exitPrice.toFixed(2)} | ${pnlStr} | ${trade.holdingPeriod} | ${trade.confidence.toFixed(0)}% |`);
    }
    md.push('\n---\n');
    
    // Performance stats
    md.push('## 📊 PERFORMANCE STATISTICS\n');
    md.push(`- **Execution Time:** ${(report.executionTime / 1000).toFixed(2)} seconds`);
    md.push(`- **Candles Analyzed:** Approximately ${report.allTrades.length * 200} candles`);
    md.push(`- **Average Trades per Day:** ${(report.overall.totalTrades / report.daily.length).toFixed(1)}`);
    md.push(`- **Average Trades per Week:** ${(report.overall.totalTrades / report.weekly.length).toFixed(1)}`);
    md.push(`- **Average Trades per Month:** ${(report.overall.totalTrades / report.monthly.length).toFixed(1)}\n`);
    
    md.push('---\n');
    md.push('**Generated by:** Advanced AI Backtesting Engine\n');
    md.push(`**Report Date:** ${new Date().toLocaleString('en-IN')}\n`);
    
    return md.join('\n');
  }
}