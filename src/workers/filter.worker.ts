/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║          DEDICATED WEB WORKER — HIGH PERFORMANCE IMAGE PROCESSING           ║
 * ║                                                                              ║
 * ║  Executes MSRCR, Sauvola binarization, CIE LAB enhancement, and unsharp      ║
 * ║  masks off the main UI thread. Keeps the UI at silky 60 FPS even on 12MP+    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

export interface WorkerFilterRequest {
  id: string;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  filterId: string;
  adjustments?: {
    brightness: number; // -50 to +50
    contrast: number;   // -50 to +50
    warmth: number;     // -50 to +50
    sharpness: number;  // 0 to 100
  };
}

export interface WorkerFilterResponse {
  id: string;
  success: boolean;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  error?: string;
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

// ── Box blur (separable O(n)) ────────────────────────────────────────────────
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

// ── Integral image calculations for Sauvola ──────────────────────────────────
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
  return (
    I[y2 * W + x2] -
    (x1 > 0 ? I[y2 * W + x1 - 1] : 0) -
    (y1 > 0 ? I[(y1 - 1) * W + x2] : 0) +
    (x1 > 0 && y1 > 0 ? I[(y1 - 1) * W + x1 - 1] : 0)
  );
}

// ── sRGB ↔ Linear RGB ────────────────────────────────────────────────────────
const TO_LINEAR = new Float32Array(256);
const TO_SRGB = new Uint8ClampedArray(4096);
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
  let X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let Y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let Z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  X /= 0.95047;
  Y /= 1.0;
  Z /= 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fX = f(X), fY = f(Y), fZ = f(Z);
  return [116 * fY - 16, 500 * (fX - fY), 200 * (fY - fZ)];
}

function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fY = (L + 16) / 116;
  const fX = a / 500 + fY;
  const fZ = fY - b / 200;
  const inv = (t: number) => (t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = inv(fX) * 0.95047;
  const Y = inv(fY) * 1.0;
  const Z = inv(fZ) * 1.08883;
  const rl = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const gl = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  const bl = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [linearToSRGB(rl), linearToSRGB(gl), linearToSRGB(bl)];
}

// ── Multi-Scale Retinex with Color Restoration (MSRCR) ───────────────────────
function msrcr(
  R: Float32Array, G: Float32Array, B: Float32Array,
  W: number, H: number,
  scales = [15, 80, 250]
): { R: Float32Array; G: Float32Array; B: Float32Array } {
  const n = W * H;
  const EPS = 1.0;
  const WEIGHTS = [1 / 3, 1 / 3, 1 / 3];

  const logR = new Float32Array(n), logG = new Float32Array(n), logB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    logR[i] = Math.log(R[i] + EPS);
    logG[i] = Math.log(G[i] + EPS);
    logB[i] = Math.log(B[i] + EPS);
  }

  const msrR = new Float32Array(n), msrG = new Float32Array(n), msrB = new Float32Array(n);

  for (let si = 0; si < scales.length; si++) {
    const r = Math.max(1, Math.round((scales[si] * Math.min(W, H)) / 1000));
    const bR = boxBlur(R, W, H, r), bG = boxBlur(G, W, H, r), bB = boxBlur(B, W, H, r);
    const w = WEIGHTS[si];
    for (let i = 0; i < n; i++) {
      msrR[i] += w * (logR[i] - Math.log(bR[i] + EPS));
      msrG[i] += w * (logG[i] - Math.log(bG[i] + EPS));
      msrB[i] += w * (logB[i] - Math.log(bB[i] + EPS));
    }
  }

  const ALPHA = 125, BETA = 46;
  const outR = new Float32Array(n), outG = new Float32Array(n), outB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const sum = R[i] + G[i] + B[i] + EPS;
    const cr = BETA * Math.log((ALPHA * R[i]) / sum + EPS);
    const cg = BETA * Math.log((ALPHA * G[i]) / sum + EPS);
    const cb = BETA * Math.log((ALPHA * B[i]) / sum + EPS);
    outR[i] = cr * msrR[i];
    outG[i] = cg * msrG[i];
    outB[i] = cb * msrB[i];
  }

  const normalize = (ch: Float32Array): Float32Array => {
    // Estimate percentiles without sorting entire large array for max speed
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < n; i++) {
      if (ch[i] < minV) minV = ch[i];
      if (ch[i] > maxV) maxV = ch[i];
    }
    const bins = 1000;
    const hist = new Uint32Array(bins);
    const range = (maxV - minV) || 1;
    for (let i = 0; i < n; i++) {
      const b = Math.min(bins - 1, Math.max(0, Math.floor(((ch[i] - minV) / range) * (bins - 1))));
      hist[b]++;
    }
    let s = 0;
    let loBin = 0, hiBin = bins - 1;
    const skip = n * 0.01;
    while (s < skip && loBin < bins - 1) s += hist[loBin++];
    s = 0;
    while (s < skip && hiBin > 0) s += hist[hiBin--];
    const lo = minV + (loBin / bins) * range;
    const hi = minV + (hiBin / bins) * range;
    const normRange = (hi - lo) || 1;

    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = clamp(((ch[i] - lo) / normRange) * 255);
    }
    return out;
  };

  return { R: normalize(outR), G: normalize(outG), B: normalize(outB) };
}

