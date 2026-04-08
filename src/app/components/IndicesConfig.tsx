// Indian Indices Configuration for Dhan API
// Contains security IDs and metadata for all supported indices

export interface IndexConfig {
  id: string;
  name: string;
  displayName: string;
  securityId: string;
  exchangeSegment: string;
  lotSize: number;
  strikeGap: number;
  expiryType: 'WEEKLY' | 'MONTHLY';
  tradingSymbol: string;
}

// Dhan API Index Security IDs and Configuration
export const INDICES_CONFIG: { [key: string]: IndexConfig } = {
  NIFTY: {
    id: 'NIFTY',
    name: 'NIFTY',
    displayName: 'NIFTY 50',
    securityId: '13', // Dhan security ID for NIFTY 50
    exchangeSegment: 'IDX_I',
    lotSize: 50,
    strikeGap: 50,
    expiryType: 'WEEKLY',
    tradingSymbol: 'NIFTY'
  },
  BANKNIFTY: {
    id: 'BANKNIFTY',
    name: 'BANKNIFTY',
    displayName: 'BANK NIFTY',
    securityId: '25', // Dhan security ID for BANK NIFTY
    exchangeSegment: 'IDX_I',
    lotSize: 15,
    strikeGap: 100,
    expiryType: 'WEEKLY',
    tradingSymbol: 'BANKNIFTY'
  },
  FINNIFTY: {
    id: 'FINNIFTY',
    name: 'FINNIFTY',
    displayName: 'NIFTY FIN SERVICE',
    securityId: '27', // Dhan security ID for FIN NIFTY
    exchangeSegment: 'IDX_I',
    lotSize: 40,
    strikeGap: 50,
    expiryType: 'WEEKLY',
    tradingSymbol: 'FINNIFTY'
  },
  MIDCPNIFTY: {
    id: 'MIDCPNIFTY',
    name: 'MIDCPNIFTY',
    displayName: 'NIFTY MIDCAP SELECT',
    securityId: '28', // Dhan security ID for MIDCAP NIFTY
    exchangeSegment: 'IDX_I',
    lotSize: 75,
    strikeGap: 25,
    expiryType: 'MONTHLY',
    tradingSymbol: 'MIDCPNIFTY'
  },
  SENSEX: {
    id: 'SENSEX',
    name: 'SENSEX',
    displayName: 'BSE SENSEX',
    securityId: '51', // Dhan security ID for SENSEX
    exchangeSegment: 'IDX_I', // Updated to IDX_I for index instrument
    lotSize: 10,
    strikeGap: 100,
    expiryType: 'WEEKLY',
    tradingSymbol: 'SENSEX'
  }
};

// Get all available indices as array
export const ALL_INDICES = Object.values(INDICES_CONFIG);

// Get index config by ID
export function getIndexConfig(indexId: string): IndexConfig | undefined {
  return INDICES_CONFIG[indexId];
}

// Get index security ID
export function getSecurityId(indexId: string): string {
  return INDICES_CONFIG[indexId]?.securityId || '13';
}

// Get index display name
export function getIndexDisplayName(indexId: string): string {
  return INDICES_CONFIG[indexId]?.displayName || indexId;
}

// Calculate nearest strike based on LTP and strike gap
export function getNearestStrike(ltp: number, strikeGap: number): number {
  return Math.round(ltp / strikeGap) * strikeGap;
}

// Generate ATM strikes (At The Money)
export function generateATMStrikes(ltp: number, indexId: string, count: number = 10): number[] {
  const config = getIndexConfig(indexId);
  if (!config) return [];

  const atmStrike = getNearestStrike(ltp, config.strikeGap);
  const strikes: number[] = [];
  
  const halfCount = Math.floor(count / 2);
  for (let i = -halfCount; i <= halfCount; i++) {
    strikes.push(atmStrike + (i * config.strikeGap));
  }
  
  return strikes.sort((a, b) => a - b);
}

