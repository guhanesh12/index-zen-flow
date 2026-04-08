// @ts-nocheck
import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  User, Mail, Phone, MapPin, Globe, Building, 
  ArrowLeft, ArrowRight, Shield, CheckCircle2, 
  Loader2, AlertCircle, FileText 
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { motion } from 'motion/react';
import { projectId, publicAnonKey } from '@/utils-ext/supabase/info';
import { supabase } from '@/utils-ext/supabase/client';
import { getBaseUrl } from '../utils/apiService';

interface AdvancedRegistrationProps {
  onSuccess: () => void;
  onBackToLanding: () => void;
}

// Complete list of Indian states
const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

// Form validation schema
const registrationSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100, 'Full name is too long'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number (must start with 6-9 and be 10 digits)'),
  country: z.string().min(1, 'Country is required'),
  state: z.string().min(1, 'State is required'),
  city: z.string().min(2, 'City must be at least 2 characters').max(100, 'City name is too long'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(50, 'Password is too long'),
  termsAccepted: z.boolean().refine(val => val === true, 'You must accept the terms and conditions')
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function AdvancedRegistration({ onSuccess, onBackToLanding }: AdvancedRegistrationProps) {
  const [step, setStep] = useState<'form' | 'otp' | 'verifying'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [formData, setFormData] = useState<RegistrationFormData | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      country: 'India',
      termsAccepted: false
    }
  });

  const termsAccepted = watch('termsAccepted');

  // Resend OTP timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const onSubmit = async (data: RegistrationFormData) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Store form data for later use
      setFormData(data);

      // Send OTP via server
      const serverUrl = getBaseUrl();
      
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
      console.log('OTP sent:', result);

      setSuccess('OTP sent successfully to your mobile number');
      setStep('otp');
      setResendTimer(60); // 60 second cooldown
      
      // Auto-focus first OTP input
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);

    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are entered
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

    setError('');
    setLoading(true);
    setStep('verifying');

    try {
      if (!formData) throw new Error('Form data not found');

      // ✅ Verify OTP AND create account via backend (bypasses email rate limits)
      const serverUrl = getBaseUrl();
      
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

      // Show success message
      setSuccess('Account created successfully! Redirecting to dashboard...');
      
      // Wait 2 seconds then redirect
      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (err: any) {
      console.error('OTP verification error:', err);
      setError(err.message || 'OTP verification failed. Please try again.');
      setStep('otp');
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0 || !formData) return;

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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl"
        >
          <Card className="border-slate-700 bg-slate-900/90 backdrop-blur-xl shadow-2xl">
            <CardHeader className="space-y-1 pb-6">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBackToLanding}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Shield className="h-8 w-8 text-blue-500" />
              </div>
              <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Create Your Account
              </CardTitle>
              <CardDescription className="text-center text-slate-400 text-base">
                Join IndexpilotAI and start your trading journey
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-slate-300 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Full Name *
                  </Label>
                  <Input
                    id="fullName"
                    {...register('fullName')}
                    placeholder="Enter your full name"
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                  />
                  {errors.fullName && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.fullName.message}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Address *
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="your.email@example.com"
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                  />
                  {errors.email && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Mobile Number */}
                <div className="space-y-2">
                  <Label htmlFor="mobile" className="text-slate-300 flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Mobile Number *
                  </Label>
                  <div className="flex gap-2">
                    <div className="bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-slate-400 flex items-center">
                      +91
                    </div>
                    <Input
                      id="mobile"
                      {...register('mobile')}
                      placeholder="9876543210"
                      maxLength={10}
                      className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 flex-1"
                    />
                  </div>
                  {errors.mobile && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.mobile.message}
                    </p>
                  )}
                </div>

                {/* Country */}
                <div className="space-y-2">
                  <Label htmlFor="country" className="text-slate-300 flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    Country *
                  </Label>
                  <Input
                    id="country"
                    {...register('country')}
                    value="India"
                    disabled
                    className="bg-slate-800/30 border-slate-700 text-slate-400 cursor-not-allowed"
                  />
                </div>

                {/* State */}
                <div className="space-y-2">
                  <Label htmlFor="state" className="text-slate-300 flex items-center gap-2">
                    <Building className="h-4 w-4" />
                    State *
                  </Label>
                  <Select onValueChange={(value) => setValue('state', value)}>
                    <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white">
                      <SelectValue placeholder="Select your state" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 max-h-[300px]">
                      {INDIAN_STATES.map((state) => (
                        <SelectItem 
                          key={state} 
                          value={state}
                          className="text-white hover:bg-slate-700 focus:bg-slate-700"
                        >
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.state && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.state.message}
                    </p>
                  )}
                </div>

                {/* City */}
                <div className="space-y-2">
                  <Label htmlFor="city" className="text-slate-300 flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    City *
                  </Label>
                  <Input
                    id="city"
                    {...register('city')}
                    placeholder="Enter your city"
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                  />
                  {errors.city && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.city.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Password *
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    {...register('password')}
                    placeholder="Min. 8 characters"
                    className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500"
                  />
                  {errors.password && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Terms and Conditions */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="terms"
                      checked={termsAccepted}
                      onCheckedChange={(checked) => setValue('termsAccepted', checked as boolean)}
                      className="mt-1 border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <div className="space-y-1">
                      <Label
                        htmlFor="terms"
                        className="text-sm text-slate-300 cursor-pointer leading-relaxed"
                      >
                        I agree to the{' '}
                        <a href="#" className="text-blue-400 hover:text-blue-300 underline">
                          Terms and Conditions
                        </a>{' '}
                        and{' '}
                        <a href="#" className="text-blue-400 hover:text-blue-300 underline">
                          Privacy Policy
                        </a>
                      </Label>
                    </div>
                  </div>
                  {errors.termsAccepted && (
                    <p className="text-red-400 text-sm flex items-center gap-1 pl-7">
                      <AlertCircle className="h-3 w-3" />
                      {errors.termsAccepted.message}
                    </p>
                  )}
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
                  disabled={loading || !termsAccepted}
                  className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-6 text-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      Continue to OTP Verification
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="flex justify-center border-t border-slate-800 pt-6">
              <p className="text-sm text-slate-400">
                Already have an account?{' '}
                <button
                  onClick={onBackToLanding}
                  className="text-blue-400 hover:text-blue-300 font-semibold"
                >
                  Sign in
                </button>
              </p>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    );
  }

  // OTP VERIFICATION VIEW
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
                  <Phone className="h-8 w-8 text-blue-400" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-center text-white">
                Verify Your Mobile
              </CardTitle>
              <CardDescription className="text-center text-slate-400">
                Enter the 6-digit OTP sent to
                <br />
                <span className="text-white font-semibold">
                  +91 {formData?.mobile}
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
                  setStep('form');
                  setOtp(['', '', '', '', '', '']);
                  setError('');
                }}
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Form
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
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return null;
}