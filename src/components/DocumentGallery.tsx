import React, { useState } from 'react';
import { useAppStore } from '../store/AppStore';
import { PdfService } from '../services/PdfService';
import { OcrService } from '../services/OcrService';
import type { ScannedDocument } from '../services/StorageService';
import {
  FileDown,
  Trash2,
  Share2,
  Edit2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Camera,
  Sparkles,
  Layers,
  FileText,
  Copy,
  Download,
  Search,
  CheckSquare,
  Square,
  Combine,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrandLogo, EmptyGalleryVector, GeminiSparkleStar } from './VectorArt';

export const DocumentGallery: React.FC = () => {
  const {
    documents,
    deleteDocument,
    deleteMultipleDocuments,
    mergeDocumentsIntoOne,
    updateDocumentTitle,
    deleteDocumentPage,
    setCurrentView,
    batchPages,
    saveCurrentBatchAsDocument,
    clearBatch,
    setShowOnboarding,
    setActiveTargetDocId,
  } = useAppStore();

  const [isExporting, setIsExporting] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ScannedDocument | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);

  // Multi-selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());

  // Inline rename state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrResultText, setOcrResultText] = useState<string | null>(null);
  const [ocrSearchQuery, setOcrSearchQuery] = useState('');
  const [copiedToast, setCopiedToast] = useState(false);

  // Selection handlers
  const toggleSelectDoc = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocIds.size === documents.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(documents.map((d) => d.id)));
    }
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedDocIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedDocIds.size === 0) return;
    const count = selectedDocIds.size;
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? 'document' : 'documents'}?`)) {
      return;
    }
    await deleteMultipleDocuments(Array.from(selectedDocIds));
    exitSelectionMode();
  };

  const handleBulkMerge = async () => {
    if (selectedDocIds.size < 2) {
      alert('Please select at least 2 documents to merge.');
      return;
    }
    const defaultTitle = `Merged Doc (${selectedDocIds.size} files) - ${new Date().toLocaleDateString()}`;
    const title = window.prompt('Enter title for merged document:', defaultTitle);
    if (!title) return;

    setIsExporting(true);
    try {
      const merged = await mergeDocumentsIntoOne(Array.from(selectedDocIds), title);
      exitSelectionMode();
      if (merged) {
        handleOpenDoc(merged);
      }
    } catch (e) {
      console.error('Failed to merge documents', e);
      alert('Failed to merge documents. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkExport = async () => {
    if (selectedDocIds.size === 0) return;
    setIsExporting(true);
    try {
      const selectedDocs = documents.filter((d) => selectedDocIds.has(d.id));
      const blob = await PdfService.generatePdf(selectedDocs);
      await PdfService.sharePdf(blob, `Selected_Scans_${Date.now()}.pdf`);
      exitSelectionMode();
    } catch (e) {
      console.error('Failed to export selected documents', e);
      alert('Failed to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  // Open Document Detail
  const handleOpenDoc = (doc: ScannedDocument) => {
    if (isSelectionMode) {
      toggleSelectDoc(doc.id);
      return;
    }
    setSelectedDoc(doc);
    setActivePageIndex(0);
    setIsEditingTitle(false);
    setEditedTitle(doc.title);
    setOcrResultText(null);
  };

  const handleSaveTitle = async () => {
    if (!selectedDoc) return;
    await updateDocumentTitle(selectedDoc.id, editedTitle);
    setSelectedDoc((prev) => (prev ? { ...prev, title: editedTitle } : null));
    setIsEditingTitle(false);
  };

  const handleExportSingleDoc = async (doc: ScannedDocument) => {
    setIsExporting(true);
    try {
      const blob = await PdfService.generatePdf(doc.pages);
      await PdfService.sharePdf(blob, `${doc.title.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error('Failed to export PDF', e);
      alert('Failed to export document. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAll = async () => {
    if (documents.length === 0) return;
    setIsExporting(true);
    try {
      const blob = await PdfService.generatePdf(documents);
      await PdfService.sharePdf(blob, `All_Scanned_Docs_${Date.now()}.pdf`);
    } catch (e) {
      console.error('Failed to export all documents', e);
      alert('Failed to export PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeletePage = async (docId: string, pageId: string) => {
    if (!window.confirm('Delete this page from the document?')) return;
    await deleteDocumentPage(docId, pageId);

    const updated = documents.find((d) => d.id === docId);
    if (!updated || updated.pages.length <= 1) {
      setSelectedDoc(null);
    } else {
      setSelectedDoc(updated);
      setActivePageIndex((prev) => Math.max(0, prev - 1));
    }
  };

  // Run OCR on current active page
  const handleRunOcr = async () => {
    if (!selectedDoc) return;
    const page = selectedDoc.pages[activePageIndex];
    const imageSrc = page?.processedImage || selectedDoc.processedImage;
    if (!imageSrc) return;

    setOcrLoading(true);
    setOcrStatus('Starting OCR...');
    setOcrProgress(0.05);

    try {
      const text = await OcrService.extractText(imageSrc, (status, progress) => {
        setOcrStatus(status);
        setOcrProgress(progress);
      });
      setOcrResultText(text || 'No text recognized in this page.');
    } catch (err: any) {
      console.error('OCR Error:', err);
      alert('OCR failed: ' + (err?.message || 'Could not recognize text.'));
    } finally {
      setOcrLoading(false);
    }
  };

  const handleCopyOcrText = () => {
    if (!ocrResultText) return;
    navigator.clipboard.writeText(ocrResultText);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2000);
  };

  const handleDownloadOcrText = () => {
    if (!ocrResultText || !selectedDoc) return;
    const blob = new Blob([ocrResultText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDoc.title}_page_${activePageIndex + 1}_OCR.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-full bg-[#121212] flex flex-col text-white select-none">
      {/* Top Header */}
      <div
        className="px-5 pb-3.5 border-b border-white/10 flex justify-between items-center bg-[#181818]/90 backdrop-blur-md shrink-0"
        style={{
          paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
        }}
      >
        {isSelectionMode ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <button
                onClick={exitSelectionMode}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
              >
                <X size={16} />
              </button>
              <span className="text-sm font-bold text-green-400">
                {selectedDocIds.size} Selected
              </span>
            </div>
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white bg-white/10 px-3 py-1.5 rounded-xl transition"
            >
              {selectedDocIds.size === documents.length ? (
                <>
                  <Square size={13} />
                  <span>Deselect All</span>
                </>
              ) : (
                <>
                  <CheckSquare size={13} />
                  <span>Select All</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <>
            <BrandLogo size={32} showText={true} />

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(15);
                  setShowOnboarding(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/15 via-green-500/15 to-purple-500/15 border border-green-400/30 text-xs font-semibold text-white/90 hover:text-white transition active:scale-95 shadow-[0_0_12px_rgba(74,222,128,0.2)]"
                title="View Gemini AI Features"
              >
                <GeminiSparkleStar size={15} gradient="aurora" />
                <span className="hidden sm:inline">AI Engine</span>
              </button>

              {documents.length > 0 && (
                <>
                  <button
                    onClick={() => setIsSelectionMode(true)}
                    className="flex items-center gap-1 bg-white/10 text-white/80 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition"
                  >
                    <CheckSquare size={13} />
                    <span>Select</span>
                  </button>

                  <button
                    onClick={handleExportAll}
                    disabled={isExporting}
                    className="flex items-center gap-1.5 bg-green-400 text-black px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-[0_0_15px_rgba(74,222,128,0.3)] hover:bg-green-300 transition active:scale-95 disabled:opacity-50"
                  >
                    <FileDown size={14} />
                    <span>{isExporting ? 'Exporting...' : 'Export All'}</span>
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Unfinalized Batch Session Notification Banner */}
      {batchPages.length > 0 && (
        <div className="bg-green-950/70 border-b border-green-500/30 px-5 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-green-300">
            <Layers size={15} />
            <span>
              You have <b>{batchPages.length}</b> unfinalized scan {batchPages.length === 1 ? 'page' : 'pages'}.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => saveCurrentBatchAsDocument()}
              className="bg-green-400 text-black px-2.5 py-1 rounded-md font-bold text-[11px]"
            >
              Save Now
            </button>
            <button
              onClick={clearBatch}
              className="text-white/60 hover:text-white text-[11px]"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Gallery Grid */}
      <div
        className="flex-1 overflow-y-auto p-4"
        style={{
          paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <EmptyGalleryVector />
            <h3 className="font-display font-extrabold text-xl text-white mt-2">
              No Scanned Documents Yet
            </h3>
            <p className="text-xs text-white/50 max-w-xs mt-1 leading-relaxed">
              Experience studio-quality scanning with our multi-pass AI edge detection, Retinex paper bleaching, and instant multi-page capture.
            </p>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setCurrentView('camera')}
              className="mt-5 flex items-center gap-2 bg-green-400 text-black font-bold px-6 py-3 rounded-2xl shadow-[0_0_20px_rgba(74,222,128,0.4)] hover:bg-green-300 transition text-xs"
            >
              <Camera size={16} />
              <span>Scan First Document</span>
            </motion.button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {documents.map((doc) => {
              const coverImg = doc.pages?.[0]?.processedImage || doc.processedImage || '';
              const pageCount = doc.pages?.length || 1;
              const date = new Date(doc.timestamp);
              const isSelected = selectedDocIds.has(doc.id);

              return (
                <div
                  key={doc.id}
                  onClick={() => handleOpenDoc(doc)}
                  className={`group relative flex flex-col bg-[#1c1c1c] rounded-2xl overflow-hidden border transition cursor-pointer shadow-lg ${
                    isSelected
                      ? 'border-green-400 ring-2 ring-green-400/50 shadow-green-500/20'
                      : 'border-white/10 hover:border-green-400/50 hover:shadow-green-500/10'
                  }`}
                >
                  {/* Selection Mode Checkbox Indicator */}
                  {isSelectionMode && (
                    <div
                      onClick={(e) => toggleSelectDoc(doc.id, e)}
                      className={`absolute top-2.5 left-2.5 z-20 w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-green-400 text-black shadow-[0_0_10px_rgba(74,222,128,0.7)]'
                          : 'bg-black/60 border border-white/50 text-transparent hover:border-white'
                      }`}
                    >
                      <Check size={14} strokeWidth={3.5} />
                    </div>
                  )}

                  {/* Thumbnail Cover */}
                  <div className="relative aspect-[1/1.3] bg-[#0c0c0c] overflow-hidden">
                    <img
                      src={coverImg}
                      alt={doc.title}
                      className={`w-full h-full object-cover transition-transform duration-300 ${
                        isSelected ? 'scale-95 opacity-90' : 'group-hover:scale-105'
                      }`}
                    />

                    {/* Page count pill */}
                    <div className="absolute top-2.5 right-2.5 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-bold text-white border border-white/20 flex items-center gap-1">
                      <Layers size={10} className="text-green-400" />
                      <span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
                    </div>
                  </div>

                  {/* Document Card Footer */}
                  <div className="p-3 bg-[#1c1c1c] flex flex-col gap-1">
                    <span className="text-xs font-semibold text-white truncate group-hover:text-green-300 transition">
                      {doc.title}
                    </span>
                    <div className="flex items-center justify-between text-[10px] text-white/40">
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                      <span>{date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {isSelectionMode && selectedDocIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed left-4 right-4 z-40 bg-[#1f1f1f]/95 backdrop-blur-xl border border-white/15 p-3 rounded-2xl shadow-2xl flex items-center justify-between max-w-lg mx-auto"
            style={{
              bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
            }}
          >
            <div className="text-xs font-bold text-green-400 pl-2">
              {selectedDocIds.size} Selected
            </div>

            <div className="flex items-center gap-2">
              {/* Merge Docs */}
              <button
                onClick={handleBulkMerge}
                disabled={selectedDocIds.size < 2 || isExporting}
                className="flex items-center gap-1.5 bg-green-400 text-black px-3.5 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-green-300 transition disabled:opacity-40"
                title="Merge selected into one document"
              >
                <Combine size={14} />
                <span>Merge Docs</span>
              </button>

              {/* Export Selected */}
              <button
                onClick={handleBulkExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-xl text-xs font-semibold transition"
                title="Export selected documents as single PDF"
              >
                <FileDown size={14} />
                <span>Export PDF</span>
              </button>

              {/* Bulk Delete */}
              <button
                onClick={handleBulkDelete}
                className="w-9 h-9 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition"
                title="Delete selected documents"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document Detail & Page Carousel Modal */}
      <AnimatePresence>
        {selectedDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col text-white"
          >
            {/* Modal Header */}
            <div
              className="shrink-0 flex items-center justify-between px-4 pb-3 border-b border-white/10 bg-black/80"
              style={{
                paddingTop: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
              }}
            >
              <button
                onClick={() => {
                  setSelectedDoc(null);
                  setOcrResultText(null);
                }}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center active:bg-white/20"
              >
                <ChevronLeft size={20} className="text-white" />
              </button>

              {/* Title / Editable Input */}
              <div className="flex-1 flex items-center justify-center px-3 max-w-sm">
                {isEditingTitle ? (
                  <div className="flex items-center gap-1.5 w-full">
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="w-full bg-white/10 border border-green-400 rounded-lg px-2.5 py-1 text-sm text-white focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitle}
                      className="w-8 h-8 rounded-lg bg-green-400 text-black flex items-center justify-center shrink-0 font-bold"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={() => setIsEditingTitle(false)}
                      className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => {
                      setEditedTitle(selectedDoc.title);
                      setIsEditingTitle(true);
                    }}
                    className="flex items-center gap-1.5 cursor-pointer group"
                    title="Tap to rename"
                  >
                    <span className="text-sm font-bold truncate max-w-[180px]">
                      {selectedDoc.title}
                    </span>
                    <Edit2
                      size={13}
                      className="text-white/40 group-hover:text-green-400 transition"
                    />
                  </div>
                )}
              </div>

              {/* Actions: AI OCR / Export PDF / Delete */}
              <div className="flex items-center gap-2">
                {/* AI OCR Button */}
                <button
                  onClick={handleRunOcr}
                  disabled={ocrLoading}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-xl text-xs font-semibold transition"
                  title="Extract text with AI OCR"
                >
                  {ocrLoading ? (
                    <Loader2 size={13} className="animate-spin text-green-400" />
                  ) : (
                    <Sparkles size={13} className="text-green-400" />
                  )}
                  <span>{ocrLoading ? 'Scanning...' : 'AI OCR'}</span>
                </button>

                <button
                  onClick={() => handleExportSingleDoc(selectedDoc)}
                  disabled={isExporting}
                  className="flex items-center gap-1 bg-green-400 text-black px-2.5 py-1.5 rounded-xl text-xs font-bold shadow-md hover:bg-green-300 transition"
                >
                  <Share2 size={13} />
                  <span>PDF</span>
                </button>

                <button
                  onClick={async () => {
                    if (window.confirm('Delete this entire document?')) {
                      await deleteDocument(selectedDoc.id);
                      setSelectedDoc(null);
                    }
                  }}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/30 hover:text-red-400 flex items-center justify-center transition"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* OCR Live Progress Bar */}
            {ocrLoading && (
              <div className="bg-green-950/80 border-b border-green-500/30 px-4 py-2 flex items-center gap-3">
                <Loader2 size={15} className="animate-spin text-green-400 shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-green-300">{ocrStatus}</span>
                    <span className="text-green-400 font-bold">{Math.round(ocrProgress * 100)}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-400 transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min(100, Math.round(ocrProgress * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Modal Page Viewer */}
            <div className="flex-1 relative flex items-center justify-center p-4 bg-[#0a0a0a] overflow-hidden">
              {selectedDoc.pages[activePageIndex]?.processedImage ? (
                <img
                  src={selectedDoc.pages[activePageIndex].processedImage}
                  alt={`Page ${activePageIndex + 1}`}
                  className="max-h-full max-w-full object-contain rounded-sm drop-shadow-2xl"
                />
              ) : (
                <div className="text-white/50 text-sm">Image unavailable</div>
              )}

              {/* Page Carousel Left / Right Arrows */}
              {selectedDoc.pages.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      setActivePageIndex((p) =>
                        p > 0 ? p - 1 : selectedDoc.pages.length - 1
                      );
                      setOcrResultText(null);
                    }}
                    className="absolute left-4 w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-black/80 transition"
                  >
                    <ChevronLeft size={22} />
                  </button>
                  <button
                    onClick={() => {
                      setActivePageIndex((p) =>
                        p < selectedDoc.pages.length - 1 ? p + 1 : 0
                      );
                      setOcrResultText(null);
                    }}
                    className="absolute right-4 w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-black/80 transition"
                  >
                    <ChevronRight size={22} />
                  </button>
                </>
              )}

              {/* Page counter & delete page badge */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <div className="bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-white/90 border border-white/10">
                  Page {activePageIndex + 1} of {selectedDoc.pages.length}
                </div>
                {selectedDoc.pages.length > 1 && (
                  <button
                    onClick={() =>
                      handleDeletePage(
                        selectedDoc.id,
                        selectedDoc.pages[activePageIndex].id
                      )
                    }
                    className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs text-red-400 hover:bg-red-500/20 border border-white/10 flex items-center gap-1"
                    title="Delete this page"
                  >
                    <Trash2 size={12} />
                    <span>Delete Page</span>
                  </button>
                )}
              </div>
            </div>

            {/* OCR Extracted Text Drawer / Sheet */}
            <AnimatePresence>
              {ocrResultText !== null && (
                <motion.div
                  initial={{ y: 260, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 260, opacity: 0 }}
                  className="bg-[#181818] border-t border-white/15 p-4 flex flex-col gap-2 max-h-[360px] shadow-2xl z-30"
                  style={{
                    paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-green-400" />
                      <span className="text-xs font-bold">Extracted Text (Page {activePageIndex + 1})</span>
                      <span className="text-[10px] text-white/40 bg-white/10 px-2 py-0.5 rounded-full">
                        {ocrResultText.trim().split(/\s+/).filter(Boolean).length} words
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopyOcrText}
                        className="flex items-center gap-1 bg-green-400 text-black px-2.5 py-1 rounded-lg text-xs font-bold hover:bg-green-300 transition"
                      >
                        <Copy size={12} />
                        <span>{copiedToast ? 'Copied!' : 'Copy'}</span>
                      </button>
                      <button
                        onClick={handleDownloadOcrText}
                        className="flex items-center gap-1 bg-white/10 text-white/80 hover:text-white px-2.5 py-1 rounded-lg text-xs transition"
                        title="Download as .txt"
                      >
                        <Download size={12} />
                        <span>TXT</span>
                      </button>
                      <button
                        onClick={() => setOcrResultText(null)}
                        className="w-7 h-7 rounded-lg bg-white/10 text-white/60 hover:text-white flex items-center justify-center"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Search inside OCR text */}
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-white/40" />
                    <input
                      type="text"
                      placeholder="Search text in page..."
                      value={ocrSearchQuery}
                      onChange={(e) => setOcrSearchQuery(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-green-400"
                    />
                  </div>

                  {/* Monospace Text Area */}
                  <div className="flex-1 overflow-y-auto max-h-48 bg-black/60 rounded-xl p-3 border border-white/10 text-xs font-mono whitespace-pre-wrap leading-relaxed select-text">
                    {ocrSearchQuery ? (
                      ocrResultText.split(new RegExp(`(${ocrSearchQuery})`, 'gi')).map((part, i) =>
                        part.toLowerCase() === ocrSearchQuery.toLowerCase() ? (
                          <mark key={i} className="bg-green-400 text-black rounded px-0.5">
                            {part}
                          </mark>
                        ) : (
                          part
                        )
                      )
                    ) : (
                      ocrResultText
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bottom Page Thumbnail Strip */}
            <div
              className="shrink-0 bg-[#161616] border-t border-white/10 flex items-center px-4 gap-3 overflow-x-auto"
              style={{
                height: 'calc(76px + env(safe-area-inset-bottom, 0px))',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              {selectedDoc.pages.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setActivePageIndex(idx);
                    setOcrResultText(null);
                  }}
                  className={`relative w-12 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition ${
                    activePageIndex === idx
                      ? 'border-green-400 scale-105 shadow-[0_0_10px_rgba(74,222,128,0.5)]'
                      : 'border-white/15 opacity-60 hover:opacity-90'
                  }`}
                >
                  <img
                    src={p.processedImage}
                    alt={`Thumb ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 right-1 text-[9px] font-bold text-white bg-black/60 px-1 rounded">
                    {idx + 1}
                  </span>
                </button>
              ))}

              {/* Add Page to Document Button */}
              <button
                onClick={() => {
                  setActiveTargetDocId(selectedDoc.id);
                  setSelectedDoc(null);
                  setCurrentView('camera');
                }}
                className="w-12 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-green-400/50 flex flex-col items-center justify-center text-white/40 hover:text-green-400 shrink-0 transition"
              >
                <Plus size={18} />
                <span className="text-[9px] mt-0.5 font-medium">Add</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
