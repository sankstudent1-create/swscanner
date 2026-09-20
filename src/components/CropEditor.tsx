import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/AppStore';
import { OpenCVService } from '../services/OpenCVService';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, RotateCw, Maximize, RefreshCw, Sparkles, CreditCard, FileText, Square } from 'lucide-react';

interface Pt {
  x: number;
  y: number;
}
type Corners = { tl: Pt; tr: Pt; br: Pt; bl: Pt };
const KEYS = ['tl', 'tr', 'br', 'bl'] as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export const CropEditor: React.FC = () => {
  const { currentImage, setCurrentView, setCurrentImage } = useAppStore();

  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [corners, setCorners] = useState<Corners | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState<(typeof KEYS)[number] | null>(null);
  const [status, setStatus] = useState<'loading' | 'detecting' | 'ready' | 'warping'>('loading');
  const [activePreset, setActivePreset] = useState<'auto' | 'a4' | 'id_card' | 'square' | 'full'>('auto');

  const sourceImgRef = useRef<HTMLImageElement | null>(null);

  const defaultCorners = (w: number, h: number, pad = 0.06): Corners => ({
    tl: { x: w * pad, y: h * pad },
    tr: { x: w * (1 - pad), y: h * pad },
    br: { x: w * (1 - pad), y: h * (1 - pad) },
    bl: { x: w * pad, y: h * (1 - pad) },
  });

  const fullCorners = (w: number, h: number): Corners => ({
    tl: { x: 0, y: 0 },
    tr: { x: w, y: 0 },
    br: { x: w, y: h },
    bl: { x: 0, y: h },
  });

  const presetRatioCorners = (w: number, h: number, ratio: number): Corners => {
    // ratio is width/height (e.g. A4 portrait = 1 / 1.4142 = 0.707, ID card landscape = 1.586)
    let targetW = w * 0.85;
    let targetH = targetW / ratio;
    if (targetH > h * 0.85) {
      targetH = h * 0.85;
      targetW = targetH * ratio;
    }
    const left = (w - targetW) / 2;
    const top = (h - targetH) / 2;
    return {
      tl: { x: left, y: top },
      tr: { x: left + targetW, y: top },
      br: { x: left + targetW, y: top + targetH },
      bl: { x: left, y: top + targetH },
    };
  };

  /** Draw decoded image preserving aspect ratio */
  const paintCanvas = useCallback((img: HTMLImageElement) => {
    const canvas = displayCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const maxW = container.clientWidth;
    const maxH = container.clientHeight;

    const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    setDisplaySize({ w, h });
  }, []);

  useEffect(() => {
    if (!currentImage) return;
    setStatus('loading');
    setCorners(null);

    loadImage(currentImage)
      .then((img) => {
        sourceImgRef.current = img;
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        paintCanvas(img);
        setStatus('detecting');

        setTimeout(() => {
          const detected = OpenCVService.detectDocument(img);
          setCorners(detected ?? defaultCorners(img.naturalWidth, img.naturalHeight));
          setStatus('ready');
        }, 80);
      })
      .catch(() => setStatus('ready'));
  }, [currentImage, paintCanvas]);

  useEffect(() => {
    if (!sourceImgRef.current) return;
    const observer = new ResizeObserver(() => {
      if (sourceImgRef.current) paintCanvas(sourceImgRef.current);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [paintCanvas]);

  const toScreen = (p: Pt): Pt => {
    if (!naturalSize.w) return p;
    return {
      x: (p.x / naturalSize.w) * displaySize.w,
      y: (p.y / naturalSize.h) * displaySize.h,
    };
  };

  const toNatural = (p: Pt): Pt => {
    if (!displaySize.w) return p;
    return {
      x: (p.x / displaySize.w) * naturalSize.w,
      y: (p.y / displaySize.h) * naturalSize.h,
    };
  };

  // 90° Clockwise Rotation
  const handleRotate = () => {
    if (!sourceImgRef.current) return;
    const img = sourceImgRef.current;
    const off = document.createElement('canvas');
    off.width = img.naturalHeight;
    off.height = img.naturalWidth;
    const ctx = off.getContext('2d')!;
    ctx.translate(off.width / 2, off.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const rotated = off.toDataURL('image/jpeg', 0.98);
    setCurrentImage(rotated);
  };

  // Drag handling with magnetic edge snapping
  const onPointerDownCorner = (key: (typeof KEYS)[number]) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(key);
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging || !corners || !naturalSize.w || !naturalSize.h) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const sx = Math.max(0, Math.min(displaySize.w, e.clientX - rect.left));
    const sy = Math.max(0, Math.min(displaySize.h, e.clientY - rect.top));
    const nat = toNatural({ x: sx, y: sy });

    // Magnetic edge snapping (within 18px of image borders)
    const snapThreshold = 18;
    if (nat.x < snapThreshold) nat.x = 0;
    else if (nat.x > naturalSize.w - snapThreshold) nat.x = naturalSize.w;

    if (nat.y < snapThreshold) nat.y = 0;
    else if (nat.y > naturalSize.h - snapThreshold) nat.y = naturalSize.h;

    setCorners((prev) => (prev ? { ...prev, [dragging]: nat } : prev));
  };

  const onPointerUp = () => setDragging(null);

  // Re-run AI Edge Detection
  const handleReDetect = () => {
    if (!sourceImgRef.current) return;
    setStatus('detecting');
    setActivePreset('auto');
    setTimeout(() => {
      const detected = OpenCVService.detectDocument(sourceImgRef.current!);
      setCorners(detected ?? defaultCorners(naturalSize.w, naturalSize.h));
      setStatus('ready');
      if (navigator.vibrate) navigator.vibrate(20);
    }, 150);
  };

  const handleSelectPreset = (preset: 'auto' | 'a4' | 'id_card' | 'square' | 'full') => {
    if (!naturalSize.w || !naturalSize.h) return;
    setActivePreset(preset);
    if (preset === 'auto') {
      handleReDetect();
    } else if (preset === 'a4') {
      // A4 portrait ratio: 1 / 1.414 = 0.707
      setCorners(presetRatioCorners(naturalSize.w, naturalSize.h, 0.707));
    } else if (preset === 'id_card') {
      // Standard ID-1 ISO card ratio: 85.6mm / 53.98mm = 1.586
      setCorners(presetRatioCorners(naturalSize.w, naturalSize.h, 1.586));
    } else if (preset === 'square') {
      setCorners(presetRatioCorners(naturalSize.w, naturalSize.h, 1.0));
    } else if (preset === 'full') {
      setCorners(fullCorners(naturalSize.w, naturalSize.h));
    }
  };

  // Update magnifying loupe canvas when dragging
  useEffect(() => {
    if (!dragging || !corners || !sourceImgRef.current || !loupeCanvasRef.current) return;
    const loupe = loupeCanvasRef.current;
    const ctx = loupe.getContext('2d');
    if (!ctx) return;

    const pt = corners[dragging];
    const cropSize = 80; // natural pixel area to zoom
    const zoomW = loupe.width;
    const zoomH = loupe.height;

    ctx.clearRect(0, 0, zoomW, zoomH);
    ctx.imageSmoothingEnabled = false; // pixel clarity
    ctx.drawImage(
      sourceImgRef.current,
      pt.x - cropSize / 2,
      pt.y - cropSize / 2,
      cropSize,
      cropSize,
      0,
      0,
      zoomW,
      zoomH
    );

    // Draw Loupe Crosshair
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(zoomW / 2, 0);
    ctx.lineTo(zoomW / 2, zoomH);
    ctx.moveTo(0, zoomH / 2);
    ctx.lineTo(zoomW, zoomH / 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(zoomW / 2, zoomH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }, [dragging, corners]);

  const handleApply = async () => {
    if (!sourceImgRef.current || !corners) return;
    setStatus('warping');
    await new Promise((r) => setTimeout(r, 40));

    try {
      const result = OpenCVService.warpDocument(sourceImgRef.current, corners);
      setCurrentImage(result ?? currentImage!);
    } catch (e) {
      console.error('warp failed, using original', e);
    }
    setCurrentView('filter');
  };

  if (!currentImage) {
    setCurrentView('camera');
    return null;
  }

  const busy = status === 'loading' || status === 'detecting' || status === 'warping';
  const dispPts = corners ? KEYS.map((k) => toScreen(corners[k])) : [];
  const polyPts = dispPts.map((p) => `${p.x},${p.y}`).join(' ');

  // Loupe screen position
  const activePtScreen = dragging && corners ? toScreen(corners[dragging]) : null;

  return (
    <div className="w-full h-full flex flex-col bg-black select-none">
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 pb-3 bg-black/90 border-b border-white/10 z-20"
        style={{
          paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
        }}
      >
        <button
          onClick={() => setCurrentView('camera')}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition"
        >
          <X size={18} className="text-white" />
        </button>

        <div className="text-center">
          <p className="text-white font-semibold text-sm">Fine-Tune Edges</p>
          <p className="text-white/40 text-[10px]">Drag corners · Magnifier for accuracy</p>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Rotate 90° button */}
          <button
            onClick={handleRotate}
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition"
            title="Rotate 90°"
          >
            <RotateCw size={16} className="text-white" />
          </button>

          {/* Reset to Auto corners */}
          <button
            onClick={() =>
              naturalSize.w && setCorners(defaultCorners(naturalSize.w, naturalSize.h))
            }
            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition"
            title="Reset Edges"
          >
            <RefreshCw size={15} className="text-white" />
          </button>
        </div>
      </div>

      {/* Main Image Viewport */}
      <div
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center bg-[#0a0a0a] overflow-hidden"
      >
        <canvas ref={displayCanvasRef} className="block" style={{ imageRendering: 'auto' }} />

        {/* SVG Interactive Handles */}
        {corners && status === 'ready' && displaySize.w > 0 && (
          <svg
            style={{
              position: 'absolute',
              width: displaySize.w,
              height: displaySize.h,
              touchAction: 'none',
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <mask id="outside">
                <rect width="100%" height="100%" fill="white" />
                <polygon points={polyPts} fill="black" />
              </mask>
            </defs>

            {/* Darkened mask outside crop */}
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#outside)" />

            {/* Selected polygon */}
            <polygon
              points={polyPts}
              fill="rgba(74,222,128,0.12)"
              stroke="#4ade80"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            {/* Dashed edge lines */}
            {KEYS.map((k, i) => {
              const a = dispPts[i];
              const b = dispPts[(i + 1) % 4];
              return (
                <line
                  key={k}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#4ade80"
                  strokeWidth="2"
                  strokeDasharray="8,5"
                  opacity={0.4}
                />
              );
            })}

            {/* 4 Corner Handles with enlarged touch targets */}
            {KEYS.map((key, i) => {
              const p = dispPts[i];
              const isAct = dragging === key;
              return (
                <g
                  key={key}
                  onPointerDown={onPointerDownCorner(key)}
                  style={{ cursor: 'grab', touchAction: 'none' }}
                >
                  <circle cx={p.x} cy={p.y} r={28} fill="transparent" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isAct ? 22 : 18}
                    fill={isAct ? 'rgba(74,222,128,0.4)' : 'rgba(74,222,128,0.2)'}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isAct ? 15 : 13}
                    fill="#4ade80"
                    stroke="white"
                    strokeWidth="3"
                  />
                  <circle cx={p.x} cy={p.y} r={4} fill="#111" />
                </g>
              );
            })}
          </svg>
        )}

        {/* Precision Magnifier Loupe floating above dragged corner */}
        {dragging && activePtScreen && (
          <div
            className="absolute z-40 pointer-events-none transition-transform"
            style={{
              left: Math.max(60, Math.min(displaySize.w - 60, activePtScreen.x)),
              top: Math.max(60, activePtScreen.y - 75),
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="relative w-28 h-28 rounded-full border-[3px] border-green-400 overflow-hidden shadow-[0_0_24px_rgba(74,222,128,0.6)] bg-black">
              <canvas
                ref={loupeCanvasRef}
                width={112}
                height={112}
                className="w-full h-full block"
              />
              <div className="absolute bottom-1.5 left-0 right-0 text-center text-[9px] font-bold text-green-400 bg-black/60 tracking-wider">
                {dragging.toUpperCase()} · 2.5×
              </div>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm z-30"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                className="w-11 h-11 border-4 border-green-400 border-t-transparent rounded-full mb-3"
              />
              <p className="text-white/80 text-sm font-medium">
                {status === 'loading'
                  ? 'Loading capture...'
                  : status === 'detecting'
                  ? 'AI Detecting document edges...'
                  : 'Warping perspective...'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Preset Aspect Ratio Selector Ribbon */}
      <div className="shrink-0 bg-[#141414] border-t border-white/10 px-4 py-2 flex items-center justify-around gap-2 z-20 overflow-x-auto">
        <button
          onClick={() => handleSelectPreset('auto')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            activePreset === 'auto'
              ? 'bg-green-400 text-black shadow-[0_0_12px_rgba(74,222,128,0.4)]'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Sparkles size={13} />
          <span>Auto AI</span>
        </button>

        <button
          onClick={() => handleSelectPreset('a4')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            activePreset === 'a4'
              ? 'bg-green-400 text-black shadow-[0_0_12px_rgba(74,222,128,0.4)]'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <FileText size={13} />
          <span>A4 Doc</span>
        </button>

        <button
          onClick={() => handleSelectPreset('id_card')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            activePreset === 'id_card'
              ? 'bg-green-400 text-black shadow-[0_0_12px_rgba(74,222,128,0.4)]'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <CreditCard size={13} />
          <span>ID Card</span>
        </button>

        <button
          onClick={() => handleSelectPreset('square')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            activePreset === 'square'
              ? 'bg-green-400 text-black shadow-[0_0_12px_rgba(74,222,128,0.4)]'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Square size={13} />
          <span>1:1</span>
        </button>

        <button
          onClick={() => handleSelectPreset('full')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
            activePreset === 'full'
              ? 'bg-green-400 text-black shadow-[0_0_12px_rgba(74,222,128,0.4)]'
              : 'bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
          }`}
        >
          <Maximize size={13} />
          <span>Full</span>
        </button>
      </div>

      {/* Bottom Action Bar */}
      <div
        className="shrink-0 bg-[#161616] flex items-center justify-between px-5 border-t border-white/10 z-20"
        style={{
          height: 'calc(68px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Re-detect Edges */}
        <button
          onClick={handleReDetect}
          disabled={busy}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-semibold py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 transition disabled:opacity-40"
        >
          <RefreshCw size={14} className={status === 'detecting' ? 'animate-spin text-green-400' : ''} />
          <span>Re-detect</span>
        </button>

        {/* Apply Crop button */}
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={handleApply}
          disabled={busy || !corners}
          className="flex items-center gap-2 bg-green-400 hover:bg-green-300 text-black font-bold px-6 py-2.5 rounded-xl shadow-[0_0_20px_rgba(74,222,128,0.4)] disabled:opacity-40 transition text-xs"
        >
          <Check size={17} strokeWidth={3} />
          <span>Next: Magic Filters</span>
        </motion.button>
      </div>
    </div>
  );
};
