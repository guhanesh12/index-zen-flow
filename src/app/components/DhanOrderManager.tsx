import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertCircle,
  RefreshCw,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface DhanOrderPayload {
  dhanClientId: string;
  correlationId: string;
  transactionType: 'BUY' | 'SELL';
  exchangeSegment: 'NSE_EQ' | 'NSE_FNO' | 'BSE_EQ' | 'BSE_FNO' | 'MCX_COMM' | 'NSE_CURRENCY' | 'BSE_CURRENCY';
  productType: 'CNC' | 'INTRADAY' | 'MARGIN' | 'MTF' | 'CO' | 'BO';
  orderType: 'LIMIT' | 'MARKET' | 'STOP_LOSS' | 'STOP_LOSS_MARKET';
  validity: 'DAY' | 'IOC';
  securityId: string;
  quantity: number;
  disclosedQuantity: number;
  price: number;
  triggerPrice: number;
  afterMarketOrder: boolean;
  amoTime: 'OPEN' | 'OPEN_30' | 'OPEN_60';
  boProfitValue: number;
  boStopLossValue: number;
}

interface OrderDetails {
  orderId?: string;
  orderStatus: 'PENDING' | 'PLACED' | 'EXECUTED' | 'REJECTED' | 'CANCELLED';
  payload: DhanOrderPayload;
  timestamp: string;
  response?: any;
  error?: string;
  symbol?: {
    name: string;
    displayName: string;
    strikePrice?: number;
    optionType?: 'CE' | 'PE';
  };
}

interface DhanOrderManagerProps {
  dhanClientId: string;
  dhanAccessToken: string;
  symbols: any[];
  onOrderPlaced?: (order: OrderDetails) => void;
}

