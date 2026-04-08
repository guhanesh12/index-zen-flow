import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  MessageSquare,
  Send,
  Search,
  RefreshCw,
  Mail,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Reply,
  Trash2
} from 'lucide-react';
import { motion } from 'motion/react';
// import { toast } from 'sonner';

interface AdminSupportProps {
  serverUrl: string;
  accessToken: string;
}

interface SupportMessage {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'PENDING' | 'REPLIED' | 'CLOSED';
  urgency: 'URGENT' | 'NORMAL' | 'LOW';
  category: 'TECHNICAL' | 'REFUND' | 'WEBSITE' | 'OTHER';
  adminReply?: string;
  createdAt: string;
  repliedAt?: string;
}

interface TicketStats {
  total: number;
  pending: number;
  replied: number;
  closed: number;
}

export function AdminSupport({ serverUrl, accessToken }: AdminSupportProps) {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<SupportMessage[]>([]);
  const [stats, setStats] = useState<TicketStats>({ total: 0, pending: 0, replied: 0, closed: 0 });
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'replied' | 'closed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<SupportMessage | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    filterMessages();
  }, [messages, activeTab, searchQuery]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/admin/support/tickets`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMessages(data.tickets || []);
          setStats(data.stats || { total: 0, pending: 0, replied: 0, closed: 0 });
          
          // Dispatch event for admin pending count
          window.dispatchEvent(new CustomEvent('admin-pending-support-count', { detail: data.stats?.pending || 0 }));
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      // toast.error('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  const filterMessages = () => {
    let filtered = messages;

    // Filter by status
    if (activeTab !== 'all') {
      filtered = filtered.filter(m => m.status.toLowerCase() === activeTab);
    }

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(m =>
        m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredMessages(filtered);
  };

  const sendReply = async (messageId: string) => {
    if (!replyText.trim()) {
      // toast.error('Please enter a reply');
      return;
    }

    setSending(true);
    try {
      const response = await fetch(`${serverUrl}/admin/support/reply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          reply: replyText,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // toast.success('Reply sent successfully!');
          setReplyText('');
          setSelectedMessage(null);
          loadMessages(); // Reload messages
        } else {
          // toast.error(data.message || 'Failed to send reply');
        }
      } else {
        // toast.error('Failed to send reply');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      // toast.error('Error sending reply');
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async (messageId: string) => {
    try {
      const response = await fetch(`${serverUrl}/admin/support/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // toast.success('Ticket closed');
          loadMessages();
        }
      }
    } catch (error) {
      console.error('Error closing ticket:', error);
      // toast.error('Failed to close ticket');
    }
  };

  const deleteTicket = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this ticket?')) return;

    try {
      const response = await fetch(`${serverUrl}/admin/support/delete/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        // toast.success('Ticket deleted');
        loadMessages();
      }
    } catch (error) {
      console.error('Error deleting ticket:', error);
      // toast.error('Failed to delete ticket');
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'PENDING': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500';
      case 'REPLIED': return 'bg-green-500/10 text-green-400 border-green-500';
      case 'CLOSED': return 'bg-slate-500/10 text-slate-400 border-slate-500';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch(urgency) {
      case 'URGENT': return 'bg-red-500/10 text-red-400 border-red-500';
      case 'NORMAL': return 'bg-blue-500/10 text-blue-400 border-blue-500';
      case 'LOW': return 'bg-gray-500/10 text-gray-400 border-gray-500';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500';
    }
  };

  const getCategoryLabel = (category: string) => {
    switch(category) {
      case 'TECHNICAL': return 'Technical';
      case 'REFUND': return 'Refund';
      case 'WEBSITE': return 'Website';
      case 'OTHER': return 'Other';
      default: return category;
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch(urgency) {
      case 'URGENT': return '🔴';
      case 'NORMAL': return '🔵';
      case 'LOW': return '⚪';
      default: return '🔵';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch(category) {
      case 'TECHNICAL': return '🔧';
      case 'REFUND': return '💰';
      case 'WEBSITE': return '🌐';
      case 'OTHER': return '📋';
      default: return '📋';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <MessageSquare className="size-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Support Management</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Manage support tickets and customer inquiries
                  </p>
                </div>
              </div>
              <Button
                onClick={loadMessages}
                variant="outline"
                className="bg-slate-700/50 border-slate-600"
                disabled={loading}
              >
                <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-slate-800/50 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Tickets</p>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
              </div>
              <MessageSquare className="size-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-yellow-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Pending</p>
                <p className="text-3xl font-bold text-yellow-400">{stats.pending}</p>
              </div>
              <AlertCircle className="size-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Replied</p>
                <p className="text-3xl font-bold text-green-400">{stats.replied}</p>
              </div>
              <CheckCircle2 className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Closed</p>
                <p className="text-3xl font-bold text-slate-400">{stats.closed}</p>
              </div>
              <XCircle className="size-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="bg-slate-800/50 border-blue-500/20">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by subject, message, name, or email..."
                className="pl-10 bg-slate-900/50 border-slate-700"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs and Messages */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="bg-slate-800/50 border border-blue-500/20">
          <TabsTrigger value="all" className="data-[state=active]:bg-blue-600">
            All ({stats.total})
          </TabsTrigger>
          <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-600">
            Pending ({stats.pending})
          </TabsTrigger>
          <TabsTrigger value="replied" className="data-[state=active]:bg-green-600">
            Replied ({stats.replied})
          </TabsTrigger>
          <TabsTrigger value="closed" className="data-[state=active]:bg-slate-600">
            Closed ({stats.closed})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center h-96">
              <RefreshCw className="size-8 animate-spin text-blue-400" />
            </div>
          ) : filteredMessages.length === 0 ? (
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="pt-12 pb-12 text-center">
                <MessageSquare className="size-16 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">No tickets found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className={`bg-slate-800/50 border-${msg.status === 'PENDING' ? 'yellow' : msg.status === 'REPLIED' ? 'green' : 'slate'}-500/20`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <Badge variant="outline" className={getStatusColor(msg.status)}>
                              {msg.status}
                            </Badge>
                            <Badge variant="outline" className={getUrgencyColor(msg.urgency)}>
                              {getUrgencyIcon(msg.urgency)} {msg.urgency}
                            </Badge>
                            <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500">
                              {getCategoryIcon(msg.category)} {getCategoryLabel(msg.category)}
                            </Badge>
                            <span className="text-sm text-slate-400 flex items-center gap-2">
                              <Clock className="size-3" />
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold text-white mb-2">{msg.subject}</h3>
                          <div className="flex items-center gap-4 text-sm text-slate-400 mb-2">
                            <span className="text-xs text-slate-500 font-mono bg-slate-800/50 px-2 py-1 rounded border border-slate-700">
                              Ticket ID: {msg.id}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-400">
                            <span className="flex items-center gap-2">
                              <User className="size-4" />
                              {msg.userName}
                            </span>
                            <span className="flex items-center gap-2">
                              <Mail className="size-4" />
                              {msg.userEmail}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {msg.status !== 'CLOSED' && (
                            <>
                              <Button
                                onClick={() => setSelectedMessage(msg)}
                                variant="outline"
                                size="sm"
                                className="bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30"
                              >
                                <Reply className="size-4 mr-2" />
                                Reply
                              </Button>
                              <Button
                                onClick={() => closeTicket(msg.id)}
                                variant="outline"
                                size="sm"
                                className="bg-slate-700/50 border-slate-600"
                              >
                                Close
                              </Button>
                            </>
                          )}
                          <Button
                            onClick={() => deleteTicket(msg.id)}
                            variant="outline"
                            size="sm"
                            className="bg-red-600/20 border-red-500 text-red-400 hover:bg-red-600/30"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 mb-4">
                        <p className="text-sm text-slate-300 whitespace-pre-wrap">{msg.message}</p>
                      </div>
                      
                      {msg.adminReply && (
                        <div className="bg-green-500/10 p-4 rounded-lg border border-green-500/30">
                          <div className="flex items-center gap-2 mb-2">
                            <Reply className="size-4 text-green-400" />
                            <span className="text-sm font-semibold text-green-400">Your Reply</span>
                            {msg.repliedAt && (
                              <span className="text-xs text-slate-400">
                                • {new Date(msg.repliedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-300 whitespace-pre-wrap">{msg.adminReply}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Reply Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-slate-800 rounded-lg border border-blue-500/30 max-w-2xl w-full"
          >
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Reply className="size-5 text-blue-400" />
                Reply to Support Ticket
              </h3>
              <p className="text-sm text-slate-400 mt-1">
                Ticket: {selectedMessage.subject}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <p className="text-xs text-slate-400 mb-2">Original Message:</p>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{selectedMessage.message}</p>
              </div>
              <div>
                <label className="text-sm text-slate-300 mb-2 block">Your Reply:</label>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type your reply here..."
                  className="min-h-48 bg-slate-900/50 border-slate-700"
                  disabled={sending}
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-700 flex gap-3 justify-end">
              <Button
                onClick={() => {
                  setSelectedMessage(null);
                  setReplyText('');
                }}
                variant="outline"
                className="bg-slate-700/50 border-slate-600"
                disabled={sending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => sendReply(selectedMessage.id)}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={sending}
              >
                <Send className="size-4 mr-2" />
                {sending ? 'Sending...' : 'Send Reply'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}