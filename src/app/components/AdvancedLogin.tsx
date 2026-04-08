import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Mail, Lock, Eye, EyeOff, ArrowLeft, Shield, 
  CheckCircle2, Loader2, AlertCircle, Phone, Key,
  Smartphone, TrendingUp, Zap, Target
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { motion } from 'motion/react';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { supabase } from '@/utils-ext/supabase/client';
import { getBaseUrl } from '../utils/apiService';

interface AdvancedLoginProps {
  onSuccess: () => void;
  onBackToLanding: () => void;
  onSignupClick: () => void;
}

// Email/Password Login Schema
const emailLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  rememberMe: z.boolean().optional()
});

// Mobile OTP Login Schema
const mobileLoginSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number (must start with 6-9 and be 10 digits)')
});

type EmailLoginFormData = z.infer<typeof emailLoginSchema>;
type MobileLoginFormData = z.infer<typeof mobileLoginSchema>;

export default function AdvancedLogin({ onSuccess, onBackToLanding, onSignupClick }: AdvancedLoginProps) {
  const [loginMethod, setLoginMethod] = useState<'email' | 'mobile'>('email');
  const [step, setStep] = useState<'login' | 'otp' | 'verifying'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [mobileNumber, setMobileNumber] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Email/Password Login Form
  const emailForm = useForm<EmailLoginFormData>({
    resolver: zodResolver(emailLoginSchema),
    defaultValues: {
      rememberMe: false
    }
  });

  // Mobile Login Form
  const mobileForm = useForm<MobileLoginFormData>({
    resolver: zodResolver(mobileLoginSchema)
  });

  const rememberMe = emailForm.watch('rememberMe');

  // Resend OTP timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Handle Email/Password Login
  const onEmailLogin = async (data: EmailLoginFormData) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) throw signInError;

      if (!signInData.session) {
        throw new Error('Failed to create session');
      }

      console.log('✅ Email login successful');
      setSuccess('Login successful! Redirecting to dashboard...');
      
      // Wait 1 second then redirect
      setTimeout(() => {
        onSuccess();
      }, 1000);

    } catch (err: any) {
      console.error('❌ Email login error:', err);
      if (err.message.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (err.message.includes('Email not confirmed')) {
        setError('Please verify your email address before logging in.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Mobile OTP Login - Send OTP
  const onMobileLogin = async (data: MobileLoginFormData) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      setMobileNumber(data.mobile);

      // Send OTP via server
      const serverUrl = getBaseUrl();
      
      const response = await fetch(`${serverUrl}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ phone: data.mobile })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send OTP');
      }

      const result = await response.json();
      console.log('📱 OTP sent:', result);

      setSuccess('OTP sent successfully to your mobile number');
      setStep('otp');
      setResendTimer(60);
      
      // Auto-focus first OTP input
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);

    } catch (err: any) {
      console.error('❌ Mobile login error:', err);
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP Input
  const handleOtpChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every(digit => digit !== '') && index === 5) {
      handleVerifyOtp(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Verify OTP and Login
  const handleVerifyOtp = async (otpCode?: string) => {
    const otpToVerify = otpCode || otp.join('');
    
    if (otpToVerify.length !== 6) {
      setError('Please enter complete 6-digit OTP');
      return;
    }

    setError('');
    setLoading(true);
    setStep('verifying');

    try {
      // Verify OTP via server
      const serverUrl = getBaseUrl();
      
      const verifyResponse = await fetch(`${serverUrl}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ 
          phone: mobileNumber, 
          otp: otpToVerify 
        })
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error || 'OTP verification failed');
      }

      const result = await verifyResponse.json();
      console.log('✅ OTP verified:', result);

      // Check if user exists with this mobile number
      const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
      
      if (listError) throw listError;

      const userWithMobile = users?.find(u => u.user_metadata?.mobile === mobileNumber);

      if (!userWithMobile) {
        throw new Error('No account found with this mobile number. Please sign up first.');
      }

      // User exists - sign them in using their email
      // Note: We need to get their password or use a different auth method
      // For now, we'll create a magic link or session
      setSuccess('Mobile verified! Signing you in...');
      
      // Create a session for the user (this requires backend support)
      // For now, we'll redirect to the registration page
      throw new Error('Mobile OTP login requires additional backend setup. Please use email/password login or contact support.');

    } catch (err: any) {
      console.error('❌ OTP verification error:', err);
      setError(err.message || 'OTP verification failed. Please try again.');
      setStep('otp');
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || !mobileNumber) return;

    setError('');
    setLoading(true);

    try {
      const serverUrl = getBaseUrl();
      
      const response = await fetch(`${serverUrl}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ phone: mobileNumber })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resend OTP');
      }

      setSuccess('OTP resent successfully');
      setResendTimer(60);
      setOtp(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();

    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  // LOGIN VIEW
  if (step === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div 
            className="absolute top-20 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div 
            className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 10, repeat: Infinity }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-lg relative z-10"
        >
          <Card className="border-slate-700 bg-slate-900/90 backdrop-blur-xl shadow-2xl">
            <CardHeader className="space-y-1 pb-6">
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBackToLanding}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-3 rounded-xl">
                  <Shield className="h-6 w-6 text-white" />
                </div>
              </div>
              <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Welcome Back
              </CardTitle>
              <CardDescription className="text-center text-slate-400 text-base">
                Sign in to IndexpilotAI trading dashboard
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Feature Pills */}
              <div className="flex flex-wrap gap-2 justify-center mb-6">
                <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-full text-xs font-medium">
                  <TrendingUp className="h-3 w-3" />
                  AI Trading
                </div>
                <div className="flex items-center gap-1.5 bg-cyan-500/10 text-cyan-400 px-3 py-1.5 rounded-full text-xs font-medium">
                  <Zap className="h-3 w-3" />
                  Real-time Data
                </div>
                <div className="flex items-center gap-1.5 bg-purple-500/10 text-purple-400 px-3 py-1.5 rounded-full text-xs font-medium">
                  <Target className="h-3 w-3" />
                  Smart Strategies
                </div>
              </div>

              {/* Login Method Tabs */}
              <Tabs value={loginMethod} onValueChange={(v) => setLoginMethod(v as 'email' | 'mobile')} className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 p-1">
                  <TabsTrigger 
                    value="email"
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger 
                    value="mobile"
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Mobile OTP
                  </TabsTrigger>
                </TabsList>

                {/* Email Login Tab */}
                <TabsContent value="email" className="mt-6">
                  <form onSubmit={emailForm.handleSubmit(onEmailLogin)} className="space-y-5">
                    {/* Email Field */}
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300 flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email Address
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        {...emailForm.register('email')}
                        placeholder="your.email@example.com"
                        className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-12"
                      />
                      {emailForm.formState.errors.email && (
                        <p className="text-red-400 text-sm flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {emailForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>

                    {/* Password Field */}
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-slate-300 flex items-center gap-2">
                        <Lock className="h-4 w-4" />
                        Password
                      </Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          {...emailForm.register('password')}
                          placeholder="Enter your password"
                          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 h-12 pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                      {emailForm.formState.errors.password && (
                        <p className="text-red-400 text-sm flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {emailForm.formState.errors.password.message}
                        </p>
                      )}
                    </div>

                    {/* Remember Me & Forgot Password */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="rememberMe"
                          checked={rememberMe}
                          onCheckedChange={(checked) => emailForm.setValue('rememberMe', checked as boolean)}
                          className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                        <Label
                          htmlFor="rememberMe"
                          className="text-sm text-slate-400 cursor-pointer"
                        >
                          Remember me
                        </Label>
                      </div>
                      <a href="#" className="text-sm text-blue-400 hover:text-blue-300">
                        Forgot password?
                      </a>
                    </div>

                    {/* Error/Success Messages */}
                    {error && (
                      <Alert variant="destructive" className="bg-red-900/20 border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {success && (
                      <Alert className="bg-green-900/20 border-green-800 text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>{success}</AlertDescription>
                      </Alert>
                    )}

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-6 text-lg transition-all duration-200"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Signing in...
                        </>
                      ) : (
                        <>
                          <Shield className="mr-2 h-5 w-5" />
                          Sign In
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>

                {/* Mobile OTP Login Tab */}
                <TabsContent value="mobile" className="mt-6">
                  <form onSubmit={mobileForm.handleSubmit(onMobileLogin)} className="space-y-5">
                    {/* Mobile Number Field */}
                    <div className="space-y-2">
                      <Label htmlFor="mobile" className="text-slate-300 flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Mobile Number
                      </Label>
                      <div className="flex gap-2">
                        <div className="bg-slate-800/50 border border-slate-700 rounded-md px-3 py-3 text-slate-400 flex items-center">
                          +91
                        </div>
                        <Input
                          id="mobile"
                          {...mobileForm.register('mobile')}
                          placeholder="9876543210"
                          maxLength={10}
                          className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 flex-1 h-12"
                        />
                      </div>
                      {mobileForm.formState.errors.mobile && (
                        <p className="text-red-400 text-sm flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {mobileForm.formState.errors.mobile.message}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        We'll send a 6-digit OTP to verify your number
                      </p>
                    </div>

                    {/* Error/Success Messages */}
                    {error && (
                      <Alert variant="destructive" className="bg-red-900/20 border-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    {success && (
                      <Alert className="bg-green-900/20 border-green-800 text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertDescription>{success}</AlertDescription>
                      </Alert>
                    )}

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-6 text-lg transition-all duration-200"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Sending OTP...
                        </>
                      ) : (
                        <>
                          <Smartphone className="mr-2 h-5 w-5" />
                          Send OTP
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>

            <CardFooter className="flex flex-col gap-4 border-t border-slate-800 pt-6">
              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 h-px bg-slate-700"></div>
                <span className="text-xs text-slate-500">OR</span>
                <div className="flex-1 h-px bg-slate-700"></div>
              </div>
              
              <p className="text-sm text-slate-400 text-center">
                Don't have an account?{' '}
                <button
                  onClick={onSignupClick}
                  className="text-blue-400 hover:text-blue-300 font-semibold"
                >
                  Create new account
                </button>
              </p>
            </CardFooter>
          </Card>

          {/* Security Badge */}
          <div className="mt-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
            <Shield className="h-4 w-4" />
            <span>Secured with 256-bit SSL encryption</span>
          </div>
        </motion.div>
      </div>
    );
  }

  // OTP VERIFICATION VIEW (for Mobile Login)
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="border-slate-700 bg-slate-900/90 backdrop-blur-xl shadow-2xl">
            <CardHeader className="space-y-2 pb-6">
              <div className="flex justify-center mb-4">
                <div className="bg-blue-600/20 p-4 rounded-full">
                  <Smartphone className="h-8 w-8 text-blue-400" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-center text-white">
                Verify Your Mobile
              </CardTitle>
              <CardDescription className="text-center text-slate-400">
                Enter the 6-digit OTP sent to
                <br />
                <span className="text-white font-semibold">
                  +91 {mobileNumber}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* OTP Input */}
              <div className="flex justify-center gap-2">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (otpInputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold bg-slate-800/50 border-2 border-slate-700 rounded-lg text-white focus:border-blue-500 focus:outline-none transition-colors"
                  />
                ))}
              </div>

              {/* Error/Success Messages */}
              {error && (
                <Alert variant="destructive" className="bg-red-900/20 border-red-800">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="bg-green-900/20 border-green-800 text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              {/* Verify Button */}
              <Button
                onClick={() => handleVerifyOtp()}
                disabled={loading || otp.some(digit => digit === '')}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-6"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify OTP
                    <CheckCircle2 className="ml-2 h-5 w-5" />
                  </>
                )}
              </Button>

              {/* Resend OTP */}
              <div className="text-center">
                {resendTimer > 0 ? (
                  <p className="text-slate-400 text-sm">
                    Resend OTP in <span className="text-blue-400 font-semibold">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    onClick={handleResendOtp}
                    disabled={loading}
                    className="text-blue-400 hover:text-blue-300 font-semibold text-sm disabled:opacity-50"
                  >
                    Didn't receive OTP? Resend
                  </button>
                )}
              </div>

              {/* Back Button */}
              <Button
                variant="outline"
                onClick={() => {
                  setStep('login');
                  setOtp(['', '', '', '', '', '']);
                  setError('');
                }}
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // VERIFYING VIEW (Loading State)
  if (step === 'verifying') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <Card className="border-slate-700 bg-slate-900/90 backdrop-blur-xl shadow-2xl">
            <CardContent className="py-12">
              <div className="flex flex-col items-center space-y-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Loader2 className="h-16 w-16 text-blue-500" />
                </motion.div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold text-white">
                    Signing You In
                  </h3>
                  <p className="text-slate-400">
                    Please wait while we verify your credentials...
                  </p>
                </div>
                {success && (
                  <Alert className="bg-green-900/20 border-green-800 text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return null;
}
