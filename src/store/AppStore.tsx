import React, { createContext, useContext, useState, useEffect } from 'react';
import { StorageService } from '../services/StorageService';
import type { ScannedDocument, ScannedPage } from '../services/StorageService';

interface AppState {
  documents: ScannedDocument[];
  currentView: 'camera' | 'crop' | 'filter' | 'gallery';
  currentImage: string | null; // Currently captured/uploaded image
  cvReady: boolean;

  // Batch scan session
  isBatchMode: boolean;
  batchPages: ScannedPage[];
  setIsBatchMode: (mode: boolean) => void;
  addPageToBatch: (page: ScannedPage) => void;
  clearBatch: () => void;
  saveCurrentBatchAsDocument: (title?: string, extraPage?: ScannedPage) => Promise<ScannedDocument | null>;

  // Append page to existing document
  activeTargetDocId: string | null;
  setActiveTargetDocId: (docId: string | null) => void;
  appendPageToDocument: (docId: string, page: ScannedPage) => Promise<void>;

  // ID Card dual-side session
  idCardFront: string | null;
  setIdCardFront: (val: string | null) => void;

  // Gemini Onboarding Splash
  showOnboarding: boolean;
  setShowOnboarding: (val: boolean) => void;

  // Actions
  setDocuments: React.Dispatch<React.SetStateAction<ScannedDocument[]>>;
  setCurrentView: React.Dispatch<React.SetStateAction<'camera' | 'crop' | 'filter' | 'gallery'>>;
  setCurrentImage: React.Dispatch<React.SetStateAction<string | null>>;
  addDocument: (doc: ScannedDocument) => Promise<void>;
  updateDocumentTitle: (id: string, newTitle: string) => Promise<void>;
  deleteDocumentPage: (docId: string, pageId: string) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  deleteMultipleDocuments: (docIds: string[]) => Promise<void>;
  mergeDocumentsIntoOne: (docIds: string[], customTitle?: string) => Promise<ScannedDocument | null>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [documents, setDocuments] = useState<ScannedDocument[]>([]);
  const [currentView, setCurrentView] = useState<'camera' | 'crop' | 'filter' | 'gallery'>('camera');
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [cvReady, setCvReady] = useState(false);

  // Batch scan mode state
  const [isBatchMode, setIsBatchMode] = useState<boolean>(false);
  const [batchPages, setBatchPages] = useState<ScannedPage[]>([]);
  const [activeTargetDocId, setActiveTargetDocId] = useState<string | null>(null);

  // ID Card dual-side capture state
  const [idCardFront, setIdCardFront] = useState<string | null>(null);

