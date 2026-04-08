// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Shield, Key, Lock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface HotkeyVerificationModalProps {
  isOpen: boolean;
  onVerified: () => void;
  onCancel: () => void;
  pageName: string;
  serverUrl: string;
  accessToken?: string;
  requireUniqueCode?: boolean; // For admin pages that need unique codes
}

export function HotkeyVerificationModal({
  isOpen,
  onVerified,
  onCancel,
  pageName,
  serverUrl,
  accessToken,
  requireUniqueCode = false
}: HotkeyVerificationModalProps) {
  const [hotkey, setHotkey] = useState('');
  const [uniqueCode, setUniqueCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [step, setStep] = useState<'hotkey' | 'uniquecode'>('hotkey');
  const hotkeyInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHotkey('');
      setUniqueCode('');
      setError('');
      setStep('hotkey');
      setTimeout(() => {
        hotkeyInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleHotkeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotkey.trim()) {
      setError('Please enter your hotkey');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      // Verify hotkey with backend
      const response = await fetch(`${serverUrl}/admin/verify-hotkey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ 
          hotkey: hotkey.toUpperCase(),
          pageName 
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (requireUniqueCode) {
          // Move to unique code verification
          setStep('uniquecode');
          setTimeout(() => {
            codeInputRef.current?.focus();
          }, 100);
        } else {
          // Hotkey verified, grant access
          console.log(`✅ Hotkey verified for ${pageName}`);
          onVerified();
        }
      } else {
        setError(data.message || 'Invalid hotkey. Access denied.');
      }
    } catch (error) {
      console.error('Error verifying hotkey:', error);
      setError('Failed to verify hotkey. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleUniqueCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uniqueCode.trim()) {
      setError('Please enter the unique code');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      // Verify unique code with backend
      const response = await fetch(`${serverUrl}/admin/verify-unique-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ 
          uniqueCode: uniqueCode.trim(),
          hotkey: hotkey.toUpperCase(),
          pageName 
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log(`✅ Unique code verified for ${pageName}`);
        // Store verified session
        sessionStorage.setItem(`verified_${pageName}`, 'true');
        sessionStorage.setItem('admin_unique_code', uniqueCode.trim());
        onVerified();
      } else {
        setError(data.message || 'Invalid unique code. Access denied.');
      }
    } catch (error) {
      console.error('Error verifying unique code:', error);
      setError('Failed to verify unique code. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleBack = () => {
    setStep('hotkey');
    setError('');
    setUniqueCode('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[99999] p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-md"
      >
        <Card className="bg-slate-900 border-2 border-yellow-500/50 shadow-2xl shadow-yellow-500/20">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto p-3 bg-yellow-500/10 rounded-full w-fit mb-2">
              {step === 'hotkey' ? (
                <Shield className="size-8 text-yellow-500" />
              ) : (
                <Lock className="size-8 text-yellow-500" />
              )}
            </div>
            <CardTitle className="text-2xl font-bold text-white flex items-center justify-center gap-2">
              <Key className="size-5 text-yellow-500" />
              Security Verification Required
            </CardTitle>
            <CardDescription className="text-slate-400">
              {step === 'hotkey' 
                ? `Enter your admin hotkey to access: ${pageName}`
                : 'Enter your unique admin code to proceed'
              }
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <AnimatePresence mode="wait">
              {step === 'hotkey' ? (
                <motion.form
                  key="hotkey"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleHotkeySubmit}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <Label htmlFor="hotkey" className="text-slate-300 flex items-center gap-2">
                      <Key className="size-4" />
                      Admin Hotkey
                    </Label>
                    <Input
                      id="hotkey"
                      ref={hotkeyInputRef}
                      type="text"
                      value={hotkey}
                      onChange={(e) => setHotkey(e.target.value.toUpperCase())}
                      placeholder="Enter hotkey (e.g., GUHAN)"
                      className="bg-slate-800 border-slate-700 text-white text-lg font-mono tracking-wider text-center"
                      disabled={verifying}
                      autoComplete="off"
                      maxLength={20}
                    />
                    <p className="text-xs text-slate-500 text-center">
                      Enter the hotkey you use to access the admin panel
                    </p>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2"
                    >
                      <XCircle className="size-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{error}</p>
                    </motion.div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={onCancel}
                      variant="outline"
                      className="flex-1 bg-slate-800 border-slate-700 hover:bg-slate-700"
                      disabled={verifying}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold"
                      disabled={verifying || !hotkey.trim()}
                    >
                      {verifying ? (
                        <>
                          <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="size-4 mr-2" />
                          Verify Hotkey
                        </>
                      )}
                    </Button>
                  </div>
                </motion.form>
              ) : (
                <motion.form
                  key="uniquecode"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleUniqueCodeSubmit}
                  className="space-y-4"
                >
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="size-4 text-green-500" />
                      <p className="text-sm font-semibold text-green-400">Hotkey Verified</p>
                    </div>
                    <p className="text-xs text-slate-400">Now enter your unique admin code</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="uniquecode" className="text-slate-300 flex items-center gap-2">
                      <Lock className="size-4" />
                      Unique Admin Code
                    </Label>
                    <Input
                      id="uniquecode"
                      ref={codeInputRef}
                      type="text"
                      value={uniqueCode}
                      onChange={(e) => setUniqueCode(e.target.value.toUpperCase())}
                      placeholder="Enter unique code"
                      className="bg-slate-800 border-slate-700 text-white text-lg font-mono tracking-wider text-center"
                      disabled={verifying}
                      autoComplete="off"
                      maxLength={16}
                    />
                    <p className="text-xs text-slate-500 text-center">
                      Use the unique code generated during admin login
                    </p>
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-start gap-2"
                    >
                      <XCircle className="size-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{error}</p>
                    </motion.div>
                  )}

                  <div className="flex gap-3">
                    <Button
                      type="button"
                      onClick={handleBack}
                      variant="outline"
                      className="flex-1 bg-slate-800 border-slate-700 hover:bg-slate-700"
                      disabled={verifying}
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold"
                      disabled={verifying || !uniqueCode.trim()}
                    >
                      {verifying ? (
                        <>
                          <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="size-4 mr-2" />
                          Verify Code
                        </>
                      )}
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="pt-4 border-t border-slate-800">
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" />
                <p>
                  This page requires admin authentication. Unauthorized access attempts are logged.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
