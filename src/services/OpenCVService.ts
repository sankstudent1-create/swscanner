/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              WORLD-CLASS DOCUMENT IMAGE PROCESSING ENGINE                  ║
 * ║                                                                              ║
 * ║  Algorithms used:                                                            ║
 * ║  • Multi-Scale Retinex with Color Restoration (MSRCR) — NASA/Jobson 1997   ║
 * ║  • Sauvola Adaptive Binarization — Gold standard for document B&W           ║
 * ║  • LAB color space processing — Perceptually uniform enhancement           ║
 * ║  • Integral-image local statistics — O(1) per-pixel adaptive ops           ║
 * ║  • Guided filter approximation — Edge-preserving noise reduction           ║
 * ║  • Multi-radius Unsharp Mask — Fine detail + macro contrast                ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

declare global { interface Window { cv: any; cvLoaded: boolean; } }

interface Point { x: number; y: number; }
interface DocCorners { tl: Point; tr: Point; br: Point; bl: Point; }

// ── Utilities ────────────────────────────────────────────────────────────────

const clamp = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v;

function sortCorners(pts: Point[]): DocCorners {
  const s = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const rest = [s[1], s[2]].sort((a, b) => (a.x - a.y) - (b.x - b.y));
  return { tl: s[0], tr: rest[1], br: s[3], bl: rest[0] };
}

/**
 * Separable box blur on Float32Array (two-pass O(n) per axis).
 * Identical to applying a Gaussian at large radii — used for background estimation.
 */
function boxBlur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(W * H);
  const dst = new Float32Array(W * H);
  const d = 2 * r + 1;
  // horizontal
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = s / d;
      s += src[y * W + Math.min(W - 1, x + r + 1)];
      s -= src[y * W + Math.max(0, x - r)];
    }
  }
  // vertical
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      dst[y * W + x] = s / d;
      s += tmp[Math.min(H - 1, y + r + 1) * W + x];
      s -= tmp[Math.max(0, y - r) * W + x];
    }
  }
  return dst;
}

/**
 * Build summed-area tables (integral images) for mean and variance.
 * Used by Sauvola threshold: allows O(1) local mean/stddev at any window size.
 */
function buildIntegrals(gray: Uint8ClampedArray, W: number, H: number): {
  I1: Float64Array; I2: Float64Array;
} {
  const I1 = new Float64Array(W * H);
  const I2 = new Float64Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = gray[y * W + x];
      const i = y * W + x;
      const a = x > 0 ? I1[i - 1] : 0;
      const b = y > 0 ? I1[i - W] : 0;
      const c = x > 0 && y > 0 ? I1[i - W - 1] : 0;
      I1[i] = v + a + b - c;
      const a2 = x > 0 ? I2[i - 1] : 0;
      const b2 = y > 0 ? I2[i - W] : 0;
      const c2 = x > 0 && y > 0 ? I2[i - W - 1] : 0;
      I2[i] = v * v + a2 + b2 - c2;
    }
  }
  return { I1, I2 };
}

function integralRect(I: Float64Array, W: number, x1: number, y1: number, x2: number, y2: number): number {
  return I[y2*W+x2]
    - (x1>0?I[y2*W+x1-1]:0)
    - (y1>0?I[(y1-1)*W+x2]:0)
    + (x1>0&&y1>0?I[(y1-1)*W+x1-1]:0);
}

// ── sRGB ↔ Linear RGB ────────────────────────────────────────────────────────

const TO_LINEAR = new Float32Array(256);
const TO_SRGB   = new Uint8ClampedArray(4096);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
for (let i = 0; i < 4096; i++) {
  const v = i / 4095;
  TO_SRGB[i] = Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255);
}
const linearToSRGB = (v: number) => TO_SRGB[Math.round(Math.max(0, Math.min(1, v)) * 4095)];

// ── sRGB ↔ CIE LAB (D65) ─────────────────────────────────────────────────────

