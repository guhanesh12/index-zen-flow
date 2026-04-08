// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { 
  Server, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw,
  AlertTriangle,
  Cloud,
  HardDrive
} from 'lucide-react';
import { getBaseUrl, setCustomBackendUrl, getCustomBackendUrl } from '../utils/apiService';

export function BackendConfiguration() {
  const [customUrl, setCustomUrl] = useState('');
  const [currentBackend, setCurrentBackend] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Load current backend URL
    const current = getBaseUrl();
    setCurrentBackend(current);

    // Load custom URL from localStorage
    const saved = getCustomBackendUrl();
    if (saved) {
      setCustomUrl(saved);
    }
  }, []);

  const testConnection = async (url?: string) => {
    const testUrl = url || customUrl || currentBackend;
    
    if (!testUrl || testUrl.trim() === '') {
      setErrorMessage('Please enter a backend URL');
      setConnectionStatus('error');
      return false;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setErrorMessage('');

    try {
      console.log('🧪 Testing connection to:', testUrl);

      // Test /health endpoint
      const response = await fetch(`${testUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status === 'ok' || data.message?.includes('running')) {
        setConnectionStatus('success');
        setErrorMessage('');
        console.log('✅ Connection successful:', data);
        return true;
      } else {
        throw new Error('Invalid health check response');
      }
    } catch (error: any) {
      console.error('❌ Connection test failed:', error);
      setConnectionStatus('error');
      setErrorMessage(error.message || 'Failed to connect to backend');
      return false;
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);

    // Test connection first
    const isValid = await testConnection(customUrl);

    if (!isValid) {
      setIsSaving(false);
      return;
    }

    // Save to localStorage
    setCustomBackendUrl(customUrl);
    
    // Update current backend display
    setCurrentBackend(getBaseUrl());

    setIsSaving(false);

    // Reload page to apply new backend
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleReset = () => {
    // Clear custom URL
    setCustomBackendUrl('');
    setCustomUrl('');
    
    // Update current backend display
    setCurrentBackend(getBaseUrl());
    
    setConnectionStatus('idle');
    setErrorMessage('');

    // Reload page to apply default backend
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const getBackendType = (url: string) => {
    if (url.includes('supabase.co')) {
      return { type: 'Supabase Edge Functions', icon: Cloud, color: 'bg-green-500' };
    } else if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return { type: 'Local Development', icon: HardDrive, color: 'bg-blue-500' };
    } else {
      return { type: 'VPS Server', icon: Server, color: 'bg-purple-500' };
    }
  };

  const currentBackendInfo = getBackendType(currentBackend);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Backend Configuration
            </CardTitle>
            <CardDescription>
              Configure custom backend URL for VPS deployment or local development
            </CardDescription>
          </div>
          <Badge 
            variant="outline" 
            className="flex items-center gap-2"
          >
            <div className={`w-2 h-2 rounded-full ${currentBackendInfo.color}`} />
            {currentBackendInfo.type}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Backend */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Current Backend</Label>
          <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
            <currentBackendInfo.icon className="w-4 h-4 text-muted-foreground" />
            <code className="text-sm flex-1 font-mono">{currentBackend}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => testConnection(currentBackend)}
              disabled={isTestingConnection}
            >
              {isTestingConnection ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Connection Status */}
        {connectionStatus !== 'idle' && (
          <Alert variant={connectionStatus === 'success' ? 'default' : 'destructive'}>
            <div className="flex items-start gap-2">
              {connectionStatus === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 mt-0.5" />
              )}
              <AlertDescription className="flex-1">
                {connectionStatus === 'success' ? (
                  <span className="text-green-700 dark:text-green-400">
                    ✅ Backend is healthy and responding
                  </span>
                ) : (
                  <span className="text-red-700 dark:text-red-400">
                    ❌ {errorMessage || 'Failed to connect to backend'}
                  </span>
                )}
              </AlertDescription>
            </div>
          </Alert>
        )}

        {/* Custom Backend URL */}
        <div className="space-y-3">
          <div>
            <Label htmlFor="customBackendUrl" className="text-sm font-medium">
              Custom Backend URL (Optional)
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Enter your VPS backend URL with the full path including <code>/make-server-c4d79cb7</code>
            </p>
          </div>
          
          <Input
            id="customBackendUrl"
            type="url"
            placeholder="https://api.indexpilotai.com/make-server-c4d79cb7"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            className="font-mono text-sm"
          />

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => testConnection()}
              disabled={isTestingConnection || !customUrl.trim()}
              className="flex-1"
            >
              {isTestingConnection ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

            <Button
              onClick={handleSave}
              disabled={isSaving || !customUrl.trim() || connectionStatus !== 'success'}
              className="flex-1"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Save & Apply
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!getCustomBackendUrl()}
            >
              Reset
            </Button>
          </div>
        </div>

        {/* Help Section */}
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-sm space-y-2">
            <p className="font-medium">VPS Deployment Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs ml-2">
              <li>Deploy backend to your VPS (see <code>VPS_DEPLOYMENT_GUIDE.md</code>)</li>
              <li>Get your VPS URL: <code>https://api.indexpilotai.com/make-server-c4d79cb7</code></li>
              <li>Enter the URL above and click "Test Connection"</li>
              <li>If successful, click "Save & Apply"</li>
              <li>Whitelist your VPS IP in Broker Setup → Static IP Manager</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              <strong>Note:</strong> After saving, the page will reload to apply the new backend.
            </p>
          </AlertDescription>
        </Alert>

        {/* Examples */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Example URLs:</Label>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                VPS
              </Badge>
              <code>https://api.indexpilotai.com/make-server-c4d79cb7</code>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                VPS (IP)
              </Badge>
              <code>http://187.127.140.245/make-server-c4d79cb7</code>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                Local
              </Badge>
              <code>http://localhost:8000/make-server-c4d79cb7</code>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
