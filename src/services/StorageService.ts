import localforage from 'localforage';

export interface ScannedPage {
  id: string;
  processedImage: string; // Base64 or Data URL
  originalImage?: string;
  filter?: string;
  timestamp: number;
}

export interface ScannedDocument {
  id: string;
  title: string;
  timestamp: number;
  pages: ScannedPage[];
  // Backward compatibility fields
  originalImage?: string;
  processedImage?: string;
  filter?: string;
}

const docStore = localforage.createInstance({
  name: 'CamScannerPWA',
  storeName: 'documents'
});

export const StorageService = {
  async saveDocument(doc: ScannedDocument): Promise<void> {
    // Ensure backward compatible top-level fields
    if (doc.pages.length > 0) {
      doc.processedImage = doc.pages[0].processedImage;
      doc.originalImage = doc.pages[0].originalImage;
      doc.filter = doc.pages[0].filter;
    }
    await docStore.setItem(doc.id, doc);
  },

  async getDocument(id: string): Promise<ScannedDocument | null> {
    const doc = await docStore.getItem<ScannedDocument>(id);
    if (doc) {
      this.normalizeDoc(doc);
    }
    return doc;
  },

  async getAllDocuments(): Promise<ScannedDocument[]> {
    const docs: ScannedDocument[] = [];
    await docStore.iterate((value: ScannedDocument) => {
      this.normalizeDoc(value);
      docs.push(value);
    });
    // Sort by timestamp descending
    return docs.sort((a, b) => b.timestamp - a.timestamp);
  },

  async deleteDocument(id: string): Promise<void> {
    await docStore.removeItem(id);
  },

  async clearAll(): Promise<void> {
    await docStore.clear();
  },

  normalizeDoc(doc: ScannedDocument): void {
    if (!doc.pages || doc.pages.length === 0) {
      doc.pages = [
        {
          id: doc.id,
          processedImage: doc.processedImage || '',
          originalImage: doc.originalImage,
          filter: doc.filter,
          timestamp: doc.timestamp || Date.now(),
        },
      ];
    }
    if (!doc.title) {
      const d = new Date(doc.timestamp || Date.now());
      doc.title = `Scan ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    }
    if (!doc.processedImage && doc.pages.length > 0) {
      doc.processedImage = doc.pages[0].processedImage;
    }
  },
};
