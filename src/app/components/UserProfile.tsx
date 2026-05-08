// @ts-nocheck
import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import {
  User, Mail, Phone, Copy, Check, Shield, Crown, Star, Wallet, TrendingUp,
  Gift, Share2, QrCode, MessageCircle, Send, Mail as MailIcon, Link as LinkIcon,
  Trophy, Users, Sparkles, BadgeCheck, Camera, Edit3
} from 'lucide-react';
import { toast } from 'sonner';
import { projectId } from '@/utils-ext/supabase/info';
import { getServerUrl } from '@/utils-ext/config/apiConfig';
import { supabase } from '@/utils-ext/supabase/client';

interface Props {
  accessToken: string;
  walletBalance?: number;
  totalProfit?: number;
}

const fmt = (n: number) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopied(false), 1500);
      }}
      className="h-8 px-2 gap-1 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      <span className="text-xs">{label}</span>
    </Button>
  );
}

function StatCard({ icon: Icon, label, value, color = 'cyan', sub }: any) {
  const colorMap: any = {
    cyan: 'from-cyan-500/20 to-blue-500/10 border-cyan-500/30 text-cyan-300',
    emerald: 'from-emerald-500/20 to-green-500/10 border-emerald-500/30 text-emerald-300',
    amber: 'from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300',
    purple: 'from-purple-500/20 to-fuchsia-500/10 border-purple-500/30 text-purple-300',
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className="w-4 h-4 opacity-80" />
        <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      {sub && <div className="text-[10px] text-zinc-400 mt-1">{sub}</div>}
    </div>
  );
}

