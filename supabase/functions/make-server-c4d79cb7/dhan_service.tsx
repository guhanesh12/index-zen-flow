// Dhan API Service
// API Documentation: https://dhanhq.co/docs/

// ⚡ GLOBAL RATE LIMITER - Shared across all DhanService instances
class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 600; // 600ms between requests (safe buffer)
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly MAX_REQUESTS_PER_MINUTE = 60; // Dhan's rate limit
  
  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          // Check if we need to wait for rate limit window reset
          const now = Date.now();
          const windowElapsed = now - this.windowStart;
          
          // Reset counter every minute
          if (windowElapsed >= 60000) {
            console.log(`🔄 Rate limit window reset. Processed ${this.requestCount} requests in last minute.`);
            this.requestCount = 0;
            this.windowStart = now;
          }
          
          // If we've hit the per-minute limit, wait until the window resets
          if (this.requestCount >= this.MAX_REQUESTS_PER_MINUTE) {
            const waitTime = 60000 - windowElapsed + 1000; // Wait until next window + 1s buffer
            console.warn(`⚠️ Rate limit approaching! Waiting ${Math.round(waitTime/1000)}s before next request...`);
            await new Promise(r => setTimeout(r, waitTime));
            this.requestCount = 0;
            this.windowStart = Date.now();
          }
          
          // Enforce minimum interval between requests
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
            const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
            await new Promise(r => setTimeout(r, waitTime));
          }
          
          this.lastRequestTime = Date.now();
          this.requestCount++;
          
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }
  
  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) await fn();
    }
    this.processing = false;
  }
}

// Global rate limiter instance shared across all DhanService instances
const globalRateLimiter = new RateLimiter();

