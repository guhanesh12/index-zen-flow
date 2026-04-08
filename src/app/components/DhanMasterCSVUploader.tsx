import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Upload, Search, Plus, FileDown, AlertCircle, CheckCircle, X, Settings, Minus, TrendingUp } from "lucide-react";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { instrumentStorage } from '../utils/instrumentStorage';

interface DhanInstrument {
  securityId: string;
  customSymbol: string;
  tradingSymbol: string;
  instrumentName: string;
  instrumentType: string;
  expiry: string;
  strikePrice: number;
  optionType: 'CE' | 'PE' | '';
  lotSize: number;
  underlying: string;
  exchangeSegment: string;
}

interface OrderConfig {
  transactionType: 'BUY' | 'SELL';
  productType: 'INTRADAY' | 'CNC' | 'MARGIN' | 'MTF' | 'CO' | 'BO';
  orderType: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
  validity: 'DAY' | 'IOC';
  quantity: number;
  targetAmount: number;
  stopLossAmount: number;
  price: number;
  triggerPrice: number;
}

interface DhanMasterCSVUploaderProps {
  onSymbolAdd: (symbol: any) => void;
  serverUrl: string;
  accessToken: string;
  currentNiftyPrice?: number;  // Current NIFTY spot price
  currentBankNiftyPrice?: number;  // Current BANKNIFTY spot price
}

