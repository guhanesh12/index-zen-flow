import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminSecurityPanel } from './AdminSecurityPanel';
import { AdvancedMonitoring } from './AdvancedMonitoring';
import { AdminPushNotifications } from './AdminPushNotifications';
import { SystemHealth } from './SystemHealth';
import { BrevoIntegration } from './BrevoIntegration';
import { BackendConfiguration } from './BackendConfiguration';
import { toast } from 'sonner';
import type { AdminUser } from './AdminTypes';
import QRCode from 'qrcode';
import * as OTPAuth from 'otpauth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Settings, Smartphone, AlertCircle, Bell, CheckCircle, Activity,
  Eye, EyeOff, Key, Mail, MessageSquare, Server, Shield, UserPlus
} from 'lucide-react';

interface PlatformSettings {
  twoFactorApiKey: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  openaiApiKey: string;
  firebaseConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    messagingSenderId: string;
    appId: string;
  };
  smtpConfig: {
    host: string;
    port: string;
    username: string;
    password: string;
  };
  chatGPTEnabled: boolean;
}

interface AdminSettingsProps {
  serverUrl: string;
  accessToken: string;
  currentAdmin: AdminUser;
  onAdminUpdate: (admin: AdminUser) => void;
}

export function AdminSettings({ serverUrl, accessToken, currentAdmin, onAdminUpdate }: AdminSettingsProps) {
  const [settings, setSettings] = useState<PlatformSettings>({
    twoFactorApiKey: '',
    razorpayKeyId: '',
    razorpayKeySecret: '',
    openaiApiKey: '',
    firebaseConfig: {
      apiKey: '',
      authDomain: '',
      projectId: '',
      messagingSenderId: '',
      appId: '',
    },
    smtpConfig: {
      host: '',
      port: '',
      username: '',
      password: '',
    },
    chatGPTEnabled: true,
  });

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    email: '',
    password: '',
    hotkeyWindows: 'Control+Alt+',
    hotkeyMac: 'Meta+Alt+',
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
  });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [hotkeyError, setHotkeyError] = useState<string>('');
  const [verifyingHotkey, setVerifyingHotkey] = useState(false);
  const [verifiedHotkey, setVerifiedHotkey] = useState<string>('');

  // Define all available tabs
  const availableTabs = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'users', label: 'Users', icon: '👥' },
    { key: 'transactions', label: 'Transactions', icon: '💰' },
    { key: 'instruments', label: 'Instruments', icon: '📈' },
    { key: 'journals', label: 'Journals', icon: '📝' },
    { key: 'support', label: 'Support', icon: '💬' },
    { key: 'landing', label: 'Landing Page', icon: '🌐' },
    { key: 'settings', label: 'Settings', icon: '⚙️' },
    { key: 'adminUsers', label: 'Admin Users', icon: '👨‍💼' },
  ];

  useEffect(() => {
    loadSettings();
    loadAdmins();
  }, []);

  const loadSettings = async () => {
    try {
      // Fetch settings from backend
      const response = await fetch(`${serverUrl}/platform/settings`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.settings) {
          // Update settings with masked values from backend
          setSettings(prev => ({
            ...prev,
            twoFactorApiKey: data.settings.twoFactorApiKey || '',
            razorpayKeyId: data.settings.razorpayKeyId || '',
            razorpayKeySecret: data.settings.razorpayKeySecret || '',
            openaiApiKey: data.settings.openaiApiKey || '',
          }));
          console.log('✅ Settings loaded successfully from backend');
        }
      } else if (response.status === 403 || response.status === 401) {
        // Silently handle 401/403 - token may not be valid for admin operations
        // Settings will use local values which is fine for admin panel
        console.log('ℹ️ Using local settings for admin panel');
      } else {
        const errorText = await response.text();
        console.warn('Could not load settings from backend:', response.status, errorText);
      }
    } catch (error) {
      console.log('ℹ️ Using local settings for admin panel');
      // Settings will remain with default empty values - this is OK
    }
  };

  const loadAdmins = () => {
    const stored = localStorage.getItem('admin_users') || '[]';
    setAdmins(JSON.parse(stored));
  };

  const saveSettings = () => {
    localStorage.setItem('platform_settings', JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset2FA = async () => {
    // Generate new 2FA secret FOR CURRENT ADMIN ONLY
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'IndexpilotAI',
      label: currentAdmin.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: secret,
    });

    const otpauthUrl = totp.toString();
    const qrCode = await QRCode.toDataURL(otpauthUrl);
    
    setQrCodeUrl(qrCode);
    setTotpSecret(secret.base32);
    setShow2FADialog(true);
  };

  const handleReset2FAForUser = async (admin: AdminUser) => {
    // Generate new 2FA secret for SPECIFIC admin
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
    setSelectedUser(admin);
    setShow2FADialog(true);
  };

  const handleSaveNew2FA = () => {
    // Save new secret to localStorage for specific user
    const userToUpdate = selectedUser || currentAdmin;
    
    if (userToUpdate.email === 'airoboengin@smilykat.com') {
      localStorage.setItem('default_admin_2fa', totpSecret);
    } else {
      const stored = JSON.parse(localStorage.getItem('admin_users') || '[]');
      const index = stored.findIndex((a: AdminUser) => a.id === userToUpdate.id);
      if (index !== -1) {
        stored[index].twoFactorSecret = totpSecret;
        stored[index].twoFactorEnabled = true;
        localStorage.setItem('admin_users', JSON.stringify(stored));
      }
    }
    
    setShow2FADialog(false);
    setSelectedUser(null);
    loadAdmins(); // Refresh admin list
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddAdmin = () => {
    if (!newAdmin.email || !newAdmin.password) {
      alert('Please fill all required fields');
      return;
    }

    // Validate hotkey uniqueness
    const defaultHotkey = { windows: 'Control+Alt+GUHAN', mac: 'Meta+Alt+GUHAN' };
    const allAdmins = [
      { hotkey: defaultHotkey },
      ...admins
    ];

    const hotkeyExists = allAdmins.some(
      admin => admin.hotkey.windows === newAdmin.hotkeyWindows || 
               admin.hotkey.mac === newAdmin.hotkeyMac
    );

    if (hotkeyExists) {
      setHotkeyError('This hotkey is already in use by another admin. Please choose a unique hotkey.');
      return;
    }

    setHotkeyError('');

    const admin: AdminUser = {
      id: `admin_${Date.now()}`,
      email: newAdmin.email,
      password: newAdmin.password,
      role: newAdmin.role,
      hotkey: {
        windows: newAdmin.hotkeyWindows,
        mac: newAdmin.hotkeyMac,
      },
      twoFactorEnabled: false,
    };

    const updated = [...admins, admin];
    localStorage.setItem('admin_users', JSON.stringify(updated));
    setAdmins(updated);
    setShowAddAdmin(false);
    setNewAdmin({
      email: '',
      password: '',
      hotkeyWindows: 'Control+Alt+',
      hotkeyMac: 'Meta+Alt+',
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
    });
  };

  const handleVerifyHotkey = () => {
    // Check if entered hotkeys are unique (no need to press keys)
    setHotkeyError('');
    setVerifiedHotkey('');
    
    const windowsHotkey = newAdmin.hotkeyWindows.trim();
    const macHotkey = newAdmin.hotkeyMac.trim();
    
    if (!windowsHotkey || !macHotkey) {
      setHotkeyError('⚠️ Please enter both Windows and Mac hotkeys before verifying');
      return;
    }
    
    // Check if hotkey is unique
    const defaultHotkey = { windows: 'Control+Alt+GUHAN', mac: 'Meta+Alt+GUHAN' };
    const allAdmins = [
      { hotkey: defaultHotkey },
      ...admins
    ];

    const hotkeyExists = allAdmins.some(
      admin => admin.hotkey.windows === windowsHotkey || admin.hotkey.mac === macHotkey
    );

    if (hotkeyExists) {
      setHotkeyError(`❌ This hotkey is already in use by another admin!`);
      setVerifiedHotkey('');
    } else {
      setHotkeyError('');
      setVerifiedHotkey(`✅ Hotkeys are available and unique!`);
    }
  };

  const handleDeleteAdmin = (id: string) => {
    if (confirm('Are you sure you want to delete this admin?')) {
      const updated = admins.filter(a => a.id !== id);
      localStorage.setItem('admin_users', JSON.stringify(updated));
      setAdmins(updated);
    }
  };

  const togglePassword = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="size-6 text-blue-400" />
            Platform Settings
          </h2>
          <p className="text-slate-400">Configure system-wide settings and integrations</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleReset2FA} variant="outline" className="border-purple-500/30 hover:bg-purple-500/10">
            <Smartphone className="size-4 mr-2" />
            Reset 2FA
          </Button>
          {saved && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 text-green-400"
            >
              <CheckCircle className="size-5" />
              Settings saved!
            </motion.div>
          )}
        </div>
      </div>

      <Tabs defaultValue="api-keys" className="space-y-6">
        <TabsList className="bg-slate-800 border border-blue-500/20">
          <TabsTrigger value="api-keys">
            <Key className="size-4 mr-2" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="size-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="push-notifications">
            <MessageSquare className="size-4 mr-2" />
            Push Notifications
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="size-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="monitoring">
            <Activity className="size-4 mr-2" />
            Advanced Monitoring
          </TabsTrigger>
          <TabsTrigger value="system-health">
            <Activity className="size-4 mr-2" />
            System Health
          </TabsTrigger>
          <TabsTrigger value="backend">
            <Server className="size-4 mr-2" />
            Backend Config
          </TabsTrigger>
          <TabsTrigger value="brevo">
            <Mail className="size-4 mr-2" />
            Brevo Communications
          </TabsTrigger>
        </TabsList>

        {/* API Keys Tab */}
        <TabsContent value="api-keys" className="space-y-4">
          {/* Info Banner */}
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4"
          >
            <div className="flex items-start gap-3">
              <Shield className="size-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-1">Secure Environment Variables</h4>
                <p className="text-sm text-slate-300">
                  API keys are stored securely in environment variables for maximum security. 
                  Values shown here are masked and read-only. To update keys, modify your environment variables in the Supabase dashboard.
                </p>
              </div>
            </div>
          </motion.div>

          {/* 2Factor.in */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-purple-500/20 bg-slate-900/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Smartphone className="size-5 text-purple-400" />
                      2Factor.in API
                    </CardTitle>
                    <CardDescription>OTP service for authentication</CardDescription>
                  </div>
                  {settings.twoFactorApiKey && settings.twoFactorApiKey.includes('••••') ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <CheckCircle className="size-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      <AlertCircle className="size-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>API Key (Read-only - Set via Environment Variables)</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={settings.twoFactorApiKey || 'Not configured'}
                      readOnly
                      className="bg-slate-800/50 border-slate-700 text-slate-400 cursor-not-allowed"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    This key is stored securely in environment variables and cannot be edited from the UI.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Razorpay */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="border-blue-500/20 bg-slate-900/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="size-5 text-blue-400" />
                      Razorpay Integration
                    </CardTitle>
                    <CardDescription>Payment gateway configuration</CardDescription>
                  </div>
                  {settings.razorpayKeyId && settings.razorpayKeyId.includes('••••') ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <CheckCircle className="size-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      <AlertCircle className="size-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Key ID (Read-only)</Label>
                    <div className="relative">
                      <Input
                        type="text"
                        value={settings.razorpayKeyId || 'Not configured'}
                        readOnly
                        className="bg-slate-800/50 border-slate-700 text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Key Secret (Read-only)</Label>
                    <div className="relative">
                      <Input
                        type="text"
                        value={settings.razorpayKeySecret || 'Not configured'}
                        readOnly
                        className="bg-slate-800/50 border-slate-700 text-slate-400 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  These keys are stored securely in environment variables and cannot be edited from the UI.
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* ChatGPT/OpenAI */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-green-500/20 bg-slate-900/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="size-5 text-green-400" />
                      ChatGPT / OpenAI
                    </CardTitle>
                    <CardDescription>AI-powered features and analysis</CardDescription>
                  </div>
                  {settings.openaiApiKey && settings.openaiApiKey.includes('••••') ? (
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                      <CheckCircle className="size-3 mr-1" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                      <AlertCircle className="size-3 mr-1" />
                      Not Set
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>OpenAI API Key (Read-only)</Label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={settings.openaiApiKey || 'Not configured'}
                      readOnly
                      className="bg-slate-800/50 border-slate-700 text-slate-400 cursor-not-allowed"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    This key is stored securely in environment variables and cannot be edited from the UI.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="size-4 mr-2" />
              Save API Settings
            </Button>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          {/* Firebase */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-orange-500/20 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="size-5 text-orange-400" />
                  Firebase Cloud Messaging
                </CardTitle>
                <CardDescription>Push notifications configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>API Key</Label>
                    <Input
                      value={settings.firebaseConfig.apiKey}
                      onChange={(e) => setSettings({
                        ...settings,
                        firebaseConfig: { ...settings.firebaseConfig, apiKey: e.target.value }
                      })}
                      placeholder="AIza..."
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Project ID</Label>
                    <Input
                      value={settings.firebaseConfig.projectId}
                      onChange={(e) => setSettings({
                        ...settings,
                        firebaseConfig: { ...settings.firebaseConfig, projectId: e.target.value }
                      })}
                      placeholder="my-project-id"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Auth Domain</Label>
                    <Input
                      value={settings.firebaseConfig.authDomain}
                      onChange={(e) => setSettings({
                        ...settings,
                        firebaseConfig: { ...settings.firebaseConfig, authDomain: e.target.value }
                      })}
                      placeholder="project.firebaseapp.com"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Messaging Sender ID</Label>
                    <Input
                      value={settings.firebaseConfig.messagingSenderId}
                      onChange={(e) => setSettings({
                        ...settings,
                        firebaseConfig: { ...settings.firebaseConfig, messagingSenderId: e.target.value }
                      })}
                      placeholder="123456789"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label>App ID</Label>
                    <Input
                      value={settings.firebaseConfig.appId}
                      onChange={(e) => setSettings({
                        ...settings,
                        firebaseConfig: { ...settings.firebaseConfig, appId: e.target.value }
                      })}
                      placeholder="1:123:web:abc"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* SMTP */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-blue-500/20 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="size-5 text-blue-400" />
                  SMTP Configuration
                </CardTitle>
                <CardDescription>Email server settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>SMTP Host</Label>
                    <Input
                      value={settings.smtpConfig.host}
                      onChange={(e) => setSettings({
                        ...settings,
                        smtpConfig: { ...settings.smtpConfig, host: e.target.value }
                      })}
                      placeholder="smtp.gmail.com"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input
                      value={settings.smtpConfig.port}
                      onChange={(e) => setSettings({
                        ...settings,
                        smtpConfig: { ...settings.smtpConfig, port: e.target.value }
                      })}
                      placeholder="587"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Username</Label>
                    <Input
                      value={settings.smtpConfig.username}
                      onChange={(e) => setSettings({
                        ...settings,
                        smtpConfig: { ...settings.smtpConfig, username: e.target.value }
                      })}
                      placeholder="user@example.com"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <div className="relative">
                      <Input
                        type={showPasswords['smtp'] ? 'text' : 'password'}
                        value={settings.smtpConfig.password}
                        onChange={(e) => setSettings({
                          ...settings,
                          smtpConfig: { ...settings.smtpConfig, password: e.target.value }
                        })}
                        placeholder="Enter password"
                        className="bg-slate-800 border-slate-700 pr-10"
                      />
                      <button
                        onClick={() => togglePassword('smtp')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showPasswords['smtp'] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="flex justify-end">
            <Button onClick={saveSettings} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="size-4 mr-2" />
              Save Notification Settings
            </Button>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <AdminSecurityPanel />
        </TabsContent>

        {/* Push Notifications Tab */}
        <TabsContent value="push-notifications" className="space-y-4">
          <AdminPushNotifications serverUrl={serverUrl} accessToken={accessToken} />
        </TabsContent>

        {/* Monitoring Tab */}
        <TabsContent value="monitoring" className="space-y-4">
          <AdvancedMonitoring serverUrl={serverUrl} accessToken={accessToken} />
        </TabsContent>

        {/* System Health Tab */}
        <TabsContent value="system-health" className="space-y-4">
          <SystemHealth serverUrl={serverUrl} accessToken={accessToken} />
        </TabsContent>

        {/* Backend Config Tab */}
        <TabsContent value="backend" className="space-y-4">
          <BackendConfiguration serverUrl={serverUrl} accessToken={accessToken} />
        </TabsContent>

        {/* Brevo Communications Tab */}
        <TabsContent value="brevo" className="space-y-4">
          <BrevoIntegration serverUrl={serverUrl} accessToken={accessToken} />
        </TabsContent>
      </Tabs>

      {/* Add Admin Dialog */}
      <Dialog open={showAddAdmin} onOpenChange={setShowAddAdmin}>
        <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-blue-400" />
              Add New Admin
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new admin account with full dashboard access
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  placeholder="admin@example.com"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input
                  type="password"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  placeholder="Strong password"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Windows Hotkey</Label>
                <Input
                  value={newAdmin.hotkeyWindows}
                  onChange={(e) => setNewAdmin({ ...newAdmin, hotkeyWindows: e.target.value })}
                  placeholder="Control+Alt+KEY"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
              <div className="space-y-2">
                <Label>Mac Hotkey</Label>
                <Input
                  value={newAdmin.hotkeyMac}
                  onChange={(e) => setNewAdmin({ ...newAdmin, hotkeyMac: e.target.value })}
                  placeholder="Meta+Alt+KEY"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            {/* Verify Hotkey Button */}
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={handleVerifyHotkey}
                variant="outline"
                className="border-purple-500/30 hover:bg-purple-500/10 w-full"
                disabled={verifyingHotkey}
              >
                {verifyingHotkey ? (
                  <>
                    <Key className="size-4 mr-2 animate-pulse" />
                    Press your hotkey now... (Ctrl/Cmd + Alt + Key)
                  </>
                ) : (
                  <>
                    <Key className="size-4 mr-2" />
                    Verify Hotkey Uniqueness
                  </>
                )}
              </Button>
              
              {hotkeyError && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"
                >
                  <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{hotkeyError}</p>
                </motion.div>
              )}
              
              {verifiedHotkey && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center gap-2"
                >
                  <CheckCircle className="size-4 text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-400">{verifiedHotkey}</p>
                </motion.div>
              )}
            </div>

            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-sm">Permissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {availableTabs
                  .filter(tab => !['instruments', 'journals'].includes(tab.key)) // Exclude instruments and journals
                  .map(tab => (
                    <div key={tab.key} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                      <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer text-slate-200">
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                      </Label>
                      <Switch
                        checked={newAdmin.role[tab.key] || false}
                        onCheckedChange={(checked) =>
                          setNewAdmin({
                            ...newAdmin,
                            role: { ...newAdmin.role, [tab.key]: checked },
                          })
                        }
                        className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-slate-600"
                      />
                    </div>
                  ))}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button onClick={handleAddAdmin} className="flex-1 bg-blue-600 hover:bg-blue-700">
                <CheckCircle className="size-4 mr-2" />
                Add Administrator
              </Button>
              <Button onClick={() => setShowAddAdmin(false)} variant="outline">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2FA Dialog */}
      <Dialog open={show2FADialog} onOpenChange={setShow2FADialog}>
        <DialogContent className="bg-slate-900 border-blue-500/20 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="size-6 text-blue-400" />
              🔐 Set Up 2-Factor Authentication (2FA)
            </DialogTitle>
            <DialogDescription className="text-slate-300 text-base">
              {selectedUser ? `Setup 2FA for ${selectedUser.email}` : `Setup 2FA for ${currentAdmin.email}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* ⚠️ IMPORTANT NOTICE */}
            <div className="bg-amber-500/10 border-2 border-amber-500/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="text-amber-400 text-2xl">⚠️</div>
                <div className="flex-1">
                  <h3 className="text-amber-400 font-bold text-lg mb-2">IMPORTANT: Fresh 2FA Setup</h3>
                  <p className="text-amber-100 text-sm mb-2">
                    This is a <strong>NEW QR Code</strong> for this deployment. Your old authenticator codes will NOT work anymore.
                  </p>
                  <p className="text-amber-200 text-xs">
                    💡 After publishing to a new environment, you must scan this new QR code to get fresh 2FA codes.
                  </p>
                </div>
              </div>
            </div>

            {/* 📱 STEP-BY-STEP INSTRUCTIONS */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h3 className="text-blue-400 font-bold text-base mb-3 flex items-center gap-2">
                <Smartphone className="size-5" />
                📱 Setup Instructions
              </h3>
              <ol className="space-y-2 text-slate-300 text-sm">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-400 min-w-[24px]">1.</span>
                  <span>Open your <strong className="text-white">Google Authenticator</strong> or <strong className="text-white">Microsoft Authenticator</strong> app</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-400 min-w-[24px]">2.</span>
                  <span>Tap <strong className="text-white">"Add Account"</strong> or <strong className="text-white">"+"</strong> button</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-400 min-w-[24px]">3.</span>
                  <span>Select <strong className="text-white">"Scan QR Code"</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-400 min-w-[24px]">4.</span>
                  <span>Scan the QR code below with your phone camera</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-blue-400 min-w-[24px]">5.</span>
                  <span>Click <strong className="text-green-400">"Save 2FA"</strong> button below</span>
                </li>
              </ol>
            </div>

            {/* 📊 QR CODE - LARGER SIZE */}
            <div className="bg-white/5 border-2 border-blue-500/30 rounded-lg p-6">
              <div className="flex flex-col items-center gap-4">
                <h3 className="text-blue-400 font-bold text-lg">📊 Scan This QR Code</h3>
                <div className="bg-white p-4 rounded-lg">
                  <img src={qrCodeUrl} alt="2FA QR Code" className="w-64 h-64" />
                </div>
                
                {/* 🔑 SECRET KEY - For manual entry */}
                <div className="w-full bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">🔑 Manual Entry Key (if QR scan fails):</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-900 text-green-400 px-3 py-2 rounded font-mono text-sm break-all">
                      {totpSecret}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(totpSecret);
                        toast.success('Secret key copied to clipboard!');
                      }}
                      className="shrink-0"
                    >
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ ACTION BUTTONS */}
            <div className="flex gap-3">
              <Button 
                onClick={handleSaveNew2FA} 
                className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-6 text-lg font-bold"
              >
                <CheckCircle className="size-5 mr-2" />
                ✅ Save 2FA (I've Scanned the QR Code)
              </Button>
              <Button 
                onClick={() => setShow2FADialog(false)} 
                variant="outline"
                className="border-red-500/50 hover:bg-red-500/10 text-red-400 py-6"
              >
                Cancel
              </Button>
            </div>

            {/* 💡 HELPFUL TIP */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
              <p className="text-slate-400 text-xs">
                💡 <strong className="text-white">Tip:</strong> Save the secret key in a secure location. You can use it to manually add the account if QR scanning doesn't work.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}