// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { CheckCircle, XCircle, TrendingUp, TrendingDown, Target, Shield, Zap } from "lucide-react";

interface TradeConfirmationDialogProps {
  symbol: {
    name: string;
    optionType: 'CE' | 'PE';
    quantity: number;
    price: number;
    targetAmount: number;
    stopLossAmount: number;
  };
  signal: {
    action: string;
    bias: string;
    confidence: number;
    institutional_bias: string;
    reasoning: string;
    resistance_levels?: {
      r1: number;
      r2: number;
      r3: number;
    };
    support_levels?: {
      s1: number;
      s2: number;
      s3: number;
    };
    volume_analysis?: {
      ratio: number;
      is_spike: boolean;
      is_high: boolean;
    };
    smart_money_detected?: boolean;
    momentum?: string;
  };
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function TradeConfirmationDialog({ 
  symbol, 
  signal, 
  onConfirm, 
  onCancel, 
  isOpen 
}: TradeConfirmationDialogProps) {
  if (!isOpen) return null;

  const potentialProfit = symbol.targetAmount;
  const potentialLoss = symbol.stopLossAmount;
  const riskRewardRatio = (potentialProfit / potentialLoss).toFixed(2);
  const formatRatio = (value: number) => {
    if (!Number.isFinite(value)) return '--';
    if (value === 0) return '0.00';
    if (Math.abs(value) < 0.01) return value.toFixed(4);
    return value.toFixed(2);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <Card className="bg-zinc-900 border-zinc-700 max-w-2xl w-full mx-4 shadow-2xl">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="size-5 text-amber-500" />
              Trade Confirmation Required
            </span>
            <Badge 
              variant={signal.confidence >= 80 ? 'default' : 'secondary'}
              className={signal.confidence >= 80 ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}
            >
              {signal.confidence}% Confidence
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* TRADE DETAILS */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <h3 className="text-lg font-semibold text-amber-500 mb-2">{symbol.name}</h3>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Action</div>
              <div className="text-lg font-semibold flex items-center gap-2">
                {signal.action === 'BUY_CALL' ? (
                  <>
                    <TrendingUp className="size-5 text-green-500" />
                    BUY CALL
                  </>
                ) : (
                  <>
                    <TrendingDown className="size-5 text-red-500" />
                    BUY PUT
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Quantity</div>
              <div className="text-lg font-semibold">{symbol.quantity} lots</div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Entry Price</div>
              <div className="text-lg font-semibold">₹{symbol.price.toFixed(2)}</div>
            </div>

            <div>
              <div className="text-sm text-zinc-400">Market Bias</div>
              <Badge variant={signal.bias === 'Bullish' ? 'default' : 'destructive'}>
                {signal.bias}
              </Badge>
            </div>
          </div>

          {/* AI ANALYSIS */}
          <div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700 space-y-3">
            <h4 className="font-semibold text-blue-400">📊 AI Analysis</h4>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-zinc-400">Institutional Bias:</span>
                <span className={`ml-2 font-semibold ${
                  signal.institutional_bias === 'BUYING' ? 'text-green-500' : 
                  signal.institutional_bias === 'SELLING' ? 'text-red-500' : 
                  'text-zinc-400'
                }`}>
                  {signal.institutional_bias}
                </span>
              </div>

              <div>
                <span className="text-zinc-400">Momentum:</span>
                <span className="ml-2 font-semibold text-blue-400">{signal.momentum || 'N/A'}</span>
              </div>

              {signal.volume_analysis && (
                <>
                  <div>
                    <span className="text-zinc-400">Volume:</span>
                    <span className={`ml-2 font-semibold ${
                      signal.volume_analysis.is_spike ? 'text-amber-500' : 
                      signal.volume_analysis.is_high ? 'text-yellow-500' : 
                      'text-zinc-400'
                    }`}>
                      {formatRatio(signal.volume_analysis.ratio)}x avg
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-400">Smart Money:</span>
                    <span className={`ml-2 font-semibold ${signal.smart_money_detected ? 'text-green-500' : 'text-zinc-400'}`}>
                      {signal.smart_money_detected ? '✅ Detected' : '❌ Not Detected'}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-700">
              <div className="text-xs text-zinc-400 italic">
                {signal.reasoning}
              </div>
            </div>
          </div>

          {/* SUPPORT & RESISTANCE */}
          {signal.support_levels && signal.resistance_levels && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-green-950/20 border border-green-900/30 rounded">
                <div className="text-sm font-semibold text-green-500 mb-2">🟢 Support Levels</div>
                <div className="space-y-1 text-xs">
                  <div>S1: <span className="text-green-400">{signal.support_levels.s1.toFixed(2)}</span></div>
                  <div>S2: <span className="text-green-400">{signal.support_levels.s2.toFixed(2)}</span></div>
                  <div>S3: <span className="text-green-400">{signal.support_levels.s3.toFixed(2)}</span></div>
                </div>
              </div>

              <div className="p-3 bg-red-950/20 border border-red-900/30 rounded">
                <div className="text-sm font-semibold text-red-500 mb-2">🔴 Resistance Levels</div>
                <div className="space-y-1 text-xs">
                  <div>R1: <span className="text-red-400">{signal.resistance_levels.r1.toFixed(2)}</span></div>
                  <div>R2: <span className="text-red-400">{signal.resistance_levels.r2.toFixed(2)}</span></div>
                  <div>R3: <span className="text-red-400">{signal.resistance_levels.r3.toFixed(2)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* RISK/REWARD */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700">
            <div>
              <div className="text-sm text-zinc-400 mb-1 flex items-center gap-1">
                <Target className="size-3" />
                Target
              </div>
              <div className="text-lg font-semibold text-green-500">
                ₹{potentialProfit.toFixed(2)}
              </div>
            </div>

            <div>
              <div className="text-sm text-zinc-400 mb-1 flex items-center gap-1">
                <Shield className="size-3" />
                Stop Loss
              </div>
              <div className="text-lg font-semibold text-red-500">
                ₹{potentialLoss.toFixed(2)}
              </div>
            </div>

            <div>
              <div className="text-sm text-zinc-400 mb-1">R:R Ratio</div>
              <div className="text-lg font-semibold text-blue-400">
                1:{riskRewardRatio}
              </div>
            </div>
          </div>

          {/* WARNING IF LOW CONFIDENCE */}
          {signal.confidence < 75 && (
            <div className="p-3 bg-amber-950/20 border border-amber-900/30 rounded flex items-start gap-2">
              <XCircle className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-400">
                <strong>Warning:</strong> Confidence is below 75%. Consider waiting for a stronger signal.
              </div>
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={onConfirm}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="size-4 mr-2" />
              Confirm & Execute Trade
            </Button>
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1 border-zinc-700 hover:bg-zinc-800"
            >
              <XCircle className="size-4 mr-2" />
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
