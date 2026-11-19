import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { OasisLogo } from './OasisLogo';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onFinish();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [onFinish]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-[#15803D] text-white px-6 py-12"
      role="dialog"
      aria-label="شاشة البداية - أسواق الواحة"
    >
      <div className="h-8" />

      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center text-center"
      >
        <div className="p-3 rounded-3xl bg-white/10 border border-[#D4AF37]/40 shadow-lg">
          <OasisLogo size={84} />
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white">
          أسواق الواحة
        </h1>
        <p className="mt-2 text-base text-[#E6F4EA] font-medium">
          سوبر ماركت طازج لكل احتياجات بيتك
        </p>
      </motion.div>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={onFinish}
          className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white text-[#15803D] font-bold text-sm hover:bg-[#F3F9F4] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          دخول المتجر الآن
        </button>
        <span className="text-xs text-[#D4AF37] font-medium">
          توصيل منزلي موثوق · جودة يومية منتقاة
        </span>
      </div>
    </div>
  );
};
