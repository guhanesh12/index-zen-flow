import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import { CheckCircle2, XCircle, Loader2, Send, Database, Brain, TrendingUp, Zap } from "lucide-react";

interface APITestPanelProps {
  serverUrl: string;
  accessToken: string;
}

interface TestResult {
  name: string;
  status: 'idle' | 'testing' | 'success' | 'error';
  message: string;
  request?: any;
  response?: any;
  timestamp?: string;
}

export function APITestPanel({ serverUrl, accessToken }: APITestPanelProps) {
  const [tests, setTests] = useState<Record<string, TestResult>>({
    backend: { name: 'Backend Server', status: 'idle', message: 'Not tested' },
    chatgpt: { name: 'ChatGPT API', status: 'idle', message: 'Not tested' },
    dhan: { name: 'Dhan API', status: 'idle', message: 'Not tested' },
    analysis: { name: 'AI Analysis Flow', status: 'idle', message: 'Not tested' }
  });

  const updateTest = (key: string, updates: Partial<TestResult>) => {
    setTests(prev => ({
      ...prev,
      [key]: { ...prev[key], ...updates, timestamp: new Date().toLocaleTimeString() }
    }));
  };

  // Test 1: Backend Connection
  const testBackend = async () => {
    updateTest('backend', { status: 'testing', message: 'Connecting to backend...' });
    
    try {
      const response = await fetch(`${serverUrl}/test-connection`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        updateTest('backend', {
          status: 'success',
          message: 'Backend connected successfully',
          response: data
        });
      } else {
        updateTest('backend', {
          status: 'error',
          message: `Backend error: ${data.error || 'Unknown error'}`,
          response: data
        });
      }
    } catch (error) {
      updateTest('backend', {
        status: 'error',
        message: `Connection failed: ${error}`,
        response: { error: String(error) }
      });
    }
  };

  // Test 2: ChatGPT API
  const testChatGPT = async () => {
    updateTest('chatgpt', { status: 'testing', message: 'Testing ChatGPT API...' });
    
    try {
      const requestBody = {
        testMode: false,
        prompt: "Test message - respond with OK"
      };
      
      const response = await fetch(`${serverUrl}/test-chatgpt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        updateTest('chatgpt', {
          status: 'success',
          message: data.configured ? 'ChatGPT API working!' : 'Using test mode - API key not configured',
          request: requestBody,
          response: data
        });
      } else {
        updateTest('chatgpt', {
          status: 'error',
          message: `ChatGPT error: ${data.error || 'Unknown error'}`,
          request: requestBody,
          response: data
        });
      }
    } catch (error) {
      updateTest('chatgpt', {
        status: 'error',
        message: `Request failed: ${error}`,
        response: { error: String(error) }
      });
    }
  };

  // Test 3: Dhan API
  const testDhan = async () => {
    updateTest('dhan', { status: 'testing', message: 'Testing Dhan API...' });
    
    try {
      const requestBody = {
        testMode: false
      };
      
      const response = await fetch(`${serverUrl}/test-dhan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        updateTest('dhan', {
          status: 'success',
          message: data.configured ? 'Dhan API working!' : 'Using test mode - API key not configured',
          request: requestBody,
          response: data
        });
      } else {
        updateTest('dhan', {
          status: 'error',
          message: `Dhan error: ${data.error || 'Unknown error'}`,
          request: requestBody,
          response: data
        });
      }
    } catch (error) {
      updateTest('dhan', {
        status: 'error',
        message: `Request failed: ${error}`,
        response: { error: String(error) }
      });
    }
  };

  // Test 4: Full Analysis Flow
  const testAnalysisFlow = async () => {
    updateTest('analysis', { status: 'testing', message: 'Testing full AI analysis flow...' });
    
    try {
      const requestBody = {
        symbolId: 'test',
        index: 'NIFTY',
        daysToExpiry: 3,
        testMode: true // Always use test mode for demo
      };
      
      const response = await fetch(`${serverUrl}/analyze-symbol`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        updateTest('analysis', {
          status: 'success',
          message: `Analysis complete! Bias: ${data.analysis?.bias}, Confidence: ${data.analysis?.confidence}%`,
          request: requestBody,
          response: data
        });
      } else {
        updateTest('analysis', {
          status: 'error',
          message: `Analysis failed: ${data.error || 'Unknown error'}`,
          request: requestBody,
          response: data
        });
      }
    } catch (error) {
      updateTest('analysis', {
        status: 'error',
        message: `Request failed: ${error}`,
        response: { error: String(error) }
      });
    }
  };

  // Run all tests
  const runAllTests = async () => {
    await testBackend();
    await new Promise(resolve => setTimeout(resolve, 500));
    await testChatGPT();
    await new Promise(resolve => setTimeout(resolve, 500));
    await testDhan();
    await new Promise(resolve => setTimeout(resolve, 500));
    await testAnalysisFlow();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'testing':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-zinc-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">Success</Badge>;
      case 'error':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50">Failed</Badge>;
      case 'testing':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">Testing...</Badge>;
      default:
        return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/50">Not Tested</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-400" />
              API Connection Tests
            </div>
            <Button onClick={runAllTests} className="bg-blue-600 hover:bg-blue-700">
              <Send className="w-4 h-4 mr-2" />
              Run All Tests
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-blue-500/10 border-blue-500/50 text-blue-400">
            <AlertDescription>
              Use this panel to verify all API connections are working correctly. Click individual test buttons or run all tests at once.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Test Cards */}
      <div className="grid grid-cols-1 gap-4">
        {/* Backend Test */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.backend.status)}
                <div>
                  <CardTitle className="text-base">Backend Server Connection</CardTitle>
                  <p className="text-sm text-zinc-400 mt-1">{tests.backend.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(tests.backend.status)}
                <Button size="sm" onClick={testBackend} disabled={tests.backend.status === 'testing'}>
                  Test
                </Button>
              </div>
            </div>
          </CardHeader>
          {tests.backend.response && (
            <CardContent>
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">Response:</div>
                <pre className="bg-zinc-800 p-3 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(tests.backend.response, null, 2)}
                </pre>
                {tests.backend.timestamp && (
                  <div className="text-xs text-zinc-500">Tested at: {tests.backend.timestamp}</div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* ChatGPT Test */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.chatgpt.status)}
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    ChatGPT API Connection
                  </CardTitle>
                  <p className="text-sm text-zinc-400 mt-1">{tests.chatgpt.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(tests.chatgpt.status)}
                <Button size="sm" onClick={testChatGPT} disabled={tests.chatgpt.status === 'testing'}>
                  Test
                </Button>
              </div>
            </div>
          </CardHeader>
          {tests.chatgpt.response && (
            <CardContent>
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">Request:</div>
                <pre className="bg-zinc-800 p-3 rounded text-xs overflow-auto max-h-32">
                  {JSON.stringify(tests.chatgpt.request, null, 2)}
                </pre>
                <div className="text-xs text-zinc-500">Response:</div>
                <pre className="bg-zinc-800 p-3 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(tests.chatgpt.response, null, 2)}
                </pre>
                {tests.chatgpt.timestamp && (
                  <div className="text-xs text-zinc-500">Tested at: {tests.chatgpt.timestamp}</div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Dhan Test */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.dhan.status)}
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Dhan API Connection
                  </CardTitle>
                  <p className="text-sm text-zinc-400 mt-1">{tests.dhan.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(tests.dhan.status)}
                <Button size="sm" onClick={testDhan} disabled={tests.dhan.status === 'testing'}>
                  Test
                </Button>
              </div>
            </div>
          </CardHeader>
          {tests.dhan.response && (
            <CardContent>
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">Request:</div>
                <pre className="bg-zinc-800 p-3 rounded text-xs overflow-auto max-h-32">
                  {JSON.stringify(tests.dhan.request, null, 2)}
                </pre>
                <div className="text-xs text-zinc-500">Response:</div>
                <pre className="bg-zinc-800 p-3 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(tests.dhan.response, null, 2)}
                </pre>
                {tests.dhan.timestamp && (
                  <div className="text-xs text-zinc-500">Tested at: {tests.dhan.timestamp}</div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Full Analysis Flow Test */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.analysis.status)}
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Complete AI Analysis Flow
                  </CardTitle>
                  <p className="text-sm text-zinc-400 mt-1">{tests.analysis.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(tests.analysis.status)}
                <Button size="sm" onClick={testAnalysisFlow} disabled={tests.analysis.status === 'testing'}>
                  Test
                </Button>
              </div>
            </div>
          </CardHeader>
          {tests.analysis.response && (
            <CardContent>
              <div className="space-y-2">
                <div className="text-xs text-zinc-500">Request:</div>
                <pre className="bg-zinc-800 p-3 rounded text-xs overflow-auto max-h-32">
                  {JSON.stringify(tests.analysis.request, null, 2)}
                </pre>
                <div className="text-xs text-zinc-500">Response:</div>
                <pre className="bg-zinc-800 p-3 rounded text-xs overflow-auto max-h-40">
                  {JSON.stringify(tests.analysis.response, null, 2)}
                </pre>
                {tests.analysis.timestamp && (
                  <div className="text-xs text-zinc-500">Tested at: {tests.analysis.timestamp}</div>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Summary */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle>Test Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-zinc-800/50 rounded-lg">
              <div className="text-xs text-zinc-400 mb-1">Total Tests</div>
              <div className="text-2xl font-bold">4</div>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/50">
              <div className="text-xs text-emerald-400 mb-1">Passed</div>
              <div className="text-2xl font-bold text-emerald-400">
                {Object.values(tests).filter(t => t.status === 'success').length}
              </div>
            </div>
            <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/50">
              <div className="text-xs text-red-400 mb-1">Failed</div>
              <div className="text-2xl font-bold text-red-400">
                {Object.values(tests).filter(t => t.status === 'error').length}
              </div>
            </div>
            <div className="p-3 bg-zinc-500/10 rounded-lg border border-zinc-500/50">
              <div className="text-xs text-zinc-400 mb-1">Not Tested</div>
              <div className="text-2xl font-bold text-zinc-400">
                {Object.values(tests).filter(t => t.status === 'idle').length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}