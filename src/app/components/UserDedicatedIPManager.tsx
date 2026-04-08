// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import {
  Globe, CheckCircle, XCircle, AlertTriangle,
  Info, Shield, Loader2, Zap, Copy, CheckCircle2,
  Server, CreditCard, Wifi, Clock, RefreshCw, Calendar
} from 'lucide-react';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { getServerUrl } from '@/utils-ext/config/apiConfig';

// ─── Types ──────────────────────────────────────────

interface UserDedicatedIPManagerProps {
  serverUrl: string;
  accessToken: string;
  walletBalance?: number;
}

interface SubscriptionInfo {
  status: 'none' | 'active' | 'expiring' | 'expired';
  daysUntilExpiry: number;
  canConnect: boolean;
  isRenewal: boolean;
  expiryDate?: string;
  startDate?: string;
  renewalCount?: number;
}

interface VpsRecord {
  status: 'pending' | 'creating' | 'deploying' | 'ready' | 'active' | 'failed';
  ipAddress?: string;
  dropletId?: number;
  startedAt: string;
  completedAt?: string;
  estimatedMinutes: number;
  error?: string;
  subscription?: {
    startDate: string;
    expiryDate: string;
    renewalCount: number;
    lastPaymentId?: string;
  };
}

declare global {
  interface Window { Razorpay: any; }
}

// ─── Constants ─────────────────────────────────────

const VPS_COST = 599;

// ─── Helpers ───────────────────────────────────────

function loadRazorpayScript(): Promise<boolean> {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const READY_STATUSES = ['ready', 'active'] as const;

function isVpsReady(status: string): boolean {
  return READY_STATUSES.includes(status as any);
}

function normalizeProgressValue(value: unknown): number {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, numericValue));
}

function getProgressFromStatus(status: string, startedAt: string, estimatedMinutes: number): number {
  if (isVpsReady(status)) return 100;
  if (status === 'failed') return 0;

  const startedAtMs = new Date(startedAt || Date.now()).getTime();
  const safeStartedAtMs = Number.isFinite(startedAtMs) ? startedAtMs : Date.now();
  const safeEstimatedMinutes = Math.max(1, Number(estimatedMinutes) || 0);
  const elapsed = Math.max(0, Date.now() - safeStartedAtMs);
  const totalMs = safeEstimatedMinutes * 60 * 1000;
  const base = normalizeProgressValue(Math.min((elapsed / totalMs) * 90, 90));

  if (status === 'creating') return normalizeProgressValue(Math.min(base, 45));
  if (status === 'deploying') return normalizeProgressValue(Math.min(45 + base * 0.6, 92));

  return normalizeProgressValue(Math.min(base, 10));
}

function getStatusMessage(status: string): string {
  switch (status) {
    case 'pending': return 'Payment confirmed, initializing server...';
    case 'creating': return 'Please wait, server is being created on DigitalOcean...';
    case 'deploying': return 'Deployment in progress. Installing order execution server...';
    case 'ready':
    case 'active': return 'Ready to Trade';
    case 'failed': return 'Provisioning failed';
    default: return 'Processing...';
  }
}

