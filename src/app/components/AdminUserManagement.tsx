// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  UserPlus,
  Trash2,
  Edit,
  Save,
  X,
  Shield,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Key,
  Smartphone,
  Activity,
  RefreshCw,
  LogOut,
  Plus,
  Search,
  Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { AdminUser } from './AdminTypes';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import QRCode from 'qrcode';
import * as OTPAuth from 'otpauth';

interface AdminUserManagementProps {
  serverUrl: string;
  accessToken: string;
  currentAdmin: AdminUser;
}

export function AdminUserManagement({ serverUrl, accessToken, currentAdmin }: AdminUserManagementProps) {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [newAdmin, setNewAdmin] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    hotkeyWindows: 'Control+Alt+',
    hotkeyMac: 'Meta+Alt+',
    role: {
      dashboard: true,
      users: true,
      transactions: true,
      settings: true,
      support: true,
      landing: true,
      adminManagement: false, // New permission
    },
  });
  const [errors, setErrors] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    hotkey: '',
  });
  const [verifiedHotkey, setVerifiedHotkey] = useState('');
  const [show2FADialog, setShow2FADialog] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [selectedAdmin, setSelectedAdmin] = useState<AdminUser | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Available permissions
  const availablePermissions = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊', description: 'View main dashboard' },
    { key: 'users', label: 'Users', icon: '👥', description: 'Manage platform users' },
    { key: 'transactions', label: 'Transactions', icon: '💰', description: 'View and manage transactions' },
    { key: 'settings', label: 'Settings', icon: '⚙️', description: 'Configure platform settings' },
    { key: 'support', label: 'Support', icon: '💬', description: 'Handle support tickets' },
    { key: 'landing', label: 'Landing Page', icon: '🌐', description: 'Edit landing page content' },
    { key: 'adminManagement', label: 'Admin Management', icon: '👨‍💼', description: 'Create and manage admins' },
  ];

  useEffect(() => {
    loadAdmins();
  }, []);

  const loadAdmins = () => {
    const stored = localStorage.getItem('admin_users') || '[]';
    const parsed = JSON.parse(stored);
    
    // Add default admin
    const defaultAdmin: AdminUser = {
      id: 'default-admin',
      email: 'airoboengin@smilykat.com',
      password: 'defaultpass',
      role: {
        dashboard: true,
        users: true,
        transactions: true,
        settings: true,
        support: true,
        landing: true,
        adminManagement: true,
      },
      hotkey: {
        windows: 'Control+Alt+GUHAN',
        mac: 'Meta+Alt+GUHAN'
      },
      twoFactorEnabled: false
    };
    
    setAdmins([defaultAdmin, ...parsed]);
  };

  const validateForm = () => {
    const newErrors = {
      username: '',
      password: '',
      confirmPassword: '',
      hotkey: '',
    };
    let isValid = true;

    // Validate username (email format)
    if (!newAdmin.username) {
      newErrors.username = 'Username/Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newAdmin.username)) {
      newErrors.username = 'Please enter a valid email address';
      isValid = false;
    }

    // Check if email already exists
    const emailExists = admins.some(admin => admin.email === newAdmin.username);
    if (emailExists) {
      newErrors.username = 'This email is already registered as an admin';
      isValid = false;
    }

    // Validate password
    if (!newAdmin.password) {
      newErrors.password = 'Password is required';
      isValid = false;
    } else if (newAdmin.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
      isValid = false;
    }

    // Validate confirm password
    if (!newAdmin.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
      isValid = false;
    } else if (newAdmin.password !== newAdmin.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
      isValid = false;
    }

    // Validate hotkey
    if (!verifiedHotkey) {
      newErrors.hotkey = 'Please verify the hotkey before creating admin';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleVerifyHotkey = () => {
    setErrors({ ...errors, hotkey: '' });
    setVerifiedHotkey('');
    
    const windowsHotkey = newAdmin.hotkeyWindows.trim();
    const macHotkey = newAdmin.hotkeyMac.trim();
    
    if (!windowsHotkey || !macHotkey) {
      setErrors({ ...errors, hotkey: '⚠️ Please enter both Windows and Mac hotkeys' });
      return;
    }
    
    // Validate hotkey format
    if (!windowsHotkey.includes('Control+Alt+') && !windowsHotkey.includes('Ctrl+Alt+')) {
      setErrors({ ...errors, hotkey: '❌ Windows hotkey must start with Control+Alt+ or Ctrl+Alt+' });
      return;
    }
    
    if (!macHotkey.includes('Meta+Alt+') && !macHotkey.includes('Cmd+Alt+')) {
      setErrors({ ...errors, hotkey: '❌ Mac hotkey must start with Meta+Alt+ or Cmd+Alt+' });
      return;
    }
    
    // Check if hotkey is unique
    const hotkeyExists = admins.some(
      admin => admin.hotkey.windows === windowsHotkey || admin.hotkey.mac === macHotkey
    );

    if (hotkeyExists) {
      setErrors({ ...errors, hotkey: '❌ This hotkey is already in use by another admin!' });
      setVerifiedHotkey('');
    } else {
      setErrors({ ...errors, hotkey: '' });
      setVerifiedHotkey(`✅ Hotkey verified and available!`);
    }
  };

  const handleAddAdmin = async () => {
    if (!validateForm()) {
      return;
    }

    const admin: AdminUser = {
      id: `admin_${Date.now()}`,
      email: newAdmin.username,
      password: newAdmin.password,
      role: newAdmin.role,
      hotkey: {
        windows: newAdmin.hotkeyWindows,
        mac: newAdmin.hotkeyMac,
      },
      twoFactorEnabled: false,
    };

    const stored = JSON.parse(localStorage.getItem('admin_users') || '[]');
    const updated = [...stored, admin];
    localStorage.setItem('admin_users', JSON.stringify(updated));
    
    // Log activity
    if (typeof (window as any).logAdminActivity === 'function') {
      (window as any).logAdminActivity({
        adminId: currentAdmin.id,
        adminEmail: currentAdmin.email,
        action: 'create',
        target: 'admin_user',
        details: `Created new admin: ${admin.email}`,
        status: 'online',
        ipAddress: 'N/A',
        userAgent: navigator.userAgent,
      });
    }
    
    setShowAddAdmin(false);
    setNewAdmin({
      username: '',
      password: '',
      confirmPassword: '',
      hotkeyWindows: 'Control+Alt+',
      hotkeyMac: 'Meta+Alt+',
      role: {
        dashboard: true,
        users: true,
        transactions: true,
        settings: true,
        support: true,
        landing: true,
        adminManagement: false,
      },
    });
    setVerifiedHotkey('');
    setErrors({
      username: '',
      password: '',
      confirmPassword: '',
      hotkey: '',
    });
    loadAdmins();
  };

  const handleDeleteAdmin = (id: string, email: string) => {
    if (id === 'default-admin') {
      alert('Cannot delete the default admin account');
      return;
    }

    if (confirm(`Are you sure you want to delete admin: ${email}?`)) {
      const stored = JSON.parse(localStorage.getItem('admin_users') || '[]');
      const updated = stored.filter((a: AdminUser) => a.id !== id);
      localStorage.setItem('admin_users', JSON.stringify(updated));
      
      // Log activity
      if (typeof (window as any).logAdminActivity === 'function') {
        (window as any).logAdminActivity({
          adminId: currentAdmin.id,
          adminEmail: currentAdmin.email,
          action: 'delete',
          target: 'admin_user',
          details: `Deleted admin: ${email}`,
          status: 'online',
          ipAddress: 'N/A',
          userAgent: navigator.userAgent,
        });
      }
      
      loadAdmins();
    }
  };

  const handleReset2FA = async (admin: AdminUser) => {
    // Generate new 2FA secret
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
    setSelectedAdmin(admin);
    setShow2FADialog(true);
  };

  const handleSaveNew2FA = () => {
    if (!selectedAdmin) return;

    if (selectedAdmin.id === 'default-admin') {
      localStorage.setItem('default_admin_2fa', totpSecret);
    } else {
      const stored = JSON.parse(localStorage.getItem('admin_users') || '[]');
      const index = stored.findIndex((a: AdminUser) => a.id === selectedAdmin.id);
      if (index !== -1) {
        stored[index].twoFactorSecret = totpSecret;
        stored[index].twoFactorEnabled = true;
        localStorage.setItem('admin_users', JSON.stringify(stored));
      }
    }
    
    // Log activity
    if (typeof (window as any).logAdminActivity === 'function') {
      (window as any).logAdminActivity({
        adminId: currentAdmin.id,
        adminEmail: currentAdmin.email,
        action: 'settings_change',
        target: '2fa_reset',
        details: `Reset 2FA for admin: ${selectedAdmin.email}`,
        status: 'online',
        ipAddress: 'N/A',
        userAgent: navigator.userAgent,
      });
    }
    
    setShow2FADialog(false);
    setSelectedAdmin(null);
    loadAdmins();
  };

  const togglePassword = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredAdmins = admins.filter(admin =>
    admin.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Shield className="size-6 text-purple-400" />
            Admin User Management
          </h2>
          <p className="text-slate-400">Create and manage administrator accounts with custom permissions</p>
        </div>
        <Button 
          onClick={() => setShowAddAdmin(true)} 
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        >
          <Plus className="size-4 mr-2" />
          Create New Admin
        </Button>
      </div>

      {/* Search and Filter */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search admins by email..."
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
            <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
              <Users className="size-3 mr-1" />
              {filteredAdmins.length} Admin{filteredAdmins.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Admin List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence>
          {filteredAdmins.map((admin, index) => (
            <motion.div
              key={admin.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={`border ${admin.id === 'default-admin' ? 'border-green-500/30 bg-gradient-to-br from-green-500/5 to-slate-900' : 'border-blue-500/20 bg-slate-900/50'} hover:border-purple-500/30 transition-all`}>
                <CardContent className="p-6">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <Badge className={admin.id === 'default-admin' ? 'bg-green-500 text-white' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}>
                      {admin.id === 'default-admin' ? '👑 Super Admin' : '🛡️ Admin'}
                    </Badge>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="size-8 p-0 border-purple-500/30 hover:bg-purple-500/10"
                        onClick={() => handleReset2FA(admin)}
                        title="Reset 2FA"
                      >
                        <Smartphone className="size-4 text-purple-400" />
                      </Button>
                      {admin.id !== 'default-admin' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="size-8 p-0 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                          title="Delete Admin"
                        >
                          <Trash2 className="size-4 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="mb-4">
                    <p className="text-white font-semibold text-lg">{admin.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Key className="size-4 text-slate-400" />
                      <span className="text-slate-400 text-sm">Hotkey:</span>
                      <code className="text-xs bg-slate-800 px-2 py-1 rounded text-blue-400 font-mono">
                        {admin.hotkey.windows.split('+').pop()}
                      </code>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div className="space-y-2">
                    <p className="text-slate-400 text-sm font-medium">Permissions:</p>
                    <div className="flex flex-wrap gap-1">
                      {admin.id === 'default-admin' ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          ✅ Full Access
                        </Badge>
                      ) : (
                        Object.entries(admin.role)
                          .filter(([_, value]) => value)
                          .map(([key]) => {
                            const perm = availablePermissions.find(p => p.key === key);
                            return (
                              <Badge key={key} variant="secondary" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                                {perm?.icon} {perm?.label || key}
                              </Badge>
                            );
                          })
                      )}
                    </div>
                  </div>

                  {/* 2FA Status */}
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">2FA Status:</span>
                      {admin.twoFactorEnabled ? (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          <CheckCircle className="size-3 mr-1" />
                          Enabled
                        </Badge>
                      ) : (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                          <AlertCircle className="size-3 mr-1" />
                          Not Setup
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add Admin Dialog */}
      <Dialog open={showAddAdmin} onOpenChange={setShowAddAdmin}>
        <DialogContent className="bg-slate-900 border-purple-500/20 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <UserPlus className="size-6 text-purple-400" />
              Create New Administrator
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Fill in the details to create a new admin account with custom permissions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Information */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Username / Email *</Label>
                  <Input
                    type="email"
                    value={newAdmin.username}
                    onChange={(e) => {
                      setNewAdmin({ ...newAdmin, username: e.target.value });
                      setErrors({ ...errors, username: '' });
                    }}
                    placeholder="admin@indexpilotai.com"
                    className={`bg-slate-800 border-slate-700 ${errors.username ? 'border-red-500' : ''}`}
                  />
                  {errors.username && (
                    <p className="text-red-400 text-sm flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      {errors.username}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Password *</Label>
                    <div className="relative">
                      <Input
                        type={showPasswords['password'] ? 'text' : 'password'}
                        value={newAdmin.password}
                        onChange={(e) => {
                          setNewAdmin({ ...newAdmin, password: e.target.value });
                          setErrors({ ...errors, password: '' });
                        }}
                        placeholder="Minimum 8 characters"
                        className={`bg-slate-800 border-slate-700 pr-10 ${errors.password ? 'border-red-500' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => togglePassword('password')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPasswords['password'] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-red-400 text-sm flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Confirm Password *</Label>
                    <div className="relative">
                      <Input
                        type={showPasswords['confirmPassword'] ? 'text' : 'password'}
                        value={newAdmin.confirmPassword}
                        onChange={(e) => {
                          setNewAdmin({ ...newAdmin, confirmPassword: e.target.value });
                          setErrors({ ...errors, confirmPassword: '' });
                        }}
                        placeholder="Re-enter password"
                        className={`bg-slate-800 border-slate-700 pr-10 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => togglePassword('confirmPassword')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        {showPasswords['confirmPassword'] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-red-400 text-sm flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hotkey Configuration */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg">Hotkey Configuration</CardTitle>
                <CardDescription>Set unique hotkey combination for secure admin access</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Windows Hotkey *</Label>
                    <Input
                      value={newAdmin.hotkeyWindows}
                      onChange={(e) => {
                        setNewAdmin({ ...newAdmin, hotkeyWindows: e.target.value });
                        setVerifiedHotkey('');
                      }}
                      placeholder="Control+Alt+KEY"
                      className="bg-slate-800 border-slate-700 font-mono"
                    />
                    <p className="text-xs text-slate-500">Format: Control+Alt+KEY (e.g., Control+Alt+ADMIN)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Mac Hotkey *</Label>
                    <Input
                      value={newAdmin.hotkeyMac}
                      onChange={(e) => {
                        setNewAdmin({ ...newAdmin, hotkeyMac: e.target.value });
                        setVerifiedHotkey('');
                      }}
                      placeholder="Meta+Alt+KEY"
                      className="bg-slate-800 border-slate-700 font-mono"
                    />
                    <p className="text-xs text-slate-500">Format: Meta+Alt+KEY (e.g., Meta+Alt+ADMIN)</p>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleVerifyHotkey}
                  variant="outline"
                  className="w-full border-purple-500/30 hover:bg-purple-500/10"
                >
                  <Key className="size-4 mr-2" />
                  Verify Hotkey Uniqueness
                </Button>

                {errors.hotkey && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2"
                  >
                    <AlertCircle className="size-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-400">{errors.hotkey}</p>
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
              </CardContent>
            </Card>

            {/* Tab Access Permissions */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-lg">Tab Access Permissions</CardTitle>
                <CardDescription>Select which sections this admin can access</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {availablePermissions.map(perm => (
                  <div 
                    key={perm.key} 
                    className="flex items-center justify-between py-3 px-4 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex-1">
                      <Label className="text-sm font-medium flex items-center gap-2 cursor-pointer text-slate-200">
                        <span className="text-lg">{perm.icon}</span>
                        <div>
                          <div>{perm.label}</div>
                          <div className="text-xs text-slate-400 font-normal">{perm.description}</div>
                        </div>
                      </Label>
                    </div>
                    <Switch
                      checked={newAdmin.role[perm.key] || false}
                      onCheckedChange={(checked) =>
                        setNewAdmin({
                          ...newAdmin,
                          role: { ...newAdmin.role, [perm.key]: checked },
                        })
                      }
                      className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-slate-600"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleAddAdmin} 
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 h-12"
              >
                <CheckCircle className="size-5 mr-2" />
                Create Administrator
              </Button>
              <Button 
                onClick={() => {
                  setShowAddAdmin(false);
                  setNewAdmin({
                    username: '',
                    password: '',
                    confirmPassword: '',
                    hotkeyWindows: 'Control+Alt+',
                    hotkeyMac: 'Meta+Alt+',
                    role: {
                      dashboard: true,
                      users: true,
                      transactions: true,
                      settings: true,
                      support: true,
                      landing: true,
                      adminManagement: false,
                    },
                  });
                  setVerifiedHotkey('');
                  setErrors({
                    username: '',
                    password: '',
                    confirmPassword: '',
                    hotkey: '',
                  });
                }} 
                variant="outline"
                className="h-12 px-8"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2FA Setup Dialog */}
      <Dialog open={show2FADialog} onOpenChange={setShow2FADialog}>
        <DialogContent className="bg-slate-900 border-purple-500/20 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-purple-400" />
              Reset 2-Factor Authentication
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Scan this QR code with Google Authenticator or any TOTP app
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-white p-4 rounded-lg">
              <img src={qrCodeUrl} alt="QR Code" className="w-full h-auto" />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm text-slate-400">Or enter this secret key manually:</Label>
              <div className="bg-slate-800 p-3 rounded-lg">
                <code className="text-green-400 font-mono text-sm break-all">{totpSecret}</code>
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              <p className="text-xs text-blue-400">
                <strong>Note:</strong> After scanning, the admin will need to enter the 6-digit code from their authenticator app when logging in.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button 
                onClick={handleSaveNew2FA} 
                className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <CheckCircle className="size-4 mr-2" />
                Save 2FA Setup
              </Button>
              <Button 
                onClick={() => {
                  setShow2FADialog(false);
                  setSelectedAdmin(null);
                }} 
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}