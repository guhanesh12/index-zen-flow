import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CheckCircle2, XCircle, Loader2, Globe, Server, Zap } from 'lucide-react';
import { getServerUrl, getEndpointUrl, logApiConfig, API_MODE, CUSTOM_API_DOMAIN, SUPABASE_API_DOMAIN } from '@/utils-ext/config/apiConfig';

export function ApiConfigTest() {
  const [testing, setTesting] = useState(false);
  const [customResult, setCustomResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [supabaseResult, setSupabaseResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [activeResult, setActiveResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

  const testEndpoint = async (url: string, name: string) => {
    try {
      console.log(`🧪 Testing ${name}:`, url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${name} Success:`, data);
        return { success: true, message: `${name} is working!`, data };
      } else {
        console.error(`❌ ${name} Failed:`, response.status, response.statusText);
        return { success: false, message: `${name} returned ${response.status}: ${response.statusText}` };
      }
    } catch (error: any) {
      console.error(`❌ ${name} Error:`, error);
      return { success: false, message: `${name} error: ${error.message}` };
    }
  };

  const runTests = async () => {
    setTesting(true);
    setCustomResult(null);
    setSupabaseResult(null);
    setActiveResult(null);

    // Log current config
    logApiConfig();

    // Test Custom Domain
    console.log('\\n🔍 Testing Custom Domain...');
    const customUrl = `${CUSTOM_API_DOMAIN}/functions/v1/make-server-c4d79cb7/health`;
    const customRes = await testEndpoint(customUrl, 'Custom Domain');
    setCustomResult(customRes);

    // Test Supabase Domain
    console.log('\\n🔍 Testing Supabase Domain...');
    const supabaseUrl = `${SUPABASE_API_DOMAIN}/functions/v1/make-server-c4d79cb7/health`;
    const supabaseRes = await testEndpoint(supabaseUrl, 'Supabase Domain');
    setSupabaseResult(supabaseRes);

    // Test Active Configuration
    console.log('\\n🔍 Testing Active Configuration...');
    const activeUrl = `${getServerUrl()}/health`;
    const activeRes = await testEndpoint(activeUrl, 'Active Configuration');
    setActiveResult(activeRes);

    setTesting(false);
  };

  const ResultCard = ({ 
    title, 
    result, 
    icon: Icon 
  }: { 
    title: string; 
    result: { success: boolean; message: string; data?: any } | null;
    icon: any;
  }) => (
    <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-5 h-5 text-cyan-400" />
        <h3 className="font-semibold text-white">{title}</h3>
      </div>
      
      {result ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {result.success ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-green-400 font-medium">Success</span>
              </>
            ) : (
              <>
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-400 font-medium">Failed</span>
              </>
            )}
          </div>
          <p className="text-sm text-zinc-300">{result.message}</p>
          {result.data && (
            <pre className="text-xs bg-zinc-900 p-2 rounded overflow-x-auto">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          )}
        </div>
      ) : (
        <p className="text-zinc-500 text-sm">Not tested yet</p>
      )}
    </div>
  );

  return (
    <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-white flex items-center gap-2">
              <Globe className="w-6 h-6 text-cyan-400" />
              API Configuration Tester
            </CardTitle>
            <CardDescription className="text-zinc-400 mt-2">
              Test both Supabase and Custom domain endpoints
            </CardDescription>
          </div>
          <Badge 
            variant={API_MODE === 'custom' ? 'default' : 'secondary'}
            className="text-lg px-4 py-2"
          >
            {API_MODE === 'custom' ? '🌐 Custom Mode' : '☁️ Supabase Mode'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Current Configuration */}
        <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-700/50">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            Current Configuration
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Mode:</span>
              <span className="text-cyan-400 font-mono">{API_MODE}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Active URL:</span>
              <span className="text-emerald-400 font-mono text-xs">{getServerUrl()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Custom Domain:</span>
              <span className="text-blue-400 font-mono text-xs">{CUSTOM_API_DOMAIN}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Supabase Domain:</span>
              <span className="text-purple-400 font-mono text-xs">{SUPABASE_API_DOMAIN}</span>
            </div>
          </div>
        </div>

        {/* Test Button */}
        <Button 
          onClick={runTests}
          disabled={testing}
          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-semibold py-6"
          size="lg"
        >
          {testing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Testing Endpoints...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5 mr-2" />
              Run Connection Tests
            </>
          )}
        </Button>

        {/* Test Results */}
        {(customResult || supabaseResult || activeResult) && (
          <div className="space-y-4">
            <h3 className="font-semibold text-white text-lg">Test Results</h3>
            
            <ResultCard 
              title="Custom Domain (ap1.indexpilotai.com)"
              result={customResult}
              icon={Globe}
            />
            
            <ResultCard 
              title="Supabase Domain (*.supabase.co)"
              result={supabaseResult}
              icon={Server}
            />
            
            <ResultCard 
              title={`Active Configuration (${API_MODE.toUpperCase()})`}
              result={activeResult}
              icon={Zap}
            />
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-lg p-4">
          <h3 className="font-semibold text-cyan-400 mb-2">📱 Mobile Network Testing</h3>
          <p className="text-zinc-300 text-sm leading-relaxed">
            If you're testing on a mobile network (Jio, Airtel, etc.) and the Supabase domain fails but Custom domain works, 
            that confirms Supabase URLs are blocked by your ISP. The custom domain will work everywhere!
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            variant="outline"
            className="border-zinc-700 hover:bg-zinc-800"
            onClick={() => {
              logApiConfig();
              alert('Configuration logged to console. Open Developer Tools to view.');
            }}
          >
            📊 Log Config
          </Button>
          <Button 
            variant="outline"
            className="border-zinc-700 hover:bg-zinc-800"
            onClick={() => {
              navigator.clipboard.writeText(getServerUrl());
              alert('Server URL copied to clipboard!');
            }}
          >
            📋 Copy URL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ApiConfigTest;