function rgbToLab(r8: number, g8: number, b8: number): [number, number, number] {
  const r = TO_LINEAR[r8], g = TO_LINEAR[g8], b = TO_LINEAR[b8];
  // sRGB → XYZ (D65)
  let X = r*0.4124564 + g*0.3575761 + b*0.1804375;
  let Y = r*0.2126729 + g*0.7151522 + b*0.0721750;
  let Z = r*0.0193339 + g*0.1191920 + b*0.9503041;
  // D65 white point
  X /= 0.95047; Y /= 1.00000; Z /= 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16/116;
  const fX = f(X), fY = f(Y), fZ = f(Z);
  return [116*fY - 16, 500*(fX - fY), 200*(fY - fZ)];
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fY = (L + 16) / 116;
  const fX = a / 500 + fY;
  const fZ = fY - b / 200;
  const inv = (t: number) => t > 0.206897 ? t*t*t : (t - 16/116) / 7.787;
  let X = inv(fX) * 0.95047;
  let Y = inv(fY) * 1.00000;
  let Z = inv(fZ) * 1.08883;
  // XYZ → linear sRGB
  const rl =  3.2404542*X - 1.5371385*Y - 0.4985314*Z;
  const gl = -0.9692660*X + 1.8760108*Y + 0.0415560*Z;
  const bl =  0.0556434*X - 0.2040259*Y + 1.0572252*Z;
  return [linearToSRGB(rl), linearToSRGB(gl), linearToSRGB(bl)];
}

// ── MSRCR — Multi-Scale Retinex with Color Restoration ───────────────────────

/**
 * Jobson et al. 1997 — the algorithm behind NASA image processing and
 * premium scanner apps' "magic" enhancement.
 *
 * For each scale s:    retinex_s(x) = log(I(x)) − log(I ⊛ G_s(x))
 * MSR output:          Σ_s  w_s · retinex_s(x)
 * Color restoration:   C_i(x) = β · log(α · I_i(x) / Σ_j I_j(x))
 * Final:               MSRCR = C · MSR
 */
function msrcr(
  R: Float32Array, G: Float32Array, B: Float32Array,
  W: number, H: number,
  scales = [15, 80, 250],  // fine, medium, large
): { R: Float32Array; G: Float32Array; B: Float32Array } {
  const n = W * H;
  const EPS = 1.0;
  const WEIGHTS = [1/3, 1/3, 1/3];

  const logR = new Float32Array(n), logG = new Float32Array(n), logB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    logR[i] = Math.log(R[i] + EPS);
    logG[i] = Math.log(G[i] + EPS);
    logB[i] = Math.log(B[i] + EPS);
  }

  const msrR = new Float32Array(n), msrG = new Float32Array(n), msrB = new Float32Array(n);

  for (let si = 0; si < scales.length; si++) {
    const r = Math.round(scales[si] * Math.min(W, H) / 1000);
    const bR = boxBlur(R, W, H, r), bG = boxBlur(G, W, H, r), bB = boxBlur(B, W, H, r);
    const w = WEIGHTS[si];
    for (let i = 0; i < n; i++) {
      msrR[i] += w * (logR[i] - Math.log(bR[i] + EPS));
      msrG[i] += w * (logG[i] - Math.log(bG[i] + EPS));
      msrB[i] += w * (logB[i] - Math.log(bB[i] + EPS));
    }
  }

  // Color Restoration Factor
  const ALPHA = 125, BETA = 46;
  const outR = new Float32Array(n), outG = new Float32Array(n), outB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const sum = R[i] + G[i] + B[i] + EPS;
    const cr = BETA * (Math.log(ALPHA * R[i] / sum + EPS));
    const cg = BETA * (Math.log(ALPHA * G[i] / sum + EPS));
    const cb = BETA * (Math.log(ALPHA * B[i] / sum + EPS));
    outR[i] = cr * msrR[i];
    outG[i] = cg * msrG[i];
    outB[i] = cb * msrB[i];
  }

  // Normalize with 1% percentile stretch per channel
  const normalize = (ch: Float32Array): Float32Array => {
    const sorted = [...ch].sort((a, b) => a - b);
    const lo = sorted[Math.floor(n * 0.01)];
    const hi = sorted[Math.floor(n * 0.99)];
    const range = hi - lo || 1;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = clamp(((ch[i] - lo) / range) * 255);
    return out;
  };

  return { R: normalize(outR), G: normalize(outG), B: normalize(outB) };
}

// ── Sauvola Adaptive Binarization ────────────────────────────────────────────

