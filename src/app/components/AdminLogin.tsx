// @ts-nocheck
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
// NOTE: TOTP verification runs server-side; no otpauth client dependency needed here.
import { trackLogin } from '../hooks/useAnalyticsTracking';

interface AdminLoginProps {
  onLogin: (admin: AdminUser, accessToken?: string) => void;
  serverUrl: string;
  accessToken: string;
  onClose?: () => void;
  pressedHotkey?: string; // Track which hotkey was pressed to access login
}

// 🔒 SECURITY: Do NOT hardcode admin passwords or hotkey secrets here.
// The admin's password is validated server-side at /auth/admin-login only.
// This constant intentionally stores no password — the field is kept for
// AdminUser type shape compatibility and is never used for authentication.
const DEFAULT_ADMIN: AdminUser = {
  id: 'admin_001',
  email: 'airoboengin@smilykart.com',
  password: '', // never stored in client — validated server-side
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
    adminManagement: true,
  },
  hotkey: {
    windows: 'Control+Alt+GUHAN',
    mac: 'Meta+Alt+GUHAN',
  },
  twoFactorEnabled: false,
};

// Admin auth ALWAYS talks to Supabase edge functions directly, never through the
// custom api.indexpilotai.com proxy — that proxy caches an older /admin/login
// build that bypasses 2FA. Using the Supabase URL guarantees we hit the current
// deployed function.
const SUPABASE_FN_BASE =
  (import.meta as any).env?.VITE_SUPABASE_URL
    ? `${(import.meta as any).env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/make-server-c4d79cb7`
    : 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7';


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
  const [challengeToken, setChallengeToken] = useState<string>('');
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

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch(`${SUPABASE_FN_BASE}/admin/login`, {
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
        trackLogin(email, 'failed');
        return;
      }

      // Server no longer returns an access token here. It returns a
      // challengeToken that must be exchanged for a session at
      // /admin/2fa/verify AFTER a valid TOTP code is submitted.
      if (!data.challengeToken) {
        setError('Login response missing 2FA challenge');
        return;
      }
      setChallengeToken(data.challengeToken);

      // Set up a minimal admin shell for the 2FA screens. The real admin
      // profile (with access token) is returned by /admin/2fa/verify.
      const shellAdmin: AdminUser = {
        ...DEFAULT_ADMIN,
        email: email.trim().toLowerCase(),
      };
      setAdminData(shellAdmin);

      if (data.setupRequired) {
        // First-time enrollment: server generated the secret and returned
        // an otpauth URL. Render QR here for the user to scan.
        const secretBase32 = data.secretBase32 || '';
        setTotpSecret(secretBase32);
        if (data.otpauthUrl) {
          try {
            const qr = await QRCode.toDataURL(data.otpauthUrl);
            setQrCodeUrl(qr);
          } catch (qrErr) {
            console.error('QR generation failed', qrErr);
          }
        }
        setStep('2fa-setup');
      } else {
        // Already enrolled — go straight to verification. Client never
        // sees the enrolled TOTP secret.
        setTotpSecret('');
        setQrCodeUrl('');
        setStep('2fa-verify');
      }
    } catch (error: any) {
      console.error('Admin login error:', error);
      setError('Login failed. Please try again.');
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '');
    const singleDigit = digit.slice(-1);
    const newOtp = otpCode.split('');
    while (newOtp.length < 6) newOtp.push('');
    newOtp[index] = singleDigit;
    setOtpCode(newOtp.join(''));
    if (singleDigit && index < 5) {
      otpInputRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
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
      const paddedOtp = (pastedData + '      ').slice(0, 6);
      setOtpCode(paddedOtp);
      const nextIndex = Math.min(pastedData.length, 5);
      otpInputRefs[nextIndex].current?.focus();
    }
  };

  // Server-side 2FA verification. The client no longer validates the TOTP
  // code or holds the secret — both are checked in the edge function, and
  // the real Supabase access token is only issued after that check passes.
  const submit2faCode = async () => {
    if (!adminData) return;
    if (otpCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }
    if (!challengeToken) {
      setError('Session expired. Please log in again.');
      setStep('credentials');
      return;
    }

    try {
      const res = await fetch(`${SUPABASE_FN_BASE}/admin/2fa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ challengeToken, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.accessToken || !data.admin) {
        setError(data.message || 'Invalid verification code');
        setOtpCode('');
        otpInputRefs[0].current?.focus();
        return;
      }

      const updatedAdmin: AdminUser = {
        ...data.admin,
        uniqueCode: data.uniqueCode,
        lastLogin: Date.now(),
        status: 'online' as const,
        twoFactorEnabled: true,
      };

      trackLogin(updatedAdmin.email, 'success', updatedAdmin.id);
      onLogin(updatedAdmin, data.accessToken);
    } catch (err: any) {
      console.error('2FA verify error', err);
      setError('Verification failed. Please try again.');
    }
  };

  const handle2FASetupComplete = () => { void submit2faCode(); };
  const handle2FAVerify = () => { void submit2faCode(); };



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