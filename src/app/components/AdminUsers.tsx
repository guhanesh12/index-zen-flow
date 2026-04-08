import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter,
  Wallet,
  TrendingUp,
  TrendingDown,
  Power,
  Ban,
  CheckCircle,
  Edit,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Phone,
  Mail,
  Hash,
  DollarSign,
  Activity,
  Eye,
  MoreVertical,
  Download,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city?: string;
  state?: string;
  communityId: string;
  wallet: number;
  brokerBalance: number;
  dailyPnL: number;
  totalPnL: number;
  engineRunning: boolean;
  isActive: boolean;
  dhanClientId: string;
  createdAt: string;
  lastActive?: string;
}

interface AdminUsersProps {
  serverUrl: string;
  accessToken: string;
}

export function AdminUsers({ serverUrl, accessToken }: AdminUsersProps) {
  // Early return if missing required props
  if (!serverUrl || !accessToken) {
    console.error('❌ [ADMIN USERS] Missing required props!', { serverUrl, accessToken });
    return (
      <div className="p-8 text-center">
        <p className="text-red-400">Error: Missing server URL or access token</p>
      </div>
    );
  }
  
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, active, suspended, engineRunning
  const [showAddUser, setShowAddUser] = useState(false);
  const [showWalletDialog, setShowWalletDialog] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [walletAction, setWalletAction] = useState<'add' | 'deduct'>('add');
  const [walletAmount, setWalletAmount] = useState('');
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    communityId: '',
    dhanClientId: '',
    initialWallet: '0'
  });

  // Load users
  useEffect(() => {
    loadUsers();
    const interval = setInterval(loadUsers, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  // Filter users
  useEffect(() => {
    let filtered = users;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phone.includes(searchTerm) ||
        user.communityId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (filterStatus === 'active') {
      filtered = filtered.filter(user => user.isActive);
    } else if (filterStatus === 'suspended') {
      filtered = filtered.filter(user => !user.isActive);
    } else if (filterStatus === 'engineRunning') {
      filtered = filtered.filter(user => user.engineRunning);
    }

    setFilteredUsers(filtered);
  }, [users, searchTerm, filterStatus]);

  const loadUsers = async () => {
    console.log('🔄 [ADMIN USERS] Loading users...');
    try {
      const response = await fetch(`${serverUrl}/admin/users`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [ADMIN USERS] Loaded users:', data.users?.length || 0);
        console.log('📊 [ADMIN USERS] Sample user data:', data.users?.[0]);
        
        // 🔒 FRONTEND FILTER: Exclude platform admin from client user list
        // Platform admin should ONLY appear in Admin Management tab, NOT in Users section
        const platformAdminEmail = 'airoboengin@smilykat.com';
        const allUsers = data.users || [];
        const clientUsers = allUsers.filter((user: User) => user.email !== platformAdminEmail);
        
        console.log(`🔒 [ADMIN USERS] Filtering out platform admin (${platformAdminEmail})`);
        console.log(`📊 [ADMIN USERS] Before filter: ${allUsers.length} users`);
        console.log(`📊 [ADMIN USERS] After filter: ${clientUsers.length} client users`);
        console.log(`🚫 [ADMIN USERS] Excluded ${allUsers.length - clientUsers.length} admin user(s)`);
        
        setUsers(clientUsers);
      } else {
        console.error('❌ Failed to load users:', response.status);
      }
    } catch (error) {
      console.error('❌ Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    console.log('➕ [ADMIN USERS] Creating new user:', newUser.name);
    try {
      const response = await fetch(`${serverUrl}/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newUser)
      });

      if (response.ok) {
        console.log('✅ [ADMIN USERS] User created successfully');
        await loadUsers();
        setShowAddUser(false);
        setNewUser({
          name: '',
          email: '',
          phone: '',
          city: '',
          state: '',
          communityId: '',
          dhanClientId: '',
          initialWallet: '0'
        });
      } else {
        const error = await response.json();
        console.error('❌ [ADMIN USERS] Failed to create user:', error);
        alert(error.error || 'Failed to add user');
      }
    } catch (error) {
      console.error('❌ [ADMIN USERS] Error adding user:', error);
      alert('Failed to add user');
    }
  };

  const handleWalletUpdate = async () => {
    if (!selectedUser || !walletAmount) {
      console.error('❌ Missing user or amount');
      return;
    }

    console.log(`💰 ${walletAction === 'add' ? 'Adding' : 'Deducting'} ₹${walletAmount} for user ${selectedUser.name}`);
    console.log('🔐 [ADMIN USERS] Access token:', {
      hasToken: !!accessToken,
      tokenLength: accessToken?.length || 0,
      tokenPrefix: accessToken?.substring(0, 20) + '...',
      tokenSuffix: '...' + accessToken?.substring(accessToken.length - 10)
    });

    try {
      const response = await fetch(`${serverUrl}/admin/users/${selectedUser.id}/wallet`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: walletAction,
          amount: parseFloat(walletAmount)
        })
      });

      if (response.ok) {
        console.log('✅ Wallet updated successfully');
        await loadUsers();
        setShowWalletDialog(false);
        setWalletAmount('');
        setSelectedUser(null);
      } else {
        const error = await response.json();
        console.error('❌ Wallet update failed:', error);
        alert(error.error || 'Failed to update wallet');
      }
    } catch (error) {
      console.error('❌ Error updating wallet:', error);
      alert('Failed to update wallet');
    }
  };

  const handleToggleEngine = async (user: User) => {
    try {
      const response = await fetch(`${serverUrl}/admin/users/${user.id}/engine`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ running: !user.engineRunning })
      });

      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Error toggling engine:', error);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      const response = await fetch(`${serverUrl}/admin/users/${user.id}/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !user.isActive })
      });

      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.name}?`)) return;

    try {
      const response = await fetch(`${serverUrl}/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const exportUsers = () => {
    console.log('📥 [ADMIN USERS] Exporting users to CSV...');
    try {
      const csv = [
        ['Name', 'Email', 'Phone', 'City', 'State', 'Community ID', 'User ID', 'Wallet', 'Broker Balance', 'Daily P&L', 'Total P&L', 'Engine', 'Status', 'Dhan Client ID'],
        ...filteredUsers.map(u => [
          u.name, u.email, u.phone, u.city || '', u.state || '', u.communityId, u.id, u.wallet, u.brokerBalance, 
          u.dailyPnL, u.totalPnL, u.engineRunning ? 'Running' : 'Stopped', 
          u.isActive ? 'Active' : 'Suspended', u.dhanClientId
        ])
      ].map(row => row.join(',')).join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `users-${new Date().toISOString()}.csv`;
      a.click();
      console.log('✅ [ADMIN USERS] CSV exported successfully');
    } catch (error) {
      console.error('❌ [ADMIN USERS] Error exporting CSV:', error);
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => u.isActive).length,
    suspended: users.filter(u => !u.isActive).length,
    engineRunning: users.filter(u => u.engineRunning).length
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="size-7 text-blue-400" />
            User Management
          </h2>
          <p className="text-slate-400 mt-1">Manage all platform users and their accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={loadUsers}
            variant="outline"
            className="border-slate-700 bg-slate-800 hover:bg-slate-700"
          >
            <RefreshCw className="size-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={exportUsers}
            variant="outline"
            className="border-slate-700 bg-slate-800 hover:bg-slate-700"
          >
            <Download className="size-4 mr-2" />
            Export
          </Button>
          <Button
            onClick={() => setShowAddUser(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            <UserPlus className="size-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div whileHover={{ scale: 1.02 }}>
          <Card className="border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-transparent">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Users</p>
                  <p className="text-3xl font-bold text-white mt-1">{stats.total}</p>
                </div>
                <Users className="size-10 text-blue-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }}>
          <Card className="border-green-500/20 bg-gradient-to-br from-green-500/10 to-transparent">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Active Users</p>
                  <p className="text-3xl font-bold text-white mt-1">{stats.active}</p>
                </div>
                <CheckCircle className="size-10 text-green-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }}>
          <Card className="border-red-500/20 bg-gradient-to-br from-red-500/10 to-transparent">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Suspended</p>
                  <p className="text-3xl font-bold text-white mt-1">{stats.suspended}</p>
                </div>
                <Ban className="size-10 text-red-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }}>
          <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-transparent">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Engines Running</p>
                  <p className="text-3xl font-bold text-white mt-1">{stats.engineRunning}</p>
                </div>
                <Activity className="size-10 text-purple-400 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                placeholder="Search by name, email, phone, community ID, or user ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-800 border-slate-700"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[200px] bg-slate-800 border-slate-700">
                <Filter className="size-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="suspended">Suspended Only</SelectItem>
                <SelectItem value="engineRunning">Engine Running</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">IDs</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Wallet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Broker</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Daily P&L</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Engine</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                <AnimatePresence>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                        <RefreshCw className="size-6 animate-spin mx-auto mb-2" />
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                        <Users className="size-12 mx-auto mb-3 opacity-50" />
                        <p>No users found</p>
                        <p className="text-sm mt-1">Try adjusting your filters or add a new user</p>
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user, index) => (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-slate-800/50 transition-colors"
                      >
                        {/* User Info */}
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-white">{user.name}</p>
                              <p className="text-xs text-slate-400">{user.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-slate-300">
                              <Mail className="size-3 text-slate-500" />
                              {user.email}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-slate-300">
                              <Phone className="size-3 text-slate-500" />
                              {user.phone}
                            </div>
                          </div>
                        </td>

                        {/* IDs */}
                        <td className="px-4 py-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm">
                              <Hash className="size-3 text-blue-400" />
                              <span className="text-slate-300">{user.communityId}</span>
                            </div>
                            {user.dhanClientId ? (
                              <div className="space-y-1">
                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                                  <Activity className="size-3 mr-1" />
                                  Connected
                                </Badge>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                  <span className="font-mono">{user.dhanClientId}</span>
                                </div>
                              </div>
                            ) : (
                              <Badge className="bg-slate-700/50 text-slate-400 border-slate-600/30 text-xs">
                                <Activity className="size-3 mr-1" />
                                Not Connected
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Wallet */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-semibold text-white">₹{(user.wallet || 0).toLocaleString()}</span>
                          </div>
                        </td>

                        {/* Broker Balance */}
                        <td className="px-4 py-4 text-right">
                          <span className="text-slate-300">₹{(user.brokerBalance || 0).toLocaleString()}</span>
                        </td>

                        {/* Daily P&L */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {(user.dailyPnL || 0) >= 0 ? (
                              <TrendingUp className="size-4 text-green-400" />
                            ) : (
                              <TrendingDown className="size-4 text-red-400" />
                            )}
                            <span className={(user.dailyPnL || 0) >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                              ₹{Math.abs(user.dailyPnL || 0).toLocaleString()}
                            </span>
                          </div>
                        </td>

                        {/* Engine Toggle */}
                        <td className="px-4 py-4">
                          <div className="flex justify-center">
                            <button
                              onClick={() => handleToggleEngine(user)}
                              disabled={!user.isActive}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                user.engineRunning ? 'bg-green-500' : 'bg-slate-700'
                              } ${!user.isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  user.engineRunning ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <div className="flex justify-center">
                            <Badge className={user.isActive 
                              ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                            }>
                              {user.isActive ? (
                                <>
                                  <CheckCircle className="size-3 mr-1" />
                                  Active
                                </>
                              ) : (
                                <>
                                  <Ban className="size-3 mr-1" />
                                  Suspended
                                </>
                              )}
                            </Badge>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('💰 Opening wallet add dialog for:', user.name);
                                setSelectedUser(user);
                                setWalletAction('add');
                                setShowWalletDialog(true);
                              }}
                              className="border-green-500/30 bg-green-500/10 hover:bg-green-500/20 text-green-400 h-8 w-8 p-0"
                              title="Add to Wallet"
                            >
                              <ArrowUpCircle className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('💸 Opening wallet deduct dialog for:', user.name);
                                setSelectedUser(user);
                                setWalletAction('deduct');
                                setShowWalletDialog(true);
                              }}
                              className="border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 h-8 w-8 p-0"
                              title="Deduct from Wallet"
                            >
                              <ArrowDownCircle className="size-4" />
                            </Button>
                            
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('👁️ Opening user details for:', user.name);
                                setSelectedUser(user);
                                setShowUserDetails(true);
                              }}
                              className="border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 h-8 w-8 p-0"
                              title="View Details & Actions"
                            >
                              <MoreVertical className="size-4" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <UserPlus className="size-5 text-blue-400" />
              Add New User
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new user account with initial configuration
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Full Name</Label>
              <Input
                placeholder="John Doe"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Email Address</Label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Phone Number</Label>
              <Input
                placeholder="+91 1234567890"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">City</Label>
              <Input
                placeholder="Mumbai"
                value={newUser.city}
                onChange={(e) => setNewUser({ ...newUser, city: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">State</Label>
              <Input
                placeholder="Maharashtra"
                value={newUser.state}
                onChange={(e) => setNewUser({ ...newUser, state: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Community ID</Label>
              <Input
                placeholder="COM123"
                value={newUser.communityId}
                onChange={(e) => setNewUser({ ...newUser, communityId: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Dhan Client ID</Label>
              <Input
                placeholder="1234567890"
                value={newUser.dhanClientId}
                onChange={(e) => setNewUser({ ...newUser, dhanClientId: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Initial Wallet Amount</Label>
              <Input
                type="number"
                placeholder="0"
                value={newUser.initialWallet}
                onChange={(e) => setNewUser({ ...newUser, initialWallet: e.target.value })}
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUser(false)} className="border-slate-700">
              Cancel
            </Button>
            <Button 
              onClick={handleAddUser}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              disabled={!newUser.name || !newUser.email || !newUser.phone}
            >
              <UserPlus className="size-4 mr-2" />
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet Dialog */}
      <Dialog open={showWalletDialog} onOpenChange={setShowWalletDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Wallet className="size-5 text-blue-400" />
              {walletAction === 'add' ? 'Add to Wallet' : 'Deduct from Wallet'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {selectedUser && (
                <>
                  User: <span className="font-semibold text-white">{selectedUser.name}</span>
                  <br />
                  Current Balance: <span className="font-semibold text-white">₹{(selectedUser.wallet || 0).toLocaleString()}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Amount</Label>
              <Input
                type="number"
                placeholder="Enter amount"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
                className="bg-slate-800 border-slate-700"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowWalletDialog(false);
                setWalletAmount('');
              }} 
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleWalletUpdate}
              className={walletAction === 'add' 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-red-600 hover:bg-red-700'
              }
              disabled={!walletAmount || parseFloat(walletAmount) <= 0}
            >
              {walletAction === 'add' ? (
                <>
                  <ArrowUpCircle className="size-4 mr-2" />
                  Add ₹{walletAmount || '0'}
                </>
              ) : (
                <>
                  <ArrowDownCircle className="size-4 mr-2" />
                  Deduct ₹{walletAmount || '0'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={showEditUser} onOpenChange={setShowEditUser}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Edit className="size-5 text-blue-400" />
              Edit User
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Update user information
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Full Name</Label>
                <Input
                  value={selectedUser.name}
                  onChange={(e) => setSelectedUser({ ...selectedUser, name: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Email Address</Label>
                <Input
                  type="email"
                  value={selectedUser.email}
                  onChange={(e) => setSelectedUser({ ...selectedUser, email: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Phone Number</Label>
                <Input
                  value={selectedUser.phone}
                  onChange={(e) => setSelectedUser({ ...selectedUser, phone: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">City</Label>
                <Input
                  value={selectedUser.city || ''}
                  onChange={(e) => setSelectedUser({ ...selectedUser, city: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  placeholder="Mumbai"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">State</Label>
                <Input
                  value={selectedUser.state || ''}
                  onChange={(e) => setSelectedUser({ ...selectedUser, state: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                  placeholder="Maharashtra"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Dhan Client ID</Label>
                <Input
                  value={selectedUser.dhanClientId}
                  onChange={(e) => setSelectedUser({ ...selectedUser, dhanClientId: e.target.value })}
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditUser(false)} className="border-slate-700">
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!selectedUser) return;
                try {
                  const response = await fetch(`${serverUrl}/admin/users/${selectedUser.id}`, {
                    method: 'PUT',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(selectedUser)
                  });
                  if (response.ok) {
                    await loadUsers();
                    setShowEditUser(false);
                  }
                } catch (error) {
                  console.error('Error updating user:', error);
                }
              }}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Edit className="size-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details & Actions Dialog */}
      <Dialog open={showUserDetails} onOpenChange={setShowUserDetails}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Eye className="size-5 text-blue-400" />
              User Details & Actions
            </DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-6">
              {/* User Information Card */}
              <div className="bg-slate-800/50 rounded-lg p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white">{selectedUser.name}</h3>
                    <p className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                      <Mail className="size-3" />
                      {selectedUser.email}
                    </p>
                  </div>
                  <Badge className={selectedUser.isActive 
                    ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }>
                    {selectedUser.isActive ? 'Active' : 'Suspended'}
                  </Badge>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Community ID</p>
                    <p className="text-sm text-white font-mono">{selectedUser.communityId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Phone Number</p>
                    <p className="text-sm text-white flex items-center gap-1">
                      <Phone className="size-3" />
                      {selectedUser.phone}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">City</p>
                    <p className="text-sm text-white">
                      {selectedUser.city || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">State</p>
                    <p className="text-sm text-white">
                      {selectedUser.state || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Wallet Balance</p>
                    <p className="text-sm text-green-400 font-semibold flex items-center gap-1">
                      <Wallet className="size-3" />
                      ₹{selectedUser.wallet?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Daily P&L</p>
                    <p className={`text-sm font-semibold flex items-center gap-1 ${
                      (selectedUser.dailyPnL || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(selectedUser.dailyPnL || 0) >= 0 ? (
                        <TrendingUp className="size-3" />
                      ) : (
                        <TrendingDown className="size-3" />
                      )}
                      ₹{Math.abs(selectedUser.dailyPnL || 0).toLocaleString()}
                    </p>
                  </div>
                  {selectedUser.dhanClientId && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 mb-1">Dhan Client ID</p>
                      <p className="text-sm text-blue-400 font-mono">{selectedUser.dhanClientId}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Trading Engine</p>
                    <Badge className={selectedUser.engineRunning 
                      ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                      : 'bg-slate-700/50 text-slate-400 border-slate-600/30'
                    }>
                      <Power className="size-3 mr-1" />
                      {selectedUser.engineRunning ? 'Running' : 'Stopped'}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Last Active</p>
                    <p className="text-sm text-slate-300">
                      {selectedUser.lastActive 
                        ? new Date(selectedUser.lastActive).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })
                        : 'Never'
                      }
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-slate-800/30 rounded-lg p-4">
                <p className="text-xs text-slate-400 mb-3 uppercase tracking-wide">Quick Actions</p>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => {
                      setShowUserDetails(false);
                      setShowEditUser(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Edit className="size-4 mr-2" />
                    Edit User
                  </Button>
                  <Button
                    onClick={() => {
                      setShowUserDetails(false);
                      handleToggleStatus(selectedUser);
                    }}
                    className={selectedUser.isActive 
                      ? 'bg-orange-600 hover:bg-orange-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                    }
                  >
                    {selectedUser.isActive ? (
                      <>
                        <Ban className="size-4 mr-2" />
                        Suspend User
                      </>
                    ) : (
                      <>
                        <CheckCircle className="size-4 mr-2" />
                        Activate User
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowUserDetails(false);
                      setWalletAction('add');
                      setShowWalletDialog(true);
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <ArrowUpCircle className="size-4 mr-2" />
                    Add to Wallet
                  </Button>
                  <Button
                    onClick={() => {
                      setShowUserDetails(false);
                      setWalletAction('deduct');
                      setShowWalletDialog(true);
                    }}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  >
                    <ArrowDownCircle className="size-4 mr-2" />
                    Deduct Wallet
                  </Button>
                  <Button
                    onClick={() => {
                      setShowUserDetails(false);
                      handleDeleteUser(selectedUser);
                    }}
                    className="col-span-2 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 className="size-4 mr-2" />
                    Delete User Permanently
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowUserDetails(false)}
              className="border-slate-700"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}