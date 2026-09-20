import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/AppStore';
import {
  RotateCcw,
  Grid3x3,
  Zap,
  ZapOff,
  ZoomIn,
  ZoomOut,
  Sun,
  Focus,
  Layers,
  Sparkles,
  AlertTriangle,
  HelpCircle,
  X,
  CreditCard,
  BookOpen,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandLogo, IdCardGuideOverlay, BookGuideOverlay, GeminiSparkleStar } from './VectorArt';
import { IdCardService } from '../services/IdCardService';

declare const ImageCapture: any;

/**
 * Synthesizes a crisp camera mechanical shutter click via Web Audio API.
 * Completely offline, zero audio asset downloads.
 */
function playShutterSound() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (_) {
    // AudioContext blocked or not allowed
  }
}

export const CameraView: React.FC = () => {
  const {
    setCurrentImage,
    setCurrentView,
    isBatchMode,
    setIsBatchMode,
    batchPages,
    addPageToBatch,
    idCardFront,
    setIdCardFront,
    setShowOnboarding,
  } = useAppStore();

  const [idCardToast, setIdCardToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const imageCaptureRef = useRef<any>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torch, setTorch] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [captureFlash, setCaptureFlash] = useState(false);
  const [focusPos, setFocusPos] = useState<{ x: number; y: number } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Framing mode & Tips
  const [framingMode, setFramingMode] = useState<'document' | 'id_card' | 'book'>('document');
  const [showTips, setShowTips] = useState(false);

  // Live lighting analysis
  const [lightingState, setLightingState] = useState<'optimal' | 'low' | 'glare'>('optimal');

  const startCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraReady(false);
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30 },
        } as MediaTrackConstraints,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      const caps = (track as any).getCapabilities?.() ?? {};
      setTorchSupported(!!caps.torch);
      if (caps.zoom) {
        setZoomRange({ min: caps.zoom.min ?? 1, max: Math.min(caps.zoom.max ?? 1, 5) });
      }

      if (typeof ImageCapture !== 'undefined') {
        imageCaptureRef.current = new ImageCapture(track);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current!.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setError(err?.message ?? 'Camera access denied');
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startCamera]);

  // Analyze video lighting periodically without redundant re-renders
  useEffect(() => {
    if (!cameraReady) return;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 40;
    sampleCanvas.height = 40;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        ctx.drawImage(video, 0, 0, 40, 40);
        const data = ctx.getImageData(0, 0, 40, 40).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        }
        const avg = sum / (40 * 40);
        const nextState = avg < 45 ? 'low' : avg > 220 ? 'glare' : 'optimal';
        setLightingState((prev) => (prev === nextState ? prev : nextState));
      } catch (_) {}
    }, 1200);

    return () => clearInterval(interval);
  }, [cameraReady]);

  // Toggle torch
  const toggleTorch = async () => {
    if (!trackRef.current || !torchSupported) return;
    try {
      await (trackRef.current as any).applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch((t) => !t);
    } catch (e) {
      console.warn('Torch toggle failed', e);
    }
  };

  // Zoom control
  const applyZoom = async (z: number) => {
    if (!trackRef.current) return;
    const clamped = Math.max(zoomRange.min, Math.min(zoomRange.max, z));
    try {
      await (trackRef.current as any).applyConstraints({ advanced: [{ zoom: clamped }] });
      setZoom(clamped);
    } catch (e) {
      if (videoRef.current) videoRef.current.style.transform = `scale(${clamped})`;
      setZoom(clamped);
    }
  };

  // Tap to focus
  const handleTapFocus = async (
    e: React.TouchEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>
  ) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    setFocusPos({ x: clientX - rect.left, y: clientY - rect.top });
    setTimeout(() => setFocusPos(null), 900);

    if (trackRef.current) {
      try {
        await (trackRef.current as any).applyConstraints({
          advanced: [{ focusMode: 'manual', pointsOfInterest: [{ x, y }] }],
        });
      } catch (_) {}
    }
  };

  const captureFromCanvas = (): string => {
    const video = videoRef.current!;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.97);
  };

  // Capture photo with haptic & sound feedback
  const capture = useCallback(async () => {
    if (!cameraReady) return;

    playShutterSound();
    if (navigator.vibrate) navigator.vibrate([15, 30, 15]);

    setCaptureFlash(true);
    setTimeout(() => setCaptureFlash(false), 170);

    try {
      let dataUrl: string;

      if (imageCaptureRef.current) {
        try {
          const caps = await imageCaptureRef.current.getPhotoCapabilities?.();
          const photoSettings: any = {};
          if (caps?.imageWidth?.max) {
            photoSettings.imageWidth = caps.imageWidth.max;
            photoSettings.imageHeight = caps.imageHeight.max;
          }
          if (torch) photoSettings.fillLightMode = 'flash';

          const blob: Blob = await imageCaptureRef.current.takePhoto(photoSettings);
          dataUrl = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (icErr) {
          console.warn('ImageCapture failed, fallback to canvas:', icErr);
          dataUrl = captureFromCanvas();
        }
      } else {
        dataUrl = captureFromCanvas();
      }

      // 1. ID CARD DUAL-SIDE COMPOSITE FLOW
      if (framingMode === 'id_card') {
        if (!idCardFront) {
          setIdCardFront(dataUrl);
          setIdCardToast('Front Captured! Now flip card and scan the Back side.');
          setTimeout(() => setIdCardToast(null), 4000);
          return;
        } else {
          // Both sides available -> generate standard A4 composite
          setIdCardToast('Compositing Front & Back into Official A4 Document...');
          const composite = await IdCardService.createIdCardComposite(idCardFront, dataUrl);
          setIdCardFront(null);
          setIdCardToast(null);
          setCurrentImage(composite);
          setCurrentView('filter');
          return;
        }
      }

      // 2. CONTINUOUS BATCH SCANNING FLOW (Stays on camera!)
      if (isBatchMode) {
        addPageToBatch({
          id: Date.now().toString(),
          processedImage: dataUrl,
          originalImage: dataUrl,
          filter: 'magic_color',
          timestamp: Date.now(),
        });
        setIdCardToast(`Page ${batchPages.length + 1} Scanned! Keep snapping.`);
        setTimeout(() => setIdCardToast(null), 2000);
        return;
      }

      // 3. STANDARD SINGLE SCAN FLOW
      setCurrentImage(dataUrl);
      setCurrentView('crop');
    } catch (err) {
      console.error('Capture failed:', err);
    }
  }, [
    cameraReady,
    torch,
    framingMode,
    idCardFront,
    isBatchMode,
    batchPages.length,
    addPageToBatch,
    setIdCardFront,
    setCurrentImage,
    setCurrentView,
  ]);

  return (
    <div
      className="relative w-full h-full bg-black overflow-hidden select-none"
      onClick={handleTapFocus}
    >
      {/* Capture Flash effect */}
      <AnimatePresence>
        {captureFlash && (
          <motion.div
            key="flash"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-white z-50 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Camera Video Stream */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transformOrigin: 'center' }}
      />

      {/* Framing Grid */}
      {showGrid && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 opacity-25">
          {[33.33, 66.66].map((p) => (
            <g key={p}>
              <line x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%" stroke="white" strokeWidth="1" />
              <line x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`} stroke="white" strokeWidth="1" />
            </g>
          ))}
        </svg>
      )}

      {/* Dynamic Toast / Status Banner */}
      <AnimatePresence>
        {idCardToast && (
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -30, opacity: 0 }}
            className="absolute top-16 left-6 right-6 z-40 bg-gradient-to-r from-green-400 to-emerald-400 text-black font-extrabold text-xs py-2.5 px-4 rounded-2xl text-center shadow-[0_0_25px_rgba(74,222,128,0.5)] backdrop-blur-md flex items-center justify-center gap-2"
          >
            <Sparkles size={15} />
            <span>{idCardToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ID Card Step Indicator Pill */}
      {framingMode === 'id_card' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-green-400/40 shadow-lg">
          <CreditCard size={13} className="text-green-400" />
          <span className="text-[11px] font-bold text-white tracking-wide">
            {idCardFront ? 'STEP 2/2: SCAN BACK SIDE' : 'STEP 1/2: SCAN FRONT SIDE'}
          </span>
          {idCardFront && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIdCardFront(null);
              }}
              className="text-[9px] bg-red-500/30 hover:bg-red-500/50 text-red-200 px-1.5 py-0.5 rounded font-bold ml-1"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Dynamic Framing Guides Based on Mode */}
      {framingMode === 'document' && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
          <div className="relative w-[84%] h-[60%]">
            {['tl', 'tr', 'bl', 'br'].map((pos, i) => (
              <motion.div
                key={pos}
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ repeat: Infinity, duration: 2, delay: i * 0.25 }}
                className={`absolute w-9 h-9 border-green-400 ${
                  pos === 'tl'
                    ? 'top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl'
                    : pos === 'tr'
                    ? 'top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl'
                    : pos === 'bl'
                    ? 'bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl'
                    : 'bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl'
                }`}
              />
            ))}

            {/* Scanner laser sweep beam */}
            <motion.div
              animate={{ top: ['4%', '96%', '4%'] }}
              transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
              className="absolute left-0 right-0 h-[2.5px] glow-laser"
              style={{
                background: 'linear-gradient(90deg, transparent, #4ade80 30%, #4ade80 70%, transparent)',
              }}
            />

            <div className="absolute -bottom-8 left-0 right-0 text-center text-white/60 text-[10px] tracking-widest uppercase font-bold">
              DOCUMENT · ALIGN WITHIN BORDER
            </div>
          </div>
        </div>
      )}

      {framingMode === 'id_card' && <IdCardGuideOverlay />}
      {framingMode === 'book' && <BookGuideOverlay />}

      {/* Tap-to-focus Indicator */}
      <AnimatePresence>
        {focusPos && (
          <motion.div
            initial={{ scale: 1.5, opacity: 1 }}
            animate={{ scale: 1, opacity: 0.9 }}
            exit={{ opacity: 0 }}
            className="absolute z-20 w-14 h-14 border-2 border-yellow-400 rounded-sm pointer-events-none shadow-[0_0_12px_rgba(250,204,21,0.6)]"
            style={{ left: focusPos.x - 28, top: focusPos.y - 28 }}
          >
            <Focus
              size={12}
              className="text-yellow-400 absolute top-0.5 left-1/2 -translate-x-1/2"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar: Brand logo, Lighting status & Controls */}
      <div
        className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pb-3"
        style={{
          paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
        }}
      >
        {/* Left: Brand Logo & Lighting */}
        <div className="flex items-center gap-2">
          <BrandLogo size={30} showText={false} />

          {lightingState === 'low' ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleTorch();
              }}
              className="flex items-center gap-1.5 bg-amber-500/85 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-black border border-amber-400/50 shadow-md animate-pulse"
            >
              <AlertTriangle size={12} />
              <span>Low Light</span>
            </button>
          ) : lightingState === 'glare' ? (
            <div className="flex items-center gap-1 bg-red-500/60 backdrop-blur-md px-2 py-1 rounded-full text-[10px] font-medium text-white border border-red-400/30">
              <Sun size={12} />
              <span>Glare</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-semibold text-green-300 border border-green-500/30">
              <Sparkles size={11} className="text-green-400" />
              <span>AI Ready</span>
            </div>
          )}
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1.5">
          {/* Torch toggle */}
          {torchSupported && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleTorch();
              }}
              className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-md border border-white/20 flex items-center justify-center transition active:scale-95"
            >
              {torch ? (
                <Zap size={16} className="text-yellow-400 fill-yellow-400" />
              ) : (
                <ZapOff size={16} className="text-white/70" />
              )}
            </button>
          )}

          {/* Grid toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowGrid((g) => !g);
            }}
            className={`w-9 h-9 rounded-full bg-black/55 backdrop-blur-md border flex items-center justify-center transition active:scale-95 ${
              showGrid ? 'border-green-400 text-green-400' : 'border-white/20 text-white/70'
            }`}
          >
            <Grid3x3 size={16} />
          </button>

          {/* Scanning tips button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTips(true);
            }}
            className="w-9 h-9 rounded-full bg-black/55 backdrop-blur-md border border-white/20 text-white/70 hover:text-green-400 flex items-center justify-center transition active:scale-95"
            title="Scan Tips"
          >
            <HelpCircle size={16} />
          </button>

          {/* Gemini AI Tour button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (navigator.vibrate) navigator.vibrate(15);
              setShowOnboarding(true);
            }}
            className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan-500/20 via-green-500/20 to-purple-500/20 border border-green-400/40 text-green-400 flex items-center justify-center transition active:scale-95 shadow-[0_0_12px_rgba(74,222,128,0.3)]"
            title="Gemini AI Scanner Overview"
          >
            <GeminiSparkleStar size={17} gradient="aurora" />
          </button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          className="absolute left-4 right-4 z-30 bg-red-900/80 text-red-200 text-xs px-4 py-2 rounded-xl text-center backdrop-blur-md"
          style={{
            top: 'calc(max(14px, calc(env(safe-area-inset-top, 0px) + 8px)) + 46px)',
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Bottom Controls Area */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30 pb-7 pt-4 flex flex-col items-center"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        }}
      >
        {/* Zoom Slider */}
        {zoomRange.max > 1 && (
          <div className="flex items-center justify-center gap-3 mb-3 px-8 w-full max-w-xs">
            <button
              onClick={(e) => {
                e.stopPropagation();
                applyZoom(zoom - 0.5);
              }}
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ZoomOut size={14} className="text-white" />
            </button>
            <input
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={0.1}
              value={zoom}
              onChange={(e) => {
                e.stopPropagation();
                applyZoom(Number(e.target.value));
              }}
              className="flex-1 h-1 accent-green-400 cursor-pointer bg-white/20 rounded-full"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                applyZoom(zoom + 0.5);
              }}
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center"
            >
              <ZoomIn size={14} className="text-white" />
            </button>
            <span className="text-white/60 text-xs w-7">{zoom.toFixed(1)}×</span>
          </div>
        )}

        {/* Framing Mode Selector: Document / ID Card / Book */}
        <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-1 rounded-full border border-white/10 mb-2.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFramingMode('document');
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition ${
              framingMode === 'document'
                ? 'bg-white/20 text-green-400 font-bold'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <FileText size={12} />
            <span>Document</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFramingMode('id_card');
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition ${
              framingMode === 'id_card'
                ? 'bg-white/20 text-green-400 font-bold'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <CreditCard size={12} />
            <span>ID Card</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFramingMode('book');
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition ${
              framingMode === 'book'
                ? 'bg-white/20 text-green-400 font-bold'
                : 'text-white/50 hover:text-white'
            }`}
          >
            <BookOpen size={12} />
            <span>Book</span>
          </button>
        </div>

        {/* Scan Mode Toggle Pill: Single vs Batch Scan */}
        <div className="flex items-center bg-black/60 backdrop-blur-md p-1 rounded-full border border-white/15 mb-3.5 shadow-lg">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsBatchMode(false);
            }}
            className={`px-3.5 py-1 rounded-full text-xs font-semibold transition ${
              !isBatchMode ? 'bg-green-400 text-black shadow-sm' : 'text-white/60 hover:text-white'
            }`}
          >
            Single Scan
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsBatchMode(true);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold transition ${
              isBatchMode ? 'bg-green-400 text-black shadow-sm' : 'text-white/60 hover:text-white'
            }`}
          >
            <Layers size={13} />
            <span>Batch Scan</span>
            {batchPages.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-black text-green-400 text-[10px] font-black rounded-full">
                {batchPages.length}
              </span>
            )}
          </button>
        </div>

        {/* Shutter Bar */}
        <div className="w-full flex items-center justify-between px-10">
          {/* Flip Camera */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFacingMode((f) => (f === 'environment' ? 'user' : 'environment'));
            }}
            className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center active:bg-white/20 transition"
          >
            <RotateCcw size={20} className="text-white" />
          </button>

          {/* Shutter Button */}
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              capture();
            }}
            disabled={!cameraReady}
            className="relative w-[78px] h-[78px] flex items-center justify-center"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            <div className="absolute inset-0 rounded-full border-[4px] border-white/80" />
            <motion.div
              animate={
                cameraReady
                  ? {
                      boxShadow: [
                        '0 0 0px rgba(74,222,128,0)',
                        '0 0 24px rgba(74,222,128,0.9)',
                        '0 0 0px rgba(74,222,128,0)',
                      ],
                    }
                  : {}
              }
              transition={{ repeat: Infinity, duration: 2.2 }}
              className={`w-[60px] h-[60px] rounded-full transition-colors ${
                cameraReady ? 'bg-white' : 'bg-gray-600'
              }`}
            />
          </button>

          {/* Batch Session Thumbnail or Sun Indicator */}
          {batchPages.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentView('gallery');
              }}
              className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-green-400 shadow-md"
            >
              <img
                src={batchPages[batchPages.length - 1].processedImage}
                alt="Batch preview"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-[10px] font-bold text-white">
                {batchPages.length}p
              </div>
            </button>
          ) : (
            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
              <Sun size={18} className="text-white/40" />
            </div>
          )}
        </div>
      </div>

      {/* Pro Scanning Tips Modal Sheet */}
      <AnimatePresence>
        {showTips && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end p-4"
            onClick={() => setShowTips(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#181818] border border-white/15 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 text-white"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-400/20 flex items-center justify-center text-green-400">
                    <Sparkles size={16} />
                  </div>
                  <h3 className="text-base font-bold font-display">How To Scan Like A Pro</h3>
                </div>
                <button
                  onClick={() => setShowTips(false)}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex flex-col gap-3 text-xs text-white/80">
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-lg">📐</span>
                  <div>
                    <p className="font-bold text-white text-[13px]">Keep Camera Parallel</p>
                    <p className="text-white/60 text-[11px] mt-0.5">
                      Hold phone directly over document. Align corners so perspective warp is minimal.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-lg">💡</span>
                  <div>
                    <p className="font-bold text-white text-[13px]">Avoid Direct Glare</p>
                    <p className="text-white/60 text-[11px] mt-0.5">
                      If overhead lights cause reflections on glossy paper or plastic ID cards, tilt 10° or step back.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-white/5 border border-white/5">
                  <span className="text-lg">✨</span>
                  <div>
                    <p className="font-bold text-white text-[13px]">Use Magic Color</p>
                    <p className="text-white/60 text-[11px] mt-0.5">
                      Our dual-engine MSRCR filter automatically removes table background, bleaches paper white, and sharpens ink strokes.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowTips(false)}
                className="w-full bg-green-400 text-black font-bold py-3 rounded-xl text-xs hover:bg-green-300 transition"
              >
                Got It, Let's Scan!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