export function DhanMasterCSVUploader({ 
  onSymbolAdd, 
  serverUrl, 
  accessToken,
  currentNiftyPrice,
  currentBankNiftyPrice 
}: DhanMasterCSVUploaderProps) {
  const [instruments, setInstruments] = useState<DhanInstrument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInstrument, setSelectedInstrument] = useState<DhanInstrument | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showOrderConfig, setShowOrderConfig] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store target/stop loss for each instrument temporarily
  const [instrumentConfigs, setInstrumentConfigs] = useState<Record<string, { target: number; stopLoss: number }>>({});

  // Order configuration with defaults
  const [orderConfig, setOrderConfig] = useState<OrderConfig>({
    transactionType: 'BUY',
    productType: 'INTRADAY',
    orderType: 'MARKET',
    validity: 'DAY',
    quantity: 0, // Will be set to lotSize by default
    targetAmount: 3000, // Default target
    stopLossAmount: 2000, // Default stop loss
    price: 0,
    triggerPrice: 0
  });

  // Filter options
  const [filterIndex, setFilterIndex] = useState<'ALL' | 'NIFTY' | 'BANKNIFTY' | 'SENSEX'>('ALL');
  const [filterOptionType, setFilterOptionType] = useState<'ALL' | 'CE' | 'PE'>('ALL');
  const [loading, setLoading] = useState(false);

  // ✅ Load instruments from IndexedDB (Admin's uploaded data) on mount
  useEffect(() => {
    loadInstrumentsFromIndexedDB();
  }, []);

  const loadInstrumentsFromIndexedDB = async () => {
    setLoading(true);
    try {
      const adminInstruments = await instrumentStorage.getAllInstruments();
      
      if (adminInstruments && adminInstruments.length > 0) {
        // Convert admin instruments format to DhanInstrument format
        const convertedInstruments: DhanInstrument[] = adminInstruments.map(inst => ({
          securityId: inst.securityId || '',
          customSymbol: inst.tradingSymbol || inst.symbol || '',
          tradingSymbol: inst.tradingSymbol || inst.symbol || '',
          instrumentName: inst.tradingSymbol || '',
          instrumentType: inst.instrumentType || 'OPTIDX',
          expiry: inst.expiry || '',
          strikePrice: parseFloat(inst.strike) || 0,
          optionType: inst.optionType === 'CALL' ? 'CE' : inst.optionType === 'PUT' ? 'PE' : '',
          lotSize: inst.lotSize || 25,
          underlying: inst.underlyingSymbol || '',
          exchangeSegment: inst.exchange || 'NSE_FNO'
        }));

        setInstruments(convertedInstruments);
        console.log(`✅ Loaded ${convertedInstruments.length} instruments from admin's IndexedDB`);
        setSuccess(`✅ Loaded ${convertedInstruments.length} instruments from centralized database`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        console.log('ℹ️ No instruments found in IndexedDB. Admin needs to upload first.');
        setError('No instruments found. Please ask admin to upload Dhan CSV file first.');
      }
    } catch (err: any) {
      console.error('❌ Error loading from IndexedDB:', err);
      setError('Failed to load instruments from database');
    } finally {
      setLoading(false);
    }
  };

  const parseDhanMasterCSV = (text: string): DhanInstrument[] => {
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file is empty or invalid');
    }

    // Parse headers (first row) - handle both comma and potential other delimiters
    const headerLine = lines[0];
    let headers: string[] = [];
    
    // Try parsing CSV with proper quote handling
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            current += '"';
            i++; // Skip next quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    headers = parseCSVLine(headerLine);
    
    console.log(`📊 Total columns found: ${headers.length}`);
    console.log(`📋 First 30 headers:`, headers.slice(0, 30));
    
    // More flexible column detection - check multiple possible names
    const findColumnIndex = (possibleNames: string[]): number => {
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i].trim().toUpperCase().replace(/[\s_-]/g, '');
        for (const name of possibleNames) {
          const cleanName = name.toUpperCase().replace(/[\s_-]/g, '');
          if (header === cleanName || header.includes(cleanName) || cleanName.includes(header)) {
            console.log(`✅ Found column "${name}" at index ${i}: "${headers[i]}"`);
            return i;
          }
        }
      }
      return -1;
    };

    const columnIndices = {
      securityId: findColumnIndex([
        'SEM_SMST_SECURITY_ID', 
        'SECURITYID', 
        'SECURITY_ID',
        'SEMSMST',
        'SM_SECURITY_ID'
      ]),
      customSymbol: findColumnIndex([
        'SEM_CUSTOM_SYMBOL', 
        'CUSTOMSYMBOL', 
        'CUSTOM_SYMBOL',
        'SEMCUSTOM'
      ]),
      tradingSymbol: findColumnIndex([
        'SEM_TRADING_SYMBOL', 
        'TRADINGSYMBOL', 
        'TRADING_SYMBOL',
        'SEMTRADING',
        'SYMBOL'
      ]),
      instrumentName: findColumnIndex([
        'SEM_INSTRUMENT_NAME', 
        'INSTRUMENTNAME', 
        'INSTRUMENT_NAME',
        'SEMINSTRUMENT'
      ]),
      instrumentType: findColumnIndex([
        'SEM_EXCH_INSTRUMENT_TYPE', 
        'INSTRUMENTTYPE', 
        'INSTRUMENT_TYPE',
        'SEMEXCHINSTRUMENT'
      ]),
      expiry: findColumnIndex([
        'SEM_EXPIRY_DATE', 
        'EXPIRYDATE', 
        'EXPIRY_DATE', 
        'EXPIRY',
        'SEMEXPIRY'
      ]),
      strikePrice: findColumnIndex([
        'SEM_STRIKE_PRICE', 
        'STRIKEPRICE', 
        'STRIKE_PRICE', 
        'STRIKE',
        'SEMSTRIKE'
      ]),
      optionType: findColumnIndex([
        'SEM_OPTION_TYPE', 
        'OPTIONTYPE', 
        'OPTION_TYPE',
        'SEMOPTION'
      ]),
      lotSize: findColumnIndex([
        'SEM_LOT_UNITS', 
        'LOTUNITS', 
        'LOT_UNITS', 
        'LOT_SIZE', 
        'LOTSIZE',
        'SEMLOT'
      ]),
      underlying: findColumnIndex([
        'SM_SYMBOL_NAME', 
        'SYMBOLNAME', 
        'SYMBOL_NAME', 
        'UNDERLYING',
        'SMSYMBOL'
      ]),
      exchangeSegment: findColumnIndex([
        'SEM_EXM_EXCH_ID', 
        'EXCHANGEID', 
        'EXCHANGE_ID', 
        'EXCHANGE', 
        'SEM_SEGMENT',
        'SEMEXM'
      ])
    };

    console.log('🔍 Column Mapping Result:', columnIndices);

    // If we can't find essential columns, show what we found
    if (columnIndices.tradingSymbol === -1 && columnIndices.customSymbol === -1 && columnIndices.securityId === -1) {
      console.error('❌ Could not find essential columns. Available headers:', headers);
      throw new Error(
        `Could not find essential columns in CSV file.\n\n` +
        `Found ${headers.length} columns. First 10: ${headers.slice(0, 10).join(', ')}\n\n` +
        `Please ensure you downloaded the correct file from:\n` +
        `https://images.dhan.co/api-data/api-scrip-master-detailed.csv`
      );
    }

    const parsedInstruments: DhanInstrument[] = [];
    let niftyCount = 0;
    let bankNiftyCount = 0;
    let sensexCount = 0;
    let totalOptionsFound = 0;
    let rowsParsed = 0;

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);
        
        if (values.length < 5) continue; // Skip invalid rows
        
        rowsParsed++;

        // Get values using column indices
        const getVal = (idx: number): string => idx !== -1 && values[idx] ? values[idx].trim() : '';

        // Get trading symbol - try multiple columns
        const tradingSymbol = 
          getVal(columnIndices.tradingSymbol) || 
          getVal(columnIndices.customSymbol) || 
          '';
        
        const underlying = getVal(columnIndices.underlying);
        const securityId = getVal(columnIndices.securityId);
        
        // Skip if no symbol found
        if (!tradingSymbol && !securityId) {
          continue;
        }

        // Get option type
        const optionTypeRaw = getVal(columnIndices.optionType);
        const optionType = optionTypeRaw?.toUpperCase() === 'PE' ? 'PE' : 
                          optionTypeRaw?.toUpperCase() === 'CE' ? 'CE' : 
                          optionTypeRaw?.toUpperCase() === 'CALL' ? 'CE' :
                          optionTypeRaw?.toUpperCase() === 'PUT' ? 'PE' : '';

        // Only process if it has an option type (CE or PE)
        if (!optionType || (optionType !== 'CE' && optionType !== 'PE')) {
          continue;
        }
        
        totalOptionsFound++;

        // Check if it's NIFTY or BANKNIFTY or SENSEX using multiple methods
        const combinedText = `${tradingSymbol} ${underlying}`.toUpperCase();
        
        // More aggressive NIFTY detection
        const isNifty = (
          (combinedText.includes('NIFTY') && !combinedText.includes('BANK') && !combinedText.includes('FIN')) ||
          (tradingSymbol.toUpperCase().match(/^NIFTY[\s\d]/) && !tradingSymbol.toUpperCase().includes('BANK')) ||
          (underlying.toUpperCase() === 'NIFTY')
        );
        
        const isBankNifty = (
          combinedText.includes('BANKNIFTY') || 
          combinedText.includes('BANK NIFTY') ||
          combinedText.includes('BANK-NIFTY') ||
          combinedText.includes('BANKNIF') ||
          tradingSymbol.toUpperCase().includes('BANKNIFTY') ||
          underlying.toUpperCase() === 'BANKNIFTY'
        );

        const isSensex = (
          combinedText.includes('SENSEX') ||
          tradingSymbol.toUpperCase().includes('SENSEX') ||
          underlying.toUpperCase() === 'SENSEX' ||
          underlying.toUpperCase() === 'BSE'
        );

        // Skip if not NIFTY or BANKNIFTY or SENSEX
        if (!isNifty && !isBankNifty && !isSensex) {
          continue;
        }

        // Extract strike price
        const strikePriceStr = getVal(columnIndices.strikePrice);
        const strikePrice = parseFloat(strikePriceStr.replace(/[^0-9.]/g, '')) || 0;

        // Skip if no valid strike price
        if (strikePrice === 0) {
          continue;
        }

        // Extract lot size
        const lotSizeStr = getVal(columnIndices.lotSize);
        let lotSize = parseInt(lotSizeStr.replace(/[^0-9]/g, '')) || (isSensex ? 10 : isBankNifty ? 15 : 25);
        
        // Fix common lot size errors - remove trailing 0 if it makes sense
        // Examples: 650 -> 65, 250 -> 25, 150 -> 15, 500 -> 50
        if (lotSize >= 100 && lotSize % 10 === 0) {
          const withoutTrailingZero = Math.floor(lotSize / 10);
          // Common lot sizes are: 15, 25, 40, 50, 65, 75, etc.
          if (withoutTrailingZero >= 10 && withoutTrailingZero <= 100) {
            lotSize = withoutTrailingZero;
          }
        }

        // Format the symbol name properly
        let formattedSymbolName = tradingSymbol;
        
        // Try to extract expiry date and format it nicely
        const expiryStr = getVal(columnIndices.expiry);
        if (expiryStr && strikePrice && optionType) {
          // Parse expiry date (format could be DD-MMM-YYYY or YYYY-MM-DD)
          const parseExpiry = (dateStr: string): string => {
            // Remove any quotes or extra spaces
            dateStr = dateStr.trim().replace(/"/g, '');
            
            // Try multiple date formats
            const formats = [
              /(\d{2})-([A-Z]{3})-(\d{4})/i,  // DD-MMM-YYYY
              /(\d{4})-(\d{2})-(\d{2})/,       // YYYY-MM-DD
              /(\d{2})\/(\d{2})\/(\d{4})/      // DD/MM/YYYY
            ];
            
            for (const format of formats) {
              const match = dateStr.match(format);
              if (match) {
                if (format === formats[0]) {
                  // DD-MMM-YYYY format
                  return match[2] + match[3]; // MMMYYYYformat
                } else if (format === formats[1]) {
                  // YYYY-MM-DD format
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  const month = monthNames[parseInt(match[2]) - 1];
                  return month + match[1]; // MMMYYYYformat
                } else if (format === formats[2]) {
                  // DD/MM/YYYY format
                  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                  const month = monthNames[parseInt(match[2]) - 1];
                  return month + match[3]; // MMMYYYY format
                }
              }
            }
            return '';
          };
          
          const formattedExpiry = parseExpiry(expiryStr);
          const indexName = isSensex ? 'SENSEX' : isBankNifty ? 'BANKNIFTY' : 'NIFTY';
          
          if (formattedExpiry) {
            // Format: NIFTY-Jan2026-26200-CE or SENSEX-Jan2026-80000-CE
            formattedSymbolName = `${indexName}-${formattedExpiry}-${strikePrice}-${optionType}`;
          } else {
            // Fallback if expiry parsing fails
            formattedSymbolName = `${indexName}-${strikePrice}-${optionType}`;
          }
        }

        const instrument: DhanInstrument = {
          securityId: securityId,
          customSymbol: formattedSymbolName,
          tradingSymbol: tradingSymbol,
          instrumentName: getVal(columnIndices.instrumentName),
          instrumentType: getVal(columnIndices.instrumentType) || 'OPTIDX',
          expiry: getVal(columnIndices.expiry),
          strikePrice: strikePrice,
          optionType: optionType,
          lotSize: lotSize,
          underlying: isSensex ? 'SENSEX' : isBankNifty ? 'BANKNIFTY' : 'NIFTY',
          exchangeSegment: getVal(columnIndices.exchangeSegment) || 'NSE_FNO'
        };

        parsedInstruments.push(instrument);
        
        if (isBankNifty) bankNiftyCount++;
        else if (isNifty) niftyCount++;
        else if (isSensex) sensexCount++;
        
      } catch (err) {
        // Silently skip problematic rows
        continue;
      }
    }

    console.log(`✅ CSV Parsing Complete:`);
    console.log(`   - Total rows: ${lines.length - 1}`);
    console.log(`   - Rows parsed: ${rowsParsed}`);
    console.log(`   - Total options found: ${totalOptionsFound}`);
    console.log(`   - NIFTY options: ${niftyCount}`);
    console.log(`   - BANKNIFTY options: ${bankNiftyCount}`);
    console.log(`   - SENSEX options: ${sensexCount}`);
    console.log(`   - Final filtered count: ${parsedInstruments.length}`);
    
    if (parsedInstruments.length === 0) {
      throw new Error(
        `No NIFTY/BANKNIFTY options found in CSV file.\n\n` +
        `Debug info:\n` +
        `- Total rows: ${lines.length - 1}\n` +
        `- Rows with data: ${rowsParsed}\n` +
        `- Options found (any type): ${totalOptionsFound}\n\n` +
        `Please ensure:\n` +
        `1. You downloaded from: https://images.dhan.co/api-data/api-scrip-master-detailed.csv\n` +
        `2. The file contains NIFTY/BANKNIFTY options data\n` +
        `3. The file is not corrupted`
      );
    }

    return parsedInstruments;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const text = await file.text();
      const parsed = parseDhanMasterCSV(text);

      setInstruments(parsed);
      saveInstrumentsToStorage(parsed); // ✅ Save to localStorage
      setSuccess(`✅ Successfully parsed ${parsed.length} NIFTY/BANKNIFTY options from Dhan Master CSV`);
    } catch (err: any) {
      setError(err.message || 'Failed to parse Dhan Master CSV file');
      console.error('CSV upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setSelectedInstrument(null);
  };

  const getFilteredInstruments = () => {
    return instruments.filter(inst => {
      // Text search filter
      const matchesSearch = !searchTerm || 
        inst.tradingSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.customSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.securityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.strikePrice.toString().includes(searchTerm);

      // Index filter
      const symbolUpper = inst.underlying?.toUpperCase() || inst.tradingSymbol?.toUpperCase() || '';
      const isNifty = symbolUpper.includes('NIFTY') && !symbolUpper.includes('BANKNIFTY');
      const isBankNifty = symbolUpper.includes('BANKNIFTY');
      const isSensex = symbolUpper.includes('SENSEX');
      
      const matchesIndex = filterIndex === 'ALL' || 
        (filterIndex === 'NIFTY' && isNifty) ||
        (filterIndex === 'BANKNIFTY' && isBankNifty) ||
        (filterIndex === 'SENSEX' && isSensex);

      // Option type filter
      const matchesOptionType = filterOptionType === 'ALL' || inst.optionType === filterOptionType;

      return matchesSearch && matchesIndex && matchesOptionType;
    });
  };

  const filteredInstruments = getFilteredInstruments();

  const handleSelectInstrument = (instrument: DhanInstrument) => {
    setSelectedInstrument(instrument);
    setShowOrderConfig(true);
    // Auto-set quantity to lot size
    setOrderConfig(prev => ({ ...prev, quantity: instrument.lotSize }));
  };

  const handleAddSymbol = () => {
    if (!selectedInstrument) return;

    // ⚡ CRITICAL: Determine index including SENSEX
    const symbolUpper = selectedInstrument.underlying?.toUpperCase() || selectedInstrument.tradingSymbol?.toUpperCase() || '';
    const isNifty = symbolUpper.includes('NIFTY') && !symbolUpper.includes('BANKNIFTY');
    const isBankNifty = symbolUpper.includes('BANKNIFTY');
    const isSensex = symbolUpper.includes('SENSEX');
    
    // Determine index based on symbol
    let index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX' = 'NIFTY'; // Default
    if (isSensex) {
      index = 'SENSEX';
    } else if (isBankNifty) {
      index = 'BANKNIFTY';
    } else if (isNifty) {
      index = 'NIFTY';
    }

    // ⚡ CRITICAL: Map exchange segment based on index
    let exchangeSegment: string = 'NSE_FNO'; // Default
    
    if (isSensex) {
      // SENSEX options trade on BSE
      exchangeSegment = 'BSE_FNO';
      console.log('🔍 SENSEX detected - Using BSE_FNO exchange');
    } else if (selectedInstrument.exchangeSegment) {
      // For NIFTY/BANKNIFTY, use the provided exchange segment
      const exchUpper = selectedInstrument.exchangeSegment.toUpperCase();
      if (exchUpper.includes('NSE')) {
        if (exchUpper.includes('FO') || exchUpper.includes('FNO')) {
          exchangeSegment = 'NSE_FNO';
        } else if (exchUpper.includes('EQ')) {
          exchangeSegment = 'NSE_EQ';
        } else {
          exchangeSegment = 'NSE_FNO'; // Default for options
        }
      } else if (exchUpper.includes('BSE')) {
        if (exchUpper.includes('FO') || exchUpper.includes('FNO')) {
          exchangeSegment = 'BSE_FNO';
        } else {
          exchangeSegment = 'BSE_EQ';
        }
      }
    }

    // CRITICAL: Use the actual Dhan trading symbol for order execution
    // The formatted name is just for display purposes
    const actualTradingSymbol = selectedInstrument.tradingSymbol || selectedInstrument.customSymbol;

    // Create symbol object
    const symbolToAdd = {
      id: `symbol_${Date.now()}`,
      name: actualTradingSymbol, // ✅ Use actual Dhan trading symbol for API
      displayName: selectedInstrument.customSymbol, // Formatted name for UI display
      index: index, // ✅ Now includes SENSEX support
      optionType: selectedInstrument.optionType,
      transactionType: orderConfig.transactionType,
      exchangeSegment: exchangeSegment, // ✅ BSE_FNO for SENSEX, NSE_FNO for NIFTY/BANKNIFTY
      productType: orderConfig.productType,
      orderType: orderConfig.orderType,
      validity: orderConfig.validity,
      securityId: selectedInstrument.securityId,
      quantity: orderConfig.quantity,
      disclosedQuantity: 0,
      price: orderConfig.price || 0,
      triggerPrice: orderConfig.triggerPrice || 0,
      afterMarketOrder: false,
      // ✅ Don't set amoTime when afterMarketOrder is false (causes validation error)
      amoTime: undefined,
      boProfitValue: 0,
      boStopLossValue: 0,
      targetAmount: orderConfig.targetAmount,
      stopLossAmount: orderConfig.stopLossAmount,
      active: true, // ✅ Set to active by default
      waitingForSignal: false
    };

    console.log('📤 Adding symbol to trading:', {
      name: actualTradingSymbol,
      displayName: selectedInstrument.customSymbol,
      index: index,
      securityId: selectedInstrument.securityId,
      exchangeSegment: exchangeSegment,
      quantity: orderConfig.quantity,
      productType: orderConfig.productType,
      orderType: orderConfig.orderType
    });

    onSymbolAdd(symbolToAdd);
    setSuccess(`✅ Added ${selectedInstrument.customSymbol} to trading symbols (Status: Active)`);

    // Don't remove from list, allow multiple configs
    setShowOrderConfig(false);
    setSelectedInstrument(null);
  };

  const downloadDhanMaster = () => {
    window.open('https://images.dhan.co/api-data/api-scrip-master-detailed.csv', '_blank');
  };

  // Get config for instrument or return defaults
  const getInstrumentConfig = (securityId: string) => {
    return instrumentConfigs[securityId] || { target: 3000, stopLoss: 2000 };
  };

  // Update config for specific instrument
  const updateInstrumentConfig = (securityId: string, field: 'target' | 'stopLoss', value: number) => {
    setInstrumentConfigs(prev => ({
      ...prev,
      [securityId]: {
        ...getInstrumentConfig(securityId),
        [field]: value
      }
    }));
  };

  // Quick add function - add symbol directly with inline configs
  const quickAddSymbol = (inst: DhanInstrument) => {
    const config = getInstrumentConfig(inst.securityId);
    
    // ⚡ CRITICAL: Determine index including SENSEX
    const symbolUpper = inst.underlying?.toUpperCase() || inst.tradingSymbol?.toUpperCase() || '';
    const isNifty = symbolUpper.includes('NIFTY') && !symbolUpper.includes('BANKNIFTY');
    const isBankNifty = symbolUpper.includes('BANKNIFTY');
    const isSensex = symbolUpper.includes('SENSEX');
    
    // Determine index based on symbol
    let index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX' = 'NIFTY'; // Default
    if (isSensex) {
      index = 'SENSEX';
    } else if (isBankNifty) {
      index = 'BANKNIFTY';
    } else if (isNifty) {
      index = 'NIFTY';
    }

    // ⚡ CRITICAL: Map exchange segment based on index
    let exchangeSegment: string = 'NSE_FNO'; // Default
    
    if (isSensex) {
      // SENSEX options trade on BSE
      exchangeSegment = 'BSE_FNO';
      console.log('🔍 SENSEX detected - Using BSE_FNO exchange');
    } else if (inst.exchangeSegment) {
      // For NIFTY/BANKNIFTY, use the provided exchange segment
      const exchUpper = inst.exchangeSegment.toUpperCase();
      if (exchUpper.includes('NSE')) {
        if (exchUpper.includes('FO') || exchUpper.includes('FNO')) {
          exchangeSegment = 'NSE_FNO';
        } else if (exchUpper.includes('EQ')) {
          exchangeSegment = 'NSE_EQ';
        } else {
          exchangeSegment = 'NSE_FNO';
        }
      } else if (exchUpper.includes('BSE')) {
        if (exchUpper.includes('FO') || exchUpper.includes('FNO')) {
          exchangeSegment = 'BSE_FNO';
        } else {
          exchangeSegment = 'BSE_EQ';
        }
      }
    }

    const actualTradingSymbol = inst.tradingSymbol || inst.customSymbol;

    const symbolToAdd = {
      id: `symbol_${Date.now()}`,
      name: actualTradingSymbol,
      displayName: inst.customSymbol,
      index: index, // ✅ Now includes SENSEX support
      optionType: inst.optionType,
      transactionType: 'BUY' as const,
      exchangeSegment: exchangeSegment, // ✅ BSE_FNO for SENSEX, NSE_FNO for NIFTY/BANKNIFTY
      productType: 'INTRADAY' as const,
      orderType: 'MARKET' as const,
      validity: 'DAY' as const,
      securityId: inst.securityId,
      quantity: inst.lotSize,
      disclosedQuantity: 0,
      price: 0,
      triggerPrice: 0,
      afterMarketOrder: false,
      // ✅ Don't set amoTime when afterMarketOrder is false (causes validation error)
      amoTime: undefined,
      boProfitValue: 0,
      boStopLossValue: 0,
      targetAmount: config.target,
      stopLossAmount: config.stopLoss,
      active: true,
      waitingForSignal: false
    };

    console.log('⚡ Quick Adding symbol:', {
      name: actualTradingSymbol,
      displayName: inst.customSymbol,
      index: index,
      exchangeSegment: exchangeSegment,
      target: config.target,
      stopLoss: config.stopLoss,
      lotSize: inst.lotSize
    });

    onSymbolAdd(symbolToAdd);
    setSuccess(`✅ Added ${inst.customSymbol} (Target: ₹${config.target}, SL: ₹${config.stopLoss})`);
  };

  return (
    <Card className="border-blue-500/20 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-5 text-blue-400" />
          Dhan Master CSV Instrument Upload
        </CardTitle>
        <p className="text-xs text-slate-400 mt-2">
          Upload the official Dhan instrument master CSV file to auto-configure trading symbols
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Section */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              variant="default"
            >
              <Upload className="size-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload Dhan Master CSV'}
            </Button>
            <Button
              onClick={downloadDhanMaster}
              variant="outline"
              title="Download from Dhan Official Link"
            >
              <FileDown className="size-4 mr-2" />
              Download Master CSV
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          
          {/* CSV Download Info */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-300">
            <p className="font-medium mb-1">📥 Download Official Dhan Master CSV:</p>
            <p className="text-blue-400 font-mono break-all">
              https://images.dhan.co/api-data/api-scrip-master-detailed.csv
            </p>
          </div>
          
          {/* Status Messages */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="size-4 flex-shrink-0" />
              <span>{error}</span>
              <X className="size-4 ml-auto cursor-pointer" onClick={() => setError(null)} />
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              <CheckCircle className="size-4 flex-shrink-0" />
              <span>{success}</span>
              <X className="size-4 ml-auto cursor-pointer" onClick={() => setSuccess(null)} />
            </div>
          )}
        </div>

        {/* Filter & Search Section */}
        {instruments.length > 0 && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Filter by Index</Label>
                <Select value={filterIndex} onValueChange={(v: any) => setFilterIndex(v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Indices</SelectItem>
                    <SelectItem value="NIFTY">📈 NIFTY Only</SelectItem>
                    <SelectItem value="BANKNIFTY">🏦 BANKNIFTY Only</SelectItem>
                    <SelectItem value="SENSEX">📊 SENSEX Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Filter by Option Type</Label>
                <Select value={filterOptionType} onValueChange={(v: any) => setFilterOptionType(v)}>
                  <SelectTrigger className="bg-slate-800 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Types</SelectItem>
                    <SelectItem value="CE">CE (Call)</SelectItem>
                    <SelectItem value="PE">PE (Put)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search Box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search by symbol, security ID, or strike price..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                Total: {instruments.length} instruments
              </span>
              <span className="text-blue-400">
                Filtered: {filteredInstruments.length} results
              </span>
            </div>

            {/* Results - Only show when searching */}
            {searchTerm && filteredInstruments.length > 0 && (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredInstruments.slice(0, 100).map((inst, index) => {
                  const symbolUpper = inst.underlying?.toUpperCase() || inst.tradingSymbol?.toUpperCase() || '';
                  const isNifty = symbolUpper.includes('NIFTY') && !symbolUpper.includes('BANKNIFTY');
                  const isBankNifty = symbolUpper.includes('BANKNIFTY');
                  const isSensex = symbolUpper.includes('SENSEX');
                  const config = getInstrumentConfig(inst.securityId);
                  
                  return (
                    <div
                      key={index}
                      className="p-3 rounded border bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-all"
                    >
                      <div className="space-y-3">
                        {/* Instrument Info */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-white">{inst.customSymbol}</span>
                              <Badge variant="outline" className="text-xs">
                                {isBankNifty ? '🏦 BANKNIFTY' : isNifty ? '📈 NIFTY' : '📊 SENSEX'}
                              </Badge>
                              <Badge variant={inst.optionType === 'CE' ? 'default' : 'secondary'} className="text-xs">
                                {inst.optionType}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                              <div>Strike: <span className="text-white">{inst.strikePrice}</span></div>
                              <div>Lot Size: <span className="text-green-400 font-semibold">{inst.lotSize}</span></div>
                              <div>Security ID: <span className="text-white font-mono text-[10px]">{inst.securityId}</span></div>
                              {inst.expiry && (
                                <div>Expiry: <span className="text-white">{inst.expiry}</span></div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Quick Config Inputs */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400">Target (₹)</Label>
                            <Input
                              type="number"
                              value={config.target}
                              onChange={(e) => updateInstrumentConfig(inst.securityId, 'target', parseFloat(e.target.value) || 3000)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 text-sm bg-slate-900 border-slate-600"
                              placeholder="3000"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-slate-400">Stop Loss (₹)</Label>
                            <Input
                              type="number"
                              value={config.stopLoss}
                              onChange={(e) => updateInstrumentConfig(inst.securityId, 'stopLoss', parseFloat(e.target.value) || 2000)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-8 text-sm bg-slate-900 border-slate-600"
                              placeholder="2000"
                            />
                          </div>
                        </div>

                        {/* Add Button */}
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            quickAddSymbol(inst);
                          }}
                          className="w-full h-9 bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Plus className="size-4 mr-2" />
                          Add to Trading (Target: ₹{config.target}, SL: ₹{config.stopLoss})
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {filteredInstruments.length > 100 && (
                  <div className="text-center text-slate-400 text-sm py-2">
                    Showing first 100 results. Use more specific search terms.
                  </div>
                )}
              </div>
            )}

            {/* Empty state when not searching */}
            {!searchTerm && instruments.length > 0 && (
              <div className="text-center py-8 text-slate-400">
                <Search className="size-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Start searching to see instruments</p>
                <p className="text-xs mt-1">Type strike price, symbol, or security ID</p>
              </div>
            )}

            {/* No results */}
            {searchTerm && filteredInstruments.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <AlertCircle className="size-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No instruments found</p>
                <p className="text-xs mt-1">Try different search terms or adjust filters</p>
              </div>
            )}
          </div>
        )}

        {/* Order Configuration Panel */}
        {showOrderConfig && selectedInstrument && (
          <Card className="bg-blue-500/10 border-blue-500/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="size-4" />
                Configure Order Parameters
              </CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Selected: {selectedInstrument.tradingSymbol} | Strike: {selectedInstrument.strikePrice} | Lot: {selectedInstrument.lotSize}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Order Type Configuration */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Transaction Type</Label>
                  <Select 
                    value={orderConfig.transactionType} 
                    onValueChange={(v: any) => setOrderConfig({...orderConfig, transactionType: v})}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">BUY</SelectItem>
                      <SelectItem value="SELL">SELL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Product Type</Label>
                  <Select 
                    value={orderConfig.productType} 
                    onValueChange={(v: any) => setOrderConfig({...orderConfig, productType: v})}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INTRADAY">INTRADAY ⭐ (Recommended)</SelectItem>
                      <SelectItem value="MARGIN">MARGIN - Carry Forward</SelectItem>
                      <SelectItem value="CO">CO - Cover Order</SelectItem>
                      <SelectItem value="BO">BO - Bracket Order</SelectItem>
                      <SelectItem value="CNC">CNC - Delivery</SelectItem>
                      <SelectItem value="MTF">MTF - Margin Trading</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Order Type</Label>
                  <Select 
                    value={orderConfig.orderType} 
                    onValueChange={(v: any) => setOrderConfig({...orderConfig, orderType: v})}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKET">MARKET ⭐</SelectItem>
                      <SelectItem value="LIMIT">LIMIT</SelectItem>
                      <SelectItem value="STOP_LOSS">STOP LOSS</SelectItem>
                      <SelectItem value="STOP_LOSS_MARKET">STOP LOSS MARKET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Validity</Label>
                  <Select 
                    value={orderConfig.validity} 
                    onValueChange={(v: any) => setOrderConfig({...orderConfig, validity: v})}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY">DAY</SelectItem>
                      <SelectItem value="IOC">IOC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Quantity (Lots × {selectedInstrument.lotSize})</Label>
                  <Input
                    type="number"
                    value={orderConfig.quantity}
                    onChange={(e) => setOrderConfig({...orderConfig, quantity: parseInt(e.target.value) || 0})}
                    className="bg-slate-800 border-slate-700"
                    placeholder={`Default: ${selectedInstrument.lotSize}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Price (for LIMIT orders)</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={orderConfig.price}
                    onChange={(e) => setOrderConfig({...orderConfig, price: parseFloat(e.target.value) || 0})}
                    className="bg-slate-800 border-slate-700"
                    placeholder="0 for MARKET"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Target Amount (₹)</Label>
                  <Input
                    type="number"
                    value={orderConfig.targetAmount}
                    onChange={(e) => setOrderConfig({...orderConfig, targetAmount: parseFloat(e.target.value) || 0})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Stop Loss Amount (₹)</Label>
                  <Input
                    type="number"
                    value={orderConfig.stopLossAmount}
                    onChange={(e) => setOrderConfig({...orderConfig, stopLossAmount: parseFloat(e.target.value) || 0})}
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={handleAddSymbol}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="size-4 mr-2" />
                  Add to Trading Symbols
                </Button>
                <Button
                  onClick={() => {
                    setShowOrderConfig(false);
                    setSelectedInstrument(null);
                  }}
                  variant="outline"
                  className="bg-slate-700 border-slate-600"
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help Text */}
        <div className="text-xs text-slate-400 space-y-1 p-3 bg-slate-800/50 rounded border border-slate-700">
          <p className="font-medium text-slate-300">📝 How to Use:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Click "Download Master CSV" to get the official Dhan instrument file</li>
            <li>Click "Upload Dhan Master CSV" and select the downloaded file</li>
            <li>Use filters to narrow down by Index (NIFTY/BANKNIFTY) and Option Type (CE/PE)</li>
            <li>Search for specific strikes or symbols</li>
            <li>Click on any instrument to configure order parameters</li>
            <li>Customize lot size, order type, target/stop loss, etc.</li>
            <li>Click "Add to Trading Symbols" to configure for automated trading</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}