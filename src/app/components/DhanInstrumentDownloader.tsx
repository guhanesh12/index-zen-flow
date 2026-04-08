import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Download, Loader2, CheckCircle, AlertCircle, Database } from "lucide-react";

interface DhanInstrumentDownloaderProps {
  onInstrumentsProcessed?: (count: number) => void;
}

interface DhanInstrument {
  SEM_SMST_SECURITY_ID: string;
  SEM_CUSTOM_SYMBOL: string;
  SEM_TRADING_SYMBOL: string;
  SEM_INSTRUMENT_NAME: string;
  SEM_EXCH_INSTRUMENT_TYPE: string;
  SEM_EXPIRY_DATE: string;
  SEM_STRIKE_PRICE: string;
  SEM_OPTION_TYPE: string;
  SEM_LOT_UNITS: string;
  SEM_EXM_EXCH_ID: string;
}

export function DhanInstrumentDownloader({ onInstrumentsProcessed }: DhanInstrumentDownloaderProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'downloading' | 'processing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [totalInstruments, setTotalInstruments] = useState(0);
  const [filteredInstruments, setFilteredInstruments] = useState(0);

  const downloadAndProcessInstruments = async () => {
    setLoading(true);
    setStatus('downloading');
    setProgress('Downloading instrument file from Dhan API...');
    
    try {
      // Step 1: Download CSV via backend proxy (avoids CORS from browser)
      console.log('📥 Downloading Dhan master instruments via backend...');
      const response = await fetch('/api/instruments/download-csv', {
        cache: 'no-cache'
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to download: ${response.status} ${response.statusText}`);
      }
      
      const csvText = await response.text();
      console.log('✅ Downloaded CSV file, size:', csvText.length, 'bytes');
      
      // Step 2: Parse CSV
      setStatus('processing');
      setProgress('Parsing instruments...');
      
      const lines = csvText.trim().split('\n');
      
      // Parse CSV properly handling quoted fields
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
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
      
      const headers = parseCSVLine(lines[0]).map(h => h.trim());
      console.log('📊 CSV Headers:', headers);
      console.log('📊 Total lines:', lines.length);
      console.log('🔍 First 3 headers:', headers.slice(0, 3));
      
      setTotalInstruments(lines.length - 1); // Exclude header
      
      // Step 3: Filter for NIFTY, BANKNIFTY, and SENSEX options ONLY
      setProgress('Filtering NIFTY, BANKNIFTY, and SENSEX options...');
      
      const instruments: DhanInstrument[] = [];
      const filteredSymbols: any[] = [];
      
      // 🔍 DEBUG: Log first few rows to understand the data structure
      if (lines.length > 1) {
        const sample1 = parseCSVLine(lines[1]);
        const sample2 = parseCSVLine(lines[2]);
        console.log('🔍 Sample row 1 (parsed):', sample1.slice(0, 10));
        console.log('🔍 Sample row 2 (parsed):', sample2.slice(0, 10));
      }
      
      // Find column indices dynamically
      const getColIndex = (name: string): number => {
        return headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
      };
      
      const colIndices = {
        securityId: Math.max(
          getColIndex('security_id'),
          getColIndex('securityid'),
          getColIndex('security id')
        ),
        customSymbol: Math.max(
          getColIndex('custom_symbol'),
          getColIndex('customsymbol'),
          getColIndex('custom symbol')
        ),
        tradingSymbol: Math.max(
          getColIndex('trading_symbol'),
          getColIndex('tradingsymbol'),
          getColIndex('trading symbol')
        ),
        exchangeId: Math.max(
          getColIndex('exch_id'),
          getColIndex('exchange'),
          getColIndex('exchid')
        ),
        instrumentType: Math.max(
          getColIndex('instrument_type'),
          getColIndex('instrumenttype'),
          getColIndex('instrument type')
        ),
        expiryDate: Math.max(
          getColIndex('expiry'),
          getColIndex('expiry_date'),
          getColIndex('expirydate')
        ),
        strikePrice: Math.max(
          getColIndex('strike'),
          getColIndex('strike_price'),
          getColIndex('strikeprice')
        ),
        optionType: Math.max(
          getColIndex('option_type'),
          getColIndex('optiontype'),
          getColIndex('option type')
        ),
        lotSize: Math.max(
          getColIndex('lot'),
          getColIndex('lot_units'),
          getColIndex('lotsize')
        )
      };
      
      console.log('📍 Column indices found:', colIndices);
      
      // 🔍 Log ALL headers to see exact column names
      console.log('📋 ALL HEADERS:', JSON.stringify(headers));
      
      let nseCount = 0;
      let optidxCount = 0;
      let firstNseFound = false;
      let firstOptidxFound = false;
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Progress updates every 50,000 rows
        if (i % 50000 === 0) {
          console.log(`⏳ Processing row ${i.toLocaleString()} of ${lines.length.toLocaleString()}...`);
          setProgress(`Processing row ${i.toLocaleString()} of ${lines.length.toLocaleString()}...`);
        }
        
        const values = parseCSVLine(line);
        if (values.length < 5) continue;
        
        // Create instrument object using both exact column names AND indices
        const instrument: any = {};
        headers.forEach((header, index) => {
          instrument[header] = values[index] || '';
        });
        
        // 🔍 DEBUG: Log first 3 complete rows to see ALL data
        if (i <= 3) {
          console.log(`🔍 Complete row ${i}:`, instrument);
        }
        
        // Try to get values using multiple methods
        const getVal = (exactName: string, index: number): string => {
          return instrument[exactName] || (index >= 0 ? values[index] : '') || '';
        };
        
        // ✅ USE CORRECT COLUMN NAMES FROM DHAN CSV
        const exchangeId = instrument['EXCH_ID'] || '';
        const instrumentType = instrument['INSTRUMENT_TYPE'] || '';
        const symbolName = instrument['SYMBOL_NAME'] || '';
        const displayName = instrument['DISPLAY_NAME'] || '';
        const underlyingSymbol = instrument['UNDERLYING_SYMBOL'] || '';
        
        // 🔍 DEBUG: Log filtering checks for first 10 rows
        if (i <= 10) {
          console.log(`🔍 Row ${i} filtering:`, {
            exchangeId,
            instrumentType,
            symbolName: symbolName.substring(0, 50),
            displayName: displayName.substring(0, 50),
            underlyingSymbol: underlyingSymbol.substring(0, 50),
            hasNSE: exchangeId === 'NSE',
            isOPTIDX: instrumentType === 'OPTIDX'
          });
        }
        
        // ✅ CORRECT FILTERING FOR DHAN CSV FORMAT
        // Accept BOTH NSE (for NIFTY/BANKNIFTY) and BSE (for SENSEX)
        const isNse = exchangeId === 'NSE';
        const isBse = exchangeId === 'BSE';
        const isValidExchange = isNse || isBse;
        
        // ✅ FILTER BY SPECIFIC INDICES ONLY: NIFTY, BANKNIFTY, SENSEX
        const underlyingUpper = underlyingSymbol.toUpperCase();
        const symbolUpper = symbolName.toUpperCase();
        const displayUpper = displayName.toUpperCase();
        
        const isNifty = 
          (underlyingUpper === 'NIFTY' || underlyingUpper === 'NIFTY 50' || underlyingUpper === 'NIFTY50') ||
          (symbolUpper.includes('NIFTY') && !symbolUpper.includes('BANKNIFTY') && !symbolUpper.includes('FINNIFTY') && !symbolUpper.includes('MIDCPNIFTY')) ||
          (displayUpper.includes('NIFTY') && !displayUpper.includes('BANKNIFTY') && !displayUpper.includes('FINNIFTY') && !displayUpper.includes('MIDCPNIFTY'));
          
        const isBankNifty = 
          underlyingUpper === 'BANKNIFTY' ||
          underlyingUpper === 'NIFTY BANK' ||
          symbolUpper.includes('BANKNIFTY') || 
          displayUpper.includes('BANKNIFTY');
          
        const isSensex = 
          underlyingUpper === 'SENSEX' ||
          underlyingUpper === 'BSE SENSEX' ||
          symbolUpper.includes('SENSEX') || 
          displayUpper.includes('SENSEX');
        
        const isRelevantIndex = isNifty || isBankNifty || isSensex;
        
        // ✅ Check if it's an option (has CE or PE in option type)
        const optionType = instrument['OPTION_TYPE'] || '';
        const isOption = optionType === 'CE' || optionType === 'PE';
        
        // 🔍 Log first match for each type
        if (isValidExchange && isRelevantIndex && isOption) {
          if (isNifty && filteredSymbols.filter((s: any) => s.underlyingSymbol === 'NIFTY').length === 0) {
            console.log('🎯 FIRST NIFTY MATCH!', { exchangeId, instrumentType, underlyingSymbol, symbolName, displayName, optionType });
          }
          if (isBankNifty && filteredSymbols.filter((s: any) => s.underlyingSymbol === 'BANKNIFTY').length === 0) {
            console.log('🎯 FIRST BANKNIFTY MATCH!', { exchangeId, instrumentType, underlyingSymbol, symbolName, displayName, optionType });
          }
          if (isSensex && filteredSymbols.filter((s: any) => s.underlyingSymbol === 'SENSEX').length === 0) {
            console.log('🎯 FIRST SENSEX MATCH!', { exchangeId, instrumentType, underlyingSymbol, symbolName, displayName, optionType });
          }
        }
        
        // ✅ ACCEPT: (NSE OR BSE) + NIFTY/BANKNIFTY/SENSEX + CE/PE options
        if (isValidExchange && isRelevantIndex && isOption) {
          instruments.push(instrument as DhanInstrument);
          
          // ✅ Convert to our internal format using CORRECT COLUMN NAMES
          const securityId = instrument['SECURITY_ID'] || '';
          const expiryDate = instrument['SM_EXPIRY_DATE'] || '';
          const strikePrice = parseFloat(instrument['STRIKE_PRICE']) || 0;
          const lotSize = parseInt(instrument['LOT_SIZE']) || 0;
          
          // Determine underlying from the UNDERLYING_SYMBOL column
          let underlying = underlyingSymbol;
          if (!underlying) {
            // Fallback to detecting from symbol name
            if (isBankNifty) {
              underlying = 'BANKNIFTY';
            } else if (isSensex) {
              underlying = 'SENSEX';
            } else if (isNifty) {
              underlying = 'NIFTY';
            }
          }
          
          filteredSymbols.push({
            securityId,
            customSymbol: displayName, // Use display name as custom symbol
            tradingSymbol: symbolName, // Use symbol name as trading symbol
            underlyingSymbol: underlying,
            expiryDate,
            strikePrice,
            optionType,
            lotSize,
            exchangeSegment: exchangeId === 'NSE' ? 'NSE_FNO' : 'BSE_FNO', // ✅ Auto-detect correct F&O exchange
            instrumentType: 'OPTIDX'
          });
        }
        
        // Count NSE and OPTIDX occurrences
        if (isNse) {
          nseCount++;
          if (!firstNseFound) {
            console.log(`🔍 First NSE row found at index ${i}:`, instrument);
            firstNseFound = true;
          }
          
          // 🔍 LOG NSE NIFTY/BANKNIFTY rows to see what INSTRUMENT_TYPE they use
          if (underlyingUpper.includes('NIFTY') || symbolUpper.includes('NIFTY') || displayUpper.includes('NIFTY')) {
            console.log(`🎯 Found NSE NIFTY row at index ${i}:`, {
              EXCH_ID: exchangeId,
              INSTRUMENT_TYPE: instrumentType,
              UNDERLYING_SYMBOL: underlyingSymbol,
              SYMBOL_NAME: symbolName,
              DISPLAY_NAME: displayName
            });
          }
        }
        
        // Check for OPTIDX instrument type
        const isOptionsIndex = instrumentType === 'OPTIDX';
        if (isOptionsIndex) {
          optidxCount++;
          if (!firstOptidxFound) {
            console.log(`🔍 First OPTIDX row found at index ${i}:`, instrument);
            firstOptidxFound = true;
          }
        }
      }
      
      console.log(`✅ Filtered ${filteredSymbols.length} F&O instruments from ${lines.length - 1} total`);
      setFilteredInstruments(filteredSymbols.length);
      
      // Step 4: Store in IndexedDB for quick access
      setProgress('Saving instruments to local database...');
      await saveInstrumentsToIndexedDB(filteredSymbols);
      
      // Step 5: Success!
      setStatus('success');
      setProgress('Instruments ready for trading!');
      
      if (onInstrumentsProcessed) {
        onInstrumentsProcessed(filteredSymbols.length);
      }
      
      console.log('✅ Dhan instruments downloaded and processed successfully!');
      
    } catch (error: any) {
      console.error('❌ Failed to download/process instruments:', error);
      setStatus('error');
      setProgress(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save instruments to IndexedDB
  const saveInstrumentsToIndexedDB = async (instruments: any[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      // ✅ First, delete any existing database to ensure clean state
      const deleteRequest = indexedDB.deleteDatabase('DhanInstrumentsDB');
      
      deleteRequest.onsuccess = () => {
        console.log('🗑️ Cleared old database');
        createNewDatabase();
      };
      
      deleteRequest.onerror = () => {
        console.warn('⚠️ Could not delete old database, creating new one anyway');
        createNewDatabase();
      };
      
      deleteRequest.onblocked = () => {
        console.warn('⚠️ Database deletion blocked, creating new one anyway');
        createNewDatabase();
      };
      
      function createNewDatabase() {
        const request = indexedDB.open('DhanInstrumentsDB', 1);
        
        request.onerror = () => {
          console.error('❌ IndexedDB error:', request.error);
          reject(request.error);
        };
        
        request.onsuccess = () => {
          const db = request.result;
          
          // Double-check that object store exists before using it
          if (!db.objectStoreNames.contains('instruments')) {
            console.error('❌ Object store not created properly');
            db.close();
            reject(new Error('Object store not created'));
            return;
          }
          
          const transaction = db.transaction(['instruments'], 'readwrite');
          const store = transaction.objectStore('instruments');
          
          // Clear old data
          store.clear();
          
          // Add all instruments
          instruments.forEach(instrument => {
            store.add(instrument);
          });
          
          transaction.oncomplete = () => {
            console.log('✅ Saved', instruments.length, 'instruments to IndexedDB');
            db.close();
            resolve();
          };
          
          transaction.onerror = () => {
            console.error('❌ Transaction error:', transaction.error);
            db.close();
            reject(transaction.error);
          };
        };
        
        request.onupgradeneeded = (event: any) => {
          const db = event.target.result;
          
          // Create object store if it doesn't exist
          if (!db.objectStoreNames.contains('instruments')) {
            const store = db.createObjectStore('instruments', { 
              keyPath: 'securityId' 
            });
            
            // Create indexes for quick searching
            store.createIndex('underlyingSymbol', 'underlyingSymbol', { unique: false });
            store.createIndex('strikePrice', 'strikePrice', { unique: false });
            store.createIndex('optionType', 'optionType', { unique: false });
            store.createIndex('expiryDate', 'expiryDate', { unique: false });
            
            console.log('✅ Created IndexedDB object store with indexes');
          }
        };
      }
    });
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'downloading':
      case 'processing':
        return <Loader2 className="w-5 h-5 animate-spin text-blue-400" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Download className="w-5 h-5 text-purple-400" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'downloading':
      case 'processing':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-300';
      case 'success':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
      case 'error':
        return 'bg-red-500/10 border-red-500/30 text-red-300';
      default:
        return 'bg-purple-500/10 border-purple-500/30 text-purple-300';
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-400" />
              Dhan Instruments Database
            </CardTitle>
            <p className="text-sm text-zinc-400 mt-1">
              Download and filter F&O instruments from Dhan's official API
            </p>
          </div>
          <Button
            onClick={downloadAndProcessInstruments}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Instruments
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <h4 className="font-semibold text-sm text-zinc-300 mb-2">📋 How it works:</h4>
          <ol className="text-xs text-zinc-400 space-y-1 ml-4 list-decimal">
            <li>Click "Download Instruments" to fetch the latest data from Dhan</li>
            <li>Automatically filters for NIFTY, BANKNIFTY, and SENSEX options only</li>
            <li>Stores instruments locally in your browser for fast access</li>
            <li>Use the Instrument Selector below to search and add symbols for trading</li>
            <li>Refresh weekly to get updated strike prices and expiry dates</li>
          </ol>
        </div>

        {/* Status Display */}
        {status !== 'idle' && (
          <div className={`p-4 rounded-lg border flex items-start gap-3 ${getStatusColor()}`}>
            {getStatusIcon()}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{progress}</p>
              {status === 'success' && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50">
                      Total: {totalInstruments.toLocaleString()}
                    </Badge>
                    <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/50">
                      Filtered: {filteredInstruments.toLocaleString()}
                    </Badge>
                  </div>
                  <p className="text-xs text-emerald-400/70 mt-2">
                    ✅ Ready to use! Instruments are stored locally in your browser.
                  </p>
                </div>
              )}
              {status === 'error' && (
                <p className="text-xs text-red-400/70 mt-1">
                  Please check your internet connection and try again.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-300">
            💡 <strong>Pro Tip:</strong> Download instruments once per week to get updated strike prices and expiry dates. The file is ~2MB and takes 5-10 seconds to process.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}