// ── Sauvola Adaptive Binarization ────────────────────────────────────────────
function sauvola(
  gray: Uint8ClampedArray, W: number, H: number,
  hw = 0, k = 0.35, R = 128
): Uint8ClampedArray {
  if (hw === 0) hw = Math.max(8, Math.round(Math.min(W, H) / 15));
  const { I1, I2 } = buildIntegrals(gray, W, H);
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x1 = Math.max(0, x - hw), y1 = Math.max(0, y - hw);
      const x2 = Math.min(W - 1, x + hw), y2 = Math.min(H - 1, y + hw);
      const cnt = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integralRect(I1, W, x1, y1, x2, y2);
      const sum2 = integralRect(I2, W, x1, y1, x2, y2);
      const m = sum / cnt;
      const s = Math.sqrt(Math.max(0, sum2 / cnt - m * m));
      const T = m * (1 + k * (s / R - 1));
      out[y * W + x] = gray[y * W + x] >= T ? 255 : 0;
    }
  }
  return out;
}

// ── Fast pure array unsharp mask ─────────────────────────────────────────────
function unsharpMaskBuffer(data: Uint8ClampedArray, W: number, H: number, r: number, amount: number) {
  const n = W * H;
  const chR = new Float32Array(n);
  const chG = new Float32Array(n);
  const chB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    chR[i] = data[i * 4];
    chG[i] = data[i * 4 + 1];
    chB[i] = data[i * 4 + 2];
  }
  const bR = boxBlur(chR, W, H, Math.max(1, Math.round(r)));
  const bG = boxBlur(chG, W, H, Math.max(1, Math.round(r)));
  const bB = boxBlur(chB, W, H, Math.max(1, Math.round(r)));
  for (let i = 0; i < n; i++) {
    data[i * 4]     = clamp(chR[i] + amount * (chR[i] - bR[i]));
    data[i * 4 + 1] = clamp(chG[i] + amount * (chG[i] - bG[i]));
    data[i * 4 + 2] = clamp(chB[i] + amount * (chB[i] - bB[i]));
  }
}

// ── Manual adjustments pass (Brightness, Contrast, Warmth, Sharpness) ───────
function applyAdjustments(
  data: Uint8ClampedArray, W: number, H: number,
  adjustments: NonNullable<WorkerFilterRequest['adjustments']>
) {
  const { brightness, contrast, warmth, sharpness } = adjustments;
  const n = W * H;

  // Pre-calculate contrast factor
  // contrast: -50..+50 -> factor 0.5 .. 1.8
  const factor = (259 * (contrast * 1.6 + 255)) / (255 * (259 - contrast * 1.6));
  const bOffset = brightness * 1.3; // -65..+65
  const wR = warmth > 0 ? warmth * 0.4 : 0;
  const wB = warmth < 0 ? -warmth * 0.4 : 0;

  for (let i = 0; i < n; i++) {
    let r = data[i * 4];
    let g = data[i * 4 + 1];
    let b = data[i * 4 + 2];

    // Brightness + contrast
    if (brightness !== 0 || contrast !== 0) {
      r = clamp(factor * (r - 128) + 128 + bOffset);
      g = clamp(factor * (g - 128) + 128 + bOffset);
      b = clamp(factor * (b - 128) + 128 + bOffset);
    }

    // Warmth
    if (warmth !== 0) {
      r = clamp(r + wR);
      b = clamp(b - wR + wB);
    }

    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
  }

  // Sharpness
  if (sharpness > 0) {
    const amount = (sharpness / 100) * 1.2;
    unsharpMaskBuffer(data, W, H, 1, amount);
  }
}

