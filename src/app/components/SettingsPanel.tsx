// @ts-nocheck
import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { Key, CheckCircle2, XCircle, Info, AlertTriangle, Plus, MessageSquare, RefreshCw, Shield } from "lucide-react";
import { supabase } from "@/utils-ext/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import { BrokerRequest } from "./BrokerRequest";
import { StaticIPManager } from "./StaticIPManager";
import { UserDedicatedIPManager } from "./UserDedicatedIPManager";
import { getVpsBackendUrl } from "@/utils-ext/config/apiConfig";

interface SettingsPanelProps {
  serverUrl: string;
  accessToken: string;
  onSettingsSaved: () => void;
  onGoToStaticIp?: () => void;
}

interface APICredentials {
  dhanClientId: string;
  dhanAccessToken: string;
  tokenUpdatedAt?: string | null;
}

export function SettingsPanel({ serverUrl, accessToken, onSettingsSaved, onGoToStaticIp }: SettingsPanelProps) {
  const [credentials, setCredentials] = useState<APICredentials>({
    dhanClientId: "",
    dhanAccessToken: "",
    tokenUpdatedAt: null
  });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({ type: null, message: '' });
  const [connectionStatus, setConnectionStatus] = useState({
    dhan: false
  });
  const [showDhanPricingDialog, setShowDhanPricingDialog] = useState(false);
  const [vpsSubInfo, setVpsSubInfo] = useState<{ status: string; daysUntilExpiry: number; expiryDate?: string } | null>(null);
  const [showVpsExpiredModal, setShowVpsExpiredModal] = useState(false);

  useEffect(() => {
    loadCredentials();
    fetchVpsSubscriptionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCredentials = async () => {
    try {
      const response = await fetch(`${serverUrl}/api-credentials`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (data.credentials) {
        setCredentials({
          dhanClientId: data.credentials.dhanClientId || "",
          dhanAccessToken: data.credentials.dhanAccessToken || "",
          tokenUpdatedAt: data.credentials.tokenUpdatedAt || null
        });
        setConnectionStatus(data.status || { dhan: false });
        
        // ⚡ Save to localStorage for fallback
        if (data.credentials.dhanClientId) {
          localStorage.setItem('dhan_client_id', data.credentials.dhanClientId);
          console.log('✅ Dhan Client ID cached to localStorage');
        }
      }
    } catch (error) {
      console.error("Failed to load credentials:", error);
    }
  };

  const fetchVpsSubscriptionStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${getVpsBackendUrl()}/vps/status`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'x-user-id': session.user.id,
          'x-user-email': session.user.email || '',
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.subscription) {
        const sub = data.subscription;
        setVpsSubInfo({ status: sub.status, daysUntilExpiry: sub.daysUntilExpiry, expiryDate: sub.expiryDate });
        if (sub.status === 'expired') {
          setShowVpsExpiredModal(true);
        }
      }
    } catch (e) {
      // VPS backend might not be reachable; fail silently
    }
  };

  // Get fresh access token
  const getFreshToken = async (): Promise<string | null> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        // ⚡ Suppress "Auth session missing" - expected for unauthenticated users
        if (error?.message !== 'Auth session missing!') {
          console.error('❌ Session error:', error);
        }
        return null;
      }
      return session.access_token;
    } catch (error: any) {
      // ⚡ Suppress "Auth session missing" errors
      if (error?.message !== 'Auth session missing!') {
        console.error('❌ Error getting fresh token:', error);
      }
      return null;
    }
  };

  const saveCredentials = async () => {
    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      // Validate inputs
      if (!credentials.dhanClientId) {
        setStatus({ 
          type: 'error', 
          message: 'Please fill in Dhan Client ID' 
        });
        setLoading(false);
        return;
      }

      if (credentials.dhanClientId.length < 5) {
        setStatus({ 
          type: 'error', 
          message: 'Dhan Client ID must be at least 5 characters' 
        });
        setLoading(false);
        return;
      }

      console.log('🔄 Getting fresh access token...');
      const freshToken = await getFreshToken();
      
      if (!freshToken) {
        setStatus({ 
          type: 'error', 
          message: 'Session expired. Please refresh the page and log in again.' 
        });
        setLoading(false);
        return;
      }

      console.log('✅ Fresh token obtained');

      console.log('💾 Saving credentials...', {
        dhanClientId: credentials.dhanClientId ? `${credentials.dhanClientId.substring(0, 4)}***` : 'empty',
        serverUrl
      });

      const response = await fetch(`${serverUrl}/api-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify({
          dhanClientId: credentials.dhanClientId
        })
      });

      console.log('📡 Response status:', response.status, response.statusText);

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      console.log('📄 Content-Type:', contentType);

      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        console.error('❌ Non-JSON response:', textResponse);
        setStatus({ type: 'error', message: `Server returned non-JSON response: ${textResponse.substring(0, 100)}` });
        return;
      }

      const data = await response.json();
      console.log('📦 Response data:', data);

      if (!response.ok || data.error) {
        const errorMsg = data.error || `Failed to save credentials (Status: ${response.status})`;
        console.error('❌ Save failed:', errorMsg);
        console.error('❌ Full response:', JSON.stringify(data, null, 2));
        setStatus({ type: 'error', message: errorMsg });
        return;
      }

      console.log('✅ Credentials saved successfully!');
      
      // ⚡ CRITICAL: Save dhanClientId to localStorage for fallback
      localStorage.setItem('dhan_client_id', credentials.dhanClientId);
      console.log('✅ Dhan Client ID saved to localStorage for fallback');
      
      // ⚡ Notify EnhancedTradingEngine to reload credentials
      window.dispatchEvent(new CustomEvent('credentials-updated'));
      
      setStatus({ type: 'success', message: 'Permanent credentials saved successfully!' });
      onSettingsSaved();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save credentials';
      console.error('❌ Save error (catch block):', error);
      console.error('❌ Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      setStatus({ type: 'error', message: `ERROR: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  const updateAccessToken = async () => {
    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      const response = await fetch(`${serverUrl}/update-access-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          dhanAccessToken: credentials.dhanAccessToken
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setStatus({ type: 'error', message: data.error || 'Failed to update access token' });
        return;
      }

      setStatus({ type: 'success', message: data.message || 'Access token updated!' });
      setConnectionStatus({ ...connectionStatus, dhan: data.connected });
      onSettingsSaved();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update access token';
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async () => {
    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      const response = await fetch(`${serverUrl}/test-api-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });

      const data = await response.json();

      if (data.status) {
        setConnectionStatus(data.status);
        const dhanStatus = data.status.dhan ? '✓' : '✗';
        setStatus({ 
          type: 'success', 
          message: `Connection Status - Dhan: ${dhanStatus}` 
        });
      } else {
        setStatus({ type: 'error', message: data.error || 'Connection test failed' });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      setStatus({ type: 'error', message: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  // ⚡ NEW: ONE-CLICK CONNECT - Saves, Updates Access Token, and Tests automatically
  const handleOneClickConnect = async () => {
    setLoading(true);
    setStatus({ type: null, message: '' });

    try {
      // STEP 1: Validate inputs
      if (!credentials.dhanClientId) {
        setStatus({ 
          type: 'error', 
          message: '❌ Please fill in Dhan Client ID' 
        });
        setLoading(false);
        return;
      }

      if (credentials.dhanClientId.length < 5) {
        setStatus({ 
          type: 'error', 
          message: '❌ Dhan Client ID must be at least 5 characters' 
        });
        setLoading(false);
        return;
      }

      // STEP 2: Get fresh token
      setStatus({ type: 'success', message: '🔄 Step 1/4: Getting fresh session...' });
      const freshToken = await getFreshToken();
      
      if (!freshToken) {
        setStatus({ 
          type: 'error', 
          message: '❌ Session expired. Please refresh the page and log in again.' 
        });
        setLoading(false);
        return;
      }

      // STEP 3: Save credentials (Client ID)
      setStatus({ type: 'success', message: '🔄 Step 2/4: Saving permanent credentials...' });
      const saveResponse = await fetch(`${serverUrl}/api-credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        },
        body: JSON.stringify({
          dhanClientId: credentials.dhanClientId
        })
      });

      const saveData = await saveResponse.json();

      if (!saveResponse.ok || saveData.error) {
        setStatus({ type: 'error', message: `❌ Save failed: ${saveData.error || 'Unknown error'}` });
        setLoading(false);
        return;
      }

      // STEP 4: Update Access Token (if provided)
      if (credentials.dhanAccessToken && credentials.dhanAccessToken.trim() !== '') {
        setStatus({ type: 'success', message: '🔄 Step 3/4: Updating Dhan access token...' });
        const updateResponse = await fetch(`${serverUrl}/update-access-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`
          },
          body: JSON.stringify({
            dhanAccessToken: credentials.dhanAccessToken
          })
        });

        const updateData = await updateResponse.json();

        if (!updateResponse.ok || updateData.error) {
          setStatus({ type: 'error', message: `⚠️ Access token update failed: ${updateData.error}` });
          setLoading(false);
          return;
        }
      }

      // STEP 4: Test Connection
      setStatus({ type: 'success', message: '🔄 Step 4/4: Testing connection...' });
      const testResponse = await fetch(`${serverUrl}/test-api-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`
        }
      });

      const testData = await testResponse.json();

      if (testData.status) {
        setConnectionStatus(testData.status);
        const dhanStatus = testData.status.dhan ? '✅ Connected' : '❌ Failed';
        
        if (testData.status.dhan) {
          setStatus({ 
            type: 'success', 
            message: `🎉 ALL CONNECTED! Dhan: ${dhanStatus}` 
          });
        } else {
          setStatus({ 
            type: 'error', 
            message: `⚠️ Partial Connection - Dhan: ${dhanStatus}` 
          });
        }
        onSettingsSaved();
      } else {
        setStatus({ type: 'error', message: `❌ Connection test failed: ${testData.error}` });
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      console.error('❌ One-Click Connect error:', error);
      setStatus({ type: 'error', message: `❌ ERROR: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          API Configuration
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Configure your Dhan API credentials. Dhan access token needs to be updated daily.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 🎯 OPEN DHAN ACCOUNT CTA */}
        <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-2 border-orange-500/30 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-orange-400 font-bold text-base mb-1">
                🚀 Don't have a Dhan account yet?
              </h3>
              <p className="text-zinc-400 text-sm">
                Open your trading account in minutes with our referral link
              </p>
            </div>
            <Button
              onClick={() => window.open('https://login.dhan.co/?location=DH_WEB&refer=SMIL56887', '_blank')}
              className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-semibold whitespace-nowrap shadow-lg shadow-orange-500/30"
              size="lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Open Dhan Account
            </Button>
          </div>
        </div>
        
        {/* ⚠️ DHAN DATA SUBSCRIPTION WARNING */}
        <div className="bg-blue-500/10 border-2 border-blue-500/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-blue-400 font-bold text-base mb-2 flex items-center gap-2">
                📊 Dhan Data APIs Subscription Required
                <button
                  onClick={() => setShowDhanPricingDialog(true)}
                  className="text-blue-300 hover:text-blue-200 transition-colors"
                  title="View Pricing Details"
                >
                  <Info className="w-5 h-5" />
                </button>
              </h3>
              <p className="text-blue-300 text-sm mb-3">
                <strong>COMPULSORY:</strong> You must subscribe to <strong>Dhan Data APIs</strong> from the Dhan portal to use real-time trading features.
              </p>
              <div className="bg-zinc-900/50 rounded-lg p-3 border border-blue-500/30">
                <p className="text-xs text-blue-200 mb-2 font-semibold">💡 Quick Info:</p>
                <ul className="text-xs text-zinc-300 space-y-1">
                  <li>• <strong>Monthly Plan:</strong> ₹499 + GST</li>
                  <li>• <strong>Yearly Plan:</strong> ₹4,788 + GST (Save ₹1,200!)</li>
                  <li>• Access to real-time market data, historical data, and trading APIs</li>
                </ul>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => window.open('https://login.dhan.co/', '_blank')}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  size="sm"
                >
                  🌐 Visit Dhan Portal
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Dhan API Settings */}
        <div className="space-y-4 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-zinc-200">Dhan API</h3>
            {connectionStatus.dhan ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="dhan-client-id" className="text-zinc-300">Client ID</Label>
            <Input
              id="dhan-client-id"
              type="text"
              placeholder="Enter your Dhan Client ID"
              value={credentials.dhanClientId}
              onChange={(e) => setCredentials({ ...credentials, dhanClientId: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
            <p className="text-xs text-zinc-500">Your permanent Dhan Client ID</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dhan-access-token" className="text-zinc-300">
              Access Token
              <span className="ml-2 text-xs font-normal text-amber-400">⚠ Expires every 24 hours — update daily</span>
            </Label>

            {/* Token age warning */}
            {(() => {
              if (!credentials.tokenUpdatedAt) return null;
              const updatedMs = new Date(credentials.tokenUpdatedAt).getTime();
              const ageHours = (Date.now() - updatedMs) / (1000 * 60 * 60);
              if (ageHours < 20) {
                const h = Math.floor(ageHours);
                const m = Math.floor((ageHours - h) * 60);
                return (
                  <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-1.5 text-xs text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Token last updated {h}h {m}m ago — valid for ~{Math.floor(24 - ageHours)} more hours
                  </div>
                );
              } else if (ageHours < 24) {
                return (
                  <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/50 rounded px-3 py-1.5 text-xs text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Token expiring soon (updated {Math.floor(ageHours)}h ago) — generate a new one now to avoid order failures
                  </div>
                );
              } else {
                return (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/50 rounded px-3 py-1.5 text-xs text-red-300">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    Token expired ({Math.floor(ageHours)}h ago) — orders will fail! Generate a new token at api.dhan.co and paste it below
                  </div>
                );
              }
            })()}

            <Input
              id="dhan-access-token"
              type="password"
              placeholder="Paste new Dhan Access Token here"
              value={credentials.dhanAccessToken}
              onChange={(e) => setCredentials({ ...credentials, dhanAccessToken: e.target.value })}
              className="bg-zinc-800 border-zinc-700 text-zinc-100"
            />
            <p className="text-xs text-zinc-500">
              Get a fresh token every morning from{' '}
              <a 
                href="https://api.dhan.co" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                api.dhan.co
              </a>
              {' '}→ DhanHQ Trading APIs → Generate Access Token
            </p>
          </div>
        </div>

        {status.type && (
          <Alert className={status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-red-500/10 border-red-500/50'}>
            <AlertDescription className={status.type === 'success' ? 'text-emerald-400' : 'text-red-400'}>
              {status.message}
            </AlertDescription>
          </Alert>
        )}

        {/* VPS Subscription Status Banner */}
        {vpsSubInfo && vpsSubInfo.status === 'expired' && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/50 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-red-400 font-semibold text-sm">Static IP Subscription Expired</p>
              <p className="text-zinc-400 text-xs mt-1">Your ₹599/month Static IP subscription has expired. Renew to restore broker connection.</p>
            </div>
            <Button
              size="sm"
              onClick={() => onGoToStaticIp ? onGoToStaticIp() : setShowVpsExpiredModal(true)}
              className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Renew
            </Button>
          </div>
        )}
        {vpsSubInfo && vpsSubInfo.status === 'expiring' && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/50 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-amber-400 font-semibold text-sm">Static IP Expiring Soon</p>
              <p className="text-zinc-400 text-xs mt-0.5">Expires in {vpsSubInfo.daysUntilExpiry} day{vpsSubInfo.daysUntilExpiry !== 1 ? 's' : ''}. Go to Static IP tab to renew.</p>
            </div>
          </div>
        )}
        {vpsSubInfo && vpsSubInfo.status === 'active' && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
            <Shield className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <p className="text-emerald-400 text-xs font-medium">Static IP Active — {vpsSubInfo.daysUntilExpiry} day{vpsSubInfo.daysUntilExpiry !== 1 ? 's' : ''} remaining</p>
          </div>
        )}

        {/* PRIMARY ACTION - ONE-CLICK CONNECT */}
        {vpsSubInfo?.status === 'expired' ? (
          <Button
            onClick={() => onGoToStaticIp ? onGoToStaticIp() : setShowVpsExpiredModal(true)}
            className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 shadow-lg shadow-red-500/20"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Renew Static IP to Connect
          </Button>
        ) : (
          <Button
            onClick={handleOneClickConnect}
            disabled={loading}
            className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow-lg shadow-emerald-500/20"
          >
            {loading ? '🔄 Connecting...' : '🚀 Connect & Test All'}
          </Button>
        )}

        {/* ADVANCED OPTIONS */}
        <div className="pt-2 border-t border-zinc-700/50">
          <p className="text-xs text-zinc-500 mb-3 text-center">Advanced Options (Manual Steps)</p>
          <div className="flex gap-2">
            <Button
              onClick={updateAccessToken}
              disabled={loading}
              variant="outline"
              size="sm"
              className="flex-1 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-xs"
            >
              Update Token Only
            </Button>
            <Button
              onClick={testConnection}
              disabled={loading}
              variant="outline"
              size="sm"
              className="flex-1 bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-xs"
            >
              Test Only
            </Button>
          </div>
        </div>
      </CardContent>

      {/* VPS Subscription Expired Modal */}
      <Dialog open={showVpsExpiredModal} onOpenChange={setShowVpsExpiredModal}>
        <DialogContent className="bg-zinc-900 border-red-500/40 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Static IP Subscription Expired
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Your 30-day Static IP plan has expired. Renew now to restore your dedicated broker connection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-zinc-800/60 rounded-lg p-4 border border-zinc-700 text-sm text-zinc-300 space-y-1">
              <p>• Your dedicated VPS IP is still reserved for you</p>
              <p>• Order routing will fall back to shared IP until renewed</p>
              <p>• Renewal restores full SEBI-compliant static IP routing</p>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => { setShowVpsExpiredModal(false); onGoToStaticIp?.(); }}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Go to Static IP & Renew (₹599)
              </Button>
              <Button
                onClick={() => setShowVpsExpiredModal(false)}
                variant="outline"
                className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 text-zinc-300"
              >
                Later
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dhan Data APIs Pricing Dialog */}
      <Dialog open={showDhanPricingDialog} onOpenChange={setShowDhanPricingDialog}>
        <DialogContent className="bg-zinc-900 border-blue-500/30 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Info className="w-6 h-6 text-blue-400" />
              Dhan Data APIs Subscription
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Complete details about Dhan's data API subscription plans
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Hero Section */}
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/50 rounded-lg p-6">
              <h3 className="text-xl font-bold text-blue-300 mb-3 flex items-center gap-2">
                <img src="https://dhanhq.co/favicon.ico" alt="Dhan" className="w-6 h-6" />
                dhanHQ - Trading & Investing APIs
              </h3>
              <p className="text-zinc-300 text-sm mb-4">
                Build your Trading System & Strategies. Algo Trading on Dhan account for <strong>FREE</strong>
              </p>
              <p className="text-xs text-zinc-400 mb-2">
                Visit: <a href="https://login.dhan.co/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">login.dhan.co</a>
              </p>
              <div className="flex gap-2 text-xs text-zinc-400">
                <span>📖 API Docs</span>
                <span>•</span>
                <span>🔒 Sandbox</span>
                <span>•</span>
                <span>🐍 Python Library</span>
              </div>
            </div>

            {/* Subscription Steps */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-5">
              <h4 className="text-lg font-semibold text-green-400 mb-3">
                ✅ Steps to be followed:
              </h4>
              <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-md text-sm">
                  <span className="text-green-400 font-bold">1</span>
                  <span className="text-zinc-300">Token Generation</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-green-500/20 border border-green-500/50 rounded-md text-sm">
                  <span className="text-green-400 font-bold">2</span>
                  <span className="text-zinc-300">Data APIs</span>
                </div>
              </div>
            </div>

            {/* Pricing Plans */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-5">
              <h4 className="text-lg font-semibold text-blue-400 mb-4 flex items-center gap-2">
                💰 Data APIs from Dhan
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/50">
                  Active
                </span>
              </h4>

              {/* Features */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded border border-amber-500/50">⭐ Real-time Price</span>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded border border-amber-500/50">⭐ Historical Data for 5 Years</span>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded border border-amber-500/50">⭐ 20 Market Depth</span>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded border border-amber-500/50">⭐ Option Chain on APIs</span>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded border border-amber-500/50">⭐ Full Market Depth</span>
                <span className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs rounded border border-amber-500/50">⭐ Expired Options Data</span>
              </div>

              {/* Pricing Cards */}
              <div className="grid grid-cols-2 gap-4">
                {/* Monthly Plan */}
                <div className="bg-zinc-900 border-2 border-purple-500/50 rounded-lg p-4 hover:border-purple-400 transition-all">
                  <h5 className="text-purple-400 font-bold text-lg mb-2">Monthly Plan</h5>
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-3xl font-bold text-white">₹ 499</span>
                    <span className="text-zinc-400 text-sm">/ month</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-3">
                    Recurring Payment: <span className="text-green-400 font-semibold">Enabled</span>
                  </p>
                  <Button
                    onClick={() => window.open('https://login.dhan.co/', '_blank')}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    size="sm"
                  >
                    Subscribe Monthly
                  </Button>
                </div>

                {/* Yearly Plan */}
                <div className="bg-zinc-900 border-2 border-green-500/50 rounded-lg p-4 hover:border-green-400 transition-all relative overflow-hidden">
                  <div className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                    BEST VALUE
                  </div>
                  <h5 className="text-green-400 font-bold text-lg mb-2">Yearly Plan</h5>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl font-bold text-white">₹ 399</span>
                    <span className="text-zinc-400 text-sm">/ month</span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-sm text-zinc-400">Amount paid per year:</span>
                    <span className="text-lg font-bold text-green-400">₹ 4,788.00</span>
                  </div>
                  <Button
                    onClick={() => window.open('https://login.dhan.co/', '_blank')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    Subscribe Yearly (Save ₹1,200)
                  </Button>
                </div>
              </div>
            </div>

            {/* Payment Disclaimer */}
            <div className="bg-amber-500/10 border border-amber-500/50 rounded-lg p-4">
              <h4 className="text-amber-400 font-bold text-sm mb-2 flex items-center gap-2">
                💳 Payment Information
              </h4>
              <p className="text-xs text-zinc-300">
                <strong>NOTE:</strong> All subscription payments must be made directly on the <strong>Dhan Portal</strong> only. 
                IndexpilotAI does not process any subscription payments. This platform only integrates with your existing Dhan account.
              </p>
            </div>

            {/* Important Note */}
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
              <h4 className="text-red-400 font-bold text-sm mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                ⚠️ IMPORTANT - READ CAREFULLY
              </h4>
              <ul className="text-xs text-red-300 space-y-1">
                <li>• <strong>Data APIs subscription is MANDATORY</strong> to use IndexpilotAI real-time trading features</li>
                <li>• Without this subscription, all API calls will fail and no trading will occur</li>
                <li>• Subscribe directly from <a href="https://login.dhan.co/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Dhan Portal</a></li>
                <li>• Yearly plan saves ₹1,200 compared to monthly (₹4,788 vs ₹5,988)</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                onClick={() => window.open('https://login.dhan.co/', '_blank')}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold"
              >
                🌐 Go to Dhan Portal
              </Button>
              <Button
                onClick={() => setShowDhanPricingDialog(false)}
                variant="outline"
                className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}