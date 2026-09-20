import React from 'react';

/**
 * 🎨 Vector Branding & Artistic Elements for CamScanner AI
 */

export const BrandLogo: React.FC<{ size?: number; showText?: boolean }> = ({
  size = 32,
  showText = true,
}) => {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
          <defs>
            <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <linearGradient id="glowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Background rounded rect */}
          <rect width="100" height="100" rx="26" fill="#181818" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
          <rect width="100" height="100" rx="26" fill="url(#glowGrad)" />

          {/* Document outline */}
          <rect
            x="24"
            y="18"
            width="52"
            height="64"
            rx="8"
            fill="none"
            stroke="url(#logoGrad)"
            strokeWidth="5"
            strokeDasharray="14 6"
          />

          {/* Aperture Center Ring */}
          <circle cx="50" cy="50" r="16" fill="none" stroke="white" strokeWidth="3" opacity="0.9" />
          <circle cx="50" cy="50" r="9" fill="url(#logoGrad)" />

          {/* Laser Sweep Line */}
          <line
            x1="16"
            y1="50"
            x2="84"
            y2="50"
            stroke="#4ade80"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="drop-shadow-[0_0_8px_rgba(74,222,128,0.9)]"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none min-w-0">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="font-display font-extrabold text-sm sm:text-base tracking-tight text-white truncate">
              SWScanner<span className="text-green-400">AI</span>
            </span>
            <span className="px-1 sm:px-1.5 py-0.5 rounded text-[7px] sm:text-[8px] font-black uppercase tracking-wider bg-green-400/15 text-green-400 border border-green-400/30 shrink-0">
              PRO
            </span>
          </div>
          <span className="hidden md:inline text-[9px] text-white/40 tracking-wider font-medium mt-0.5">
            Powered by SWINFOSYSTEMS
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * 📄 Futuristic Animated Empty State Vector Illustration
 */
export const EmptyGalleryVector: React.FC = () => {
  return (
    <div className="relative w-64 h-64 flex items-center justify-center">
      <svg viewBox="0 0 240 240" className="w-full h-full">
        <defs>
          <linearGradient id="beamGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#4ade80" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="docGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#242424" />
            <stop offset="100%" stopColor="#141414" />
          </linearGradient>
          <linearGradient id="laserGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>

        {/* Ambient glow */}
        <circle cx="120" cy="120" r="85" fill="#4ade80" opacity="0.04" />

        {/* Back Floating Document */}
        <g transform="rotate(-12 110 110)" opacity="0.45">
          <rect x="75" y="45" width="86" height="116" rx="10" fill="url(#docGrad1)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <line x1="88" y1="65" x2="125" y2="65" stroke="rgba(255,255,255,0.2)" strokeWidth="3" strokeLinecap="round" />
          <line x1="88" y1="80" x2="148" y2="80" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="88" y1="95" x2="140" y2="95" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* Main Floating Document */}
        <g transform="rotate(6 120 125)">
          <rect x="70" y="55" width="96" height="128" rx="12" fill="#181818" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
          
          {/* Header pill */}
          <rect x="84" y="74" width="36" height="8" rx="4" fill="#4ade80" opacity="0.8" />
          <line x1="84" y1="95" x2="152" y2="95" stroke="white" opacity="0.3" strokeWidth="3" strokeLinecap="round" />
          <line x1="84" y1="110" x2="144" y2="110" stroke="white" opacity="0.25" strokeWidth="3" strokeLinecap="round" />
          <line x1="84" y1="125" x2="150" y2="125" stroke="white" opacity="0.25" strokeWidth="3" strokeLinecap="round" />
          <line x1="84" y1="140" x2="120" y2="140" stroke="white" opacity="0.25" strokeWidth="3" strokeLinecap="round" />

          {/* Hologram stamp */}
          <circle cx="145" cy="155" r="11" fill="none" stroke="#4ade80" strokeWidth="2" opacity="0.6" strokeDasharray="3 3" />
          <path d="M141 155l3 3 5-6" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Laser Scanner Beam Cone */}
        <polygon points="40,90 200,90 220,135 20,135" fill="url(#beamGrad)" />
        
        {/* Laser Line */}
        <line x1="20" y1="112" x2="220" y2="112" stroke="url(#laserGrad)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="120" cy="112" r="4" fill="#4ade80" className="drop-shadow-[0_0_6px_#4ade80]" />

        {/* Sparkles */}
        <path d="M55 45l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#4ade80" opacity="0.7" />
        <path d="M190 65l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5z" fill="#4ade80" opacity="0.6" />
        <path d="M185 180l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#4ade80" opacity="0.8" />
      </svg>
    </div>
  );
};

