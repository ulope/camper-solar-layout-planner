/**
 * Canvas view transform: world centimeters → canvas pixels.
 *
 * The baseline is a fit-to-window transform (`fitView`) recomputed from the canvas size
 * and the world extent. The user's zoom is a *multiplier* on that baseline rather than an
 * absolute scale, so resizing the window or adding a surface still refits the stack while
 * keeping whatever zoom factor the user chose.
 */

/** Bounding box of the world content, in centimeters — the shape `columnExtent` returns. */
export type Extent = { w: number; h: number };

/** The user's view state: a zoom multiplier on the fit, plus a pan offset in pixels. */
export type Viewport = { zoom: number; panX: number; panY: number };

/** A concrete transform: `px = off + cm * scale`. */
export type View = { scale: number; offX: number; offY: number };

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 20;

/** The untouched view: fit to the window, no pan. */
export const RESET_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

/**
 * How much of the content must stay inside the content area when panning: half the
 * viewport, or the whole content when it is smaller than that. Any corner can still be
 * brought to the middle of the view; it just cannot be flung off screen.
 */
const keepVisible = (contentSize: number, areaSize: number) =>
  Math.min(contentSize, areaSize / 2);

const clampNum = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export const clampZoom = (z: number): number => clampNum(z, MIN_ZOOM, MAX_ZOOM);

/** The pixel rect left for content once the ruler gutters and padding are taken out. */
function contentArea(cw: number, ch: number, ruler: number, pad: number) {
  const x = ruler + pad;
  const y = ruler + pad;
  return { x, y, w: cw - ruler - pad * 2, h: ch - ruler - pad * 2 };
}

/** Fit the whole extent into the content area, centered. The view at zoom 1, no pan. */
export function fitView(
  cw: number,
  ch: number,
  extent: Extent,
  ruler: number,
  pad: number,
): View {
  const area = contentArea(cw, ch, ruler, pad);
  // A degenerate extent or a canvas smaller than its gutters has no meaningful fit; fall
  // back to 1:1 so the transform stays invertible and hit-testing never divides by zero.
  const raw = Math.min(area.w / extent.w, area.h / extent.h);
  const scale = Number.isFinite(raw) && raw > 0 ? raw : 1;
  return {
    scale,
    offX: area.x + Math.max(0, (area.w - extent.w * scale) / 2),
    offY: area.y + Math.max(0, (area.h - extent.h * scale) / 2),
  };
}

/**
 * The fit baseline with the user's zoom and pan applied. Zoom scales about the center of
 * the content area, so zooming with the buttons keeps what's in the middle in the middle.
 */
export function applyViewport(
  fit: View,
  vp: Viewport,
  cw: number,
  ch: number,
  ruler: number,
  pad: number,
): View {
  const area = contentArea(cw, ch, ruler, pad);
  const ccx = area.x + area.w / 2;
  const ccy = area.y + area.h / 2;
  return {
    scale: fit.scale * vp.zoom,
    offX: ccx + (fit.offX - ccx) * vp.zoom + vp.panX,
    offY: ccy + (fit.offY - ccy) * vp.zoom + vp.panY,
  };
}

/**
 * Scale by `factor` while holding the world point currently under canvas pixel `at` in
 * place — the anchor for wheel zoom. Returns the viewport, clamped to the zoom bounds;
 * at a bound the result is the unchanged viewport, so nothing drifts.
 */
export function zoomAt(
  vp: Viewport,
  fit: View,
  factor: number,
  at: { x: number; y: number },
  cw: number,
  ch: number,
  ruler: number,
  pad: number,
): Viewport {
  const zoom = clampZoom(vp.zoom * factor);
  if (zoom === vp.zoom) return vp;

  const before = applyViewport(fit, vp, cw, ch, ruler, pad);
  const world = { x: (at.x - before.offX) / before.scale, y: (at.y - before.offY) / before.scale };

  // Where that world point would land with the new zoom and no pan; the pan is whatever
  // it takes to bring it back under the cursor.
  const unpanned = applyViewport(fit, { zoom, panX: 0, panY: 0 }, cw, ch, ruler, pad);
  return {
    zoom,
    panX: at.x - (unpanned.offX + world.x * unpanned.scale),
    panY: at.y - (unpanned.offY + world.y * unpanned.scale),
  };
}

/**
 * Correct the pan so the content can never be dragged out of sight: `keepVisible` px of
 * it stays inside the content area on each axis.
 */
export function clampPan(
  vp: Viewport,
  fit: View,
  extent: Extent,
  cw: number,
  ch: number,
  ruler: number,
  pad: number,
): Viewport {
  const area = contentArea(cw, ch, ruler, pad);
  const v = applyViewport(fit, vp, cw, ch, ruler, pad);
  const unpanned = applyViewport(fit, { ...vp, panX: 0, panY: 0 }, cw, ch, ruler, pad);

  const axis = (
    off: number,
    unpannedOff: number,
    sizeCm: number,
    areaStart: number,
    areaSize: number,
  ) => {
    const size = sizeCm * v.scale;
    const keep = keepVisible(size, areaSize);
    // Allowed range for the content's leading edge, then back out to a pan offset.
    const lo = areaStart - size + keep;
    const hi = areaStart + areaSize - keep;
    return clampNum(off, Math.min(lo, hi), Math.max(lo, hi)) - unpannedOff;
  };

  return {
    zoom: vp.zoom,
    panX: axis(v.offX, unpanned.offX, extent.w, area.x, area.w),
    panY: axis(v.offY, unpanned.offY, extent.h, area.y, area.h),
  };
}