// Get expiry date (next Thursday for weekly, last Thursday of month for monthly)
export function getNextExpiry(expiryType: 'WEEKLY' | 'MONTHLY'): Date {
  const now = new Date();
  
  if (expiryType === 'WEEKLY') {
    // Next Thursday
    const dayOfWeek = now.getDay();
    const daysUntilThursday = (4 - dayOfWeek + 7) % 7;
    const nextThursday = new Date(now);
    nextThursday.setDate(now.getDate() + (daysUntilThursday === 0 ? 7 : daysUntilThursday));
    nextThursday.setHours(15, 30, 0, 0);
    return nextThursday;
  } else {
    // Last Thursday of current month
    const year = now.getFullYear();
    const month = now.getMonth();
    const lastDay = new Date(year, month + 1, 0);
    const lastDayOfWeek = lastDay.getDay();
    
    // Find last Thursday
    const daysFromThursday = (lastDayOfWeek - 4 + 7) % 7;
    const lastThursday = new Date(lastDay);
    lastThursday.setDate(lastDay.getDate() - daysFromThursday);
    lastThursday.setHours(15, 30, 0, 0);
    
    // If we're past last Thursday, get next month's last Thursday
    if (now > lastThursday) {
      const nextMonth = new Date(year, month + 2, 0);
      const nextMonthLastDay = nextMonth.getDay();
      const nextDaysFromThursday = (nextMonthLastDay - 4 + 7) % 7;
      const nextLastThursday = new Date(nextMonth);
      nextLastThursday.setDate(nextMonth.getDate() - nextDaysFromThursday);
      nextLastThursday.setHours(15, 30, 0, 0);
      return nextLastThursday;
    }
    
    return lastThursday;
  }
}

// Format expiry date for display
export function formatExpiry(date: Date): string {
  const day = date.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}${month}${year}`;
}

// Get days to expiry
export function getDaysToExpiry(expiryDate: Date): number {
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

// Check if market is open for trading
export function isMarketOpen(): {
  isOpen: boolean;
  message: string;
  status: 'OPEN' | 'CLOSED' | 'WEEKEND' | 'HOLIDAY';
} {
  const now = new Date();
  
  // Check weekend
  const day = now.getDay();
  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      message: 'Market closed - Weekend',
      status: 'WEEKEND'
    };
  }
  
  // Convert to IST
  const istOffset = 5.5 * 60;
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
      message: 'Market is OPEN',
      status: 'OPEN'
    };
  }
  
  return {
    isOpen: false,
    message: `Market closed - Opens at 9:15 AM IST`,
    status: 'CLOSED'
  };
}

// Option type
export type OptionType = 'CE' | 'PE';

// Generate option symbol for trading
export function generateOptionSymbol(
  indexId: string,
  strike: number,
  optionType: OptionType,
  expiryDate: Date
): string {
  const config = getIndexConfig(indexId);
  if (!config) return '';
  
  const expiry = formatExpiry(expiryDate);
  return `${config.tradingSymbol}${expiry}${strike}${optionType}`;
}

// Parse option data from CSV
export interface OptionData {
  symbol: string;
  securityId: string;
  strike: number;
  optionType: OptionType;
  expiry: string;
  expiryDate: Date;
  indexName: string;
}

export function parseOptionFromCSV(row: any, indexName: string): OptionData | null {
  try {
    return {
      symbol: row.SEM_TRADING_SYMBOL || row.symbol || '',
      securityId: row.SEM_SMST_SECURITY_ID || row.securityId || '',
      strike: parseFloat(row.SEM_STRIKE_PRICE || row.strike || '0'),
      optionType: (row.SEM_OPTION_TYPE || row.optionType || 'CE') as OptionType,
      expiry: row.SEM_EXPIRY_DATE || row.expiry || '',
      expiryDate: new Date(row.SEM_EXPIRY_DATE || row.expiry || Date.now()),
      indexName
    };
  } catch (error) {
    console.error('Error parsing option data:', error);
    return null;
  }
}