// @ts-nocheck
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { TrendingUp, Shield, Zap, Eye, EyeOff, Mail, Lock, ArrowLeft, BarChart3 } from "lucide-react";

interface LoginScreenProps {
  onLogin: (email: string, password: string) => void;
  onSignup: (email: string, password: string, name: string) => void;
  loading: boolean;
  error: string | null;
  onBackToLanding?: () => void;
}

export function LoginScreen({ onLogin, onSignup, loading, error, onBackToLanding }: LoginScreenProps) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(loginEmail, loginPassword);
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    onSignup(signupEmail, signupPassword, signupName);
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-zinc-950 via-zinc-900 to-black relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-600/5 rounded-full blur-3xl"></div>
      </div>

      {/* Left Side - Branding & Features (Hidden on Mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col justify-between p-12 relative z-10">
        <div>
          {/* Logo & Back Button */}
          <div className="flex items-center justify-between mb-16">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">AI TradeBot</h1>
                <p className="text-sm text-zinc-400">Indian Options Trading</p>
              </div>
            </div>
            {onBackToLanding && (
              <Button
                onClick={onBackToLanding}
                variant="ghost"
                className="text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            )}
          </div>

          {/* Hero Content */}
          <div className="max-w-xl">
            <h2 className="text-5xl font-bold text-white mb-6 leading-tight">
              Trade Smarter with
              <span className="bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-600 bg-clip-text text-transparent"> AI-Powered </span>
              Insights
            </h2>
            <p className="text-xl text-zinc-400 mb-12 leading-relaxed">
              Access real-time market data, advanced AI strategies, and automated trading for NIFTY & BANKNIFTY options.
            </p>

            {/* Feature List */}
            <div className="space-y-6">
              <div className="flex items-start space-x-4 group">
                <div className="w-12 h-12 bg-emerald-600/10 rounded-lg flex items-center justify-center group-hover:bg-emerald-600/20 transition-colors">
                  <Zap className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Lightning Fast Execution</h3>
                  <p className="text-zinc-400 text-sm">Sub-second order execution with advanced AI analysis</p>
                </div>
              </div>

              <div className="flex items-start space-x-4 group">
                <div className="w-12 h-12 bg-blue-600/10 rounded-lg flex items-center justify-center group-hover:bg-blue-600/20 transition-colors">
                  <BarChart3 className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Advanced Analytics</h3>
                  <p className="text-zinc-400 text-sm">Triple-layer verification with EMA, VWAP & pattern recognition</p>
                </div>
              </div>

              <div className="flex items-start space-x-4 group">
                <div className="w-12 h-12 bg-purple-600/10 rounded-lg flex items-center justify-center group-hover:bg-purple-600/20 transition-colors">
                  <Shield className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Risk Management</h3>
                  <p className="text-zinc-400 text-sm">Automated stop-loss, daily limits & position monitoring</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="grid grid-cols-3 gap-8 pt-12 border-t border-zinc-800">
          <div>
            <div className="text-3xl font-bold text-white mb-1">₹2.5Cr+</div>
            <div className="text-sm text-zinc-400">Trading Volume</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">5000+</div>
            <div className="text-sm text-zinc-400">Active Traders</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white mb-1">99.9%</div>
            <div className="text-sm text-zinc-400">Uptime</div>
          </div>
        </div>
      </div>

      {/* Right Side - Login/Signup Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-4 sm:p-8 relative z-10">
        <div className="w-full max-w-md">
          {/* Mobile Logo (Visible on Mobile Only) */}
          <div className="lg:hidden mb-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">AI TradeBot</h1>
            <p className="text-zinc-400">Indian Options Trading Platform</p>
            {onBackToLanding && (
              <Button
                onClick={onBackToLanding}
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white mt-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            )}
          </div>

          <Card className="bg-zinc-900/50 backdrop-blur-xl border-zinc-800/50 shadow-2xl">
            <CardHeader className="space-y-2 pb-6">
              <CardTitle className="text-3xl text-zinc-100 font-bold">Welcome Back</CardTitle>
              <CardDescription className="text-zinc-400">
                Sign in to access your trading dashboard
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-zinc-200 flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-zinc-400" />
                    <span>Email Address</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="trader@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 h-12 pl-4 pr-4 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-zinc-200 flex items-center space-x-2">
                    <Lock className="w-4 h-4 text-zinc-400" />
                    <span>Password</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="bg-zinc-800/50 border-zinc-700 text-zinc-100 h-12 pl-4 pr-12 focus:border-emerald-500 focus:ring-emerald-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center space-x-2 text-zinc-400 cursor-pointer">
                    <input type="checkbox" className="rounded border-zinc-700 bg-zinc-800" />
                    <span>Remember me</span>
                  </label>
                  <a href="#" className="text-emerald-500 hover:text-emerald-400 transition-colors">
                    Forgot password?
                  </a>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start space-x-2">
                    <div className="text-red-500 text-sm flex-1">{error}</div>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 text-white font-semibold text-base shadow-lg shadow-emerald-600/20" 
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Logging in...</span>
                    </div>
                  ) : (
                    "Login to Dashboard"
                  )}
                </Button>

                {onBackToLanding && (
                  <div className="pt-4 border-t border-zinc-800">
                    <p className="text-center text-sm text-zinc-400">
                      Don't have an account?{" "}
                      <button
                        type="button"
                        onClick={onBackToLanding}
                        className="text-emerald-500 hover:text-emerald-400 font-semibold"
                      >
                        Sign up from home page
                      </button>
                    </p>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Security Badge */}
          <div className="mt-6 flex items-center justify-center space-x-2 text-zinc-500 text-sm">
            <Shield className="w-4 h-4" />
            <span>256-bit SSL encryption • Secured by Supabase</span>
          </div>
        </div>
      </div>
    </div>
  );
}