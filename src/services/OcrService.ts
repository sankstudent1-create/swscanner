/**
 * Optical Character Recognition (OCR) Service
 * Dynamically loads Tesseract.js on demand for fast, offline-capable text extraction.
 */

declare global {
  interface Window {
    Tesseract?: any;
  }
}

export const OcrService = {
  async extractText(
    imageUrl: string,
    onProgress?: (status: string, progress: number) => void
  ): Promise<string> {
    // Dynamically load Tesseract.js script if not present
    if (!window.Tesseract) {
      onProgress?.('Loading OCR Engine...', 0.1);
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[src*="tesseract"]');
        if (existing) {
          existing.addEventListener('load', () => resolve());
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load OCR engine'));
        document.head.appendChild(script);
      });
    }

    onProgress?.('Initializing neural models...', 0.25);
    const { createWorker } = window.Tesseract;
    const worker = await createWorker('eng', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          onProgress?.('Recognizing document text...', 0.3 + (m.progress || 0) * 0.65);
        }
      },
    });

    onProgress?.('Analyzing characters & layout...', 0.5);
    const ret = await worker.recognize(imageUrl);
    await worker.terminate();
    onProgress?.('Done!', 1.0);

    return ret.data.text || '';
  },
};
