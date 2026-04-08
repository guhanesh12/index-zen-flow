import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Shield, Copy, CheckCircle2, AlertTriangle, Wallet as WalletIcon } from "lucide-react";
import { Badge } from "./ui/badge";

interface StaticIPManagerProps {
  serverUrl: string;
  accessToken: string;
}

const SHARED_STATIC_IP = "187.127.140.245";
const MONTHLY_FEE = 59;

export function StaticIPManager({ serverUrl, accessToken }: StaticIPManagerProps) {
  const [copied, setCopied] = useState(false);

  // Copy IP to clipboard
  const copyToClipboard = async () => {
    try {
      // Try modern Clipboard API first (only works in secure contexts)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(SHARED_STATIC_IP);
          setCopied(true);
          setTimeout(() => setCopied(false), 3000);
          return;
        } catch (clipboardError) {
          console.warn('Clipboard API failed, using fallback method:', clipboardError);
          // Fall through to fallback method
        }
      }
      
      // Fallback method using execCommand
      const textArea = document.createElement('textarea');
      textArea.value = SHARED_STATIC_IP;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } else {
        // If both methods fail, show the IP in an alert so user can copy manually
        alert(`Copy this IP address:\n\n${SHARED_STATIC_IP}\n\nSelect and copy it from this dialog.`);
      }
    } catch (error) {
      console.error('Failed to copy IP:', error);
      // Last resort: show in alert dialog
      alert(`Copy this IP address:\n\n${SHARED_STATIC_IP}\n\nSelect and copy it from this dialog.`);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="size-4 text-blue-500" />
          Static IP Whitelisting
          <Badge variant="outline" className="ml-auto text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30">
            SEBI Mandatory
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Auto-Debit Information - Top Priority */}
        <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 rounded-lg p-3 space-y-2">
          <div className="flex items-start gap-2">
            <WalletIcon className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <p className="text-xs font-semibold text-yellow-300 flex items-center gap-1">
                ⚡ Auto-Debit System - ₹{MONTHLY_FEE}/Month
              </p>
              <div className="text-[10px] text-yellow-200/90 space-y-1">
                <p>• <strong>Monthly charge:</strong> ₹{MONTHLY_FEE} auto-debited from your wallet on active use</p>
                <p>• <strong>Activity-based:</strong> No debit if website not used for 10+ days continuously</p>
                <p>• <strong>Sufficient balance required:</strong> Broker connection will NOT start if wallet balance is insufficient</p>
                <p>• <strong>Auto-renewal:</strong> For regular users, ₹{MONTHLY_FEE} is debited automatically every month</p>
              </div>
            </div>
          </div>
        </div>

        {/* Insufficient Funds Warning */}
        <div className="bg-red-500/10 border border-red-500/40 rounded px-3 py-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-red-300">
              <strong>Important:</strong> If your wallet balance is below ₹{MONTHLY_FEE}, broker connections will be blocked. Please recharge your wallet to continue trading.
            </p>
          </div>
        </div>

        {/* Subscription Info - Positive Note */}
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-2">
          <p className="text-[10px] text-emerald-300">
            ✅ With ₹{MONTHLY_FEE}/month subscription, you get access to our shared VPS static IP ({SHARED_STATIC_IP}) for SEBI-compliant automated order placement
          </p>
        </div>

        {/* IP Address with Copy Button */}
        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
          <p className="text-[10px] text-zinc-500 mb-2">Shared Static IP Address:</p>
          <div className="flex items-center gap-3">
            <span className="text-lg font-mono font-bold text-emerald-400 tracking-wide flex-1">
              {SHARED_STATIC_IP}
            </span>
            <Button
              onClick={copyToClipboard}
              size="sm"
              className={`shrink-0 ${
                copied 
                  ? 'bg-emerald-600 hover:bg-emerald-700' 
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white text-xs px-3 py-2`}
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy IP
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Instructions - Small */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-blue-300 mb-2">📋 How to Whitelist in Dhan Portal:</p>
          <ol className="space-y-1 text-[10px] text-blue-200/80 list-decimal list-inside leading-relaxed">
            <li>Copy the IP address above by clicking "Copy IP" button</li>
            <li>Login to your Dhan broker account</li>
            <li>Go to Settings → API Management → IP Whitelisting</li>
            <li>Paste <span className="font-mono text-emerald-400">{SHARED_STATIC_IP}</span> and save</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}