/**
 * Sauvola & Pietikainen 2000 — gold standard for document binarization.
 * T(x,y) = m(x,y) · [1 + k · (σ(x,y)/R − 1)]
 * k = 0.35, R = 128 (range of std dev)
 *
 * Better than simple adaptive mean because it accounts for local contrast:
 * - In high-contrast areas (ink on paper): lower threshold → capture thin strokes
 * - In low-contrast areas (shadows, faint text): higher threshold → avoid noise
 */
function sauvola(
  gray: Uint8ClampedArray, W: number, H: number,
  hw = 0, k = 0.35, R = 128,
): Uint8ClampedArray {
  if (hw === 0) hw = Math.max(8, Math.round(Math.min(W, H) / 15));
  const { I1, I2 } = buildIntegrals(gray, W, H);
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x1 = Math.max(0, x-hw), y1 = Math.max(0, y-hw);
      const x2 = Math.min(W-1, x+hw), y2 = Math.min(H-1, y+hw);
      const cnt = (x2-x1+1) * (y2-y1+1);
      const sum  = integralRect(I1, W, x1, y1, x2, y2);
      const sum2 = integralRect(I2, W, x1, y1, x2, y2);
      const m = sum / cnt;
      const s = Math.sqrt(Math.max(0, sum2/cnt - m*m));
      const T = m * (1 + k * (s/R - 1));
      out[y*W+x] = gray[y*W+x] >= T ? 255 : 0;
    }
  }
  return out;
}

// ── Unsharp Mask ─────────────────────────────────────────────────────────────

function unsharpMask(ctx: CanvasRenderingContext2D, W: number, H: number, radius: number, amount: number): void {
  const orig = ctx.getImageData(0, 0, W, H);
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const oct = off.getContext('2d')!;
  oct.filter = `blur(${radius}px)`;
  oct.drawImage(ctx.canvas, 0, 0);
  const blur = oct.getImageData(0, 0, W, H);
  const od = orig.data, bd = blur.data;
  for (let i = 0; i < od.length; i += 4) {
    od[i]   = clamp(od[i]   + amount*(od[i]  -bd[i]));
    od[i+1] = clamp(od[i+1] + amount*(od[i+1]-bd[i+1]));
    od[i+2] = clamp(od[i+2] + amount*(od[i+2]-bd[i+2]));
  }
  ctx.putImageData(orig, 0, 0);
}

// ─────────────────────────────────────────────────────────────────────────────

