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
    console.error('Component Stack:', errorInfo.componentStack);
    console.error('Error Count:', this.state.errorCount + 1);

    // Update state with error details
    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // ⚡ CRITICAL FIX: If too many errors, force engine stop
    if (this.state.errorCount >= 3) {
      console.error('🚨 TOO MANY ERRORS! Stopping engine and clearing state...');
      localStorage.setItem('engine_running', 'false');
      
      // Optional: Clear all localStorage to force full reset
      if (this.state.errorCount >= 5) {
        console.error('🚨 CRITICAL ERROR THRESHOLD! Clearing all app state...');
        // Only clear our app-specific keys, not auth tokens
        localStorage.removeItem('engine_running');
        localStorage.removeItem('engine_interval');
        localStorage.removeItem('trading_symbols');
      }
    }

    // Send error to backend logging (optional)
    try {
      // You could send errors to your backend for monitoring
      // fetch('/api/log-error', { method: 'POST', body: JSON.stringify({ error: error.toString(), stack: errorInfo.componentStack }) });
    } catch (e) {
      console.error('Failed to log error to backend:', e);
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
      // Error UI
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
