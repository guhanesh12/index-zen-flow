// @ts-nocheck
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const indices = [
  { name: 'NIFTY', color: 'from-cyan-400 via-cyan-500 to-blue-500' },
  { name: 'BANKNIFTY', color: 'from-blue-400 via-blue-500 to-purple-500' },
  { name: 'SENSEX', color: 'from-purple-400 via-purple-500 to-pink-500' }
];

export function AnimatedIndexTitle() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % indices.length);
    }, 5000); // Change every 5 seconds

    return () => clearInterval(interval);
  }, []);

  const currentIndexData = indices[currentIndex];

  return (
    <div className="inline-block relative">
      <AnimatePresence mode="wait">
        <motion.span
          key={currentIndex}
          initial={currentIndex === 0 ? false : { opacity: 0, y: 50, rotateX: 90 }}
          animate={{ 
            opacity: 1, 
            y: 0, 
            rotateX: 0,
          }}
          exit={{ opacity: 0, y: -50, rotateX: -90 }}
          transition={{ 
            duration: 0.6,
            ease: [0.43, 0.13, 0.23, 0.96]
          }}
          className={`bg-gradient-to-r ${currentIndexData.color} bg-clip-text text-transparent inline-block font-extrabold`}
          style={{
            backgroundSize: '200% 200%',
          }}
        >
          <motion.span
            animate={{
              backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
            }}
            transition={{ 
              duration: 3, 
              repeat: Infinity,
              ease: 'linear'
            }}
            style={{
              backgroundImage: `linear-gradient(90deg, var(--tw-gradient-stops))`,
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
            className={`bg-gradient-to-r ${currentIndexData.color}`}
          >
            {currentIndexData.name}
          </motion.span>
        </motion.span>
      </AnimatePresence>
      
      {/* Glowing effect behind text */}
      <motion.div
        className="absolute inset-0 blur-2xl -z-10"
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [0.9, 1.1, 0.9],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className={`w-full h-full bg-gradient-to-r ${currentIndexData.color}`} />
      </motion.div>
    </div>
  );
}