export class DhanService {
  private clientId: string;
  private accessToken: string;
  private priceCache: Map<string, { price: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 15000; // Keep strategy candles fresh without overloading Dhan
  private readonly QUOTE_CACHE_DURATION = 1000; // Live position monitor needs near real-time prices
  private readonly MAX_RETRIES = 3; // Maximum retry attempts for 502 errors
  private readonly RETRY_DELAY = 1000; // Initial retry delay in ms
  private rateLimitRetryCount = 0;
  private readonly MAX_RATE_LIMIT_RETRIES = 2;

  constructor(config: { clientId: string; accessToken: string }) {
    this.clientId = config.clientId;
    this.accessToken = config.accessToken;
  }

  // ⚡⚡⚡ RETRY HELPER: Handles 502 Bad Gateway, network errors, AND rate limits ⚡⚡⚡
  private async retryFetch(
    url: string,
    options: RequestInit,
    operationName: string,
    retries = this.MAX_RETRIES
  ): Promise<Response> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // ⚡ Clone response FIRST before consuming body
        const responseClone = response.clone();
        
        // ⚡ NEW: Handle rate limit errors (429 or DH-904)
        if (response.status === 429 || (response.status === 400 && this.rateLimitRetryCount < this.MAX_RATE_LIMIT_RETRIES)) {
          const responseText = await responseClone.text();
          if (responseText.includes('Rate_Limit') || responseText.includes('DH-904')) {
            this.rateLimitRetryCount++;
            const waitTime = 2000 * Math.pow(2, this.rateLimitRetryCount); // Exponential backoff: 2s, 4s, 8s
            console.warn(`⚠️ ${operationName} - RATE LIMIT HIT (attempt ${this.rateLimitRetryCount}/${this.MAX_RATE_LIMIT_RETRIES})`);
            console.warn(`   Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue; // Retry
          }
        }
        
        // Reset rate limit counter on success
        if (response.ok) {
          this.rateLimitRetryCount = 0;
        }
        
        // If 502 Bad Gateway or 503 Service Unavailable, retry
        if ((response.status === 502 || response.status === 503) && attempt < retries) {
          const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1); // Exponential backoff
          console.warn(`⚠️ ${operationName} - ${response.status} error (attempt ${attempt}/${retries})`);
          console.warn(`   Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }
        
        // ⚡ Log response details for debugging (only if not already consumed)
        if (!response.ok && response.status !== 429 && response.status !== 400) {
          try {
            const responseText = await response.clone().text();
            console.error(`❌ ${operationName} - HTTP ${response.status} error:`);
            console.error(`   Response: ${responseText.substring(0, 500)}`);
          } catch (cloneError) {
            console.error(`❌ ${operationName} - HTTP ${response.status} error (body already consumed)`);
          }
          
          // ⚡ DON'T retry on client errors (4xx) - these won't succeed
          if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            console.error(`   Client error detected - not retrying`);
            return response; // Return immediately, don't retry
          }
        }
        
        return response; // Success or non-retryable error
      } catch (error: any) {
        // Network errors (timeout, connection refused, etc.)
        if (attempt < retries) {
          const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
          console.warn(`⚠️ ${operationName} - Network error (attempt ${attempt}/${retries}): ${error.message}`);
          console.warn(`   Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Retry
        }
        throw error; // Max retries exceeded
      }
    }
    
    throw new Error(`${operationName} failed after ${retries} attempts`);
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple fund limits API call
      const response = await fetch('https://api.dhan.co/v2/fundlimit', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access-token': this.accessToken,
        }
      });

      return response.ok;
    } catch (error) {
      console.log(`Dhan connection test failed: ${error}`);
      return false;
    }
  }

  // ⚡ ULTRA-FAST: Get Last Traded Price only
  async getLTP(securityId: string): Promise<number> {
    try {
      const exchangeSegment = 'IDX_I'; // Default to INDEX
      const quote = await this.getMarketQuote(securityId, exchangeSegment);
      return quote.ltp || quote.close || 0;
    } catch (error) {
      console.error('Error fetching LTP:', error);
      throw error;
    }
  }

  // Get real-time market quote using OHLC data (last 50 candles cached)
  async getMarketQuote(securityId: string, exchangeSegment: string): Promise<any> {
    try {
      // Check cache first
      const cacheKey = `ohlc_${securityId}_${exchangeSegment}`;
      const cached = this.priceCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.QUOTE_CACHE_DURATION) {
        console.log(`✅ Using cached OHLC data for ${cacheKey} (${cached.price.candles.length} candles)`);
        return cached.price;
      }

      console.log(`Fetching fresh OHLC data for ${securityId}...`);

      // Get last 50 candles from intraday OHLC (1-min interval)
      const candles = await this.getIntradayOHLC(securityId, exchangeSegment, 'INDEX', '1', false);
      
      if (candles && candles.length > 0) {
        // Get last 50 candles
        const last50Candles = candles.slice(-50);
        const lastCandle = last50Candles[last50Candles.length - 1];
        const last3CompletedCandles = last50Candles.slice(-4, -1); // Last 3 completed candles
        const runningCandle = lastCandle; // Current running candle
        
        const priceData = {
          ltp: lastCandle.close,
          open: lastCandle.open,
          high: lastCandle.high,
          low: lastCandle.low,
          close: lastCandle.close,
          volume: lastCandle.volume,
          lastUpdated: Date.now(),
          candles: last50Candles, // All 50 candles for analysis
          last3Candles: last3CompletedCandles, // Last 3 completed candles
          runningCandle: runningCandle, // Current running candle
          totalCandles: last50Candles.length
        };

        // Cache the result for 30 seconds
        this.priceCache.set(cacheKey, {
          price: priceData,
          timestamp: Date.now()
        });

        console.log(`✅ Got ${last50Candles.length} candles - Last 3 completed + 1 running candle ready`);
        console.log(`   Current Price: ₹${priceData.ltp} | Running Candle: O:${runningCandle.open} H:${runningCandle.high} L:${runningCandle.low} C:${runningCandle.close}`);
        
        return priceData;
      }

      throw new Error('No OHLC data available');
    } catch (error) {
      console.error('Error fetching market quote:', error);
      throw error;
    }
  }

  // Get intraday OHLC data (1, 5, 15, 25, 60 minute intervals)
  async getIntradayOHLC(
    securityId: string,
    exchangeSegment: string,
    instrument: string,
    interval: string = '15',
    includeOI: boolean = false
  ): Promise<any[]> {
    try {
      // Check cache first before making API call
      const cacheKey = `intraday_${securityId}_${interval}`;
      const cached = this.priceCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
        console.log(`✅ CACHE HIT: Using cached ${interval}min data for ${securityId} (${cached.price.length} candles, ${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
        return cached.price;
      }
      
      console.log(`🔄 CACHE MISS: Fetching fresh ${interval}min data for ${securityId}...`);
      
      // Calculate date range (last 7 days to ensure we get data)
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7);
      
      // Format dates for API: YYYY-MM-DD HH:MM:SS in IST
      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day} 09:15:00`;
      };
      
      const formatToDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day} 15:30:00`;
      };

      const requestBody = {
        securityId,
        exchangeSegment,
        instrument,
        interval: parseInt(interval), // ⚡ FIX: Dhan API expects number not string
        fromDate: formatDate(fromDate),
        toDate: formatToDate(toDate),
        oi: false // Always false for INDEX instruments
      };

      console.log('⚡ Rate-limited request queued:', JSON.stringify(requestBody, null, 2));

      // ⚡⚡⚡ USE GLOBAL RATE LIMITER - This ensures all requests are throttled properly ⚡⚡⚡
      const response = await globalRateLimiter.throttle(async () => {
        return await this.retryFetch(
          'https://api.dhan.co/v2/charts/intraday',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'access-token': this.accessToken,
            },
            body: JSON.stringify(requestBody)
          },
          'Intraday OHLC'
        );
      });

      const responseText = await response.text();
      console.log('Intraday OHLC response status:', response.status);
      console.log(`Intraday OHLC response for securityId ${securityId}:`, responseText.substring(0, 500));
      
      // ⚡ DEBUG: Log full response if it's short (likely an error)
      if (responseText.length < 1000) {
        console.log(`⚠️ Short response detected - Full response:`, responseText);
      }

      if (!response.ok) {
        // Check for DH-901 auth error
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.errorCode === 'DH-901') {
            console.log('🔑 DH-901: Dhan Access Token expired - returning empty candles');
            return [];
          }
          
          // ⚡ NEW: Handle common errors gracefully
          if (errorData.errorCode === 'DH-906') {
            console.warn('⚠️ DH-906: Scrip not allowed or market closed - returning empty candles');
            return [];
          }
          
          if (errorData.errorCode === 'RS-4015' || responseText.includes('No data found')) {
            console.warn('⚠️ No data found for this period (likely market closed/weekend) - returning empty candles');
            return [];
          }
          