export default function UserProfile({ accessToken, walletBalance = 0, totalProfit = 0 }: Props) {
  const serverUrl = getServerUrl(projectId);
  const [profile, setProfile] = useState<any>(null);
  const [referralCode, setReferralCode] = useState('');
  const [earnings, setEarnings] = useState<any>({ total_earned: 0, total_pending: 0, successful_count: 0, pending_count: 0 });
  const [referrals, setReferrals] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ reward_amount: 100 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({ full_name: '', mobile: '', photo_url: '' });
  const [shareMsg, setShareMsg] = useState('');

  const referralLink = referralCode
    ? `${window.location.origin}/register?ref=${referralCode}`
    : '';

  const loadAll = async () => {
    try {
      const [meRes, refRes, setRes] = await Promise.all([
        fetch(`${serverUrl}/profile/me`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${serverUrl}/referral/my`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`${serverUrl}/referral/settings`),
      ]);
      const me = await meRes.json();
      const r = await refRes.json();
      const s = await setRes.json();
      if (me.profile) {
        setProfile(me.profile);
        setEditForm({
          full_name: me.profile.full_name || '',
          mobile: me.profile.mobile || '',
          photo_url: me.profile.photo_url || '',
        });
      }
      setReferralCode(me.referralCode || me.profile?.client_id || '');
      if (me.earnings) setEarnings(me.earnings);
      if (r.referrals) setReferrals(r.referrals);
      if (s.settings) {
        setSettings(s.settings);
        // Build default share message from template
        const tpl = s.settings.share_template_whatsapp || '';
        setShareMsg(
          tpl
            .replace(/\{REFERRAL_LINK\}/g, `${window.location.origin}/register?ref=${me.referralCode || me.profile?.client_id || ''}`)
            .replace(/\{REFERRAL_CODE\}/g, me.referralCode || me.profile?.client_id || '')
            .replace(/\{REWARD_AMOUNT\}/g, String(s.settings.reward_amount || 100))
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const saveProfile = async () => {
    try {
      const res = await fetch(`${serverUrl}/profile/me`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const j = await res.json();
      if (j.success) {
        setProfile(j.profile);
        toast.success('Profile updated');
        setEditing(false);
      } else {
        toast.error(j.error || 'Failed');
      }
    } catch {
      toast.error('Network error');
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    setUploadingPhoto(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const photoUrl = pub.publicUrl;
      // Save to profile
      const res = await fetch(`${serverUrl}/profile/me`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_url: photoUrl }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'Save failed');
      setProfile(j.profile);
      setEditForm((f: any) => ({ ...f, photo_url: photoUrl }));
      toast.success('Photo updated');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const shareTo = (platform: string) => {
    const msg = encodeURIComponent(shareMsg);
    const link = encodeURIComponent(referralLink);
    let url = '';
    switch (platform) {
      case 'whatsapp': url = `https://wa.me/?text=${msg}`; break;
      case 'telegram': url = `https://t.me/share/url?url=${link}&text=${msg}`; break;
      case 'twitter': url = `https://twitter.com/intent/tweet?text=${msg}`; break;
      case 'facebook': url = `https://www.facebook.com/sharer/sharer.php?u=${link}`; break;
      case 'email': url = `mailto:?subject=${encodeURIComponent('Join IndexPilot AI')}&body=${msg}`; break;
      default: return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return <div className="text-center py-12 text-zinc-400">Loading profile…</div>;
  }

  const completion = profile?.profile_completion || 20;
  const verified = profile?.kyc_status === 'verified';
  const isVip = (profile?.subscription_plan || '').toUpperCase().includes('PRO') || (profile?.subscription_plan || '').toUpperCase().includes('VIP');

  return (
    <div className="space-y-6">
      {/* PROFILE HERO CARD */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950">
        {/* animated gradient border */}
        <div className="absolute inset-0 rounded-lg p-[2px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 opacity-60 animate-pulse pointer-events-none" />
        <div className="relative bg-zinc-950/90 m-[2px] rounded-lg backdrop-blur-xl">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              {/* Avatar */}
              <div className="relative group">
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 p-[3px]">
                  <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden">
                    {profile?.photo_url ? (
                      <img src={profile.photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-12 h-12 text-zinc-500" />
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  title="Upload photo"
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white flex items-center justify-center border-2 border-zinc-950 shadow-lg"
                >
                  <Camera className="w-4 h-4" />
                </button>
                {verified && (
                  <BadgeCheck className="absolute -top-1 -right-1 w-6 h-6 text-cyan-400 bg-zinc-950 rounded-full p-0.5" />
                )}
              </div>

              {/* Identity */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <h2 className="text-2xl font-bold text-white truncate">
                    {profile?.full_name || 'Trader'}
                  </h2>
                  {isVip && (
                    <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 gap-1">
                      <Crown className="w-3 h-3" /> VIP
                    </Badge>
                  )}
                  {verified && (
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 gap-1">
                      <Shield className="w-3 h-3" /> Verified
                    </Badge>
                  )}
                  <Badge variant="outline" className="border-purple-500/40 text-purple-300 gap-1">
                    <Star className="w-3 h-3" /> {profile?.trading_level || 'Beginner'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-zinc-500 uppercase tracking-wider">Client ID</span>
                  <code className="text-cyan-300 font-mono font-bold text-sm bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                    {profile?.client_id}
                  </code>
                  <CopyButton value={profile?.client_id || ''} label="" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Mail className="w-4 h-4" /> {profile?.email}
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Phone className="w-4 h-4" /> {profile?.mobile || '—'}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-500">Profile Completion</span>
                    <span className="text-cyan-300 font-semibold">{completion}%</span>
                  </div>
                  <Progress value={completion} className="h-2" />
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing((v) => !v)}
                  className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" /> {editing ? 'Cancel' : 'Edit'}
                </Button>
              </div>
            </div>

            {editing && (
              <div className="mt-6 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg space-y-3">
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-400">Full Name</Label>
                    <Input
                      value={editForm.full_name}
                      onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                      className="bg-zinc-950 border-zinc-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">Mobile</Label>
                    <Input
                      value={editForm.mobile}
                      onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                      className="bg-zinc-950 border-zinc-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-400">Photo URL</Label>
                    <Input
                      value={editForm.photo_url}
                      onChange={(e) => setEditForm({ ...editForm, photo_url: e.target.value })}
                      placeholder="https://…"
                      className="bg-zinc-950 border-zinc-700 text-white mt-1"
                    />
                  </div>
                </div>
                <Button onClick={saveProfile} className="bg-cyan-600 hover:bg-cyan-700">
                  Save Changes
                </Button>
              </div>
            )}
          </CardContent>
        </div>
      </Card>

      {/* STAT GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Wallet} label="Wallet" value={fmt(walletBalance)} color="cyan" />
        <StatCard
          icon={TrendingUp}
          label="Total P&L"
          value={fmt(totalProfit)}
          color={totalProfit >= 0 ? 'emerald' : 'amber'}
        />
        <StatCard icon={Gift} label="Referral Earnings" value={fmt(earnings.total_earned)} color="purple" sub={`${earnings.successful_count} successful`} />
        <StatCard icon={Sparkles} label="Plan" value={profile?.subscription_plan || 'Free'} color="amber" sub={profile?.broker_connected ? 'Broker connected' : 'No broker'} />
      </div>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[10px] uppercase text-zinc-500">KYC</div>
            <Badge className={`mt-1 ${verified ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'}`}>
              {profile?.kyc_status || 'pending'}
            </Badge>
          </div>
          <div>
            <div className="text-[10px] uppercase text-zinc-500">Account Status</div>
            <Badge className="mt-1 bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
              {profile?.account_status || 'active'}
            </Badge>
          </div>
          <div>
            <div className="text-[10px] uppercase text-zinc-500">Role</div>
            <div className="text-white font-medium">{profile?.role || 'user'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-zinc-500">Joined</div>
            <div className="text-white">{profile?.joined_at ? new Date(profile.joined_at).toLocaleDateString() : '—'}</div>
          </div>
        </CardContent>
      </Card>

      {/* REFERRAL SECTION */}
      <Tabs defaultValue="invite" className="w-full">
        <TabsList className="bg-zinc-900/50 border border-zinc-800">
          <TabsTrigger value="invite" className="gap-2"><Gift className="w-4 h-4" /> Invite & Earn</TabsTrigger>
          <TabsTrigger value="history" className="gap-2"><Users className="w-4 h-4" /> My Referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="invite" className="space-y-4 mt-4">
          {/* Hero banner */}
          <Card className="border-0 overflow-hidden">
            <div className="relative bg-gradient-to-br from-purple-900 via-fuchsia-900 to-cyan-900 p-6">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-cyan-500/30 rounded-full blur-3xl" />
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-purple-500/30 rounded-full blur-3xl" />
              <div className="relative flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <Badge className="bg-white/10 text-white border-white/20 mb-2">
                    <Sparkles className="w-3 h-3 mr-1" /> Referral Program
                  </Badge>
                  <h3 className="text-3xl font-bold text-white">
                    Earn {fmt(settings.reward_amount || 100)} per friend
                  </h3>
                  <p className="text-white/70 mt-1 text-sm">
                    Share your code. They sign up and trade. You both win.
                  </p>
                </div>
                <Trophy className="w-20 h-20 text-amber-300/80" />
              </div>
            </div>
          </Card>

          {/* Code & Link */}
          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardContent className="p-5 space-y-4">
              <div>
                <Label className="text-xs uppercase text-zinc-500 tracking-wider">Your Referral Code</Label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30 rounded-lg px-4 py-3 text-2xl font-mono font-bold text-cyan-300 text-center">
                    {referralCode}
                  </code>
                  <CopyButton value={referralCode} label="Code" />
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase text-zinc-500 tracking-wider">Your Referral Link</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input readOnly value={referralLink} className="bg-zinc-950 border-zinc-700 text-white text-xs" />
                  <CopyButton value={referralLink} label="Link" />
                </div>
              </div>

              {/* QR */}
              <div className="flex items-center gap-4 p-3 bg-zinc-950/60 rounded-lg border border-zinc-800">
                <img
                  alt="QR"
                  className="w-24 h-24 bg-white p-1 rounded-md"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralLink)}`}
                />
                <div className="flex-1">
                  <div className="text-sm text-white font-semibold flex items-center gap-2">
                    <QrCode className="w-4 h-4" /> Scan to invite
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    Friends scan this code with their phone camera to open your invite link.
                  </div>
                </div>
              </div>

              {/* Editable share message */}
              <div>
                <Label className="text-xs uppercase text-zinc-500 tracking-wider">Share Message</Label>
                <Textarea
                  value={shareMsg}
                  onChange={(e) => setShareMsg(e.target.value)}
                  rows={6}
                  className="mt-1 bg-zinc-950 border-zinc-700 text-white text-sm font-mono"
                />
              </div>

              {/* Share buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Button onClick={() => shareTo('whatsapp')} className="bg-green-600 hover:bg-green-700 gap-1">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </Button>
                <Button onClick={() => shareTo('telegram')} className="bg-sky-600 hover:bg-sky-700 gap-1">
                  <Send className="w-4 h-4" /> Telegram
                </Button>
                <Button onClick={() => shareTo('twitter')} className="bg-zinc-800 hover:bg-zinc-700 gap-1">
                  𝕏 Twitter
                </Button>
                <Button onClick={() => shareTo('facebook')} className="bg-blue-700 hover:bg-blue-800 gap-1">
                  Facebook
                </Button>
                <Button onClick={() => shareTo('email')} variant="outline" className="border-zinc-700 text-zinc-300 gap-1">
                  <MailIcon className="w-4 h-4" /> Email
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Earnings stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Trophy} label="Total Earned" value={fmt(earnings.total_earned)} color="emerald" />
            <StatCard icon={Gift} label="Pending" value={fmt(earnings.total_pending)} color="amber" />
            <StatCard icon={Users} label="Successful" value={earnings.successful_count} color="cyan" />
            <StatCard icon={Users} label="Pending Refs" value={earnings.pending_count} color="purple" />
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="bg-zinc-900/60 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-white">My Referral History</CardTitle>
              <CardDescription>People who joined using your code</CardDescription>
            </CardHeader>
            <CardContent>
              {referrals.length === 0 ? (
                <div className="text-center py-10 text-zinc-500">
                  <Users className="w-10 h-10 mx-auto opacity-30 mb-2" />
                  No referrals yet. Share your code to start earning!
                </div>
              ) : (
                <div className="space-y-2">
                  {referrals.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-800 rounded-lg">
                      <div>
                        <div className="text-sm text-white font-mono">{r.referee_client_id || r.referee_user_id?.slice(0, 8)}</div>
                        <div className="text-xs text-zinc-500">
                          Joined {new Date(r.registered_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge
                          className={
                            r.status === 'rewarded'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }
                        >
                          {r.status}
                        </Badge>
                        {Number(r.reward_amount) > 0 && (
                          <div className="text-emerald-400 text-sm font-bold mt-1">+{fmt(r.reward_amount)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
