import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import {
  Mail,
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
  Bell,
  Eye,
  EyeOff,
  Save,
  TestTube2,
  BarChart3,
  Users,
  Radio,
  Activity,
  Phone,
  MessageCircle,
  Zap,
  TrendingUp,
  Download,
  Upload,
  RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

interface BrevoIntegrationProps {
  serverUrl: string;
  accessToken: string;
}

interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  smsSenderId: string;
  whatsappNumber: string;
}

interface NotificationSettings {
  signupOTP: { email: boolean; sms: boolean; whatsapp: boolean };
  loginAlert: { email: boolean; sms: boolean; whatsapp: boolean };
  signalDetection: { email: boolean; sms: boolean; whatsapp: boolean };
  orderPlacement: { email: boolean; sms: boolean; whatsapp: boolean };
  orderExit: { email: boolean; sms: boolean; whatsapp: boolean };
  walletTransaction: { email: boolean; sms: boolean; whatsapp: boolean };
  pnlReport: { email: boolean; sms: boolean; whatsapp: boolean };
  supportTicket: { email: boolean; sms: boolean; whatsapp: boolean };
}

interface CommunicationLog {
  id: string;
  user: string;
  channel: 'email' | 'sms' | 'whatsapp';
  messageType: string;
  status: 'sent' | 'delivered' | 'failed' | 'bounced';
  timestamp: string;
}

interface Statistics {
  email: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
  };
  sms: {
    sent: number;
    delivered: number;
    failed: number;
  };
  whatsapp: {
    sent: number;
    delivered: number;
    read: number;
  };
}

