import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Scan,
} from 'lucide-react';
import { GeminiSparkleStar } from './VectorArt';

interface GeminiOnboardingSplashProps {
  isOpen: boolean;
  onClose: () => void;
  cvReady?: boolean;
}

export const GeminiOnboardingSplash: React.FC<GeminiOnboardingSplashProps> = ({
  isOpen,
  onClose,
  cvReady = true,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = [
    {
      title: 'Next-Gen AI Vision',
      badge: 'GEMINI VISION ENGINE',
      description:
        'Studio-grade edge detection with multi-pass Otsu segmentation, Canny gradient filters, and 4-extremal convex hull quad bounding.',
      icon: <Scan className="text-green-400" size={24} />,
      metric: '98.4% Edge Accuracy',
    },
    {
      title: 'Magic Color 2.0 & Retinex',
      badge: 'DUAL-ENGINE RETINEX',
      description:
        'Background illumination division bleaches wrinkled paper to pure #ffffff while boosting handwritten ink strokes, blue signatures, and red stamps.',
      icon: <Sparkles className="text-cyan-400" size={24} />,
      metric: 'Pure White Backgrounds',
    },
    {
      title: 'Continuous Batch & ID Cards',
      badge: 'INSTANT COMPOSITE',
      description:
        'Continuous multi-page camera snapping without interruption, plus dual-side (Front + Back) ID card capture composited onto official A4 sheets.',
      icon: <CreditCard className="text-purple-400" size={24} />,
      metric: 'Official Print-Ready A4',
    },
  ];

  const handleFinish = () => {
    localStorage.setItem('swscanner_onboarding_seen', 'true');
    if (navigator.vibrate) navigator.vibrate(20);
    onClose();
  };

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide((s) => s + 1);
    } else {
      handleFinish();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-[#070709] flex flex-col justify-between text-white overflow-hidden select-none"
      >
        {/* Background Aurora Glow Effects */}
        <div className="absolute top-[-10%] left-[-10%] w-[80vw] h-[80vw] rounded-full bg-emerald-500/15 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[80vw] h-[80vw] rounded-full bg-cyan-500/15 blur-[120px] pointer-events-none" />
        <div className="absolute top-[40%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-purple-500/10 blur-[130px] pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 px-6 pt-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GeminiSparkleStar size={26} gradient="aurora" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-green-400 to-purple-400 uppercase">
                POWERED BY GEMINI VISION
              </span>
              <span className="font-display font-extrabold text-sm tracking-tight text-white">
                SWScanner <span className="text-green-400">PRO</span>
              </span>
            </div>
          </div>

          <button
            onClick={handleFinish}
            className="text-white/40 hover:text-white text-xs font-semibold px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 transition"
          >
            Skip
          </button>
        </div>

        {/* Center Card with 3D Holographic Visual */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-2 max-w-md mx-auto w-full">
          {/* Hologram Hero Image Container */}
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative w-full aspect-square max-w-[310px] rounded-3xl overflow-hidden border border-white/20 shadow-[0_0_50px_rgba(74,222,128,0.2)] bg-[#101014] group"
          >
            <img
              src="/gemini_hero.jpg"
              alt="Gemini AI Scanner Preview"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            />

            {/* Glowing Corner Accents */}
            <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-green-400" />
            <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-400" />
            <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-purple-400" />
            <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-green-400" />

            {/* HUD Status Overlay */}
            <div className="absolute bottom-3 left-3 right-3 bg-black/75 backdrop-blur-md border border-white/15 rounded-2xl px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
                <span className="text-[11px] font-mono text-green-300">
                  {slides[currentSlide].metric}
                </span>
              </div>
              <span className="text-[9px] font-mono font-bold text-white/60 bg-white/10 px-2 py-0.5 rounded-full uppercase">
                {slides[currentSlide].badge}
              </span>
            </div>
          </motion.div>

          {/* Slide Text Content */}
          <div className="text-center mt-5 w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -15, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center"
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-green-400 mb-2">
                  {slides[currentSlide].icon}
                  <span>{slides[currentSlide].title}</span>
                </div>
                <p className="text-xs text-white/60 max-w-xs leading-relaxed">
                  {slides[currentSlide].description}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Dots Pagination Indicator */}
            <div className="flex items-center justify-center gap-2 mt-4">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    currentSlide === i
                      ? 'w-7 bg-gradient-to-r from-green-400 to-cyan-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]'
                      : 'w-1.5 bg-white/20 hover:bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Engine Status & Action Button */}
        <div className="relative z-10 px-6 pb-8 pt-2 flex flex-col gap-3 max-w-md mx-auto w-full">
          {/* OpenCV Core Ready Pill */}
          <div className="flex items-center justify-between text-[11px] text-white/40 px-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className={cvReady ? 'text-green-400' : 'text-amber-400'} />
              <span>OpenCV.js & Retinex Worker</span>
            </span>
            <span className="font-mono text-green-400 font-semibold">
              {cvReady ? 'ACTIVE' : 'READY'}
            </span>
          </div>

          {/* Continue / Start Button */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleNext}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 text-black font-extrabold text-sm tracking-wide shadow-[0_0_30px_rgba(74,222,128,0.4)] flex items-center justify-center gap-2 hover:opacity-95 transition"
          >
            <span>
              {currentSlide === slides.length - 1 ? 'Start Scanning Documents' : 'Continue'}
            </span>
            <ChevronRight size={18} strokeWidth={2.5} />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
