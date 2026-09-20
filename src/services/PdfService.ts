// @ts-ignore
import jsPDF from 'jspdf';
import type { ScannedDocument, ScannedPage } from './StorageService';

export const PdfService = {
  /**
   * Generates a high-quality A4 PDF from an array of ScannedPages or ScannedDocuments.
   */
  async generatePdf(pagesOrDocs: ScannedPage[] | ScannedDocument[]): Promise<Blob> {
    if (!pagesOrDocs || pagesOrDocs.length === 0) {
      throw new Error("No pages to generate PDF");
    }

    // Flatten to a list of page data
    const pages: { processedImage: string }[] = [];
    for (const item of pagesOrDocs) {
      if ('pages' in item && Array.isArray((item as ScannedDocument).pages)) {
        for (const p of (item as ScannedDocument).pages) {
          if (p.processedImage) pages.push(p);
        }
      } else if ('processedImage' in item && (item as ScannedPage).processedImage) {
        pages.push(item as ScannedPage);
      }
    }

    if (pages.length === 0) {
      throw new Error("No valid image pages found");
    }

    // A4 dimensions in mm: 210 x 297
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8; // 8mm margin for professional clean scan look
    const printableWidth = pageWidth - margin * 2;
    const printableHeight = pageHeight - margin * 2;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (i > 0) {
        pdf.addPage();
      }

      try {
        const imgProps = pdf.getImageProperties(page.processedImage);
        const imgRatio = imgProps.width / imgProps.height;
        const pageRatio = printableWidth / printableHeight;

        let renderWidth: number;
        let renderHeight: number;

        if (imgRatio > pageRatio) {
          // Width-constrained
          renderWidth = printableWidth;
          renderHeight = printableWidth / imgRatio;
        } else {
          // Height-constrained
          renderHeight = printableHeight;
          renderWidth = printableHeight * imgRatio;
        }

        // Center on A4 page
        const x = margin + (printableWidth - renderWidth) / 2;
        const y = margin + (printableHeight - renderHeight) / 2;

        pdf.addImage(
          page.processedImage,
          'JPEG',
          x,
          y,
          renderWidth,
          renderHeight,
          undefined,
          'FAST'
        );
      } catch (err) {
        console.warn(`Could not add page ${i} to PDF`, err);
        // Fallback simple stretch
        pdf.addImage(page.processedImage, 'JPEG', margin, margin, printableWidth, printableHeight);
      }
    }

    return pdf.output('blob');
  },

  downloadPdf(blob: Blob, filename: string = 'Scan_Document.pdf') {
    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Shares PDF via Web Share API if supported, or falls back to direct download.
   */
  async sharePdf(blob: Blob, filename: string = 'Scan_Document.pdf'): Promise<boolean> {
    const safeFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    const file = new File([blob], safeFilename, { type: 'application/pdf' });

    if (
      typeof navigator !== 'undefined' &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: safeFilename.replace('.pdf', ''),
          text: 'Scanned with CamScanner PWA',
        });
        return true;
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.warn('Share failed, downloading instead', e);
          this.downloadPdf(blob, safeFilename);
        }
        return false;
      }
    } else {
      this.downloadPdf(blob, safeFilename);
      return false;
    }
  },
};