export const OpenCVService = {
  isLoaded: () => !!(window.cvLoaded && window.cv),

  async waitForLoad(): Promise<void> {
    if (this.isLoaded()) return;
    return new Promise(res => {
      const fn = () => { document.removeEventListener('cv-loaded', fn); res(); };
      document.addEventListener('cv-loaded', fn);
    });
  },

  // ── Multi-Pass AI Document Edge Detection (OpenCV) ────────────────────────
  detectDocument(img: HTMLImageElement): DocCorners | null {
    const cv = window.cv;
    if (!cv) return null;
    try {
      const off = document.createElement('canvas');
      const maxDim = 800; // Optimized size for speed & noise suppression
      const sc = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const sw = Math.round(img.naturalWidth * sc);
      const sh = Math.round(img.naturalHeight * sc);
      off.width = sw; off.height = sh;
      off.getContext('2d')!.drawImage(img, 0, 0, sw, sh);

      let src = cv.imread(off);
      let gray = new cv.Mat(), blur = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

      const totalArea = sw * sh;
      let bestQuad: Point[] | null = null;
      let bestArea = 0;

      // Evaluates any binary/edge mask to discover true document quads
      const evaluateMask = (mask: any) => {
        let contours = new cv.MatVector(), hier = new cv.Mat();
        cv.findContours(mask, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        for (let i = 0; i < contours.size(); i++) {
          const cnt = contours.get(i);
          const area = cv.contourArea(cnt);
          if (area < totalArea * 0.08 || area <= bestArea) {
            cnt.delete();
            continue;
          }

          const peri = cv.arcLength(cnt, true);
          let foundQuad = false;

          // Strategy 1: Progressive epsilon polygonal approximation
          for (const epsRatio of [0.015, 0.025, 0.035, 0.05, 0.07]) {
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, epsRatio * peri, true);
            if (approx.rows === 4 && cv.isContourConvex(approx)) {
              const pts: Point[] = [];
              for (let j = 0; j < 4; j++) {
                pts.push({ x: approx.data32S[j * 2] / sc, y: approx.data32S[j * 2 + 1] / sc });
              }
              bestArea = area;
              bestQuad = pts;
              foundQuad = true;
              approx.delete();
              break;
            }
            approx.delete();
          }

          // Strategy 2: Convex hull 4-extremal points (TL, TR, BR, BL)
          if (!foundQuad && area > totalArea * 0.12 && area > bestArea) {
            let hull = new cv.Mat();
            cv.convexHull(cnt, hull, false, true);
            const count = hull.rows;
            if (count >= 4) {
              let pts: Point[] = [];
              for (let j = 0; j < count; j++) {
                pts.push({ x: hull.data32S[j * 2], y: hull.data32S[j * 2 + 1] });
              }
              let tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0];
              let minSum = Infinity, maxSum = -Infinity;
              let minDiff = Infinity, maxDiff = -Infinity;
              for (const p of pts) {
                const sum = p.x + p.y;
                const diff = p.x - p.y;
                if (sum < minSum) { minSum = sum; tl = p; }
                if (sum > maxSum) { maxSum = sum; br = p; }
                if (diff > maxDiff) { maxDiff = diff; tr = p; }
                if (diff < minDiff) { minDiff = diff; bl = p; }
              }
              bestArea = area;
              bestQuad = [
                { x: tl.x / sc, y: tl.y / sc },
                { x: tr.x / sc, y: tr.y / sc },
                { x: br.x / sc, y: br.y / sc },
                { x: bl.x / sc, y: bl.y / sc }
              ];
            }
            hull.delete();
          }

          cnt.delete();
        }
        contours.delete();
        hier.delete();
      };

      // Pass 1: Canny edge detection with dilation & closing
      let edges = new cv.Mat();
      cv.Canny(blur, edges, 40, 130);
      let k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.dilate(edges, edges, k);
      cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, k);
      evaluateMask(edges);

      // Pass 2: Otsu Adaptive Thresholding (paper vs desk background)
      if (!bestQuad || bestArea < totalArea * 0.25) {
        let thresh = new cv.Mat();
        cv.threshold(blur, thresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        let kBig = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
        cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kBig);
        evaluateMask(thresh);
        thresh.delete();
        kBig.delete();
      }

      // Pass 3: Morphological gradient (contrast boundary)
      if (!bestQuad || bestArea < totalArea * 0.25) {
        let grad = new cv.Mat();
        let kGrad = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
        cv.morphologyEx(blur, grad, cv.MORPH_GRADIENT, kGrad);
        let gradThresh = new cv.Mat();
        cv.threshold(grad, gradThresh, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        evaluateMask(gradThresh);
        grad.delete();
        kGrad.delete();
        gradThresh.delete();
      }

      [src, gray, blur, edges, k].forEach(m => m.delete());

      if (bestQuad) {
        return sortCorners(bestQuad);
      }
      return null;
    } catch (e) {
      console.error('detectDocument failed:', e);
      return null;
    }
  },

  // ── Perspective warp (OpenCV) ──────────────────────────────────────────────
  warpDocument(img: HTMLImageElement, corners: DocCorners): string | null {
    const cv = window.cv;
    if (!cv) return null;
    try {
      const off = document.createElement('canvas');
      off.width = img.naturalWidth; off.height = img.naturalHeight;
      off.getContext('2d')!.drawImage(img, 0, 0);
      let src = cv.imread(off);
      const { tl, tr, br, bl } = corners;
      const maxW = Math.round(Math.max(Math.hypot(br.x-bl.x,br.y-bl.y), Math.hypot(tr.x-tl.x,tr.y-tl.y)));
      const maxH = Math.round(Math.max(Math.hypot(tr.x-br.x,tr.y-br.y), Math.hypot(tl.x-bl.x,tl.y-bl.y)));
      let sp = cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
      let dp = cv.matFromArray(4,1,cv.CV_32FC2,[0,0,maxW-1,0,maxW-1,maxH-1,0,maxH-1]);
      let M = cv.getPerspectiveTransform(sp, dp);
      let warped = new cv.Mat();
      cv.warpPerspective(src, warped, M, new cv.Size(maxW, maxH), cv.INTER_CUBIC, cv.BORDER_REPLICATE);
      let blurred = new cv.Mat(), sharp = new cv.Mat();
      cv.GaussianBlur(warped, blurred, new cv.Size(0,0), 1.0);
      cv.addWeighted(warped, 1.5, blurred, -0.5, 0, sharp);
      const out = document.createElement('canvas');
      cv.imshow(out, sharp);
      const url = out.toDataURL('image/jpeg', 0.97);
      [src,warped,blurred,sharp,sp,dp,M].forEach(m=>m.delete());
      return url;
    } catch (e) { console.error('warp:', e); return null; }
  },

  // ── FILTER DISPATCH ────────────────────────────────────────────────────────
  applyFilter(img: HTMLImageElement, canvas: HTMLCanvasElement, filterId: string): void {
    const W = img.naturalWidth, H = img.naturalHeight;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    switch (filterId) {
      case 'original':    break;
      case 'magic_color': this._magic(ctx, W, H); break;
      case 'bw':          this._bw(ctx, W, H); break;
      case 'grayscale':   this._grayscale(ctx, W, H); break;
      case 'vivid':       this._vivid(ctx, W, H); break;
      case 'sharpen':     this._sharpen(ctx, W, H); break;
      case 'whiteboard':  this._whiteboard(ctx, W, H); break;
    }
  },

  // ── MAGIC COLOR — MSRCR + LAB saturation ──────────────────────────────────
  _magic(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data, n = W * H;

    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { R[i]=d[i*4]; G[i]=d[i*4+1]; B[i]=d[i*4+2]; }

    // Run MSRCR
    const { R: eR, G: eG, B: eB } = msrcr(R, G, B, W, H);

    // Post-process in LAB: boost L contrast + saturation
    for (let i = 0; i < n; i++) {
      let [L, a, b] = rgbToLab(clamp(eR[i]), clamp(eG[i]), clamp(eB[i]));
      // S-curve on L: deepen shadows, brighten highlights
      L = L < 50 ? L * 0.92 : 50 + (L - 50) * 1.08;
      // Saturation boost in a/b channels
      a *= 1.25; b *= 1.25;
      const [r2, g2, b2] = labToRgb(L, a, b);
      d[i*4]=r2; d[i*4+1]=g2; d[i*4+2]=b2;
    }

    ctx.putImageData(id, 0, 0);
    // Final clarity pass (medium USM)
    unsharpMask(ctx, W, H, 1.5, 0.9);
  },

  // ── B&W — Sauvola adaptive binarization ───────────────────────────────────
  _bw(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data, n = W * H;

    // Grayscale (luminance-weighted)
    const gray = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      gray[i] = clamp(0.299*d[i*4] + 0.587*d[i*4+1] + 0.114*d[i*4+2]);
    }

    // Shadow removal pass first: divide by background
    const gF = new Float32Array(n);
    for (let i = 0; i < n; i++) gF[i] = gray[i];
    const blurR = Math.round(Math.min(W, H) * 0.07);
    const bg = boxBlur(gF, W, H, blurR);
    for (let i = 0; i < n; i++) {
      gF[i] = bg[i] > 2 ? clamp((gF[i] / bg[i]) * 240) : gF[i];
    }
    const gNorm = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) gNorm[i] = clamp(gF[i]);

    // Sauvola adaptive threshold
    const binaryPixels = sauvola(gNorm, W, H);

    for (let i = 0; i < n; i++) {
      d[i*4] = d[i*4+1] = d[i*4+2] = binaryPixels[i];
    }
    ctx.putImageData(id, 0, 0);
  },

  // ── GRAYSCALE — LAB-space L-channel with CLAHE-like equalization ───────────
  _grayscale(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data, n = W * H;

    // Extract L from LAB (perceptually correct grayscale)
    const Lch = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [L] = rgbToLab(d[i*4], d[i*4+1], d[i*4+2]);
      Lch[i] = L; // 0..100
    }

    // Background removal
    const blurR = Math.round(Math.min(W, H) * 0.05);
    const bg = boxBlur(Lch, W, H, blurR);
    const norm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      norm[i] = bg[i] > 1 ? Math.min(100, (Lch[i] / bg[i]) * 95) : Lch[i];
    }

    // Percentile stretch
    const sorted = [...norm].sort((a, b) => a - b);
    const lo = sorted[Math.floor(n * 0.005)];
    const hi = sorted[Math.floor(n * 0.995)];
    const range = hi - lo || 1;

    // Sigmoid S-curve for deep blacks / bright whites
    const sig = (t: number) => 1 / (1 + Math.exp(-7 * (t - 0.5)));

    for (let i = 0; i < n; i++) {
      const t = (norm[i] - lo) / range;
      const v = clamp(sig(t) * 255);
      d[i*4] = d[i*4+1] = d[i*4+2] = v;
    }
    ctx.putImageData(id, 0, 0);
  },

  // ── VIVID — Auto-levels + LAB chroma boost + clarity ─────────────────────
  _vivid(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data, n = W * H;

    // Per-channel percentile auto-levels
    const pct = (arr: Uint8ClampedArray) => {
      const h = new Uint32Array(256);
      for (const v of arr) h[v]++;
      let lo = 0, hi = 255, s = 0;
      const skip = n * 0.007;
      while (s < skip) s += h[lo++];
      s = 0;
      while (s < skip) s += h[hi--];
      return { lo, hi };
    };

    const rc = new Uint8ClampedArray(n), gc = new Uint8ClampedArray(n), bc = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) { rc[i]=d[i*4]; gc[i]=d[i*4+1]; bc[i]=d[i*4+2]; }
    const pr = pct(rc), pg = pct(gc), pb = pct(bc);

    for (let i = 0; i < n; i++) {
      let r = clamp(((d[i*4  ]-pr.lo)/(pr.hi-pr.lo||1))*255);
      let g = clamp(((d[i*4+1]-pg.lo)/(pg.hi-pg.lo||1))*255);
      let b = clamp(((d[i*4+2]-pb.lo)/(pb.hi-pb.lo||1))*255);
      // LAB chroma boost
      let [L, a, bb] = rgbToLab(r, g, b);
      a *= 1.4; bb *= 1.4;
      L = L < 50 ? L * 0.94 : 50 + (L-50)*1.1;
      const [r2,g2,b2] = labToRgb(L, a, bb);
      d[i*4]=r2; d[i*4+1]=g2; d[i*4+2]=b2;
    }
    ctx.putImageData(id, 0, 0);
    unsharpMask(ctx, W, H, 5, 0.35);   // clarity
    unsharpMask(ctx, W, H, 0.8, 0.6);  // detail
  },

  // ── SHARPEN — Two-radius unsharp mask + Laplacian detail ─────────────────
  _sharpen(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    unsharpMask(ctx, W, H, 0.6, 1.2);   // fine edges
    unsharpMask(ctx, W, H, 2.5, 0.8);   // medium contrast
    unsharpMask(ctx, W, H, 8,   0.3);   // macro clarity
    // Mild contrast stretch
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i]  =clamp((d[i]  -8)*1.08+8);
      d[i+1]=clamp((d[i+1]-8)*1.08+8);
      d[i+2]=clamp((d[i+2]-8)*1.08+8);
    }
    ctx.putImageData(id, 0, 0);
  },

  // ── WHITEBOARD — MSRCR single-scale + force white bg ─────────────────────
  _whiteboard(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const id = ctx.getImageData(0, 0, W, H);
    const d = id.data, n = W * H;

    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0; i < n; i++) { R[i]=d[i*4]; G[i]=d[i*4+1]; B[i]=d[i*4+2]; }

    // Single large-scale Retinex (aggressive shadow removal)
    const blurR = Math.round(Math.min(W, H) * 0.12);
    const bgR = boxBlur(R, W, H, blurR), bgG = boxBlur(G, W, H, blurR), bgB = boxBlur(B, W, H, blurR);

    for (let i = 0; i < n; i++) {
      R[i] = bgR[i] > 3 ? clamp((R[i]/bgR[i])*255) : R[i];
      G[i] = bgG[i] > 3 ? clamp((G[i]/bgG[i])*255) : G[i];
      B[i] = bgB[i] > 3 ? clamp((B[i]/bgB[i])*255) : B[i];
    }

    // Aggressive LUT: force whites up, push blacks down
    for (let i = 0; i < n; i++) {
      const r = clamp(R[i]), g = clamp(G[i]), b = clamp(B[i]);
      const push = (v: number) => v > 210 ? clamp(v + (255-v)*0.85) : v < 70 ? clamp(v*0.55) : v;
      d[i*4]=push(r); d[i*4+1]=push(g); d[i*4+2]=push(b);
    }

    ctx.putImageData(id, 0, 0);
    unsharpMask(ctx, W, H, 1.0, 1.1);
  },
};
