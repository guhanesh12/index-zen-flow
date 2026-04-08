// @ts-nocheck
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Upload, Search, Plus, FileDown, AlertCircle, CheckCircle, X } from "lucide-react";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface DhanInstrument {
  // Dhan Master CSV columns
  SEM_SMST_SECURITY_ID: string;
  SEM_CUSTOM_SYMBOL: string;
  SEM_TRADING_SYMBOL: string;
  SEM_INSTRUMENT_NAME: string;
  SEM_EXCH_INSTRUMENT_TYPE: string;
  SEM_EXPIRY_DATE: string;
  SEM_STRIKE_PRICE: string;
  SEM_OPTION_TYPE: string;
  SEM_LOT_UNITS: string;
  SM_SYMBOL_NAME: string;
  // ... other fields
}

interface ParsedSymbol {
  securityId: string;
  name: string;
  tradingSymbol: string;
  instrumentName: string;
  instrumentType: string;
  expiry: string;
  strikePrice: number;
  optionType: 'CE' | 'PE' | '';
  lotSize: number;
  underlying: string;
  index: 'NIFTY' | 'BANKNIFTY' | '';
}

interface CSVSymbol {
  name: string;
  index: 'NIFTY' | 'BANKNIFTY';
  optionType: 'CE' | 'PE';
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: string;
  productType: string;
  orderType: string;
  validity: string;
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  targetAmount: number;
  stopLossAmount: number;
  strikePrice?: number;
  expiry?: string;
}

interface CSVSymbolUploaderProps {
  onSymbolAdd: (symbol: any) => void;
  serverUrl: string;
  accessToken: string;
}

