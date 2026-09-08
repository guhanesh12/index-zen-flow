// @ts-nocheck
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to console for debugging
    console.error('🚨 ERROR BOUNDARY CAUGHT ERROR:');
    console.error('Error:', error);
    console.error('Component Stack:', errorInfo?.componentStack);
    console.error('Error Count:', this.state.errorCount + 1);

    const isChunkOrImportError = 
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Importing a module script failed') ||
      error?.message?.includes('error loading dynamically imported module') ||
      error?.name === 'ChunkLoadError';

    // Update state with error details
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // For chunk/module network errors, trigger an automatic recovery reload if not done recently
    if (isChunkOrImportError && typeof window !== 'undefined') {
      const lastAutoReload = parseInt(sessionStorage.getItem('last_eb_chunk_reload') || '0', 10);
      const now = Date.now();
      if (now - lastAutoReload > 6000) {
        sessionStorage.setItem('last_eb_chunk_reload', String(now));
        console.warn('🔄 Auto-refreshing page to recover from dynamic module fetch error...');
        setTimeout(() => {
          window.location.reload();
        }, 800);
        return;
      }
    }

    // Only force engine stop for severe non-chunk JavaScript crashes repeated multiple times
    if (!isChunkOrImportError && this.state.errorCount >= 4) {
      console.error('🚨 TOO MANY RUNTIME ERRORS! Stopping engine safely...');
      localStorage.setItem('engine_running', 'false');
    }

    // Send error to backend logging (optional)
    try {
      // Background logging
    } catch {
      // ignore
    }
  }

  handleReset = () => {
    // Reset error boundary state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleFullReset = () => {
    // Clear all app state and reload
    console.log('🔄 Full app reset requested...');
    localStorage.removeItem('engine_running');
    localStorage.removeItem('engine_interval');
    localStorage.removeItem('trading_symbols');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isChunkOrImportError = 
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Importing a module script failed') ||
        this.state.error?.message?.includes('error loading dynamically imported module') ||
        this.state.error?.name === 'ChunkLoadError';

      if (isChunkOrImportError) {
        return (
          <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
            <Card className="max-w-md w-full bg-zinc-900/90 border-zinc-800 shadow-2xl p-6 text-center space-y-4">
              <div className="size-12 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-purple-400">
                <RefreshCw className="size-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-zinc-100">Updating Application</h2>
                <p className="text-xs text-zinc-400">
                  A fresh version or module chunk is being synchronized.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button 
                  onClick={() => window.location.reload()}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs py-2 rounded-lg"
                >
                  <RefreshCw className="size-3.5 mr-2" />
                  Reload App Now
                </Button>
              </div>
            </Card>
          </div>
        );
      }

      // Standard Error UI
      return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
          <Card className="max-w-2xl w-full bg-red-950/10 border-red-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <AlertTriangle className="size-6 text-red-500" />
                <div>
                  <div className="text-xl text-red-500">Application Error</div>
                  <div className="text-sm text-zinc-400 font-normal mt-1">
                    Something went wrong in the trading dashboard
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error Count Badge */}
              <div className="flex items-center gap-2">
                <Badge variant="destructive">
                  Error #{this.state.errorCount}
                </Badge>
                {this.state.errorCount >= 3 && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                    ⚠️ Multiple errors detected
                  </Badge>
                )}
              </div>

              {/* Error Message */}
              {this.state.error && (
                <div className="p-4 bg-zinc-900 rounded border border-zinc-800">
                  <div className="text-sm font-semibold text-red-400 mb-2">Error Message:</div>
                  <div className="text-sm text-zinc-300 font-mono">
                    {this.state.error.toString()}
                  </div>
                </div>
              )}

              {/* Error Stack */}
              {this.state.errorInfo && (
                <details className="p-4 bg-zinc-900 rounded border border-zinc-800">
                  <summary className="text-sm font-semibold text-zinc-400 cursor-pointer">
                    Component Stack (click to expand)
                  </summary>
                  <pre className="text-xs text-zinc-500 mt-2 overflow-auto max-h-64">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              {/* Recovery Instructions */}
              <div className="p-4 bg-blue-950/10 border border-blue-900/20 rounded">
                <div className="text-sm font-semibold text-blue-400 mb-2">
                  🔧 How to recover:
                </div>
                <ul className="text-sm text-zinc-300 space-y-1 list-disc list-inside">
                  <li>Click "Try Again" to continue without reloading</li>
                  <li>Click "Full Reset" if errors persist (clears app state)</li>
                  <li>Check browser console for detailed error logs</li>
                  <li>If problem continues, logout and login again</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button 
                  onClick={this.handleReset}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <RefreshCw className="size-4 mr-2" />
                  Try Again
                </Button>
                <Button 
                  onClick={this.handleFullReset}
                  variant="destructive"
                  className="flex-1"
                >
                  <AlertTriangle className="size-4 mr-2" />
                  Full Reset & Reload
                </Button>
              </div>

              {/* Additional Info */}
              <div className="text-xs text-zinc-500 text-center mt-4">
                Error occurred at: {new Date().toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
