import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Plus, MessageSquare, CheckCircle2, Clock, Building2 } from 'lucide-react';
import { toast } from 'sonner';

interface BrokerRequestProps {
  serverUrl: string;
  accessToken: string;
}

export function BrokerRequest({ serverUrl, accessToken }: BrokerRequestProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestData, setRequestData] = useState({
    broker: '',
    additionalDetails: ''
  });

  const allBrokers = [
    'Zerodha',
    'Upstox',
    'Angel One (Angel Broking)',
    'ICICI Direct',
    'HDFC Securities',
    'Kotak Securities',
    '5Paisa',
    'Sharekhan',
    'Motilal Oswal',
    'Axis Direct',
    'Edelweiss',
    'IIFL Securities',
    'Groww',
    'Paytm Money',
    'Fyers',
    'Alice Blue',
    'Finvasia',
    'Prostocks',
    'Swastika',
    'Other (Please specify in details)'
  ];

  const handleSubmitRequest = async () => {
    // Validate
    if (!requestData.broker) {
      toast.error('Please select a broker');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create support ticket for broker request
      const response = await fetch(`${serverUrl}/support/create`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: `Broker Integration Request: ${requestData.broker}`,
          message: `**Broker Name:** ${requestData.broker}\n\n**Additional Details:**\n${requestData.additionalDetails || 'No additional details provided'}\n\n---\nThis is an automated broker integration request. Admin: Please review and consider adding support for this broker.`,
          urgency: 'NORMAL',
          category: 'TECHNICAL',
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast.success('Broker request submitted successfully!');
        toast.info('Our team will review your broker request', {
          duration: 5000
        });
        
        // Reset form
        setRequestData({
          broker: '',
          additionalDetails: ''
        });
        
        // Close dialog
        setIsDialogOpen(false);
      } else {
        toast.error(data.message || 'Failed to submit request');
      }
    } catch (error) {
      console.error('Error submitting broker request:', error);
      toast.error('Error submitting request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Building2 className="w-5 h-5 text-purple-400" />
            Broker Integration
          </CardTitle>
          <CardDescription className="text-slate-400">
            Currently supporting Dhan. Need another broker? Request integration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-white font-semibold">Dhan</p>
                  <p className="text-xs text-slate-400">Fully Integrated</p>
                </div>
              </div>
              <div className="text-emerald-400 text-xs font-semibold bg-emerald-500/20 px-3 py-1 rounded-full">
                ACTIVE
              </div>
            </div>

            <Button
              onClick={() => setIsDialogOpen(true)}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Request New Broker Integration
            </Button>

            <p className="text-xs text-slate-500 text-center">
              Want to use another broker? Submit a request and we'll work on the integration
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Broker Request Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl text-white flex items-center gap-2">
              <MessageSquare className="w-6 h-6 text-purple-400" />
              Request Broker Integration
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Select the broker you'd like us to integrate with IndexpilotAI
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="broker" className="text-white">Select Broker *</Label>
              <select
                id="broker"
                value={requestData.broker}
                onChange={(e) => setRequestData({ ...requestData, broker: e.target.value })}
                className="w-full mt-2 px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-400">Choose a broker...</option>
                {allBrokers.map((broker) => (
                  <option key={broker} value={broker} className="bg-slate-900 text-white">
                    {broker}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="additionalDetails" className="text-white">Additional Details (Optional)</Label>
              <Textarea
                id="additionalDetails"
                value={requestData.additionalDetails}
                onChange={(e) => setRequestData({ ...requestData, additionalDetails: e.target.value })}
                placeholder="Any specific requirements or reasons for requesting this broker integration..."
                rows={6}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all resize-none mt-2"
              />
            </div>

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-blue-400 font-semibold mb-1">What happens next?</h4>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>• Your request will be sent to our development team</li>
                    <li>• We'll evaluate the technical feasibility</li>
                    <li>• You'll receive updates via support tickets</li>
                    <li>• Popular broker requests will be prioritized</li>
                  </ul>
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