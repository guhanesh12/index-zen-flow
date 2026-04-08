// @ts-nocheck
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { 
  Zap, 
  TrendingUp, 
  Plus, 
  CheckCircle2, 
  Clock,
  Sparkles,
  Target,
  Activity,
  MessageSquare
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

interface Strategy {
  id: string;
  name: string;
  description: string;
  type: 'DEFAULT' | 'CUSTOM';
  status: 'ACTIVE' | 'PENDING' | 'DISABLED';
  icon: any;
  color: string;
}

interface StrategyManagerProps {
  serverUrl: string;
  accessToken: string;
}

export function StrategyManager({ serverUrl, accessToken }: StrategyManagerProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([
    {
      id: 'ai_advanced',
      name: 'AI Advanced Strategy',
      description: 'Triple-layer AI analysis with EMA, VWAP, and pattern recognition for high-probability trades',
      type: 'DEFAULT',
      status: 'ACTIVE',
      icon: Sparkles,
      color: 'from-cyan-500 to-blue-600'
    },
    {
      id: 'futures',
      name: 'Futures Strategy',
      description: 'Automated futures trading with momentum-based entry and exit signals',
      type: 'DEFAULT',
      status: 'ACTIVE',
      icon: TrendingUp,
      color: 'from-purple-500 to-pink-600'
    }
  ]);

  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [strategyRequest, setStrategyRequest] = useState({
    strategyName: '',
    strategyDetails: ''
  });

  // Load custom strategies from backend
  useEffect(() => {
    loadCustomStrategies();
  }, []);

  const loadCustomStrategies = async () => {
    try {
      const response = await fetch(`${serverUrl}/user/custom-strategies`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.strategies) {
          const customStrategies = data.strategies.map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            type: 'CUSTOM',
            status: s.status,
            icon: Target,
            color: 'from-emerald-500 to-green-600'
          }));
          
          // Merge with default strategies
          setStrategies(prev => {
            const defaultStrategies = prev.filter(s => s.type === 'DEFAULT');
            return [...defaultStrategies, ...customStrategies];
          });
        }
      }
    } catch (error) {
      console.error('Error loading custom strategies:', error);
    }
  };

  const handleRequestCustomStrategy = async () => {
    // Validate form
    if (!strategyRequest.strategyName.trim()) {
      toast.error('Please enter strategy name');
      return;
    }
    if (!strategyRequest.strategyDetails.trim()) {
      toast.error('Please describe your strategy requirements');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create support ticket for strategy request
      const response = await fetch(`${serverUrl}/support/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: `Custom Strategy Request: ${strategyRequest.strategyName}`,
          message: `**Strategy Name:** ${strategyRequest.strategyName}\n\n**Strategy Details:**\n${strategyRequest.strategyDetails}\n\n---\nThis is an automated strategy request. Admin: Please review and implement this custom trading strategy.`,
          urgency: 'NORMAL',
          category: 'TECHNICAL',
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Strategy request submitted successfully!');
        toast.info('Our team will review and implement your strategy', {
          duration: 5000
        });
        
        // Reset form
        setStrategyRequest({
          strategyName: '',
          strategyDetails: ''
        });
        
        // Close dialog
        setIsRequestDialogOpen(false);
        
        // Reload strategies
        await loadCustomStrategies();
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error submitting strategy request:', error);
      toast.error('Error submitting request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-400" />
            Trading Strategies
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Manage your AI-powered trading strategies
          </p>
        </div>
        <Button
          onClick={() => setIsRequestDialogOpen(true)}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Request Custom Strategy
        </Button>
      </div>

      {/* Strategies Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {strategies.map((strategy, index) => (
          <motion.div
            key={strategy.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-all group">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${strategy.color} bg-opacity-20 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <strategy.icon className="w-6 h-6 text-white" />
                  </div>
                  <Badge 
                    variant={strategy.status === 'ACTIVE' ? 'default' : 'secondary'}
                    className={
                      strategy.status === 'ACTIVE' 
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                        : strategy.status === 'PENDING'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                        : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                    }
                  >
                    {strategy.status === 'ACTIVE' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {strategy.status === 'PENDING' && <Clock className="w-3 h-3 mr-1" />}
                    {strategy.status}
                  </Badge>
                </div>
                <CardTitle className="text-white text-lg">{strategy.name}</CardTitle>
                <CardDescription className="text-slate-400 text-sm">
                  {strategy.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant="outline" 
                    className="text-xs border-slate-700 text-slate-400"
                  >
                    {strategy.type}
                  </Badge>
                  {strategy.type === 'DEFAULT' && (
                    <Badge 
                      variant="outline" 
                      className="text-xs border-blue-500/30 text-blue-400"
                    >
                      <Zap className="w-3 h-3 mr-1" />
                      Built-in
                    </Badge>
                  )}
                  {strategy.status === 'PENDING' && (
                    <Badge 
                      variant="outline" 
                      className="text-xs border-amber-500/30 text-amber-400"
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      Under Review
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Request New Strategy Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: strategies.length * 0.1 }}
        >
          <Card 
            className="bg-slate-900/30 border-slate-800 border-dashed hover:border-purple-500/50 transition-all cursor-pointer group h-full flex items-center justify-center"
            onClick={() => setIsRequestDialogOpen(true)}
          >
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-600/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Request Custom Strategy</h3>
              <p className="text-sm text-slate-400 text-center">
                Need a custom trading strategy? Let us know!
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Request Custom Strategy Dialog */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-white flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-purple-400" />
              Request Custom Strategy
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Describe your custom trading strategy requirements. Our team will review and implement it for you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="strategyName" className="text-white">Strategy Name *</Label>
              <input
                id="strategyName"
                type="text"
                value={strategyRequest.strategyName}
                onChange={(e) => setStrategyRequest({ ...strategyRequest, strategyName: e.target.value })}
                placeholder="e.g., Scalping Strategy, Breakout Strategy"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all mt-2"
              />
            </div>

            <div>
              <Label htmlFor="strategyDetails" className="text-white">Strategy Details *</Label>
              <Textarea
                id="strategyDetails"
                value={strategyRequest.strategyDetails}
                onChange={(e) => setStrategyRequest({ ...strategyRequest, strategyDetails: e.target.value })}
                placeholder="Describe your strategy in detail:&#10;- Entry conditions&#10;- Exit conditions&#10;- Risk management rules&#10;- Time frames&#10;- Indicators to use&#10;- Any specific requirements"
                rows={10}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none mt-2"
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Activity className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-blue-400 font-semibold mb-1">What happens next?</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>• Your request will be sent to our admin team</li>
                    <li>• We'll review your strategy requirements</li>
                    <li>• You'll receive updates via support tickets</li>
                    <li>• Once approved, the strategy will appear in your strategies list</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleRequestCustomStrategy}
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {isSubmitting ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Submit Request
                </>
              )}
            </Button>
            <Button
              onClick={() => setIsRequestDialogOpen(false)}
              variant="outline"
              className="border-slate-700 text-white hover:bg-slate-800"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
