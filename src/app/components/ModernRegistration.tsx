// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  Mail, Lock, Eye, EyeOff, ArrowLeft, Shield, User,
  CheckCircle2, Loader2, AlertCircle, Zap, Phone, Globe,
  BarChart3, TrendingUp, Building, MapPin, Smartphone
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { motion } from 'motion/react';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { supabase } from '@/utils-ext/supabase/client';
import { SEO, SEO_CONFIGS } from '../utils/seo';
import { trackSignup } from '../hooks/useAnalyticsTracking';

interface ModernRegistrationProps {
  onRegistrationSuccess: (token: string) => void;
  onSwitchToSignin: () => void;
  onBackToHome: () => void;
  onReadyForDashboard?: () => void;
  serverUrl: string;
  publicAnonKey: string;
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

const registrationSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number (must start with 6-9 and be 10 digits)'),
  country: z.string().min(1, 'Country is required'),
  state: z.string().min(1, 'State is required'),
  city: z.string().min(2, 'City must be at least 2 characters').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(50),
  termsAccepted: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function ModernRegistration({ onRegistrationSuccess, onSwitchToSignin, onBackToHome, onReadyForDashboard, serverUrl, publicAnonKey }: ModernRegistrationProps) {
  const [step, setStep] = useState<'form' | 'otp' | 'verifying'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<RegistrationFormData | null>(null);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resendTimer, setResendTimer] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [formStarted, setFormStarted] = useState(false); // Track if user started filling form
  
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      country: 'India',
      termsAccepted: false
    }
  });

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);
  
  // 📊 Track when user starts filling the form (25% progress)
  const handleFormInteraction = () => {
    if (!formStarted) {
      setFormStarted(true);
      const currentEmail = form.getValues('email');
      const currentName = form.getValues('fullName');
      const currentMobile = form.getValues('mobile');
      
      // Track initial form interaction
      trackSignup(
        currentEmail || undefined,
        currentName || undefined,
        currentMobile || undefined,
        25,
        false
      );
    }
  };

  const onSubmit = async (data: RegistrationFormData) => {
    setError('');
    setSuccess('');
    setLoading(true);
    setFormData(data);

    try {
      // ✅ FIRST: Check if email already exists
      console.log('🔍 Checking if email already exists:', data.email);
      const checkEmailResponse = await fetch(`${serverUrl}/auth/check-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ email: data.email })
      });

      if (checkEmailResponse.ok) {
        const emailCheckResult = await checkEmailResponse.json();
        if (emailCheckResult.exists) {
          throw new Error('An account with this email already exists. Please sign in instead or use a different email.');
        }
      }

      // ✅ Email is available, proceed with OTP
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
      
      // 📊 Track signup progress - OTP sent (50% complete)
      trackSignup(data.email, data.fullName, data.mobile, 50, false);
      
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);

    } catch (err: any) {
      console.error('❌ Registration error:', err);
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

  const handleVerifyOtp = async (otpCode?: string) => {
    const otpToVerify = otpCode || otp.join('');
    
    if (otpToVerify.length !== 6) {
      setError('Please enter complete 6-digit OTP');
      return;
    }

    if (!formData) {
      setError('Form data not found. Please go back and fill the form again.');
      return;
    }

    setError('');
    setLoading(true);
    setStep('verifying');

    try {
      // ✅ Verify OTP AND create account via backend (bypasses email rate limits)
      const verifyResponse = await fetch(`${serverUrl}/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ 
          phone: formData.mobile, 
          otp: otpToVerify,
          // Pass account creation data to backend
          email: formData.email,
          password: formData.password,
          name: formData.fullName
        })
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        
        // Better error message for rate limits
        if (errorData.error?.includes('rate limit') || errorData.error?.includes('429')) {
          throw new Error('Too many registration attempts. Please wait a few minutes and try again.');
        }
        
        throw new Error(errorData.error || 'OTP verification failed');
      }

      const result = await verifyResponse.json();
      console.log('✅ OTP verified and account created:', result);

      // Backend already created the account and returned session
      if (!result.session || !result.session.access_token) {
        throw new Error('Account creation failed. Please try again.');
      }

      // Use the session from backend
      const signUpData = {
        user: result.user,
        session: result.session
      };

      // Set the session in Supabase client
      await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token
      });

      console.log('✅ Account created successfully - session established');
      setSuccess('Account created successfully! Redirecting to dashboard...');
      
      // 📊 Track signup completion (100% complete)
      trackSignup(formData.email, formData.fullName, formData.mobile, 100, true, signUpData.user?.id);
      
      // Check if session was created (it should be since email confirmation is disabled)
      if (signUpData.session?.access_token) {
        // Set redirecting flag
        setRedirecting(true);

        onReadyForDashboard?.();
        console.log('🚀 Calling onRegistrationSuccess callback...');
        onRegistrationSuccess(signUpData.session.access_token);
      } else {
        throw new Error('Failed to create session. Please try logging in.');
      }

    } catch (err: any) {
      console.error('❌ Verification error:', err);
      setError(err.message || 'Verification failed. Please try again.');
      
      // 📊 Track incomplete signup (75% complete but failed)
      if (formData) {
        trackSignup(formData.email, formData.fullName, formData.mobile, 75, false);
      }
      
      setStep('otp');
      setLoading(false);
      setRedirecting(false);
    }
    // Don't reset loading on success - let redirect happen immediately
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || !formData) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${serverUrl}/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({ phone: formData.mobile })
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

  // FORM VIEW
  if (step === 'form') {
    return (
      <div className="min-h-screen bg-black flex">
        <SEO {...SEO_CONFIGS.register} />
        {/* Left Side - Branding & Features */}
        <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col p-12 relative overflow-hidden">
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
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex items-center gap-3 mb-16"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">IndexpilotAI</h1>
                <p className="text-sm text-slate-400">Indian Options Trading</p>
              </div>
            </motion.div>

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

        {/* Right Side - Registration Form */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-slate-950 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-md my-8"
          >
            <button
              onClick={onBackToHome}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm">Back to Home</span>
            </button>

            <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
              <div className="mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">Create Your Account</h2>
                <p className="text-slate-400">Join IndexpilotAI and start your trading journey</p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-slate-300 flex items-center gap-2 text-sm">
                    <User className="h-4 w-4" />
                    Full Name
                  </Label>
                  <Input
                    id="fullName"
                    {...form.register('fullName')}
                    placeholder="Enter your full name"
                    className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-600 h-11 focus:border-cyan-500 transition-colors"
                    onChange={handleFormInteraction}
                  />
                  {form.formState.errors.fullName && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300 flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4" />
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...form.register('email')}
                    placeholder="your.email@example.com"
                    className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-600 h-11 focus:border-cyan-500 transition-colors"
                    onChange={handleFormInteraction}
                  />
                  {form.formState.errors.email && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                {/* Mobile */}
                <div className="space-y-2">
                  <Label htmlFor="mobile" className="text-slate-300 flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4" />
                    Mobile Number
                  </Label>
                  <div className="flex gap-2">
                    <div className="bg-slate-900/80 border border-slate-700 rounded-md px-3 py-2 text-slate-400 flex items-center text-sm">
                      +91
                    </div>
                    <Input
                      id="mobile"
                      {...form.register('mobile')}
                      placeholder="9876543210"
                      maxLength={10}
                      className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-600 flex-1 h-11 focus:border-cyan-500 transition-colors"
                      onChange={handleFormInteraction}
                    />
                  </div>
                  {form.formState.errors.mobile && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.mobile.message}
                    </p>
                  )}
                </div>

                {/* State & City Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-slate-300 flex items-center gap-2 text-sm">
                      <Building className="h-4 w-4" />
                      State
                    </Label>
                    <Select onValueChange={(value) => form.setValue('state', value)}>
                      <SelectTrigger className="bg-slate-900/80 border-slate-700 text-white h-11 focus:border-cyan-500">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700 text-white max-h-64">
                        {INDIAN_STATES.map((state) => (
                          <SelectItem key={state} value={state} className="focus:bg-slate-800 focus:text-white">
                            {state}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.state && (
                      <p className="text-red-400 text-xs flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.state.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-slate-300 flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4" />
                      City
                    </Label>
                    <Input
                      id="city"
                      {...form.register('city')}
                      placeholder="Your city"
                      className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-600 h-11 focus:border-cyan-500 transition-colors"
                      onChange={handleFormInteraction}
                    />
                    {form.formState.errors.city && (
                      <p className="text-red-400 text-xs flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {form.formState.errors.city.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* Password */}
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
                      placeholder="Min. 8 characters"
                      className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-600 h-11 pr-12 focus:border-cyan-500 transition-colors"
                      onChange={handleFormInteraction}
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
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                {/* Terms */}
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="termsAccepted"
                    checked={form.watch('termsAccepted')}
                    onCheckedChange={(checked) => form.setValue('termsAccepted', checked as boolean)}
                    className="mt-1 border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                    onChange={handleFormInteraction}
                  />
                  <Label htmlFor="termsAccepted" className="text-sm text-slate-400 cursor-pointer leading-relaxed">
                    I agree to the <a href="#" className="text-cyan-400 hover:text-cyan-300">Terms and Conditions</a> and <a href="#" className="text-cyan-400 hover:text-cyan-300">Privacy Policy</a>
                  </Label>
                </div>
                {form.formState.errors.termsAccepted && (
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {form.formState.errors.termsAccepted.message}
                  </p>
                )}

                {/* Error/Success */}
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

                {/* Submit */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold h-11 text-base transition-all duration-200 shadow-lg shadow-cyan-500/20"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    'Continue to OTP Verification'
                  )}
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-slate-800">
                <div className="flex items-center justify-center gap-2 text-slate-500 text-xs">
                  <Shield className="h-3 w-3" />
                  <span>256-bit SSL encryption • Secured by Supabase</span>
                </div>
              </div>
            </div>

            <div className="lg:hidden mt-8 flex items-center justify-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">IndexpilotAI</h1>
                <p className="text-xs text-slate-400">Indian Options Trading</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // OTP VIEW
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md"
        >
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
            <div className="flex justify-center mb-6">
              <div className="bg-cyan-600/20 p-4 rounded-full">
                <Smartphone className="h-8 w-8 text-cyan-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-center text-white mb-2">
              Verify Your Mobile
            </h2>
            <p className="text-center text-slate-400 mb-6">
              Enter the 6-digit OTP sent to<br />
              <span className="text-white font-semibold">
                +91 {formData?.mobile}
              </span>
            </p>

            <div className="flex justify-center gap-2 mb-6">
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
                  className="w-12 h-14 text-center text-2xl font-bold bg-slate-900/80 border-2 border-slate-700 rounded-lg text-white focus:border-cyan-500 focus:outline-none transition-colors"
                />
              ))}
            </div>

            {error && (
              <Alert variant="destructive" className="bg-red-900/20 border-red-800 mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-900/20 border-green-800 text-green-400 mb-4">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => handleVerifyOtp()}
              disabled={loading || otp.some(digit => digit === '')}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold h-12 mb-4"
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

            <div className="text-center mb-4">
              {resendTimer > 0 ? (
                <p className="text-slate-400 text-sm">
                  Resend OTP in <span className="text-cyan-400 font-semibold">{resendTimer}s</span>
                </p>
              ) : (
                <button
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-cyan-400 hover:text-cyan-300 font-semibold text-sm disabled:opacity-50"
                >
                  Didn't receive OTP? Resend
                </button>
              )}
            </div>

            <Button
              variant="outline"
              onClick={() => {
                setStep('form');
                setOtp(['', '', '', '', '', '']);
                setError('');
              }}
              className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Form
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // VERIFYING VIEW
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-2xl p-12 shadow-2xl">
          <div className="flex flex-col items-center space-y-6">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="h-16 w-16 text-cyan-500" />
            </motion.div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-semibold text-white">
                Creating Your Account
              </h3>
              <p className="text-slate-400">
                Please wait while we set up your trading dashboard...
              </p>
            </div>
            {success && (
              <Alert className="bg-green-900/20 border-green-800 text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}