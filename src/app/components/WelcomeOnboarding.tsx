// @ts-nocheck
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { supabase } from '@/utils-ext/supabase/client';
import { Button } from './ui/button';
import {
  Gift, Sparkles, Clock, X, ArrowRight, Wallet, CheckCircle2,
  Rocket, Target, Plug, Play, BookOpen, ChevronLeft, ChevronRight, SkipForward,
} from 'lucide-react';

interface ProfileFlags {
  welcome_popup_seen: boolean;
  tour_completed: boolean;
  signup_bonus_amount: number;
  signup_bonus_remaining: number;
  signup_bonus_expires_at: string | null;
}

type TourStep = {
  target?: string;            // CSS selector (omit for centered)
  title: string;
  content: string;
  icon: any;
  accent: string;             // tailwind gradient class
};

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to IndexPilot AI',
    content: "Let's take a 60-second tour to get you trading on autopilot. You can skip anytime.",
    icon: Rocket,
    accent: 'from-emerald-500 via-teal-500 to-blue-600',
  },
  {
    target: '#tour-tab-symbols',
    title: 'Pick Your Symbols',
    content: 'Add NIFTY / BANKNIFTY option symbols. Auto-Symbol Config picks the best strikes for you.',
    icon: Target,
    accent: 'from-violet-500 via-fuchsia-500 to-pink-500',
  },
  {
    target: '#tour-tab-settings',
    title: 'Connect Broker + Static IP',
    content: 'Link your Dhan broker token and assign a dedicated static IP for safe execution.',
    icon: Plug,
    accent: 'from-blue-500 via-cyan-500 to-teal-500',
  },
  {
    target: '#tour-tab-dashboard',
    title: 'Start the Engine',
    content: 'Hit Start on the dashboard. The AI watches every candle and fires signals + orders automatically.',
    icon: Play,
    accent: 'from-amber-500 via-orange-500 to-red-500',
  },
  {
    target: '#tour-wallet-btn',
    title: 'Your ₹100 Welcome Bonus',
    content: 'Use it to test signals, execute orders or buy a static IP. Expires in 7 days — make it count!',
    icon: Wallet,
    accent: 'from-emerald-500 via-green-500 to-lime-500',
  },
  {
    target: '#tour-tab-journal',
    title: 'Track Every Trade',
    content: 'All trades, signals and wallet transactions are logged here. Restart this tour anytime from Settings.',
    icon: BookOpen,
    accent: 'from-indigo-500 via-purple-500 to-pink-500',
  },
];

