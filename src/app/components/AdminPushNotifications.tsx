import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Bell,
  Send,
  History,
  Users,
  Image as ImageIcon,
  Link as LinkIcon,
  CheckCircle,
  AlertCircle,
  Trash2,
  Eye,
  Upload
} from 'lucide-react';
import { motion } from 'motion/react';

interface PushNotification {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  targetUrl?: string;
  sentTime: string;
  totalDelivered: number;
  status: 'sent' | 'failed' | 'pending';
}

interface Subscriber {
  id: string;
  userId?: string;
  deviceToken: string;
  browser: string;
  device: string;
  createdAt: string;
}

interface AdminPushNotificationsProps {
  serverUrl: string;
  accessToken: string;
}

export function AdminPushNotifications({ serverUrl, accessToken }: AdminPushNotificationsProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [history, setHistory] = useState<PushNotification[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    loadHistory();
    loadSubscribers();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await fetch(`${serverUrl}/push/history`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setHistory(data.notifications || []);
      } else {
        console.error('Failed to load notification history:', data.message);
      }
    } catch (err: any) {
      console.error('Error loading notification history:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSubscribers = async () => {
    try {
      const response = await fetch(`${serverUrl}/push/subscribers`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setSubscribers(data.subscribers || []);
      } else {
        console.error('Failed to load subscribers:', data.message);
      }
    } catch (err: any) {
      console.error('Error loading subscribers:', err);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed.');
      return;
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setError('File size too large. Maximum size is 5MB.');
      return;
    }
    
    setSelectedImage(file);
    setError(null);
    
    // Create preview URL
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImageUrl('');
  };

  const handleSendNotification = async () => {
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required');
      return;
    }

    console.log('📤 Starting notification send process...');
    console.log('📋 Title:', title);
    console.log('📋 Description:', description);
    console.log('📋 Target URL:', targetUrl);
    console.log('🖼️ Has Image:', !!selectedImage);

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      let finalImageUrl = '';
      
      // Upload image if selected
      if (selectedImage) {
        console.log('📸 Uploading image...');
        setUploadingImage(true);
        
        const formData = new FormData();
        formData.append('image', selectedImage);
        
        const uploadResponse = await fetch(`${serverUrl}/push/upload-image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
          body: formData,
        });
        
        const uploadData = await uploadResponse.json();
        console.log('📸 Image upload response:', uploadData);
        
        if (!uploadData.success) {
          console.error('❌ Image upload failed:', uploadData.message);
          setError(uploadData.message || 'Failed to upload image');
          setSending(false);
          setUploadingImage(false);
          return;
        }
        
        finalImageUrl = uploadData.imageUrl;
        console.log('✅ Image uploaded successfully:', finalImageUrl);
        setUploadingImage(false);
      }

      console.log('🚀 Sending notification to server...');
      console.log('📦 Payload:', {
        title,
        description,
        imageUrl: finalImageUrl || undefined,
        targetUrl: targetUrl || undefined,
      });

      const response = await fetch(`${serverUrl}/push/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title,
          description,
          imageUrl: finalImageUrl || undefined,
          targetUrl: targetUrl || undefined,
        }),
      });

      const data = await response.json();
      console.log('📡 Server response:', data);

      if (data.success) {
        console.log(`✅ Notification sent successfully to ${data.totalDelivered} users!`);
        setSuccess(`Notification sent to ${data.totalDelivered} users!`);
        setTitle('');
        setDescription('');
        setImageUrl('');
        setTargetUrl('');
        setSelectedImage(null);
        
        console.log('🔄 Refreshing notification history...');
        loadHistory(); // Refresh history
        
        // Clear success message after 5 seconds
        setTimeout(() => setSuccess(null), 5000);
      } else {
        console.error('❌ Notification send failed:', data.message);
        setError(data.message || 'Failed to send notification');
      }
    } catch (err: any) {
      console.error('❌ Error sending notification:', err);
      setError(err.message || 'Error sending notification');
    } finally {
      setSending(false);
      setUploadingImage(false);
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) {
      return;
    }

    console.log('🗑️ Deleting notification:', notificationId);
    console.log('📊 Current history before delete:', history.length, 'notifications');

    try {
      const response = await fetch(`${serverUrl}/push/notification/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      const data = await response.json();
      console.log('📡 Delete response:', data);

      if (data.success) {
        // Remove the deleted notification from local state
        const updatedHistory = history.filter(n => n.id !== notificationId);
        console.log('✅ Notification deleted. New history count:', updatedHistory.length);
        console.log('✅ Removed notification ID:', notificationId);
        setHistory(updatedHistory);
        
        // Show success message
        setSuccess('Notification deleted successfully!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        console.error('❌ Failed to delete:', data.message);
        setError('Failed to delete notification: ' + data.message);
        setTimeout(() => setError(null), 5000);
      }
    } catch (err: any) {
      console.error('❌ Error during delete:', err);
      setError('Error deleting notification: ' + err.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="size-6 text-purple-400" />
            Push Notification Management
          </h2>
          <p className="text-slate-400">Send real-time notifications to all website users</p>
        </div>
        <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 px-4 py-2">
          <Users className="size-4 mr-2" />
          {subscribers.length} Subscribers
        </Badge>
      </div>

      {/* Info Banner */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }}
        className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4"
      >
        <div className="flex items-start gap-3">
          <Bell className="size-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-blue-400 mb-1">Auto-Send to All Users</h4>
            <p className="text-sm text-slate-300">
              Notifications are automatically sent to <strong>all registered users</strong> via Firebase Cloud Messaging (FCM). 
              No subscription required - every user will receive the notification. Make sure you have configured the 
              <strong> FIREBASE_SERVER_KEY</strong> environment variable in Supabase.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Firebase Server Key Setup Instructions */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }}
        className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="size-5 text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-orange-400">Configure Firebase Server Key</h4>
            <p className="text-sm text-slate-300">
              To enable push notifications, you need to add the <strong>FIREBASE_SERVER_KEY</strong> to Supabase:
            </p>
            <ol className="text-sm text-slate-300 list-decimal list-inside space-y-1 ml-2">
              <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Firebase Console</a></li>
              <li>Select your project: <strong className="text-white">algo-app-615ae</strong></li>
              <li>Click the gear icon ⚙️ → <strong>Project Settings</strong></li>
              <li>Go to the <strong>Cloud Messaging</strong> tab</li>
              <li>Under "Cloud Messaging API (Legacy)", copy the <strong>Server key</strong></li>
              <li>Go to <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Supabase Dashboard</a></li>
              <li>Go to <strong>Project Settings</strong> → <strong>Edge Functions</strong> → <strong>Secrets</strong></li>
              <li>Add a new secret: <code className="bg-slate-800 px-2 py-1 rounded text-cyan-400">FIREBASE_SERVER_KEY</code> with your server key value</li>
            </ol>
            <p className="text-xs text-slate-400 mt-2">
              Note: The VAPID key and Firebase config are already configured in the code.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Success Message */}
      {success && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="bg-green-500/10 border border-green-500/30 rounded-lg p-4"
        >
          <div className="flex items-center gap-3">
            <CheckCircle className="size-5 text-green-400" />
            <p className="text-green-400 font-medium">{success}</p>
          </div>
        </motion.div>
      )}

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-4"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="size-5 text-red-400" />
            <p className="text-red-400 font-medium">{error}</p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create Notification Section */}
        <Card className="border-purple-500/20 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-5 text-purple-400" />
              Create Notification
            </CardTitle>
            <CardDescription>Compose and send push notifications to all users</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="notif-title">Notification Title *</Label>
              <Input
                id="notif-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Market Alert: BankNifty Breakout"
                className="bg-slate-800 border-slate-700"
                maxLength={100}
              />
              <p className="text-xs text-slate-500">{title.length}/100 characters</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="notif-description">Notification Description *</Label>
              <Textarea
                id="notif-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="BankNifty has broken resistance. Check the latest trading signal."
                className="bg-slate-800 border-slate-700 min-h-[100px]"
                maxLength={300}
              />
              <p className="text-xs text-slate-500">{description.length}/300 characters</p>
            </div>

            {/* Upload Image */}
            <div className="space-y-2">
              <Label htmlFor="upload-image" className="flex items-center gap-2">
                <Upload className="size-4" />
                Upload Image (Optional)
              </Label>
              <Input
                id="upload-image"
                type="file"
                accept="image/jpeg, image/jpg, image/png, image/webp, image/gif"
                onChange={handleImageSelect}
                className="bg-slate-800 border-slate-700"
              />
              <p className="text-xs text-slate-500">Select an image file (JPEG, PNG, WEBP, or GIF, max 5MB)</p>
              
              {/* Image Preview & Remove */}
              {selectedImage && (
                <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg p-3 mt-2">
                  <div className="flex items-center gap-3">
                    <ImageIcon className="size-5 text-purple-400" />
                    <div>
                      <p className="text-sm text-white font-medium">{selectedImage.name}</p>
                      <p className="text-xs text-slate-500">
                        {(selectedImage.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleRemoveImage}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Target URL */}
            <div className="space-y-2">
              <Label htmlFor="notif-url" className="flex items-center gap-2">
                <LinkIcon className="size-4" />
                Target URL (Optional)
              </Label>
              <Input
                id="notif-url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="/dashboard or /signals"
                className="bg-slate-800 border-slate-700"
              />
              <p className="text-xs text-slate-500">URL to redirect when user clicks the notification</p>
            </div>

            {/* Send Button */}
            <Button 
              onClick={handleSendNotification}
              disabled={sending || !title.trim() || !description.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="size-4 mr-2" />
                  Send Push Notification
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Preview Section */}
        <Card className="border-blue-500/20 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-5 text-blue-400" />
              Live Preview
            </CardTitle>
            <CardDescription>Preview how the notification will appear</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Notification Preview */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
              {/* App Name */}
              <div className="flex items-center gap-2">
                <div className="size-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Bell className="size-4 text-white" />
                </div>
                <span className="text-sm font-medium text-slate-400">IndexpilotAI</span>
              </div>

              {/* Title */}
              <h4 className="text-white font-semibold">
                {title || 'Notification Title'}
              </h4>

              {/* Description */}
              <p className="text-slate-300 text-sm">
                {description || 'Notification description will appear here...'}
              </p>

              {/* Image Preview */}
              {imageUrl && (
                <div className="rounded-lg overflow-hidden border border-slate-700">
                  <img 
                    src={imageUrl} 
                    alt="Notification preview"
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              {/* Target URL */}
              {targetUrl && (
                <div className="text-xs text-cyan-400">
                  <LinkIcon className="size-3 inline mr-1" />
                  {targetUrl}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notification History Section */}
      <Card className="border-slate-700 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5 text-orange-400" />
            Notification History
          </CardTitle>
          <CardDescription>View all previously sent notifications</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="size-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400 mt-4">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="size-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No notifications sent yet</p>
              <p className="text-slate-500 text-sm mt-1">Create and send your first notification above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Title</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Description</th>
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Sent Time</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Delivered</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Status</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((notification) => (
                    <tr key={notification.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                      <td className="py-3 px-4 text-white font-medium max-w-xs truncate">
                        {notification.title}
                      </td>
                      <td className="py-3 px-4 text-slate-300 text-sm max-w-md truncate">
                        {notification.description}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-sm whitespace-nowrap">
                        {formatDate(notification.sentTime)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                          {notification.totalDelivered}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {notification.status === 'sent' ? (
                          <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                            <CheckCircle className="size-3 mr-1" />
                            Sent
                          </Badge>
                        ) : notification.status === 'failed' ? (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                            <AlertCircle className="size-3 mr-1" />
                            Failed
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Button
                          onClick={() => handleDeleteNotification(notification.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminPushNotifications;