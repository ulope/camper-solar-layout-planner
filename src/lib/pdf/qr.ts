/**
 * The QR code that puts the plan back into the app.
 *
 * Drawn as vector rectangles rather than an embedded bitmap: a QR is a grid of squares,
 * so vectors are both smaller in the file and exact at any zoom or print resolution —
 * a rasterized code resampled by a printer is the classic reason one will not scan.
 *
 * Error correction is chosen by fit rather than fixed. A code's module count grows with
 * both the payload and the redundancy, and modules are the scarce resource: at a printed
 * 45 mm, 97 modules is 0.46 mm each, about as fine as a phone camera reads reliably off
 * paper. So the most redundant level that stays under that cap wins, and a payload that
 * cannot make even the lowest level is refused rather than drawn too dense to scan.
 */

import QRCode from 'qrcode';
import type { jsPDF } from 'jspdf';

/** Levels from most redundant to least; the first that fits is used. */
const LEVELS = ['Q', 'M', 'L'] as const;

/** The light border the QR spec requires around a symbol, in modules. */
const QUIET_ZONE = 4;

/**
 * Widest symbol worth printing at the size the report gives it. Version 20 at the
 * report's 45 mm square leaves each module 0.46 mm.
 */
export const MAX_MODULES = 97;

export type PlanQr = {
  /** Modules per side, without the quiet zone. */
  size: number;
  dark: (row: number, col: number) => boolean;
  version: number;
  errorCorrection: string;
};

/**
 * Build the densest-redundancy QR for `text` that stays within `maxModules`, or null when
 * the text is too long for any of them — the caller then says so rather than printing an
 * unscannable code.
 */
export function planQr(text: string, maxModules = MAX_MODULES): PlanQr | null {
  for (const errorCorrection of LEVELS) {
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: errorCorrection });
      const size = qr.modules.size;
      if (size > maxModules) continue;
      const data = qr.modules.data;
      return {
        size,
        dark: (row, col) => data[row * size + col] === 1,
        version: qr.version,
        errorCorrection,
      };
    } catch {
      // Too long even for this level; the next one is more compact, so keep going.
    }
  }
  return null;
}

/**
 * Draw `qr` into the square of `side` points at (`x`, `y`), quiet zone included. Runs of
 * adjacent dark modules become one rectangle each, which cuts a version-20 symbol from
 * some 4,000 operators to a few hundred.
 */
export function drawQr(doc: jsPDF, qr: PlanQr, x: number, y: number, side: number): void {
  const scale = side / (qr.size + QUIET_ZONE * 2);
  const originX = x + QUIET_ZONE * scale;
  const originY = y + QUIET_ZONE * scale;

  // The quiet zone has to be light even where the page behind it is not.
  doc.setFillColor('#ffffff');
  doc.rect(x, y, side, side, 'F');

  doc.setFillColor('#000000');
  for (let row = 0; row < qr.size; row++) {
    let runStart = -1;
    for (let col = 0; col <= qr.size; col++) {
      const dark = col < qr.size && qr.dark(row, col);
      if (dark && runStart < 0) runStart = col;
      if (!dark && runStart >= 0) {
        doc.rect(
          originX + runStart * scale,
          originY + row * scale,
          (col - runStart) * scale,
          scale,
          'F',
        );
        runStart = -1;
      }
    }
  }
}