// ── Filter Execution Pipeline ────────────────────────────────────────────────
function processImageBuffer(
  buffer: ArrayBuffer, W: number, H: number, filterId: string,
  adjustments?: WorkerFilterRequest['adjustments']
): ArrayBuffer {
  const d = new Uint8ClampedArray(buffer);
  const n = W * H;

  switch (filterId) {
    case 'original': {
      break;
    }

    case 'magic_color': {
      // 🌟 MAGIC COLOR 2.0 — Dual-Engine (MSRCR + Surface Bleaching + Ink Punch)
      const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        R[i] = d[i * 4];
        G[i] = d[i * 4 + 1];
        B[i] = d[i * 4 + 2];
      }

      // Step 1: Run MSRCR for shadow & ambient light equalization
      const { R: eR, G: eG, B: eB } = msrcr(R, G, B, W, H);

      // Step 2: Illumination surface model for paper bleaching
      const blurR = Math.max(6, Math.round(Math.min(W, H) * 0.08));
      const bgR = boxBlur(eR, W, H, blurR);
      const bgG = boxBlur(eG, W, H, blurR);
      const bgB = boxBlur(eB, W, H, blurR);

      for (let i = 0; i < n; i++) {
        // Illumination division (flattens creases, page curvature & lighting gradients)
        let rNorm = bgR[i] > 3 ? (eR[i] / bgR[i]) * 242 : eR[i];
        let gNorm = bgG[i] > 3 ? (eG[i] / bgG[i]) * 242 : eG[i];
        let bNorm = bgB[i] > 3 ? (eB[i] / bgB[i]) * 242 : eB[i];

        const lum = 0.299 * rNorm + 0.587 * gNorm + 0.114 * bNorm;

        // Paper Bleaching transfer function (soft knee)
        let scale = 1.0;
        if (lum > 185) {
          // Paper background: push to crisp pure white
          const t = Math.min(1, (lum - 185) / 55);
          scale = 1.0 + t * 0.35;
        } else if (lum < 155) {
          // Ink, stamps, text: deepen for maximum readability
          scale = 0.85;
        }

        let rOut = clamp(rNorm * scale);
        let gOut = clamp(gNorm * scale);
        let bOut = clamp(bNorm * scale);

        // Chromaticity boost for stamps & colored signatures
        const chroma = Math.max(Math.abs(rOut - gOut), Math.abs(bOut - gOut));
        if (chroma > 12) {
          let [L, a, b] = rgbToLab(rOut, gOut, bOut);
          a *= 1.35;
          b *= 1.35;
          const [r2, g2, b2] = labToRgb(L, a, b);
          rOut = r2; gOut = g2; bOut = b2;
        }

        d[i * 4] = rOut;
        d[i * 4 + 1] = gOut;
        d[i * 4 + 2] = bOut;
      }

      // Final clarity: 2-pass micro unsharp mask on character edges
      unsharpMaskBuffer(d, W, H, Math.max(1, Math.round(Math.min(W, H) * 0.002)), 0.95);
      unsharpMaskBuffer(d, W, H, 1, 0.45);
      break;
    }

    case 'id_card': {
      // 🪪 ID Card & Passport Mode: Glare suppression, crisp security lines & high contrast
      const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2];
      }
      const blurR = Math.max(4, Math.round(Math.min(W, H) * 0.04));
      const bgR = boxBlur(R, W, H, blurR);
      const bgG = boxBlur(G, W, H, blurR);
      const bgB = boxBlur(B, W, H, blurR);

      for (let i = 0; i < n; i++) {
        let r = bgR[i] > 3 ? clamp((R[i] / bgR[i]) * 235) : R[i];
        let g = bgG[i] > 3 ? clamp((G[i] / bgG[i]) * 235) : G[i];
        let b = bgB[i] > 3 ? clamp((B[i] / bgB[i]) * 235) : B[i];

        // S-curve for punchy card details
        let [L, a, bb] = rgbToLab(r, g, b);
        L = L < 45 ? L * 0.88 : 45 + (L - 45) * 1.15;
        a *= 1.25; bb *= 1.25;
        const [r2, g2, b2] = labToRgb(L, a, bb);
        d[i * 4] = r2; d[i * 4 + 1] = g2; d[i * 4 + 2] = b2;
      }
      unsharpMaskBuffer(d, W, H, 1.2, 1.1);
      break;
    }

    case 'warm_book': {
      // 📖 Book & Reading Mode: Soft paper warmth, eye-friendly, no harsh glare
      const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        R[i] = d[i * 4]; G[i] = d[i * 4 + 1]; B[i] = d[i * 4 + 2];
      }
      const blurR = Math.max(6, Math.round(Math.min(W, H) * 0.09));
      const bgR = boxBlur(R, W, H, blurR);
      const bgG = boxBlur(G, W, H, blurR);
      const bgB = boxBlur(B, W, H, blurR);

      for (let i = 0; i < n; i++) {
        let r = bgR[i] > 3 ? clamp((R[i] / bgR[i]) * 242) : R[i];
        let g = bgG[i] > 3 ? clamp((G[i] / bgG[i]) * 238) : G[i];
        let b = bgB[i] > 3 ? clamp((B[i] / bgB[i]) * 224) : B[i]; // warm book hue

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 140) {
          // Darken book text
          r = clamp(r * 0.82);
          g = clamp(g * 0.82);
          b = clamp(b * 0.82);
        }
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
      }
      unsharpMaskBuffer(d, W, H, 1, 0.85);
      break;
    }

    case 'bw': {
      // 🖤 ULTRA B&W (Sauvola 2.0 with background division)
      const gray = new Uint8ClampedArray(n);
      for (let i = 0; i < n; i++) {
        gray[i] = clamp(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
      }
      const gF = new Float32Array(n);
      for (let i = 0; i < n; i++) gF[i] = gray[i];
      const blurR = Math.max(2, Math.round(Math.min(W, H) * 0.07));
      const bg = boxBlur(gF, W, H, blurR);
      for (let i = 0; i < n; i++) {
        gF[i] = bg[i] > 2 ? clamp((gF[i] / bg[i]) * 240) : gF[i];
      }
      const gNorm = new Uint8ClampedArray(n);
      for (let i = 0; i < n; i++) gNorm[i] = clamp(gF[i]);

      const binaryPixels = sauvola(gNorm, W, H, 0, 0.32, 128);
      for (let i = 0; i < n; i++) {
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = binaryPixels[i];
      }
      break;
    }

    case 'grayscale': {
      // 🌫️ Perceptual Grayscale with CLAHE-Sigmoid
      const Lch = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const [L] = rgbToLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
        Lch[i] = L;
      }
      const blurR = Math.max(2, Math.round(Math.min(W, H) * 0.05));
      const bg = boxBlur(Lch, W, H, blurR);
      const norm = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        norm[i] = bg[i] > 1 ? Math.min(100, (Lch[i] / bg[i]) * 95) : Lch[i];
      }
      let minL = 100, maxL = 0;
      for (let i = 0; i < n; i++) {
        if (norm[i] < minL) minL = norm[i];
        if (norm[i] > maxL) maxL = norm[i];
      }
      const range = (maxL - minL) || 1;
      const sig = (t: number) => 1 / (1 + Math.exp(-7 * (t - 0.5)));
      for (let i = 0; i < n; i++) {
        const t = (norm[i] - minL) / range;
        const v = clamp(sig(t) * 255);
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      }
      break;
    }

    case 'vivid': {
      const getPercentiles = (arrOffset: number) => {
        const hist = new Uint32Array(256);
        for (let i = 0; i < n; i++) hist[d[i * 4 + arrOffset]]++;
        let lo = 0, hi = 255, s = 0;
        const skip = n * 0.007;
        while (s < skip && lo < 255) s += hist[lo++];
        s = 0;
        while (s < skip && hi > 0) s += hist[hi--];
        return { lo, hi: Math.max(lo + 1, hi) };
      };
      const pr = getPercentiles(0);
      const pg = getPercentiles(1);
      const pb = getPercentiles(2);

      for (let i = 0; i < n; i++) {
        const r = clamp(((d[i * 4] - pr.lo) / (pr.hi - pr.lo)) * 255);
        const g = clamp(((d[i * 4 + 1] - pg.lo) / (pg.hi - pg.lo)) * 255);
        const b = clamp(((d[i * 4 + 2] - pb.lo) / (pb.hi - pb.lo)) * 255);
        let [L, a, bb] = rgbToLab(r, g, b);
        a *= 1.4;
        bb *= 1.4;
        L = L < 50 ? L * 0.94 : 50 + (L - 50) * 1.1;
        const [r2, g2, b2] = labToRgb(L, a, bb);
        d[i * 4] = r2;
        d[i * 4 + 1] = g2;
        d[i * 4 + 2] = b2;
      }
      unsharpMaskBuffer(d, W, H, Math.max(1, Math.round(Math.min(W, H) * 0.005)), 0.35);
      unsharpMaskBuffer(d, W, H, 1, 0.6);
      break;
    }

    case 'sharpen': {
      unsharpMaskBuffer(d, W, H, 1, 1.2);
      unsharpMaskBuffer(d, W, H, 3, 0.8);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = clamp((d[i] - 8) * 1.08 + 8);
        d[i + 1] = clamp((d[i + 1] - 8) * 1.08 + 8);
        d[i + 2] = clamp((d[i + 2] - 8) * 1.08 + 8);
      }
      break;
    }

    case 'whiteboard': {
      const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        R[i] = d[i * 4];
        G[i] = d[i * 4 + 1];
        B[i] = d[i * 4 + 2];
      }
      const blurR = Math.max(3, Math.round(Math.min(W, H) * 0.12));
      const bgR = boxBlur(R, W, H, blurR);
      const bgG = boxBlur(G, W, H, blurR);
      const bgB = boxBlur(B, W, H, blurR);

      for (let i = 0; i < n; i++) {
        const rNorm = bgR[i] > 3 ? clamp((R[i] / bgR[i]) * 255) : R[i];
        const gNorm = bgG[i] > 3 ? clamp((G[i] / bgG[i]) * 255) : G[i];
        const bNorm = bgB[i] > 3 ? clamp((B[i] / bgB[i]) * 255) : B[i];
        const push = (v: number) =>
          v > 210 ? clamp(v + (255 - v) * 0.85) : v < 70 ? clamp(v * 0.55) : v;
        d[i * 4] = push(rNorm);
        d[i * 4 + 1] = push(gNorm);
        d[i * 4 + 2] = push(bNorm);
      }
      unsharpMaskBuffer(d, W, H, 1, 1.1);
      break;
    }
  }

  // Apply fine-tuning adjustments if provided
  if (adjustments) {
    applyAdjustments(d, W, H, adjustments);
  }

  return buffer;
}

// ── Worker Message Handler ───────────────────────────────────────────────────
self.onmessage = (e: MessageEvent<WorkerFilterRequest>) => {
  const { id, width, height, buffer, filterId, adjustments } = e.data;
  try {
    const processedBuffer = processImageBuffer(buffer, width, height, filterId, adjustments);
    const response: WorkerFilterResponse = {
      id,
      success: true,
      width,
      height,
      buffer: processedBuffer,
    };
    (self as unknown as Worker).postMessage(response, [processedBuffer]);
  } catch (err: any) {
    const response: WorkerFilterResponse = {
      id,
      success: false,
      width,
      height,
      buffer,
      error: err?.message || 'Processing failed',
    };
    (self as unknown as Worker).postMessage(response, [buffer]);
  }
};