export function DhanOrderManager({ 
  dhanClientId, 
  dhanAccessToken, 
  symbols,
  onOrderPlaced 
}: DhanOrderManagerProps) {
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load orders from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('dhan_orders');
    if (stored) {
      setOrders(JSON.parse(stored));
    }
  }, []);

  // Save orders to localStorage
  const saveOrders = (updatedOrders: OrderDetails[]) => {
    setOrders(updatedOrders);
    localStorage.setItem('dhan_orders', JSON.stringify(updatedOrders));
  };

  // Place order via Dhan API
  const placeOrder = async (symbol: any, signal: 'BUY' | 'SELL') => {
    setIsProcessing(true);

    try {
      // Create order payload
      const orderPayload: DhanOrderPayload = {
        dhanClientId: dhanClientId,
        correlationId: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        transactionType: signal,
        exchangeSegment: symbol.exchangeSegment || 'NSE_FNO',
        productType: symbol.productType || 'INTRADAY',
        orderType: symbol.orderType || 'MARKET',
        validity: symbol.validity || 'DAY',
        securityId: symbol.securityId,
        quantity: symbol.quantity || 0,
        disclosedQuantity: symbol.disclosedQuantity || 0,
        price: symbol.price || 0,
        triggerPrice: symbol.triggerPrice || 0,
        afterMarketOrder: symbol.afterMarketOrder || false,
        amoTime: symbol.amoTime || 'OPEN',
        boProfitValue: symbol.boProfitValue || 0,
        boStopLossValue: symbol.boStopLossValue || 0,
      };

      console.log('📤 Placing Dhan Order:', {
        symbol: symbol.displayName || symbol.name,
        signal: signal,
        securityId: symbol.securityId,
        quantity: symbol.quantity,
        orderType: orderPayload.orderType,
        productType: orderPayload.productType,
      });

      // Create order details
      const orderDetails: OrderDetails = {
        orderStatus: 'PENDING',
        payload: orderPayload,
        timestamp: new Date().toISOString(),
        symbol: {
          name: symbol.name,
          displayName: symbol.displayName || symbol.name,
          strikePrice: symbol.strikePrice,
          optionType: symbol.optionType,
        },
      };

      // Call Dhan API
      const response = await fetch('https://api.dhan.co/v2/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access-token': dhanAccessToken,
        },
        body: JSON.stringify(orderPayload),
      });

      const data = await response.json();

      if (response.ok && data.orderId) {
        // Order placed successfully
        orderDetails.orderStatus = 'PLACED';
        orderDetails.orderId = data.orderId;
        orderDetails.response = data;

        console.log('✅ Order Placed Successfully:', {
          orderId: data.orderId,
          symbol: symbol.displayName || symbol.name,
          status: data.orderStatus,
        });

        // Show success notification
        showNotification('success', `Order placed: ${symbol.displayName || symbol.name}`, data.orderId);
      } else {
        // Order failed
        orderDetails.orderStatus = 'REJECTED';
        orderDetails.error = data.message || 'Order placement failed';
        orderDetails.response = data;

        console.error('❌ Order Rejected:', {
          symbol: symbol.displayName || symbol.name,
          error: data.message || 'Unknown error',
          response: data,
        });

        // Show error notification
        showNotification('error', `Order failed: ${symbol.displayName || symbol.name}`, data.message);
      }

      // Save order
      const updatedOrders = [orderDetails, ...orders];
      saveOrders(updatedOrders);

      // Callback
      if (onOrderPlaced) {
        onOrderPlaced(orderDetails);
      }

      return orderDetails;
    } catch (error: any) {
      console.error('🔥 Order Placement Error:', error);

      const errorOrder: OrderDetails = {
        orderStatus: 'REJECTED',
        payload: {
          dhanClientId,
          correlationId: `error_${Date.now()}`,
          transactionType: signal,
          exchangeSegment: symbol.exchangeSegment || 'NSE_FNO',
          productType: symbol.productType || 'INTRADAY',
          orderType: symbol.orderType || 'MARKET',
          validity: symbol.validity || 'DAY',
          securityId: symbol.securityId,
          quantity: symbol.quantity || 0,
          disclosedQuantity: 0,
          price: 0,
          triggerPrice: 0,
          afterMarketOrder: false,
          amoTime: 'OPEN',
          boProfitValue: 0,
          boStopLossValue: 0,
        },
        timestamp: new Date().toISOString(),
        error: error.message || 'Network error',
        symbol: {
          name: symbol.name,
          displayName: symbol.displayName || symbol.name,
        },
      };

      const updatedOrders = [errorOrder, ...orders];
      saveOrders(updatedOrders);

      showNotification('error', `Error: ${symbol.displayName || symbol.name}`, error.message);

      return errorOrder;
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle signal detection and auto order placement
  const handleSignal = async (symbol: any, signal: 'BUY' | 'SELL') => {
    console.log('🎯 Signal Detected:', {
      symbol: symbol.displayName || symbol.name,
      signal: signal,
      timestamp: new Date().toISOString(),
    });

    // Check if symbol is active
    if (!symbol.active) {
      console.log('⚠️ Symbol not active, skipping order:', symbol.displayName || symbol.name);
      return;
    }

    // Check if order already placed recently (prevent duplicates)
    const recentOrders = orders.filter(
      order => 
        order.symbol?.name === symbol.name &&
        new Date().getTime() - new Date(order.timestamp).getTime() < 60000 // Last 1 minute
    );

    if (recentOrders.length > 0) {
      console.log('⚠️ Recent order exists, skipping duplicate');
      return;
    }

    // Place order
    await placeOrder(symbol, signal);
  };

  // Notification system
  const showNotification = (type: 'success' | 'error', title: string, message?: string) => {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
      type === 'success' 
        ? 'bg-green-500/90 border border-green-400' 
        : 'bg-red-500/90 border border-red-400'
    } backdrop-blur-sm`;
    notification.innerHTML = `
      <div class="flex items-center gap-2 text-white">
        <div class="text-lg">${type === 'success' ? '✅' : '❌'}</div>
        <div>
          <div class="font-bold">${title}</div>
          ${message ? `<div class="text-sm opacity-90">${message}</div>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(notification);

    // Remove after 5 seconds
    setTimeout(() => {
      notification.remove();
    }, 5000);
  };

  // Expose handleSignal to parent components
  useEffect(() => {
    // Store function in window for global access
    (window as any).placeOrderOnSignal = handleSignal;
  }, [symbols, orders]);

  const getStatusIcon = (status: OrderDetails['orderStatus']) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="size-5 text-yellow-400" />;
      case 'PLACED':
        return <CheckCircle className="size-5 text-green-400" />;
      case 'EXECUTED':
        return <CheckCircle className="size-5 text-blue-400" />;
      case 'REJECTED':
        return <XCircle className="size-5 text-red-400" />;
      case 'CANCELLED':
        return <XCircle className="size-5 text-orange-400" />;
    }
  };

  const getStatusColor = (status: OrderDetails['orderStatus']) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-500/10 border-yellow-500';
      case 'PLACED':
        return 'bg-green-500/10 border-green-500';
      case 'EXECUTED':
        return 'bg-blue-500/10 border-blue-500';
      case 'REJECTED':
        return 'bg-red-500/10 border-red-500';
      case 'CANCELLED':
        return 'bg-orange-500/10 border-orange-500';
    }
  };

  return (
    <Card className="border-blue-500/20 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Zap className="size-5 text-blue-400" />
            Order Management
          </span>
          {isProcessing && (
            <Badge className="bg-blue-500/20 text-blue-400">
              <RefreshCw className="size-3 mr-1 animate-spin" />
              Processing...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          <AnimatePresence>
            {orders.map((order, index) => (
              <motion.div
                key={order.payload.correlationId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className={`p-4 rounded-lg border ${getStatusColor(order.orderStatus)}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(order.orderStatus)}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {order.symbol?.displayName || order.symbol?.name}
                        </span>
                        <Badge variant={order.payload.transactionType === 'BUY' ? 'default' : 'secondary'}>
                          {order.payload.transactionType}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400">
                        {order.payload.orderType} | {order.payload.productType}
                      </p>
                    </div>
                  </div>
                  <Badge className={getStatusColor(order.orderStatus)}>
                    {order.orderStatus}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-400">Security ID:</span>
                    <p className="text-white font-mono text-xs">{order.payload.securityId}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Quantity:</span>
                    <p className="text-white">{order.payload.quantity}</p>
                  </div>
                  {order.orderId && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Order ID:</span>
                      <p className="text-green-400 font-mono text-xs">{order.orderId}</p>
                    </div>
                  )}
                  {order.error && (
                    <div className="col-span-2">
                      <span className="text-red-400">Error:</span>
                      <p className="text-red-300 text-xs">{order.error}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <span className="text-slate-400">Time:</span>
                    <p className="text-white text-xs">
                      {new Date(order.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>

                {order.response && (
                  <details className="mt-3">
                    <summary className="text-xs text-blue-400 cursor-pointer">
                      View Response
                    </summary>
                    <pre className="text-xs bg-slate-800 p-2 rounded mt-2 overflow-x-auto">
                      {JSON.stringify(order.response, null, 2)}
                    </pre>
                  </details>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {orders.length === 0 && (
            <div className="text-center py-12">
              <Zap className="size-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No orders placed yet</p>
              <p className="text-sm text-slate-500 mt-1">
                Orders will appear here when signals are detected
              </p>
            </div>
          )}
        </div>

        {/* Order Stats */}
        {orders.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-green-400">
                  {orders.filter(o => o.orderStatus === 'PLACED' || o.orderStatus === 'EXECUTED').length}
                </p>
                <p className="text-xs text-slate-400">Success</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">
                  {orders.filter(o => o.orderStatus === 'REJECTED').length}
                </p>
                <p className="text-xs text-slate-400">Rejected</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">
                  {orders.filter(o => o.orderStatus === 'PENDING').length}
                </p>
                <p className="text-xs text-slate-400">Pending</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {orders.length}
                </p>
                <p className="text-xs text-slate-400">Total</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