  // Gemini Onboarding
  const [showOnboarding, setShowOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem('swscanner_onboarding_seen');
  });

  useEffect(() => {
    StorageService.getAllDocuments().then(setDocuments);

    if (window.cvLoaded) {
      setCvReady(true);
    } else {
      const onCvLoad = () => setCvReady(true);
      document.addEventListener('cv-loaded', onCvLoad);
      return () => document.removeEventListener('cv-loaded', onCvLoad);
    }
  }, []);

  const addPageToBatch = (page: ScannedPage) => {
    setBatchPages((prev) => [...prev, page]);
  };

  const clearBatch = () => {
    setBatchPages([]);
  };

  const saveCurrentBatchAsDocument = async (customTitle?: string, extraPage?: ScannedPage): Promise<ScannedDocument | null> => {
    const allPages = extraPage ? [...batchPages, extraPage] : [...batchPages];
    if (allPages.length === 0) return null;

    const docId = Date.now().toString();
    const dateStr = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const newDoc: ScannedDocument = {
      id: docId,
      title: customTitle || `Scan ${dateStr} (${allPages.length} ${allPages.length === 1 ? 'page' : 'pages'})`,
      timestamp: Date.now(),
      pages: allPages,
      processedImage: allPages[0]?.processedImage,
      originalImage: allPages[0]?.originalImage,
      filter: allPages[0]?.filter,
    };

    await StorageService.saveDocument(newDoc);
    setDocuments((prev) => [newDoc, ...prev].sort((a, b) => b.timestamp - a.timestamp));
    setBatchPages([]);
    return newDoc;
  };

  const appendPageToDocument = async (docId: string, page: ScannedPage) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;
    const updatedPages = [...doc.pages, page];
    const updated: ScannedDocument = {
      ...doc,
      pages: updatedPages,
      processedImage: updatedPages[0]?.processedImage,
    };
    await StorageService.saveDocument(updated);
    setDocuments((prev) => prev.map((d) => (d.id === docId ? updated : d)));
    setActiveTargetDocId(null);
  };

  const addDocument = async (doc: ScannedDocument) => {
    StorageService.normalizeDoc(doc);
    await StorageService.saveDocument(doc);
    setDocuments((prev) => [doc, ...prev].sort((a, b) => b.timestamp - a.timestamp));
  };

  const updateDocumentTitle = async (id: string, newTitle: string) => {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    const updated = { ...doc, title: newTitle.trim() || doc.title };
    await StorageService.saveDocument(updated);
    setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
  };

  const deleteDocumentPage = async (docId: string, pageId: string) => {
    const doc = documents.find((d) => d.id === docId);
    if (!doc) return;

    const remainingPages = doc.pages.filter((p) => p.id !== pageId);
    if (remainingPages.length === 0) {
      await deleteDocument(docId);
      return;
    }

    const updated: ScannedDocument = {
      ...doc,
      pages: remainingPages,
      processedImage: remainingPages[0].processedImage,
      originalImage: remainingPages[0].originalImage,
      filter: remainingPages[0].filter,
    };

    await StorageService.saveDocument(updated);
    setDocuments((prev) => prev.map((d) => (d.id === docId ? updated : d)));
  };

  const deleteDocument = async (id: string) => {
    await StorageService.deleteDocument(id);
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const deleteMultipleDocuments = async (docIds: string[]) => {
    for (const id of docIds) {
      await StorageService.deleteDocument(id);
    }
    setDocuments((prev) => prev.filter((d) => !docIds.includes(d.id)));
  };

  const mergeDocumentsIntoOne = async (docIds: string[], customTitle?: string): Promise<ScannedDocument | null> => {
    const selected = documents.filter((d) => docIds.includes(d.id));
    if (selected.length === 0) return null;

    const allPages: ScannedPage[] = [];
    for (const doc of selected) {
      if (doc.pages && doc.pages.length > 0) {
        allPages.push(...doc.pages);
      } else if (doc.processedImage) {
        allPages.push({
          id: doc.id,
          processedImage: doc.processedImage,
          originalImage: doc.originalImage,
          filter: doc.filter,
          timestamp: doc.timestamp,
        });
      }
    }

    const docId = Date.now().toString();
    const dateStr = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    const mergedDoc: ScannedDocument = {
      id: docId,
      title: customTitle || `Merged Document ${dateStr} (${allPages.length} pages)`,
      timestamp: Date.now(),
      pages: allPages,
      processedImage: allPages[0]?.processedImage,
      originalImage: allPages[0]?.originalImage,
      filter: allPages[0]?.filter,
    };

    await StorageService.saveDocument(mergedDoc);
    setDocuments((prev) => [mergedDoc, ...prev].sort((a, b) => b.timestamp - a.timestamp));
    return mergedDoc;
  };

  return (
    <AppContext.Provider
      value={{
        documents,
        setDocuments,
        currentView,
        setCurrentView,
        currentImage,
        setCurrentImage,
        cvReady,
        isBatchMode,
        setIsBatchMode,
        batchPages,
        addPageToBatch,
        clearBatch,
        saveCurrentBatchAsDocument,
        activeTargetDocId,
        setActiveTargetDocId,
        appendPageToDocument,
        idCardFront,
        setIdCardFront,
        showOnboarding,
        setShowOnboarding,
        addDocument,
        updateDocumentTitle,
        deleteDocumentPage,
        deleteDocument,
        deleteMultipleDocuments,
        mergeDocumentsIntoOne,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppStore must be used within AppProvider');
  return context;
};
