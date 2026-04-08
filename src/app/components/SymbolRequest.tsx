// @ts-nocheck
import { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Plus, MessageSquare, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface SymbolRequestProps {
  serverUrl: string;
  accessToken: string;
}

export function SymbolRequest({ serverUrl, accessToken }: SymbolRequestProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestData, setRequestData] = useState({
    symbolName: '',
    symbolDetails: ''
  });

  const handleSubmitRequest = async () => {
    // Validate
    if (!requestData.symbolName.trim()) {
      toast.error('Please enter symbol name');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create support ticket for symbol request
      const response = await fetch(`${serverUrl}/support/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: `Symbol Request: ${requestData.symbolName}`,
          message: `**Symbol Name:** ${requestData.symbolName}\n\n**Symbol Details:**\n${requestData.symbolDetails || 'No additional details provided'}\n\n---\nThis is an automated symbol addition request. Admin: Please review and add this trading symbol to the platform.`,
          urgency: 'NORMAL',
          category: 'TECHNICAL',
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Symbol request submitted successfully!');
        toast.info('Our team will review and add this symbol', {
          duration: 5000
        });
        
        // Reset form
        setRequestData({
          symbolName: '',
          symbolDetails: ''
        });
        
        // Close dialog
        setIsDialogOpen(false);
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error submitting symbol request:', error);
      toast.error('Error submitting request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsDialogOpen(true)}
        variant="outline"
        size="sm"
        className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50"
      >
        <Plus className="w-4 h-4 mr-2" />
        Request Symbol
      </Button>

      {/* Symbol Request Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-white flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-purple-400" />
              Request Trading Symbol
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Request a new trading symbol to be added to the platform
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="symbolName" className="text-white">Symbol Name *</Label>
              <Input
                id="symbolName"
                type="text"
                value={requestData.symbolName}
                onChange={(e) => setRequestData({ ...requestData, symbolName: e.target.value })}
                placeholder="e.g., FINNIFTY, MIDCPNIFTY, RELIANCE, TCS"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all mt-2"
              />
            </div>

            <div>
              <Label htmlFor="symbolDetails" className="text-white">Symbol Details (Optional)</Label>
              <Textarea
                id="symbolDetails"
                value={requestData.symbolDetails}
                onChange={(e) => setRequestData({ ...requestData, symbolDetails: e.target.value })}
                placeholder="Provide additional information:&#10;- Full symbol name&#10;- Exchange (NSE/BSE/MCX)&#10;- Segment (Equity/Options/Futures/Commodity)&#10;- Why do you need this symbol?&#10;- Any specific requirements"
                rows={8}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none mt-2"
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-blue-400 font-semibold mb-1">What happens next?</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>• Your request will be sent to our admin team</li>
                    <li>• We'll verify the symbol with exchange data</li>
                    <li>• You'll receive updates via support tickets</li>
                    <li>• Once approved, the symbol will be available for trading</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-amber-400 font-semibold mb-1 text-sm">💡 Pro Tip</h4>
                  <p className="text-xs text-slate-300">
                    Provide as much detail as possible to help us add the correct symbol. Include the exchange name, segment, and expiry dates if applicable.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button
              onClick={handleSubmitRequest}
              disabled={isSubmitting}
              className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
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
              onClick={() => setIsDialogOpen(false)}
              variant="outline"
              className="border-slate-700 text-white hover:bg-slate-800"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