export function CSVSymbolUploader({ onSymbolAdd, serverUrl, accessToken }: CSVSymbolUploaderProps) {
  const [uploadedSymbols, setUploadedSymbols] = useState<CSVSymbol[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState<CSVSymbol | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV file must have headers and at least one data row');
      }

      // Parse CSV headers
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // Required headers
      const requiredHeaders = ['name', 'securityid', 'quantity', 'targetamount', 'stoplossamount'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      if (missingHeaders.length > 0) {
        throw new Error(`Missing required columns: ${missingHeaders.join(', ')}`);
      }

      // Parse data rows
      const symbols: CSVSymbol[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length !== headers.length) continue;

        const rowData: any = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index];
        });

        // Map CSV data to symbol object with defaults
        const symbol: CSVSymbol = {
          name: rowData.name || '',
          index: (rowData.index?.toUpperCase() === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY') as 'NIFTY' | 'BANKNIFTY',
          optionType: (rowData.optiontype?.toUpperCase() === 'PE' ? 'PE' : 'CE') as 'CE' | 'PE',
          transactionType: (rowData.transactiontype?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
          exchangeSegment: rowData.exchangesegment || 'NSE_FNO',
          productType: rowData.producttype || 'INTRADAY',
          orderType: rowData.ordertype || 'MARKET',
          validity: rowData.validity || 'DAY',
          securityId: rowData.securityid || '',
          quantity: parseInt(rowData.quantity) || 0,
          disclosedQuantity: parseInt(rowData.disclosedquantity || '0'),
          price: parseFloat(rowData.price || '0'),
          triggerPrice: parseFloat(rowData.triggerprice || '0'),
          targetAmount: parseFloat(rowData.targetamount) || 0,
          stopLossAmount: parseFloat(rowData.stoplossamount) || 0,
          strikePrice: rowData.strikeprice ? parseInt(rowData.strikeprice) : undefined,
          expiry: rowData.expiry || undefined
        };

        // Validate required fields
        if (!symbol.name || !symbol.securityId || symbol.quantity === 0) {
          console.warn(`Skipping invalid row ${i + 1}: missing required fields`);
          continue;
        }

        symbols.push(symbol);
      }

      if (symbols.length === 0) {
        throw new Error('No valid symbols found in CSV file');
      }

      setUploadedSymbols(symbols);
      setSuccess(`✅ Successfully uploaded ${symbols.length} symbols from CSV`);
    } catch (err: any) {
      setError(err.message || 'Failed to parse CSV file');
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
    setSelectedSymbol(null);
  };

  const filteredSymbols = uploadedSymbols.filter(symbol =>
    symbol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    symbol.securityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (symbol.strikePrice && symbol.strikePrice.toString().includes(searchTerm))
  );

  const handleSelectSymbol = (symbol: CSVSymbol) => {
    setSelectedSymbol(symbol);
  };

  const handleAddSymbol = () => {
    if (!selectedSymbol) return;

    // Create symbol object in the format expected by SymbolManager
    const symbolToAdd = {
      id: `symbol_${Date.now()}`,
      name: selectedSymbol.name,
      index: selectedSymbol.index,
      optionType: selectedSymbol.optionType,
      transactionType: selectedSymbol.transactionType,
      exchangeSegment: selectedSymbol.exchangeSegment,
      productType: selectedSymbol.productType,
      orderType: selectedSymbol.orderType,
      validity: selectedSymbol.validity,
      securityId: selectedSymbol.securityId,
      quantity: selectedSymbol.quantity,
      disclosedQuantity: selectedSymbol.disclosedQuantity,
      price: selectedSymbol.price,
      triggerPrice: selectedSymbol.triggerPrice,
      afterMarketOrder: false,
      amoTime: 'OPEN' as const,
      boProfitValue: 0,
      boStopLossValue: 0,
      targetAmount: selectedSymbol.targetAmount,
      stopLossAmount: selectedSymbol.stopLossAmount,
      active: false,
      waitingForSignal: false
    };

    onSymbolAdd(symbolToAdd);
    setSuccess(`✅ Added ${selectedSymbol.name} to trading symbols`);
    
    // Remove from uploaded list
    setUploadedSymbols(prev => prev.filter(s => s !== selectedSymbol));
    setSelectedSymbol(null);
    setSearchTerm('');
  };

  const downloadTemplate = () => {
    const template = `name,index,optionType,transactionType,exchangeSegment,productType,orderType,validity,securityId,quantity,disclosedQuantity,price,triggerPrice,targetAmount,stopLossAmount,strikePrice,expiry
NIFTY24JAN2526000CE,NIFTY,CE,BUY,NSE_FNO,INTRADAY,MARKET,DAY,12345,50,0,0,0,500,300,26000,24JAN25
BANKNIFTY24JAN2556000PE,BANKNIFTY,PE,BUY,NSE_FNO,INTRADAY,MARKET,DAY,67890,25,0,0,0,400,250,56000,24JAN25`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'symbol_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-purple-500/20 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-5 text-purple-400" />
          CSV Symbol Upload & Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload Section */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex-1"
              variant="outline"
            >
              <Upload className="size-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload CSV File'}
            </Button>
            <Button
              onClick={downloadTemplate}
              variant="outline"
              size="icon"
              title="Download CSV Template"
            >
              <FileDown className="size-4" />
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          
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

        {/* Search Section */}
        {uploadedSymbols.length > 0 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search by name, security ID, or strike price..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>

            {/* Uploaded Symbols Count */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                {uploadedSymbols.length} symbols uploaded
              </span>
              {searchTerm && (
                <span className="text-purple-400">
                  {filteredSymbols.length} results
                </span>
              )}
            </div>

            {/* Search Results */}
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {filteredSymbols.map((symbol, index) => (
                <div
                  key={index}
                  onClick={() => handleSelectSymbol(symbol)}
                  className={`p-3 rounded border cursor-pointer transition-all ${
                    selectedSymbol === symbol
                      ? 'bg-purple-500/20 border-purple-500'
                      : 'bg-slate-800/50 border-slate-700 hover:border-purple-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-white">{symbol.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {symbol.index}
                        </Badge>
                        <Badge variant={symbol.optionType === 'CE' ? 'default' : 'secondary'} className="text-xs">
                          {symbol.optionType}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {symbol.transactionType}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
                        <div>Security ID: <span className="text-white">{symbol.securityId}</span></div>
                        <div>Quantity: <span className="text-white">{symbol.quantity}</span></div>
                        {symbol.strikePrice && (
                          <div>Strike: <span className="text-white">{symbol.strikePrice}</span></div>
                        )}
                        {symbol.expiry && (
                          <div>Expiry: <span className="text-white">{symbol.expiry}</span></div>
                        )}
                        <div>Target: <span className="text-green-400">₹{symbol.targetAmount}</span></div>
                        <div>Stop Loss: <span className="text-red-400">₹{symbol.stopLossAmount}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selected Symbol Details */}
        {selectedSymbol && (
          <Card className="bg-purple-500/10 border-purple-500/30">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Selected Symbol Details</span>
                <Button
                  onClick={handleAddSymbol}
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="size-4 mr-2" />
                  Add to Trading
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-slate-400">Name</Label>
                  <div className="text-white font-medium">{selectedSymbol.name}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Security ID</Label>
                  <div className="text-white font-medium">{selectedSymbol.securityId}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Index</Label>
                  <div className="text-white font-medium">{selectedSymbol.index}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Option Type</Label>
                  <div className="text-white font-medium">{selectedSymbol.optionType}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Transaction</Label>
                  <div className="text-white font-medium">{selectedSymbol.transactionType}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Quantity</Label>
                  <div className="text-white font-medium">{selectedSymbol.quantity}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Exchange</Label>
                  <div className="text-white font-medium">{selectedSymbol.exchangeSegment}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Product Type</Label>
                  <div className="text-white font-medium">{selectedSymbol.productType}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Order Type</Label>
                  <div className="text-white font-medium">{selectedSymbol.orderType}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Validity</Label>
                  <div className="text-white font-medium">{selectedSymbol.validity}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Target Amount</Label>
                  <div className="text-green-400 font-medium">₹{selectedSymbol.targetAmount}</div>
                </div>
                <div>
                  <Label className="text-slate-400">Stop Loss Amount</Label>
                  <div className="text-red-400 font-medium">₹{selectedSymbol.stopLossAmount}</div>
                </div>
                {selectedSymbol.strikePrice && (
                  <div>
                    <Label className="text-slate-400">Strike Price</Label>
                    <div className="text-white font-medium">{selectedSymbol.strikePrice}</div>
                  </div>
                )}
                {selectedSymbol.expiry && (
                  <div>
                    <Label className="text-slate-400">Expiry</Label>
                    <div className="text-white font-medium">{selectedSymbol.expiry}</div>
                  </div>
                )}
                {selectedSymbol.price > 0 && (
                  <div>
                    <Label className="text-slate-400">Price</Label>
                    <div className="text-white font-medium">₹{selectedSymbol.price}</div>
                  </div>
                )}
                {selectedSymbol.triggerPrice > 0 && (
                  <div>
                    <Label className="text-slate-400">Trigger Price</Label>
                    <div className="text-white font-medium">₹{selectedSymbol.triggerPrice}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help Text */}
        <div className="text-xs text-slate-400 space-y-1 p-3 bg-slate-800/50 rounded border border-slate-700">
          <p className="font-medium text-slate-300">📝 CSV Format Instructions:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Required columns: name, securityId, quantity, targetAmount, stopLossAmount</li>
            <li>Optional columns: index, optionType, transactionType, exchangeSegment, productType, orderType, validity, price, triggerPrice, strikePrice, expiry</li>
            <li>Download the template for proper formatting</li>
            <li>All prices should be in rupees (₹)</li>
            <li>After upload, search and select symbols to add them to trading</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}