          // ⚡ Weekend/Market Closed Detection
          if (responseText.includes('market') && responseText.includes('closed')) {
            console.warn('⚠️ Market is closed - returning empty candles');
            return [];
          }
          
        } catch (e) {
          // Not JSON, continue
        }
        
        // ⚡ For other errors, log and return empty instead of throwing
        console.error(`❌ Dhan Intraday OHLC Error (${response.status}): ${responseText}`);
        console.warn('⚠️ Returning empty candles instead of throwing error to prevent engine crash');
        return [];
      }

      const result = JSON.parse(responseText);
      
      // ⚡ DEBUG: Log what fields are in the response
      console.log(`📊 Response fields for securityId ${securityId}:`, Object.keys(result).join(', '));
      
      // Dhan API returns arrays: open[], high[], low[], close[], volume[], timestamp[]
      // Convert to array of candle objects
      if (result.open && result.timestamp) {
        const candles = [];
        const length = result.timestamp.length;
        
        console.log(`📊 Converting ${length} candles for securityId ${securityId}...`);
        
        for (let i = 0; i < length; i++) {
          candles.push({
            timestamp: result.timestamp[i] * 1000, // Convert to milliseconds
            open: parseFloat(result.open[i] || 0),
            high: parseFloat(result.high[i] || 0),
            low: parseFloat(result.low[i] || 0),
            close: parseFloat(result.close[i] || 0),
            volume: parseFloat(result.volume[i] || 0),
            ...(includeOI && result.open_interest ? { oi: parseFloat(result.open_interest[i] || 0) } : {})
          });
        }
        
        // ⚡ Show first and last candle to verify data
        if (candles.length > 0) {
          console.log(`   First candle: O:${candles[0].open} H:${candles[0].high} L:${candles[0].low} C:${candles[0].close} V:${candles[0].volume}`);
          console.log(`   Last candle: O:${candles[candles.length-1].open} H:${candles[candles.length-1].high} L:${candles[candles.length-1].low} C:${candles[candles.length-1].close} V:${candles[candles.length-1].volume}`);
        }
        
        // ⚡ CACHE THE RESULT (2 minutes cache)
        this.priceCache.set(cacheKey, {
          price: candles,
          timestamp: Date.now()
        });
        
        console.log(`✅ Converted and cached ${candles.length} candles for securityId ${securityId} (${interval}min interval)`);
        return candles;
      }

      console.error(`❌ No data in response for securityId ${securityId}!`);
      console.error(`   Response structure:`, JSON.stringify(result, null, 2).substring(0, 500));
      return [];
    } catch (error) {
      console.error('Error fetching intraday OHLC:', error);
      throw error;
    }
  }

  async getOHLCData(securityId: string, interval: string = '5', count: number = 50): Promise<any[]> {
    try {
      // Use intraday OHLC instead of historical data
      console.log(`\n📊 ============ FETCHING OHLC DATA ============`);
      console.log(`   Security ID: ${securityId}`);
      console.log(`   Interval: ${interval} minutes (⚡ USER SELECTED TIMEFRAME)`);
      console.log(`   Candle Count: ${count}`);
      console.log(`   Endpoint: Dhan Intraday OHLC API`);
      console.log(`============================================\n`);
      
      const candles = await this.getIntradayOHLC(
        securityId,
        'IDX_I', // Index segment
        'INDEX',
        interval, // Use provided interval (5 or 15 minutes)
        false // Don't include OI for indices
      );

      // Return last N candles
      const result = candles.slice(-count);
      console.log(`✅ Successfully fetched ${result.length} candles (${interval}min interval)`);
      
      // ⚡ VERIFY TIMEFRAME: Show first and last 3 candle timestamps
      if (result.length >= 3) {
        console.log(`\n🔍 TIMEFRAME VERIFICATION (${interval}M):`);
        console.log(`   First 3 candles:`);
        for (let i = 0; i < Math.min(3, result.length); i++) {
          const date = new Date(result[i].timestamp);
          console.log(`     [${i}] ${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} - O:${result[i].open} C:${result[i].close}`);
        }
        console.log(`   Last 3 candles:`);
        for (let i = Math.max(0, result.length - 3); i < result.length; i++) {
          const date = new Date(result[i].timestamp);
          console.log(`     [${i}] ${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} - O:${result[i].open} C:${result[i].close}`);
        }
        
        // ⚡ CALCULATE TIME DIFFERENCE BETWEEN CANDLES
        if (result.length >= 2) {
          const timeDiffMs = result[1].timestamp - result[0].timestamp;
          const timeDiffMin = Math.round(timeDiffMs / 60000);
          console.log(`   ⚡ Time between candles: ${timeDiffMin} minutes`);
          
          if (timeDiffMin !== parseInt(interval)) {
            console.warn(`   ⚠️ WARNING: Expected ${interval}min but got ${timeDiffMin}min intervals!`);
          } else {
            console.log(`   ✅ VERIFIED: Candles are ${interval}-minute intervals!`);
          }
        }
        console.log(`============================================\n`);
      }
      
      return result;
    } catch (error) {
      console.error('Error fetching OHLC data:', error);
      throw error;
    }
  }

  // Get historical candle data
  async getHistoricalData(
    securityId: string,
    exchangeSegment: string,
    instrument: string,
    expiryCode: string,
    fromDate: string,
    toDate: string
  ): Promise<any[]> {
    try {
      // Dhan historical data endpoint - POST method with JSON body
      const requestBody = {
        securityId: securityId,
        exchangeSegment: exchangeSegment,
        instrument: instrument,
        expiryCode: expiryCode === '0' ? 0 : parseInt(expiryCode),
        fromDate: fromDate,
        toDate: toDate
      };

      console.log('Fetching historical data with:', requestBody);

      const response = await fetch(
        'https://api.dhan.co/v2/charts/historical',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access-token': this.accessToken,
            'client-id': this.clientId
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Dhan historical API error:', error);
        throw new Error(`Dhan API Error: ${error}`);
      }

      const result = await response.json();
      console.log('Historical data response:', result);

      // Convert Dhan format to our format
      if (result.data && Array.isArray(result.data)) {
        return result.data.map((candle: any) => ({
          timestamp: new Date(candle.timestamp).getTime(),
          open: parseFloat(candle.open),
          high: parseFloat(candle.high),
          low: parseFloat(candle.low),
          close: parseFloat(candle.close),
          volume: parseInt(candle.volume)
        }));
      }

      // Handle array format response (open, high, low, close arrays)
      if (result.open && result.close && result.timestamp) {
        const candles = [];
        const length = result.timestamp.length;
        
        for (let i = 0; i < length; i++) {
          candles.push({
            timestamp: result.timestamp[i] * 1000, // Convert to milliseconds
            open: parseFloat(result.open[i]),
            high: parseFloat(result.high[i]),
            low: parseFloat(result.low[i]),
            close: parseFloat(result.close[i]),
            volume: parseInt(result.volume[i] || 0)
          });
        }
        
        return candles;
      }

      return [];
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }

  // Place order
  async placeOrder(orderRequest: OrderRequest): Promise<OrderResponse> {
    try {
      // ========== VALIDATION BEFORE API CALL ==========
      
      // 1. Validate Security ID format
      if (!orderRequest.securityId || orderRequest.securityId.trim() === '') {
        console.error('❌ VALIDATION FAILED: Security ID is EMPTY!');
        console.error('   orderRequest.securityId:', orderRequest.securityId);
        throw new Error('Security ID is required and cannot be empty');
      }

      // 2. Check if user is trying to trade INDEX directly (common mistake!)
      const securityId = orderRequest.securityId.toString().trim();
      if (securityId === '13' || securityId === '25' || 
          securityId === 'NIFTY' || securityId === 'BANKNIFTY') {
        throw new Error(
          `❌ INVALID SECURITY ID: You cannot trade indices directly!\n\n` +
          `You entered: ${securityId}\n\n` +
          `➡️ SOLUTION:\n` +
          `1. Go to Dhan Options Chain: https://web.dhan.co/options-chain\n` +
          `2. Select ${securityId === '13' || securityId === 'NIFTY' ? 'NIFTY' : 'BANKNIFTY'}\n` +
          `3. Choose expiry date and strike price\n` +
          `4. Click CE (Call) or PE (Put) option\n` +
          `5. Copy the ACTUAL OPTION CONTRACT SECURITY ID (e.g., 53412)\n` +
          `6. Use that ID in Symbol Manager\n\n` +
          `Index IDs (13/25) are for market data ONLY, not for trading!`
        );
      }

      // 3. Validate product type + exchange segment combinations
      const exchangeSegment = orderRequest.exchangeSegment || 'NSE_FNO';
      const productType = orderRequest.productType;
      
      // ⚡ CRITICAL: Validate exchange segment format
      const validExchangeSegments = ['NSE_EQ', 'NSE_FNO', 'NSE_CURR', 'BSE_EQ', 'BSE_FNO', 'BSE_CURR', 'MCX_COMM'];
      if (!validExchangeSegments.includes(exchangeSegment)) {
        throw new Error(
          `❌ INVALID EXCHANGE SEGMENT: ${exchangeSegment}\n\n` +
          `Valid segments: ${validExchangeSegments.join(', ')}\n\n` +
          `Common fix:\n` +
          `• For NIFTY/BANKNIFTY options: Use NSE_FNO\n` +
          `• For SENSEX options: Use BSE_FNO\n` +
          `• For equity delivery: Use NSE_EQ or BSE_EQ`
        );
      }

      // F&O exchanges only support certain product types
      if ((exchangeSegment === 'NSE_FNO' || exchangeSegment === 'BSE_FNO') && 
          !['INTRADAY', 'MARGIN', 'CO', 'BO'].includes(productType)) {
        throw new Error(
          `❌ INVALID PRODUCT TYPE FOR F&O\n\n` +
          `Exchange: ${exchangeSegment}\n` +
          `Product Type: ${productType}\n\n` +
          `➡️ For F&O trading, use:\n` +
          `• INTRADAY - Day trading with margin\n` +
          `• MARGIN - Leveraged positions\n` +
          `• CO - Cover Order with stop loss\n` +
          `• BO - Bracket Order with target + SL\n\n` +
          `(CNC is for delivery in equity segment only)`
        );
      }

      // 4. Validate order type requirements
      if (orderRequest.orderType === 'LIMIT' && !orderRequest.price) {
        throw new Error('Price is required for LIMIT orders');
      }

      if ((orderRequest.orderType === 'STOP_LOSS' || orderRequest.orderType === 'STOP_LOSS_MARKET') 
          && !orderRequest.triggerPrice) {
        throw new Error('Trigger price is required for STOP_LOSS orders');
      }

      // 5. Validate quantity (must be positive and within lot size)
      if (!orderRequest.quantity || orderRequest.quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // 6. Validate AMO settings
      if (orderRequest.amoTime && !orderRequest.afterMarketOrder) {
        throw new Error('amoTime can only be set when afterMarketOrder is true');
      }

      // 7. Validate Bracket/Cover order requirements
      if (productType === 'BO' && (!orderRequest.boProfitValue || !orderRequest.boStopLossValue)) {
        throw new Error('Bracket Order requires both boProfitValue and boStopLossValue');
      }

      if (productType === 'CO' && !orderRequest.boStopLossValue) {
        throw new Error('Cover Order requires boStopLossValue');
      }

      // ========== BUILD ORDER REQUEST ==========
      
      // ✅ CRITICAL: Ensure proper type coercion for all fields - EXACTLY matching Dhan API spec
      const dhanOrder: any = {
        dhanClientId: String(this.clientId),
        correlationId: String(orderRequest.correlationId || `ORDER_${Date.now()}`),
        transactionType: String(orderRequest.transactionType), // BUY or SELL
        exchangeSegment: String(exchangeSegment), // NSE_FNO, BSE_FNO, etc.
        productType: String(orderRequest.productType), // INTRADAY, MARGIN, CO, BO, CNC, MTF
        orderType: String(orderRequest.orderType), // MARKET, LIMIT, STOP_LOSS, STOP_LOSS_MARKET
        validity: String(orderRequest.validity || 'DAY'), // DAY or IOC
        securityId: String(securityId), // Must be string
        quantity: Number(orderRequest.quantity), // Must be number
        disclosedQuantity: Number(orderRequest.disclosedQuantity || 0), // Must be number
        price: Number(orderRequest.price || 0), // Must be number
        triggerPrice: Number(orderRequest.triggerPrice || 0), // Must be number
        afterMarketOrder: Boolean(orderRequest.afterMarketOrder) // Must be boolean
      };
      
      // ✅ CRITICAL: Replace NaN with 0 and validate numeric types
      if (isNaN(dhanOrder.quantity) || dhanOrder.quantity === null || dhanOrder.quantity === undefined) {
        throw new Error(`Invalid quantity: ${orderRequest.quantity}. Must be a positive number.`);
      }
      if (isNaN(dhanOrder.disclosedQuantity)) dhanOrder.disclosedQuantity = 0;
      if (isNaN(dhanOrder.price)) dhanOrder.price = 0;
      if (isNaN(dhanOrder.triggerPrice)) dhanOrder.triggerPrice = 0;
      
      // ✅ Only add amoTime if afterMarketOrder is true
      if (orderRequest.afterMarketOrder && orderRequest.amoTime) {
        const validAmoTimes = ['OPEN', 'OPEN_30', 'OPEN_60'];
        if (validAmoTimes.includes(String(orderRequest.amoTime))) {
          dhanOrder.amoTime = String(orderRequest.amoTime);
        } else {
          console.warn(`⚠️ Invalid amoTime value: ${orderRequest.amoTime}. Skipping.`);
        }
      }
      
      // ✅ Only add BO values if product type is BO
      if (orderRequest.productType === 'BO') {
        if (orderRequest.boProfitValue) {
          const boProfitValue = Number(orderRequest.boProfitValue);
          if (!isNaN(boProfitValue) && boProfitValue > 0) {
            dhanOrder.boProfitValue = boProfitValue;
          }
        }
        if (orderRequest.boStopLossValue) {
          const boStopLossValue = Number(orderRequest.boStopLossValue);
          if (!isNaN(boStopLossValue) && boStopLossValue > 0) {
            dhanOrder.boStopLossValue = boStopLossValue;
          }
        }
      }
      
      // ✅ Only add CO stop loss if product type is CO
      if (orderRequest.productType === 'CO' && orderRequest.boStopLossValue) {
        const boStopLossValue = Number(orderRequest.boStopLossValue);
        if (!isNaN(boStopLossValue) && boStopLossValue > 0) {
          dhanOrder.boStopLossValue = boStopLossValue;
        }
      }

      // ⚡ CRITICAL VALIDATION: Log each field's type and value
      console.log('🔍 ========== FIELD-BY-FIELD VALIDATION ==========');
      console.log('dhanClientId:', dhanOrder.dhanClientId, '| Type:', typeof dhanOrder.dhanClientId, '| Required: string');
      console.log('correlationId:', dhanOrder.correlationId, '| Type:', typeof dhanOrder.correlationId, '| Required: string');
      console.log('securityId:', dhanOrder.securityId, '| Type:', typeof dhanOrder.securityId, '| Required: string');
      console.log('transactionType:', dhanOrder.transactionType, '| Type:', typeof dhanOrder.transactionType, '| Required: string (BUY/SELL)');
      console.log('exchangeSegment:', dhanOrder.exchangeSegment, '| Type:', typeof dhanOrder.exchangeSegment, '| Required: string');
      console.log('productType:', dhanOrder.productType, '| Type:', typeof dhanOrder.productType, '| Required: string');
      console.log('orderType:', dhanOrder.orderType, '| Type:', typeof dhanOrder.orderType, '| Required: string');
      console.log('validity:', dhanOrder.validity, '| Type:', typeof dhanOrder.validity, '| Required: string');
      console.log('quantity:', dhanOrder.quantity, '| Type:', typeof dhanOrder.quantity, '| Required: number');
      console.log('disclosedQuantity:', dhanOrder.disclosedQuantity, '| Type:', typeof dhanOrder.disclosedQuantity, '| Required: number');
      console.log('price:', dhanOrder.price, '| Type:', typeof dhanOrder.price, '| Required: number');
      console.log('triggerPrice:', dhanOrder.triggerPrice, '| Type:', typeof dhanOrder.triggerPrice, '| Required: number');
      console.log('afterMarketOrder:', dhanOrder.afterMarketOrder, '| Type:', typeof dhanOrder.afterMarketOrder, '| Required: boolean');
      if (dhanOrder.amoTime) console.log('amoTime:', dhanOrder.amoTime, '| Type:', typeof dhanOrder.amoTime, '| Optional: string');
      if (dhanOrder.boProfitValue) console.log('boProfitValue:', dhanOrder.boProfitValue, '| Type:', typeof dhanOrder.boProfitValue, '| Optional: number');
      if (dhanOrder.boStopLossValue) console.log('boStopLossValue:', dhanOrder.boStopLossValue, '| Type:', typeof dhanOrder.boStopLossValue, '| Optional: number');
      console.log('🔍 ================================================');

      console.log('📤 Placing Dhan Order:', JSON.stringify({
        ...dhanOrder,
        securityId: dhanOrder.securityId,
        type: `${dhanOrder.transactionType} ${dhanOrder.productType} ${dhanOrder.orderType}`,
        quantity: dhanOrder.quantity
      }, null, 2));
      
      // ⚡ CRITICAL DEBUG: Log EXACT payload being sent
      const payload = JSON.stringify(dhanOrder);
      console.log('🔍 EXACT PAYLOAD BEING SENT TO DHAN API:');
      console.log(payload);
      console.log('🔍 PAYLOAD SIZE:', payload.length, 'bytes');
      console.log('🔍 REQUEST HEADERS:', {
        'Content-Type': 'application/json',
        'access-token': `${this.accessToken.substring(0, 10)}...`,
      });

      const response = await fetch('https://api.dhan.co/v2/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access-token': this.accessToken,
        },
        body: payload
      });
      
      const responseText = await response.text();
      console.log('📥 Dhan API Response Status:', response.status);
      console.log('📥 Dhan API Response Text:', responseText);

      // ⚡ CRITICAL: Check if response is actually successful
      if (!response.ok) {
        // Parse error response
        let errorMessage = responseText;
        try {
          const errorData = JSON.parse(responseText);
          console.error('❌ Dhan API Error Response:', JSON.stringify(errorData, null, 2));
          
          // ⚡ ENHANCED ERROR MESSAGES FOR COMMON ERRORS
          if (errorData.errorCode === 'DH-905') {
            errorMessage = 
              `❌ DH-905: Invalid/Insufficient Parameters\n\n` +
              `This error means one or more parameters are incorrect or missing.\n\n` +
              `CHECKLIST:\n` +
              `✓ Security ID: ${securityId} (Must be valid option contract ID)\n` +
              `✓ Exchange Segment: ${exchangeSegment} (NSE_FNO for NIFTY/BANKNIFTY, BSE_FNO for SENSEX)\n` +
              `✓ Product Type: ${productType} (Use INTRADAY for F&O)\n` +
              `✓ Order Type: ${orderRequest.orderType}\n` +
              `✓ Quantity: ${dhanOrder.quantity} (Must be > 0)\n` +
              `✓ Transaction Type: ${dhanOrder.transactionType} (BUY or SELL)\n\n` +
              `COMMON FIXES:\n` +
              `1. Verify Security ID from Dhan Options Chain: https://web.dhan.co/options-chain\n` +
              `2. For SENSEX options, use BSE_FNO (not NSE_FNO)\n` +
              `3. For NIFTY/BANKNIFTY options, use NSE_FNO (not BSE_FNO)\n` +
              `4. Ensure Product Type is INTRADAY for F&O (not CNC)\n` +
              `5. Check if all numeric values are valid numbers (not NaN)\n\n` +
              `Original Error: ${errorData.errorMessage || 'No details provided'}`;
          } else if (errorData.errorCode === 'DH-906') {
            // Provide specific help for DH-906 error
            errorMessage = 
              `❌ DH-906: Trades not allowed for this Product/Scrip\n\n` +
              `This usually means:\n` +
              `1. Security ID ${securityId} is invalid or not tradeable\n` +
              `2. Product type ${productType} is not allowed for this scrip\n` +
              `3. Exchange segment ${exchangeSegment} is incorrect\n\n` +
              `➡️ SOLUTIONS:\n` +
              `• For OPTIONS: Get security ID from https://web.dhan.co/options-chain\n` +
              `• For F&O: Use NSE_FNO exchange segment\n` +
              `• For F&O: Use INTRADAY product type (not CNC)\n` +
              `• Verify security ID exists in Dhan's master: https://images.dhan.co/api-data/api-scrip-master.csv\n\n` +
              `Current Order Details:\n` +
              `• Security ID: ${securityId}\n` +
              `• Product Type: ${productType}\n` +
              `• Exchange Segment: ${exchangeSegment}\n` +
              `• Order Type: ${orderRequest.orderType}\n\n` +
              `Original Error: ${errorData.errorMessage}`;
          } else if (errorData.errorMessage) {
            errorMessage = `Dhan API Error [${errorData.errorCode}]: ${errorData.errorMessage}`;
          }
        } catch (e) {
          // Use raw response if not JSON
          console.error('❌ Failed to parse error response:', e);
        }
        
        console.error('❌ THROWING ERROR - Order placement failed!');
        throw new Error(errorMessage);
      }

      // ⚡ CRITICAL: Parse and validate successful response
      let result;
      try {
        result = JSON.parse(responseText);
        console.log('📊 Parsed Dhan API Response:', JSON.stringify(result, null, 2));
      } catch (e) {
        console.error('❌ Failed to parse success response:', e);
        throw new Error(`Invalid response from Dhan API: ${responseText}`);
      }

      // ⚡ CRITICAL VALIDATION: Check if orderId exists
      if (!result.orderId && !result.data?.orderId) {
        console.error('❌ CRITICAL: No orderId in response!');
        console.error('📊 Full response:', JSON.stringify(result, null, 2));
        throw new Error(`Order placement failed: No orderId returned. Response: ${responseText}`);
      }
      
      const orderId = result.orderId || result.data?.orderId;
      const orderStatus = result.orderStatus || result.status || 'PENDING';
      
      console.log('✅ ✅ ✅ Order Placed Successfully at Dhan!');
      console.log(`  Order ID: ${orderId}`);
      console.log(`  Status: ${orderStatus}`);
      console.log(`  Message: ${result.remarks || 'Success'}`);

      // ⚡ Return success only if orderId exists
      return {
        success: true,
        orderId: orderId,
        orderStatus: orderStatus,
        message: result.remarks || 'Order placed successfully',
        price: result.price
      };
    } catch (error: any) {
      console.error('❌ ❌ ❌ Order Placement Exception!');
      console.error('   Error Message:', error.message);
      console.error('   Error Stack:', error.stack);
      
      // ⚡ Return failure
      return {
        success: false,
        orderId: '',
        orderStatus: 'REJECTED',
        message: error.message || 'Order placement failed'
      };
    }
  }

  // Place bracket order with target and stop loss
  async placeBracketOrder(params: BracketOrderRequest): Promise<OrderResponse> {
    try {
      return await this.placeOrder({
        securityId: params.securityId,
        transactionType: params.transactionType,
        quantity: params.quantity,
        orderType: 'LIMIT',
        productType: 'BO',
        exchangeSegment: params.exchangeSegment || 'NSE_FNO',
        price: params.price,
        validity: 'DAY',
        boProfitValue: params.targetPrice,
        boStopLossValue: params.stopLossPrice,
        correlationId: `BO_${Date.now()}`
      });
    } catch (error: any) {
      console.error('Error placing bracket order:', error);
      return {
        orderId: '',
        orderStatus: 'REJECTED',
        message: error.message || 'Bracket order failed'
      };
    }
  }

  // Place cover order with stop loss
  async placeCoverOrder(params: CoverOrderRequest): Promise<OrderResponse> {
    try {
      return await this.placeOrder({
        securityId: params.securityId,
        transactionType: params.transactionType,
        quantity: params.quantity,
        orderType: 'LIMIT',
        productType: 'CO',
        exchangeSegment: params.exchangeSegment || 'NSE_FNO',
        price: params.price,
        validity: 'DAY',
        boStopLossValue: params.stopLossPrice,
        correlationId: `CO_${Date.now()}`
      });
    } catch (error: any) {
      console.error('Error placing cover order:', error);
      return {
        orderId: '',
        orderStatus: 'REJECTED',
        message: error.message || 'Cover order failed'
      };
    }
  }

  // Get positions
  async getPositions(): Promise<Position[]> {
    try {
      const response = await this.retryFetch(
        'https://api.dhan.co/v2/positions',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'access-token': this.accessToken,
            'client-id': this.clientId
          }
        },
        'Get Positions'
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        // Parse error to check for DH-901 (expired token)
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.errorCode === 'DH-901') {
            console.log('🔑 DH-901: Dhan Access Token expired - silently returning empty positions');
            // Return empty array instead of throwing - let frontend handle auth error
            return [];
          }
        } catch (e) {
          // Not JSON, continue
        }
        throw new Error(`Dhan API Error: ${errorText}`);
      }

      const result = await response.json();
      
      // ⚡ SILENT MODE - Only log errors, not successful fetches (called every 1 second)
      
      // ⚡ FIX: Dhan API returns ARRAY directly, not wrapped in { data: [] }
      let positionsArray = [];
      
      if (Array.isArray(result)) {
        positionsArray = result;
      } else if (result.data && Array.isArray(result.data)) {
        positionsArray = result.data;
      } else {
        console.log('⚠️ Unrecognized positions response format');
        return [];
      }
      
      if (positionsArray.length === 0) {
        return [];
      }
      
      // Map positions silently
      const mappedPositions = await Promise.all(positionsArray.map(async (pos: any) => {
        const securityId = String(pos.securityId || '');
        const exchangeSegment = pos.exchangeSegment || pos.exchange || (String(pos.tradingSymbol || '').includes('SENSEX') ? 'BSE_FNO' : 'NSE_FNO');
        let livePrice = parseFloat(pos.lastPrice || pos.ltp || pos.lastTradedPrice || pos.currentPrice || 0);

        if ((!livePrice || livePrice <= 0) && securityId) {
          try {
            const quote = await this.getMarketQuote(securityId, exchangeSegment);
            livePrice = Number(quote?.ltp || quote?.close || 0);
          } catch (quoteError) {
            console.warn(`⚠️ Position live quote fallback failed for ${securityId}:`, quoteError?.message || quoteError);
          }
        }

        const netQty = Number(pos.netQty ?? (Number(pos.buyQty || 0) - Number(pos.sellQty || 0)));
        const avgPrice = parseFloat(pos.avgPrice || pos.buyAvg || pos.sellAvg || pos.costPrice || 0);
        const apiUnrealized = parseFloat(pos.unrealizedProfit || pos.unrealizedPnl || pos.unrealizedPnL || 0);
        const computedUnrealized = avgPrice && livePrice && netQty ? (livePrice - avgPrice) * netQty : 0;

        return {
        // Preserve all original Dhan API fields
        ...pos,
        // Add normalized fields for easier access
        securityId,
        exchangeSegment,
        lastPrice: livePrice,
        ltp: livePrice,
        quantity: netQty,
        averagePrice: avgPrice,
        currentPrice: livePrice,
        pnl: parseFloat(pos.realizedProfit || 0) + (apiUnrealized || computedUnrealized),
        realizedPnl: parseFloat(pos.realizedProfit || 0),
        unrealizedPnl: apiUnrealized || computedUnrealized,
        unrealizedProfit: apiUnrealized || computedUnrealized
        };
      }));
      
      return mappedPositions;
    } catch (error) {
      console.error('❌ Error fetching positions:', error);
      throw error;
    }
  }

  // Get order status
  async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await fetch(`https://api.dhan.co/v2/orders/${orderId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access-token': this.accessToken,
          'client-id': this.clientId
        }
      });
      return await response.json();
    } catch (error) {
      console.error('Error fetching order status:', error);
      throw error;
    }
  }

  // Cancel order
  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await fetch(`https://api.dhan.co/v2/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'access-token': this.accessToken,
          'client-id': this.clientId
        }
      });
      return response.ok;
    } catch (error) {
      console.error('Error canceling order:', error);
      return false;
    }
  }

  // Get fund limits
  async getFundLimits(): Promise<any> {
    try {
      const response = await this.retryFetch(
        'https://api.dhan.co/v2/fundlimit',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'access-token': this.accessToken,
          }
        },
        'Get Fund Limits'
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Dhan Fund Limit API Error Response:', error);
        // Check for DH-901 auth error
        try {
          const errorData = JSON.parse(error);
          if (errorData.errorCode === 'DH-901') {
            console.log('🔑 DH-901: Dhan Access Token expired - returning empty fund data');
            return {
              sodLimit: 0,
              availableBalance: 0,
              collateralAmount: 0,
              utilizationAmount: 0,
              blockedPayinAmount: 0,
              blockedPayoutAmount: 0
            };
          }
        } catch (e) {
          // Not JSON, continue
        }
        throw new Error(`Dhan Fund Limit API Error: ${error}`);
      }

      const result = await response.json();
      console.log('Dhan Fund Limit Response:', JSON.stringify(result, null, 2));
      
      // Dhan API may return different structures
      // Try multiple response formats
      const fundData = result.data || result;
      
      if (fundData) {
        const transformed = {
          sodLimit: parseFloat(fundData.sodLimit || fundData.totalLimit || 0),
          availableBalance: parseFloat(fundData.availabelBalance || fundData.availableBalance || fundData.available || 0),
          collateralAmount: parseFloat(fundData.collateralAmount || fundData.collateral || 0),
          utilizationAmount: parseFloat(fundData.utilizedAmount || fundData.utilizationAmount || fundData.utilized || 0),
          blockedPayinAmount: parseFloat(fundData.blockedPayinAmount || fundData.blockedPayin || 0),
          blockedPayoutAmount: parseFloat(fundData.blockedPayoutAmount || fundData.blockedPayout || 0)
        };
        
        console.log('Transformed Fund Data:', JSON.stringify(transformed, null, 2));
        return transformed;
      }

      throw new Error('No fund limit data in response');
    } catch (error) {
      console.error('Error fetching fund limits:', error);
      throw error;
    }
  }
}

