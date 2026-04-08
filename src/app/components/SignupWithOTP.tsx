import { useState, useRef } from 'react';
import { Smartphone, ArrowRight, Shield, CheckCircle2, ArrowLeft, User, Mail } from 'lucide-react';
import { Button } from './ui/button';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { supabase } from '@/utils-ext/supabase/client';
import { getBaseUrl } from '../utils/apiService';

interface SignupWithOTPProps {
  onSuccess: () => void;
  onBackToLanding: () => void;
}

export default function SignupWithOTP({ onSuccess, onBackToLanding }: SignupWithOTPProps) {
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  
  // Create refs for OTP input boxes
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Validate inputs
      if (!name || !email || !phone || !password) {
        throw new Error('All fields are required');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      if (!/^[0-9]{10}$/.test(phone)) {
        throw new Error('Phone number must be 10 digits');
      }

      // 🔥 FIXED: Use 2factor.in API to send OTP
      const serverUrl = getBaseUrl();
      
      const response = await fetch(`${serverUrl}/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`, // 🔥 CRITICAL: Required for Edge Function access
        },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Show detailed error from server
        console.error('❌ Send OTP failed:', data);
        throw new Error(data.error || data.message || 'Failed to send OTP');
      }

      if (data.success) {
        setSuccess('OTP sent to your phone! Please check your messages.');
        setStep('otp');
      } else {
        throw new Error(data.error || 'Failed to send OTP. Please try again.');
      }
    } catch (err: any) {
      console.error('❌ Send OTP error:', err);
      setError(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!otp.every((digit) => digit) || otp.length !== 6) {
        throw new Error('Please enter a valid 6-digit OTP');
      }

      // 🔥 FIXED: Verify OTP using 2factor.in API
      const serverUrl = getBaseUrl();
      
      const response = await fetch(`${serverUrl}/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`, // 🔥 CRITICAL: Required for Edge Function access
        },
        body: JSON.stringify({
          phone,
          otp: otp.join(''),
          email,
          password,
          name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify OTP');
      }

      if (data.success && data.session) {
        console.log('✅ Account created! Session:', data.session);
        setSuccess('Account verified successfully! Redirecting...');
        
        // 🔥 CRITICAL: Store session in Supabase client
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError) {
          console.error('❌ Failed to set session:', sessionError);
          throw new Error('Failed to establish session. Please try signing in.');
        }

        console.log('✅ Session set successfully:', sessionData);
        
        // Initialize wallet with ₹0 balance
        const accessToken = data.session.access_token;
        
        try {
          await fetch(`${serverUrl}/wallet/initialize`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          });
          console.log('✅ Wallet initialized');
        } catch (err) {
          console.error('⚠️ Failed to initialize wallet:', err);
          // Don't block signup if wallet fails
        }

        // Give Supabase time to persist the session
        setTimeout(() => {
          console.log('🚀 Redirecting to dashboard...');
          onSuccess();
        }, 1000);
      } else {
        throw new Error('Failed to create account. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // 🔥 FIXED: Resend OTP using 2factor.in API
      const serverUrl = getBaseUrl();
      
      const response = await fetch(`${serverUrl}/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`, // 🔥 CRITICAL: Required for Edge Function access
        },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend OTP');
      }

      if (data.success) {
        setSuccess('OTP resent successfully!');
      } else {
        throw new Error('Failed to resend OTP. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpInputChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '');
    
    // Take only the last character if multiple (when user types fast)
    const singleDigit = digit.slice(-1);
    
    const newOtp = [...otp];
    newOtp[index] = singleDigit;
    setOtp(newOtp);

    // Auto-focus next box
    if (singleDigit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace - move to previous box
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    
    if (pastedData) {
      const newOtp = [...otp];
      for (let i = 0; i < pastedData.length && i < 6; i++) {
        newOtp[i] = pastedData[i];
      }
      setOtp(newOtp);
      
      // Focus the last filled box or the next empty box
      const nextIndex = Math.min(pastedData.length, 5);
      otpInputRefs.current[nextIndex]?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-xl shadow-blue-500/30">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Create Your Account</h1>
          <p className="text-slate-400">Start trading with AI-powered signals</p>
        </div>

        {/* Form Card */}
        <div className="bg-slate-800/50 backdrop-blur-lg p-8 rounded-2xl border border-slate-700 shadow-2xl">
          {/* Steps Indicator */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1">
              <div className={`h-2 rounded-full transition-all ${step === 'details' ? 'bg-blue-500' : 'bg-green-500'}`} />
              <div className="text-xs text-slate-400 mt-2">Account Details</div>
            </div>
            <div className="w-8" />
            <div className="flex-1">
              <div className={`h-2 rounded-full transition-all ${step === 'otp' ? 'bg-blue-500' : 'bg-slate-700'}`} />
              <div className="text-xs text-slate-400 mt-2">Verify OTP</div>
            </div>
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{success}</span>
            </div>
          )}

          {/* Step 1: Account Details */}
          {step === 'details' && (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="Enter your full name"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="your@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">Phone Number</label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <div className="absolute left-10 top-1/2 -translate-y-1/2 text-slate-400">+91</div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full pl-20 pr-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="9876543210"
                    required
                    maxLength={10}
                  />
                </div>
                <div className="text-xs text-slate-500 mt-1">OTP will be sent to this number</div>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center space-x-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{loading ? 'Sending OTP...' : 'Send OTP'}</span>
                {!loading && <ArrowRight className="w-5 h-5" />}
              </Button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Smartphone className="w-8 h-8 text-blue-400" />
                </div>
                <p className="text-slate-300">
                  We've sent a 6-digit OTP to
                </p>
                <p className="text-white font-semibold">+91 {phone}</p>
              </div>

              <div className="flex justify-center">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    type="text"
                    value={digit}
                    onChange={(e) => handleOtpInputChange(index, e.target.value)}
                    ref={(el) => otpInputRefs.current[index] = el}
                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    onPaste={handleOtpPaste}
                    className="w-10 h-10 mx-1 px-4 py-4 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-center text-2xl tracking-widest placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                    placeholder="0"
                    required
                    maxLength={1}
                  />
                ))}
              </div>

              <Button
                type="submit"
                disabled={loading || !otp.every((digit) => digit)}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg shadow-blue-500/30 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifying...' : 'Verify & Create Account'}
              </Button>

              <Button
                type="button"
                onClick={handleResendOTP}
                disabled={loading}
                className="w-full px-6 py-2 text-slate-400 hover:text-white transition-colors text-sm disabled:opacity-50"
              >
                Didn't receive OTP? Resend
              </Button>

              <Button
                type="button"
                onClick={() => setStep('details')}
                className="w-full px-6 py-2 text-slate-400 hover:text-white transition-colors text-sm"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Change Phone Number
              </Button>
            </form>
          )}

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-center text-sm text-slate-400">
              Already have an account?{' '}
              <button
                onClick={onBackToLanding}
                className="text-blue-400 hover:text-blue-300 transition-colors font-semibold"
              >
                Sign In
              </button>
            </p>
          </div>
        </div>

        {/* Trust Indicators */}
        <div className="mt-6 flex items-center justify-center space-x-4 text-slate-500 text-sm">
          <div className="flex items-center space-x-1">
            <Shield className="w-4 h-4" />
            <span>Secure</span>
          </div>
          <div>•</div>
          <div className="flex items-center space-x-1">
            <CheckCircle2 className="w-4 h-4" />
            <span>Verified</span>
          </div>
          <div>•</div>
          <div>256-bit Encrypted</div>
        </div>
      </div>
    </div>
  );
}