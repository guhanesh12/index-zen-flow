// @ts-nocheck
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  MessageSquare,
  Send,
  Plus,
  RefreshCw,
  Mail,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

interface UserSupportProps {
  serverUrl: string;
  accessToken: string;
}

interface SupportTicket {
  id: string;
  subject: string;
  message: string;
  status: 'PENDING' | 'REPLIED' | 'CLOSED';
  urgency: 'URGENT' | 'NORMAL' | 'LOW';
  category: 'TECHNICAL' | 'REFUND' | 'WEBSITE' | 'OTHER';
  adminReply?: string;
  createdAt: string;
  repliedAt?: string;
  unread?: boolean;
}

export function UserSupport({ serverUrl, accessToken }: UserSupportProps) {
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    urgency: 'NORMAL' as const,
    category: 'TECHNICAL' as const
  });

  // Load tickets on mount and every 30 seconds
  useEffect(() => {
    if (!accessToken) {
      console.log('⏳ Waiting for access token before loading tickets...');
      return;
    }
    
    loadTickets();
    const interval = setInterval(loadTickets, 30000);
    return () => clearInterval(interval);
  }, [accessToken]); // Add accessToken as dependency

  // Load all user tickets
  const loadTickets = async () => {
    if (!accessToken) {
      console.log('⏳ Skipping ticket load - no access token');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(`${serverUrl}/support/tickets`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.tickets) {
          setTickets(data.tickets);
          
          // Update unread count in header
          const unreadCount = data.tickets.filter((t: SupportTicket) => t.unread).length;
          window.dispatchEvent(new CustomEvent('support-unread-count', { detail: unreadCount }));
        }
      } else if (response.status === 401) {
        console.error('⚠️ Authentication expired. Token will be refreshed automatically.');
        // Don't show error to user - token refresh will handle this
      } else {
        console.error('Failed to load tickets:', response.status);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create new support ticket
  const handleCreateTicket = async () => {
    // Validate form
    if (!formData.subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    if (!formData.message.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(`${serverUrl}/support/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: formData.subject.trim(),
          message: formData.message.trim(),
          urgency: formData.urgency,
          category: formData.category,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('✅ Ticket created successfully with ID:', data.ticketId);
        toast.success(`Ticket created! ID: ${data.ticketId}`);
        
        // Reset form
        setFormData({
          subject: '',
          message: '',
          urgency: 'NORMAL',
          category: 'TECHNICAL'
        });
        
        // Close dialog
        setIsCreateDialogOpen(false);
        
        // Reload tickets
        await loadTickets();
      } else {
        console.error('❌ Failed to create ticket:', data.message);
        toast.error(data.message || 'Failed to create ticket');
      }
    } catch (error) {
      console.error('Error creating ticket:', error);
      toast.error('Error creating ticket');
    } finally {
      setIsCreating(false);
    }
  };

  // Mark ticket as read
  const markAsRead = async (ticketId: string) => {
    try {
      await fetch(`${serverUrl}/support/mark-read/${ticketId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      await loadTickets();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  // View ticket details
  const viewTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    if (ticket.unread) {
      markAsRead(ticket.id);
    }
  };

  // Helper functions for styling
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

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'PENDING': return <AlertCircle className="size-4" />;
      case 'REPLIED': return <CheckCircle2 className="size-4" />;
      case 'CLOSED': return <XCircle className="size-4" />;
      default: return <MessageSquare className="size-4" />;
    }
  };

  const stats = {
    total: tickets.length,
    pending: tickets.filter(t => t.status === 'PENDING').length,
    replied: tickets.filter(t => t.status === 'REPLIED').length,
    unread: tickets.filter(t => t.unread).length,
  };

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-blue-500/30 backdrop-blur-sm shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <motion.div 
                  className="p-3 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl shadow-lg"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <MessageSquare className="size-7 text-blue-400" />
                </motion.div>
                <div>
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Support Center
                  </h2>
                  <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                    <Sparkles className="size-3" />
                    Get help from our support team
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={loadTickets}
                  variant="outline"
                  className="bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                  disabled={loading}
                >
                  <RefreshCw className={`size-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button 
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/30"
                >
                  <Plus className="size-4 mr-2" />
                  New Ticket
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-br from-blue-900/30 to-slate-900/30 border-blue-500/30 hover:border-blue-400/50 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Tickets</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.total}</p>
                </div>
                <MessageSquare className="size-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-gradient-to-br from-yellow-900/30 to-slate-900/30 border-yellow-500/30 hover:border-yellow-400/50 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Pending</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.pending}</p>
                </div>
                <Clock className="size-8 text-yellow-400" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-gradient-to-br from-green-900/30 to-slate-900/30 border-green-500/30 hover:border-green-400/50 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Replied</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.replied}</p>
                </div>
                <CheckCircle2 className="size-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-gradient-to-br from-purple-900/30 to-slate-900/30 border-purple-500/30 hover:border-purple-400/50 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Unread Replies</p>
                  <p className="text-3xl font-bold text-white mt-2">{stats.unread}</p>
                </div>
                <Mail className="size-8 text-purple-400" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Tickets List */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-white">Your Support Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && tickets.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-8 animate-spin text-blue-400" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="size-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg">No support tickets yet</p>
              <p className="text-slate-500 text-sm mt-2">Create your first ticket to get help</p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {tickets.map((ticket, index) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card 
                      className={`bg-slate-900/50 border-slate-700 hover:border-blue-500/50 transition-all cursor-pointer ${
                        ticket.unread ? 'border-blue-500/50 shadow-lg shadow-blue-500/10' : ''
                      }`}
                      onClick={() => viewTicket(ticket)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {ticket.unread && (
                                <div className="size-2 rounded-full bg-blue-500 animate-pulse" />
                              )}
                              <h3 className="font-semibold text-white truncate">{ticket.subject}</h3>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs text-slate-500 font-mono">ID: {ticket.id}</span>
                            </div>
                            <p className="text-sm text-slate-400 line-clamp-2">{ticket.message}</p>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <Badge variant="outline" className={getStatusColor(ticket.status)}>
                                {getStatusIcon(ticket.status)}
                                <span className="ml-1">{ticket.status}</span>
                              </Badge>
                              <Badge variant="outline" className={getUrgencyColor(ticket.urgency)}>
                                {ticket.urgency}
                              </Badge>
                              <Badge variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600">
                                {getCategoryLabel(ticket.category)}
                              </Badge>
                              <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Clock className="size-3" />
                                {new Date(ticket.createdAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Ticket Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-slate-800 border-blue-500/30 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white flex items-center gap-2">
              <MessageSquare className="size-6 text-blue-400" />
              Create Support Ticket
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Describe your issue and our support team will get back to you soon.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-slate-300">Subject *</Label>
              <Input
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Brief description of your issue"
                className="bg-slate-900/50 border-slate-700 text-white"
                disabled={isCreating}
                maxLength={200}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Urgency Level *</Label>
                <Select
                  value={formData.urgency}
                  onValueChange={(value: 'URGENT' | 'NORMAL' | 'LOW') => {
                    console.log('Urgency changed to:', value);
                    setFormData({ ...formData, urgency: value });
                  }}
                  disabled={isCreating}
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                    <SelectValue placeholder="Select urgency" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 z-[100000]">
                    <SelectItem value="URGENT" className="text-white hover:bg-slate-700 cursor-pointer">
                      🔴 Urgent
                    </SelectItem>
                    <SelectItem value="NORMAL" className="text-white hover:bg-slate-700 cursor-pointer">
                      🔵 Normal
                    </SelectItem>
                    <SelectItem value="LOW" className="text-white hover:bg-slate-700 cursor-pointer">
                      ⚪ Low
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: 'TECHNICAL' | 'REFUND' | 'WEBSITE' | 'OTHER') => {
                    console.log('Category changed to:', value);
                    setFormData({ ...formData, category: value });
                  }}
                  disabled={isCreating}
                >
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 z-[100000]">
                    <SelectItem value="TECHNICAL" className="text-white hover:bg-slate-700 cursor-pointer">
                      🔧 Technical
                    </SelectItem>
                    <SelectItem value="REFUND" className="text-white hover:bg-slate-700 cursor-pointer">
                      💰 Refund
                    </SelectItem>
                    <SelectItem value="WEBSITE" className="text-white hover:bg-slate-700 cursor-pointer">
                      🌐 Website
                    </SelectItem>
                    <SelectItem value="OTHER" className="text-white hover:bg-slate-700 cursor-pointer">
                      📋 Other
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300">Message *</Label>
              <Textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Describe your issue in detail..."
                className="min-h-48 bg-slate-900/50 border-slate-700 text-white resize-none"
                disabled={isCreating}
                maxLength={2000}
              />
              <p className="text-xs text-slate-500 text-right">
                {formData.message.length} / 2000 characters
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-slate-700">
              <Button
                type="button"
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  setFormData({
                    subject: '',
                    message: '',
                    urgency: 'NORMAL',
                    category: 'TECHNICAL'
                  });
                }}
                variant="outline"
                className="bg-slate-700/50 border-slate-600 hover:bg-slate-700"
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateTicket}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                disabled={isCreating || !formData.subject.trim() || !formData.message.trim()}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Send className="size-4 mr-2" />
                    Create Ticket
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Ticket Dialog */}
      {selectedTicket && (
        <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
          <DialogContent className="bg-slate-800 border-blue-500/30 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-white">
                {selectedTicket.subject}
              </DialogTitle>
              <p className="text-xs text-slate-500 font-mono mt-1">Ticket ID: {selectedTicket.id}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline" className={getStatusColor(selectedTicket.status)}>
                  {getStatusIcon(selectedTicket.status)}
                  <span className="ml-1">{selectedTicket.status}</span>
                </Badge>
                <Badge variant="outline" className={getUrgencyColor(selectedTicket.urgency)}>
                  {selectedTicket.urgency}
                </Badge>
                <Badge variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600">
                  {getCategoryLabel(selectedTicket.category)}
                </Badge>
              </div>
            </DialogHeader>

            <div className="space-y-6 mt-4">
              {/* Original Message */}
              <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <div className="size-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Mail className="size-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Your Message</p>
                    <p className="text-xs text-slate-400">
                      {new Date(selectedTicket.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <p className="text-slate-300 whitespace-pre-wrap">{selectedTicket.message}</p>
              </div>

              {/* Admin Reply */}
              {selectedTicket.adminReply && (
                <div className="bg-green-900/20 rounded-lg p-4 border border-green-500/30">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="size-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle2 className="size-4 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Support Team Reply</p>
                      {selectedTicket.repliedAt && (
                        <p className="text-xs text-slate-400">
                          {new Date(selectedTicket.repliedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-300 whitespace-pre-wrap">{selectedTicket.adminReply}</p>
                </div>
              )}

              {/* Pending Message */}
              {selectedTicket.status === 'PENDING' && !selectedTicket.adminReply && (
                <div className="bg-yellow-900/20 rounded-lg p-4 border border-yellow-500/30">
                  <div className="flex items-center gap-2">
                    <Clock className="size-5 text-yellow-400" />
                    <p className="text-yellow-400 font-medium">
                      Your ticket is pending review. Our support team will respond soon.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-700 mt-6">
              <Button
                onClick={() => setSelectedTicket(null)}
                className="bg-slate-700 hover:bg-slate-600"
              >
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}