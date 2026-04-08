// @ts-nocheck
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  Database, 
  Search, 
  Upload,
  Download,
  Trash2,
  CheckCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  FileUp
} from 'lucide-react';
import { motion } from 'motion/react';
import { instrumentStorage } from '../utils/instrumentStorage';
import { supabase } from '@/utils-ext/supabase/client';

interface Instrument {
  id: string;
  symbol: string;
  tradingSymbol: string;
  securityId: string;
  exchange: string;
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

interface AdminInstrumentsProps {
  serverUrl: string;
  accessToken: string;
}

export function AdminInstruments({ serverUrl, accessToken }: AdminInstrumentsProps) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'NIFTY' | 'BANKNIFTY' | 'SENSEX'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100); // Show 100 instruments per page
  const [stats, setStats] = useState({
    total: 0,
    nifty: 0,
    banknifty: 0,
    sensex: 0,
    active: 0,
  });

  // ⚡ HELPER: Get fresh access token (with auto-refresh if needed)
  const getFreshAccessToken = async (): Promise<string> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        // ⚡ Suppress "Auth session missing" - expected for public pages
        if (error.message !== 'Auth session missing!') {
          console.error('❌ Error getting session:', error.message);
        }
        return accessToken; // Fallback to prop
      }
      
      if (!session) {
        // Silent - no warning needed for public pages
        return accessToken; // Fallback to prop
      }
      
      // Return fresh access token from session
      return session.access_token;
    } catch (err: any) {
      // ⚡ Suppress "Auth session missing" errors
      if (err?.message !== 'Auth session missing!') {
        console.error('❌ Error in getFreshAccessToken:', err);
      }
      return accessToken; // Fallback to prop
    }
  };

  // Calculate stats only when instruments change (not on every render)
  useEffect(() => {
    if (instruments.length > 0) {
      const newStats = {
        total: instruments.length,
        nifty: instruments.filter(i => i.underlyingSymbol === 'NIFTY').length,
        banknifty: instruments.filter(i => i.underlyingSymbol === 'BANKNIFTY').length,
        sensex: instruments.filter(i => i.underlyingSymbol === 'SENSEX').length,
        active: instruments.filter(i => i.status === 'active').length,
      };
      setStats(newStats);
    }
  }, [instruments]);

  useEffect(() => {
    loadInstruments();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadInstruments, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadInstruments = async () => {
    setLoading(true);
    try {
      // ⚡ GET FRESH TOKEN BEFORE API CALL
      const freshToken = await getFreshAccessToken();
      
      // ⚡ PRIMARY: Load from SERVER (global instruments for all users)
      console.log('📡 Loading instruments from server...');
      const response = await fetch(`${serverUrl}/instruments/global`, {
        headers: {
          'Authorization': `Bearer ${freshToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.instruments && data.instruments.length > 0) {
          setInstruments(data.instruments);
          console.log(`✅ Loaded ${data.instruments.length} instruments from server (global)`);
          setLoading(false);
          return;
        }
      }
      
      // No instruments found on server
      console.log('ℹ️ No instruments found on server');
      setInstruments([]);
    } catch (err) {
      console.error('❌ Error loading instruments:', err);
      setInstruments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus('📤 Reading CSV file...');

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());

      console.log('📁 CSV Headers:', headers);
      setUploadStatus('🔍 Filtering instruments for NIFTY/BANKNIFTY/SENSEX options...');

      const parsedInstruments: Instrument[] = [];
      
      // Debug: Log first few rows
      console.log('📊 Sample data from first 5 rows:');
      
      // Parse CSV and filter for NIFTY, BANKNIFTY, SENSEX options
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());
        const row: any = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index];
        });

        // Extract fields using ACTUAL Dhan column names
        const tradingSymbol = (row['SYMBOL_NAME'] || row['DISPLAY_NAME'] || '').toUpperCase();
        const instrumentType = (row['INSTRUMENT_TYPE'] || '').toUpperCase();
        const underlyingSymbol = (row['UNDERLYING_SYMBOL'] || '').toUpperCase();
        const optionType = (row['OPTION_TYPE'] || '').toUpperCase();
        const expiryDate = row['SM_EXPIRY_DATE'] || '';
        const strikePrice = row['STRIKE_PRICE'] || '';
        
        // Debug first 5 rows
        if (i <= 5) {
          console.log(`Row ${i}:`, {
            tradingSymbol,
            instrumentType,
            underlyingSymbol,
            optionType,
            strikePrice,
            expiryDate
          });
        }
        
        // ✅ RELAXED FILTER: Capture ALL NIFTY/BANKNIFTY/SENSEX options
        // Don't be too strict - check if it's an option for these underlyings
        
        // Check if it's an option (multiple ways to detect)
        const isOption = (
          instrumentType.includes('OPTION') || 
          instrumentType.includes('OPTIDX') ||
          instrumentType.includes('OPTSTK') ||
          instrumentType === 'INDEX OPTION' ||
          instrumentType === 'EQUITY OPTION' ||
          optionType === 'CALL' || 
          optionType === 'PUT' ||
          optionType === 'CE' ||
          optionType === 'PE' ||
          tradingSymbol.includes('CE') ||
          tradingSymbol.includes('PE')
        );

        // ✅ EXPANDED: Check if underlying is NIFTY, BANKNIFTY, or SENSEX (ALL variations)
        const isNifty = (
          underlyingSymbol === 'NIFTY' || 
          underlyingSymbol === 'NIFTY 50' ||
          underlyingSymbol === 'NIFTY50' ||
          underlyingSymbol.includes('NIFTY') ||
          tradingSymbol.startsWith('NIFTY') ||
          (tradingSymbol.includes('NIFTY') && !tradingSymbol.includes('BANKNIFTY') && !tradingSymbol.includes('FINNIFTY'))
        );
        
        const isBankNifty = (
          underlyingSymbol === 'BANKNIFTY' || 
          underlyingSymbol === 'NIFTY BANK' ||
          underlyingSymbol === 'NIFTYBANK' ||
          underlyingSymbol.includes('BANK') ||
          tradingSymbol.startsWith('BANKNIFTY') ||
          tradingSymbol.includes('BANKNIFTY')
        );
        
        const isSensex = (
          underlyingSymbol === 'SENSEX' ||
          underlyingSymbol === 'BSE SENSEX' ||
          underlyingSymbol.includes('SENSEX') ||
          tradingSymbol.startsWith('SENSEX') ||
          tradingSymbol.includes('SENSEX')
        );
        
        const isValidUnderlying = isNifty || isBankNifty || isSensex;

        // ✅ RELAXED: Accept if it's an option AND valid underlying (strike price optional for now)
        if (isOption && isValidUnderlying) {
          // Determine clean underlying symbol
          let cleanUnderlying = '';
          if (isNifty) {
            cleanUnderlying = 'NIFTY';
          } else if (isBankNifty) {
            cleanUnderlying = 'BANKNIFTY';
          } else if (isSensex) {
            cleanUnderlying = 'SENSEX';
          }

          // Skip if we couldn't determine underlying
          if (!cleanUnderlying) continue;

          // ✅ FORMAT SYMBOL NAME: Create user-friendly display name
          // Example: NIFTY-JAN2026-26300-CE, BANKNIFTY-JAN2026-51500-PE, SENSEX-JAN2026-85000-CE
          let formattedSymbol = tradingSymbol; // Default to raw symbol
          
          if (expiryDate && strikePrice && optionType) {
            // Parse expiry date (format: DD-MMM-YYYY or similar)
            const parseExpiry = (dateStr: string): string => {
              // Clean the date string - remove quotes, extra spaces
              dateStr = dateStr.trim().replace(/"/g, '').replace(/'/g, '');
              
              // Try multiple date formats
              const formats = [
                /(\d{2})-([A-Z]{3})-(\d{4})/i,      // DD-MMM-YYYY (e.g., 30-JAN-2026)
                /(\d{4})-(\d{2})-(\d{2})/,           // YYYY-MM-DD (e.g., 2026-01-30)
                /(\d{2})\/(\d{2})\/(\d{4})/,         // DD/MM/YYYY (e.g., 30/01/2026)
                /([A-Z]{3})\s*(\d{1,2}),?\s*(\d{4})/i, // MMM DD, YYYY (e.g., Jan 30, 2026)
                /(\d{1,2})\s*([A-Z]{3})\s*(\d{4})/i  // DD MMM YYYY (e.g., 30 Jan 2026)
              ];
              
              const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                                 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
              
              for (let formatIdx = 0; formatIdx < formats.length; formatIdx++) {
                const format = formats[formatIdx];
                const match = dateStr.match(format);
                
                if (match) {
                  if (formatIdx === 0) {
                    // DD-MMM-YYYY format
                    return match[2].toUpperCase() + match[3]; // JAN2026
                  } else if (formatIdx === 1) {
                    // YYYY-MM-DD format
                    const monthNum = parseInt(match[2]) - 1;
                    if (monthNum >= 0 && monthNum < 12) {
                      return monthNames[monthNum] + match[1]; // JAN2026
                    }
                  } else if (formatIdx === 2) {
                    // DD/MM/YYYY format
                    const monthNum = parseInt(match[2]) - 1;
                    if (monthNum >= 0 && monthNum < 12) {
                      return monthNames[monthNum] + match[3]; // JAN2026
                    }
                  } else if (formatIdx === 3) {
                    // MMM DD, YYYY format
                    return match[1].toUpperCase() + match[3]; // JAN2026
                  } else if (formatIdx === 4) {
                    // DD MMM YYYY format
                    return match[2].toUpperCase() + match[3]; // JAN2026
                  }
                }
              }
              
              // If no format matched, return empty
              console.log(`⚠️ Could not parse expiry date: "${dateStr}"`);
              return '';
            };
            
            const formattedExpiry = parseExpiry(expiryDate);
            const cleanStrike = strikePrice.toString().replace(/"/g, '').replace(/'/g, '').trim();
            const cleanOptionType = optionType === 'CALL' || optionType === 'CE' ? 'CE' : 
                                   optionType === 'PUT' || optionType === 'PE' ? 'PE' : '';
            
            if (formattedExpiry && cleanOptionType && cleanStrike) {
              // Format: NIFTY-JAN2026-26300-CE or BANKNIFTY-JAN2026-51500-PE
              formattedSymbol = `${cleanUnderlying}-${formattedExpiry}-${cleanStrike}-${cleanOptionType}`;
              
              // Debug: Log formatted symbols for first 10 of each type
              if ((isNifty || isBankNifty || isSensex) && parsedInstruments.filter(p => p.underlyingSymbol === cleanUnderlying).length < 3) {
                console.log(`✅ Formatted ${cleanUnderlying} symbol:`, {
                  original: tradingSymbol,
                  formatted: formattedSymbol,
                  expiry: expiryDate,
                  formattedExpiry: formattedExpiry,
                  strike: cleanStrike,
                  optionType: cleanOptionType
                });
              }
            } else {
              // If formatting failed, log it for debugging
              if (parsedInstruments.length < 10) {
                console.log(`⚠️ Could not format ${cleanUnderlying} symbol:`, {
                  tradingSymbol,
                  expiryDate,
                  formattedExpiry,
                  strikePrice: cleanStrike,
                  optionType: cleanOptionType
                });
              }
            }
          }

          parsedInstruments.push({
            id: `inst_${Date.now()}_${i}`,
            symbol: formattedSymbol, // ✅ Use formatted name
            tradingSymbol: tradingSymbol, // Keep raw symbol for API calls
            securityId: row['SECURITY_ID'] || '',
            exchange: (row['EXCH_ID'] || 'NSE').toUpperCase(),
            instrumentType: instrumentType || 'OPTION',
            expiry: expiryDate,
            strike: strikePrice || '0',
            optionType: optionType === 'CALL' || optionType === 'CE' ? 'CALL' : optionType === 'PUT' || optionType === 'PE' ? 'PUT' : '',
            lotSize: parseInt(row['LOT_SIZE'] || '1'),
            tickSize: parseFloat(row['TICK_SIZE'] || '0.05'),
            underlyingSymbol: cleanUnderlying,
            uploadedAt: new Date().toISOString(),
            status: 'active',
          });
        }
      }

      console.log(`✅ Filtered ${parsedInstruments.length} instruments from ${lines.length - 1} total`);
      
      // Log sample instruments
      console.log('📋 Sample filtered instruments:', parsedInstruments.slice(0, 3));
      
      // ⚡ PRIMARY: Upload to SERVER FIRST (global storage for ALL users)
      // ⚡ CLIENT-SIDE CHUNKING: Split into smaller requests to avoid 502 errors
      const UPLOAD_CHUNK_SIZE = 2000; // Send 2000 instruments per request
      const totalInstruments = parsedInstruments.length;
      const uploadChunks = [];
      
      for (let i = 0; i < totalInstruments; i += UPLOAD_CHUNK_SIZE) {
        uploadChunks.push(parsedInstruments.slice(i, i + UPLOAD_CHUNK_SIZE));
      }
      
      console.log(`📦 Splitting ${totalInstruments} instruments into ${uploadChunks.length} upload requests (${UPLOAD_CHUNK_SIZE} per request)`);
      setUploadStatus(`🌐 Uploading ${totalInstruments} instruments to SERVER in ${uploadChunks.length} batches...`);
      
      try {
        // ⚡ GET FRESH TOKEN BEFORE API CALL
        const freshToken = await getFreshAccessToken();
        
        console.log('🔍 DEBUG: serverUrl =', serverUrl);
        console.log('🔍 DEBUG: Full URL =', `${serverUrl}/admin/instruments/upload`);
        console.log('🔍 DEBUG: Access Token =', freshToken?.substring(0, 30) + '...');
        
        let uploadedCount = 0;
        let oldCount = 0;
        let totalChunks = 0;
        
        // Upload each chunk sequentially (to avoid overwhelming the server)
        for (let i = 0; i < uploadChunks.length; i++) {
          const chunk = uploadChunks[i];
          const isFirstChunk = i === 0;
          const isLastChunk = i === uploadChunks.length - 1;
          
          setUploadStatus(`🌐 Uploading batch ${i + 1}/${uploadChunks.length} (${chunk.length} instruments)...`);
          console.log(`📤 Uploading chunk ${i + 1}/${uploadChunks.length}: ${chunk.length} instruments`);
          
          const response = await fetch(`${serverUrl}/admin/instruments/upload`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${freshToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              instruments: chunk,
              isFirstChunk, // Flag to delete old data on first chunk
              isLastChunk,
              chunkIndex: i,
              totalChunks: uploadChunks.length
            }),
          });

          console.log(`🔍 DEBUG: Chunk ${i + 1} response status =`, response.status);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Server response error for chunk ${i + 1}:`, errorText);
            throw new Error(`Server upload failed for chunk ${i + 1}: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          
          if (data.success) {
            uploadedCount += chunk.length;
            if (isFirstChunk && data.oldCount) {
              oldCount = data.oldCount;
            }
            totalChunks = data.chunks || 0;
            console.log(`✅ Chunk ${i + 1}/${uploadChunks.length} uploaded successfully (${uploadedCount}/${totalInstruments} total)`);
          } else {
            throw new Error(data.message || `Failed to upload chunk ${i + 1}`);
          }
          
          // Small delay between chunks to avoid rate limits
          if (!isLastChunk) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        // All chunks uploaded successfully
        console.log(`✅ Uploaded ${uploadedCount} instruments to SERVER`);
        console.log(`📤 ALL users can now access these instruments on ANY device`);
        console.log(`🗑️ Old instruments: ${oldCount} (auto-deleted)`);
        console.log(`📦 Stored in ${totalChunks} chunks (500 per chunk)`);
        
        // Update UI
        setInstruments(parsedInstruments);
        setUploadStatus(`✅ Successfully uploaded ${uploadedCount} instruments to SERVER in ${totalChunks} chunks! All users can now see them on any device. (Old: ${oldCount} auto-deleted)`);
        
        // Show success message
        setTimeout(() => setUploadStatus(''), 8000);
      } catch (serverError: any) {
        console.error('❌ Server upload error:', serverError);
        setUploadStatus(`❌ Error uploading to server: ${serverError.message}. Instruments NOT saved!`);
        setUploading(false);
        return;
      }
      
    } catch (error: any) {
      console.error('❌ CSV parsing error:', error);
      setUploadStatus(`❌ Error reading CSV: ${error.message}`);
    } finally {
      setUploading(false);
      // Clear file input
      event.target.value = '';
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('⚠️ WARNING: This will delete ALL instruments for ALL users! Are you absolutely sure?')) {
      return;
    }

    if (!confirm('⚠️ FINAL CONFIRMATION: All users will lose access to instruments. Continue?')) {
      return;
    }

    setLoading(true);
    try {
      // ⚡ GET FRESH TOKEN BEFORE API CALL
      const freshToken = await getFreshAccessToken();
      
      // Clear from IndexedDB
      await instrumentStorage.clearInstruments();
      setInstruments([]);
      setUploadStatus('✅ All instruments deleted from IndexedDB');
      setTimeout(() => setUploadStatus(''), 3000);
      
      // Also try to delete from server (background)
      fetch(`${serverUrl}/admin/instruments/delete-all`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${freshToken}`
        }
      }).catch(() => console.log('Server delete skipped'));
    } catch (error) {
      console.error('Error deleting instruments:', error);
      setUploadStatus('❌ Error deleting instruments');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    const csv = [
      ['Trading Symbol', 'Security ID', 'Exchange', 'Type', 'Underlying', 'Expiry', 'Strike', 'Option Type', 'Lot Size', 'Status'].join(','),
      ...filteredInstruments.map(i => [
        i.tradingSymbol,
        i.securityId,
        i.exchange,
        i.instrumentType,
        i.underlyingSymbol,
        i.expiry,
        i.strike,
        i.optionType,
        i.lotSize,
        i.status.toUpperCase()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `instruments_${Date.now()}.csv`;
    a.click();
  };

  const filteredInstruments = instruments.filter(i => {
    const matchesSearch = 
      i.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.exchange.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.underlyingSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.strike.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterType === 'ALL' || i.underlyingSymbol === filterType;

    return matchesSearch && matchesFilter;
  });

  const indexOfLastInstrument = currentPage * itemsPerPage;
  const indexOfFirstInstrument = indexOfLastInstrument - itemsPerPage;
  const currentInstruments = filteredInstruments.slice(indexOfFirstInstrument, indexOfLastInstrument);

  const totalPages = Math.ceil(filteredInstruments.length / itemsPerPage);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Database className="size-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Centralized Instrument Management</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Upload once, all users see the same instruments • Filtered for NIFTY/BANKNIFTY/SENSEX options
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={loadInstruments}
                  variant="outline"
                  className="bg-slate-700/50 border-slate-600"
                  disabled={loading}
                >
                  <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  onClick={exportToCSV}
                  variant="outline"
                  className="bg-green-600/20 border-green-500 text-green-400"
                  disabled={instruments.length === 0}
                >
                  <Download className="size-4 mr-2" />
                  Export CSV
                </Button>
                <Button
                  onClick={() => document.getElementById('csvUpload')?.click()}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={uploading}
                >
                  <Upload className="size-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Dhan CSV'}
                </Button>
                <input
                  type="file"
                  id="csvUpload"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                />
              </div>
            </CardTitle>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Upload Status */}
      {uploadStatus && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className={`border-${uploadStatus.includes('✅') ? 'green' : uploadStatus.includes('❌') ? 'red' : 'blue'}-500/30 bg-slate-800/50`}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {uploadStatus.includes('✅') ? (
                  <CheckCircle className="size-5 text-green-400" />
                ) : uploadStatus.includes('❌') ? (
                  <AlertCircle className="size-5 text-red-400" />
                ) : (
                  <RefreshCw className="size-5 text-blue-400 animate-spin" />
                )}
                <p className="text-white">{uploadStatus}</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Instruments</p>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
              </div>
              <Database className="size-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-purple-500/20 cursor-pointer hover:bg-slate-800/70" onClick={() => setFilterType('NIFTY')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">NIFTY Options</p>
                <p className="text-3xl font-bold text-purple-400">{stats.nifty}</p>
              </div>
              <TrendingUp className="size-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-orange-500/20 cursor-pointer hover:bg-slate-800/70" onClick={() => setFilterType('BANKNIFTY')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">BANKNIFTY Options</p>
                <p className="text-3xl font-bold text-orange-400">{stats.banknifty}</p>
              </div>
              <TrendingUp className="size-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-cyan-500/20 cursor-pointer hover:bg-slate-800/70" onClick={() => setFilterType('SENSEX')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">SENSEX Options</p>
                <p className="text-3xl font-bold text-cyan-400">{stats.sensex}</p>
              </div>
              <TrendingUp className="size-8 text-cyan-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Active</p>
                <p className="text-3xl font-bold text-green-400">{stats.active}</p>
              </div>
              <CheckCircle className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Buttons */}
      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Button
              onClick={() => setFilterType('ALL')}
              variant={filterType === 'ALL' ? 'default' : 'outline'}
              className={filterType === 'ALL' ? 'bg-blue-600' : 'bg-slate-700/50'}
            >
              All Instruments
            </Button>
            <Button
              onClick={() => setFilterType('NIFTY')}
              variant={filterType === 'NIFTY' ? 'default' : 'outline'}
              className={filterType === 'NIFTY' ? 'bg-purple-600' : 'bg-slate-700/50'}
            >
              NIFTY Only
            </Button>
            <Button
              onClick={() => setFilterType('BANKNIFTY')}
              variant={filterType === 'BANKNIFTY' ? 'default' : 'outline'}
              className={filterType === 'BANKNIFTY' ? 'bg-orange-600' : 'bg-slate-700/50'}
            >
              BANKNIFTY Only
            </Button>
            <Button
              onClick={() => setFilterType('SENSEX')}
              variant={filterType === 'SENSEX' ? 'default' : 'outline'}
              className={filterType === 'SENSEX' ? 'bg-cyan-600' : 'bg-slate-700/50'}
            >
              SENSEX Only
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-slate-400" />
            <Input
              placeholder="Search by symbol, underlying, strike, or exchange..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-700 text-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* Instruments Table */}
      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Database className="size-5 text-blue-400" />
            Instruments List ({filteredInstruments.length})
          </CardTitle>
          {instruments.length > 0 && (
            <Button
              onClick={handleDeleteAll}
              variant="outline"
              size="sm"
              className="bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/30"
            >
              <Trash2 className="size-4 mr-2" />
              Delete All
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="size-8 animate-spin text-blue-400" />
              </div>
            ) : filteredInstruments.length === 0 ? (
              <div className="text-center py-12">
                <FileUp className="size-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400 mb-2">No instruments found</p>
                <p className="text-sm text-slate-500">Upload a Dhan CSV file to get started</p>
              </div>
            ) : (
              currentInstruments.map((instrument, index) => (
                <motion.div
                  key={instrument.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 hover:border-blue-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`p-3 rounded-lg ${
                        instrument.underlyingSymbol === 'NIFTY' ? 'bg-purple-500/10' :
                        instrument.underlyingSymbol === 'BANKNIFTY' ? 'bg-orange-500/10' :
                        'bg-cyan-500/10'
                      }`}>
                        <TrendingUp className={`size-6 ${
                          instrument.underlyingSymbol === 'NIFTY' ? 'text-purple-400' :
                          instrument.underlyingSymbol === 'BANKNIFTY' ? 'text-orange-400' :
                          'text-cyan-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-white text-base">{instrument.symbol}</p>
                          <Badge variant="outline" className="text-xs bg-blue-500/10">
                            {instrument.underlyingSymbol}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${
                            instrument.optionType === 'CALL' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {instrument.optionType}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Strike: ₹{instrument.strike}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Lot: {instrument.lotSize}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-400">
                          {instrument.exchange} • Expiry: {instrument.expiry} • Security ID: {instrument.securityId}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 font-mono">
                          API Symbol: {instrument.tradingSymbol}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Button
                onClick={() => handlePageChange(currentPage - 1)}
                variant="outline"
                size="sm"
                className="bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30"
                disabled={currentPage === 1}
              >
                <Clock className="size-4 mr-2" />
                Previous
              </Button>
              <p className="text-sm text-slate-400">
                Page {currentPage} of {totalPages}
              </p>
              <Button
                onClick={() => handlePageChange(currentPage + 1)}
                variant="outline"
                size="sm"
                className="bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30"
                disabled={currentPage === totalPages}
              >
                <Clock className="size-4 mr-2" />
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-slate-300">
              <p className="font-semibold mb-2 text-blue-400">Centralized System:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>Admin uploads Dhan master CSV file once</li>
                <li>System automatically filters for NIFTY, BANKNIFTY, and SENSEX options</li>
                <li>All users (web + mobile app) see the same instruments</li>
                <li>No need for individual users to upload instruments</li>
                <li>Users can directly search and select instruments for trading</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}