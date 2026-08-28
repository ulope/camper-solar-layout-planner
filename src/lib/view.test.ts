import { describe, it, expect } from 'vitest';
import {
  fitView,
  applyViewport,
  zoomAt,
  clampPan,
  clampZoom,
  MIN_ZOOM,
  MAX_ZOOM,
  RESET_VIEWPORT,
  type Viewport,
} from './view';

const CW = 800;
const CH = 600;
const RULER = 30;
const PAD = 18;
const extent = { w: 400, h: 300 };

const fit = fitView(CW, CH, extent, RULER, PAD);
const at = (vp: Viewport) => applyViewport(fit, vp, CW, CH, RULER, PAD);
const toPx = (vp: Viewport, cm: { x: number; y: number }) => {
  const v = at(vp);
  return { x: v.offX + cm.x * v.scale, y: v.offY + cm.y * v.scale };
};
const toCm = (vp: Viewport, px: { x: number; y: number }) => {
  const v = at(vp);
  return { x: (px.x - v.offX) / v.scale, y: (px.y - v.offY) / v.scale };
};

describe('fitView', () => {
  it('scales so the extent fits inside the content area', () => {
    // Content area is 800-30-36 = 734 by 600-30-36 = 534; height is the binding axis.
    expect(fit.scale).toBeCloseTo(534 / 300, 10);
  });

  it('centers the extent on the slack axis and butts against the padding on the other', () => {
    expect(fit.offY).toBeCloseTo(RULER + PAD, 10);
    expect(fit.offX).toBeCloseTo(RULER + PAD + (734 - 400 * fit.scale) / 2, 10);
  });

  it('falls back to 1:1 for a degenerate extent', () => {
    expect(fitView(CW, CH, { w: 0, h: 0 }, RULER, PAD).scale).toBe(1);
  });
});

describe('applyViewport', () => {
  it('is exactly the fit at the reset viewport', () => {
    expect(at(RESET_VIEWPORT)).toEqual(fit);
  });

  it('holds the content-area center fixed while zooming', () => {
    const center = { x: RULER + PAD + 734 / 2, y: RULER + PAD + 534 / 2 };
    const before = toCm(RESET_VIEWPORT, center);
    const after = toCm({ zoom: 3, panX: 0, panY: 0 }, center);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it('offsets by the pan, in pixels', () => {
    const v = at({ zoom: 1, panX: 25, panY: -40 });
    expect(v.offX).toBeCloseTo(fit.offX + 25, 10);
    expect(v.offY).toBeCloseTo(fit.offY - 40, 10);
    expect(v.scale).toBe(fit.scale);
  });
});

describe('clampZoom', () => {
  it('bounds the zoom factor', () => {
    expect(clampZoom(0.001)).toBe(MIN_ZOOM);
    expect(clampZoom(1000)).toBe(MAX_ZOOM);
    expect(clampZoom(2.5)).toBe(2.5);
  });
});

describe('zoomAt', () => {
  const cursor = { x: 500, y: 420 };
  const zoom = (vp: Viewport, factor: number) =>
    zoomAt(vp, fit, factor, cursor, CW, CH, RULER, PAD);

  it('keeps the world point under the cursor in place', () => {
    const before = toCm(RESET_VIEWPORT, cursor);
    const after = toCm(zoom(RESET_VIEWPORT, 2.5), cursor);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });

  it('round-trips back to the starting transform', () => {
    const there = zoom(RESET_VIEWPORT, 4);
    const back = zoom(there, 1 / 4);
    expect(back.zoom).toBeCloseTo(1, 10);
    const v = at(back);
    expect(v.scale).toBeCloseTo(fit.scale, 8);
    expect(v.offX).toBeCloseTo(fit.offX, 8);
    expect(v.offY).toBeCloseTo(fit.offY, 8);
  });

  it('anchors on a different cursor point too', () => {
    const other = { x: 120, y: 90 };
    const vp = zoomAt(RESET_VIEWPORT, fit, 3, other, CW, CH, RULER, PAD);
    const px = toPx(vp, toCm(RESET_VIEWPORT, other));
    expect(px.x).toBeCloseTo(other.x, 8);
    expect(px.y).toBeCloseTo(other.y, 8);
  });

  it('clamps at the bounds and leaves the viewport untouched there', () => {
    const maxed = zoom(RESET_VIEWPORT, 1000);
    expect(maxed.zoom).toBe(MAX_ZOOM);
    expect(zoom(maxed, 2)).toBe(maxed);

    const mined = zoom(RESET_VIEWPORT, 0.0001);
    expect(mined.zoom).toBe(MIN_ZOOM);
    expect(zoom(mined, 0.5)).toBe(mined);
  });
});

describe('clampPan', () => {
  const clamp = (vp: Viewport) => clampPan(vp, fit, extent, CW, CH, RULER, PAD);
  const coversHalfTheViewport = (vp: Viewport) => {
    const v = at(vp);
    const x1 = v.offX;
    const x2 = v.offX + extent.w * v.scale;
    const y1 = v.offY;
    const y2 = v.offY + extent.h * v.scale;
    const ax1 = RULER + PAD;
    const ay1 = RULER + PAD;
    const aw = CW - RULER - PAD * 2;
    const ah = CH - RULER - PAD * 2;
    const overlapX = Math.min(x2, ax1 + aw) - Math.max(x1, ax1);
    const overlapY = Math.min(y2, ay1 + ah) - Math.max(y1, ay1);
    // Content is far larger than the viewport at zoom 4, so half of each axis is required.
    return overlapX >= aw / 2 - 0.001 && overlapY >= ah / 2 - 0.001;
  };

  it('leaves a fitted view alone', () => {
    expect(clamp(RESET_VIEWPORT)).toEqual(RESET_VIEWPORT);
  });

  it('keeps at least half the viewport covered after an extreme pan in every direction', () => {
    for (const [panX, panY] of [
      [1e5, 0],
      [-1e5, 0],
      [0, 1e5],
      [0, -1e5],
      [-1e5, -1e5],
    ]) {
      const clamped = clamp({ zoom: 4, panX, panY });
      expect(clamped.zoom).toBe(4);
      expect(coversHalfTheViewport(clamped)).toBe(true);
    }
  });

  it('does not disturb a modest pan that is already in bounds', () => {
    const vp = { zoom: 2, panX: 30, panY: -20 };
    const clamped = clamp(vp);
    expect(clamped.panX).toBeCloseTo(vp.panX, 8);
    expect(clamped.panY).toBeCloseTo(vp.panY, 8);
  });
});
