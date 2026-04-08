import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Upload, Download, Filter, TrendingUp, TrendingDown } from 'lucide-react';
import {
  ALL_INDICES,
  getIndexConfig,
  getNextExpiry,
  formatExpiry,
  getDaysToExpiry,
  generateATMStrikes,
  OptionData,
  OptionType,
  parseOptionFromCSV
} from './IndicesConfig';

interface OptionsChainManagerProps {
  serverUrl: string;
  accessToken: string;
  selectedIndex: string;
  livePrice: number;
  onOptionSelect: (option: OptionData) => void;
}

export function OptionsChainManager({
  serverUrl,
  accessToken,
  selectedIndex,
  livePrice,
  onOptionSelect
}: OptionsChainManagerProps) {
  const [optionsData, setOptionsData] = useState<OptionData[]>([]);
  const [filteredOptions, setFilteredOptions] = useState<OptionData[]>([]);
  const [selectedOptionType, setSelectedOptionType] = useState<'ALL' | 'CE' | 'PE'>('ALL');
  const [nearExpiry, setNearExpiry] = useState(true);
  const [strikeRange, setStrikeRange] = useState(10);
  const [loading, setLoading] = useState(false);

  const indexConfig = getIndexConfig(selectedIndex);
  const nextExpiry = indexConfig ? getNextExpiry(indexConfig.expiryType) : new Date();
  const daysToExpiry = getDaysToExpiry(nextExpiry);

  // Load options from localStorage on mount
  useEffect(() => {
    loadOptionsFromStorage();
  }, []);

  // Filter options when dependencies change
  useEffect(() => {
    filterOptions();
  }, [selectedIndex, selectedOptionType, nearExpiry, strikeRange, livePrice, optionsData]);

  const loadOptionsFromStorage = () => {
    try {
      const stored = localStorage.getItem('options_chain_data');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        const withDates = parsed.map((opt: any) => ({
          ...opt,
          expiryDate: new Date(opt.expiryDate)
        }));
        setOptionsData(withDates);
      }
    } catch (error) {
      console.error('Error loading options from storage:', error);
    }
  };

  const saveOptionsToStorage = (data: OptionData[]) => {
    try {
      localStorage.setItem('options_chain_data', JSON.stringify(data));
    } catch (error) {
      console.error('Error saving options to storage:', error);
    }
  };

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const parsedOptions: OptionData[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());
        const row: any = {};
        
        headers.forEach((header, index) => {
          row[header] = values[index];
        });

        // Detect index from symbol
        let detectedIndex = '';
        const symbol = row.SEM_TRADING_SYMBOL || row.symbol || '';
        
        for (const idx of ALL_INDICES) {
          if (symbol.startsWith(idx.tradingSymbol)) {
            detectedIndex = idx.id;
            break;
          }
        }

        if (detectedIndex) {
          const option = parseOptionFromCSV(row, detectedIndex);
          if (option && option.securityId) {
            parsedOptions.push(option);
          }
        }
      }

      // Merge with existing data (avoid duplicates)
      const existingIds = new Set(optionsData.map(o => o.securityId));
      const newOptions = parsedOptions.filter(o => !existingIds.has(o.securityId));
      const combined = [...optionsData, ...newOptions];

      setOptionsData(combined);
      saveOptionsToStorage(combined);

      alert(`Successfully imported ${parsedOptions.length} options (${newOptions.length} new)`);
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Error parsing CSV file. Please check the format.');
    } finally {
      setLoading(false);
      event.target.value = ''; // Reset input
    }
  };

  const filterOptions = () => {
    if (!indexConfig) {
      setFilteredOptions([]);
      return;
    }

    let filtered = optionsData.filter(opt => opt.indexName === selectedIndex);

    // Filter by option type
    if (selectedOptionType !== 'ALL') {
      filtered = filtered.filter(opt => opt.optionType === selectedOptionType);
    }

    // Filter by near expiry
    if (nearExpiry) {
      const expiryStr = formatExpiry(nextExpiry);
      filtered = filtered.filter(opt => {
        const optExpiry = formatExpiry(opt.expiryDate);
        return optExpiry === expiryStr;
      });
    }

    // Filter by strike range (ATM strikes)
    if (livePrice > 0) {
      const atmStrikes = generateATMStrikes(livePrice, selectedIndex, strikeRange);
      const minStrike = Math.min(...atmStrikes);
      const maxStrike = Math.max(...atmStrikes);
      
      filtered = filtered.filter(opt => 
        opt.strike >= minStrike && opt.strike <= maxStrike
      );
    }

    // Sort by strike
    filtered.sort((a, b) => a.strike - b.strike);

    setFilteredOptions(filtered);
  };

  const downloadSampleCSV = () => {
    const csv = `SEM_TRADING_SYMBOL,SEM_SMST_SECURITY_ID,SEM_STRIKE_PRICE,SEM_OPTION_TYPE,SEM_EXPIRY_DATE
NIFTY26DEC2425000CE,123456,25000,CE,2024-12-26
NIFTY26DEC2425000PE,123457,25000,PE,2024-12-26
BANKNIFTY26DEC2450000CE,123458,50000,CE,2024-12-26
BANKNIFTY26DEC2450000PE,123459,50000,PE,2024-12-26`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'options_sample.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAllData = () => {
    if (confirm('Are you sure you want to clear all options data?')) {
      setOptionsData([]);
      setFilteredOptions([]);
      localStorage.removeItem('options_chain_data');
    }
  };

  return (
    <div className="space-y-4">
      {/* Upload and Controls */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Options Chain Manager</span>
            <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50">
              {optionsData.length} Total Options
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload Section */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="csv-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm">
                  <Upload className="w-4 h-4" />
                  Upload CSV File
                </div>
              </Label>
              <Input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="hidden"
                disabled={loading}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={downloadSampleCSV}
              className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Sample CSV
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={clearAllData}
            >
              Clear All
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Option Type</Label>
              <Select value={selectedOptionType} onValueChange={(val: any) => setSelectedOptionType(val)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="CE">Call (CE)</SelectItem>
                  <SelectItem value="PE">Put (PE)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Strike Range</Label>
              <Select value={strikeRange.toString()} onValueChange={(val) => setStrikeRange(parseInt(val))}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="5">±5 Strikes</SelectItem>
                  <SelectItem value="10">±10 Strikes</SelectItem>
                  <SelectItem value="15">±15 Strikes</SelectItem>
                  <SelectItem value="20">±20 Strikes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Expiry Filter</Label>
              <Select value={nearExpiry ? 'near' : 'all'} onValueChange={(val) => setNearExpiry(val === 'near')}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="near">Near Expiry</SelectItem>
                  <SelectItem value="all">All Expiries</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-zinc-400">Next Expiry</Label>
              <div className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm">
                {formatExpiry(nextExpiry)} ({daysToExpiry}d)
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-400" />
              <span className="text-zinc-400">Filtered:</span>
              <Badge variant="secondary">{filteredOptions.length} options</Badge>
            </div>
            {indexConfig && (
              <div className="text-zinc-400">
                Lot Size: <span className="text-zinc-100">{indexConfig.lotSize}</span> | 
                Strike Gap: <span className="text-zinc-100">₹{indexConfig.strikeGap}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Options Chain Display */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>
            {indexConfig?.displayName || selectedIndex} Options Chain
            {livePrice > 0 && (
              <span className="text-sm font-normal text-zinc-400 ml-2">
                @ ₹{livePrice.toFixed(2)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-zinc-400">Loading options...</div>
          ) : filteredOptions.length === 0 ? (
            <div className="text-center py-8 text-zinc-400">
              <p className="mb-2">No options found for {selectedIndex}</p>
              <p className="text-xs">Upload a CSV file with options data to get started</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredOptions.map((option, index) => {
                const isCall = option.optionType === 'CE';
                const isATM = Math.abs(option.strike - livePrice) < (indexConfig?.strikeGap || 50);
                
                return (
                  <button
                    key={`${option.securityId}-${index}`}
                    onClick={() => onOptionSelect(option)}
                    className="w-full p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-lg text-left transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isCall ? (
                          <TrendingUp className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-400" />
                        )}
                        <div>
                          <div className="font-mono text-sm">
                            {option.symbol}
                          </div>
                          <div className="text-xs text-zinc-400">
                            Strike: ₹{option.strike} | Expiry: {option.expiry}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isATM && (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/50">
                            ATM
                          </Badge>
                        )}
                        <Badge variant={isCall ? 'default' : 'destructive'}>
                          {option.optionType}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-500 font-mono">
                      Security ID: {option.securityId}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
