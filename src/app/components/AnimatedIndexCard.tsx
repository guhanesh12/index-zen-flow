// @ts-nocheck
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp } from 'lucide-react';

interface IndexData {
  name: string;
  color: string;
}

const indices: IndexData[] = [
  { name: 'NIFTY', color: 'from-cyan-400 to-blue-500' },
  { name: 'BANKNIFTY', color: 'from-blue-400 to-purple-500' },
  { name: 'SENSEX', color: 'from-purple-400 to-pink-500' }
];

// Generate random profit between 40000 and 125000
const generateRandomProfit = (previousProfit?: number): number => {
  let newProfit;
  do {
    newProfit = Math.floor(Math.random() * (125000 - 40000 + 1)) + 40000;
  } while (previousProfit && Math.abs(newProfit - previousProfit) < 10000); // Ensure at least 10k difference
  return newProfit;
};

export function AnimatedIndexCard() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animatedProfit, setAnimatedProfit] = useState(0);
  const [targetProfit, setTargetProfit] = useState(generateRandomProfit());
  const [avgProfit, setAvgProfit] = useState(generateRandomProfit());

  // Cycle through indices every 5 seconds and generate new random profits
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % indices.length);
      setTargetProfit(prev => generateRandomProfit(prev));
      setAvgProfit(prev => generateRandomProfit(prev));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Animate profit counter
  useEffect(() => {
    setAnimatedProfit(0);
    const duration = 1200; // 1200ms animation for smooth counting
    const steps = 50;
    const increment = targetProfit / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      if (step <= steps) {
        setAnimatedProfit(increment * step);
      } else {
        clearInterval(timer);
        setAnimatedProfit(targetProfit);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [targetProfit]);

  const currentIndexData = indices[currentIndex];

  return (
    <motion.div
      className="relative w-full max-w-md mx-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Glowing Background */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-3xl blur-2xl"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      />

      {/* Card Container */}
      <motion.div
        className="relative bg-slate-900/80 backdrop-blur-xl rounded-3xl border border-slate-800 p-8 shadow-2xl"
        whileHover={{ scale: 1.02, y: -5 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {/* Header with animated index name */}
        <div className="flex items-center justify-between mb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: -20, rotateY: 90 }}
              animate={{ opacity: 1, x: 0, rotateY: 0 }}
              exit={{ opacity: 0, x: 20, rotateY: -90 }}
              transition={{ duration: 0.5 }}
              className="flex items-center gap-3"
            >
              <motion.div
                className={`px-4 py-2 rounded-xl bg-gradient-to-r ${currentIndexData.color} text-white font-bold text-lg shadow-lg`}
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(6, 182, 212, 0.3)',
                    '0 0 40px rgba(6, 182, 212, 0.6)',
                    '0 0 20px rgba(6, 182, 212, 0.3)',
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {currentIndexData.name}
              </motion.div>
            </motion.div>
          </AnimatePresence>

          {/* Animated Profit */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`profit-${targetProfit}`}
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: -20 }}
              transition={{ duration: 0.5 }}
              className="text-xl sm:text-2xl font-bold text-emerald-400"
            >
              +₹{Math.floor(animatedProfit).toLocaleString('en-IN')}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bar Chart Animation */}
        <div className="bg-slate-800/50 rounded-2xl p-6 mb-6">
          <div className="flex items-end justify-between gap-2 h-32">
            {[60, 75, 65, 85, 70, 90, 80].map((height, index) => (
              <motion.div
                key={index}
                className="flex-1 bg-gradient-to-t from-cyan-500 to-blue-500 rounded-lg"
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                transition={{
                  delay: index * 0.1,
                  duration: 0.8,
                  repeat: Infinity,
                  repeatDelay: 2,
                }}
                whileHover={{
                  scale: 1.1,
                }}
                style={{ backgroundColor: 'rgba(6, 182, 212, 0.6)' }}
              />
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Win Rate */}
          <motion.div
            className="bg-slate-800/50 rounded-xl p-4"
            style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(30, 41, 59, 0.7)' }}
          >
            <div className="text-slate-400 text-sm mb-2">Win Rate</div>
            <motion.div
              className="text-3xl font-bold text-emerald-400"
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              68%
            </motion.div>
          </motion.div>

          {/* Avg Profit with animated counter */}
          <motion.div
            className="bg-slate-800/50 rounded-xl p-4"
            style={{ backgroundColor: 'rgba(30, 41, 59, 0.5)' }}
            whileHover={{ scale: 1.05, backgroundColor: 'rgba(30, 41, 59, 0.7)' }}
          >
            <div className="text-slate-400 text-sm mb-2">Avg Profit</div>
            <AnimatedProfitCounter targetValue={avgProfit} />
          </motion.div>
        </div>

        {/* Indicator Dots */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {indices.map((_, index) => (
            <motion.div
              key={index}
              className={`h-2 rounded-full ${
                index === currentIndex ? 'w-8 bg-cyan-500' : 'w-2 bg-slate-700'
              }`}
              animate={index === currentIndex ? {
                scale: [1, 1.2, 1],
                backgroundColor: ['rgba(6, 182, 212, 1)', 'rgba(6, 182, 212, 0.5)', 'rgba(6, 182, 212, 1)']
              } : {}}
              transition={{ duration: 0.6 }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Animated Profit Counter Component
function AnimatedProfitCounter({ targetValue }: { targetValue: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 seconds
    const steps = 60;
    const increment = targetValue / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      if (step <= steps) {
        setDisplayValue(Math.floor(increment * step));
      } else {
        clearInterval(timer);
        setDisplayValue(targetValue);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [targetValue]);

  return (
    <motion.div
      className="text-3xl font-bold text-cyan-400"
      animate={{
        textShadow: [
          '0 0 10px rgba(6, 182, 212, 0.5)',
          '0 0 20px rgba(6, 182, 212, 0.8)',
          '0 0 10px rgba(6, 182, 212, 0.5)',
        ],
      }}
      transition={{ duration: 2, repeat: Infinity }}
    >
      ₹{displayValue.toLocaleString('en-IN')}
    </motion.div>
  );
}