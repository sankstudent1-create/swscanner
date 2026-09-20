# SWScanner · AI-Powered Document Scanner PWA

Next-generation document scanning progressive web application built with React 19, Vite, TypeScript, and OpenCV.js.

## Key Features

- **Continuous Multi-Page Scanning**: Scan multiple pages continuously without exiting the camera viewfinder.
- **Dual-Side ID Card Tool**: Standard ID-1 ISO frame capture with automatic Front + Back composite onto an official print-ready A4 document.
- **Multi-Pass AI Edge Detection**:
  - Pass 1: Canny edge detection with dynamic polygon approximation & convex hull 4-extremal quad bounding.
  - Pass 2: Otsu adaptive thresholding for document segmentation against desks.
  - Pass 3: Morphological gradient extraction for harsh shadows.
- **Precision Crop Editor**:
  - Aspect ratio presets: `Auto AI`, `A4 Doc`, `ID Card`, `1:1 Square`, and `Full`.
  - Magnetic edge snapping to frame borders.
  - 2.5× crosshair loupe for pixel-accurate corner placement.
- **Studio Document Filters (Web Worker Offloaded)**:
  - **Magic Color 2.0**: Dual-Engine Retinex (MSRCR) illumination flattening + soft-knee background bleaching to pure white + local ink stroke darkening + chromaticity boost for blue ink signatures and official red stamps.
  - **ID Card Filter**: Anti-glare contrast boost for laminated cards and holographic IDs.
  - **Sauvola B&W**: Adaptive local thresholding for crisp black-and-white documents.
  - **Warm Book**: Soft parchment balance for book scans.
- **Multi-Document Gallery & Merging**:
  - Multi-select mode with bulk PDF merge and bulk delete.
  - Multi-image drag-and-drop / file upload.
- **AI OCR Text Extraction**:
  - Optical Character Recognition on scanned pages.
  - In-document text search with highlighting.
  - One-tap text copying and `.txt` file export.
- **PDF Generation**: Local client-side A4 PDF compilation and sharing.

## Deployment on Vercel

1. Fork or import this repository into Vercel.
2. Build Settings:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Deploy!

## Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev

# Build for production
npm run build
```
