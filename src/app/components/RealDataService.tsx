// Real Data Service for Dhan API Integration
// Handles live market data, orders, positions, and fund limits

export interface MarketQuote {
  security_id: string;
  exchange_segment: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid_price: number;
  ask_price: number;
  oi: number;
  timestamp: string;
}

export interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FundLimit {
  sodLimit: number;
  availableBalance: number;
  collateralAmount: number;
  utilizationAmount: number;
  blockedPayinAmount: number;
  blockedPayoutAmount: number;
}

export class RealDataService {
  private serverUrl: string;
  private accessToken: string;

  constructor(serverUrl: string, accessToken: string) {
    this.serverUrl = serverUrl;
    this.accessToken = accessToken;
  }

  // Check if market is open (weekdays only, 9:15 AM - 3:30 PM IST)
  static isMarketOpen(): { isOpen: boolean; message: string; status: 'OPEN' | 'CLOSED' | 'WEEKEND' } {
    const now = new Date();
    
    // Check if weekend (Saturday = 6, Sunday = 0)
    const day = now.getDay();
    if (day === 0 || day === 6) {
      return {
        isOpen: false,
        message: 'Market closed on weekends',
        status: 'WEEKEND'
      };
    }

    // Convert to IST (UTC+5:30)
    const istOffset = 5.5 * 60; // minutes
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utc + (istOffset * 60000));
    
    const hours = istTime.getHours();
    const minutes = istTime.getMinutes();
    const timeInMinutes = hours * 60 + minutes;
    
    const marketOpen = 9 * 60 + 15; // 9:15 AM
    const marketClose = 15 * 60 + 30; // 3:30 PM
    
    if (timeInMinutes >= marketOpen && timeInMinutes < marketClose) {
      return {
        isOpen: true,
        message: 'Market is open',
        status: 'OPEN'
      };
    } else {
      const nextOpen = timeInMinutes < marketOpen ? 'today at 9:15 AM' : 'tomorrow at 9:15 AM';
      return {
        isOpen: false,
        message: `Market closed - Opens ${nextOpen}`,
        status: 'CLOSED'
      };
    }
  }

  // Get live market quote using intraday OHLC data
  async getMarketQuote(securityId: string, exchangeSegment: string = 'IDX_I'): Promise<MarketQuote | null> {
    try {
      const response = await fetch(`${this.serverUrl}/market-quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ securityId, exchangeSegment })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Market quote error:', errorData);
        
        // Don't throw error if credentials not configured
        if (errorData.needsConfig) {
          console.log('Dhan credentials not configured');
          return null;
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.quote) {
        return {
          ltp: data.quote.ltp,
          open: data.quote.open,
          high: data.quote.high,
          low: data.quote.low,
          close: data.quote.close,
          volume: data.quote.volume
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to fetch market quote:', error);
      return null;
    }
  }

  // Get OHLC candle data
  async getOHLCData(symbol: string, interval: string = '15', count: number = 50): Promise<OHLCCandle[]> {
    try {
      const response = await fetch(`${this.serverUrl}/ohlc-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ symbol, interval, count })
      });

      if (!response.ok) {
        console.error('Failed to fetch OHLC data:', await response.text());
        return [];
      }

      const data = await response.json();
      return data.candles || [];
    } catch (error) {
      console.error('Error fetching OHLC data:', error);
      return [];
    }
  }

  // Get fund limits
  async getFundLimits(): Promise<FundLimit | null> {
    try {
      const response = await fetch(`${this.serverUrl}/fund-limits`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch fund limits:', await response.text());
        return null;
      }

      const data = await response.json();
      return data.funds;
    } catch (error) {
      console.error('Error fetching fund limits:', error);
      return null;
    }
  }

  // Get current positions
  async getPositions(): Promise<any[]> {
    try {
      const response = await fetch(`${this.serverUrl}/positions`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (!response.ok) {
        console.error('Failed to fetch positions:', await response.text());
        return [];
      }

      const data = await response.json();
      return data.positions || [];
    } catch (error) {
      console.error('Error fetching positions:', error);
      return [];
    }
  }

  // Place order (BUY/SELL CALL/PUT)
  async placeOrder(params: {
    symbol: string;
    optionType: 'CALL' | 'PUT';
    strike: number;
    transactionType: 'BUY' | 'SELL';
    quantity: number;
    orderType?: 'MARKET' | 'LIMIT';
    price?: number;
  }): Promise<any> {
    try {
      const response = await fetch(`${this.serverUrl}/place-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to place order:', error);
        return { success: false, error };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error placing order:', error);
      return { success: false, error: String(error) };
    }
  }

  // Exit position (automatically sells the same position)
  async exitPosition(securityId: string, quantity: number): Promise<any> {
    try {
      const response = await fetch(`${this.serverUrl}/exit-position`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({ securityId, quantity })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to exit position:', error);
        return { success: false, error };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error exiting position:', error);
      return { success: false, error: String(error) };
    }
  }

  // Get live streaming data (simulated with polling)
  startLiveDataStream(
    securityId: string,
    onUpdate: (quote: MarketQuote) => void,
    intervalMs: number = 1000
  ): () => void {
    const intervalId = setInterval(async () => {
      const quote = await this.getMarketQuote(securityId);
      if (quote) {
        onUpdate(quote);
      }
    }, intervalMs);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }
}

// Symbol mapping for Indian indices
export const SYMBOL_MAP: { [key: string]: { id: string; segment: string; name: string } } = {
  'NIFTY': { id: '13', segment: 'IDX_I', name: 'NIFTY 50' },
  'BANKNIFTY': { id: '25', segment: 'IDX_I', name: 'NIFTY BANK' },
  'FINNIFTY': { id: '27', segment: 'IDX_I', name: 'NIFTY FIN SERVICE' },
  'MIDCPNIFTY': { id: '28', segment: 'IDX_I', name: 'NIFTY MIDCAP SELECT' }
};

// Options chain helpers
export function generateStrikePrices(ltp: number, count: number = 10, step: number = 50): number[] {
  const roundedLTP = Math.round(ltp / step) * step;
  const strikes: number[] = [];
  
  const halfCount = Math.floor(count / 2);
  for (let i = -halfCount; i <= halfCount; i++) {
    strikes.push(roundedLTP + (i * step));
  }
  
  return strikes.sort((a, b) => a - b);
}

// Calculate days to expiry
export function getDaysToExpiry(expiryDate: Date): number {
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

// Get nearest weekly expiry (Thursday)
export function getNearestWeeklyExpiry(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilThursday = (4 - dayOfWeek + 7) % 7;
  const nextThursday = new Date(now);
  nextThursday.setDate(now.getDate() + daysUntilThursday);
  nextThursday.setHours(15, 30, 0, 0); // Set to 3:30 PM
  
  // If today is Thursday and market hasn't closed, return today
  if (daysUntilThursday === 0 && now.getHours() < 15) {
    return nextThursday;
  }
  
  // If already past Thursday, get next week's Thursday
  if (daysUntilThursday === 0) {
    nextThursday.setDate(nextThursday.getDate() + 7);
  }
  
  return nextThursday;
}