/**
 * 🪪 ID Card Framing Guide Overlay Vector
 */
export const IdCardGuideOverlay: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center gap-3">
      {/* Card 1: Front / Identity */}
      <div className="relative w-[86%] max-w-[340px] aspect-[1.58/1] rounded-2xl border-2 border-dashed border-green-400/80 bg-green-400/5 p-4 flex flex-col justify-between shadow-[0_0_20px_rgba(74,222,128,0.15)]">
        {/* Top: Card Header / Chip */}
        <div className="flex items-center justify-between">
          <div className="w-9 h-7 rounded-md border border-amber-300/80 bg-amber-400/20 flex flex-col justify-around p-1">
            <div className="w-full h-0.5 bg-amber-300/80" />
            <div className="w-full h-0.5 bg-amber-300/80" />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-green-400/90 uppercase">
            ID CARD / DRIVER LICENSE
          </span>
        </div>

        {/* Center: Photo Frame + Details */}
        <div className="flex items-center gap-3">
          <div className="w-16 h-20 rounded-xl border border-white/30 bg-white/10 flex flex-col items-center justify-center text-white/50">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current opacity-60">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <div className="flex-1 flex flex-col gap-1.5 opacity-40">
            <div className="h-2 w-3/4 bg-white rounded" />
            <div className="h-2 w-1/2 bg-white rounded" />
            <div className="h-2 w-2/3 bg-white rounded" />
          </div>
        </div>

        {/* Bottom indicator */}
        <div className="text-center text-[10px] font-semibold text-green-300/90 tracking-wider">
          ALIGN FRONT OF CARD WITHIN BORDER
        </div>
      </div>
    </div>
  );
};

/**
 * 📖 Book Spine & Double Page Guide Vector
 */
export const BookGuideOverlay: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="relative w-[90%] h-[68%] rounded-2xl border-2 border-green-400/70 bg-black/20 flex">
        {/* Left Page */}
        <div className="flex-1 border-r border-dashed border-green-400 flex flex-col items-center justify-center p-3 text-white/30 text-xs">
          <span className="tracking-widest uppercase font-bold text-[11px] text-green-400/80">
            LEFT PAGE
          </span>
        </div>
        {/* Right Page */}
        <div className="flex-1 flex flex-col items-center justify-center p-3 text-white/30 text-xs">
          <span className="tracking-widest uppercase font-bold text-[11px] text-green-400/80">
            RIGHT PAGE
          </span>
        </div>
        {/* Center Spine Marker */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-3 flex flex-col justify-between items-center py-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
          <div className="w-0.5 flex-1 bg-green-400/40 my-1" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
      </div>
    </div>
  );
};

/**
 * ✨ Gemini-Style 4-Pointed Curved Sparkle Star
 */
export const GeminiSparkleStar: React.FC<{
  size?: number;
  className?: string;
  gradient?: 'aurora' | 'emerald' | 'amber';
}> = ({ size = 24, className = '', gradient = 'aurora' }) => {
  const gradId = `geminiGrad_${gradient}_${size}`;
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: size, height: size }}
      className={`shrink-0 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)] ${className}`}
    >
      <defs>
        {gradient === 'aurora' && (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        )}
        {gradient === 'emerald' && (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        )}
        {gradient === 'amber' && (
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        )}
      </defs>
      {/* 4-point astroid star curve */}
      <path
        d="M 50,0 Q 50,50 0,50 Q 50,50 50,100 Q 50,50 100,50 Q 50,50 50,0 Z"
        fill={`url(#${gradId})`}
      />
    </svg>
  );
};

/**
 * ⚡ Holographic AI Corner Brackets
 */
export const AiCornerBrackets: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* Top Left */}
      <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-green-400 rounded-tl-sm shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
      {/* Top Right */}
      <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-green-400 rounded-tr-sm shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
      {/* Bottom Left */}
      <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-green-400 rounded-bl-sm shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
      {/* Bottom Right */}
      <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-green-400 rounded-br-sm shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
    </div>
  );
};
