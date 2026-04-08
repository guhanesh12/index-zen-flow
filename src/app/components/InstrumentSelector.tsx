// @ts-nocheck
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Search, Plus, Minus, RefreshCw, AlertCircle, CheckCircle, X } from "lucide-react";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { instrumentStorage } from '../utils/instrumentStorage';

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
  underlyingSymbol: string;
  uploadedAt: string;
  status: 'active' | 'inactive';
}

interface InstrumentSelectorProps {
  onSymbolAdd: (symbol: any) => void;
}

export function InstrumentSelector({ onSymbolAdd }: InstrumentSelectorProps) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterIndex, setFilterIndex] = useState<'ALL' | 'NIFTY' | 'BANKNIFTY' | 'SENSEX'>('ALL');
  const [filterOptionType, setFilterOptionType] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  
  // Config storage for each instrument
  const [configs, setConfigs] = useState<Record<string, {
    quantity: number;
    target: number;
    stopLoss: number;
    // ⚡ Trailing fields
    trailingEnabled: boolean;
    trailingActivation: number;
    targetJump: number;
    stopLossJump: number;
  }>>({});

  // Load instruments from IndexedDB on mount
  useEffect(() => {
    loadInstruments();
  }, []);

  const loadInstruments = async () => {
    setLoading(true);
    try {
      // FIRST: Try to load from user's own Dhan database (downloaded directly)
      const userInstruments = await loadFromDhanInstrumentsDB();
      
      if (userInstruments && userInstruments.length > 0) {
        setInstruments(userInstruments);
        console.log(`✅ Loaded ${userInstruments.length} instruments from your Dhan database`);
        setError(null);
        return;
      }
      
      // FALLBACK: Load from admin-uploaded instruments
      const adminInstruments = await instrumentStorage.getAllInstruments();
      
      if (adminInstruments && adminInstruments.length > 0) {
        setInstruments(adminInstruments);
        console.log(`✅ Loaded ${adminInstruments.length} instruments from admin's database`);
        setError(null);
      } else {
        setError('No instruments found. Please download instruments using the button above.');
      }
    } catch (err: any) {
      console.error('❌ Error loading instruments:', err);
      setError('Failed to load instruments');
    } finally {
      setLoading(false);
    }
  };

  // Load instruments from user's Dhan database (IndexedDB)
  const loadFromDhanInstrumentsDB = async (): Promise<Instrument[]> => {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open('DhanInstrumentsDB', 1);
        
        request.onerror = () => {
          console.log('📭 DhanInstrumentsDB not found or error:', request.error);
          resolve([]);
        };
        
        request.onsuccess = () => {
          const db = request.result;
          
          try {
            // Check if object store exists
            if (!db.objectStoreNames.contains('instruments')) {
              console.log('📭 No instruments object store found - please download instruments first');
              db.close();
              resolve([]);
              return;
            }
            
            const transaction = db.transaction(['instruments'], 'readonly');
            const store = transaction.objectStore('instruments');
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => {
              try {
                const dhanInstruments = getAllRequest.result || [];
                
                if (dhanInstruments.length === 0) {
                  console.log('📭 No instruments in database - please download instruments first');
                  db.close();
                  resolve([]);
                  return;
                }
                
                // Convert Dhan instruments to our Instrument format
                const converted: Instrument[] = dhanInstruments.map((dhan: any) => ({
                  id: dhan.securityId,
                  symbol: dhan.customSymbol,
                  tradingSymbol: dhan.tradingSymbol,
                  securityId: dhan.securityId,
                  exchange: dhan.exchangeSegment || 'NSE_FNO', // ✅ Use exchange from downloaded data
                  instrumentType: dhan.instrumentType || 'OPTIDX',
                  expiry: dhan.expiryDate,
                  strike: String(dhan.strikePrice),
                  optionType: dhan.optionType === 'CE' ? 'CALL' : dhan.optionType === 'PE' ? 'PUT' : '',
                  lotSize: dhan.lotSize || 25,
                  tickSize: 0.05,
                  underlyingSymbol: dhan.underlyingSymbol,
                  uploadedAt: new Date().toISOString(),
                  status: 'active' as const
                }));
                
                db.close();
                console.log(`✅ Loaded ${converted.length} instruments from Dhan database`);
                resolve(converted);
              } catch (err) {
                console.error('❌ Error converting instruments:', err);
                db.close();
                resolve([]);
              }
            };
            
            getAllRequest.onerror = () => {
              console.error('❌ Error reading instruments:', getAllRequest.error);
              db.close();
              resolve([]);
            };
            
            transaction.onerror = () => {
              console.error('❌ Transaction error:', transaction.error);
              db.close();
              resolve([]);
            };
          } catch (err) {
            console.error('❌ Error accessing object store:', err);
            db.close();
            resolve([]);
          }
        };
        
        request.onupgradeneeded = (event: any) => {
          // This shouldn't happen when just reading, but handle it gracefully
          const db = event.target.result;
          console.log('⚠️ Database upgrade needed during read - closing');
          db.close();
          resolve([]);
        };
      } catch (err) {
        console.error('❌ Error opening IndexedDB:', err);
        resolve([]);
      }
    });
  };

  // Get config for instrument (with defaults)
  const getConfig = (id: string, lotSize: number) => {
    return configs[id] || {
      quantity: lotSize,
      target: 3000,
      stopLoss: 2000,
      // ⚡ Trailing fields
      trailingEnabled: false,
      trailingActivation: 100,
      targetJump: 50,
      stopLossJump: 50
    };
  };

  // Update config
  const updateConfig = (id: string, field: 'quantity' | 'target' | 'stopLoss' | 'trailingEnabled' | 'trailingActivation' | 'targetJump' | 'stopLossJump', value: number | boolean, lotSize?: number) => {
    setConfigs(prev => {
      const existing = prev[id];
      
      if (existing) {
        // Config exists - just update the field
        return {
          ...prev,
          [id]: {
            ...existing,
            [field]: value
          }
        };
      } else {
        // 🔥 FIX: First update - initialize properly with lotSize as default quantity
        const defaultQty = lotSize || 0;
        return {
          ...prev,
          [id]: {
            quantity: field === 'quantity' && typeof value === 'number' ? value : defaultQty,
            target: field === 'target' && typeof value === 'number' ? value : 3000,
            stopLoss: field === 'stopLoss' && typeof value === 'number' ? value : 2000,
            trailingEnabled: field === 'trailingEnabled' && typeof value === 'boolean' ? value : false,
            trailingActivation: field === 'trailingActivation' && typeof value === 'number' ? value : 100,
            targetJump: field === 'targetJump' && typeof value === 'number' ? value : 50,
            stopLossJump: field === 'stopLossJump' && typeof value === 'number' ? value : 50
          }
        };
      }
    });
  };

  // Increment quantity by lot size
  const incrementQuantity = (id: string, lotSize: number) => {
    const current = getConfig(id, lotSize);
    updateConfig(id, 'quantity', current.quantity + lotSize);
  };

  // Decrement quantity by lot size
  const decrementQuantity = (id: string, lotSize: number) => {
    const current = getConfig(id, lotSize);
    const newQty = Math.max(lotSize, current.quantity - lotSize);
    updateConfig(id, 'quantity', newQty);
  };

  // Add symbol to trading
  const handleAddSymbol = (inst: Instrument) => {
    const config = getConfig(inst.id, inst.lotSize);
    
    // ⚡⚡⚡ SMART EXCHANGE DETECTION - Auto-fix exchange based on index
    let exchangeSegment = inst.exchange || 'NSE_FNO';
    
    // Fix invalid exchanges IMMEDIATELY
    if (exchangeSegment === 'NSE' || exchangeSegment === 'NFO') {
      // ✅ SENSEX uses BSE_FNO, others use NSE_FNO
      exchangeSegment = inst.underlyingSymbol === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
      console.log(`🔧 AUTO-FIX: Changed exchange from ${inst.exchange} → ${exchangeSegment} for ${inst.symbol} (Index: ${inst.underlyingSymbol})`);
    } else if (exchangeSegment === 'BSE') {
      exchangeSegment = 'BSE_FNO';
      console.log(`🔧 AUTO-FIX: Changed exchange from BSE → BSE_FNO for ${inst.symbol}`);
    } else if (!exchangeSegment || exchangeSegment.trim() === '') {
      // ✅ Smart default based on index
      exchangeSegment = inst.underlyingSymbol === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
      console.log(`🔧 AUTO-FIX: Set default exchange ${exchangeSegment} for ${inst.symbol} (Index: ${inst.underlyingSymbol})`);
    }
    
    const symbolToAdd = {
      id: `symbol_${Date.now()}`,
      name: inst.tradingSymbol || inst.symbol, // ✅ Use raw tradingSymbol for API calls
      displayName: inst.symbol, // ✅ Use formatted symbol for display (NIFTY-JAN2026-26300-CE)
      index: inst.underlyingSymbol,
      optionType: inst.optionType === 'CALL' ? 'CE' : inst.optionType === 'PUT' ? 'PE' : '',
      transactionType: 'BUY' as const,
      exchangeSegment: exchangeSegment, // ✅ Use corrected exchange
      productType: 'INTRADAY' as const,
      orderType: 'MARKET' as const,
      validity: 'DAY' as const,
      securityId: inst.securityId,
      quantity: config.quantity,
      disclosedQuantity: 0,
      price: 0,
      triggerPrice: 0,
      afterMarketOrder: false,
      amoTime: 'OPEN' as const,
      boProfitValue: 0,
      boStopLossValue: 0,
      targetAmount: config.target,
      stopLossAmount: config.stopLoss,
      
      // ⚡ Trailing fields
      trailingEnabled: config.trailingEnabled,
      trailingActivationAmount: config.trailingActivation,
      targetJumpAmount: config.targetJump,
      stopLossJumpAmount: config.stopLossJump,
      currentTarget: config.target, // Initialize with base target
      currentStopLoss: config.stopLoss, // Initialize with base stop loss
      trailingActivated: false,
      
      active: true,
      waitingForSignal: false
    };

    onSymbolAdd(symbolToAdd);
    setSuccess(`✅ Added ${inst.symbol} (Qty: ${config.quantity}, Target: ₹${config.target}, SL: ₹${config.stopLoss})`);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Filter instruments
  const filteredInstruments = instruments.filter(inst => {
    const matchesSearch = !searchTerm || 
      inst.tradingSymbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.strike.includes(searchTerm) ||
      inst.securityId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesIndex = filterIndex === 'ALL' || inst.underlyingSymbol === filterIndex;
    const matchesOptionType = filterOptionType === 'ALL' || inst.optionType === filterOptionType;

    return matchesSearch && matchesIndex && matchesOptionType;
  }).sort((a, b) => {
    // ✅ SORT BY NEAREST EXPIRY FIRST, then by strike price
    const dateA = new Date(a.expiry).getTime();
    const dateB = new Date(b.expiry).getTime();
    
    if (dateA !== dateB) {
      return dateA - dateB; // Earlier dates first
    }
    
    // If same expiry, sort by strike price
    return parseFloat(a.strike) - parseFloat(b.strike);
  });

  return (
    <Card className="border-blue-500/20 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="size-5 text-blue-400" />
            <div>
              <h3 className="text-lg">Select Instruments</h3>
              <p className="text-xs text-slate-400 font-normal mt-1">
                Search and add instruments (Download instruments first using button above)
              </p>
            </div>
          </div>
          <Button
            onClick={loadInstruments}
            variant="outline"
            size="sm"
            className="bg-slate-700/50"
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-slate-200 font-semibold">Index</Label>
            <Select value={filterIndex} onValueChange={(v: any) => setFilterIndex(v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700 h-9 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="NIFTY">📈 NIFTY</SelectItem>
                <SelectItem value="BANKNIFTY">🏦 BANKNIFTY</SelectItem>
                <SelectItem value="SENSEX">📊 SENSEX</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-200 font-semibold">Option Type</Label>
            <Select value={filterOptionType} onValueChange={(v: any) => setFilterOptionType(v)}>
              <SelectTrigger className="bg-slate-800 border-slate-700 h-9 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="CALL">CALL (CE)</SelectItem>
                <SelectItem value="PUT">PUT (PE)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            placeholder="Search strike, symbol, or security ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>

        {/* Stats */}
        <div className="flex justify-between text-xs text-slate-400">
          <span>Total: {instruments.length}</span>
          <span>Filtered: {filteredInstruments.length}</span>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="size-8 animate-spin text-blue-400" />
          </div>
        ) : searchTerm && filteredInstruments.length > 0 ? (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredInstruments.slice(0, 50).map((inst) => {
              const config = getConfig(inst.id, inst.lotSize);
              
              return (
                <div
                  key={inst.id}
                  className="p-3 rounded border bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-all space-y-3"
                >
                  {/* Instrument Info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white text-sm">{inst.symbol}</span>
                        <Badge variant="outline" className="text-[10px] h-5 bg-slate-700/50 border-slate-600 text-white font-semibold">
                          {inst.underlyingSymbol === 'NIFTY' ? '📈 NIFTY' : 
                           inst.underlyingSymbol === 'BANKNIFTY' ? '🏦 BANKNIFTY' : 
                           '📊 SENSEX'}
                        </Badge>
                        <Badge 
                          className={`text-[10px] h-5 font-semibold ${
                            inst.optionType === 'CALL' 
                              ? 'bg-green-600/20 text-green-300 border-green-500/50' 
                              : 'bg-red-600/20 text-red-300 border-red-500/50'
                          }`}
                        >
                          {inst.optionType === 'CALL' ? 'CE' : 'PE'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 text-[11px] text-slate-400">
                        <div>Strike: <span className="text-white">{inst.strike}</span></div>
                        <div>Lot: <span className="text-green-400 font-semibold">{inst.lotSize}</span></div>
                        {inst.expiry && (
                          <div className="col-span-2 text-[10px]">Expiry: <span className="text-white">{inst.expiry}</span></div>
                        )}
                        <div className="col-span-2 text-[10px]">API Symbol: <span className="text-slate-500 font-mono">{inst.tradingSymbol}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Quantity Controls with +/- Buttons */}
                  <div className="space-y-2">
                    <Label className="text-[10px] text-white font-semibold">📦 Quantity</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          decrementQuantity(inst.id, inst.lotSize);
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 bg-slate-700 border-slate-600"
                      >
                        <Minus className="size-4" />
                      </Button>
                      <Input
                        type="number"
                        value={config.quantity}
                        onChange={(e) => updateConfig(inst.id, 'quantity', parseInt(e.target.value) || inst.lotSize)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 text-center text-sm bg-slate-900 border-slate-600 text-white font-semibold"
                        min={inst.lotSize}
                        step={inst.lotSize}
                      />
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          incrementQuantity(inst.id, inst.lotSize);
                        }}
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 bg-green-600/20 border-green-500 text-green-400"
                      >
                        <Plus className="size-4" />
                      </Button>
                      <span className="text-xs text-slate-300 ml-2 font-medium">
                        ({config.quantity / inst.lotSize} lots)
                      </span>
                    </div>
                  </div>

                  {/* Target & Stop Loss */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-green-400 font-semibold flex items-center gap-1">
                        🎯 Target (₹)
                      </Label>
                      <Input
                        type="number"
                        value={config.target}
                        onChange={(e) => updateConfig(inst.id, 'target', parseFloat(e.target.value) || 3000)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 text-sm bg-slate-900 border-green-500/50 text-white font-semibold focus:border-green-500"
                        placeholder="3000"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-red-400 font-semibold flex items-center gap-1">
                        🛑 Stop Loss (₹)
                      </Label>
                      <Input
                        type="number"
                        value={config.stopLoss}
                        onChange={(e) => updateConfig(inst.id, 'stopLoss', parseFloat(e.target.value) || 2000)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 text-sm bg-slate-900 border-red-500/50 text-white font-semibold focus:border-red-500"
                        placeholder="2000"
                      />
                    </div>
                  </div>

                  {/* ⚡ Trailing Stop Loss */}
                  <div className="space-y-2 bg-blue-900/10 border border-blue-500/20 rounded p-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] text-blue-300 flex items-center gap-1">
                        <span>⚡</span> Trailing Stop Loss
                      </Label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.trailingEnabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateConfig(inst.id, 'trailingEnabled', e.target.checked, inst.lotSize);
                          }}
                          className="w-3 h-3 text-blue-600 bg-slate-800 border-slate-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-[10px] text-slate-300">Enable</span>
                      </label>
                    </div>
                    
                    {config.trailingEnabled && (
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="space-y-1">
                          <Label className="text-[9px] text-emerald-400 font-medium">💰 Activate @</Label>
                          <Input
                            type="number"
                            value={config.trailingActivation}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateConfig(inst.id, 'trailingActivation', parseFloat(e.target.value) || 100);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 text-xs bg-slate-900 border-emerald-500/40 text-white font-semibold"
                            placeholder="100"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] text-green-400 font-medium">📈 Target +</Label>
                          <Input
                            type="number"
                            value={config.targetJump}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateConfig(inst.id, 'targetJump', parseFloat(e.target.value) || 50);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 text-xs bg-slate-900 border-green-500/40 text-white font-semibold"
                            placeholder="50"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[9px] text-orange-400 font-medium">🔻 SL -</Label>
                          <Input
                            type="number"
                            value={config.stopLossJump}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateConfig(inst.id, 'stopLossJump', parseFloat(e.target.value) || 50);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 text-xs bg-slate-900 border-orange-500/40 text-white font-semibold"
                            placeholder="50"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Add Button */}
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddSymbol(inst);
                    }}
                    className="w-full h-9 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Plus className="size-4 mr-2" />
                    Add to Trading
                  </Button>
                </div>
              );
            })}
            {filteredInstruments.length > 50 && (
              <div className="text-center text-slate-400 text-xs py-2">
                Showing first 50 results. Refine your search for more specific results.
              </div>
            )}
          </div>
        ) : !searchTerm && instruments.length > 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Search className="size-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Start searching to see instruments</p>
            <p className="text-xs mt-1">Try typing a strike price or symbol</p>
          </div>
        ) : searchTerm ? (
          <div className="text-center py-12 text-slate-400">
            <AlertCircle className="size-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No instruments found</p>
            <p className="text-xs mt-1">Try different search terms or filters</p>
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <AlertCircle className="size-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No instruments available</p>
            <p className="text-xs mt-1">Admin needs to upload instruments first</p>
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-slate-400 p-3 bg-blue-500/10 border border-blue-500/20 rounded">
          <p className="font-medium text-blue-300 mb-1">ℹ️ Smart Features:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li>✅ <span className="text-green-300">CE (green)</span> and <span className="text-red-300">PE (red)</span> color coded for easy identification</li>
            <li>📅 Sorted by nearest expiry first for quick access</li>
            <li>🔍 Search by strike price (e.g. \"24800\") to find both CE and PE</li>
            <li>⚡ One-click add to trading with auto-detected exchange</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}