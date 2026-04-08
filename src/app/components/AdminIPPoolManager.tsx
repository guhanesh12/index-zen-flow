// @ts-nocheck
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Globe, Plus, Trash2, RefreshCw, CheckCircle, 
  XCircle, Server, Users, Activity, AlertTriangle 
} from 'lucide-react';
import { toast } from 'sonner';

interface AdminIPPoolManagerProps {
  serverUrl: string;
  accessToken: string;
  adminHotkey: string;
}

interface IPPoolEntry {
  ipAddress: string;
  provider: string;
  status: 'active' | 'inactive' | 'maintenance';
  currentUsers: number;
  maxUsers: number;
  assignedUsers: string[];
  createdAt: string;
  lastCheckedAt?: string;
  vpsUrl: string;
}

interface IPPoolStats {
  totalIPs: number;
  activeIPs: number;
  totalCapacity: number;
  usedCapacity: number;
  availableCapacity: number;
  updatedAt: string;
}

export function AdminIPPoolManager({ serverUrl, accessToken, adminHotkey }: AdminIPPoolManagerProps) {
  const [loading, setLoading] = useState(false);
  const [pool, setPool] = useState<IPPoolEntry[]>([]);
  const [stats, setStats] = useState<IPPoolStats | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [newIP, setNewIP] = useState({
    ipAddress: '',
    vpsUrl: '',
    provider: 'hostinger',
    maxUsers: 1,
    apiKey: ''
  });

  useEffect(() => {
    loadIPPool();
  }, []);

  const loadIPPool = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${serverUrl}/admin/ip-pool/stats`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Admin-Hotkey': adminHotkey
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load IP pool');
      }

      const data = await response.json();
      if (data.success) {
        setPool(data.pool || []);
        setStats(data.stats);
      }
    } catch (error: any) {
      console.error('Failed to load IP pool:', error);
      toast.error('Failed to load IP pool');
    } finally {
      setLoading(false);
    }
  };

  const addIPToPool = async () => {
    try {
      if (!newIP.ipAddress || !newIP.vpsUrl) {
        toast.error('Please fill in IP address and VPS URL');
        return;
      }

      setLoading(true);
      const response = await fetch(`${serverUrl}/admin/ip-pool/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Admin-Hotkey': adminHotkey
        },
        body: JSON.stringify(newIP)
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to add IP');
      }

      toast.success(`IP ${newIP.ipAddress} added successfully`);
      
      // Reset form
      setNewIP({
        ipAddress: '',
        vpsUrl: '',
        provider: 'hostinger',
        maxUsers: 1,
        apiKey: ''
      });
      setShowAddForm(false);
      
      // Reload pool
      await loadIPPool();
    } catch (error: any) {
      console.error('Failed to add IP:', error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const removeIPFromPool = async (ipAddress: string) => {
    if (!confirm(`Are you sure you want to remove IP ${ipAddress}?`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${serverUrl}/admin/ip-pool/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Admin-Hotkey': adminHotkey
        },
        body: JSON.stringify({ ipAddress })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to remove IP');
      }

      toast.success(`IP ${ipAddress} removed successfully`);
      await loadIPPool();
    } catch (error: any) {
      console.error('Failed to remove IP:', error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const healthCheck = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${serverUrl}/admin/ip-pool/health`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Admin-Hotkey': adminHotkey
        }
      });

      const data = await response.json();
      
      if (data.success && data.health) {
        const { totalIPs, healthyIPs, unhealthyIPs } = data.health;
        
        if (unhealthyIPs.length === 0) {
          toast.success(`All ${totalIPs} IPs are healthy!`);
        } else {
          toast.warning(`${healthyIPs}/${totalIPs} IPs healthy. Unhealthy: ${unhealthyIPs.join(', ')}`);
        }
      }
      
      await loadIPPool();
    } catch (error: any) {
      console.error('Health check failed:', error);
      toast.error('Health check failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">Total IPs</p>
                  <p className="text-2xl font-bold text-white">{stats.totalIPs}</p>
                </div>
                <Server className="w-8 h-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">Active IPs</p>
                  <p className="text-2xl font-bold text-green-400">{stats.activeIPs}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">Used Capacity</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {stats.usedCapacity}/{stats.totalCapacity}
                  </p>
                </div>
                <Users className="w-8 h-8 text-orange-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">Available</p>
                  <p className="text-2xl font-bold text-cyan-400">{stats.availableCapacity}</p>
                </div>
                <Activity className="w-8 h-8 text-cyan-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IP Pool Management */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                IP Pool Management
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Manage static IPs for user assignments
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={healthCheck}
                disabled={loading}
                variant="outline"
                size="sm"
                className="border-zinc-700"
              >
                <Activity className="w-4 h-4 mr-2" />
                Health Check
              </Button>
              <Button
                onClick={() => setShowAddForm(!showAddForm)}
                disabled={loading}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add IP
              </Button>
              <Button
                onClick={loadIPPool}
                disabled={loading}
                variant="outline"
                size="sm"
                className="border-zinc-700"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Add IP Form */}
          {showAddForm && (
            <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700 space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Add New IP to Pool</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">IP Address *</Label>
                  <Input
                    type="text"
                    placeholder="e.g., 187.127.140.245"
                    value={newIP.ipAddress}
                    onChange={(e) => setNewIP({ ...newIP, ipAddress: e.target.value })}
                    className="bg-zinc-900 border-zinc-700 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">VPS URL *</Label>
                  <Input
                    type="text"
                    placeholder="e.g., http://187.127.140.245:3000"
                    value={newIP.vpsUrl}
                    onChange={(e) => setNewIP({ ...newIP, vpsUrl: e.target.value })}
                    className="bg-zinc-900 border-zinc-700 text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Provider</Label>
                  <select
                    value={newIP.provider}
                    onChange={(e) => setNewIP({ ...newIP, provider: e.target.value })}
                    className="w-full h-10 px-3 rounded-md bg-zinc-900 border border-zinc-700 text-white"
                  >
                    <option value="hostinger">Hostinger</option>
                    <option value="aws">AWS</option>
                    <option value="digitalocean">DigitalOcean</option>
                    <option value="proxy">Proxy Service</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300">Max Users per IP</Label>
                  <Input
                    type="number"
                    min="1"
                    value={newIP.maxUsers}
                    onChange={(e) => setNewIP({ ...newIP, maxUsers: parseInt(e.target.value) || 1 })}
                    className="bg-zinc-900 border-zinc-700 text-white"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-zinc-300">API Key (Optional)</Label>
                  <Input
                    type="password"
                    placeholder="Order server API key"
                    value={newIP.apiKey}
                    onChange={(e) => setNewIP({ ...newIP, apiKey: e.target.value })}
                    className="bg-zinc-900 border-zinc-700 text-white"
                  />
                  <p className="text-xs text-zinc-500">
                    Leave empty to use default ORDER_SERVER_API_KEY
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={addIPToPool}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Pool
                </Button>
                <Button
                  onClick={() => setShowAddForm(false)}
                  variant="outline"
                  className="border-zinc-700"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* IP Pool Table */}
          <div className="space-y-3">
            {pool.length === 0 ? (
              <Alert className="bg-zinc-800 border-zinc-700">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <AlertDescription className="text-zinc-300">
                  No IPs in pool. Add your first IP to get started.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-3">
                {pool.map((ip) => (
                  <div
                    key={ip.ipAddress}
                    className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h4 className="text-lg font-semibold text-white font-mono">
                            {ip.ipAddress}
                          </h4>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            ip.status === 'active' 
                              ? 'bg-green-900/30 text-green-400 border border-green-700' 
                              : 'bg-red-900/30 text-red-400 border border-red-700'
                          }`}>
                            {ip.status}
                          </span>
                          <span className="text-sm text-zinc-400 bg-zinc-900 px-2 py-1 rounded">
                            {ip.provider}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-zinc-500">VPS URL</p>
                            <p className="text-zinc-300 font-mono text-xs">{ip.vpsUrl}</p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Users</p>
                            <p className="text-white font-semibold">
                              {ip.currentUsers} / {ip.maxUsers}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Added</p>
                            <p className="text-zinc-300">
                              {new Date(ip.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-zinc-500">Last Check</p>
                            <p className="text-zinc-300">
                              {ip.lastCheckedAt 
                                ? new Date(ip.lastCheckedAt).toLocaleTimeString()
                                : 'Never'}
                            </p>
                          </div>
                        </div>

                        {ip.assignedUsers.length > 0 && (
                          <div>
                            <p className="text-zinc-500 text-sm mb-1">Assigned Users:</p>
                            <div className="flex flex-wrap gap-2">
                              {ip.assignedUsers.map((userId) => (
                                <span
                                  key={userId}
                                  className="text-xs bg-zinc-900 text-cyan-400 px-2 py-1 rounded font-mono"
                                >
                                  {userId.substring(0, 8)}...
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <Button
                        onClick={() => removeIPFromPool(ip.ipAddress)}
                        disabled={loading || ip.currentUsers > 0}
                        variant="outline"
                        size="sm"
                        className="border-red-900 text-red-400 hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {ip.currentUsers > 0 && (
                      <Alert className="mt-3 bg-yellow-900/20 border-yellow-700">
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                        <AlertDescription className="text-yellow-200 text-xs">
                          Cannot remove: {ip.currentUsers} user(s) still assigned to this IP
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">💡 Setup Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 text-sm text-zinc-300">
            <h4 className="font-semibold text-white">How to add multiple IPs:</h4>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Purchase additional VPS from Hostinger/DigitalOcean/AWS</li>
              <li>Deploy the same Node.js order server on each VPS</li>
              <li>Note down each VPS's static IP and URL (with port)</li>
              <li>Add each IP to the pool using the form above</li>
              <li>Users can then subscribe to get their dedicated IP</li>
            </ol>
            
            <h4 className="font-semibold text-white mt-4">Pricing Recommendation:</h4>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>Shared IP (₹59/month):</strong> Multiple users, shared 187.127.140.245</li>
              <li><strong>Dedicated IP (₹199/month):</strong> Exclusive IP from pool for single user</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
