// @ts-nocheck
/**
 * ✅ CENTRALIZED INSTRUMENT SERVICE
 * 
 * Fetches instruments from backend API (uploaded by admin)
 * All users (desktop/mobile) see the same instruments
 */

export interface Instrument {
  id: string;
  symbol: string; // Formatted: NIFTY-JAN2026-26300-CE
  tradingSymbol: string; // Raw Dhan symbol
  securityId: string;
  exchange: string;
  exchangeSegment: string; // NSE_FNO or BSE_FNO
  instrumentType: string;
  expiry: string;
  strike: string;
  optionType: 'CALL' | 'PUT' | '';
  lotSize: number;
  tickSize: number;
  underlyingSymbol: string; // NIFTY, BANKNIFTY, SENSEX
  uploadedAt: string;
  status: 'active' | 'inactive';
}

export interface InstrumentFetchOptions {
  page?: number;
  limit?: number;
  underlying?: 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
  optionType?: 'CALL' | 'PUT';
  search?: string;
}

export class InstrumentService {
  private serverUrl: string;
  private accessToken: string;
  private cache: Map<string, { data: Instrument[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 300000; // 5 minutes

  constructor(serverUrl: string, accessToken: string) {
    this.serverUrl = serverUrl;
    this.accessToken = accessToken;
  }

  /**
   * ✅ Fetch instruments from backend API
   * All users see the same instruments uploaded by admin
   */
  async fetchInstruments(options: InstrumentFetchOptions = {}): Promise<{
    instruments: Instrument[];
    total: number;
    hasMore: boolean;
  }> {
    const {
      page = 1,
      limit = 1000, // Fetch more at once to reduce API calls
      underlying,
      optionType,
      search
    } = options;

    // Check cache
    const cacheKey = JSON.stringify(options);
    const cached = this.cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      console.log(`✅ Using cached instruments (${cached.data.length} items)`);
      return {
        instruments: cached.data,
        total: cached.data.length,
        hasMore: false
      };
    }

    try {
      console.log('🔄 Fetching instruments from backend...', options);
      
      const response = await fetch(`${this.serverUrl}/get-admin-instruments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        },
        body: JSON.stringify({
          page,
          limit,
          underlying,
          optionType,
          search
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Instrument fetch failed:', errorText);
        throw new Error(`Failed to fetch instruments: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.instruments) {
        // Cache the results
        this.cache.set(cacheKey, {
          data: data.instruments,
          timestamp: Date.now()
        });

        console.log(`✅ Loaded ${data.instruments.length} instruments from backend`);
        
        return {
          instruments: data.instruments,
          total: data.total,
          hasMore: data.hasMore
        };
      }

      // No instruments uploaded yet
      console.warn('⚠️ No instruments found - Admin must upload CSV first');
      return {
        instruments: [],
        total: 0,
        hasMore: false
      };

    } catch (error: any) {
      console.error('❌ Error fetching instruments:', error);
      throw error;
    }
  }

  /**
   * ✅ Fetch ALL instruments (for autocomplete, search, etc.)
   * Uses pagination internally but returns all results
   */
  async fetchAllInstruments(underlying?: 'NIFTY' | 'BANKNIFTY' | 'SENSEX'): Promise<Instrument[]> {
    const allInstruments: Instrument[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.fetchInstruments({
        page,
        limit: 1000,
        underlying
      });

      allInstruments.push(...result.instruments);
      hasMore = result.hasMore;
      page++;

      // Safety limit: max 10 pages (10,000 instruments)
      if (page > 10) {
        console.warn('⚠️ Hit page limit (10,000 instruments)');
        break;
      }
    }

    console.log(`✅ Loaded total of ${allInstruments.length} instruments`);
    return allInstruments;
  }

  /**
   * ✅ Convert instruments to trading symbols format
   * Used by trading engines
   */
  convertToTradingSymbols(instruments: Instrument[]): any[] {
    return instruments.map(inst => ({
      id: inst.id,
      name: inst.symbol, // NIFTY-JAN2026-26300-CE
      tradingSymbol: inst.tradingSymbol, // Raw Dhan symbol
      securityId: inst.securityId,
      exchange: inst.exchange,
      exchangeSegment: inst.exchangeSegment,
      instrumentType: inst.instrumentType,
      expiry: inst.expiry,
      strikePrice: parseFloat(inst.strike),
      optionType: inst.optionType,
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
      underlyingSymbol: inst.underlyingSymbol,
      // Trading engine specific fields
      transactionType: 'BUY',
      orderType: 'MARKET',
      productType: 'INTRADAY',
      quantity: inst.lotSize,
      price: 0,
      disclosedQuantity: 0,
      triggerPrice: 0,
      afterMarketOrder: false,
      active: inst.status === 'active'
    }));
  }

  /**
   * ✅ Search instruments by symbol name
   */
  async searchInstruments(query: string, underlying?: 'NIFTY' | 'BANKNIFTY' | 'SENSEX'): Promise<Instrument[]> {
    const result = await this.fetchInstruments({
      search: query,
      underlying,
      limit: 100 // Limit search results
    });

    return result.instruments;
  }

  /**
   * ✅ Find instrument by security ID
   */
  async findBySecurityId(securityId: string): Promise<Instrument | null> {
    try {
      const allInstruments = await this.fetchAllInstruments();
      return allInstruments.find(inst => inst.securityId === securityId) || null;
    } catch (error) {
      console.error('❌ Error finding instrument by security ID:', error);
      return null;
    }
  }

  /**
   * ✅ Find instrument by symbol name
   */
  async findBySymbol(symbolName: string): Promise<Instrument | null> {
    try {
      const allInstruments = await this.fetchAllInstruments();
      return allInstruments.find(inst => 
        inst.symbol.toLowerCase() === symbolName.toLowerCase() ||
        inst.tradingSymbol.toLowerCase() === symbolName.toLowerCase()
      ) || null;
    } catch (error) {
      console.error('❌ Error finding instrument by symbol:', error);
      return null;
    }
  }

  /**
   * ✅ Clear cache (call after admin uploads new instruments)
   */
  clearCache() {
    this.cache.clear();
    console.log('✅ Instrument cache cleared');
  }

  /**
   * ✅ Get instruments count
   */
  async getInstrumentsCount(): Promise<{
    total: number;
    byUnderlying: { [key: string]: number };
    uploadedAt: string | null;
  }> {
    try {
      const response = await fetch(`${this.serverUrl}/admin/instruments/count`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        return {
          total: data.total || 0,
          byUnderlying: data.byUnderlying || {},
          uploadedAt: data.uploadedAt || null
        };
      }

      return {
        total: 0,
        byUnderlying: {},
        uploadedAt: null
      };
    } catch (error) {
      console.error('❌ Error fetching instruments count:', error);
      return {
        total: 0,
        byUnderlying: {},
        uploadedAt: null
      };
    }
  }
}

/**
 * ✅ Create instrument service instance
 */
export function createInstrumentService(serverUrl: string, accessToken: string): InstrumentService {
  return new InstrumentService(serverUrl, accessToken);
}

/**
 * ✅ Helper: Save trading symbols to localStorage
 * Used by trading engines for quick access
 */
export function saveTradingSymbolsToLocalStorage(symbols: any[]) {
  try {
    localStorage.setItem('trading_symbols', JSON.stringify(symbols));
    console.log(`✅ Saved ${symbols.length} trading symbols to localStorage`);
  } catch (error) {
    console.error('❌ Error saving trading symbols to localStorage:', error);
  }
}

/**
 * ✅ Helper: Load trading symbols from localStorage
 * Fallback if backend is unavailable
 */
export function loadTradingSymbolsFromLocalStorage(): any[] {
  try {
    const stored = localStorage.getItem('trading_symbols');
    if (stored) {
      const symbols = JSON.parse(stored);
      console.log(`✅ Loaded ${symbols.length} trading symbols from localStorage`);
      return symbols;
    }
  } catch (error) {
    console.error('❌ Error loading trading symbols from localStorage:', error);
  }
  return [];
}
