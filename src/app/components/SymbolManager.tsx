import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import { Trash2, Plus, Check, Search, Edit, Download, Loader2, Send, Zap, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { InstrumentSelector } from "./InstrumentSelector";
import { DhanInstrumentDownloader } from "./DhanInstrumentDownloader";
import { SymbolRequest } from "./SymbolRequest";

interface DhanOrderSymbol {
  id: string;
  
  // Basic Info
  name: string; // Actual Dhan trading symbol for API
  displayName?: string; // Optional formatted name for UI display
  index: 'NIFTY' | 'BANKNIFTY' | 'SENSEX'; // Main index for data analysis
  optionType: 'CE' | 'PE'; // Call or Put
  
  // Dhan Order Parameters
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: 'NSE_EQ' | 'NSE_FNO' | 'NSE_COMM' | 'BSE_EQ' | 'BSE_FNO' | 'MCX_COMM';
  productType: 'CNC' | 'INTRADAY' | 'MARGIN' | 'MTF' | 'CO' | 'BO';
  orderType: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
  validity: 'DAY' | 'IOC';
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
  // ✅ Only include amoTime if afterMarketOrder is true
  amoTime: 'OPEN' | 'OPEN_30' | 'OPEN_60' | 'PRE_OPEN';
  boProfitValue: number;
  boStopLossValue: number;
  
  // Risk Management
  targetAmount: number; // In rupees
  stopLossAmount: number; // In rupees
  
  // ⚡ NEW: Trailing Stop Loss Feature
  trailingEnabled?: boolean; // Enable/disable trailing
  trailingActivationAmount?: number; // Profit amount to activate trailing (e.g., ₹1000)
  targetJumpAmount?: number; // How much to increase target (e.g., ₹500)
  stopLossJumpAmount?: number; // How much to decrease stop loss (e.g., ₹500)
  
  // ⚡ Dynamic values (updated by trailing logic)
  currentTarget?: number; // Current dynamic target (starts as targetAmount)
  currentStopLoss?: number; // Current dynamic stop loss (starts as stopLossAmount)
  trailingActivated?: boolean; // Flag to track if trailing has started
  
  // Status
  active: boolean;
  waitingForSignal: boolean;
  currentPosition?: {
    orderId: string;
    entryPrice: number;
    entryTime: number;
    pnl: number;
  };
}

interface SymbolManagerProps {
  serverUrl: string;
  accessToken: string;
}

export function SymbolManager({ serverUrl, accessToken }: SymbolManagerProps) {
  const [symbols, setSymbols] = useState<DhanOrderSymbol[]>([]);
  const [dhanClientId, setDhanClientId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingSymbolId, setEditingSymbolId] = useState<string | null>(null);
  
  // Smart Symbol Lookup state
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [strikeSearch, setStrikeSearch] = useState('');
  
  // Form state with defaults
  const [formData, setFormData] = useState<Partial<DhanOrderSymbol>>(getDefaultFormData());
  
  // Test order state
  const [testingOrderId, setTestingOrderId] = useState<string | null>(null);
  const [placingOrderId, setPlacingOrderId] = useState<string | null>(null); // ⚡ For manual orders
  const [orderResults, setOrderResults] = useState<{ [key: string]: { success: boolean; message: string; timestamp: number; type?: 'test' | 'real' } }>({});

  // ✅ Trigger to force InstrumentSelector refresh after download
  const [instrumentRefreshKey, setInstrumentRefreshKey] = useState(0);

  useEffect(() => {
    loadSymbols();
    loadDhanClientId();
    syncAllSymbolsToBackend(); // ✅ Sync all symbols on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚡ LISTEN FOR CREDENTIALS UPDATE EVENT (from Settings panel)
  useEffect(() => {
    const handleCredentialsUpdate = () => {
      console.log('🔄 Credentials updated event received! Reloading dhanClientId...');
      loadDhanClientId();
    };
    
    window.addEventListener('credentials-updated', handleCredentialsUpdate);
    
    return () => {
      window.removeEventListener('credentials-updated', handleCredentialsUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDhanClientId = async () => {
    try {
      // ⚡ FIRST: Try to load from localStorage as a fallback
      const storedClientId = localStorage.getItem('dhan_client_id');
      if (storedClientId) {
        console.log('✅ Dhan Client ID loaded from localStorage:', storedClientId);
        setDhanClientId(storedClientId);
      }
      
      // ⚡ THEN: Try to fetch fresh data from server
      const response = await fetch(`${serverUrl}/api-credentials`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!response.ok) {
        console.error(`❌ Failed to fetch credentials: ${response.status} ${response.statusText}`);
        if (storedClientId) {
          console.log('⚡ Using localStorage fallback:', storedClientId);
        }
        return;
      }
      
      const data = await response.json();
      if (data.credentials?.dhanClientId) {
        setDhanClientId(data.credentials.dhanClientId);
        // ⚡ Save to localStorage for future fallback
        localStorage.setItem('dhan_client_id', data.credentials.dhanClientId);
        console.log('✅ Dhan Client ID loaded from server:', data.credentials.dhanClientId);
      }
    } catch (error) {
      console.error("Failed to load Dhan Client ID:", error);
      // ⚡ Try localStorage one more time on error
      const storedClientId = localStorage.getItem('dhan_client_id');
      if (storedClientId && !dhanClientId) {
        console.log('⚡ Using localStorage fallback after error:', storedClientId);
        setDhanClientId(storedClientId);
      }
    }
  };

  const loadSymbols = async () => {
    try {
      const stored = localStorage.getItem('trading_symbols');
      if (stored) {
        setSymbols(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load symbols:", error);
    }
  };

  const saveSymbols = async (updatedSymbols: DhanOrderSymbol[]) => {
    // ⚡⚡⚡ AUTO-CORRECTION: Fix all symbols BEFORE saving
    const correctedSymbols = updatedSymbols.map(symbol => {
      const fixed = { ...symbol };
      
      // Fix 1: Invalid exchange segments with SMART DETECTION based on index
      if (symbol.exchangeSegment === 'NSE' || symbol.exchangeSegment === 'NFO') {
        // ✅ SENSEX uses BSE_FNO, others use NSE_FNO
        fixed.exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
        console.log(`🔧 AUTO-FIX: NSE → ${fixed.exchangeSegment} for ${symbol.displayName || symbol.name}`);
      } else if (symbol.exchangeSegment === 'BSE') {
        fixed.exchangeSegment = 'BSE_FNO';
        console.log(`🔧 AUTO-FIX: BSE → BSE_FNO for ${symbol.displayName || symbol.name}`);
      } else if (!symbol.exchangeSegment || symbol.exchangeSegment.trim() === '') {
        // ✅ Smart default: SENSEX uses BSE_FNO, others use NSE_FNO
        fixed.exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
        console.log(`🔧 AUTO-FIX: Added exchange ${fixed.exchangeSegment} for ${symbol.displayName || symbol.name}`);
      }
      
      // Fix 2: Wrong product type for F&O
      if ((fixed.exchangeSegment === 'NSE_FNO' || fixed.exchangeSegment === 'BSE_FNO') && 
          (symbol.productType === 'CNC' || symbol.productType === 'MTF')) {
        fixed.productType = 'INTRADAY';
        console.log(`🔧 AUTO-FIX: Product type ${symbol.productType} → INTRADAY for ${symbol.displayName || symbol.name}`);
      }
      
      // Fix 3: Remove invalid amoTime
      if (!symbol.afterMarketOrder && symbol.amoTime) {
        delete fixed.amoTime;
        console.log(`🔧 AUTO-FIX: Removed invalid amoTime from ${symbol.displayName || symbol.name}`);
      }
      
      // 🔥 Fix 4: Auto-fix invalid quantity to minimum valid value (1)
      if (!symbol.quantity || symbol.quantity < 1) {
        fixed.quantity = 1; // Set to minimum valid - user should edit to correct lot size
        console.log(`🔧 AUTO-FIX: Quantity ${symbol.quantity || 0} → 1 (minimum) for ${symbol.displayName || symbol.name} ⚠️ EDIT SYMBOL to set correct lot size from instrument!`);
      }
      
      return fixed;
    });
    
    // Save to localStorage
    localStorage.setItem('trading_symbols', JSON.stringify(correctedSymbols));
    setSymbols(correctedSymbols);
    
    // ✅ Also sync to backend automatically
    try {
      const response = await fetch(`${serverUrl}/symbols/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ symbols: correctedSymbols })
      });
      
      if (response.ok) {
        console.log(`✅ Auto-synced ${correctedSymbols.length} corrected symbols to backend`);
      }
    } catch (error) {
      console.log('⚠️ Failed to sync to backend (not critical):', error);
    }
  };

  // ✅ Sync all symbols from localStorage to backend on mount
  const syncAllSymbolsToBackend = async () => {
    try {
      const stored = localStorage.getItem('trading_symbols');
      if (!stored) {
        console.log('📭 No symbols to sync');
        return;
      }
      
      let localSymbols = JSON.parse(stored);
      if (localSymbols.length === 0) {
        console.log('📭 No symbols to sync');
        return;
      }
      
      // ✅ MIGRATION 1: Clean up old symbols with bad amoTime values
      // ✅ MIGRATION 2: Fix invalid exchange segments (NSE → NSE_FNO, BSE → BSE_FNO)
      let symbolsCleaned = false;
      localSymbols = localSymbols.map((symbol: any) => {
        const cleaned = { ...symbol };
        
        // Fix 1: Remove amoTime if afterMarketOrder is false
        if (!symbol.afterMarketOrder && symbol.amoTime) {
          symbolsCleaned = true;
          delete cleaned.amoTime;
          console.log(`🧹 Cleaned amoTime from ${symbol.displayName || symbol.name}`);
        }
        
        // Fix 2: Correct invalid exchange segments with SMART DETECTION based on index
        if (symbol.exchangeSegment === 'NSE') {
          symbolsCleaned = true;
          // ✅ SENSEX uses BSE_FNO, others use NSE_FNO
          cleaned.exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
          console.log(`🔧 AUTO-FIX: NSE → ${cleaned.exchangeSegment} for ${symbol.displayName || symbol.name} (Index: ${symbol.index})`);
        } else if (symbol.exchangeSegment === 'BSE') {
          symbolsCleaned = true;
          cleaned.exchangeSegment = 'BSE_FNO';
          console.log(`🔧 AUTO-FIX: BSE → BSE_FNO for ${symbol.displayName || symbol.name}`);
        } else if (!symbol.exchangeSegment || symbol.exchangeSegment.trim() === '') {
          symbolsCleaned = true;
          // ✅ Smart default: SENSEX uses BSE_FNO, others use NSE_FNO
          cleaned.exchangeSegment = symbol.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
          console.log(`🔧 AUTO-FIX: Added default exchange ${cleaned.exchangeSegment} for ${symbol.displayName || symbol.name} (Index: ${symbol.index})`);
        }
        
        // 🔥 Fix 3: Auto-fix invalid quantity to minimum valid value (1)
        if (!symbol.quantity || symbol.quantity < 1) {
          symbolsCleaned = true;
          cleaned.quantity = 1; // Set to minimum valid - user should edit to correct lot size
          console.log(`🔧 AUTO-FIX: Quantity ${symbol.quantity || 0} → 1 (minimum) for ${symbol.displayName || symbol.name} ⚠️ EDIT SYMBOL to set correct lot size from instrument!`);
        }
        
        return cleaned;
      });
      
      // Save cleaned symbols back to localStorage
      if (symbolsCleaned) {
        localStorage.setItem('trading_symbols', JSON.stringify(localSymbols));
        setSymbols(localSymbols); // ✅ Update state immediately
        console.log('✅ Cleaned up old symbols with invalid values');
      }
      
      console.log(`🔄 Syncing ${localSymbols.length} symbols to backend...`);
      
      // Sync each symbol
      for (const symbol of localSymbols) {
        try {
          // ✅ Clean up the symbol before syncing
          const cleanedSymbol = { ...symbol };
          
          // Fix amoTime issue: Don't send amoTime if afterMarketOrder is false
          if (!cleanedSymbol.afterMarketOrder && cleanedSymbol.amoTime) {
            delete cleanedSymbol.amoTime;
            console.log(`🧹 Cleaned amoTime from ${cleanedSymbol.displayName || cleanedSymbol.name}`);
          }
          
          const response = await fetch(`${serverUrl}/sync-user-symbol`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(cleanedSymbol)
          });
          
          if (response.ok) {
            console.log(`✅ Synced: ${symbol.displayName || symbol.name}`);
          } else {
            console.warn(`⚠️ Failed to sync: ${symbol.displayName || symbol.name}`);
          }
        } catch (error) {
          console.error(`❌ Error syncing ${symbol.displayName || symbol.name}:`, error);
        }
      }
      
      console.log('✅ Symbol sync complete!');
    } catch (error) {
      console.error('❌ Failed to sync symbols:', error);
    }
  };

  // Handle symbol added from CSV uploader
  const handleCSVSymbolAdd = (csvSymbol: any) => {
    // ⚡ Debug logging for trailing fields
    if (csvSymbol.trailingEnabled) {
      console.log('⚡ TRAILING ENABLED - Adding symbol with trailing config:', {
        name: csvSymbol.displayName || csvSymbol.name,
        trailingEnabled: csvSymbol.trailingEnabled,
        trailingActivation: csvSymbol.trailingActivationAmount,
        targetJump: csvSymbol.targetJumpAmount,
        stopLossJump: csvSymbol.stopLossJumpAmount
      });
    }
    
    const newSymbol: DhanOrderSymbol = {
      id: csvSymbol.id,
      name: csvSymbol.name, // Actual Dhan trading symbol for API
      displayName: csvSymbol.displayName, // Formatted name for UI (optional)
      index: csvSymbol.index,
      optionType: csvSymbol.optionType,
      transactionType: csvSymbol.transactionType,
      exchangeSegment: csvSymbol.exchangeSegment,
      productType: csvSymbol.productType,
      orderType: csvSymbol.orderType,
      validity: csvSymbol.validity,
      securityId: csvSymbol.securityId,
      quantity: csvSymbol.quantity,
      disclosedQuantity: csvSymbol.disclosedQuantity,
      price: csvSymbol.price,
      triggerPrice: csvSymbol.triggerPrice,
      afterMarketOrder: csvSymbol.afterMarketOrder,
      amoTime: csvSymbol.amoTime,
      boProfitValue: csvSymbol.boProfitValue,
      boStopLossValue: csvSymbol.boStopLossValue,
      targetAmount: csvSymbol.targetAmount,
      stopLossAmount: csvSymbol.stopLossAmount,
      
      // ⚡ Trailing Stop Loss fields
      trailingEnabled: csvSymbol.trailingEnabled || false,
      trailingActivationAmount: csvSymbol.trailingActivationAmount || 0,
      targetJumpAmount: csvSymbol.targetJumpAmount || 0,
      stopLossJumpAmount: csvSymbol.stopLossJumpAmount || 0,
      currentTarget: csvSymbol.currentTarget || csvSymbol.targetAmount,
      currentStopLoss: csvSymbol.currentStopLoss || csvSymbol.stopLossAmount,
      trailingActivated: csvSymbol.trailingActivated || false,
      
      active: csvSymbol.active,
      waitingForSignal: csvSymbol.waitingForSignal
    };

    saveSymbols([...symbols, newSymbol]);
  };

  const addSymbol = () => {
    if (!formData.name || !formData.securityId) {
      alert("Please fill in Symbol Name and Security ID");
      return;
    }
    
    // 🔥 FIX: Validate quantity is at least 1
    if (!formData.quantity || formData.quantity < 1) {
      alert("Please enter a valid Quantity (minimum 1 lot)");
      return;
    }

    const newSymbol: DhanOrderSymbol = {
      id: `SYM_${Date.now()}`,
      name: formData.name!,
      index: formData.index!,
      optionType: formData.optionType!,
      transactionType: formData.transactionType!,
      exchangeSegment: formData.exchangeSegment!,
      productType: formData.productType!,
      orderType: formData.orderType!,
      validity: formData.validity!,
      securityId: formData.securityId!,
      quantity: formData.quantity!,
      disclosedQuantity: formData.disclosedQuantity!,
      price: formData.price!,
      triggerPrice: formData.triggerPrice!,
      afterMarketOrder: formData.afterMarketOrder!,
      // ✅ Only include amoTime if afterMarketOrder is true
      amoTime: formData.afterMarketOrder ? (formData.amoTime || 'OPEN') : 'OPEN',
      boProfitValue: formData.boProfitValue!,
      boStopLossValue: formData.boStopLossValue!,
      targetAmount: formData.targetAmount!,
      stopLossAmount: formData.stopLossAmount!,
      
      // ⚡ Trailing Stop Loss fields
      trailingEnabled: formData.trailingEnabled || false,
      trailingActivationAmount: formData.trailingActivationAmount || 0,
      targetJumpAmount: formData.targetJumpAmount || 0,
      stopLossJumpAmount: formData.stopLossJumpAmount || 0,
      currentTarget: formData.targetAmount!, // Initialize with base target
      currentStopLoss: formData.stopLossAmount!, // Initialize with base stop loss
      trailingActivated: false,
      
      active: true,
      waitingForSignal: true
    };

    saveSymbols([...symbols, newSymbol]);
    setShowForm(false);
    
    // Reset form
    setFormData(getDefaultFormData());
  };

  const editSymbol = (symbolId: string) => {
    const symbolToEdit = symbols.find(s => s.id === symbolId);
    if (symbolToEdit) {
      // 🔥 FIX: Auto-correct invalid quantity when editing
      const correctedSymbol = { ...symbolToEdit };
      if (!correctedSymbol.quantity || correctedSymbol.quantity < 1) {
        correctedSymbol.quantity = 1; // Set to minimum valid
        alert(`⚠️ WARNING: This symbol had invalid quantity (${symbolToEdit.quantity || 0}).\n\n✅ Auto-fixed to 1 (minimum).\n\n📦 IMPORTANT: Search for this instrument again and select it to set the correct lot size (e.g., 65 for NIFTY)!`);
      }
      setFormData(correctedSymbol);
      setEditingSymbolId(symbolId);
      setShowForm(true);
    }
  };

  const updateSymbol = () => {
    if (!formData.name || !formData.securityId) {
      alert("Please fill in Symbol Name and Security ID");
      return;
    }
    
    // 🔥 FIX: Validate quantity is at least 1
    if (!formData.quantity || formData.quantity < 1) {
      alert("Please enter a valid Quantity (minimum 1 lot)");
      return;
    }

    const updatedSymbols = symbols.map(s => {
      if (s.id === editingSymbolId) {
        return {
          ...s,
          name: formData.name!,
          index: formData.index!,
          optionType: formData.optionType!,
          transactionType: formData.transactionType!,
          exchangeSegment: formData.exchangeSegment!,
          productType: formData.productType!,
          orderType: formData.orderType!,
          validity: formData.validity!,
          securityId: formData.securityId!,
          quantity: formData.quantity!,
          disclosedQuantity: formData.disclosedQuantity!,
          price: formData.price!,
          triggerPrice: formData.triggerPrice!,
          afterMarketOrder: formData.afterMarketOrder!,
          amoTime: formData.afterMarketOrder ? (formData.amoTime || 'OPEN') : 'OPEN',
          boProfitValue: formData.boProfitValue!,
          boStopLossValue: formData.boStopLossValue!,
          targetAmount: formData.targetAmount!,
          stopLossAmount: formData.stopLossAmount!,
          
          // ⚡ Trailing Stop Loss fields
          trailingEnabled: formData.trailingEnabled || false,
          trailingActivationAmount: formData.trailingActivationAmount || 0,
          targetJumpAmount: formData.targetJumpAmount || 0,
          stopLossJumpAmount: formData.stopLossJumpAmount || 0,
          // Preserve existing dynamic values if position is active
          currentTarget: s.currentTarget || formData.targetAmount!,
          currentStopLoss: s.currentStopLoss || formData.stopLossAmount!,
          trailingActivated: s.trailingActivated || false,
        };
      }
      return s;
    });

    saveSymbols(updatedSymbols);
    setShowForm(false);
    setEditingSymbolId(null);
    setFormData(getDefaultFormData());
  };

  const cancelEdit = () => {
    setShowForm(false);
    setEditingSymbolId(null);
    setFormData(getDefaultFormData());
  };

  const deleteSymbol = (id: string) => {
    saveSymbols(symbols.filter(s => s.id !== id));
  };

  const toggleActive = (id: string) => {
    saveSymbols(symbols.map(s => 
      s.id === id ? { ...s, active: !s.active } : s
    ));
  };

  // 🔧 COMPREHENSIVE FIX: Fix all common symbol issues
  const quickFixAllSymbols = () => {
    let fixedCount = 0;
    const issues: string[] = [];
    
    const fixed = symbols.map(s => {
      const cleaned = { ...s };
      let symbolFixed = false;
      
      // Fix 1: Invalid exchange segments (NSE → NSE_FNO, BSE → BSE_FNO)
      // ✅ SMART DETECTION: Auto-detect correct exchange based on index
      if (s.exchangeSegment === 'NSE') {
        cleaned.exchangeSegment = 'NSE_FNO';
        symbolFixed = true;
        issues.push(`Fixed exchange: NSE → NSE_FNO`);
      } else if (s.exchangeSegment === 'BSE') {
        cleaned.exchangeSegment = 'BSE_FNO';
        symbolFixed = true;
        issues.push(`Fixed exchange: BSE → BSE_FNO`);
      } else if (!s.exchangeSegment || s.exchangeSegment.trim() === '') {
        // Smart default: SENSEX uses BSE_FNO, others use NSE_FNO
        cleaned.exchangeSegment = s.index === 'SENSEX' ? 'BSE_FNO' : 'NSE_FNO';
        symbolFixed = true;
        issues.push(`Added default exchange: ${cleaned.exchangeSegment} (auto-detected from index)`);
      }
      
      // Fix 2: Wrong product type for F&O segments
      if ((cleaned.exchangeSegment === 'NSE_FNO' || cleaned.exchangeSegment === 'BSE_FNO') && 
          (s.productType === 'CNC' || s.productType === 'MTF')) {
        cleaned.productType = 'INTRADAY' as const;
        symbolFixed = true;
        issues.push(`Fixed product type: ${s.productType} → INTRADAY`);
      }
      
      // Fix 3: Remove amoTime if afterMarketOrder is false
      if (!s.afterMarketOrder && s.amoTime) {
        delete cleaned.amoTime;
        symbolFixed = true;
        issues.push(`Removed invalid amoTime`);
      }
      
      // 🔥 Fix 4: Warn about invalid quantity (let user edit manually to preserve lot size)
      if (!s.quantity || s.quantity < 1) {
        symbolFixed = true;
        issues.push(`⚠️ Symbol "${s.displayName || s.name}" has invalid quantity (${s.quantity || 0}). Please edit and set correct lot size from instrument.`);
        // Don't auto-fix - user must manually set correct lot size
      }
      
      if (symbolFixed) {
        fixedCount++;
      }
      
      return cleaned;
    });
    
    if (fixedCount > 0) {
      saveSymbols(fixed);
      alert(
        `✅ Fixed ${fixedCount} symbol(s)!\n\n` +
        `Issues resolved:\n` +
        `${Array.from(new Set(issues)).join('\n')}\n\n` +
        `All symbols are now ready for trading!`
      );
    } else {
      alert('✅ All symbols are already correctly configured!');
    }
  };

  // Quick fix for all F&O symbols with wrong product type (DEPRECATED - use quickFixAllSymbols)
  const quickFixFNOSymbols = () => {
    quickFixAllSymbols(); // Call comprehensive fix instead
  };

  // Quick fix for AMO settings (DEPRECATED - use quickFixAllSymbols)
  const quickFixAMOSettings = () => {
    quickFixAllSymbols(); // Call comprehensive fix instead
  };

  // Smart Symbol Lookup
  const searchSymbols = async () => {
    if (!strikeSearch) {
      alert('Please enter strike price (e.g., 26100)');
      return;
    }

    if (!formData.index || !formData.optionType) {
      alert('Please select Index and Option Type first');
      return;
    }

    setSearchLoading(true);
    setSearchResults([]);
    
    try {
      const response = await fetch(`${serverUrl}/search-dhan-instruments`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          strikePrice: parseFloat(strikeSearch),
          underlying: formData.index,
          optionType: formData.optionType,
          exchangeSegment: formData.exchangeSegment || 'NSE_FNO'
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.instruments && data.instruments.length > 0) {
        setSearchResults(data.instruments);
        console.log(`✅ Found ${data.instruments.length} matching instruments`);
      } else {
        alert('No matching instruments found. Try a different strike price or check if the option exists.');
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Failed to search symbols:", error);
      alert('Failed to search Dhan instruments. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  // Auto-fill form with selected instrument
  const selectInstrument = (instrument: any) => {
    setFormData({
      ...formData,
      name: instrument.displayName || instrument.name,
      securityId: instrument.securityId,
      quantity: instrument.lotSize, // Auto-fill with lot size (user can customize)
      index: instrument.underlying === 'NIFTY' ? 'NIFTY' : 'BANKNIFTY',
      optionType: instrument.optionType
    });
    
    // Clear search results
    setSearchResults([]);
    setStrikeSearch('');
    
    alert(`✅ Auto-filled from Dhan!\n\nSymbol: ${instrument.displayName}\nSecurity ID: ${instrument.securityId}\n\n📦 Quantity set to: ${instrument.lotSize} lots\n(This is the official lot size from Dhan)\n\nYou can increase/decrease quantity before saving if needed.`);
  };

  // Test Order Function
  const testOrder = async (symbolId: string) => {
    const symbol = symbols.find(s => s.id === symbolId);
    if (!symbol) {
      alert('Symbol not found!');
      return;
    }

    setLoading(true);
    setTestingOrderId(symbolId);
    
    try {
      const response = await fetch(`${serverUrl}/test-dhan-order`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(symbol)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setOrderResults(prev => ({
          ...prev,
          [symbolId]: { success: true, type: 'test', message: data.message, timestamp: Date.now() }
        }));
        alert(`✅ Test Passed!\n\n${data.message}`);
      } else {
        setOrderResults(prev => ({
          ...prev,
          [symbolId]: { success: false, type: 'test', message: data.message, timestamp: Date.now() }
        }));
        alert(`❌ Test Failed!\n\n${data.message}`);
      }
    } catch (error) {
      console.error("Failed to test order:", error);
      setOrderResults(prev => ({
        ...prev,
        [symbolId]: { success: false, type: 'test', message: 'An error occurred', timestamp: Date.now() }
      }));
      alert('Failed to test order. Please try again.');
    } finally {
      setLoading(false);
      setTestingOrderId(null);
    }
  };

  // ⚡ MANUAL ORDER FUNCTION - Place REAL order to broker (same as AI automatic orders)
  const placeManualOrder = async (symbolId: string) => {
    const symbol = symbols.find(s => s.id === symbolId);
    if (!symbol) {
      alert('Symbol not found!');
      return;
    }

    // Confirmation dialog
    const confirmed = window.confirm(
      `🚨 PLACE REAL ORDER TO BROKER?\n\n` +
      `Symbol: ${symbol.displayName || symbol.name}\n` +
      `Security ID: ${symbol.securityId}\n` +
      `Transaction: ${symbol.transactionType}\n` +
      `Quantity: ${symbol.quantity}\n` +
      `Exchange: ${symbol.exchangeSegment}\n` +
      `Product: ${symbol.productType}\n\n` +
      `⚠️ This will place a REAL order with your broker!\n` +
      `Are you sure you want to continue?`
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setPlacingOrderId(symbolId); // ⚡ Track manual order loading
    
    try {
      console.log('🚀 MANUAL ORDER - Step 1: Syncing symbol to backend...');
      
      // ✅ STEP 1: Sync symbol to backend's user-specific storage
      const syncResponse = await fetch(`${serverUrl}/sync-user-symbol`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(symbol)
      });
      
      if (!syncResponse.ok) {
        const errorData = await syncResponse.json();
        console.error('⚠️ Symbol sync failed:', errorData);
        alert(`⚠️ Failed to sync symbol to backend!\n\nError: ${errorData.error}\n\nTrying to place order anyway...`);
      } else {
        const syncData = await syncResponse.json();
        console.log('✅ Symbol synced to backend. Total user symbols:', syncData.symbolCount);
      }
      
      console.log('🚀 MANUAL ORDER - Step 2: Placing order:', {
        symbolId: symbol.id,
        securityId: symbol.securityId,
        transactionType: symbol.transactionType,
        quantity: symbol.quantity,
        exchangeSegment: symbol.exchangeSegment,
        index: symbol.index
      });

      // ✅ STEP 2: Place order with SAME endpoint as AI automatic orders!
      const response = await fetch(`${serverUrl}/execute-trade`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          symbolId: symbol.id,
          securityId: symbol.securityId,
          transactionType: symbol.transactionType,
          quantity: symbol.quantity,
          testMode: false // ⚡ REAL ORDER!
        })
      });
      
      const data = await response.json();
      
      console.log('📥 MANUAL ORDER - Response:', data);
      
      if (data.success && data.order) {
        const ord = data.order;
        // ── Card shows the raw Dhan broker response ───────────
        const rawSuccess =
          `Order ID : ${ord.orderId || '—'}\n` +
          `Status   : ${ord.orderStatus || ord.status || 'PENDING'}\n` +
          `Type     : ${symbol.transactionType} ${symbol.quantity} qty  |  ${symbol.orderType || 'MARKET'}`;

        setOrderResults(prev => ({
          ...prev,
          [symbolId]: { success: true, type: 'real', message: rawSuccess, timestamp: Date.now() }
        }));

        alert(
          `✅ REAL ORDER PLACED TO BROKER!\n\n` +
          `Order ID: ${ord.orderId}\n` +
          `Status: ${ord.orderStatus || ord.status || 'PENDING'}\n` +
          `Symbol: ${symbol.displayName || symbol.name}\n` +
          `Transaction: ${symbol.transactionType}  Qty: ${symbol.quantity}\n\n` +
          `Check your Dhan app for order confirmation!`
        );
      } else {
        const rawDhanMsg = data.error || data.message || 'Unknown error';

        // ── Build a short card message with the real Dhan output ─
        let cardMsg: string;
        if (data.errorCode === 'TOKEN_EXPIRED') {
          cardMsg = 'Dhan Error: Invalid Token (DH-908)\nAction required: Update your access token in Broker Setup.';
        } else if (data.errorCode === 'IP_WHITELIST_PENDING') {
          cardMsg = `Dhan Error: Invalid IP (DH-905)\nVPS IP ${data.vpsIP || ''} not yet whitelisted — wait 15–30 min.`;
        } else {
          cardMsg = `Dhan Response: ${rawDhanMsg}`;
        }

        setOrderResults(prev => ({
          ...prev,
          [symbolId]: { success: false, type: 'real', message: cardMsg, timestamp: Date.now() }
        }));

        // ── Alert with actionable instructions ───────────────
        if (data.errorCode === 'TOKEN_EXPIRED') {
          alert(
            `🔑 Dhan Access Token Expired\n\n` +
            `You generated a new Dhan access token, but the app still has your old one.\n\n` +
            `✅ How to fix (takes 1 minute):\n` +
            `1. Go to Broker Setup tab\n` +
            `2. Click "Edit" on your Dhan credentials\n` +
            `3. Paste your new access token from Dhan\n` +
            `4. Save — then try placing the order again\n\n` +
            `Dhan tokens expire every 24 hours and must be refreshed daily.`
          );
        } else if (data.errorCode === 'IP_WHITELIST_PENDING') {
          const vpsIP = data.vpsIP || 'your VPS IP';
          alert(
            `⏳ Dhan IP Whitelist Not Activated Yet\n\n` +
            `Your dedicated VPS IP is: ${vpsIP}\n\n` +
            `You have already added this IP in Dhan → Static IP Settings.\n` +
            `Dhan takes 15–30 minutes to activate a newly added IP.\n\n` +
            `✅ What to do:\n` +
            `1. Wait 15–30 minutes after adding the IP in Dhan\n` +
            `2. Then try placing the order again\n\n` +
            `Once activated, all your orders will route through ${vpsIP} automatically.`
          );
        } else {
          alert(`❌ Order Placement Failed!\n\nDhan Response: ${rawDhanMsg}\n\nPlease check:\n- Market is open\n- Dhan credentials are valid\n- Security ID is correct\n- You have sufficient balance`);
        }
      }
    } catch (error) {
      console.error("❌ MANUAL ORDER - Error:", error);
      setOrderResults(prev => ({
        ...prev,
        [symbolId]: { 
          success: false,
          type: 'real',
          message: `Connection error: ${error}`,
          timestamp: Date.now() 
        }
      }));
      alert(`❌ Failed to place order!\n\nError: ${error}\n\nPlease check your connection and try again.`);
    } finally {
      setLoading(false);
      setPlacingOrderId(null); // ⚡ Clear manual order loading
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Symbol Configuration - Dhan Order Format</CardTitle>
            <p className="text-sm text-zinc-400 mt-1">
              Configure symbols for AI-powered auto trading
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SymbolRequest serverUrl={serverUrl} accessToken={accessToken} />
            <Button
              onClick={() => setShowForm(!showForm)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Symbol
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Dhan Client ID Display */}
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-blue-300">
              Dhan Client ID: <span className="font-mono font-bold">{dhanClientId || 'Not configured'}</span>
            </span>
          </div>
          <p className="text-xs text-blue-400/70 mt-1 ml-6">
            Automatically loaded from Settings
          </p>
        </div>

        {/* Dhan Instrument Downloader - Download instruments directly from Dhan API */}
        <DhanInstrumentDownloader 
          onInstrumentsProcessed={(count) => {
            console.log(`✅ ${count} instruments downloaded and ready for use`);
            // ✅ Trigger InstrumentSelector to refresh
            setInstrumentRefreshKey(prev => prev + 1);
          }}
        />

        {/* CSV Symbol Uploader - NEW! */}
        <InstrumentSelector 
          key={instrumentRefreshKey}
          onSymbolAdd={handleCSVSymbolAdd}
        />

        {/* Add New Symbol Form */}
        {showForm && (
          <div className="p-6 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-6">
            <h3 className="text-lg font-semibold text-emerald-400">
              {editingSymbolId ? '✏️ Edit Symbol' : 'Add New Symbol'}
            </h3>
            
            {/* 🔍 SMART SYMBOL LOOKUP - NEW! */}
            {!editingSymbolId && (
              <div className="p-5 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border-2 border-emerald-500/50 rounded-lg space-y-4">
                <div className="flex items-center gap-3">
                  <Search className="w-6 h-6 text-emerald-400" />
                  <div>
                    <h4 className="font-bold text-emerald-400">🚀 Smart Symbol Lookup (Recommended)</h4>
                    <p className="text-xs text-emerald-300">Search Dhan's database - No manual Security ID needed!</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Index *</Label>
                    <Select value={formData.index} onValueChange={(v: 'NIFTY' | 'BANKNIFTY' | 'SENSEX') => setFormData({ ...formData, index: v })}>
                      <SelectTrigger className="bg-zinc-800 border-emerald-500/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NIFTY">📈 NIFTY</SelectItem>
                        <SelectItem value="BANKNIFTY">🏦 BANKNIFTY</SelectItem>
                        <SelectItem value="SENSEX">📊 SENSEX</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Option Type *</Label>
                    <Select value={formData.optionType} onValueChange={(v: 'CE' | 'PE') => setFormData({ ...formData, optionType: v })}>
                      <SelectTrigger className="bg-zinc-800 border-emerald-500/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CE">CE (Call)</SelectItem>
                        <SelectItem value="PE">PE (Put)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Strike Price *</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 26100"
                      value={strikeSearch}
                      onChange={(e) => setStrikeSearch(e.target.value)}
                      className="bg-zinc-800 border-emerald-500/50"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          searchSymbols();
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-zinc-300">Exchange</Label>
                    <Select value={formData.exchangeSegment || 'NSE_FNO'} onValueChange={(v: any) => setFormData({ ...formData, exchangeSegment: v })}>
                      <SelectTrigger className="bg-zinc-800 border-emerald-500/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NSE_FNO">NSE F&O ⭐</SelectItem>
                        <SelectItem value="BSE_FNO">BSE F&O</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={searchSymbols}
                    disabled={searchLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 h-10"
                  >
                    {searchLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Search Dhan
                      </>
                    )}
                  </Button>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-sm text-emerald-400 font-semibold">
                      ✅ Found {searchResults.length} instrument(s). Click to auto-fill form:
                    </p>
                    {searchResults.map((inst, idx) => (
                      <div
                        key={idx}
                        onClick={() => selectInstrument(inst)}
                        className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-600 hover:border-emerald-500 cursor-pointer transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-zinc-100">{inst.displayName || inst.name}</span>
                              <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-300">
                                {inst.underlying}
                              </Badge>
                              <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300">
                                {inst.optionType}
                              </Badge>
                              {inst.expiryFlag === 'W' && (
                                <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-300">
                                  Weekly
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-zinc-400 space-x-3">
                              <span>Strike: <span className="text-zinc-300">{inst.strike}</span></span>
                              <span>Expiry: <span className="text-zinc-300">{new Date(inst.expiry).toLocaleDateString()}</span></span>
                              <span>Lot Size: <span className="text-emerald-400 font-semibold">{inst.lotSize}</span></span>
                              <span>Security ID: <span className="text-blue-400 font-mono">{inst.securityId}</span></span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                              <Download className="w-3 h-3 mr-1" />
                              Use This
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-zinc-400 italic">
                  💡 Tip: Select Index & Option Type → Enter Strike → Click "Search Dhan" → Click any result to auto-fill everything!
                </p>
              </div>
            )}
            
            {/* SECURITY ID WARNING */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="text-amber-400 text-2xl">⚠️</div>
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-400 mb-1">CRITICAL: Security ID Must Match Your Strike Price!</h4>
                  <p className="text-sm text-amber-300 mb-2">
                    The <strong>Security ID</strong> determines which exact option contract will be traded.
                  </p>
                  <ul className="text-xs text-amber-400 space-y-1 list-disc ml-4">
                    <li>If you configure <strong>26100 CE</strong>, enter the Security ID for <strong>NIFTY 26100 CE</strong> from Dhan's option chain</li>
                    <li>If you configure <strong>26100 PE</strong>, enter the Security ID for <strong>NIFTY 26100 PE</strong> from Dhan's option chain</li>
                    <li><strong>Symbol Name</strong> is just for display - the <strong>Security ID</strong> controls the actual trade!</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300 border-b border-zinc-700 pb-2">Basic Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Main Index * 📊</Label>
                  <Select value={formData.index} onValueChange={(v: 'NIFTY' | 'BANKNIFTY' | 'SENSEX') => setFormData({ ...formData, index: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NIFTY">📈 NIFTY 50</SelectItem>
                      <SelectItem value="BANKNIFTY">🏦 BANK NIFTY</SelectItem>
                      <SelectItem value="SENSEX">📊 SENSEX</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-blue-400">AI will analyze this index's data for signals</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Symbol Name *</Label>
                  <Input
                    placeholder="e.g., NIFTY 24300 CE"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Option Type *</Label>
                  <Select value={formData.optionType} onValueChange={(v: 'CE' | 'PE') => setFormData({ ...formData, optionType: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CE">CE (Call)</SelectItem>
                      <SelectItem value="PE">PE (Put)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Security ID (Dhan) *</Label>
                  <Input
                    placeholder="e.g., 123456"
                    value={formData.securityId}
                    onChange={(e) => setFormData({ ...formData, securityId: e.target.value })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-amber-400">
                    ⚠️ IMPORTANT: Enter the OPTION security ID (from options chain), NOT the index ID!
                  </p>
                  <p className="text-xs text-blue-400">
                    ℹ️ Get security ID from Dhan's options chain for your strike price
                  </p>
                </div>
              </div>
            </div>

            {/* Dhan Order Parameters */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300 border-b border-zinc-700 pb-2">Dhan Order Parameters</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Transaction Type</Label>
                  <Select value={formData.transactionType} onValueChange={(v: 'BUY' | 'SELL') => setFormData({ ...formData, transactionType: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">BUY</SelectItem>
                      <SelectItem value="SELL">SELL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Exchange Segment</Label>
                  <Select 
                    value={formData.exchangeSegment} 
                    onValueChange={(v: any) => {
                      // Auto-correct product type based on exchange segment
                      let newProductType = formData.productType;
                      
                      // F&O exchanges don't support CNC or MTF
                      if ((v === 'NSE_FNO' || v === 'BSE_FNO') && 
                          (formData.productType === 'CNC' || formData.productType === 'MTF')) {
                        newProductType = 'INTRADAY';
                      }
                      
                      // Equity exchanges don't support MARGIN, CO, BO
                      if ((v === 'NSE_EQ' || v === 'BSE_EQ') && 
                          ['MARGIN', 'CO', 'BO'].includes(formData.productType || '')) {
                        newProductType = 'CNC';
                      }
                      
                      setFormData({ 
                        ...formData, 
                        exchangeSegment: v,
                        productType: newProductType
                      });
                    }}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NSE_EQ">NSE - Equity Cash</SelectItem>
                      <SelectItem value="NSE_FNO">NSE - F&O ⭐ (Options)</SelectItem>
                      <SelectItem value="NSE_COMM">NSE - Commodity</SelectItem>
                      <SelectItem value="BSE_EQ">BSE - Equity Cash</SelectItem>
                      <SelectItem value="BSE_FNO">BSE - F&O</SelectItem>
                      <SelectItem value="MCX_COMM">MCX - Commodity</SelectItem>
                    </SelectContent>
                  </Select>
                  {(formData.exchangeSegment === 'NSE_FNO' || formData.exchangeSegment === 'BSE_FNO') && (
                    <p className="text-xs text-emerald-400">
                      ✅ F&O segment selected - Use INTRADAY, MARGIN, CO, or BO product types
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Product Type</Label>
                  <Select 
                    value={formData.productType} 
                    onValueChange={(v: any) => setFormData({ ...formData, productType: v })}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Show CNC/MTF only for equity segments */}
                      {(formData.exchangeSegment === 'NSE_EQ' || formData.exchangeSegment === 'BSE_EQ') && (
                        <>
                          <SelectItem value="CNC">CNC - Cash & Carry (Delivery)</SelectItem>
                          <SelectItem value="MTF">MTF - Margin Traded Fund</SelectItem>
                        </>
                      )}
                      
                      {/* Common product types */}
                      <SelectItem value="INTRADAY">INTRADAY ⭐ (Recommended for F&O)</SelectItem>
                      
                      {/* F&O specific product types */}
                      {(formData.exchangeSegment === 'NSE_FNO' || formData.exchangeSegment === 'BSE_FNO' || 
                        formData.exchangeSegment === 'NSE_COMM' || formData.exchangeSegment === 'MCX_COMM') && (
                        <>
                          <SelectItem value="MARGIN">MARGIN - Carry Forward</SelectItem>
                          <SelectItem value="CO">CO - Cover Order (with SL)</SelectItem>
                          <SelectItem value="BO">BO - Bracket Order (SL + Target)</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  
                  {/* Validation warnings */}
                  {(formData.exchangeSegment === 'NSE_FNO' || formData.exchangeSegment === 'BSE_FNO') && 
                   formData.productType === 'CNC' && (
                    <p className="text-xs text-red-400">
                      ⚠️ ERROR: CNC not allowed for F&O! Use INTRADAY, MARGIN, CO, or BO
                    </p>
                  )}
                  
                  {(formData.exchangeSegment === 'NSE_FNO' || formData.exchangeSegment === 'BSE_FNO') && 
                   formData.productType === 'INTRADAY' && (
                    <p className="text-xs text-emerald-400">
                      ✅ Perfect for options day trading!
                    </p>
                  )}
                  
                  {(formData.exchangeSegment === 'NSE_EQ' || formData.exchangeSegment === 'BSE_EQ') && 
                   ['MARGIN', 'CO', 'BO'].includes(formData.productType || '') && (
                    <p className="text-xs text-amber-400">
                      ⚠️ Warning: {formData.productType} is typically for F&O. For equity delivery, use CNC.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Order Type</Label>
                  <Select value={formData.orderType} onValueChange={(v: any) => setFormData({ ...formData, orderType: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LIMIT">LIMIT</SelectItem>
                      <SelectItem value="MARKET">MARKET</SelectItem>
                      <SelectItem value="STOP_LOSS">STOP LOSS</SelectItem>
                      <SelectItem value="STOP_LOSS_MARKET">STOP LOSS MARKET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Validity</Label>
                  <Select value={formData.validity} onValueChange={(v: 'DAY' | 'IOC') => setFormData({ ...formData, validity: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DAY">DAY - Valid till end of day</SelectItem>
                      <SelectItem value="IOC">IOC - Immediate or Cancel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Quantity / Lot Size</Label>
                  <Input
                    type="number"
                    value={formData.quantity || ''}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      // 🔥 FIX: Only update if valid number > 0, don't reset to 0
                      if (!isNaN(val) && val > 0) {
                        setFormData({ ...formData, quantity: val });
                      }
                    }}
                    className="bg-zinc-800 border-zinc-700"
                    min="1"
                    placeholder="Auto-filled from instrument lot size"
                  />
                  <p className="text-xs text-zinc-400">
                    {formData.quantity 
                      ? `Using ${formData.quantity} lots` 
                      : 'Select instrument to auto-fill lot size'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Disclosed Quantity</Label>
                  <Input
                    type="number"
                    value={formData.disclosedQuantity}
                    onChange={(e) => setFormData({ ...formData, disclosedQuantity: parseInt(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Price</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Trigger Price</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={formData.triggerPrice}
                    onChange={(e) => setFormData({ ...formData, triggerPrice: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">AMO Time</Label>
                  <Select value={formData.amoTime} onValueChange={(v: any) => setFormData({ ...formData, amoTime: v })}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPEN">OPEN</SelectItem>
                      <SelectItem value="OPEN_30">OPEN + 30min</SelectItem>
                      <SelectItem value="OPEN_60">OPEN + 60min</SelectItem>
                      <SelectItem value="PRE_OPEN">PRE-OPEN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">BO Profit Value</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={formData.boProfitValue}
                    onChange={(e) => setFormData({ ...formData, boProfitValue: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">BO Stop Loss Value</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={formData.boStopLossValue}
                    onChange={(e) => setFormData({ ...formData, boStopLossValue: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.afterMarketOrder}
                  onChange={(e) => setFormData({ ...formData, afterMarketOrder: e.target.checked })}
                  className="w-4 h-4"
                />
                <Label className="text-zinc-300">After Market Order (AMO)</Label>
              </div>
            </div>

            {/* Risk Management */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-zinc-300 border-b border-zinc-700 pb-2">Risk Management (Auto Exit)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Target Amount (₹)</Label>
                  <Input
                    type="number"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-emerald-400">Auto-exit when P&L reaches this amount</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Stop Loss Amount (₹)</Label>
                  <Input
                    type="number"
                    value={formData.stopLossAmount}
                    onChange={(e) => setFormData({ ...formData, stopLossAmount: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                  <p className="text-xs text-red-400">Auto-exit when loss reaches this amount</p>
                </div>
              </div>
            </div>

            {/* ⚡ NEW: Trailing Stop Loss Feature */}
            <div className="space-y-4 bg-gradient-to-br from-blue-900/10 to-purple-900/10 border border-blue-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between border-b border-blue-700/30 pb-2">
                <h4 className="text-sm font-medium text-blue-300 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Trailing Stop Loss (Advanced)
                </h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.trailingEnabled || false}
                    onChange={(e) => setFormData({ ...formData, trailingEnabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 bg-zinc-800 border-zinc-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-xs text-zinc-300">Enable Trailing</span>
                </label>
              </div>

              {formData.trailingEnabled && (
                <div className="space-y-4">
                  <div className="bg-zinc-900/50 p-3 rounded border border-zinc-700 text-xs text-zinc-400">
                    <p className="mb-1">ℹ️ <strong className="text-blue-400">How Trailing Works:</strong></p>
                    <ul className="space-y-1 ml-4">
                      <li>• When profit reaches <strong className="text-emerald-400">Activation Amount</strong>, trailing starts</li>
                      <li>• Target increases by <strong className="text-blue-400">Target Jump</strong> as profit grows</li>
                      <li>• Stop Loss decreases by <strong className="text-purple-400">Stop Loss Jump</strong> to lock profits</li>
                      <li>• Eventually, Stop Loss becomes positive (profit locked!) 🔒</li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-zinc-300 flex items-center gap-1">
                        Activation Amount (₹)
                        <span className="text-xs text-emerald-400">⚡</span>
                      </Label>
                      <Input
                        type="number"
                        value={formData.trailingActivationAmount}
                        onChange={(e) => setFormData({ ...formData, trailingActivationAmount: parseFloat(e.target.value) || 0 })}
                        className="bg-zinc-800 border-zinc-700"
                      />
                      <p className="text-xs text-emerald-400">Start trailing when profit hits this</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-zinc-300 flex items-center gap-1">
                        Target Jump (₹)
                        <span className="text-xs text-blue-400">↗</span>
                      </Label>
                      <Input
                        type="number"
                        value={formData.targetJumpAmount}
                        onChange={(e) => setFormData({ ...formData, targetJumpAmount: parseFloat(e.target.value) || 0 })}
                        className="bg-zinc-800 border-zinc-700"
                      />
                      <p className="text-xs text-blue-400">Increase target by this amount</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-zinc-300 flex items-center gap-1">
                        Stop Loss Jump (₹)
                        <span className="text-xs text-purple-400">↘</span>
                      </Label>
                      <Input
                        type="number"
                        value={formData.stopLossJumpAmount}
                        onChange={(e) => setFormData({ ...formData, stopLossJumpAmount: parseFloat(e.target.value) || 0 })}
                        className="bg-zinc-800 border-zinc-700"
                      />
                      <p className="text-xs text-purple-400">Decrease stop loss by this amount</p>
                    </div>
                  </div>

                  {/* Example Calculation */}
                  {formData.trailingActivationAmount && formData.targetJumpAmount && formData.stopLossJumpAmount && (
                    <div className="bg-blue-950/20 border border-blue-500/30 rounded p-3">
                      <p className="text-xs font-semibold text-blue-300 mb-2">📊 Example Trailing Flow:</p>
                      <div className="text-xs text-zinc-300 space-y-1">
                        <div className="flex justify-between">
                          <span>Initial:</span>
                          <span>Target = ₹{formData.targetAmount || 0} | SL = ₹{formData.stopLossAmount || 0}</span>
                        </div>
                        <div className="flex justify-between text-emerald-400">
                          <span>At ₹{formData.trailingActivationAmount} profit:</span>
                          <span>Target = ₹{(formData.targetAmount || 0) + (formData.targetJumpAmount || 0)} | SL = ₹{(formData.stopLossAmount || 0) - (formData.stopLossJumpAmount || 0)}</span>
                        </div>
                        <div className="flex justify-between text-blue-400">
                          <span>At ₹{(formData.trailingActivationAmount || 0) + (formData.targetJumpAmount || 0)} profit:</span>
                          <span>Target = ₹{(formData.targetAmount || 0) + 2 * (formData.targetJumpAmount || 0)} | SL = ₹{(formData.stopLossAmount || 0) - 2 * (formData.stopLossJumpAmount || 0)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {editingSymbolId ? (
                <>
                  <Button
                    onClick={updateSymbol}
                    disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Update Symbol
                  </Button>
                  <Button
                    onClick={cancelEdit}
                    variant="outline"
                    className="bg-zinc-700 border-zinc-600"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={addSymbol}
                    disabled={loading}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Symbol
                  </Button>
                  <Button
                    onClick={() => setShowForm(false)}
                    variant="outline"
                    className="bg-zinc-700 border-zinc-600"
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Symbols List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-zinc-200">Configured Symbols ({symbols.length})</h3>
            {/* ✅ AUTO-CORRECTION ENABLED - No manual fix needed! */}
          </div>
          
          {symbols.length === 0 ? (
            <div className="text-center text-zinc-500 py-12 border border-dashed border-zinc-700 rounded-lg">
              <p>No symbols configured yet</p>
              <p className="text-sm mt-2">Click "Add Symbol" to configure your first trading symbol</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* ⚠️ WARNING BANNER: Low Target/SL Values */}
              {symbols.some(s => s.targetAmount < 1000 || s.stopLossAmount < 1000) && (
                <div className="p-4 bg-amber-950/30 border-2 border-amber-500/50 rounded-lg animate-pulse">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-amber-300 font-bold text-sm mb-1">⚠️ LOW RISK VALUES DETECTED</h4>
                      <p className="text-amber-200 text-sm mb-2">
                        Some symbols have Target or Stop Loss below ₹1000. These may have been created with old default values.
                      </p>
                      <div className="bg-amber-900/30 rounded p-2 text-xs text-amber-100 space-y-1">
                        <div className="font-semibold">🔧 How to Fix:</div>
                        <ol className="list-decimal list-inside space-y-0.5 ml-2">
                          <li>Look for symbols with <span className="text-amber-300 font-bold">"⚠️ Low"</span> badges below</li>
                          <li>Click the <span className="text-blue-400 font-bold">Edit</span> button on those symbols</li>
                          <li>Update <span className="text-emerald-400 font-bold">Target to ₹3000</span> and <span className="text-red-400 font-bold">Stop Loss to ₹2000</span></li>
                          <li>Click <span className="text-green-400 font-bold">Update Symbol</span> to save</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {symbols.map((symbol) => {
                // ⚡ Debug: Log trailing status for each symbol
                if (symbol.trailingEnabled) {
                  console.log(`⚡ Symbol ${symbol.displayName || symbol.name} has trailing enabled:`, {
                    trailingActivation: symbol.trailingActivationAmount,
                    targetJump: symbol.targetJumpAmount,
                    stopLossJump: symbol.stopLossJumpAmount
                  });
                }
                
                return (
                  <div
                    key={symbol.id}
                    className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
                  >
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-zinc-100">{symbol.displayName || symbol.name}</h4>
                        <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500">
                          {symbol.index === 'NIFTY' ? '📈 NIFTY' : symbol.index === 'SENSEX' ? '📊 SENSEX' : '🏦 BANKNIFTY'}
                        </Badge>
                        <Badge variant={symbol.optionType === 'CE' ? 'default' : 'secondary'}>
                          {symbol.optionType}
                        </Badge>
                        <Badge variant={symbol.active ? 'default' : 'secondary'} className="bg-emerald-600">
                          {symbol.active ? 'Active' : 'Inactive'}
                        </Badge>
                        {symbol.waitingForSignal && (
                          <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500">
                            Waiting for Signal
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400">Security ID: {symbol.securityId} | Index: {symbol.index}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => editSymbol(symbol.id)}
                        className="bg-blue-600 hover:bg-blue-700 border-blue-500 text-white"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(symbol.id)}
                        className="bg-zinc-700 border-zinc-600"
                      >
                        {symbol.active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteSymbol(symbol.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testOrder(symbol.id)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={loading && testingOrderId === symbol.id}
                      >
                        {loading && testingOrderId === symbol.id ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Test Order
                          </>
                        )}
                      </Button>
                      {/* ⚡ MANUAL ORDER BUTTON - Places REAL order to broker */}
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => placeManualOrder(symbol.id)}
                        className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold shadow-lg"
                        disabled={loading && placingOrderId === symbol.id}
                      >
                        {loading && placingOrderId === symbol.id ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Placing...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            🚀 PLACE ORDER
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Transaction</span>
                      <div className="text-zinc-100 font-medium">{symbol.transactionType}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Exchange</span>
                      <div className="font-medium text-zinc-100">
                        {symbol.exchangeSegment || 'NSE_FNO'}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Product</span>
                      <div className="font-medium text-zinc-100">
                        {symbol.productType}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Order Type</span>
                      <div className="text-zinc-100 font-medium">{symbol.orderType}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Quantity</span>
                      <div className="text-zinc-100 font-medium">{symbol.quantity}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Target</span>
                      <div className={`font-medium flex items-center gap-1 ${symbol.targetAmount < 1000 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        ₹{symbol.targetAmount}
                        {symbol.targetAmount < 1000 && (
                          <span className="text-xs bg-amber-900/30 text-amber-300 px-1 rounded border border-amber-500/30" title="Consider increasing to ₹3000">⚠️ Low</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Stop Loss</span>
                      <div className={`font-medium flex items-center gap-1 ${symbol.stopLossAmount < 1000 ? 'text-amber-400' : 'text-red-400'}`}>
                        ₹{symbol.stopLossAmount}
                        {symbol.stopLossAmount < 1000 && (
                          <span className="text-xs bg-amber-900/30 text-amber-300 px-1 rounded border border-amber-500/30" title="Consider increasing to ₹2000">⚠️ Low</span>
                        )}
                      </div>
                    </div>
                    {/* ⚡ Trailing Status */}
                    {symbol.trailingEnabled && (
                      <div className="space-y-1">
                        <span className="text-zinc-500 text-xs">Trailing</span>
                        <div className="flex items-center gap-1">
                          <Zap className="w-3 h-3 text-blue-400" />
                          <span className="text-blue-400 font-medium text-xs">Enabled</span>
                        </div>
                        <div className="text-xs text-zinc-500">
                          Activate: ₹{symbol.trailingActivationAmount}
                        </div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <span className="text-zinc-500 text-xs">Validity</span>
                      <div className="text-zinc-100 font-medium">{symbol.validity}</div>
                    </div>
                  </div>

                  {/* ⚡ TRAILING STOP LOSS INFORMATION PANEL (Animated) */}
                  {symbol.trailingEnabled && (
                    <div className="mt-3 p-3 bg-gradient-to-r from-blue-900/30 via-purple-900/30 to-blue-900/30 border-2 border-blue-500/40 rounded-lg relative overflow-hidden">
                      {/* Animated gradient background */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent animate-shimmer"></div>
                      
                      <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="w-4 h-4 text-blue-400 animate-pulse" />
                          <span className="text-blue-300 font-semibold text-sm">⚡ Trailing Stop Loss Active</span>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-emerald-900/30 border border-emerald-500/30 rounded p-2">
                            <div className="text-emerald-400 font-semibold mb-1">Activation</div>
                            <div className="text-white font-bold">₹{symbol.trailingActivationAmount || 0}</div>
                            <div className="text-emerald-300 text-[10px] mt-0.5">When profit hits</div>
                          </div>
                          
                          <div className="bg-blue-900/30 border border-blue-500/30 rounded p-2">
                            <div className="text-blue-400 font-semibold mb-1">Target Jump</div>
                            <div className="text-white font-bold">+₹{symbol.targetJumpAmount || 0}</div>
                            <div className="text-blue-300 text-[10px] mt-0.5">Increase by</div>
                          </div>
                          
                          <div className="bg-purple-900/30 border border-purple-500/30 rounded p-2">
                            <div className="text-purple-400 font-semibold mb-1">SL Jump</div>
                            <div className="text-white font-bold">-₹{symbol.stopLossJumpAmount || 0}</div>
                            <div className="text-purple-300 text-[10px] mt-0.5">Decrease by</div>
                          </div>
                        </div>
                        
                        <div className="mt-2 flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-900/50 rounded px-2 py-1">
                          <span>ℹ️</span>
                          <span>Target & SL will update automatically as profit grows to lock in gains</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {symbol.currentPosition && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-blue-300">Position Active</span>
                        <span className={`font-medium ${symbol.currentPosition.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          P&L: ₹{symbol.currentPosition.pnl.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-blue-400 mt-1">
                        Entry: ₹{symbol.currentPosition.entryPrice} | Order: {symbol.currentPosition.orderId}
                      </div>
                    </div>
                  )}
                  
                  {/* Order / Test Result */}
                  {orderResults[symbol.id] && (
                    <div className={`mt-3 rounded overflow-hidden border ${
                      orderResults[symbol.id].success 
                        ? 'border-emerald-500/40' 
                        : 'border-red-500/40'
                    }`}>
                      {/* Header bar */}
                      <div className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold ${
                        orderResults[symbol.id].success 
                          ? 'bg-emerald-500/20 text-emerald-300' 
                          : 'bg-red-500/20 text-red-300'
                      }`}>
                        <span>{orderResults[symbol.id].success ? '✅' : '❌'}</span>
                        <span>
                          {orderResults[symbol.id].type === 'real'
                            ? (orderResults[symbol.id].success ? 'Order Placed — Broker Response' : 'Order Failed — Broker Response')
                            : (orderResults[symbol.id].success ? 'Test Passed' : 'Test Failed')}
                        </span>
                        <span className="ml-auto text-zinc-400 font-normal">
                          {new Date(orderResults[symbol.id].timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      {/* Raw broker output */}
                      <div className="bg-zinc-900 px-3 py-2 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                        <span className={orderResults[symbol.id].success ? 'text-emerald-300' : 'text-red-300'}>
                          {orderResults[symbol.id].message}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function getDefaultFormData(): Partial<DhanOrderSymbol> {
  return {
    name: '',
    index: 'NIFTY',
    optionType: 'CE',
    transactionType: 'BUY',
    exchangeSegment: 'NSE_FNO',
    productType: 'INTRADAY', // ✅ Changed from CNC to INTRADAY for F&O
    orderType: 'MARKET',
    validity: 'DAY',
    securityId: '',
    quantity: 15,
    disclosedQuantity: 0,
    price: 0,
    triggerPrice: 0,
    afterMarketOrder: false,
    // ✅ Don't set amoTime by default since AMO is false
    boProfitValue: 0,
    boStopLossValue: 0,
    targetAmount: 3000, // ⚡ Default target (recommended: ₹3000)
    stopLossAmount: 2000, // ⚡ Default stop loss (recommended: ₹2000)
    
    // ⚡ Trailing defaults
    trailingEnabled: false,
    trailingActivationAmount: 300, // Default: Activate at ₹300 profit
    targetJumpAmount: 200, // Default: Jump by ₹200
    stopLossJumpAmount: 200, // Default: Jump by ₹200
    currentTarget: undefined, // Will be set when position opens
    currentStopLoss: undefined, // Will be set when position opens
    trailingActivated: false,
    
    active: false,
    waitingForSignal: false
  };
}