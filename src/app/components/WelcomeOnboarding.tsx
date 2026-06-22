// @ts-nocheck
import { useEffect, useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { supabase } from '@/utils-ext/supabase/client';
import { Button } from './ui/button';
import { Gift, Sparkles, Clock, X, ArrowRight, Wallet, CheckCircle2 } from 'lucide-react';

const Joyride = lazy(() => import('react-joyride').then(m => ({ default: (m as any).default ?? (m as any).Joyride })));

interface ProfileFlags {
  welcome_popup_seen: boolean;
  tour_completed: boolean;
  signup_bonus_amount: number;
  signup_bonus_remaining: number;
  signup_bonus_expires_at: string | null;
}

const TOUR_STEPS = [
  {
    target: 'body',
    placement: 'center' as const,
    title: 'Welcome to IndexPilot AI 🚀',
    content: 'Quick 1-minute tour to show you how to start auto-trading. You can skip anytime.',
  },
  {
    target: '#tour-tab-symbols',
    title: '1. Pick Your Symbols',
    content: 'Add NIFTY/BANKNIFTY option symbols you want the AI to trade. Auto-Symbol Config picks the best strikes for you.',
  },
  {
    target: '#tour-tab-settings',
    title: '2. Connect Broker + Static IP',
    content: 'Connect your Dhan broker token and assign a dedicated static IP for safe execution.',
  },
  {
    target: '#tour-tab-dashboard',
    title: '3. Start the Engine',
    content: 'Hit Start on the main dashboard. The AI watches every candle and fires signals + orders automatically.',
  },
  {
    target: '#tour-wallet-btn',
    title: '4. Your ₹100 Welcome Bonus',
    content: 'Use it to test signals, execute orders, or buy static IP. Expires in 7 days — make it count!',
  },
  {
    target: '#tour-tab-journal',
    title: '5. Track P&L',
    content: 'Every trade, signal and wallet transaction is logged here. You can also restart this tour anytime from Settings.',
  },
];

export function WelcomeOnboarding() {
  const [flags, setFlags] = useState<ProfileFlags | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [runTour, setRunTour] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('welcome_popup_seen, tour_completed, signup_bonus_amount, signup_bonus_remaining, signup_bonus_expires_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!data) return;
      setFlags(data as any);
      if (!data.welcome_popup_seen && Number(data.signup_bonus_amount) > 0) {
        setTimeout(() => {
          setShowPopup(true);
          fireConfetti();
        }, 600);
      } else if (!data.tour_completed) {
        setTimeout(() => setRunTour(true), 800);
      }
    })();

    // Restart tour event from settings
    const restart = () => setRunTour(true);
    window.addEventListener('ipx:restart-tour', restart);
    return () => window.removeEventListener('ipx:restart-tour', restart);
  }, []);

  const fireConfetti = () => {
    const end = Date.now() + 1500;
    const colors = ['#10b981', '#3b82f6', '#f59e0b'];
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  const markPopupSeen = async () => {
    setShowPopup(false);
    if (!userId) return;
    await supabase.from('profiles').update({ welcome_popup_seen: true }).eq('user_id', userId);
    if (!flags?.tour_completed) setTimeout(() => setRunTour(true), 400);
  };

  const handleTourCallback = async (data: any) => {
    const { status } = data;
    if (status === 'finished' || status === 'skipped') {
      setRunTour(false);
      if (userId) {
        await supabase.from('profiles').update({ tour_completed: true }).eq('user_id', userId);
      }
    }
  };

  const expiryDate = flags?.signup_bonus_expires_at
    ? new Date(flags.signup_bonus_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const bonusAmt = Number(flags?.signup_bonus_amount || 100);

  return (
    <>
      <AnimatePresence>
        {showPopup && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={markPopupSeen}
          >
            <motion.div
              className="relative w-full max-w-md rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-zinc-900 via-zinc-900 to-emerald-950/40 p-8 shadow-2xl shadow-emerald-500/20"
              initial={{ scale: 0.8, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={markPopupSeen}
                className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex flex-col items-center text-center">
                <motion.div
                  className="relative mb-5"
                  animate={{ rotate: [0, -10, 10, -10, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2 }}
                >
                  <div className="absolute inset-0 rounded-full bg-emerald-500/30 blur-2xl" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 shadow-lg shadow-emerald-500/40">
                    <Gift className="h-10 w-10 text-white" />
                  </div>
                </motion.div>

                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" /> Welcome Gift Unlocked
                </div>
                <h2 className="mb-2 text-3xl font-bold text-white">Congratulations! 🎉</h2>
                <p className="mb-1 text-zinc-300">
                  We've added{' '}
                  <span className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-2xl font-bold text-transparent">
                    ₹{bonusAmt}
                  </span>{' '}
                  to your wallet.
                </p>
                <p className="mb-5 text-sm text-zinc-400">
                  Use it to test signals, execute live orders, or buy a static IP.
                </p>

                <div className="mb-5 w-full space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4 text-left">
                  <Row icon={<Wallet className="h-4 w-4 text-emerald-400" />} label="Credited to" value={`Wallet balance +₹${bonusAmt}`} />
                  <Row icon={<Clock className="h-4 w-4 text-amber-400" />} label="Valid until" value={expiryDate || '7 days from now'} />
                  <Row icon={<CheckCircle2 className="h-4 w-4 text-blue-400" />} label="Works for" value="Signals · Orders · Static IP" />
                </div>

                <Button
                  onClick={markPopupSeen}
                  className="w-full bg-gradient-to-r from-emerald-500 to-blue-600 text-base font-semibold text-white hover:from-emerald-600 hover:to-blue-700"
                  size="lg"
                >
                  Start Trading <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="mt-3 text-[11px] text-zinc-500">
                  Bonus auto-expires after 7 days if unused. Cannot be withdrawn as cash.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {runTour && (
        <Suspense fallback={null}>
          <Joyride
            steps={TOUR_STEPS as any}
            run={runTour}
            continuous
            showSkipButton
            showProgress
            disableScrolling={false}
            scrollToFirstStep
            callback={handleTourCallback}
            locale={{ back: 'Back', close: 'Close', last: 'Finish', next: 'Next', skip: 'Skip tour' }}
            styles={{
              options: {
                primaryColor: '#10b981',
                backgroundColor: '#18181b',
                textColor: '#fafafa',
                arrowColor: '#18181b',
                overlayColor: 'rgba(0,0,0,0.7)',
                zIndex: 10000,
              },
              tooltip: { borderRadius: 16, padding: 20 },
              buttonNext: { backgroundColor: '#10b981', borderRadius: 8, padding: '8px 16px', fontWeight: 600 },
              buttonBack: { color: '#a1a1aa', marginRight: 8 },
              buttonSkip: { color: '#71717a' },
            }}
          />
        </Suspense>
      )}
    </>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-zinc-400">{icon}<span>{label}</span></div>
      <span className="font-medium text-zinc-100">{value}</span>
    </div>
  );
}

export default WelcomeOnboarding;