export function BrevoIntegration({ serverUrl, accessToken }: BrevoIntegrationProps) {
  const [config, setConfig] = useState<BrevoConfig>({
    apiKey: '',
    senderEmail: '',
    senderName: 'IndexpilotAI',
    smsSenderId: 'IndexpilotAI',
    whatsappNumber: ''
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    signupOTP: { email: true, sms: true, whatsapp: false },
    loginAlert: { email: true, sms: false, whatsapp: false },
    signalDetection: { email: true, sms: true, whatsapp: true },
    orderPlacement: { email: true, sms: true, whatsapp: true },
    orderExit: { email: true, sms: true, whatsapp: true },
    walletTransaction: { email: true, sms: true, whatsapp: true },
    pnlReport: { email: true, sms: false, whatsapp: true },
    supportTicket: { email: true, sms: false, whatsapp: false }
  });

  const [statistics, setStatistics] = useState<Statistics>({
    email: { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 },
    sms: { sent: 0, delivered: 0, failed: 0 },
    whatsapp: { sent: 0, delivered: 0, read: 0 }
  });

  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Broadcast message state
  const [broadcast, setBroadcast] = useState({
    title: '',
    message: '',
    channel: 'email' as 'email' | 'sms' | 'whatsapp',
    targetUsers: 'all' as 'all' | 'selected'
  });

  // Test message state
  const [testMessage, setTestMessage] = useState({
    recipient: '',
    subject: '',
    content: ''
  });

  useEffect(() => {
    loadConfig();
    loadNotificationSettings();
    loadStatistics();
    loadLogs();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch(`${serverUrl}/brevo/config`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig(data.config);
        }
      }
    } catch (error) {
      console.error('Failed to load Brevo config:', error);
    }
  };

  const loadNotificationSettings = () => {
    const stored = localStorage.getItem('brevo_notification_settings');
    if (stored) {
      setNotifications(JSON.parse(stored));
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await fetch(`${serverUrl}/brevo/statistics`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.statistics) {
          setStatistics(data.statistics);
        }
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const loadLogs = async () => {
    try {
      const response = await fetch(`${serverUrl}/brevo/logs?limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.logs) {
          setLogs(data.logs);
        }
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/brevo/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        toast.success('Brevo configuration saved successfully!');
      } else {
        toast.error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      toast.error('Error saving configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveNotificationSettings = () => {
    localStorage.setItem('brevo_notification_settings', JSON.stringify(notifications));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    toast.success('Notification settings saved!');
  };

  const toggleNotification = (type: keyof NotificationSettings, channel: 'email' | 'sms' | 'whatsapp') => {
    setNotifications(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channel]: !prev[type][channel]
      }
    }));
  };

  const testEmail = async () => {
    if (!testMessage.recipient || !testMessage.subject || !testMessage.content) {
      toast.error('Please fill all test message fields');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/brevo/test/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          to: testMessage.recipient,
          subject: testMessage.subject,
          content: testMessage.content
        })
      });

      if (response.ok) {
        toast.success('Test email sent successfully!');
        setTestMessage({ recipient: '', subject: '', content: '' });
      } else {
        const error = await response.json();
        toast.error(`Failed to send: ${error.message}`);
      }
    } catch (error) {
      console.error('Failed to send test email:', error);
      toast.error('Error sending test email');
    } finally {
      setLoading(false);
    }
  };

  const testSMS = async () => {
    if (!testMessage.recipient || !testMessage.content) {
      toast.error('Please fill recipient and message content');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/brevo/test/sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          recipient: testMessage.recipient,
          content: testMessage.content
        })
      });

      if (response.ok) {
        toast.success('Test SMS sent successfully!');
        setTestMessage({ recipient: '', subject: '', content: '' });
      } else {
        const error = await response.json();
        toast.error(`Failed to send: ${error.message}`);
      }
    } catch (error) {
      console.error('Failed to send test SMS:', error);
      toast.error('Error sending test SMS');
    } finally {
      setLoading(false);
    }
  };

  const testWhatsApp = async () => {
    if (!testMessage.recipient || !testMessage.content) {
      toast.error('Please fill recipient and message content');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/brevo/test/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          recipient: testMessage.recipient,
          content: testMessage.content
        })
      });

      if (response.ok) {
        toast.success('Test WhatsApp message sent successfully!');
        setTestMessage({ recipient: '', subject: '', content: '' });
      } else {
        const error = await response.json();
        toast.error(`Failed to send: ${error.message}`);
      }
    } catch (error) {
      console.error('Failed to send test WhatsApp:', error);
      toast.error('Error sending test WhatsApp message');
    } finally {
      setLoading(false);
    }
  };

  const sendBroadcast = async () => {
    if (!broadcast.message) {
      toast.error('Please enter broadcast message');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/brevo/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(broadcast)
      });

      if (response.ok) {
        toast.success('Broadcast sent successfully!');
        setBroadcast({ title: '', message: '', channel: 'email', targetUsers: 'all' });
      } else {
        const error = await response.json();
        toast.error(`Failed to send broadcast: ${error.message}`);
      }
    } catch (error) {
      console.error('Failed to send broadcast:', error);
      toast.error('Error sending broadcast');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'delivered' || status === 'sent') return 'text-green-400 bg-green-500/20';
    if (status === 'failed' || status === 'bounced') return 'text-red-400 bg-red-500/20';
    return 'text-yellow-400 bg-yellow-500/20';
  };

  const getChannelIcon = (channel: string) => {
    if (channel === 'email') return <Mail className="w-4 h-4" />;
    if (channel === 'sms') return <Phone className="w-4 h-4" />;
    return <MessageCircle className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Zap className="w-7 h-7 text-blue-400" />
            Brevo Communication System
          </h2>
          <p className="text-slate-400 mt-1">
            Manage email, SMS, and WhatsApp notifications powered by Brevo API
          </p>
        </div>
        {saved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-green-400 bg-green-500/10 px-4 py-2 rounded-lg border border-green-500/30"
          >
            <CheckCircle className="w-5 h-5" />
            Settings saved!
          </motion.div>
        )}
      </div>

      <Tabs defaultValue="configuration" className="space-y-6">
        <TabsList className="bg-slate-800 border border-blue-500/20">
          <TabsTrigger value="configuration">
            <Settings className="w-4 h-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-4 h-4 mr-2" />
            Notification Control
          </TabsTrigger>
          <TabsTrigger value="test">
            <TestTube2 className="w-4 h-4 mr-2" />
            Test Messages
          </TabsTrigger>
          <TabsTrigger value="broadcast">
            <Radio className="w-4 h-4 mr-2" />
            Broadcast
          </TabsTrigger>
          <TabsTrigger value="statistics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Activity className="w-4 h-4 mr-2" />
            Communication Logs
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="space-y-4">
          {/* Info Banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-1">Brevo API Setup</h4>
                <p className="text-sm text-slate-300">
                  Get your API key from{' '}
                  <a
                    href="https://app.brevo.com/settings/keys/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Brevo Account Settings
                  </a>
                  . Configure your sender details and communication channels below.
                </p>
              </div>
            </div>
          </motion.div>

          {/* API Key Configuration */}
          <Card className="border-purple-500/20 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-400" />
                API Credentials
              </CardTitle>
              <CardDescription>Your Brevo API key for authentication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Brevo API Key *</Label>
                <div className="relative">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={config.apiKey}
                    onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                    placeholder="xkeysib-xxxxxxxxxxxxxxxxx"
                    className="bg-slate-800 border-slate-700 pr-10"
                  />
                  <button
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Generate from{' '}
                  <a
                    href="https://app.brevo.com/settings/keys/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Brevo Dashboard
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Email Configuration */}
          <Card className="border-blue-500/20 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-400" />
                Email / SMTP Configuration
              </CardTitle>
              <CardDescription>Configure sender details for transactional emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sender Email *</Label>
                  <Input
                    type="email"
                    value={config.senderEmail}
                    onChange={(e) => setConfig({ ...config, senderEmail: e.target.value })}
                    placeholder="noreply@indexpilotai.com"
                    className="bg-slate-800 border-slate-700"
                  />
                  <p className="text-xs text-slate-500">Must be verified in Brevo</p>
                </div>
                <div className="space-y-2">
                  <Label>Sender Name *</Label>
                  <Input
                    type="text"
                    value={config.senderName}
                    onChange={(e) => setConfig({ ...config, senderName: e.target.value })}
                    placeholder="IndexpilotAI"
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SMS Configuration */}
          <Card className="border-green-500/20 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-green-400" />
                SMS Configuration
              </CardTitle>
              <CardDescription>Configure SMS sender ID for transactional messages</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>SMS Sender ID *</Label>
                <Input
                  type="text"
                  value={config.smsSenderId}
                  onChange={(e) => setConfig({ ...config, smsSenderId: e.target.value })}
                  placeholder="IndexpilotAI (11 characters max)"
                  maxLength={11}
                  className="bg-slate-800 border-slate-700"
                />
                <p className="text-xs text-slate-500">
                  Alphanumeric (max 11 characters) or numeric (max 15 characters)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* WhatsApp Configuration */}
          <Card className="border-emerald-500/20 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-400" />
                WhatsApp Configuration
              </CardTitle>
              <CardDescription>Configure WhatsApp Business number</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>WhatsApp Business Number *</Label>
                <Input
                  type="text"
                  value={config.whatsappNumber}
                  onChange={(e) => setConfig({ ...config, whatsappNumber: e.target.value })}
                  placeholder="917878172050 (with country code)"
                  className="bg-slate-800 border-slate-700"
                />
                <p className="text-xs text-slate-500">
                  Must be registered as WhatsApp Business in Brevo
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={saveConfig}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </TabsContent>

        {/* Notification Control Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-400" />
                Notification Control Panel
              </CardTitle>
              <CardDescription>
                Enable or disable specific notification types across all channels
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-300">Notification Type</th>
                      <th className="text-center py-3 px-4 text-slate-300">Email</th>
                      <th className="text-center py-3 px-4 text-slate-300">SMS</th>
                      <th className="text-center py-3 px-4 text-slate-300">WhatsApp</th>
                      <th className="text-center py-3 px-4 text-slate-300">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(notifications).map(([key, value]) => {
                      const isEnabled = value.email || value.sms || value.whatsapp;
                      return (
                        <tr key={key} className="border-b border-slate-800 hover:bg-slate-800/50">
                          <td className="py-3 px-4 text-white font-medium">
                            {key
                              .replace(/([A-Z])/g, ' $1')
                              .replace(/^./, (str) => str.toUpperCase())}
                          </td>
                          <td className="text-center py-3 px-4">
                            <Switch
                              checked={value.email}
                              onCheckedChange={() =>
                                toggleNotification(key as keyof NotificationSettings, 'email')
                              }
                              className="data-[state=checked]:bg-blue-600"
                            />
                          </td>
                          <td className="text-center py-3 px-4">
                            <Switch
                              checked={value.sms}
                              onCheckedChange={() =>
                                toggleNotification(key as keyof NotificationSettings, 'sms')
                              }
                              className="data-[state=checked]:bg-green-600"
                            />
                          </td>
                          <td className="text-center py-3 px-4">
                            <Switch
                              checked={value.whatsapp}
                              onCheckedChange={() =>
                                toggleNotification(key as keyof NotificationSettings, 'whatsapp')
                              }
                              className="data-[state=checked]:bg-emerald-600"
                            />
                          </td>
                          <td className="text-center py-3 px-4">
                            <Badge
                              className={
                                isEnabled
                                  ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                  : 'bg-red-500/20 text-red-400 border-red-500/30'
                              }
                            >
                              {isEnabled ? 'Enabled' : 'Disabled'}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={saveNotificationSettings} className="bg-green-600 hover:bg-green-700">
                  <Save className="w-4 h-4 mr-2" />
                  Save Notification Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Messages Tab */}
        <TabsContent value="test" className="space-y-4">
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube2 className="w-5 h-5 text-purple-400" />
                Test Communication Channels
              </CardTitle>
              <CardDescription>Send test messages to verify your configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Test Email */}
                <Card className="border-blue-500/30 bg-slate-800/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4 text-blue-400" />
                      Test Email
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Recipient Email</Label>
                      <Input
                        type="email"
                        value={testMessage.recipient}
                        onChange={(e) => setTestMessage({ ...testMessage, recipient: e.target.value })}
                        placeholder="test@example.com"
                        className="bg-slate-900 border-slate-700 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Subject</Label>
                      <Input
                        type="text"
                        value={testMessage.subject}
                        onChange={(e) => setTestMessage({ ...testMessage, subject: e.target.value })}
                        placeholder="Test Email"
                        className="bg-slate-900 border-slate-700 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Message</Label>
                      <Textarea
                        value={testMessage.content}
                        onChange={(e) => setTestMessage({ ...testMessage, content: e.target.value })}
                        placeholder="Test message content..."
                        className="bg-slate-900 border-slate-700 text-sm min-h-[80px]"
                      />
                    </div>
                    <Button onClick={testEmail} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-sm">
                      <Send className="w-3 h-3 mr-2" />
                      Send Test Email
                    </Button>
                  </CardContent>
                </Card>

                {/* Test SMS */}
                <Card className="border-green-500/30 bg-slate-800/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Phone className="w-4 h-4 text-green-400" />
                      Test SMS
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Phone Number</Label>
                      <Input
                        type="text"
                        value={testMessage.recipient}
                        onChange={(e) => setTestMessage({ ...testMessage, recipient: e.target.value })}
                        placeholder="917878172050"
                        className="bg-slate-900 border-slate-700 text-sm"
                      />
                      <p className="text-xs text-slate-500">Include country code</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Message</Label>
                      <Textarea
                        value={testMessage.content}
                        onChange={(e) => setTestMessage({ ...testMessage, content: e.target.value })}
                        placeholder="Test SMS message..."
                        className="bg-slate-900 border-slate-700 text-sm min-h-[120px]"
                        maxLength={160}
                      />
                      <p className="text-xs text-slate-500">
                        {testMessage.content.length}/160 characters
                      </p>
                    </div>
                    <Button onClick={testSMS} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-sm">
                      <Send className="w-3 h-3 mr-2" />
                      Send Test SMS
                    </Button>
                  </CardContent>
                </Card>

                {/* Test WhatsApp */}
                <Card className="border-emerald-500/30 bg-slate-800/50">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageCircle className="w-4 h-4 text-emerald-400" />
                      Test WhatsApp
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">WhatsApp Number</Label>
                      <Input
                        type="text"
                        value={testMessage.recipient}
                        onChange={(e) => setTestMessage({ ...testMessage, recipient: e.target.value })}
                        placeholder="4915778559164"
                        className="bg-slate-900 border-slate-700 text-sm"
                      />
                      <p className="text-xs text-slate-500">Include country code</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Message</Label>
                      <Textarea
                        value={testMessage.content}
                        onChange={(e) => setTestMessage({ ...testMessage, content: e.target.value })}
                        placeholder="Test WhatsApp message..."
                        className="bg-slate-900 border-slate-700 text-sm min-h-[120px]"
                      />
                    </div>
                    <Button onClick={testWhatsApp} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-sm">
                      <Send className="w-3 h-3 mr-2" />
                      Send Test WhatsApp
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Broadcast Tab */}
        <TabsContent value="broadcast" className="space-y-4">
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-orange-400" />
                Manual Broadcast System
              </CardTitle>
              <CardDescription>Send bulk messages to all or selected users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Broadcast Title</Label>
                  <Input
                    value={broadcast.title}
                    onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })}
                    placeholder="Important Update"
                    className="bg-slate-800 border-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <select
                    value={broadcast.channel}
                    onChange={(e) =>
                      setBroadcast({ ...broadcast, channel: e.target.value as 'email' | 'sms' | 'whatsapp' })
                    }
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white"
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target Users</Label>
                <select
                  value={broadcast.targetUsers}
                  onChange={(e) =>
                    setBroadcast({ ...broadcast, targetUsers: e.target.value as 'all' | 'selected' })
                  }
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-white"
                >
                  <option value="all">All Users</option>
                  <option value="selected">Selected Users</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  value={broadcast.message}
                  onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
                  placeholder="Enter your broadcast message..."
                  className="bg-slate-800 border-slate-700 min-h-[150px]"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={sendBroadcast}
                  disabled={loading}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {loading ? 'Sending...' : 'Send Broadcast'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Email Statistics */}
            <Card className="border-blue-500/20 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-400" />
                  Email Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Sent</span>
                  <span className="text-white font-semibold">{statistics.email.sent}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Delivered</span>
                  <span className="text-green-400 font-semibold">{statistics.email.delivered}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Opened</span>
                  <span className="text-blue-400 font-semibold">{statistics.email.opened}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Clicked</span>
                  <span className="text-purple-400 font-semibold">{statistics.email.clicked}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Bounced</span>
                  <span className="text-red-400 font-semibold">{statistics.email.bounced}</span>
                </div>
              </CardContent>
            </Card>

            {/* SMS Statistics */}
            <Card className="border-green-500/20 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Phone className="w-4 h-4 text-green-400" />
                  SMS Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Sent</span>
                  <span className="text-white font-semibold">{statistics.sms.sent}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Delivered</span>
                  <span className="text-green-400 font-semibold">{statistics.sms.delivered}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Failed</span>
                  <span className="text-red-400 font-semibold">{statistics.sms.failed}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">Success Rate</span>
                    <span className="text-green-400 font-bold">
                      {statistics.sms.sent > 0
                        ? ((statistics.sms.delivered / statistics.sms.sent) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* WhatsApp Statistics */}
            <Card className="border-emerald-500/20 bg-slate-900/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-400" />
                  WhatsApp Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Sent</span>
                  <span className="text-white font-semibold">{statistics.whatsapp.sent}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Delivered</span>
                  <span className="text-green-400 font-semibold">{statistics.whatsapp.delivered}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">Read</span>
                  <span className="text-blue-400 font-semibold">{statistics.whatsapp.read}</span>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">Read Rate</span>
                    <span className="text-blue-400 font-bold">
                      {statistics.whatsapp.delivered > 0
                        ? ((statistics.whatsapp.read / statistics.whatsapp.delivered) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={loadStatistics} className="border-slate-700">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Statistics
            </Button>
          </div>
        </TabsContent>

        {/* Communication Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <Card className="border-slate-700 bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-green-400" />
                    Communication Logs
                  </CardTitle>
                  <CardDescription>Recent message delivery history</CardDescription>
                </div>
                <Button variant="outline" onClick={loadLogs} className="border-slate-700">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">ID</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">User</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Channel</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Type</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-slate-300 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-500">
                          No communication logs available
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                          <td className="py-3 px-4 text-slate-400 font-mono text-sm">
                            #{log.id.slice(-8)}
                          </td>
                          <td className="py-3 px-4 text-white">{log.user}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {getChannelIcon(log.channel)}
                              <span className="text-white capitalize">{log.channel}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-300">{log.messageType}</td>
                          <td className="py-3 px-4">
                            <Badge className={getStatusColor(log.status)}>
                              {log.status === 'delivered' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {log.status === 'failed' && <XCircle className="w-3 h-3 mr-1" />}
                              {log.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-sm">
                            {new Date(log.timestamp).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
