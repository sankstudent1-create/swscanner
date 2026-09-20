import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAppStore } from '../store/AppStore';
import { FilterWorkerClient, type ImageAdjustments } from '../services/FilterWorkerClient';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  Save,
  Sliders,
  Columns,
  Plus,
  CheckCheck,
  RotateCcw,
  Sun,
  Contrast,
  Thermometer,
  Zap,
} from 'lucide-react';

const FILTERS = [
  { id: 'magic_color', label: 'Magic Color', emoji: '✨', desc: 'AI paper whitening & ink punch' },
  { id: 'bw',          label: 'Deep B & W',  emoji: '🖤', desc: 'Sauvola 2.0 adaptive threshold' },
  { id: 'id_card',     label: 'ID / Card',   emoji: '🪪', desc: 'Anti-glare & crisp contrast' },
  { id: 'warm_book',   label: 'Book / Warm', emoji: '📖', desc: 'Parchment & soft reading hue' },
  { id: 'vivid',       label: 'Vivid Photo', emoji: '🎨', desc: 'Punchy color & clarity' },
  { id: 'grayscale',   label: 'Grayscale',   emoji: '🌫️', desc: 'High-contrast sigmoid L-curve' },
  { id: 'whiteboard',  label: 'Whiteboard',  emoji: '📋', desc: 'Removes glare & shadows' },
  { id: 'sharpen',     label: 'Sharpen',     emoji: '🔍', desc: 'Multi-radius unsharp mask' },
  { id: 'original',    label: 'Original',    emoji: '📷', desc: 'Raw document capture' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  warmth: 0,
  sharpness: 0,
};

export const FilterPreview: React.FC = () => {
  const {
    currentImage,
    setCurrentView,
    addDocument,
    batchPages,
    addPageToBatch,
    saveCurrentBatchAsDocument,
    activeTargetDocId,
    appendPageToDocument,
    isBatchMode,
  } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<FilterId>('magic_color');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [thumbnails, setThumbnails] = useState<Partial<Record<FilterId, string>>>({});

  // Adjustment sliders state
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);

  // Before / After Split Slider state
  const [showSplit, setShowSplit] = useState(false);
  const [splitPos, setSplitPos] = useState(50); // percentage 0 - 100
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLImageElement | null>(null);
  const rawImageDataRef = useRef<ImageData | null>(null);

  /**
   * Apply filter & adjustments using the background Web Worker.
   * Runs off the main thread so UI stays fluid.
   */
  const applyFilterViaWorker = useCallback(
    async (filterId: FilterId, adj: ImageAdjustments) => {
      const canvas = mainCanvasRef.current;
      const img = sourceRef.current;
      if (!canvas || !img) return;

      setIsProcessing(true);

      try {
        // Grab base ImageData scaled to max 1440px for 60fps blazing fast performance
        if (!rawImageDataRef.current) {
          const off = document.createElement('canvas');
          const MAX_DIM = 1440;
          const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          off.width = w;
          off.height = h;
          const ctx = off.getContext('2d')!;
          ctx.drawImage(img, 0, 0, w, h);
          rawImageDataRef.current = ctx.getImageData(0, 0, w, h);
        }

        const processed = await FilterWorkerClient.process(
          rawImageDataRef.current,
          filterId,
          adj,
          'main'
        );

        canvas.width = processed.width;
        canvas.height = processed.height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(processed, 0, 0);
      } catch (err: any) {
        if (err?.message !== 'SUPERSEDED') {
          console.warn('Worker fallback to raw draw:', err);
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d')?.drawImage(img, 0, 0);
        }
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  /**
   * Generate thumbnails for all filters using downsampled proxy on 'thumb' channel.
   */
  const generateThumbs = useCallback(
    async (img: HTMLImageElement) => {
      const THUMB_MAX = 90;
      const scale = Math.min(1, THUMB_MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const tw = Math.round(img.naturalWidth * scale);
      const th = Math.round(img.naturalHeight * scale);

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = tw;
      thumbCanvas.height = th;
      const thumbCtx = thumbCanvas.getContext('2d')!;
      thumbCtx.drawImage(img, 0, 0, tw, th);
      const thumbImageData = thumbCtx.getImageData(0, 0, tw, th);

      const thumbs: Partial<Record<FilterId, string>> = {};

      for (const f of FILTERS) {
        try {
          const processed = await FilterWorkerClient.process(
            thumbImageData,
            f.id,
            DEFAULT_ADJUSTMENTS,
            'thumb'
          );
          const workCanvas = document.createElement('canvas');
          workCanvas.width = tw;
          workCanvas.height = th;
          workCanvas.getContext('2d')!.putImageData(processed, 0, 0);
          thumbs[f.id] = workCanvas.toDataURL('image/jpeg', 0.8);
        } catch (_) {
          // Skip if cancelled
        }
      }

      setThumbnails(thumbs);
    },
    []
  );

  // Initialize image on load: immediately render main magic_color filter
  useEffect(() => {
    if (!currentImage) return;
    setThumbnails({});
    rawImageDataRef.current = null;
    setIsProcessing(true);

    loadImage(currentImage)
      .then((img) => {
        sourceRef.current = img;
        const canvas = mainCanvasRef.current;
        if (canvas) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
        }
        // 1. Immediately apply the default Magic Color AI filter on main channel
        applyFilterViaWorker('magic_color', DEFAULT_ADJUSTMENTS);

        // 2. Generate thumbnails in background after main image renders
        setTimeout(() => {
          generateThumbs(img);
        }, 60);
      })
      .catch((e) => {
        console.error('Failed to load image in FilterPreview', e);
        setIsProcessing(false);
      });
  }, [currentImage, generateThumbs, applyFilterViaWorker]);

  const handleFilterSelect = (id: FilterId) => {
    setActiveFilter(id);
    applyFilterViaWorker(id, adjustments);
  };

  const handleAdjustmentChange = (key: keyof ImageAdjustments, val: number) => {
    const updated = { ...adjustments, [key]: val };
    setAdjustments(updated);
    applyFilterViaWorker(activeFilter, updated);
  };

  const handleResetAdjustments = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS);
    applyFilterViaWorker(activeFilter, DEFAULT_ADJUSTMENTS);
  };

  // Before/After drag handler
  const handleSplitPointerDown = (e: React.PointerEvent) => {
    isDraggingSplit.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleSplitPointerMove = (e: React.PointerEvent) => {
    if (!isDraggingSplit.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percent = Math.round((x / rect.width) * 100);
    setSplitPos(percent);
  };

  const handleSplitPointerUp = () => {
    isDraggingSplit.current = false;
  };

  // Save actions
  const getProcessedDataUrl = (): string | null => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/jpeg', 0.95);
  };

  const handleSave = async () => {
    const processedImageData = getProcessedDataUrl();
    if (!processedImageData || !currentImage) return;

    setIsSaving(true);
    try {
      const newPage = {
        id: Date.now().toString(),
        processedImage: processedImageData,
        originalImage: currentImage,
        filter: activeFilter,
        timestamp: Date.now(),
      };

      // Case 1: Appending to an existing document from gallery
      if (activeTargetDocId) {
        await appendPageToDocument(activeTargetDocId, newPage);
        setCurrentView('gallery');
        return;
      }

      // Case 2: Multi-page batch session (saves all previous pages + current page)
      if (batchPages.length > 0) {
        await saveCurrentBatchAsDocument(undefined, newPage);
        setCurrentView('gallery');
        return;
      }

      // Case 3: Single document
      await addDocument({
        id: Date.now().toString(),
        title: `Scan ${new Date().toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        timestamp: Date.now(),
        pages: [newPage],
      });
      setCurrentView('gallery');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddPageAndContinue = () => {
    const processedImageData = getProcessedDataUrl();
    if (!processedImageData || !currentImage) return;

    addPageToBatch({
      id: Date.now().toString(),
      processedImage: processedImageData,
      originalImage: currentImage,
      filter: activeFilter,
      timestamp: Date.now(),
    });

    // Go back to camera for next page
    setCurrentView('camera');
  };

  if (!currentImage) {
    setCurrentView('camera');
    return null;
  }

  const activeFilterMeta = FILTERS.find((f) => f.id === activeFilter);
  const totalPagesInSession = batchPages.length + 1;

  return (
    <div className="w-full h-full flex flex-col bg-black text-white select-none">
      {/* Top Header */}
      <div
        className="shrink-0 flex items-center justify-between px-4 pb-3 bg-black/90 border-b border-white/10 z-20"
        style={{
          paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
        }}
      >
        <button
          onClick={() => setCurrentView('crop')}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20 transition"
        >
          <ChevronLeft size={20} className="text-white" />
        </button>

        <div className="flex flex-col items-center">
          <span className="text-white font-semibold text-sm">Enhance & Filter</span>
          <span className="text-white/40 text-[10px]">
            {isBatchMode ? `Page ${totalPagesInSession} of batch` : 'Single Page'}
          </span>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          {/* Split Comparison Toggle */}
          <button
            onClick={() => setShowSplit((s) => !s)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition border ${
              showSplit
                ? 'bg-green-400 text-black border-green-400'
                : 'bg-white/10 text-white border-white/10 hover:bg-white/15'
            }`}
            title="Before / After Comparison"
          >
            <Columns size={17} />
          </button>

          {/* Adjustments Toggle */}
          <button
            onClick={() => setShowAdjustments((a) => !a)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition border ${
              showAdjustments
                ? 'bg-green-400 text-black border-green-400'
                : 'bg-white/10 text-white border-white/10 hover:bg-white/15'
            }`}
            title="Manual Fine-Tuning"
          >
            <Sliders size={17} />
          </button>
        </div>
      </div>

      {/* Main Display Area */}
      <div
        ref={splitContainerRef}
        className="flex-1 relative flex items-center justify-center bg-[#080808] overflow-hidden"
      >
        {/* Processed Canvas */}
        <canvas
          ref={mainCanvasRef}
          className="max-h-full max-w-full"
          style={{ objectFit: 'contain', borderRadius: 2 }}
        />

        {/* Before / After Split Comparison Overlay */}
        {showSplit && currentImage && (
          <div
            className="absolute inset-0 pointer-events-none flex items-center justify-center"
            style={{
              clipPath: `inset(0 ${100 - splitPos}% 0 0)`,
            }}
          >
            <img
              src={currentImage}
              alt="Original"
              className="max-h-full max-w-full object-contain"
            />
            {/* "Original" Tag */}
            <div className="absolute top-4 left-4 bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/20 text-[11px] font-bold text-white/80">
              ORIGINAL
            </div>
          </div>
        )}

        {/* Split comparison draggable handle */}
        {showSplit && (
          <div
            className="absolute top-0 bottom-0 z-30 cursor-ew-resize flex items-center justify-center"
            style={{ left: `${splitPos}%`, transform: 'translateX(-50%)' }}
            onPointerDown={handleSplitPointerDown}
            onPointerMove={handleSplitPointerMove}
            onPointerUp={handleSplitPointerUp}
            onPointerCancel={handleSplitPointerUp}
          >
            <div className="w-[2px] h-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]" />
            <div className="absolute w-8 h-8 rounded-full bg-green-400 text-black shadow-lg flex items-center justify-center text-[10px] font-black pointer-events-none">
              ⇄
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-[2px] z-20"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }}
                className="w-11 h-11 border-[3px] border-green-400 border-t-transparent rounded-full mb-2.5 shadow-[0_0_15px_rgba(74,222,128,0.4)]"
              />
              <span className="text-white/80 text-xs font-medium tracking-wide">
                Enhancing document clarity...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Filter Info Badge */}
        {activeFilterMeta && !showSplit && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/15 rounded-full px-3 py-1 shadow-md">
            <span className="text-sm">{activeFilterMeta.emoji}</span>
            <span className="text-white text-xs font-semibold">{activeFilterMeta.label}</span>
          </div>
        )}
      </div>

      {/* Expandable Fine-Tuning Drawer */}
      <AnimatePresence>
        {showAdjustments && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 bg-[#161616] border-t border-white/10 px-5 py-3.5 flex flex-col gap-2.5 overflow-hidden"
          >
            <div className="flex items-center justify-between text-xs text-white/60 mb-0.5">
              <span className="font-semibold text-white uppercase tracking-wider text-[11px]">
                Fine-Tune Adjustments
              </span>
              <button
                onClick={handleResetAdjustments}
                className="flex items-center gap-1 text-[11px] text-green-400 hover:underline"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>

            {/* Brightness */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-24 text-white/80 text-xs">
                <Sun size={14} className="text-yellow-400" />
                <span>Brightness</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                value={adjustments.brightness}
                onChange={(e) => handleAdjustmentChange('brightness', Number(e.target.value))}
                className="flex-1 h-1.5 accent-green-400 cursor-pointer bg-white/20 rounded-lg"
              />
              <span className="w-8 text-right text-[11px] text-white/50">
                {adjustments.brightness > 0 ? `+${adjustments.brightness}` : adjustments.brightness}
              </span>
            </div>

            {/* Contrast */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-24 text-white/80 text-xs">
                <Contrast size={14} className="text-blue-400" />
                <span>Contrast</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                value={adjustments.contrast}
                onChange={(e) => handleAdjustmentChange('contrast', Number(e.target.value))}
                className="flex-1 h-1.5 accent-green-400 cursor-pointer bg-white/20 rounded-lg"
              />
              <span className="w-8 text-right text-[11px] text-white/50">
                {adjustments.contrast > 0 ? `+${adjustments.contrast}` : adjustments.contrast}
              </span>
            </div>

            {/* Warmth */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-24 text-white/80 text-xs">
                <Thermometer size={14} className="text-amber-400" />
                <span>Warmth</span>
              </div>
              <input
                type="range"
                min={-50}
                max={50}
                value={adjustments.warmth}
                onChange={(e) => handleAdjustmentChange('warmth', Number(e.target.value))}
                className="flex-1 h-1.5 accent-green-400 cursor-pointer bg-white/20 rounded-lg"
              />
              <span className="w-8 text-right text-[11px] text-white/50">
                {adjustments.warmth > 0 ? `+${adjustments.warmth}` : adjustments.warmth}
              </span>
            </div>

            {/* Sharpness */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-24 text-white/80 text-xs">
                <Zap size={14} className="text-purple-400" />
                <span>Sharpness</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={adjustments.sharpness}
                onChange={(e) => handleAdjustmentChange('sharpness', Number(e.target.value))}
                className="flex-1 h-1.5 accent-green-400 cursor-pointer bg-white/20 rounded-lg"
              />
              <span className="w-8 text-right text-[11px] text-white/50">
                {adjustments.sharpness}%
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter Horizontal Strip */}
      <div className="shrink-0 bg-[#111] border-t border-white/10">
        <div
          className="flex overflow-x-auto gap-3.5 px-4 py-3"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {FILTERS.map((f) => {
            const isSelected = activeFilter === f.id;
            return (
              <motion.button
                key={f.id}
                whileTap={{ scale: 0.93 }}
                onClick={() => handleFilterSelect(f.id)}
                className="flex flex-col items-center shrink-0"
              >
                <div
                  className={`relative w-[62px] h-[78px] rounded-xl overflow-hidden border-2 transition-all ${
                    isSelected
                      ? 'border-green-400 shadow-[0_0_14px_rgba(74,222,128,0.5)]'
                      : 'border-white/15 opacity-70 hover:opacity-90'
                  }`}
                >
                  {thumbnails[f.id] ? (
                    <img
                      src={thumbnails[f.id]}
                      alt={f.label}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center text-xl">
                      {f.emoji}
                    </div>
                  )}
                  {isSelected && <div className="absolute inset-0 bg-green-400/10" />}
                </div>
                <span
                  className={`text-[11px] mt-1.5 font-medium ${
                    isSelected ? 'text-green-400 font-bold' : 'text-white/60'
                  }`}
                >
                  {f.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Bottom Save / Multi-page Action Row */}
      <div
        className="shrink-0 bg-[#1a1a1a] flex items-center justify-between px-4 pt-2 border-t border-white/10 gap-2"
        style={{
          minHeight: 'calc(74px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <button
          onClick={() => setCurrentView('crop')}
          className="flex flex-col items-center justify-center w-12 text-white/50 active:text-white"
        >
          <ChevronLeft size={20} />
          <span className="text-[9px]">Crop</span>
        </button>

        {/* Center: Save / Add Page actions */}
        <div className="flex-1 flex items-center justify-center gap-2 max-w-sm">
          {/* Add Another Page button (always accessible or in batch mode) */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={handleAddPageAndContinue}
            disabled={isSaving || isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 text-white font-semibold py-3 px-3 rounded-xl border border-white/20 text-xs transition disabled:opacity-40"
          >
            <Plus size={16} className="text-green-400" />
            <span>Add Next Page</span>
          </motion.button>

          {/* Save / Complete Document button */}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={handleSave}
            disabled={isSaving || isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 bg-green-400 hover:bg-green-300 text-black font-bold py-3 px-3 rounded-xl shadow-[0_0_20px_rgba(74,222,128,0.4)] text-xs transition disabled:opacity-40"
          >
            {isSaving ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
                className="w-4 h-4 border-2 border-black border-t-transparent rounded-full"
              />
            ) : activeTargetDocId ? (
              <Plus size={16} strokeWidth={3} />
            ) : batchPages.length > 0 ? (
              <CheckCheck size={16} />
            ) : (
              <Save size={16} />
            )}
            <span>
              {isSaving
                ? 'Saving...'
                : activeTargetDocId
                ? 'Save Page to Doc'
                : batchPages.length > 0
                ? `Save Doc (${batchPages.length + 1}p)`
                : 'Save Document'}
            </span>
          </motion.button>
        </div>
      </div>
    </div>
  );
};