function formatExpiry(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Main Component ────────────────────────────────

export function UserDedicatedIPManager({ serverUrl, accessToken, walletBalance }: UserDedicatedIPManagerProps) {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [vps, setVps] = useState<VpsRecord | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo>({
    status: 'none', daysUntilExpiry: 0, canConnect: false, isRenewal: false,
  });
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [linkingExisting, setLinkingExisting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vpsConnCheck, setVpsConnCheck] = useState<{
    loading: boolean;
    reachable?: boolean;
    ipAddress?: string;
    hint?: string;
    error?: string;
  }>({ loading: false });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevStatusRef = useRef<string | null>(null);

  const checkVpsServer = async () => {
    setVpsConnCheck({ loading: true });
    try {
      const res = await fetch(`${serverUrl}/check-vps-connectivity`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setVpsConnCheck({
        loading: false,
        reachable: data.reachable,
        ipAddress: data.ipAddress,
        hint: data.hint,
        error: data.error,
      });
    } catch (err: any) {
      setVpsConnCheck({ loading: false, reachable: false, error: err.message, hint: 'Could not reach the server to run connectivity check.' });
    }
  };

  // Decode email from JWT for Razorpay prefill
  const userEmail = (() => {
    try {
      const payload = JSON.parse(atob(accessToken.split('.')[1]));
      return payload.email || '';
    } catch { return ''; }
  })();

  const isProvisioning = vps !== null && !isVpsReady(vps.status) && vps.status !== 'failed';
  const safeProgress = normalizeProgressValue(progress);

  // ── Polling ───────────────────────────────────────

  const loadStatus = useCallback(async () => {
    setLoadError(null);
    try {
      // Fetch IP assignment and provisioning status from edge function
      const baseUrl = serverUrl;
      const [ipRes, provRes] = await Promise.all([
        fetch(`${baseUrl}/ip-pool/my-ip`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        }),
        fetch(`${baseUrl}/ip-pool/provisioning-status`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        }),
      ]);

      if (!ipRes.ok && ipRes.status === 401) {
        setLoadError('Authentication error — please log out and back in.');
        return;
      }

      const ipData = await ipRes.json().catch(() => ({}));
      const provData = await provRes.json().catch(() => ({}));

      // Build VPS record from edge function responses
      let newVps: VpsRecord | null = null;

      if (ipData.success && ipData.assignment) {
        // Has assigned IP
        newVps = {
          status: 'active',
          ipAddress: ipData.assignment.ipAddress,
          startedAt: ipData.assignment.assignedAt || new Date().toISOString(),
          completedAt: ipData.assignment.assignedAt,
          estimatedMinutes: 0,
          subscription: {
            startDate: ipData.assignment.assignedAt || '',
            expiryDate: ipData.assignment.expiresAt || '',
            renewalCount: 0,
          },
        };
        // Build subscription info
        if (ipData.assignment.expiresAt) {
          const daysLeft = Math.ceil((new Date(ipData.assignment.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          setSubscription({
            status: daysLeft > 7 ? 'active' : daysLeft > 0 ? 'expiring' : 'expired',
            daysUntilExpiry: Math.max(0, daysLeft),
            canConnect: daysLeft > 0,
            isRenewal: true,
            expiryDate: ipData.assignment.expiresAt,
            startDate: ipData.assignment.assignedAt,
          });
        }
      } else if (provData.success && provData.provisioning && provData.job) {
        // Active or recoverable provisioning job
        newVps = {
          status: provData.job.status || 'creating',
          ipAddress: provData.job.ipAddress,
          startedAt: provData.job.startedAt || new Date().toISOString(),
          completedAt: provData.job.completedAt,
          estimatedMinutes: provData.job.estimatedMinutes || 8,
          error: provData.job.error,
        };
      }

      setVps(newVps);
      if (newVps) {
        setProgress(getProgressFromStatus(newVps.status, newVps.startedAt, newVps.estimatedMinutes || 8));
        const wasProvisioning = prevStatusRef.current !== null && !isVpsReady(prevStatusRef.current) && prevStatusRef.current !== 'failed';
        const nowReady = isVpsReady(newVps.status);
        if (wasProvisioning && nowReady) {
          setJustCompleted(true);
          toast.success('Your dedicated VPS is ready! Copy your IP and whitelist it in Dhan.');
          stopPolling();
        } else if (newVps.status === 'failed') {
          toast.error(`VPS provisioning failed: ${newVps.error}`);
          stopPolling();
        }
        prevStatusRef.current = newVps.status;
      }
    } catch (err: any) {
      setLoadError('Could not reach server. Check your connection and retry.');
    } finally {
      setCheckingStatus(false);
    }
  }, [accessToken, serverUrl]);

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(loadStatus, 10000);
  }

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (isProvisioning) startPolling();
    else stopPolling();
    return stopPolling;
  }, [isProvisioning]);

  // Update progress bar every 3s while provisioning
  useEffect(() => {
    if (!isProvisioning || !vps) return;
    const t = setInterval(() => {
      setProgress(getProgressFromStatus(vps.status, vps.startedAt, vps.estimatedMinutes || 8));
    }, 3000);
    return () => clearInterval(t);
  }, [vps?.status, isProvisioning]);

  // ── Recover / Link Existing VPS ──────────────────

  async function handleLinkExisting() {
    setLinkingExisting(true);
    try {
      const res = await fetch(`${serverUrl}/ip-pool/my-ip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Recovery failed');

      toast.success(data.alreadyLinked
        ? 'VPS is already linked to your account.'
        : `VPS at ${data.ipAddress} has been successfully recovered!`
      );
      await loadStatus();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLinkingExisting(false);
    }
  }

  // ── Payment ───────────────────────────────────────

  async function handlePaymentComplete(paymentId: string, method: 'razorpay' | 'wallet', paymentResponse?: any) {
    try {
      let endpoint = '';
      let body: any = {};

      if (method === 'razorpay' && paymentResponse) {
        endpoint = '/ip-pool/verify-payment-and-provision';
        body = {
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        };
      } else {
        endpoint = '/ip-pool/subscribe';
        body = { amount: VPS_COST, autoProvision: true };
      }

      const res = await fetch(`${serverUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Payment processing failed');

      setShowPaymentOptions(false);

      if (data.isRenewal) {
        toast.success(data.message || 'Subscription renewed successfully!');
        await loadStatus();
      } else {
        toast.success('Payment successful! VPS provisioning has started.');
        setVps({ status: 'creating', startedAt: new Date().toISOString(), estimatedMinutes: 8 });
        startPolling();
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRazorpayClick() {
    setLoading(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Failed to load payment gateway');

      const orderRes = await fetch(`${serverUrl}/ip-pool/create-payment-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success) throw new Error(orderData.error || 'Failed to create payment order');

      const rzp = new window.Razorpay({
        key: orderData.keyId,
        order_id: orderData.orderId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'IndexpilotAI',
        description: orderData.isRenewal
          ? 'VPS Subscription Renewal (₹599/month)'
          : 'Dedicated VPS — Static IP for Broker (₹599/month)',
        image: '/logo-color.png',
        theme: { color: '#06b6d4' },
        prefill: {
          email: userEmail || undefined,
        },
        notes: {
          purpose: orderData.isRenewal ? 'VPS Renewal' : 'New VPS',
        },
        handler: async (response: any) => {
          await handlePaymentComplete(response.razorpay_payment_id, 'razorpay', response);
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            toast.info('Payment cancelled.');
          },
          escape: true,
          animation: true,
        },
      });
      rzp.open();
    } catch (err: any) {
      toast.error(err.message);
      setLoading(false);
    }
  }

  async function handleWalletClick() {
    if (!walletBalance || walletBalance < VPS_COST) {
      toast.error(`Insufficient wallet balance. You need ₹${VPS_COST} but have ₹${walletBalance || 0}`);
      return;
    }
    setLoading(true);
    await handlePaymentComplete(`wallet_${Date.now()}`, 'wallet');
  }

  async function cancelVps() {
    if (!confirm('Cancel your VPS subscription? Your static IP will be released and broker access will stop.')) return;
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/ip-pool/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to cancel');
      toast.success('VPS subscription cancelled.');
      setVps(null);
      setSubscription({ status: 'none', daysUntilExpiry: 0, canConnect: false, isRenewal: false });
      setShowPaymentOptions(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyIP(ip: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(ip);
      } else {
        const ta = document.createElement('textarea');
        ta.value = ip;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      toast.success('IP address copied!');
    } catch {
      alert(`Your IP: ${ip}`);
    }
  }

  // ── Render ────────────────────────────────────────

  if (checkingStatus) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mr-2" />
          <span className="text-zinc-400">Checking VPS status...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="w-4 h-4 text-cyan-500" />
          Dedicated Static IP — Auto-Provisioning
          <Badge
            variant="outline"
            className={`ml-auto text-[10px] ${
              subscription.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
              subscription.status === 'expiring' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
              subscription.status === 'expired' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
              'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
            }`}
          >
            {subscription.status === 'none' ? 'SEBI Mandatory' :
             subscription.status === 'active' ? 'Active' :
             subscription.status === 'expiring' ? `Expires in ${subscription.daysUntilExpiry}d` :
             'Expired'}
          </Badge>
          <button
            onClick={() => { setCheckingStatus(true); loadStatus(); }}
            title="Refresh status"
            className="ml-1 text-zinc-500 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </CardTitle>
        <p className="text-xs text-zinc-500 mt-1">Automatic VPS creation with your own dedicated static IP</p>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ══ LOAD ERROR ══ */}
        {loadError && !vps && (
          <Alert className="bg-red-900/20 border-red-500/40">
            <XCircle className="w-4 h-4 text-red-400" />
            <AlertDescription className="text-red-200 text-xs flex items-center justify-between gap-2">
              <span>{loadError}</span>
              <Button
                onClick={() => { setCheckingStatus(true); loadStatus(); }}
                size="sm"
                variant="outline"
                className="border-red-700 text-red-300 hover:bg-red-900/30 text-xs h-6 px-2 shrink-0"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* ══ PROVISIONING IN PROGRESS ══ */}
        {isProvisioning && vps && (
          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-2 border-cyan-500/50 rounded-lg p-5 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-cyan-400 flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                VPS Provisioning In Progress
              </h3>
              <p className="text-zinc-300 text-sm mt-1">
                Your dedicated VPS is being created automatically. This takes approximately {vps.estimatedMinutes} minutes.
              </p>
              <p className={`text-sm font-semibold mt-2 ${
                vps.status === 'deploying' ? 'text-purple-400' : 'text-cyan-400'
              }`}>
                {getStatusMessage(vps.status)}
              </p>
            </div>

            {/* Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Progress</span>
                <span>{Math.round(safeProgress)}%</span>
              </div>
              <Progress value={safeProgress} className="h-2 bg-zinc-800" />
            </div>

            {/* Steps */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* Step 1: Creating VPS */}
              <div className={`p-2 rounded border text-center ${
                vps.status === 'creating'
                  ? 'bg-cyan-500/20 border-cyan-500/50'
                  : ['deploying', 'ready'].includes(vps.status)
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-zinc-800/50 border-zinc-700'
              }`}>
                <Server className={`w-3 h-3 mx-auto mb-1 ${vps.status === 'creating' ? 'text-cyan-400' : ['deploying','ready'].includes(vps.status) ? 'text-green-400' : 'text-zinc-600'}`} />
                <p className={`font-semibold ${vps.status === 'creating' ? 'text-cyan-400' : ['deploying','ready'].includes(vps.status) ? 'text-green-400' : 'text-zinc-600'}`}>1. Creating VPS</p>
                <p className="text-zinc-500">~3 min</p>
              </div>
              {/* Step 2: Deploying Server */}
              <div className={`p-2 rounded border text-center ${
                vps.status === 'deploying'
                  ? 'bg-purple-500/20 border-purple-500/50'
                  : vps.status === 'ready'
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-zinc-800/50 border-zinc-700'
              }`}>
                <Zap className={`w-3 h-3 mx-auto mb-1 ${vps.status === 'deploying' ? 'text-purple-400' : vps.status === 'ready' ? 'text-green-400' : 'text-zinc-600'}`} />
                <p className={`font-semibold ${vps.status === 'deploying' ? 'text-purple-400' : vps.status === 'ready' ? 'text-green-400' : 'text-zinc-600'}`}>2. Deploying Server</p>
                <p className="text-zinc-500">~5 min</p>
              </div>
              {/* Step 3: Ready */}
              <div className={`p-2 rounded border text-center ${
                vps.status === 'ready'
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-zinc-800/50 border-zinc-700'
              }`}>
                <CheckCircle className={`w-3 h-3 mx-auto mb-1 ${vps.status === 'ready' ? 'text-green-400' : 'text-zinc-600'}`} />
                <p className={`font-semibold ${vps.status === 'ready' ? 'text-green-400' : 'text-zinc-600'}`}>3. Ready!</p>
                <p className="text-zinc-500">Complete</p>
              </div>
            </div>

            {/* Show IP if available during deploying */}
            {vps.ipAddress && (
              <div className="p-3 bg-cyan-900/20 border border-cyan-500/30 rounded-lg">
                <p className="text-xs text-cyan-400 mb-1 font-semibold flex items-center gap-1">
                  <Globe className="w-3 h-3" /> Your Dedicated Static IP:
                </p>
                <p className="text-xl font-bold text-white font-mono tracking-wider">{vps.ipAddress}</p>
                <p className="text-xs text-zinc-400 mt-1">Server is being deployed at this IP. Will be ready in ~2 minutes.</p>
              </div>
            )}

            <Alert className="bg-blue-500/10 border-blue-500/30">
              <Info className="w-4 h-4 text-blue-400" />
              <AlertDescription className="text-blue-200 text-xs">
                You can leave this page. We'll continue provisioning in the background. Your IP will appear here once ready.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* ══ PROVISIONING FAILED ══ */}
        {vps?.status === 'failed' && !showPaymentOptions && (
          <Alert className="bg-red-900/20 border-red-500/50">
            <XCircle className="w-4 h-4 text-red-400" />
            <AlertDescription className="text-red-200">
              <strong>Provisioning Failed:</strong> {vps.error || 'Unknown error'}
              <br />
              <span className="text-xs">Please contact support or try subscribing again.</span>
            </AlertDescription>
          </Alert>
        )}

        {/* ══ VPS ACTIVE (Ready) ══ */}
        {vps && isVpsReady(vps.status) && vps.ipAddress && !showPaymentOptions && (
          <div className="space-y-3">
            {/* Setup Complete Banner — shown only when provisioning just finished */}
            {justCompleted && (
              <div className="bg-gradient-to-r from-emerald-500/20 to-green-500/10 border-2 border-emerald-500/60 rounded-lg p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-emerald-300">VPS Setup Complete!</p>
                  <p className="text-xs text-emerald-200/80 mt-0.5">
                    Your dedicated server is live at <span className="font-mono font-bold text-white">{vps.ipAddress}</span>.
                    Copy the IP below and whitelist it in your Dhan API portal to start trading.
                  </p>
                </div>
                <button onClick={() => setJustCompleted(false)} className="text-zinc-500 hover:text-white text-xs shrink-0">✕</button>
              </div>
            )}
            {/* Status banner */}
            <div className={`flex items-center justify-between p-3 rounded-lg border ${
              subscription.status === 'expired' ? 'bg-red-500/10 border-red-500/30' :
              subscription.status === 'expiring' ? 'bg-amber-500/10 border-amber-500/30' :
              'bg-emerald-500/10 border-emerald-500/30'
            }`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  subscription.status === 'expired' ? 'bg-red-400' :
                  subscription.status === 'expiring' ? 'bg-amber-400 animate-pulse' :
                  'bg-emerald-400 animate-pulse'
                }`} />
                <span className={`text-sm font-semibold ${
                  subscription.status === 'expired' ? 'text-red-400' :
                  subscription.status === 'expiring' ? 'text-amber-400' :
                  'text-emerald-400'
                }`}>
                  {subscription.status === 'expired' ? 'Subscription Expired — Broker Disconnected' :
                   subscription.status === 'expiring' ? `Expires in ${subscription.daysUntilExpiry} day(s) — Renew Now` :
                   'VPS Active — Orders routing through your dedicated IP'}
                </span>
              </div>
              {subscription.expiryDate && (
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Until {formatExpiry(subscription.expiryDate)}
                </span>
              )}
            </div>

            {/* Expiry warning */}
            {subscription.status === 'expiring' && (
              <Alert className="bg-amber-500/10 border-amber-500/40">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <AlertDescription className="text-amber-200 text-xs">
                  Your VPS subscription expires in <strong>{subscription.daysUntilExpiry} day(s)</strong>.
                  Renew now to keep your broker connection active without interruption.
                </AlertDescription>
              </Alert>
            )}

            {/* Expired warning */}
            {subscription.status === 'expired' && (
              <Alert className="bg-red-900/20 border-red-500/40">
                <XCircle className="w-4 h-4 text-red-400" />
                <AlertDescription className="text-red-200 text-xs">
                  Your VPS subscription has expired. The broker connection is disabled.
                  <strong className="block mt-1">Your VPS and IP are preserved — renew to re-enable access.</strong>
                </AlertDescription>
              </Alert>
            )}

            {/* IP Display */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
              <p className="text-[11px] text-zinc-500 mb-2 flex items-center gap-1">
                <Globe className="w-3 h-3" /> Your Dedicated Static IP Address:
              </p>
              <div className="flex items-center gap-3">
                <span className="text-xl font-mono font-bold text-emerald-400 tracking-wider flex-1">
                  {vps.ipAddress}
                </span>
                <Button
                  onClick={() => copyIP(vps.ipAddress!)}
                  size="sm"
                  className={`shrink-0 text-xs px-3 py-2 ${copied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                >
                  {copied ? <><CheckCircle2 className="w-3 h-3 mr-1" />Copied!</> : <><Copy className="w-3 h-3 mr-1" />Copy IP</>}
                </Button>
              </div>

              {/* VPS Order Server Connectivity Check */}
              <div className="mt-3 pt-3 border-t border-zinc-700">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={checkVpsServer}
                    disabled={vpsConnCheck.loading}
                    size="sm"
                    className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5"
                  >
                    {vpsConnCheck.loading ? (
                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Checking...</>
                    ) : (
                      <><Zap className="w-3 h-3 mr-1" />Check Order Server</>
                    )}
                  </Button>
                  {vpsConnCheck.reachable !== undefined && !vpsConnCheck.loading && (
                    <span className={`text-xs font-semibold flex items-center gap-1 ${vpsConnCheck.reachable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {vpsConnCheck.reachable
                        ? <><CheckCircle className="w-3 h-3" />Order Server UP</>
                        : <><XCircle className="w-3 h-3" />Order Server DOWN</>}
                    </span>
                  )}
                </div>
                {vpsConnCheck.hint && !vpsConnCheck.loading && (
                  <p className={`text-[11px] mt-2 leading-relaxed ${vpsConnCheck.reachable ? 'text-emerald-300/80' : 'text-amber-300/80'}`}>
                    {vpsConnCheck.hint}
                  </p>
                )}
              </div>
            </div>

            {/* Order routing */}
            {subscription.status !== 'expired' && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1">
                  <Wifi className="w-3 h-3" /> Order Routing Flow
                </p>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="px-2 py-1 bg-zinc-700 rounded">Your Order</span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-300">
                    Your VPS ({vps.ipAddress})
                  </span>
                  <span>→</span>
                  <span className="px-2 py-1 bg-zinc-700 rounded">Dhan API</span>
                </div>
              </div>
            )}

            {/* Whitelist instructions */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-blue-300 mb-2">📋 How to Whitelist in Dhan Portal:</p>
              <ol className="space-y-1 text-[10px] text-blue-200/80 list-decimal list-inside leading-relaxed">
                <li>Copy the IP address above using the "Copy IP" button</li>
                <li>Login to <a href="https://api.dhan.co" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">api.dhan.co</a></li>
                <li>Go to Settings → API Management → Static IP Setting</li>
                <li>Add <span className="font-mono text-emerald-400">{vps.ipAddress}</span> and verify</li>
                <li>Generate your access token and save it in API Settings above</li>
              </ol>
            </div>

            {/* Renewal / Cancel buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => setShowPaymentOptions(true)}
                disabled={loading}
                size="sm"
                className={`flex-1 text-xs ${
                  subscription.status === 'expired'
                    ? 'bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800'
                    : 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800'
                } text-white`}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {subscription.status === 'expired' ? 'Renew & Reactivate' : 'Renew Subscription (₹599)'}
              </Button>
              <Button
                onClick={cancelVps}
                disabled={loading}
                variant="outline"
                size="sm"
                className="border-red-900 text-red-400 hover:bg-red-900/20 text-xs px-3"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ══ PAYMENT OPTIONS (New or Renewal) ══ */}
        {showPaymentOptions && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {subscription.status !== 'none' ? 'Renew Subscription' : 'Choose Payment Method'}
              </h3>
              <Button
                onClick={() => setShowPaymentOptions(false)}
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white text-xs h-7 px-2"
              >
                ✕ Close
              </Button>
            </div>

            {/* Summary */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-zinc-400">
                  {subscription.status !== 'none' ? 'Monthly Renewal' : 'Dedicated VPS + Static IP'}
                </span>
                <span className="font-bold text-white">₹{VPS_COST}</span>
              </div>
              {subscription.status !== 'none' && vps?.ipAddress && (
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>Your IP (preserved)</span>
                  <span className="font-mono text-emerald-400">{vps.ipAddress}</span>
                </div>
              )}
              {subscription.status !== 'none' && (
                <p className="text-[11px] text-blue-300 mt-2">
                  ✅ No new VPS created — your existing IP is kept. Subscription extended by 30 days.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Wallet */}
              <button
                onClick={handleWalletClick}
                disabled={loading || !walletBalance || walletBalance < VPS_COST}
                className={`p-4 rounded-xl border-2 transition-all text-left relative overflow-hidden ${
                  walletBalance && walletBalance >= VPS_COST
                    ? 'border-emerald-500/60 bg-gradient-to-br from-emerald-950/60 to-emerald-900/30 hover:border-emerald-400/80 hover:bg-emerald-900/40 cursor-pointer shadow-lg shadow-emerald-900/20'
                    : 'border-zinc-700/50 bg-zinc-900/50 opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-400 fill-current"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/></svg>
                  </div>
                  <span className="text-sm font-bold text-emerald-300">Wallet Pay</span>
                  {walletBalance && walletBalance >= VPS_COST && (
                    <span className="ml-auto text-[9px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">INSTANT</span>
                  )}
                </div>
                <div className="text-xs text-zinc-400 mb-1">Available Balance</div>
                <div className={`text-base font-bold ${walletBalance && walletBalance >= VPS_COST ? 'text-white' : 'text-zinc-400'}`}>
                  ₹{walletBalance?.toFixed(0) || '0'}
                </div>
                {walletBalance !== undefined && walletBalance < VPS_COST && (
                  <div className="text-[10px] text-red-400 mt-1">Need ₹{VPS_COST - (walletBalance || 0)} more</div>
                )}
              </button>

              {/* Razorpay */}
              <button
                onClick={handleRazorpayClick}
                disabled={loading}
                className="p-4 rounded-xl border-2 border-[#3395FF]/50 bg-gradient-to-br from-[#1a2a4a]/60 to-[#0f1f3d]/40 hover:border-[#3395FF]/80 hover:from-[#1a2a4a]/80 hover:to-[#0f1f3d]/60 transition-all cursor-pointer text-left shadow-lg shadow-blue-900/20 group relative overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-2">
                  {/* Official Razorpay Logo */}
                  <div className="w-7 h-7 rounded bg-[#3395FF] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                      <path d="M18.84 3.37L14.1 20.1l-2.85-8.57 4.5-3.37L8.6 9.8l-.97-2.9 11.2-3.53zM5.16 20.63L9.9 3.9l2.85 8.57-4.5 3.37 7.15 1.36.97 2.9-11.2 3.53z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-white">Razorpay</span>
                  <span className="ml-auto text-[9px] font-semibold bg-[#3395FF]/20 text-[#3395FF] border border-[#3395FF]/30 px-1.5 py-0.5 rounded-full">SECURE</span>
                </div>
                <div className="text-xs text-zinc-400 mb-1">Pay with</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] bg-zinc-700/60 text-zinc-300 px-2 py-0.5 rounded font-medium">UPI</span>
                  <span className="text-[10px] bg-zinc-700/60 text-zinc-300 px-2 py-0.5 rounded font-medium">Card</span>
                  <span className="text-[10px] bg-zinc-700/60 text-zinc-300 px-2 py-0.5 rounded font-medium">NetBanking</span>
                </div>
              </button>
            </div>

            {/* Razorpay trust badge */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <svg viewBox="0 0 24 24" className="w-3 h-3 text-zinc-500 fill-current"><path d="M12 2L3.5 6.5v5c0 5.25 3.7 10.15 8.5 11.35 4.8-1.2 8.5-6.1 8.5-11.35v-5L12 2zm-1 13l-3-3 1.41-1.41L11 12.17l5.59-5.58L18 8l-7 7z"/></svg>
              <span className="text-[10px] text-zinc-500">Payments secured by Razorpay · PCI DSS compliant · 256-bit SSL</span>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-zinc-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing payment...
              </div>
            )}
          </div>
        )}

        {/* ══ NO VPS — INITIAL SUBSCRIBE CTA ══ */}
        {!vps && !showPaymentOptions && (
          <div className="space-y-3">
            {/* Why needed */}
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/40 rounded-lg p-3">
              <p className="text-xs font-semibold text-yellow-300 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Why a dedicated IP is required
              </p>
              <p className="text-[10px] text-yellow-200/80 leading-relaxed">
                Brokers like Dhan require a <strong>static IP</strong> for API access (SEBI mandate).
                Each user must have their own dedicated IP — shared IPs are blocked.
                After payment, your personal VPS is automatically created on DigitalOcean with a unique static IP.
              </p>
            </div>

            {/* Pricing card */}
            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-2 border-cyan-500/30 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-cyan-400" />
                    Dedicated VPS — Your Own Static IP
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">Automatically provisioned on DigitalOcean • Mumbai region</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">₹599</p>
                  <p className="text-xs text-zinc-400">/month</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { icon: Server, text: '100% dedicated VPS', color: 'text-green-400' },
                  { icon: Globe, text: 'Unique static IP', color: 'text-cyan-400' },
                  { icon: Zap, text: 'Auto-deployed in ~8 min', color: 'text-yellow-400' },
                  { icon: Shield, text: 'SEBI compliant', color: 'text-blue-400' },
                  { icon: Clock, text: '30-day subscription', color: 'text-purple-400' },
                  { icon: RefreshCw, text: 'Easy monthly renewal', color: 'text-emerald-400' },
                ].map(({ icon: Icon, text, color }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-zinc-300">
                    <Icon className={`w-3 h-3 ${color}`} />
                    {text}
                  </div>
                ))}
              </div>

              <Button
                onClick={() => setShowPaymentOptions(true)}
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-5 text-sm"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Get Dedicated VPS — ₹599/month
              </Button>
              <p className="text-[10px] text-zinc-500 text-center mt-2">
                Secure payment · VPS created automatically · First-month active immediately
              </p>
            </div>

            {/* Recovery for existing VPS users */}
            <div className="text-center pt-1">
              <button
                onClick={handleLinkExisting}
                disabled={linkingExisting}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition disabled:opacity-50 flex items-center gap-1 mx-auto"
              >
                {linkingExisting ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Searching for your VPS...</>
                ) : (
                  <><RefreshCw className="w-3 h-3" /> Already have a VPS? Recover it here</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ══ FAILED STATE — Show subscribe button ══ */}
        {vps?.status === 'failed' && !showPaymentOptions && (
          <Button
            onClick={() => setShowPaymentOptions(true)}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white text-sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again — Subscribe Now
          </Button>
        )}

      </CardContent>
    </Card>
  );
}