interface OrderRequest {
  securityId: string;
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  orderType: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
  productType: 'INTRADAY' | 'CNC' | 'MARGIN' | 'MTF' | 'CO' | 'BO';
  price?: number;
  triggerPrice?: number;
  afterMarketOrder?: boolean;
  amoTime?: 'PRE_OPEN' | 'OPEN' | 'OPEN_30' | 'OPEN_60';
  boProfitValue?: number;
  boStopLossValue?: number;
  disclosedQuantity?: number;
  validity?: 'DAY' | 'IOC';
  correlationId?: string;
  exchangeSegment?: 'NSE_FNO' | 'NSE_EQ' | 'BSE_FNO' | 'BSE_EQ' | 'IDX_I' | 'MCX_COMM' | 'NSE_CURR' | 'BSE_CURR';
}

interface OrderResponse {
  success: boolean; // ⚡ CRITICAL FIX!
  orderId: string;
  orderStatus: string;
  message: string;
  price?: number;
}

interface Position {
  securityId: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  pnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BracketOrderRequest {
  securityId: string;
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  targetPrice: number;
  stopLossPrice: number;
  exchangeSegment?: 'NSE_FNO' | 'NSE_EQ' | 'BSE_FNO' | 'BSE_EQ';
}

interface CoverOrderRequest {
  securityId: string;
  transactionType: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  stopLossPrice: number;
  exchangeSegment?: 'NSE_FNO' | 'NSE_EQ' | 'BSE_FNO' | 'BSE_EQ';
}