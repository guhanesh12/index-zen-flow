// @ts-nocheck
// Mock Data Service for Testing

export class MockDataService {
  private basePrice = 24500;
  private currentPrice = 24500;
  private volatility = 0.001;

  // Generate realistic NIFTY candle data
  generateCandles(count: number = 50) {
    const candles = [];
    let price = this.basePrice;
    const now = Date.now();
    
    for (let i = 0; i < count; i++) {
      const timestamp = now - (count - i) * 15 * 60 * 1000; // 15-minute intervals
      
      // Random walk with drift
      const change = (Math.random() - 0.48) * price * this.volatility;
      price += change;
      
      const open = price;
      const high = price + Math.random() * price * 0.002;
      const low = price - Math.random() * price * 0.002;
      const close = low + Math.random() * (high - low);
      const volume = Math.floor(100000 + Math.random() * 500000);
      
      candles.push({
        timestamp,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume
      });
      
      price = close;
    }
    
    this.currentPrice = candles[candles.length - 1].close;
    return candles;
  }

  // Generate mock AI analysis
  generateAIAnalysis() {
    const biases = ['Bullish', 'Bearish', 'Neutral'];
    const marketStates = ['Trending', 'Range', 'Reversal Risk'];
    const actions = ['HOLD', 'EXIT', 'WAIT', 'ENTRY_ALLOWED'];
    
    const bias = biases[Math.floor(Math.random() * biases.length)];
    const marketState = marketStates[Math.floor(Math.random() * marketStates.length)];
    
    let action;
    if (marketState === 'Trending') {
      action = Math.random() > 0.3 ? 'ENTRY_ALLOWED' : 'WAIT';
    } else if (marketState === 'Reversal Risk') {
      action = Math.random() > 0.5 ? 'EXIT' : 'HOLD';
    } else {
      action = 'WAIT';
    }
    
    const confidence = Math.floor(60 + Math.random() * 30);
    
    return {
      market_state: marketState,
      bias,
      action,
      confidence,
      option_risk_note: this.generateRiskNote(marketState, bias),
      timestamp: Date.now()
    };
  }

  private generateRiskNote(marketState: string, bias: string) {
    const notes = {
      'Trending': `Strong ${bias.toLowerCase()} momentum detected. Good entry opportunity.`,
      'Range': 'Market is range-bound. Wait for breakout confirmation.',
      'Reversal Risk': 'Potential reversal detected. Consider exit or tighten stops.'
    };
    return notes[marketState as keyof typeof notes] || 'Monitor closely.';
  }

  // Generate mock position with live P&L
  generateMockPosition(entryPrice?: number) {
    const entry = entryPrice || this.currentPrice - 50;
    const currentPrice = this.getLivePrice();
    const quantity = 1;
    const lotSize = 50;
    
    const pnl = (currentPrice - entry) * quantity * lotSize;
    const pnlPercent = ((currentPrice - entry) / entry) * 100;
    
    return {
      strike: '24300 CE',
      expiry: this.getNextExpiry(),
      lotSize,
      quantity,
      entryPrice: parseFloat(entry.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      stopLoss: parseFloat((entry - 30).toFixed(2)),
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPercent: parseFloat(pnlPercent.toFixed(2)),
      status: pnl > 0 ? 'PROFIT' : pnl < 0 ? 'LOSS' : 'NEUTRAL',
      holdingTime: this.getHoldingTime(),
      entryTime: Date.now() - Math.random() * 3600000
    };
  }

  // Get live price with small random fluctuations (millisecond updates)
  getLivePrice() {
    // Simulate real-time price movement
    const tick = (Math.random() - 0.5) * 0.5;
    this.currentPrice += tick;
    return this.currentPrice;
  }

  private getNextExpiry() {
    const today = new Date();
    const thursday = new Date(today);
    thursday.setDate(today.getDate() + ((4 - today.getDay() + 7) % 7));
    return thursday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private getHoldingTime() {
    const minutes = Math.floor(Math.random() * 120);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  // Generate order response
  generateOrderResponse(transactionType: string, testMode: boolean) {
    return {
      orderId: testMode ? `TEST_${Date.now()}` : `ORD_${Date.now()}`,
      status: 'SUCCESS',
      message: testMode ? 'Test order placed successfully' : 'Order placed successfully',
      transactionType,
      price: this.getLivePrice(),
      timestamp: Date.now(),
      isTest: testMode
    };
  }

  // Generate trade log
  generateTradeLog(type: string, message: string, testMode: boolean) {
    return {
      timestamp: Date.now(),
      type: testMode ? `TEST_${type}` : type,
      message: testMode ? `[TEST] ${message}` : message,
      data: {
        price: this.getLivePrice(),
        testMode
      }
    };
  }
}
