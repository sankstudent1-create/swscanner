/**
 * ID Card & License Front/Back Composite Service
 * Automatically merges front and back captures onto a single A4 document
 * formatted to standard banking and legal identification specifications.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export const IdCardService = {
  /**
   * Generates a single A4 document containing both Front and Back of an ID card.
   */
  async createIdCardComposite(
    frontImageSrc: string,
    backImageSrc: string,
    cardTitle: string = 'IDENTITY CARD / DRIVER LICENSE'
  ): Promise<string> {
    const [frontImg, backImg] = await Promise.all([
      loadImage(frontImageSrc),
      loadImage(backImageSrc),
    ]);

    // Standard A4 dimensions at 150 DPI: 1240 x 1754 px
    const a4W = 1240;
    const a4H = 1754;

    const canvas = document.createElement('canvas');
    canvas.width = a4W;
    canvas.height = a4H;
    const ctx = canvas.getContext('2d')!;

    // Background: Clean crisp white A4 sheet
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, a4W, a4H);

    // Subtle A4 document border
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, a4W - 60, a4H - 60);

    // Header Title
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(cardTitle, a4W / 2, 90);

    // Subtitle
    ctx.fillStyle = '#6b7280';
    ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('OFFICIAL IDENTIFICATION COPY · SCANNED WITH CAMSCANNER AI', a4W / 2, 125);

    // Divider
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, 150);
    ctx.lineTo(a4W - 80, 150);
    ctx.stroke();

    // Standard ID-1 card proportions (85.6mm x 53.98mm = 1.586 : 1)
    const cardW = 850;
    const cardH = Math.round(cardW / 1.586); // ~536px
    const cardX = (a4W - cardW) / 2;

    // ── FRONT CARD ──────────────────────────────────────────────────────────
    const frontY = 220;

    // Card label
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('▲ FRONT SIDE', cardX, frontY - 15);

    // Draw Front Card with rounded shadow container
    ctx.save();
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cardX, frontY, cardW, cardH);
    ctx.drawImage(frontImg, cardX, frontY, cardW, cardH);
    ctx.restore();

    // Center Cut / Fold Guide
    const foldY = frontY + cardH + 100;
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(80, foldY);
    ctx.lineTo(a4W - 80, foldY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✂ CUT OR FOLD HERE', a4W / 2, foldY - 8);

    // ── BACK CARD ───────────────────────────────────────────────────────────
    const backY = foldY + 60;

    // Card label
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('▼ BACK SIDE', cardX, backY - 15);

    // Draw Back Card
    ctx.save();
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cardX, backY, cardW, cardH);
    ctx.drawImage(backImg, cardX, backY, cardW, cardH);
    ctx.restore();

    // Footer Watermark & Timestamp
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    ctx.fillStyle = '#9ca3af';
    ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Verified Digital Copy · Generated ${dateStr}`, a4W / 2, a4H - 60);

    return canvas.toDataURL('image/jpeg', 0.95);
  },
};
