// @ts-nocheck
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Mail, Lock, Eye, EyeOff, ArrowLeft, Shield, 
  CheckCircle2, Loader2, AlertCircle, Zap,
  BarChart3, TrendingUp, Phone, KeyRound
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { motion } from 'motion/react';
import { supabase } from '@/utils-ext/supabase/client';
import { SEO, SEO_CONFIGS } from '../utils/seo';
import { trackLogin } from '../hooks/useAnalyticsTracking';
const logoColor = "/logo-color.png";

interface ModernLoginProps {
  onLoginSuccess: (token: string) => void;
  onSwitchToSignup: () => void;
  onBackToHome: () => void;
  onReadyForDashboard?: () => void;
  serverUrl: string;
  publicAnonKey: string;
}

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional()
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function ModernLogin({ onLoginSuccess, onSwitchToSignup, onBackToHome, onReadyForDashboard, serverUrl, publicAnonKey }: ModernLoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // ── Forgot Password ──
  type ForgotStep = 'none' | 'details' | 'otp' | 'newpass' | 'done';
  const [forgotStep, setForgotStep] = useState<ForgotStep>('none');
  const [fpEmail, setFpEmail] = useState('');
  const [fpPhone, setFpPhone] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpNewPass, setFpNewPass] = useState('');
  const [fpConfirmPass, setFpConfirmPass] = useState('');
  const [fpShowPass, setFpShowPass] = useState(false);
  const [fpError, setFpError] = useState('');
  const [fpLoading, setFpLoading] = useState(false);

  const handleSendForgotOtp = async () => {
    if (!fpEmail || !fpPhone) { setFpError('Please enter both email and mobile number'); return; }
    if (!/^[0-9]{10}$/.test(fpPhone)) { setFpError('Mobile number must be exactly 10 digits'); return; }
    setFpError(''); setFpLoading(true);
    try {
      const res = await fetch(`${serverUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fpEmail, phone: fpPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
      setForgotStep('otp');
    } catch (e: any) { setFpError(e.message); }
    finally { setFpLoading(false); }
  };

  const handleVerifyForgotOtp = async () => {
    if (fpOtp.length !== 6) { setFpError('Enter the 6-digit OTP'); return; }
    setFpError(''); setForgotStep('newpass');
  };

  const handleResetPassword = async () => {
    if (!fpNewPass || fpNewPass.length < 6) { setFpError('Password must be at least 6 characters'); return; }
    if (fpNewPass !== fpConfirmPass) { setFpError('Passwords do not match'); return; }
    setFpError(''); setFpLoading(true);
    try {
      const res = await fetch(`${serverUrl}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fpPhone, otp: fpOtp, newPassword: fpNewPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      setForgotStep('done');
    } catch (e: any) { setFpError(e.message); }
    finally { setFpLoading(false); }
  };

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false
    }
  });

  const onSubmit = async (data: LoginFormData) => {
    // Prevent multiple submissions
    if (loading || redirecting) {
      console.log('⚠️ Login already in progress, ignoring submit');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('🔐 Attempting login...');
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) throw signInError;

      if (!signInData.session) {
        throw new Error('Failed to create session');
      }

      console.log('✅ Login successful - session established');
      console.log('📝 Access token:', signInData.session.access_token.substring(0, 20) + '...');
      
      // Set redirecting flag to prevent multiple redirects
      setRedirecting(true);
      
      onReadyForDashboard?.();
      console.log('🚀 Calling onLoginSuccess callback...');
      
      // 📊 Track successful login
      trackLogin(data.email, 'success', signInData.user.id);
      
      onLoginSuccess(signInData.session.access_token);

    } catch (err: any) {
      console.error('❌ Login error:', err);
      setLoading(false);
      setRedirecting(false);
      
      // 📊 Track failed login
      trackLogin(data.email, 'failed');
      
      if (err.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (err.message.includes('Email not confirmed')) {
        setError('Please verify your email address before logging in.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    }
    // Don't reset loading on success - keep button disabled during redirect
  };

  return (
    <div className="min-h-screen bg-black flex">
      <SEO {...SEO_CONFIGS.login} />
      {/* Left Side - Branding & Features */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col p-12 relative overflow-hidden">
        {/* Gradient Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-black via-slate-950 to-black"></div>
        <motion.div 
          className="absolute top-20 left-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div 
          className="absolute bottom-20 right-10 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 10, repeat: Infinity }}
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center gap-3 mb-16"
          >
            <img src={logoColor} alt="IndexpilotAI Logo" className="h-14 w-auto" />
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                IndexpilotAI
              </h1>
              <p className="text-sm text-slate-400">Indian Options Trading</p>
            </div>
          </motion.div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col justify-center max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <h2 className="text-5xl font-bold text-white mb-4 leading-tight">
                Trade Smarter with
              </h2>
              <h2 className="text-5xl font-bold mb-6 leading-tight">
                <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  AI-Powered
                </span>
                <span className="text-white"> Insights</span>
              </h2>
              <p className="text-slate-400 text-lg mb-12 leading-relaxed">
                Access real-time market data, advanced AI strategies, and automated trading for NIFTY & BANKNIFTY options.
              </p>

              {/* Feature Cards */}
              <div className="space-y-6">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="flex items-start gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center group-hover:from-cyan-500/30 group-hover:to-cyan-600/20 transition-all duration-300">
                    <Zap className="w-6 h-6 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">Lightning Fast Execution</h3>
                    <p className="text-slate-500 text-sm">Sub-second order execution with advanced AI analysis</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="flex items-start gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 flex items-center justify-center group-hover:from-blue-500/30 group-hover:to-blue-600/20 transition-all duration-300">
                    <BarChart3 className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">Advanced Analytics</h3>
                    <p className="text-slate-500 text-sm">Triple-layer verification with EMA, VWAP & pattern recognition</p>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  className="flex items-start gap-4 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 flex items-center justify-center group-hover:from-purple-500/30 group-hover:to-purple-600/20 transition-all duration-300">
                    <Shield className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">Risk Management</h3>
                    <p className="text-slate-500 text-sm">Automated stop-loss, daily limits & position monitoring</p>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex items-center gap-12 pt-8 border-t border-slate-800"
          >
            <div>
              <div className="text-3xl font-bold text-white mb-1">₹2.5Cr+</div>
              <div className="text-sm text-slate-500">Trading Volume</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-1">5000+</div>
              <div className="text-sm text-slate-500">Active Traders</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-1">99.9%</div>
              <div className="text-sm text-slate-500">Uptime</div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-slate-950">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          {/* Back Button */}
          <button
            onClick={onBackToHome}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm">Back to Home</span>
          </button>

          {/* Form Card */}
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">

            {/* ── FORGOT PASSWORD FLOW ── */}
            {forgotStep !== 'none' && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 mb-6">
                  <button onClick={() => { setForgotStep('none'); setFpError(''); }} className="text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      {forgotStep === 'done' ? 'Password Updated!' :
                       forgotStep === 'details' ? 'Reset Password' :
                       forgotStep === 'otp' ? 'Enter OTP' : 'New Password'}
                    </h2>
                    <p className="text-slate-400 text-sm">
                      {forgotStep === 'details' ? 'Enter your registered email and mobile number' :
                       forgotStep === 'otp' ? `OTP sent to +91 ${fpPhone}` :
                       forgotStep === 'newpass' ? 'Choose a new secure password' :
                       'You can now log in with your new password'}
                    </p>
                  </div>
                </div>

                {/* Step indicator */}
                {forgotStep !== 'done' && (
                  <div className="flex items-center gap-2 mb-4">
                    {['details','otp','newpass'].map((s, i) => (
                      <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${
                        ['details','otp','newpass'].indexOf(forgotStep) >= i ? 'bg-cyan-500' : 'bg-slate-700'
                      }`} />
                    ))}
                  </div>
                )}

                {fpError && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {fpError}
                  </div>
                )}

                {/* Step 1: Email + Phone */}
                {forgotStep === 'details' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-slate-300 flex items-center gap-2 text-sm"><Mail className="h-4 w-4" />Email Address</Label>
                      <Input value={fpEmail} onChange={e => setFpEmail(e.target.value)} type="email" placeholder="your@email.com" className="bg-slate-900/80 border-slate-700 text-white h-12 focus:border-cyan-500" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300 flex items-center gap-2 text-sm"><Phone className="h-4 w-4" />Registered Mobile Number</Label>
                      <Input value={fpPhone} onChange={e => setFpPhone(e.target.value.replace(/\D/,'').slice(0,10))} type="tel" placeholder="10-digit mobile number" className="bg-slate-900/80 border-slate-700 text-white h-12 focus:border-cyan-500" />
                      <p className="text-xs text-slate-500">Must match the mobile number used when you registered</p>
                    </div>
                    <Button onClick={handleSendForgotOtp} disabled={fpLoading} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 h-12 font-semibold">
                      {fpLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Sending OTP...</> : 'Send OTP'}
                    </Button>
                  </div>
                )}

                {/* Step 2: OTP */}
                {forgotStep === 'otp' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-slate-300 flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4" />6-Digit OTP</Label>
                      <Input value={fpOtp} onChange={e => setFpOtp(e.target.value.replace(/\D/,'').slice(0,6))} type="text" inputMode="numeric" placeholder="000000" className="bg-slate-900/80 border-slate-700 text-white h-12 focus:border-cyan-500 text-center text-2xl tracking-widest font-mono" maxLength={6} />
                      <p className="text-xs text-slate-500">OTP expires in 10 minutes</p>
                    </div>
                    <Button onClick={handleVerifyForgotOtp} disabled={fpOtp.length !== 6} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 h-12 font-semibold">
                      Verify OTP
                    </Button>
                    <button onClick={handleSendForgotOtp} className="w-full text-sm text-slate-400 hover:text-cyan-400 transition-colors">
                      Resend OTP
                    </button>
                  </div>
                )}

                {/* Step 3: New Password */}
                {forgotStep === 'newpass' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-slate-300 flex items-center gap-2 text-sm"><Lock className="h-4 w-4" />New Password</Label>
                      <div className="relative">
                        <Input value={fpNewPass} onChange={e => setFpNewPass(e.target.value)} type={fpShowPass ? 'text' : 'password'} placeholder="At least 6 characters" className="bg-slate-900/80 border-slate-700 text-white h-12 pr-12 focus:border-cyan-500" />
                        <button type="button" onClick={() => setFpShowPass(!fpShowPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                          {fpShowPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300 flex items-center gap-2 text-sm"><Lock className="h-4 w-4" />Confirm Password</Label>
                      <Input value={fpConfirmPass} onChange={e => setFpConfirmPass(e.target.value)} type={fpShowPass ? 'text' : 'password'} placeholder="Re-enter password" className="bg-slate-900/80 border-slate-700 text-white h-12 focus:border-cyan-500" />
                    </div>
                    <Button onClick={handleResetPassword} disabled={fpLoading || !fpNewPass || !fpConfirmPass} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 h-12 font-semibold">
                      {fpLoading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Updating...</> : 'Update Password'}
                    </Button>
                  </div>
                )}

                {/* Done */}
                {forgotStep === 'done' && (
                  <div className="text-center space-y-4 py-4">
                    <div className="flex justify-center">
                      <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      </div>
                    </div>
                    <p className="text-slate-300">Your password has been updated successfully.</p>
                    <Button onClick={() => { setForgotStep('none'); setFpEmail(''); setFpPhone(''); setFpOtp(''); setFpNewPass(''); setFpConfirmPass(''); }} className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 h-12 font-semibold">
                      Back to Login
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* ── LOGIN FORM ── */}
            {forgotStep === 'none' && (
              <>
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
              <p className="text-slate-400">Sign in to access your trading dashboard</p>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Email Field */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300 flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4" />
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register('email')}
                  placeholder="trader@example.com"
                  className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-600 h-12 focus:border-cyan-500 transition-colors"
                />
                {form.formState.errors.email && (
                  <p className="text-red-400 text-sm flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300 flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4" />
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    {...form.register('password')}
                    placeholder="Enter your password"
                    className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-600 h-12 pr-12 focus:border-cyan-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="text-red-400 text-sm flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="rememberMe"
                    checked={form.watch('rememberMe')}
                    onCheckedChange={(checked) => form.setValue('rememberMe', checked as boolean)}
                    className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                  />
                  <Label
                    htmlFor="rememberMe"
                    className="text-sm text-slate-400 cursor-pointer select-none"
                  >
                    Remember me
                  </Label>
                </div>
                <button
                  type="button"
                  onClick={() => { setForgotStep('details'); setFpEmail(form.getValues('email') || ''); setFpError(''); }}
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {/* Error Message */}
              {error && (
                <Alert variant="destructive" className="bg-red-900/20 border-red-800">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading || redirecting}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold h-12 text-base transition-all duration-200 shadow-lg shadow-cyan-500/20"
              >
                {redirecting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Redirecting...
                  </>
                ) : loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Login to Dashboard'
                )}
              </Button>
            </form>

            {/* Sign Up Link */}
            <div className="mt-6 text-center">
              <p className="text-slate-400 text-sm">
                Don't have an account?{' '}
                <button
                  onClick={onSwitchToSignup}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
                >
                  Sign up from home page
                </button>
              </p>
            </div>

            {/* Security Badge */}
            <div className="mt-6 pt-6 border-t border-slate-800">
              <div className="flex items-center justify-center gap-2 text-slate-500 text-xs">
                <Shield className="h-3 w-3" />
                <span>256-bit SSL encryption • Secured by Supabase</span>
              </div>
            </div>
              </>
            )}
          </div>

          {/* Mobile Logo (visible only on small screens) */}
          <div className="lg:hidden mt-8 flex items-center justify-center gap-3">
            <img src={logoColor} alt="IndexpilotAI Logo" className="h-10 w-auto" />
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                IndexpilotAI
              </h1>
              <p className="text-xs text-slate-400">Indian Options Trading</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}