const LS_TOUR_KEY = 'ipx_tour_completed_v2';
const LS_POPUP_KEY = 'ipx_welcome_popup_seen_v2';

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

      const lsPopupSeen = localStorage.getItem(`${LS_POPUP_KEY}:${user.id}`) === '1';
      const lsTourDone = localStorage.getItem(`${LS_TOUR_KEY}:${user.id}`) === '1';

      const { data } = await supabase
        .from('profiles')
        .select('welcome_popup_seen, tour_completed, signup_bonus_amount, signup_bonus_remaining, signup_bonus_expires_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!data) return;
      setFlags(data as any);

      const popupSeen = lsPopupSeen || !!data.welcome_popup_seen;
      const tourDone = lsTourDone || !!data.tour_completed;

      if (!popupSeen && Number(data.signup_bonus_amount) > 0) {
        setTimeout(() => { setShowPopup(true); fireConfetti(); }, 600);
      } else if (!tourDone) {
        setTimeout(() => setRunTour(true), 800);
      }
    })();

    const restart = () => setRunTour(true);
    window.addEventListener('ipx:restart-tour', restart);
    return () => window.removeEventListener('ipx:restart-tour', restart);
  }, []);

  const fireConfetti = () => {
    const end = Date.now() + 1800;
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899'];
    (function frame() {
      confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1 }, colors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  const markPopupSeen = async () => {
    setShowPopup(false);
    if (userId) {
      localStorage.setItem(`${LS_POPUP_KEY}:${userId}`, '1');
      supabase.from('profiles').update({ welcome_popup_seen: true }).eq('user_id', userId).then(() => {});
    }
    if (!flags?.tour_completed && localStorage.getItem(`${LS_TOUR_KEY}:${userId}`) !== '1') {
      setTimeout(() => setRunTour(true), 400);
    }
  };

  const markTourDone = async () => {
    setRunTour(false);
    if (userId) {
      localStorage.setItem(`${LS_TOUR_KEY}:${userId}`, '1');
      supabase.from('profiles').update({ tour_completed: true }).eq('user_id', userId).then(() => {});
    }
  };

  const expiryDate = flags?.signup_bonus_expires_at
    ? new Date(flags.signup_bonus_expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const bonusAmt = Number(flags?.signup_bonus_amount || 100);

  return (
    <>
      {/* ====== ADVANCED WELCOME POPUP ====== */}
      <AnimatePresence>
        {showPopup && (
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={markPopupSeen}
          >
            {/* animated background orbs */}
            <motion.div
              className="pointer-events-none absolute h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl"
              animate={{ x: [-50, 50, -50], y: [-30, 40, -30] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="pointer-events-none absolute h-96 w-96 rounded-full bg-blue-500/20 blur-3xl"
              animate={{ x: [50, -50, 50], y: [40, -30, 40] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />

            <motion.div
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-[1px] shadow-2xl"
              initial={{ scale: 0.7, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* gradient border glow */}
              <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-emerald-500/40 via-blue-500/40 to-fuchsia-500/40 blur-xl opacity-60" />

              <div className="relative rounded-3xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-8">
                <button
                  onClick={markPopupSeen}
                  className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white transition"
                  aria-label="Close welcome popup"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="flex flex-col items-center text-center">
                  <motion.div
                    className="relative mb-6"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-full bg-emerald-500/40 blur-2xl"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 2.5, repeat: Infinity }}
                    />
                    <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-blue-600 shadow-2xl shadow-emerald-500/50 rotate-3">
                      <Gift className="h-12 w-12 text-white drop-shadow-lg" />
                    </div>
                    <motion.div
                      className="absolute -right-2 -top-2 rounded-full bg-amber-400 p-1.5 shadow-lg"
                      animate={{ rotate: [0, 15, -15, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      <Sparkles className="h-4 w-4 text-amber-900" />
                    </motion.div>
                  </motion.div>

                  <motion.div
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }}
                    className="mb-1 flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-300"
                  >
                    <Sparkles className="h-3 w-3" /> Welcome Gift Unlocked
                  </motion.div>

                  <motion.h2
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}
                    className="mt-3 mb-2 bg-gradient-to-r from-white via-emerald-200 to-blue-200 bg-clip-text text-4xl font-extrabold text-transparent"
                  >
                    Welcome aboard! 🎉
                  </motion.h2>

                  <motion.p
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }}
                    className="mb-1 text-zinc-300"
                  >
                    We've added{' '}
                    <span className="bg-gradient-to-r from-emerald-400 to-blue-400 bg-clip-text text-3xl font-extrabold text-transparent">
                      ₹{bonusAmt}
                    </span>{' '}
                    to your wallet.
                  </motion.p>
                  <motion.p
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }}
                    className="mb-6 text-sm text-zinc-400"
                  >
                    Test signals, execute live orders, or buy a static IP — it's on us.
                  </motion.p>

                  <motion.div
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }}
                    className="mb-6 w-full space-y-2.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur"
                  >
                    <Row icon={<Wallet className="h-4 w-4 text-emerald-400" />} label="Credited to" value={`Wallet +₹${bonusAmt}`} />
                    <Row icon={<Clock className="h-4 w-4 text-amber-400" />} label="Valid until" value={expiryDate || '7 days from now'} />
                    <Row icon={<CheckCircle2 className="h-4 w-4 text-blue-400" />} label="Works for" value="Signals · Orders · Static IP" />
                  </motion.div>

                  <motion.div
                    initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.8 }}
                    className="w-full"
                  >
                    <Button
                      onClick={markPopupSeen}
                      className="w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-blue-700 hover:shadow-emerald-500/50 transition-all"
                      size="lg"
                    >
                      Take the Tour <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <p className="mt-3 text-[11px] text-zinc-500">
                      Bonus auto-expires after 7 days. Cannot be withdrawn as cash.
                    </p>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ====== ADVANCED CUSTOM TOUR ====== */}
      <AnimatePresence>
        {runTour && (
          <AdvancedTour
            steps={TOUR_STEPS}
            onClose={markTourDone}
          />
        )}
      </AnimatePresence>
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

/* ---------------- Advanced spotlight tour ---------------- */
function AdvancedTour({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[idx];
  const Icon = step.icon;

  useLayoutEffect(() => {
    const compute = () => {
      if (!step.target) { setRect(null); return; }
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      // wait a frame for scroll then measure
      requestAnimationFrame(() => setRect(el.getBoundingClientRect()));
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [idx, step.target]);

  const next = () => idx === steps.length - 1 ? onClose() : setIdx(idx + 1);
  const back = () => idx > 0 && setIdx(idx - 1);

  // tooltip placement
  const pad = 12;
  const tipW = 360;
  const tipH = 240;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

  let tipStyle: any = { left: vw / 2 - tipW / 2, top: vh / 2 - tipH / 2 };
  if (rect) {
    const spaceBelow = vh - rect.bottom;
    const placeBelow = spaceBelow > tipH + 40;
    const top = placeBelow ? rect.bottom + pad : Math.max(16, rect.top - tipH - pad);
    let left = rect.left + rect.width / 2 - tipW / 2;
    left = Math.max(16, Math.min(left, vw - tipW - 16));
    tipStyle = { left, top };
  }

  const spotlightPad = 8;
  const spot = rect
    ? {
        left: rect.left - spotlightPad,
        top: rect.top - spotlightPad,
        width: rect.width + spotlightPad * 2,
        height: rect.height + spotlightPad * 2,
      }
    : null;

  return (
    <motion.div
      className="fixed inset-0 z-[10000]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      {/* dimmed overlay with spotlight hole using SVG mask */}
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {spot && (
              <rect
                x={spot.left} y={spot.top} width={spot.width} height={spot.height}
                rx="14" ry="14" fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.78)" mask="url(#tour-mask)" />
      </svg>

      {/* pulsing ring around spotlight */}
      {spot && (
        <motion.div
          className="pointer-events-none absolute rounded-2xl border-2 border-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]"
          style={spot}
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        >
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-emerald-400/60"
            animate={{ scale: [1, 1.08, 1], opacity: [0.8, 0, 0.8] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
        </motion.div>
      )}

      {/* tooltip card */}
      <motion.div
        key={idx}
        className="absolute"
        style={{ ...tipStyle, width: tipW }}
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 shadow-2xl">
          {/* top accent bar */}
          <div className={`h-1 w-full bg-gradient-to-r ${step.accent}`} />

          <div className="p-5">
            <div className="mb-3 flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${step.accent} shadow-lg`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Step {idx + 1} of {steps.length}
                </div>
                <h3 className="mt-0.5 text-lg font-bold text-white">{step.title}</h3>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1 text-zinc-500 hover:bg-white/10 hover:text-white transition"
                aria-label="Close tour"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-zinc-300">{step.content}</p>

            {/* progress dots */}
            <div className="mb-4 flex items-center gap-1.5">
              {steps.map((_, i) => (
                <motion.div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-8 bg-gradient-to-r ' + step.accent : i < idx ? 'w-1.5 bg-emerald-500' : 'w-1.5 bg-zinc-700'}`}
                  layout
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onClose}
                className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition"
              >
                <SkipForward className="h-3.5 w-3.5" /> Skip tour
              </button>
              <div className="flex items-center gap-2">
                {idx > 0 && (
                  <Button onClick={back} variant="ghost" size="sm" className="text-zinc-300 hover:bg-white/10">
                    <ChevronLeft className="mr-1 h-4 w-4" /> Back
                  </Button>
                )}
                <Button
                  onClick={next}
                  size="sm"
                  className={`bg-gradient-to-r ${step.accent} text-white font-semibold shadow-lg hover:opacity-90`}
                >
                  {idx === steps.length - 1 ? 'Finish' : 'Next'}
                  {idx === steps.length - 1
                    ? <CheckCircle2 className="ml-1 h-4 w-4" />
                    : <ChevronRight className="ml-1 h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default WelcomeOnboarding;
