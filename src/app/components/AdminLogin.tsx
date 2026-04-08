import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Shield, Key, Smartphone, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { AdminUser } from './AdminTypes';
import QRCode from 'qrcode';
import * as OTPAuth from 'otpauth';
import { trackLogin } from '../hooks/useAnalyticsTracking';

interface AdminLoginProps {
  onLogin: (admin: AdminUser, accessToken?: string) => void;
  serverUrl: string;
  accessToken: string;
  onClose?: () => void;
  pressedHotkey?: string; // Track which hotkey was pressed to access login
}

// Default admin account
const DEFAULT_ADMIN: AdminUser = {
  id: 'admin_001',
  email: 'airoboengin@smilykat.com',
  password: '9600727185Aa@',
  role: {
    dashboard: true,
    users: true,
    transactions: true,
    instruments: true,
    journals: true,
    settings: true,
    support: true,
    landing: true,
    adminUsers: true,
    adminManagement: true, // Full admin access including admin management
  },
  hotkey: {
    windows: 'Control+Alt+GUHAN',
    mac: 'Meta+Alt+GUHAN',
  },
  twoFactorEnabled: false,
};

export function AdminLogin({ onLogin, serverUrl, accessToken, onClose, pressedHotkey }: AdminLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'credentials' | '2fa-setup' | '2fa-verify'>('credentials');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [adminData, setAdminData] = useState<AdminUser | null>(null);
  const [showHotkeyHint, setShowHotkeyHint] = useState(false);
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  
  const otpInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Generate 2FA QR code
  const generate2FASetup = async (admin: AdminUser) => {
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'IndexpilotAI',
      label: admin.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });

    const otpauthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    
    setQrCodeUrl(qrCode);
    setTotpSecret(secret.base32);
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Authenticate with backend to get real JWT token
    try {
      const response = await fetch(`${serverUrl}/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || 'Invalid email or password');
        
        // 📊 Track failed admin login
        trackLogin(email, 'failed');
        
        // Log failed login attempt
        if (typeof (window as any).logAdminActivity === 'function') {
          (window as any).logAdminActivity({
            adminId: 'unknown',
            adminEmail: email,
            action: 'login',
            target: 'admin_panel',
            details: `Failed login attempt for ${email}`,
            status: 'offline',
            ipAddress: 'N/A',
            userAgent: navigator.userAgent,
          });
        }
        return;
      }

      // ⚡ CRITICAL SECURITY CHECK: Validate hotkey matches admin's hotkey
      if (pressedHotkey) {
        const adminHotkeys = [
          data.admin.hotkey.windows.split('+').pop()?.toUpperCase(),
          data.admin.hotkey.mac.split('+').pop()?.toUpperCase()
        ];
        
        const pressedHotkeyUpperCase = pressedHotkey.toUpperCase();
        const hotkeyMatches = adminHotkeys.includes(pressedHotkeyUpperCase);
        
        if (!hotkeyMatches) {
          setError('Security Error: Hotkey does not match credentials. Access denied.');
          console.error(`🔒 Security: Hotkey mismatch! Pressed: ${pressedHotkey}, Expected: ${adminHotkeys.join(' or ')}`);
          
          // Log failed login attempt due to hotkey mismatch
          if (typeof (window as any).logAdminActivity === 'function') {
            (window as any).logAdminActivity({
              adminId: 'unknown',
              adminEmail: email,
              action: 'login',
              target: 'admin_panel',
              details: `Failed login: Hotkey mismatch for ${email}`,
              status: 'offline',
              ipAddress: 'N/A',
              userAgent: navigator.userAgent,
            });
          }
          return;
        }
        
        console.log(`✅ Hotkey validation passed for ${email}`);
      }

      // Store admin data with the real access token and unique code
      const adminWithToken = {
        ...data.admin,
        realAccessToken: data.accessToken, // Store the real JWT token
        uniqueCode: data.uniqueCode, // Store unique code for this session
      };
      
      // NOTE: Do NOT store unique code here - AdminRoute handles this
      // The URL unique code is the source of truth, not the backend response
      
      setAdminData(adminWithToken);
      
      // ⚡ CHECK IF 2FA IS ALREADY SAVED (FOR ALL ADMINS)
      const isDefaultAdmin = adminWithToken.email === 'airoboengin@smilykat.com';
      
      if (isDefaultAdmin) {
        // 👑 DEFAULT ADMIN: Check server KV first, then localStorage
        let saved2FA = '';
        try {
          const kvRes = await fetch(`${serverUrl}/auth/admin-2fa-secret?adminEmail=${encodeURIComponent(adminWithToken.email)}`);
          if (kvRes.ok) {
            const kvData = await kvRes.json();
            if (kvData.exists && kvData.secret) {
              saved2FA = kvData.secret;
              // Sync to localStorage as cache
              localStorage.setItem('default_admin_2fa', saved2FA);
              console.log('✅ Default admin 2FA loaded from server KV');
            }
          }
        } catch {}
        // Fallback to localStorage
        if (!saved2FA) saved2FA = localStorage.getItem('default_admin_2fa') || '';

        if (saved2FA) {
          console.log('✅ Default admin 2FA found - skipping setup, going to verification');
          setTotpSecret(saved2FA);
          setStep('2fa-verify');
        } else {
          console.log('🔐 Default admin: No saved 2FA - generating fresh setup');
          await generate2FASetup(adminWithToken);
          setStep('2fa-setup');
        }
      } else {
        // 👤 OTHER ADMINS: Check if 2FA secret exists in admin user data
        const storedAdmins = JSON.parse(localStorage.getItem('admin_users') || '[]');
        const adminData = storedAdmins.find((a: AdminUser) => a.id === adminWithToken.id);
        
        if (adminData?.twoFactorSecret) {
          // 2FA already set up - go directly to verification
          setTotpSecret(adminData.twoFactorSecret);
          setStep('2fa-verify');
        } else {
          // First time login for this admin - setup 2FA
          await generate2FASetup(adminWithToken);
          setStep('2fa-setup');
        }
      }
      return;
    } catch (error: any) {
      console.error('Admin login error:', error);
      setError('Login failed. Please try again.');
      
      // Log failed login attempt
      if (typeof (window as any).logAdminActivity === 'function') {
        (window as any).logAdminActivity({
          adminId: 'unknown',
          adminEmail: email,
          action: 'login',
          target: 'admin_panel',
          details: `Login error for ${email}: ${error.message}`,
          status: 'offline',
          ipAddress: 'N/A',
          userAgent: navigator.userAgent,
        });
      }
      return;
    }

    // Check localStorage for other admins
    const admins = JSON.parse(localStorage.getItem('admin_users') || '[]');
    const admin = admins.find((a: AdminUser) => a.email === email && a.password === password);

    if (admin) {
      setAdminData(admin);
      
      // Check if this admin has 2FA secret
      if (admin.twoFactorSecret) {
        // 2FA already set up - go directly to verification
        setStep('2fa-verify');
      } else {
        // First time login - setup 2FA
        await generate2FASetup(admin);
        setStep('2fa-setup');
      }
    } else {
      setError('Invalid email or password');
      
      // Log failed login attempt
      if (typeof (window as any).logAdminActivity === 'function') {
        (window as any).logAdminActivity({
          adminId: 'unknown',
          adminEmail: email,
          action: 'login',
          target: 'admin_panel',
          details: `Failed login attempt for ${email}`,
          status: 'offline',
          ipAddress: 'N/A',
          userAgent: navigator.userAgent,
        });
      }
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '');
    
    // Take only the last character if multiple (when user types fast)
    const singleDigit = digit.slice(-1);

    const newOtp = otpCode.split('');
    while (newOtp.length < 6) newOtp.push(''); // Ensure 6 elements
    newOtp[index] = singleDigit;
    setOtpCode(newOtp.join(''));

    // Auto-focus next box if we entered a digit
    if (singleDigit && index < 5) {
      otpInputRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Handle backspace - move to previous box if current is empty
    if (e.key === 'Backspace') {
      const currentOtp = otpCode.split('');
      if (!currentOtp[index] && index > 0) {
        otpInputRefs[index - 1].current?.focus();
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    
    if (pastedData) {
      // Pad with empty strings to ensure 6 characters
      const paddedOtp = (pastedData + '      ').slice(0, 6);
      setOtpCode(paddedOtp);
      
      // Focus the last filled box or the next empty box
      const nextIndex = Math.min(pastedData.length, 5);
      otpInputRefs[nextIndex].current?.focus();
    }
  };

  const verify2FA = (code: string, secret: string): boolean => {
    try {
      const totp = new OTPAuth.TOTP({
        issuer: 'AI Trading Platform',
        label: adminData?.email || '',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      const delta = totp.validate({ token: code, window: 1 });
      return delta !== null;
    } catch (err) {
      console.error('2FA verification error:', err);
      return false;
    }
  };

  const handle2FASetupComplete = () => {
    if (!adminData) return;
    
    if (otpCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    const isValid = verify2FA(otpCode, totpSecret);
    
    if (!isValid) {
      setError('Invalid verification code');
      return;
    }

    // Save 2FA secret to localStorage + server KV (for default admin)
    if (adminData.email === DEFAULT_ADMIN.email) {
      localStorage.setItem('default_admin_2fa', totpSecret);
      // Persist to server KV so it survives deploys
      fetch(`${serverUrl}/auth/admin-2fa-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminEmail: adminData.email, secret: totpSecret }),
      }).catch(() => {});
      console.log('✅ Default admin 2FA setup complete - Secret SAVED to localStorage + server KV');
    } else {
      const admins = JSON.parse(localStorage.getItem('admin_users') || '[]');
      const index = admins.findIndex((a: AdminUser) => a.id === adminData.id);
      if (index !== -1) {
        admins[index] = updatedAdmin;
        localStorage.setItem('admin_users', JSON.stringify(admins));
      }
    }

    const updatedAdmin = {
      ...adminData,
      twoFactorSecret: totpSecret,
      twoFactorEnabled: true,
      lastLogin: Date.now(),
      status: 'online' as const,
    };

    // Log successful login
    if (typeof (window as any).logAdminActivity === 'function') {
      (window as any).logAdminActivity({
        adminId: updatedAdmin.id,
        adminEmail: updatedAdmin.email,
        action: 'login',
        target: 'admin_panel',
        details: `${updatedAdmin.email} logged in successfully (2FA setup completed)`,
        status: 'online',
        ipAddress: 'N/A',
        userAgent: navigator.userAgent,
      });
    }

    // 📊 Track successful admin login
    trackLogin(updatedAdmin.email, 'success', updatedAdmin.id);

    // Pass the real access token back to parent
    onLogin(updatedAdmin, (adminData as any).realAccessToken);
  };

  const handle2FAVerify = () => {
    if (!adminData) return;
    
    if (otpCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    const secret = adminData.email === DEFAULT_ADMIN.email
      ? localStorage.getItem('default_admin_2fa') || ''
      : adminData.twoFactorSecret || '';

    const isValid = verify2FA(otpCode, secret);
    
    if (!isValid) {
      setError('Invalid verification code');
      setOtpCode('');
      otpInputRefs[0].current?.focus();
      
      // Log failed 2FA attempt
      if (typeof (window as any).logAdminActivity === 'function') {
        (window as any).logAdminActivity({
          adminId: adminData.id,
          adminEmail: adminData.email,
          action: 'login',
          target: 'admin_panel',
          details: `Failed 2FA verification for ${adminData.email}`,
          status: 'offline',
          ipAddress: 'N/A',
          userAgent: navigator.userAgent,
        });
      }
      return;
    }

    // Update admin with login info
    const updatedAdmin = {
      ...adminData,
      lastLogin: Date.now(),
      status: 'online' as const,
    };

    // Update localStorage
    if (adminData.email === DEFAULT_ADMIN.email) {
      // Default admin doesn't get stored in admin_users array
    } else {
      const admins = JSON.parse(localStorage.getItem('admin_users') || '[]');
      const index = admins.findIndex((a: AdminUser) => a.id === adminData.id);
      if (index !== -1) {
        admins[index] = updatedAdmin;
        localStorage.setItem('admin_users', JSON.stringify(admins));
      }
    }

    // Log successful login
    if (typeof (window as any).logAdminActivity === 'function') {
      (window as any).logAdminActivity({
        adminId: updatedAdmin.id,
        adminEmail: updatedAdmin.email,
        action: 'login',
        target: 'admin_panel',
        details: `${updatedAdmin.email} logged in successfully`,
        status: 'online',
        ipAddress: 'N/A',
        userAgent: navigator.userAgent,
      });
    }

    // 📊 Track successful admin login
    trackLogin(updatedAdmin.email, 'success', updatedAdmin.id);

    // Pass the real access token back to parent
    onLogin(updatedAdmin, (adminData as any).realAccessToken);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {/* Hotkey Hint */}
        {showHotkeyHint && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 right-4 z-50"
          >
            <Card className="bg-green-500/10 border-green-500">
              <CardContent className="p-4 flex items-center gap-2">
                <CheckCircle className="size-5 text-green-400" />
                <span className="text-green-400">Hotkey recognized! Auto-filled credentials</span>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === 'credentials' && (
          <motion.div
            key="credentials"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md"
          >
            <Card className="border-blue-500/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
              <CardHeader className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="mx-auto mb-4 size-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"
                >
                  <Shield className="size-10 text-white" />
                </motion.div>
                <CardTitle className="text-2xl text-white">Admin Portal</CardTitle>
                <CardDescription className="text-slate-400">
                  Secure access to IndexpilotAI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-slate-300">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@example.com"
                      className="bg-slate-800 border-slate-700 text-white"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-slate-300">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="bg-slate-800 border-slate-700 text-white pr-10"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm"
                    >
                      <AlertCircle className="size-4" />
                      {error}
                    </motion.div>
                  )}

                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    <Key className="size-4 mr-2" />
                    Continue
                  </Button>
                </form>

                <div className="mt-6 p-3 rounded bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-300 mb-2">💡 Hotkey Access:</p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      Windows: Ctrl + Alt + G
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Mac: Cmd + Option + G
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === '2fa-setup' && (
          <motion.div
            key="2fa-setup"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full max-w-md"
          >
            <Card className="border-blue-500/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl max-h-[90vh] flex flex-col">
              <CardHeader className="text-center flex-shrink-0">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="mx-auto mb-4 size-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center"
                >
                  <Smartphone className="size-10 text-white" />
                </motion.div>
                <CardTitle className="text-2xl text-white">Setup 2FA</CardTitle>
                <CardDescription className="text-slate-400">
                  Scan QR code with Google Authenticator
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 overflow-y-auto flex-1 px-6">
                {/* ⚠️ AUTO-RESET NOTICE for Default Admin */}
                {adminData?.email === 'airoboengin@smilykat.com' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-2 border-amber-500/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">🔄</div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-amber-400 mb-1">
                          Auto-Reset 2FA (Fresh QR Code)
                        </p>
                        <p className="text-xs text-amber-200">
                          This is a NEW QR code generated for this deployment. Your old codes won't work. Scan this fresh QR code with your authenticator app.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                <div className="bg-white p-4 rounded-lg">
                  {qrCodeUrl && (
                    <motion.img
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      src={qrCodeUrl}
                      alt="2FA QR Code"
                      className="mx-auto"
                    />
                  )}
                </div>

                <div className="p-3 rounded bg-slate-800 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-2">Manual Entry Code:</p>
                  <code className="text-sm text-green-400 font-mono break-all">{totpSecret}</code>
                </div>

                {adminData?.uniqueCode && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-2 border-yellow-500/50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Key className="size-5 text-yellow-500" />
                      <p className="text-sm font-semibold text-yellow-400">Your Unique Admin Code</p>
                    </div>
                    <code className="text-xl font-mono font-bold text-yellow-300 tracking-wider block text-center bg-slate-900/50 p-3 rounded">
                      {adminData.uniqueCode}
                    </code>
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      🔒 Save this code! You'll need it to access admin pages. This code is unique to this login session.
                    </p>
                  </motion.div>
                )}

                <div className="space-y-2">
                  <Label className="text-slate-300">Enter 6-digit code to verify</Label>
                  <div className="flex gap-2 justify-center">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <Input
                        key={index}
                        ref={otpInputRefs[index]}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={otpCode[index] || ''}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={(e) => handleOtpPaste(e)}
                        className="w-12 h-12 text-center text-xl bg-slate-800 border-slate-700 text-white"
                      />
                    ))}
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm"
                  >
                    <AlertCircle className="size-4" />
                    {error}
                  </motion.div>
                )}

                <Button
                  onClick={handle2FASetupComplete}
                  disabled={otpCode.length !== 6}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                >
                  <CheckCircle className="size-4 mr-2" />
                  Complete Setup
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === '2fa-verify' && (
          <motion.div
            key="2fa-verify"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="w-full max-w-md"
          >
            <Card className="border-blue-500/20 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
              <CardHeader className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="mx-auto mb-4 size-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center"
                >
                  <Smartphone className="size-10 text-white" />
                </motion.div>
                <CardTitle className="text-2xl text-white">Two-Factor Authentication</CardTitle>
                <CardDescription className="text-slate-400">
                  Enter code from Google Authenticator
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">6-digit code</Label>
                  <div className="flex gap-2 justify-center">
                    {[0, 1, 2, 3, 4, 5].map((index) => (
                      <Input
                        key={index}
                        ref={otpInputRefs[index]}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={otpCode[index] || ''}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        onPaste={(e) => handleOtpPaste(e)}
                        className="w-12 h-12 text-center text-xl bg-slate-800 border-slate-700 text-white"
                        autoFocus={index === 0}
                      />
                    ))}
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400 text-sm"
                  >
                    <AlertCircle className="size-4" />
                    {error}
                  </motion.div>
                )}

                <Button
                  onClick={handle2FAVerify}
                  disabled={otpCode.length !== 6}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  <CheckCircle className="size-4 mr-2" />
                  Verify & Login
                </Button>

                <Button
                  onClick={() => {
                    setStep('credentials');
                    setOtpCode('');
                    setError('');
                  }}
                  variant="outline"
                  className="w-full"
                >
                  Back
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AdminLogin;